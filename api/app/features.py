"""Yield-model features in plain numpy (no pandas), mirroring ml/src/scp_ml/features/yield_features.py.

The API, the training pipeline and the web client each implement these features; all three are
checked against the same golden fixtures (web/src/lib/ml/__fixtures__/yield_golden.json).
"""

from __future__ import annotations

import numpy as np

R, TX, TN, GW = 0, 1, 2, 4
BASE_FEATURES = ["log_base", "base_trend", "base_cv", "base_n", "log_area", "state_rel"]


def _months(start: tuple[int, int], n: int) -> list[tuple[int, int]]:
    dy, m = start
    out = []
    for _ in range(n):
        out.append((dy, m))
        m += 1
        if m == 13:
            dy, m = dy + 1, 1
    return out


SEASON_WINDOWS = {
    "kharif": _months((0, 6), 5),
    "rabi": _months((0, 11), 5),
    "summer": _months((1, 3), 4),
    "annual": _months((0, 6), 12),
}
CROP_WINDOWS = {
    ("cotton", "kharif"): _months((0, 6), 7),
    ("pigeonpea", "kharif"): _months((0, 6), 7),
    ("sugarcane", "kharif"): _months((0, 3), 12),
    ("potato", "rabi"): _months((0, 10), 5),
    ("mustard", "rabi"): _months((0, 10), 5),
    ("chickpea", "rabi"): _months((0, 10), 6),
}


def window_for(crop: str, season: str) -> list[tuple[int, int]]:
    return CROP_WINDOWS.get((crop, season), SEASON_WINDOWS[season])


def phase_slices(n: int) -> list[slice]:
    sizes = [len(a) for a in np.array_split(np.arange(n), 3)]
    out, i = [], 0
    for s in sizes:
        out.append(slice(i, i + s))
        i += s
    return out


def weather_features(obs: np.ndarray, nrm: np.ndarray, observed: int) -> dict[str, float]:
    """obs, nrm: [months, 6]; months at index >= observed (or NaN) use the normal."""
    n = nrm.shape[0]
    seen = np.arange(n) < observed
    obs = np.where(seen[:, None] & ~np.isnan(obs), obs, nrm)
    f: dict[str, float] = {}

    def block(sl: slice, tag: str) -> None:
        o, c = obs[sl], nrm[sl]
        f[f"lrain{tag}"] = float(np.log(np.clip(o[:, R].sum() / max(c[:, R].sum(), 1.0), 0.05, 4.0)))
        f[f"gwet{tag}"] = float((o[:, GW] - c[:, GW]).mean())
        f[f"tmax{tag}"] = float((o[:, TX] - c[:, TX]).mean())

    block(slice(0, n), "")
    for i, sl in enumerate(phase_slices(n), start=1):
        block(sl, f"_p{i}")
    f["tmin"] = float((obs[:, TN] - nrm[:, TN]).mean())
    wet = nrm[:, R] >= 30
    f["dry_months"] = float((seen & wet & (obs[:, R] < 0.5 * nrm[:, R])).sum())
    f["hot_months"] = float((seen & (obs[:, TX] > 35) & (obs[:, TX] - nrm[:, TX] > 1)).sum())
    return f


def climate_features(nrm: np.ndarray) -> dict[str, float]:
    return {
        "clim_rain_log": float(np.log1p(nrm[:, R].sum())),
        "clim_tmax": float(nrm[:, TX].mean()),
        "clim_gwet": float(nrm[:, GW].mean()),
    }


def feature_row(
    spec: dict,
    crop: str,
    season: str,
    state: str,
    base: list[float],
    normals12: list[list[float]],
    obs: list[list[float | None]],
    observed: int,
) -> np.ndarray:
    win = window_for(crop, season)
    nrm = np.array([normals12[m - 1] for _, m in win], dtype=np.float64)
    o = np.array([[np.nan if v is None else v for v in row] for row in obs], dtype=np.float64)
    values = dict(zip(BASE_FEATURES, base, strict=True))
    values.update(climate_features(nrm))
    values.update({f"d_{k}": v for k, v in weather_features(o, nrm, observed).items()})
    values["obs_frac"] = observed / len(win)
    row = np.zeros(len(spec["columns"]), dtype=np.float64)
    row[: len(spec["numeric"])] = [values[k] for k in spec["numeric"]]
    off = len(spec["numeric"])
    for vals, v in ((spec["crops"], crop), (spec["seasons"], season), (spec["states"], state)):
        if v in vals:
            row[off + vals.index(v)] = 1.0
        off += len(vals)
    return row
