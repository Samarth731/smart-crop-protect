"""Fast tests that need no downloaded data (they run in CI)."""

from pathlib import Path

import numpy as np
import onnx
import pandas as pd
import pytest
from onnx import numpy_helper
from sklearn.ensemble import HistGradientBoostingRegressor

from scp_ml.data.apy import canonical_season
from scp_ml.export.trees import predict_payload, tree_payload
from scp_ml.features.yield_features import (
    WEATHER_KEYS,
    climate_features,
    phase_slices,
    weather_features,
    window_for,
)
from scp_ml.train.price_model import _series_features


def test_phase_slices_cover_every_month():
    for n in (4, 5, 6, 7, 12):
        sl = phase_slices(n)
        assert sl[0].start == 0 and sl[-1].stop == n
        assert all(a.stop == b.start for a, b in zip(sl, sl[1:], strict=False))


def test_crop_specific_windows():
    assert len(window_for("rice", "kharif")) == 5
    assert len(window_for("cotton", "kharif")) == 7
    assert window_for("wheat", "rabi")[0] == (0, 11)
    assert window_for("wheat", "rabi")[-1] == (1, 3)


def test_unobserved_season_has_zero_anomalies():
    rng = np.random.default_rng(0)
    nrm = rng.uniform(1, 100, size=(1, 5, 6))
    obs = nrm * 2
    f = weather_features(obs, nrm, np.array([0]))
    for k in WEATHER_KEYS:
        assert abs(f[k][0]) < 1e-12, k


def test_rain_log_ratio_is_symmetric_and_clipped():
    nrm = np.full((2, 5, 6), 50.0)
    obs = nrm.copy()
    obs[0, :, 0] = 100.0  # double
    obs[1, :, 0] = 25.0  # half
    f = weather_features(obs, nrm, np.array([5, 5]))
    assert np.isclose(f["lrain"][0], -f["lrain"][1])
    obs[0, :, 0] = 10_000.0
    assert np.isclose(weather_features(obs, nrm, np.array([5, 5]))["lrain"][0], np.log(4))


def test_climate_features_shape():
    nrm = np.ones((3, 5, 6))
    f = climate_features(nrm)
    assert set(f) == {"clim_rain_log", "clim_tmax", "clim_gwet"}
    assert f["clim_tmax"].shape == (3,)


def test_season_mapping():
    assert canonical_season("rice", "Winter") == "kharif"  # aman rice
    assert canonical_season("potato", "Winter") == "rabi"
    assert canonical_season("cotton", "Whole Year") == "kharif"
    assert canonical_season("onion", "Whole Year") == "annual"
    assert canonical_season("rice", "Total") is None


def test_tree_export_reproduces_sklearn():
    rng = np.random.default_rng(1)
    X = rng.normal(size=(800, 6))
    X[rng.random(X.shape) < 0.05] = np.nan
    y = np.nan_to_num(X[:, 0]) * 2 + np.sin(np.nan_to_num(X[:, 1]))
    m = HistGradientBoostingRegressor(max_iter=60, max_leaf_nodes=15).fit(X, y)
    np.testing.assert_allclose(predict_payload(tree_payload(m), X[:200]), m.predict(X[:200]), atol=1e-5)


def test_price_seasonal_feature_has_no_lookahead():
    idx = pd.period_range("2015-01", periods=60, freq="M")
    lp = pd.Series(np.log(100 + 10 * np.sin(np.arange(60) / 12 * 2 * np.pi)), index=idx)
    f = _series_features(lp, 3)
    # the seasonal profile at origin t only uses changes realised at least 12 months earlier
    for t in range(24, 60):
        same_month_before = [k for k in range(t - 12, -1, -12)]
        realised = [lp.iloc[k + 3] - lp.iloc[k] for k in same_month_before if k + 3 < len(lp)]
        assert np.isclose(f.seas.iloc[t], np.mean(realised))


LEAF_ONNX = Path(__file__).resolve().parents[2] / "web/public/models/leaf.onnx"


@pytest.mark.skipif(not LEAF_ONNX.exists(), reason="leaf model not exported")
def test_shipped_leaf_model_gives_the_same_answer_on_every_cpu():
    """x86 CPUs without VNNI saturate pairs of uint8 x int8 products at int16 (VPMADDUBSW). With weights
    within +-64 a pair cannot overflow, so the int8 model's output does not depend on the CPU (see
    quantize() in scp_ml/train/leaf_model.py)."""
    graph = onnx.load(LEAF_ONNX).graph
    inits = {i.name: i for i in graph.initializer}
    weights = [
        numpy_helper.to_array(inits[n.input[0]])
        for n in graph.node
        if n.op_type == "DequantizeLinear" and n.input[0] in inits
    ]
    int8 = [w for w in weights if w.dtype == np.int8]
    if not int8:
        pytest.skip("the shipped leaf model is not int8")
    assert max(int(np.abs(w.astype(np.int16)).max()) for w in int8) <= 64
