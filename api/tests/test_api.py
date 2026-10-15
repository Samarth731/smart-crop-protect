import json
from pathlib import Path

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.features import feature_row
from app.main import app, leaf_model, yield_model

ROOT = Path(__file__).resolve().parents[2]
GOLDEN = json.loads((ROOT / "web/src/lib/ml/__fixtures__/yield_golden.json").read_text())
client = TestClient(app)


def test_health():
    assert client.get("/health").json()["status"] == "ok"


@pytest.mark.parametrize("case", GOLDEN["cases"], ids=lambda c: f"{c['crop']}-{c['district']}-{c['year']}")
def test_features_match_training_pipeline(case):
    _, meta = yield_model()
    row = feature_row(
        meta, case["crop"], case["season"], case["state"], case["base"], case["normals"], case["obs"], case["observed"]
    )
    np.testing.assert_allclose(row, case["expected"], atol=1e-9)


def test_onnx_prediction_matches_fixture():
    session, meta = yield_model()
    for case in GOLDEN["cases"][:10]:
        row = feature_row(
            meta,
            case["crop"],
            case["season"],
            case["state"],
            case["base"],
            case["normals"],
            case["obs"],
            case["observed"],
        )
        pred = session.run(None, {"input": row[None, :].astype(np.float32)})[0][0, 0]
        assert abs(pred - case["predictionOnnx"]) < 1e-4


def test_yield_forecast_endpoint():
    r = client.post("/v1/yield/forecast", json={"district_code": 500, "crop": "cotton", "season": "kharif"})
    assert r.status_code == 200
    body = r.json()
    assert body["district"] == "Yavatmal"
    assert body["p10_kg_ha"] < body["p50_kg_ha"] < body["p90_kg_ha"]
    assert body["observed_months"] == 0 and body["total_months"] == 7


def test_unknown_inputs_are_404():
    assert client.post("/v1/yield/forecast", json={"district_code": 999999, "crop": "rice"}).status_code == 404
    assert client.get("/v1/prices/unobtainium").status_code == 404


def test_price_outlook():
    r = client.get("/v1/prices/onion", params={"zone": "west"})
    assert r.status_code == 200
    fc = r.json()["forecast"]
    assert all(f["p10"] <= f["p50"] <= f["p90"] for f in fc)


SAMPLES = sorted((ROOT / "web/public/samples").glob("*.jpg"))
needs_leaf = pytest.mark.skipif(leaf_model() is None, reason="leaf model not exported")


@needs_leaf
@pytest.mark.parametrize("sample", SAMPLES, ids=lambda p: p.stem)
def test_leaf_classifier_names_the_sample_crop(sample):
    """Sample photos come from held-out test splits; the top answer must be a class of that crop."""
    r = client.post("/v1/leaf/classify", files={"image": (sample.name, sample.read_bytes(), "image/jpeg")})
    assert r.status_code == 200
    body = r.json()
    assert body["predictions"][0]["crop"] == sample.stem
    assert not body["unsure"]


@needs_leaf
def test_leaf_classifier_rejects_a_blank_image():
    import io

    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (320, 240), (128, 128, 128)).save(buf, format="JPEG")
    body = client.post("/v1/leaf/classify", files={"image": ("grey.jpg", buf.getvalue(), "image/jpeg")}).json()
    assert body["unsure"]
