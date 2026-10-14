"""Harmonise official district crop statistics into one tidy yield table.

Sources (both Directorate of Economics & Statistics, Ministry of Agriculture & Farmers
Welfare, republished by the India Data Portal under ODC-By):

* ``apy_district.csv`` - Crop Wise Area Production Yield, 1997-98 .. 2022-23
* ``apy_upag.csv``     - UPAg crop-wise APY, 2013-14 .. 2024-25 (field crops only)

Where the two overlap they agree exactly, so UPAg is preferred for 2013 onwards and APY
fills earlier years and the horticulture crops UPAg does not carry.

Known quirks fixed here:
* APY labels cotton production as tonnes, but the values are bales of 170 kg lint
  (UPAg confirms the factor), so APY cotton yield is converted bales/ha -> kg lint/ha.
* APY yield is t/ha while UPAg yield is kg/ha; everything is normalised to kg/ha.
* Sub-seasons are folded into four canonical seasons (Kharif, Rabi, Summer, Annual):
  Bengal/Assam "Autumn" (aus) and "Winter" (aman) rice both belong to the monsoon crop.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from scp_ml.paths import PROCESSED, RAW

# canonical id -> (APY name, UPAg name or None)
CROPS: dict[str, tuple[str, str | None]] = {
    "rice": ("Rice", "Rice"),
    "wheat": ("Wheat", "Wheat"),
    "maize": ("Maize", "Maize"),
    "cotton": ("Cotton(Lint)", "Cotton"),
    "groundnut": ("Groundnut", "Groundnut"),
    "soybean": ("Soyabean", "Soybean"),
    "chickpea": ("Gram", "Gram"),
    "pigeonpea": ("Arhar/Tur", "Tur"),
    "mustard": ("Rapeseed &Mustard", "Rapeseed & Mustard"),
    "bajra": ("Bajra", "Bajra"),
    "jowar": ("Jowar", "Jowar"),
    "sugarcane": ("Sugarcane", "Sugarcane"),
    "moong": ("Moong(Green Gram)", "Moong"),
    "urad": ("Urad", "Urad"),
    "potato": ("Potato", None),
    "onion": ("Onion", None),
}

MONSOON_WINTER = {"rice", "sugarcane"}  # crops whose "Winter" season is the monsoon crop
ANNUAL_TO_KHARIF = {"sugarcane", "cotton"}  # "Whole Year" rows that are really the kharif crop


def canonical_season(crop: str, season: str) -> str | None:
    s = season.strip()
    if s == "Total":
        return None
    if s in ("Kharif", "Autumn"):
        return "kharif"
    if s == "Winter":
        return "kharif" if crop in MONSOON_WINTER else "rabi"
    if s == "Rabi":
        return "rabi"
    if s == "Summer":
        return "summer"
    if s == "Whole Year":
        return "kharif" if crop in ANNUAL_TO_KHARIF else "annual"
    return None


def _load_apy() -> pd.DataFrame:
    df = pd.read_csv(RAW / "apy_district.csv", low_memory=False)
    name_to_id = {v[0]: k for k, v in CROPS.items()}
    df = df[df.crop_name.isin(name_to_id)].copy()
    df["crop"] = df.crop_name.map(name_to_id)
    # cotton: production is bales of 170 kg
    bales = df.crop == "cotton"
    df.loc[bales, "production"] = df.loc[bales, "production"] * 0.170
    df["src"] = "apy"
    return df[["year", "state_name", "district_code", "crop", "season", "area", "production", "src"]]


def _load_upag() -> pd.DataFrame:
    df = pd.read_csv(RAW / "apy_upag.csv", low_memory=False)
    name_to_id = {v[1]: k for k, v in CROPS.items() if v[1]}
    df = df[df.crop_name.isin(name_to_id)].copy()
    df["crop"] = df.crop_name.map(name_to_id)
    df["src"] = "upag"  # production already in tonnes (cotton as lint)
    return df[["year", "state_name", "district_code", "crop", "season", "area", "production", "src"]]


def build_yield_table() -> pd.DataFrame:
    apy, upag = _load_apy(), _load_upag()
    for df in (apy, upag):
        df["year"] = df.year.str[:4].astype(int)  # agricultural year 2018-2019 -> 2018
    upag_keys = set(zip(upag.year, upag.crop, strict=True))
    apy = apy[[(y, c) not in upag_keys for y, c in zip(apy.year, apy.crop, strict=True)]]
    df = pd.concat([apy, upag], ignore_index=True).dropna(subset=["district_code", "area", "production"])
    df["district_code"] = df.district_code.astype(int)
    df["season"] = [canonical_season(c, s) for c, s in zip(df.crop, df.season, strict=True)]
    df = df.dropna(subset=["season"])
    df = (df.groupby(["district_code", "state_name", "crop", "season", "year"], as_index=False)
            .agg(area=("area", "sum"), production=("production", "sum"), src=("src", "first")))
    df = df[(df.area > 0) & (df.production > 0)]
    df["yield_kg_ha"] = df.production * 1000 / df.area
    # States are named slightly differently across years (e.g. "Jammu And Kashmir"); take the
    # latest spelling per district so a district never belongs to two states.
    latest = df.sort_values("year").groupby("district_code").state_name.last()
    df["state"] = df.district_code.map(latest)
    df = df.drop(columns="state_name").sort_values(["district_code", "crop", "season", "year"])
    df.to_parquet(PROCESSED / "yields.parquet", index=False)
    return df


def summarise(df: pd.DataFrame) -> pd.DataFrame:
    return (df.groupby(["crop", "season"])
              .agg(rows=("yield_kg_ha", "size"), districts=("district_code", "nunique"),
                   years=("year", lambda y: f"{y.min()}-{y.max()}"),
                   median_kg_ha=("yield_kg_ha", "median"))
              .query("rows >= 300").round(0))


if __name__ == "__main__":
    t = build_yield_table()
    print(t.shape)
    print(summarise(t).to_string())
    print(np.percentile(t.yield_kg_ha, [1, 50, 99]))
