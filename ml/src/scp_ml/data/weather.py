"""Monthly district weather from NASA POWER (MERRA-2 / CERES based, agroclimatology community).

One request per district returns 1996-2025 monthly means. Responses are cached on disk
so the pipeline is resumable and re-runs are free.

Parameters (POWER names):
    T2M, T2M_MAX, T2M_MIN   air temperature at 2 m (deg C)
    PRECTOTCORR             bias-corrected precipitation (mm/day, monthly mean)
    RH2M                    relative humidity at 2 m (%)
    ALLSKY_SFC_SW_DWN       surface shortwave radiation (kWh/m2/day)
    GWETROOT                root-zone soil wetness (0-1)
"""

from __future__ import annotations

import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import pandas as pd
import requests

from scp_ml.paths import PROCESSED, RAW

PARAMS = ["T2M", "T2M_MAX", "T2M_MIN", "PRECTOTCORR", "RH2M", "ALLSKY_SFC_SW_DWN", "GWETROOT"]
START, END = 1996, 2025
URL = "https://power.larc.nasa.gov/api/temporal/monthly/point"
CACHE = RAW / "power"
CACHE.mkdir(exist_ok=True)


def fetch_one(code: int, lat: float, lon: float, retries: int = 4) -> dict:
    path = CACHE / f"{code}.json"
    if path.exists():
        return json.loads(path.read_text())
    params = {"parameters": ",".join(PARAMS), "community": "AG", "latitude": lat, "longitude": lon,
              "start": START, "end": END, "format": "JSON"}
    for attempt in range(retries):
        try:
            r = requests.get(URL, params=params, timeout=90)
            r.raise_for_status()
            data = r.json()["properties"]["parameter"]
            path.write_text(json.dumps(data))
            return data
        except (requests.RequestException, KeyError, ValueError):
            time.sleep(2 ** attempt * 3)
    raise RuntimeError(f"POWER request failed for district {code}")


def fetch_all(workers: int = 6) -> None:
    gz = pd.read_csv(PROCESSED / "districts.csv").dropna(subset=["lat"])
    todo = [r for r in gz.itertuples() if not (CACHE / f"{r.district_code}.json").exists()]
    print(f"{len(gz) - len(todo)} cached, {len(todo)} to fetch")
    done = 0
    with ThreadPoolExecutor(workers) as ex:
        futs = {ex.submit(fetch_one, r.district_code, r.lat, r.lon): r.district_code for r in todo}
        for f in as_completed(futs):
            try:
                f.result()
            except RuntimeError as e:
                print(e)
            done += 1
            if done % 50 == 0:
                print(f"  {done}/{len(todo)}", flush=True)


def to_frame() -> pd.DataFrame:
    """Tidy monthly table: district_code, year, month, <params>. Missing values (-999) -> NaN."""
    rows = []
    for path in CACHE.glob("*.json"):
        code = int(path.stem)
        p = json.loads(path.read_text())
        keys = [k for k in p[PARAMS[0]] if not k.endswith("13")]  # YYYY13 is the annual mean
        for k in keys:
            rows.append({"district_code": code, "year": int(k[:4]), "month": int(k[4:]),
                         **{v: p[v].get(k) for v in PARAMS}})
    df = pd.DataFrame(rows).replace(-999.0, float("nan"))
    df["rain_mm"] = df.PRECTOTCORR * df.month.map(_days_in_month)
    df.sort_values(["district_code", "year", "month"]).to_parquet(PROCESSED / "weather_monthly.parquet",
                                                                 index=False)
    return df


def _days_in_month(m: int) -> float:
    return [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]


if __name__ == "__main__":
    fetch_all()
    df = to_frame()
    print(df.shape, df.district_code.nunique(), df.year.min(), df.year.max())
