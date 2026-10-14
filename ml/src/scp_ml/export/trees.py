"""Export a fitted HistGradientBoostingRegressor as compact JSON for a dependency-free evaluator.

The browser evaluates trees directly instead of downloading a 14 MB ONNX Runtime WebAssembly
build - important on rural 2G/3G connections. Layout per tree (parallel arrays, root = 0):

    f: feature index (-1 for leaves)     t: threshold (x <= t goes left)
    l, r: child indices                  m: 1 if missing values go left
    v: leaf value

prediction = baseline + sum(leaf values)   (identity link: squared-error loss)
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor


def tree_payload(model: HistGradientBoostingRegressor) -> dict:
    if getattr(model, "is_categorical_", None) is not None and np.any(model.is_categorical_):
        raise ValueError("categorical splits are not supported by the JSON evaluator")
    trees = []
    for (predictor,) in model._predictors:
        n = predictor.nodes
        leaf = n["is_leaf"].astype(bool)
        trees.append(
            {
                "f": np.where(leaf, -1, n["feature_idx"]).astype(int).tolist(),
                "t": [float(x) for x in n["num_threshold"]],
                "l": n["left"].astype(int).tolist(),
                "r": n["right"].astype(int).tolist(),
                "m": n["missing_go_to_left"].astype(int).tolist(),
                "v": [round(float(x), 8) if lf else 0 for x, lf in zip(n["value"], leaf, strict=True)],
            }
        )
    return {"baseline": float(np.ravel(model._baseline_prediction)[0]), "trees": trees}


def predict_payload(payload: dict, X: np.ndarray) -> np.ndarray:
    """Reference implementation of the JS evaluator, used to verify the export."""
    out = np.full(len(X), payload["baseline"], dtype=np.float64)
    for tr in payload["trees"]:
        f, t, lft, rgt, m, v = tr["f"], tr["t"], tr["l"], tr["r"], tr["m"], tr["v"]
        for i, x in enumerate(X):
            node = 0
            while f[node] >= 0:
                xv = x[f[node]]
                if np.isnan(xv):
                    node = lft[node] if m[node] else rgt[node]
                else:
                    node = lft[node] if xv <= t[node] else rgt[node]
            out[i] += v[node]
    return out


def save_trees(model: HistGradientBoostingRegressor, X_check: np.ndarray, path: Path) -> Path:
    payload = tree_payload(model)
    sample = X_check[: min(len(X_check), 400)].astype(np.float64)
    np.testing.assert_allclose(predict_payload(payload, sample), model.predict(sample), atol=1e-5)
    path.write_text(json.dumps(payload, separators=(",", ":")))
    return path
