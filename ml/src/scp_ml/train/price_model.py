"""Market price forecaster (1-3 months ahead) on WFP / DoCA retail prices for India.

    python -m scp_ml.train.price_model

Data: WFP VAM food prices for India (HDX, CC-BY-IGO), compiled from the Department of
Consumer Affairs Price Monitoring Cell - monthly retail prices from ~170 markets, 1994-2026.

Method
------
* One *global* gradient-boosted model learns from every market x commodity series
  (~2,000 series), forecasting the log price change h = 1, 2, 3 months ahead.
* Features are scale free (log returns, deviation from the 12-month mean, volatility,
  the series' own historical seasonal profile and the national index momentum), so a
  model fitted on market series also applies to the national index.
* The national index is chain-linked: the median month-on-month log change across markets
  reporting in both months. Market coverage fell from ~165 to 5 in 2024, so averaging
  levels would create artificial jumps; chaining removes that composition bias.
* Quantile loss (P10 / P50 / P90) gives an 80% prediction interval.
* Stale carry-forwards are removed: the source repeats the previous month's value when a
  month was not updated (e.g. Jun-Aug 2026 identical in every zone). Exact month-on-month
  repeats are treated as missing, and forecasts start from the last real observation.
* Evaluation is a strict temporal hold-out: fitted on targets before 2019, intervals
  calibrated by conformalized quantile regression on 2019-21 origins, tested on every
  origin from Jan 2022 against naive and seasonal-naive forecasts.
* Forecasts are published per DoCA price zone (North, South, East, West, North-East): the
  all-India index is so smooth that a naive forecast is hard to beat at short horizons.
"""

from __future__ import annotations

import json
import time
from datetime import UTC, datetime

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

from scp_ml.paths import RAW, REPORTS, WEB_DATA

# app crop id -> (WFP commodity, label shown in the app)
COMMODITIES: dict[str, tuple[str, str]] = {
    "rice": ("Rice", "Rice"),
    "wheat": ("Wheat", "Wheat"),
    "potato": ("Potatoes", "Potato"),
    "onion": ("Onions", "Onion"),
    "tomato": ("Tomatoes", "Tomato"),
    "pigeonpea": ("Lentils", "Tur / arhar dal"),
    "lentil": ("Lentils (masur)", "Masoor dal"),
    "moong": ("Lentils (moong)", "Moong dal"),
    "urad": ("Lentils (urad)", "Urad dal"),
    "groundnut": ("Oil (groundnut)", "Groundnut oil"),
    "mustard": ("Oil (mustard)", "Mustard oil"),
    "soybean": ("Oil (soybean)", "Soybean oil"),
    "sugarcane": ("Sugar", "Sugar"),
}
HORIZONS = (1, 2, 3, 4, 5, 6)
QUANTILES = (0.1, 0.5, 0.9)
CAL_START = pd.Period("2019-01", "M")
TEST_START = pd.Period("2022-01", "M")
PARAMS = {
    "learning_rate": 0.05,
    "max_iter": 400,
    "max_leaf_nodes": 31,
    "min_samples_leaf": 100,
    "l2_regularization": 1.0,
}
FEATURES = [
    "r1",
    "r2",
    "r3",
    "r6",
    "r12",
    "dev12",
    "vol12",
    "seas",
    "seas_n",
    "nr1",
    "nr3",
    "nr12",
    "ndev12",
    "h",
    "m_sin",
    "m_cos",
]


def load_panel() -> pd.DataFrame:
    df = pd.read_csv(RAW / "wfp_food_prices_ind.csv", skiprows=[1], low_memory=False, parse_dates=["date"])
    wfp_to_id = {v[0]: k for k, v in COMMODITIES.items()}
    df = df[(df.pricetype == "Retail") & df.commodity.isin(wfp_to_id) & (df.price > 0)]
    df["crop"] = df.commodity.map(wfp_to_id)
    df["month"] = df.date.dt.to_period("M")
    panel = (
        df.groupby(["crop", "market", "admin1", "month"], as_index=False)
        .agg(price=("price", "median"), lat=("latitude", "first"), lon=("longitude", "first"))
        .sort_values(["crop", "market", "month"])
    )
    g = panel.groupby(["crop", "market"])
    repeat = (panel.price == g.price.shift(1)) & (panel.month == g.month.shift(1) + 1)
    return panel[~repeat].reset_index(drop=True)


def national_index(panel: pd.DataFrame) -> pd.DataFrame:
    """Chain-linked national log-price index per crop, anchored to the latest median level."""
    out = []
    for crop, g in panel.groupby("crop"):
        wide = np.log(g.pivot_table(index="month", columns="market", values="price"))
        wide = wide.reindex(pd.period_range(wide.index.min(), wide.index.max(), freq="M"))
        # bridge short gaps so a change spanning missing months is not lost
        step = wide.ffill(limit=6).diff().median(axis=1, skipna=True).fillna(0.0)
        level = step.cumsum()
        n = wide.notna().sum(axis=1)
        last = n[n > 0].index[-1]
        anchor = np.log(np.exp(wide.loc[last].dropna()).median())
        lp = (level - level.loc[last] + anchor).where(n > 0)
        out.append(pd.DataFrame({"crop": crop, "month": wide.index, "lp": lp.to_numpy(), "markets": n.to_numpy()}))
    return pd.concat(out, ignore_index=True).dropna(subset=["lp"])


def _series_features(lp: pd.Series, horizon: int) -> pd.DataFrame:
    """Features at every origin month for one monthly log-price series (index = Period)."""
    f = pd.DataFrame(index=lp.index)
    for k in (1, 2, 3, 6, 12):
        f[f"r{k}"] = lp - lp.shift(k)
    f["dev12"] = lp - lp.rolling(12, min_periods=6).mean()
    f["vol12"] = lp.diff().rolling(12, min_periods=6).std()
    # Seasonal profile: mean change from calendar month m to m+h in *previous* years only.
    chg = lp.shift(-horizon) - lp  # change realised from this origin
    by_month = chg.groupby(lp.index.month)
    past_mean = by_month.transform(lambda s: s.shift(1).expanding().mean())
    past_n = by_month.transform(lambda s: s.shift(1).expanding().count())
    # an origin's own change is only known h months later; shift(1) within month groups is a
    # full year back, which is >= h for h <= 3, so no look-ahead.
    f["seas"], f["seas_n"] = past_mean, past_n
    f["target"] = chg
    target_month = (lp.index + horizon).month
    f["m_sin"], f["m_cos"] = np.sin(2 * np.pi * target_month / 12), np.cos(2 * np.pi * target_month / 12)
    f["h"] = horizon
    return f


def _national_features(nat: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for crop, g in nat.groupby("crop"):
        lp = g.set_index("month").lp
        lp = lp.reindex(pd.period_range(lp.index.min(), lp.index.max(), freq="M"))
        rows.append(
            pd.DataFrame(
                {
                    "crop": crop,
                    "month": lp.index,
                    "nr1": (lp - lp.shift(1)).to_numpy(),
                    "nr3": (lp - lp.shift(3)).to_numpy(),
                    "nr12": (lp - lp.shift(12)).to_numpy(),
                    "ndev12": (lp - lp.rolling(12, min_periods=6).mean()).to_numpy(),
                }
            )
        )
    return pd.concat(rows, ignore_index=True)


def build_rows(panel: pd.DataFrame, nat: pd.DataFrame) -> pd.DataFrame:
    natf = _national_features(nat)
    frames = []
    series = [((c, m), g) for (c, m), g in panel.groupby(["crop", "market"])]
    series += [((c, "India"), g.rename(columns={"lp": "lp_"})) for c, g in nat.groupby("crop")]
    for (crop, market), g in series:
        if market == "India":
            lp = g.set_index("month").lp_
            lp = lp.reindex(pd.period_range(lp.index.min(), lp.index.max(), freq="M"))
        else:
            lp = np.log(g.set_index("month").price)
            lp = lp.reindex(pd.period_range(lp.index.min(), lp.index.max(), freq="M"))
        if lp.notna().sum() < 24:
            continue
        for h in HORIZONS:
            f = _series_features(lp, h)
            f["crop"], f["market"], f["month"] = crop, market, f.index
            frames.append(f.reset_index(drop=True))
    rows = pd.concat(frames, ignore_index=True).merge(natf, on=["crop", "month"], how="left")
    return rows[rows.r1.notna()]


def encode(rows: pd.DataFrame) -> np.ndarray:
    crops = list(COMMODITIES)
    X = rows[FEATURES].to_numpy(dtype=np.float32)
    onehot = np.zeros((len(rows), len(crops)), dtype=np.float32)
    onehot[np.arange(len(rows)), rows.crop.map({c: i for i, c in enumerate(crops)}).to_numpy()] = 1
    return np.hstack([X, onehot])


def fit_quantiles(X, y) -> dict:
    return {
        q: HistGradientBoostingRegressor(loss="quantile", quantile=q, random_state=0, **PARAMS).fit(X, y)
        for q in QUANTILES
    }


def cqr_margins(d: pd.DataFrame, alpha: float = 0.2) -> dict[int, float]:
    """Conformalized quantile regression (Romano et al. 2019): per-horizon widening of [q10, q90]."""
    out = {}
    for h, g in d.groupby("h"):
        e = np.maximum(g.q10 - g.target, g.target - g.q90).to_numpy()
        n = len(e)
        out[int(h)] = float(np.quantile(e, min(1.0, (1 - alpha) * (1 + 1 / n))))
    return out


def shrinkage(d: pd.DataFrame) -> dict[int, float]:
    """Per-horizon weight on the model vs a naive (no change) forecast, chosen on calibration data.

    Zone and all-India series average many markets and are much smoother than a single market,
    so the global model's momentum is partly noise for them; combining with naive fixes that.
    """
    grid = np.linspace(0, 1, 21)
    out = {}
    for h, g in d.groupby("h"):
        err = [np.mean(np.abs(np.expm1(lam * g.q50 - g.target))) for lam in grid]
        out[int(h)] = float(grid[int(np.argmin(err))])
    return out


def apply_shrinkage(d: pd.DataFrame, lam: dict[int, float]) -> pd.DataFrame:
    d = d.copy()
    shift = (1 - d.h.map(lam)) * d.q50
    for c in ("q10", "q50", "q90"):
        d[c] = d[c] - shift
    return d


def _predict(models: dict, d: pd.DataFrame) -> pd.DataFrame:
    d = d.copy()
    X = encode(d)
    for q, m in models.items():
        d[f"q{int(q * 100)}"] = m.predict(X)
    return d


def backtest(rows: pd.DataFrame) -> tuple[dict, dict]:
    """Fit on targets < 2019, calibrate intervals on 2019-21 origins, test on origins >= 2022."""
    labelled = rows[rows.target.notna()]
    tm = labelled.month + labelled.h
    train = labelled[tm < CAL_START]
    cal = labelled[(labelled.month >= CAL_START) & (tm < TEST_START)]
    test = labelled[labelled.month >= TEST_START]
    models = fit_quantiles(encode(train), train.target)
    cal, test = _predict(models, cal), _predict(models, test)
    margins = cqr_margins(cal[cal.market != "India"])
    agg_cal = cal[cal.market == "India"]
    lam = shrinkage(agg_cal)
    agg_margins = cqr_margins(apply_shrinkage(agg_cal, lam))
    is_agg = (test.market == "India") | test.market.str.endswith("Zone")
    test = pd.concat([test[~is_agg], apply_shrinkage(test[is_agg], lam)]).sort_index()
    is_agg = (test.market == "India") | test.market.str.endswith("Zone")
    m = np.where(is_agg, test.h.map(agg_margins), test.h.map(margins))
    test["lo"], test["hi"] = test.q10 - m, test.q90 + m
    # seasonal naive: last year's realised change over the same months
    key = labelled.set_index(["crop", "market", "h", "month"]).target
    prev = pd.MultiIndex.from_arrays([test.crop, test.market, test.h, test.month - 12])
    test["snaive"] = key.reindex(prev).to_numpy()
    test = test.dropna(subset=["snaive"])

    def summary(d: pd.DataFrame) -> dict:
        ape = lambda pred: np.abs(np.expm1(pred - d.target))  # noqa: E731  error on the price level
        res = {
            "n": int(len(d)),
            "mape_model": float(ape(d.q50).mean()),
            "mape_naive": float(ape(0 * d.q50).mean()),
            "mape_seasonal_naive": float(ape(d.snaive).mean()),
            "coverage_raw": float(((d.target >= d.q10) & (d.target <= d.q90)).mean()),
            "coverage_conformal": float(((d.target >= d.lo) & (d.target <= d.hi)).mean()),
            "direction_accuracy": float((np.sign(d.q50) == np.sign(d.target))[d.target.abs() > 0.02].mean()),
        }
        res["skill_vs_naive"] = 1 - res["mape_model"] / res["mape_naive"]
        return res

    zones = test.market.str.endswith("Zone")
    out = {
        "train_targets_before": str(CAL_START),
        "calibration_origins": f"{CAL_START} .. {TEST_START - 1}",
        "test_origins": f"{TEST_START} .. {test.month.max()}",
        "cqr_margins_market": margins,
        "cqr_margins_aggregate": agg_margins,
        "aggregate_model_weight": lam,
        "markets": {},
        "zones": {},
        "national": {},
    }
    for h in HORIZONS:
        th = test[test.h == h]
        out["markets"][f"h{h}"] = summary(th[th.market != "India"])
        out["zones"][f"h{h}"] = summary(th[zones[test.h == h]])
        out["national"][f"h{h}"] = summary(th[th.market == "India"])
    out["markets_by_crop_h3"] = {
        c: summary(g) for c, g in test[(test.h == 3) & (test.market != "India")].groupby("crop")
    }
    return out, {"lam": lam, "margins": agg_margins}


def forecast(rows: pd.DataFrame, models: dict, calib: dict, nat: pd.DataFrame, panel: pd.DataFrame) -> dict:
    """Latest-origin forecasts for the national index and each price zone still reporting."""
    latest = panel.month.max()
    out: dict = {}
    for crop, (_, label) in COMMODITIES.items():
        g = nat[nat.crop == crop].set_index("month")
        series_last = rows[(rows.crop == crop)].groupby("market").month.max()
        live = [m for m in series_last[series_last >= latest - 3].index if m == "India" or m.endswith("Zone")]
        entry = {"label": label, "unit": "₹/kg", "national": None, "zones": {}}
        for market in live:
            o = rows[(rows.crop == crop) & (rows.market == market)]
            origin = o.month.max()
            o = o[o.month == origin].sort_values("h")
            if len(o) != len(HORIZONS):
                continue
            q = apply_shrinkage(_predict(models, o), calib["lam"])
            if market == "India":
                p0 = float(np.exp(g.lp.loc[origin]))
                hist = g.lp.loc[origin - 59 : origin]
            else:
                s = panel[(panel.crop == crop) & (panel.market == market)].set_index("month").price
                p0 = float(s.loc[origin])
                hist = np.log(s.loc[origin - 35 : origin])
            fc = []
            for r in q.itertuples():
                m = calib["margins"][int(r.h)]
                fc.append(
                    {
                        "month": str(origin + int(r.h)),
                        "p10": round(p0 * float(np.exp(r.q10 - m)), 2),
                        "p50": round(p0 * float(np.exp(r.q50)), 2),
                        "p90": round(p0 * float(np.exp(r.q90 + m)), 2),
                    }
                )
            series = {
                "origin": str(origin),
                "last": round(p0, 2),
                "history": [[str(k), round(float(np.exp(v)), 2)] for k, v in hist.items() if pd.notna(v)],
                "forecast": fc,
            }
            if market == "India":
                entry["national"] = series
            else:
                entry["zones"][market.replace(" Zone", "").lower().replace("-", "")] = series
        out[crop] = entry
    return out


def run() -> dict:
    t0 = time.time()
    panel = load_panel()
    nat = national_index(panel)
    rows = build_rows(panel, nat)
    print(f"{len(rows):,} rows from {rows.groupby(['crop', 'market']).ngroups} series ({time.time() - t0:.0f}s)")
    bt, calib = backtest(rows)
    for k in ("zones", "markets", "national"):
        print(
            k,
            {
                h: (
                    round(v["mape_model"], 3),
                    round(v["mape_naive"], 3),
                    round(v["skill_vs_naive"], 3),
                    round(v["coverage_conformal"], 2),
                )
                for h, v in bt[k].items()
            },
        )
    labelled = rows[rows.target.notna()]
    models = fit_quantiles(encode(labelled), labelled.target)
    fc = forecast(rows, models, calib, nat, panel)
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated": datetime.now(UTC).strftime("%Y-%m-%d"),
        "latest_month": str(panel.month.max()),
        "source": "WFP VAM / Department of Consumer Affairs Price Monitoring Cell (retail), via HDX",
        "license": "CC BY-IGO 3.0",
        "commodities": fc,
        "backtest": {k: bt[k] for k in ("zones", "national", "test_origins")},
    }
    (WEB_DATA / "prices.json").write_text(json.dumps(payload, separators=(",", ":"), default=float))
    (REPORTS / "price_metrics.json").write_text(json.dumps(bt, indent=1, default=float))
    print(f"done in {time.time() - t0:.0f}s")
    return payload


if __name__ == "__main__":
    run()
