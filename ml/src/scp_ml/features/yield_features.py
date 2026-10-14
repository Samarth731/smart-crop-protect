"""Feature engineering for the district yield forecaster (v2).

The same definitions are re-implemented in TypeScript (web/src/lib/ml/yieldFeatures.ts) for
on-device inference; ``scp_ml.export.golden`` writes fixtures that the web test-suite uses
to prove both implementations produce identical feature vectors and predictions.

Design (see docs/model-cards.md for the evidence behind each choice)
------
* Target    log(yield / baseline). Baseline = geometric mean of the district's last <=5
            reported yields, lagged two years because DES statistics are published 1-2 years
            after harvest. The model learns departures from the district's own normal.
* Weather   Monthly anomalies at the district centroid against its 1996-2015 climatology,
            summarised for the whole season and its early / middle / late thirds. The training
            script's ablation compares this with no weather and with a state-level index built
            from six anchor districts; district weather generalised best to 2020-24.
* Rainfall  symmetric log ratio log(obs / normal), clipped to [0.05, 4] - ratio anomalies
            (obs / normal - 1) are right-skewed and drifted with the wet 2019-24 monsoons.
* In-season months not yet observed are replaced by climatology and ``obs_frac`` is a
            feature, so one model forecasts at sowing, mid-season and at harvest.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

import numpy as np
import pandas as pd

from scp_ml.paths import PROCESSED

WX_VARS = ["rain_mm", "T2M_MAX", "T2M_MIN", "ALLSKY_SFC_SW_DWN", "GWETROOT", "RH2M"]
R, TX, TN, SR, GW, RH = range(6)
NORMAL_YEARS = (1996, 2015)
YEAR0 = 1996
N_ANCHORS = 6

Window = list[tuple[int, int]]  # (year offset from agricultural year, calendar month)


def _months(start: tuple[int, int], n: int) -> Window:
    dy, m = start
    out = []
    for _ in range(n):
        out.append((dy, m))
        m += 1
        if m == 13:
            dy, m = dy + 1, 1
    return out


SEASON_WINDOWS: dict[str, Window] = {
    "kharif": _months((0, 6), 5),  # Jun-Oct
    "rabi": _months((0, 11), 5),  # Nov-Mar
    "summer": _months((1, 3), 4),  # Mar-Jun of the following calendar year
    "annual": _months((0, 6), 12),  # Jun-May
}
CROP_WINDOWS: dict[tuple[str, str], Window] = {
    ("cotton", "kharif"): _months((0, 6), 7),  # Jun-Dec, long season
    ("pigeonpea", "kharif"): _months((0, 6), 7),
    ("sugarcane", "kharif"): _months((0, 3), 12),  # planted spring, crushed next winter
    ("potato", "rabi"): _months((0, 10), 5),  # Oct-Feb
    ("mustard", "rabi"): _months((0, 10), 5),
    ("chickpea", "rabi"): _months((0, 10), 6),
}

CROPS = [
    "rice",
    "wheat",
    "maize",
    "cotton",
    "groundnut",
    "soybean",
    "chickpea",
    "pigeonpea",
    "mustard",
    "bajra",
    "jowar",
    "sugarcane",
    "moong",
    "urad",
    "potato",
    "onion",
]
SEASONS = ["kharif", "rabi", "summer", "annual"]


def window_for(crop: str, season: str) -> Window:
    return CROP_WINDOWS.get((crop, season), SEASON_WINDOWS[season])


def phase_slices(n: int) -> list[slice]:
    """Split n months into early / middle / late thirds (sizes as np.array_split)."""
    sizes = [len(a) for a in np.array_split(np.arange(n), 3)]
    out, i = [], 0
    for s in sizes:
        out.append(slice(i, i + s))
        i += s
    return out


def weather_features(obs: np.ndarray, nrm: np.ndarray, observed: np.ndarray) -> dict[str, np.ndarray]:
    """Season weather summary for one location.

    obs, nrm : [rows, months, var] observed monthly values and climatological normals
    observed : [rows] number of leading months observed (0..months); later months -> normal
    """
    n = obs.shape[1]
    seen = np.arange(n)[None, :] < observed[:, None]
    obs = np.where(seen[..., None] & ~np.isnan(obs), obs, nrm)
    f: dict[str, np.ndarray] = {}

    def block(sl: slice, tag: str) -> None:
        o, c = obs[:, sl], nrm[:, sl]
        f[f"lrain{tag}"] = np.log(np.clip(o[..., R].sum(1) / np.maximum(c[..., R].sum(1), 1.0), 0.05, 4.0))
        f[f"gwet{tag}"] = (o[..., GW] - c[..., GW]).mean(1)
        f[f"tmax{tag}"] = (o[..., TX] - c[..., TX]).mean(1)

    block(slice(0, n), "")
    for i, sl in enumerate(phase_slices(n), start=1):
        block(sl, f"_p{i}")
    f["tmin"] = (obs[..., TN] - nrm[..., TN]).mean(1)
    wet_month = nrm[..., R] >= 30
    f["dry_months"] = (seen & wet_month & (obs[..., R] < 0.5 * nrm[..., R])).sum(1).astype(float)
    f["hot_months"] = (seen & (obs[..., TX] > 35) & (obs[..., TX] - nrm[..., TX] > 1)).sum(1).astype(float)
    return f


_WX_KEYS = list(weather_features(np.zeros((1, 6, 6)), np.ones((1, 6, 6)), np.array([6])).keys())
WEATHER_KEYS = _WX_KEYS
DISTRICT_FEATURES = [f"d_{k}" for k in _WX_KEYS]
STATE_FEATURES = [f"st_{k}" for k in _WX_KEYS]  # ablation only
CLIM_FEATURES = ["clim_rain_log", "clim_tmax", "clim_gwet"]
BASE_FEATURES = ["log_base", "base_trend", "base_cv", "base_n", "log_area", "state_rel"]
NUMERIC_FEATURES = BASE_FEATURES + CLIM_FEATURES + DISTRICT_FEATURES + ["obs_frac"]


def climate_features(nrm: np.ndarray) -> dict[str, np.ndarray]:
    """Static climate context of the district for the crop window. nrm: [rows, months, var]."""
    return {
        "clim_rain_log": np.log1p(nrm[..., R].sum(1)),
        "clim_tmax": nrm[..., TX].mean(1),
        "clim_gwet": nrm[..., GW].mean(1),
    }


@dataclass
class WeatherCube:
    """Dense monthly weather: values[district_idx, year - YEAR0, month - 1, var]."""

    codes: np.ndarray
    values: np.ndarray
    normals: np.ndarray  # [district_idx, month - 1, var]

    @classmethod
    def load(cls) -> WeatherCube:
        w = pd.read_parquet(PROCESSED / "weather_monthly.parquet")
        codes = np.sort(w.district_code.unique())
        years = w.year.max() - YEAR0 + 1
        vals = np.full((len(codes), years, 12, len(WX_VARS)), np.nan, dtype=np.float64)
        di = np.searchsorted(codes, w.district_code.to_numpy())
        vals[di, w.year.to_numpy() - YEAR0, w.month.to_numpy() - 1] = w[WX_VARS].to_numpy()
        lo, hi = NORMAL_YEARS[0] - YEAR0, NORMAL_YEARS[1] - YEAR0 + 1
        normals = np.nanmean(vals[:, lo:hi], axis=1)
        return cls(codes, vals, normals)

    def index(self, district_codes: np.ndarray) -> np.ndarray:
        idx = np.searchsorted(self.codes, district_codes)
        idx[idx >= len(self.codes)] = 0
        return np.where(self.codes[idx] == district_codes, idx, -1)

    def window(self, di: np.ndarray, years: np.ndarray, win: Window) -> tuple[np.ndarray, np.ndarray]:
        """Observed [rows, months, var] (NaN beyond the record) and normals for a window."""
        last = self.values.shape[1] - 1
        obs = np.stack([self.values[di, np.clip(years + dy - YEAR0, 0, last), m - 1] for dy, m in win], axis=1)
        beyond = np.stack([(years + dy - YEAR0) > last for dy, _ in win], axis=1)
        obs[beyond] = np.nan
        nrm = np.stack([self.normals[di, m - 1] for _, m in win], axis=1)
        return obs, nrm


def select_anchors(yields: pd.DataFrame, cube: WeatherCube) -> dict[str, list[int]]:
    """Per state, the N_ANCHORS districts with the largest mean cropped area since 2015."""
    recent = yields[yields.year >= 2015]
    area = recent.groupby(["state", "district_code", "year"]).area.sum().groupby(["state", "district_code"]).mean()
    out = {}
    for state, s in area.groupby(level=0):
        codes = [int(c) for c in s.droplevel(0).sort_values(ascending=False).index if cube.index(np.array([c]))[0] >= 0]
        out[state] = codes[:N_ANCHORS]
    return out


def state_weather(
    cube: WeatherCube, anchors: list[int], years: np.ndarray, win: Window, observed: np.ndarray
) -> dict[str, np.ndarray]:
    """Median over anchor districts of each anchor's own season features. years/observed: [rows]."""
    per_anchor = []
    for code in anchors:
        di = np.full(len(years), cube.index(np.array([code]))[0])
        obs, nrm = cube.window(di, years, win)
        per_anchor.append(weather_features(obs, nrm, observed))
    return {f"st_{k}": np.median(np.stack([a[k] for a in per_anchor]), axis=0) for k in _WX_KEYS}


def baseline_table(yields: pd.DataFrame, target_years: list[int], lag: int = 2) -> pd.DataFrame:
    """Baseline statistics available at forecast time for each (district, crop, season, year).

    Uses reported yields from years <= target - lag: up to 5 most recent for the level and
    up to 10 for the trend. Requires at least 3 reported years.
    """
    y = yields[["district_code", "state", "crop", "season", "year", "yield_kg_ha", "area"]].copy()
    y["ly"] = np.log(y.yield_kg_ha)
    out = []
    for (code, crop, season), g in y.groupby(["district_code", "crop", "season"], sort=False):
        yrs, ly, area = g.year.to_numpy(), g.ly.to_numpy(), g.area.to_numpy()
        state = g.state.iloc[0]
        for t in target_years:
            m = (yrs <= t - lag) & (yrs >= t - lag - 9)
            if m.sum() < 3:
                continue
            yy, ll, aa = yrs[m], ly[m], area[m]
            last5 = slice(-5, None)
            trend = np.polyfit(yy - yy.mean(), ll, 1)[0] if len(yy) >= 4 else 0.0
            out.append(
                (
                    code,
                    state,
                    crop,
                    season,
                    t,
                    ll[last5].mean(),
                    float(np.clip(trend, -0.15, 0.15)),
                    ll[last5].std(),
                    min(len(yy), 10),
                    np.log(aa[last5].mean()),
                )
            )
    b = pd.DataFrame(
        out,
        columns=[
            "district_code",
            "state",
            "crop",
            "season",
            "year",
            "log_base",
            "base_trend",
            "base_cv",
            "base_n",
            "log_area",
        ],
    )
    st = b.groupby(["state", "crop", "season", "year"]).log_base.transform("median")
    b["state_rel"] = st - b.log_base
    return b


def assemble(
    base: pd.DataFrame, cube: WeatherCube, anchors: dict[str, list[int]], cutoffs: str = "full"
) -> pd.DataFrame:
    """Attach climate + state-weather features to baseline rows.

    cutoffs: "full" (whole season observed) or "all" (one copy per cut-off 0, 1/3, 2/3, full)
    """
    frames = []
    for (crop, season), g in base.groupby(["crop", "season"], sort=False):
        win = window_for(crop, season)
        n = len(win)
        di = cube.index(g.district_code.to_numpy())
        g = g[(di >= 0) & g.state.isin(anchors).to_numpy()].reset_index(drop=True)
        di = cube.index(g.district_code.to_numpy())
        obs, nrm = cube.window(di, g.year.to_numpy(), win)
        clim = pd.DataFrame(climate_features(nrm))
        cuts = [n] if cutoffs == "full" else sorted({0, round(n / 3), round(2 * n / 3), n})
        # state weather (ablation only) depends on (state, year, cut-off): compute once per key
        keys = g[["state", "year"]].drop_duplicates()
        for k in cuts:
            parts = []
            for state, sk in keys.groupby("state"):
                yrs = sk.year.to_numpy()
                wx = state_weather(cube, anchors[state], yrs, win, np.full(len(yrs), k))
                parts.append(pd.DataFrame({"state": state, "year": yrs, **wx}))
            st = pd.concat(parts, ignore_index=True)
            dwx = pd.DataFrame({f"d_{key}": v for key, v in weather_features(obs, nrm, np.full(len(g), k)).items()})
            rows = pd.concat([g, clim, dwx], axis=1).merge(st, on=["state", "year"], how="left")
            rows["obs_frac"] = k / n
            frames.append(rows)
    return pd.concat(frames, ignore_index=True)


@dataclass
class FeatureSpec:
    """Column order of the model input tensor; serialised for the web client."""

    numeric: list[str]
    crops: list[str]
    seasons: list[str]
    states: list[str]

    @property
    def columns(self) -> list[str]:
        return (
            self.numeric
            + [f"crop={c}" for c in self.crops]
            + [f"season={s}" for s in self.seasons]
            + [f"state={s}" for s in self.states]
        )

    def matrix(self, df: pd.DataFrame) -> np.ndarray:
        X = np.zeros((len(df), len(self.columns)), dtype=np.float32)
        X[:, : len(self.numeric)] = df[self.numeric].to_numpy(dtype=np.float32)
        off = len(self.numeric)
        for vals, col in ((self.crops, "crop"), (self.seasons, "season"), (self.states, "state")):
            lookup = {v: i for i, v in enumerate(vals)}
            idx = df[col].map(lookup)
            ok = idx.notna().to_numpy()
            X[np.nonzero(ok)[0], off + idx[ok].astype(int).to_numpy()] = 1.0
            off += len(vals)
        return X

    def to_dict(self) -> dict:
        return {
            "numeric": self.numeric,
            "crops": self.crops,
            "seasons": self.seasons,
            "states": self.states,
            "columns": self.columns,
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=1)
