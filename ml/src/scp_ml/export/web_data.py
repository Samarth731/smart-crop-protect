"""Export the static data the web app needs for on-device yield forecasting.

    python -m scp_ml.export.web_data

Writes to web/public/data/:
    districts.json        every LGD district with its centroid
    yield/<state>.json    per state: monthly climate normals per district, the baseline
                          features for the forecast year, and recent reported yields
and the parity fixtures web/src/lib/ml/__fixtures__/yield_golden.json.
"""

from __future__ import annotations

import json
import re

import joblib
import numpy as np
import onnxruntime as ort
import pandas as pd

from scp_ml.features.yield_features import (
    BASE_FEATURES,
    CROPS,
    NUMERIC_FEATURES,
    WX_VARS,
    FeatureSpec,
    WeatherCube,
    baseline_table,
    window_for,
)
from scp_ml.paths import MODELS, PROCESSED, REPO_ROOT, WEB_DATA, WEB_MODELS
from scp_ml.train.yield_model import MIN_AREA_HA

FORECAST_YEAR = 2026  # agricultural year 2026-27: Kharif 2026, Rabi 2026-27, Zaid 2027
FIXTURES = REPO_ROOT / "web" / "src" / "lib" / "ml" / "__fixtures__"


def slug(state: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", state.lower()).strip("-")


def export_districts() -> pd.DataFrame:
    gz = pd.read_csv(PROCESSED / "districts.csv").dropna(subset=["lat"])
    y = pd.read_parquet(PROCESSED / "yields.parquet")
    state = y.groupby("district_code").state.last()
    gz["state"] = gz.district_code.map(state).fillna(gz.state)
    rows = [
        {
            "c": int(r.district_code),
            "n": r.district,
            "s": r.state,
            "k": slug(r.state),
            "la": round(float(r.lat), 3),
            "lo": round(float(r.lon), 3),
        }
        for r in gz.itertuples()
    ]
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    (WEB_DATA / "districts.json").write_text(json.dumps(rows, separators=(",", ":"), ensure_ascii=False))
    return gz


def export_yield_shards(cube: WeatherCube) -> int:
    y = pd.read_parquet(PROCESSED / "yields.parquet")
    y = y[(y.area >= MIN_AREA_HA) & y.crop.isin(CROPS)]
    base = baseline_table(y, [FORECAST_YEAR])
    out_dir = WEB_DATA / "yield"
    out_dir.mkdir(parents=True, exist_ok=True)
    hist = y[y.year >= FORECAST_YEAR - 14]
    n = 0
    for state, sb in base.groupby("state"):
        districts: dict[str, dict] = {}
        for code, db in sb.groupby("district_code"):
            di = cube.index(np.array([code]))[0]
            if di < 0:
                continue
            series = {}
            for r in db.itertuples():
                h = hist[(hist.district_code == code) & (hist.crop == r.crop) & (hist.season == r.season)]
                series[f"{r.crop}|{r.season}"] = {
                    "b": [round(float(getattr(r, f)), 5) for f in BASE_FEATURES],
                    "h": [
                        [int(a), round(float(b)), round(float(c))]
                        for a, b, c in zip(h.year, h.yield_kg_ha, h.area, strict=True)
                    ],
                }
            districts[str(code)] = {"normals": np.round(cube.normals[di], 3).tolist(), "series": series}
        payload = {"state": state, "forecastYear": FORECAST_YEAR, "vars": WX_VARS, "districts": districts}
        (out_dir / f"{slug(state)}.json").write_text(json.dumps(payload, separators=(",", ":")))
        n += 1
    return n


def export_golden(cube: WeatherCube, n_cases: int = 40) -> None:
    """Feature vectors + model outputs for randomly drawn real rows, at random cut-offs."""
    meta = json.loads((WEB_MODELS / "yield.meta.json").read_text())
    spec = FeatureSpec(meta["numeric"], meta["crops"], meta["seasons"], meta["states"])
    assert spec.numeric == NUMERIC_FEATURES
    df = pd.read_parquet(PROCESSED / "yield_training_v2.parquet")
    rng = np.random.default_rng(7)
    sample = df[df.obs_frac == 1].sample(n_cases, random_state=7).reset_index(drop=True)
    from scp_ml.features.yield_features import climate_features, weather_features

    sess = ort.InferenceSession(str(WEB_MODELS / "yield.onnx"))
    final = joblib.load(MODELS / "yield.joblib")["model"]
    cases = []
    for r in sample.itertuples():
        win = window_for(r.crop, r.season)
        di = cube.index(np.array([r.district_code]))
        obs, nrm = cube.window(di, np.array([r.year]), win)
        k = int(rng.integers(0, len(win) + 1))
        wx = weather_features(obs, nrm, np.array([k]))
        clim = climate_features(nrm)
        row = {f: float(getattr(r, f)) for f in BASE_FEATURES}
        row.update({k_: float(v[0]) for k_, v in clim.items()})
        row.update({f"d_{k_}": float(v[0]) for k_, v in wx.items()})
        row["obs_frac"] = k / len(win)
        frame = pd.DataFrame([{**row, "crop": r.crop, "season": r.season, "state": r.state}])
        X = spec.matrix(frame)
        X64 = _matrix64(spec, frame)
        pred = float(final.predict(X64)[0])  # float64 reference, what the JSON evaluator reproduces
        pred_onnx = float(sess.run(None, {"input": X})[0][0, 0])
        cases.append(
            {
                "crop": r.crop,
                "season": r.season,
                "state": r.state,
                "district": int(r.district_code),
                "year": int(r.year),
                "observed": k,
                "base": [row[f] for f in BASE_FEATURES],
                "normals": np.round(cube.normals[di[0]], 6).tolist(),
                "obs": [[None if np.isnan(v) else float(v) for v in m] for m in obs[0]],
                "expected": X64[0].tolist(),
                "prediction": pred,
                "predictionOnnx": pred_onnx,
            }
        )
    FIXTURES.mkdir(parents=True, exist_ok=True)
    (FIXTURES / "yield_golden.json").write_text(json.dumps({"columns": spec.columns, "cases": cases}))


def _matrix64(spec: FeatureSpec, frame: pd.DataFrame) -> np.ndarray:
    X = np.zeros((len(frame), len(spec.columns)), dtype=np.float64)
    X[:, : len(spec.numeric)] = frame[spec.numeric].to_numpy(dtype=np.float64)
    off = len(spec.numeric)
    for vals, col in ((spec.crops, "crop"), (spec.seasons, "season"), (spec.states, "state")):
        v = frame[col].iloc[0]
        if v in vals:
            X[0, off + vals.index(v)] = 1.0
        off += len(vals)
    return X


def run() -> None:
    cube = WeatherCube.load()
    export_districts()
    n = export_yield_shards(cube)
    export_golden(cube)
    print(f"exported districts, {n} state shards and golden fixtures")


if __name__ == "__main__":
    run()
