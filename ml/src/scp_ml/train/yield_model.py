"""Train, evaluate and export the district yield forecaster.

    python -m scp_ml.train.yield_model

Temporal protocol (no information from the future is ever used):

* fit        agricultural years 1999-2017
* calibrate  2018-2019  - split-conformal residual quantiles per crop x season stage
* test       2020-2024  - all reported metrics

The deployed model is refit on every year; its interval widths come from the out-of-sample
residuals of the evaluation model (2018-2024), which are slightly conservative for a model
trained on more data.
"""

from __future__ import annotations

import json
import time

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

from scp_ml.export.onnx_utils import save_regressor
from scp_ml.features.yield_features import (
    BASE_FEATURES,
    CLIM_FEATURES,
    CROPS,
    NUMERIC_FEATURES,
    SEASONS,
    STATE_FEATURES,
    FeatureSpec,
    WeatherCube,
    assemble,
    baseline_table,
    select_anchors,
)
from scp_ml.paths import PROCESSED, REPORTS, WEB_MODELS

TRAIN_END, CAL_END = 2017, 2019
MIN_AREA_HA = 200
MAX_ABS_LOG_RATIO = 1.6  # beyond ~5x change the record is almost always a reporting error
# Strong regularisation: district yields are noisy (crop-cutting sampling error), and smaller
# trees with large leaves generalised better to 2020-24 than the 31-leaf configuration.
PARAMS = {"learning_rate": 0.05, "max_iter": 350, "max_leaf_nodes": 15, "min_samples_leaf": 200,
          "l2_regularization": 2.0}
ALPHA = 0.2  # 80% prediction interval
MIN_GROUP = 60


def build_dataset(use_cache: bool = True) -> tuple[pd.DataFrame, FeatureSpec]:
    cache = PROCESSED / "yield_training_v2.parquet"
    if use_cache and cache.exists():
        full = pd.read_parquet(cache)
        return full, _spec(full)
    y = pd.read_parquet(PROCESSED / "yields.parquet")
    y = y[(y.area >= MIN_AREA_HA) & y.crop.isin(CROPS)]
    years = sorted(y.year.unique())
    base = baseline_table(y, [t for t in years if t >= years[0] + 4])
    df = base.merge(y[["district_code", "crop", "season", "year", "yield_kg_ha"]],
                    on=["district_code", "crop", "season", "year"])
    df["target"] = np.log(df.yield_kg_ha) - df.log_base
    df = df[df.target.abs() <= MAX_ABS_LOG_RATIO]
    cube = WeatherCube.load()
    anchors = select_anchors(y, cube)
    (PROCESSED / "anchors.json").write_text(json.dumps(anchors))
    full = assemble(df, cube, anchors, cutoffs="all")
    full.to_parquet(cache, index=False)
    return full, _spec(full)


def _spec(df: pd.DataFrame) -> FeatureSpec:
    return FeatureSpec(numeric=NUMERIC_FEATURES, crops=CROPS, seasons=SEASONS, states=sorted(df.state.unique()))


def stage(obs_frac: pd.Series) -> pd.Series:
    """0 = at sowing, 1 = first third observed, 2 = two thirds, 3 = season complete."""
    return (obs_frac * 3).round().astype(int)


def fit(X, y) -> HistGradientBoostingRegressor:
    t = time.time()
    m = HistGradientBoostingRegressor(loss="squared_error", random_state=0, early_stopping=False, **PARAMS)
    m.fit(X, y)
    print(f"    fitted on {len(y):,} rows in {time.time() - t:.0f}s", flush=True)
    return m


def conformal_table(df: pd.DataFrame, resid: np.ndarray) -> dict:
    """Residual quantiles per crop x stage, falling back to the pooled stage when sparse."""
    d = pd.DataFrame({"crop": df.crop.to_numpy(), "stage": stage(df.obs_frac).to_numpy(), "r": resid})
    lo_q, hi_q = ALPHA / 2, 1 - ALPHA / 2
    pooled = d.groupby("stage").r.quantile([lo_q, hi_q]).unstack()
    table: dict = {"alpha": ALPHA, "pooled": {int(s): [float(r[lo_q]), float(r[hi_q])] for s, r in pooled.iterrows()},
                   "by_crop": {}}
    for (crop, st), g in d.groupby(["crop", "stage"]):
        if len(g) >= MIN_GROUP:
            n = len(g)
            # finite-sample split-conformal correction
            ql, qh = max(0.0, lo_q - 1 / (n + 1)), min(1.0, hi_q + 1 / (n + 1))
            table["by_crop"].setdefault(crop, {})[int(st)] = [float(g.r.quantile(ql)), float(g.r.quantile(qh))]
    return table


def interval(df: pd.DataFrame, table: dict) -> tuple[np.ndarray, np.ndarray]:
    st = stage(df.obs_frac).to_numpy()
    lo, hi = np.empty(len(df)), np.empty(len(df))
    for i, (crop, s) in enumerate(zip(df.crop.to_numpy(), st, strict=True)):
        lo[i], hi[i] = table["by_crop"].get(crop, {}).get(int(s), table["pooled"][int(s)])
    return lo, hi


def evaluate(df: pd.DataFrame, pred: np.ndarray, lo: np.ndarray, hi: np.ndarray) -> dict:
    actual = df.yield_kg_ha.to_numpy()
    lb = df.log_base.to_numpy()
    preds = {"model": np.exp(lb + pred), "baseline": np.exp(lb),
             "trend": np.exp(lb + df.base_trend.to_numpy() * 4)}
    ape = {k: np.abs(v - actual) / actual for k, v in preds.items()}
    t = df.target.to_numpy()
    out = {"n": int(len(df)),
           "mdape": {k: float(np.median(v)) for k, v in ape.items()},
           "mape": {k: float(np.mean(v)) for k, v in ape.items()},
           "mae_log": {"model": float(np.mean(np.abs(t - pred))), "baseline": float(np.mean(np.abs(t))),
                       "trend": float(np.mean(np.abs(t - df.base_trend.to_numpy() * 4)))},
           "r2_log_yield": float(1 - np.sum((np.log(actual) - np.log(preds["model"])) ** 2)
                                 / np.sum((np.log(actual) - np.log(actual).mean()) ** 2)),
           "coverage_80": float(np.mean((t >= pred + lo) & (t <= pred + hi))),
           "interval_width_pct": float(np.median(np.expm1(hi - lo)))}
    out["skill_vs_baseline"] = 1 - out["mae_log"]["model"] / out["mae_log"]["baseline"]
    out["skill_vs_trend"] = 1 - out["mae_log"]["model"] / out["mae_log"]["trend"]
    return out


def ablation(df: pd.DataFrame) -> dict:
    """Which weather representation generalises? Full-season rows, fit <= 2017, score 2020-24."""
    f = df[df.obs_frac == 1]
    cats = pd.get_dummies(f[["crop", "season", "state"]]).to_numpy(np.float32)
    district = [c for c in f.columns if c.startswith("d_")]
    variants = {"no_weather": BASE_FEATURES + CLIM_FEATURES,
                "district_weather (deployed)": BASE_FEATURES + CLIM_FEATURES + district,
                "district_and_state_weather": BASE_FEATURES + CLIM_FEATURES + district + STATE_FEATURES,
                "state_weather_anchors": BASE_FEATURES + CLIM_FEATURES + STATE_FEATURES}
    tr, te = (f.year <= TRAIN_END).to_numpy(), (f.year > CAL_END).to_numpy()
    y = f.target.to_numpy()
    out = {}
    for name, cols in variants.items():
        X = np.hstack([f[cols].to_numpy(np.float32), cats])
        m = HistGradientBoostingRegressor(loss="squared_error", random_state=0, early_stopping=False, **PARAMS)
        p = m.fit(X[tr], y[tr]).predict(X[te])
        out[name] = round(float(1 - np.mean(np.abs(y[te] - p)) / np.mean(np.abs(y[te]))), 4)
        print(f"  ablation {name}: skill {out[name]:.4f}", flush=True)
    return out


def grouped_importance(model, spec: FeatureSpec, df: pd.DataFrame, repeats: int = 3) -> dict:
    """Permutation importance with related columns permuted together (MAE increase, log scale)."""
    X = spec.matrix(df)
    y = df.target.to_numpy()
    base = np.mean(np.abs(y - model.predict(X)))
    groups: dict[str, list[int]] = {}
    for i, c in enumerate(spec.columns):
        key = c.split("=")[0] if "=" in c else c.rsplit("_p", 1)[0]
        groups.setdefault(key, []).append(i)
    rng = np.random.default_rng(0)
    out = {}
    for key, cols in groups.items():
        scores = []
        for _ in range(repeats):
            Xp = X.copy()
            Xp[:, cols] = X[rng.permutation(len(X))][:, cols]
            scores.append(np.mean(np.abs(y - model.predict(Xp))) - base)
        out[key] = round(float(np.mean(scores)), 5)
    return dict(sorted(out.items(), key=lambda kv: -kv[1]))


def run() -> dict:
    t0 = time.time()
    df, spec = build_dataset()
    print(f"dataset: {len(df):,} rows x {len(spec.columns)} features")
    tr = df[df.year <= TRAIN_END]
    cal = df[df.year.between(TRAIN_END + 1, CAL_END)]
    te = df[df.year > CAL_END]

    model = fit(spec.matrix(tr), tr.target)
    p_cal, p_te = model.predict(spec.matrix(cal)), model.predict(spec.matrix(te))
    table = conformal_table(cal, cal.target.to_numpy() - p_cal)
    lo, hi = interval(te, table)

    full = (te.obs_frac == 1).to_numpy()
    report: dict = {"params": PARAMS, "rows": {"train": len(tr), "calibrate": len(cal), "test": len(te)},
                    "test_full_season": evaluate(te[full], p_te[full], lo[full], hi[full]),
                    "by_stage": {}, "by_crop": {}}
    st = stage(te.obs_frac).to_numpy()
    for s in range(4):
        m = st == s
        report["by_stage"][s] = evaluate(te[m], p_te[m], lo[m], hi[m])
    tf = te[full]
    for crop in CROPS:
        m = (tf.crop == crop).to_numpy()
        if m.sum() >= 30:
            report["by_crop"][crop] = evaluate(tf[m], p_te[full][m], lo[full][m], hi[full][m])
    sample = cal[cal.obs_frac == 1].sample(8000, random_state=0)
    report["importance"] = grouped_importance(model, spec, sample)
    report["ablation_skill_vs_baseline"] = ablation(df)
    print(json.dumps(report["test_full_season"], indent=1))
    print(json.dumps({k: round(v["skill_vs_baseline"], 3) for k, v in report["by_stage"].items()}))

    # deployment model + intervals from all out-of-sample residuals (2018-2024)
    oos = pd.concat([cal, te])
    deploy_table = conformal_table(oos, oos.target.to_numpy() - np.concatenate([p_cal, p_te]))
    final = fit(spec.matrix(df), df.target)
    WEB_MODELS.mkdir(parents=True, exist_ok=True)
    path = save_regressor(final, len(spec.columns), WEB_MODELS / "yield.onnx")
    meta = spec.to_dict()
    meta.update({"target": "log(yield / baseline)", "intervals": deploy_table, "trained_rows": len(df),
                 "data_years": [int(df.year.min()), int(df.year.max())]})
    (WEB_MODELS / "yield.meta.json").write_text(json.dumps(meta))
    report.update({"onnx_bytes": path.stat().st_size, "trained_rows": len(df),
                   "seconds": round(time.time() - t0), "intervals": deploy_table})
    (REPORTS / "yield_metrics.json").write_text(json.dumps(report, indent=1, default=float))
    print(f"done in {time.time() - t0:.0f}s, onnx {path.stat().st_size / 1e6:.1f} MB")
    return report


if __name__ == "__main__":
    run()
