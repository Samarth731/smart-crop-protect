"""Build a district gazetteer: LGD district code -> name, state, latitude, longitude.

District coordinates are not published alongside the APY statistics, so we match every
LGD district to the GeoNames gazetteer (CC-BY 4.0). Matching runs in three passes:

1. second-order administrative divisions (``ADM2``) in the same state, by normalised
   name or any GeoNames alternate name;
2. district headquarters / populated places (``PPLA2``, ``PPLA``, ``PPL``) in the state;
3. fuzzy (difflib) match over both pools, accepted only above a strict similarity.

Anything still unmatched is reported so it can be fixed in ``MANUAL`` below.
"""

from __future__ import annotations

import difflib
import re
import unicodedata
import zipfile

import pandas as pd

from scp_ml.paths import PROCESSED, RAW

GEONAMES_COLS = [
    "geonameid",
    "name",
    "asciiname",
    "alternatenames",
    "lat",
    "lon",
    "fclass",
    "fcode",
    "cc",
    "cc2",
    "admin1",
    "admin2",
    "admin3",
    "admin4",
    "population",
    "elevation",
    "dem",
    "tz",
    "modified",
]

# GeoNames admin1 code -> state name as written in the APY data.
ADMIN1_TO_STATE = {
    "01": "Andaman And Nicobar Islands",
    "02": "Andhra Pradesh",
    "03": "Assam",
    "05": "Chandigarh",
    "07": "Delhi",
    "09": "Gujarat",
    "10": "Haryana",
    "11": "Himachal Pradesh",
    "12": "Jammu And Kashmir",
    "13": "Kerala",
    "14": "Lakshadweep",
    "16": "Maharashtra",
    "17": "Manipur",
    "18": "Meghalaya",
    "19": "Karnataka",
    "20": "Nagaland",
    "21": "Odisha",
    "22": "Puducherry",
    "23": "Punjab",
    "24": "Rajasthan",
    "25": "Tamil Nadu",
    "26": "Tripura",
    "28": "West Bengal",
    "29": "Sikkim",
    "30": "Arunachal Pradesh",
    "31": "Mizoram",
    "33": "Goa",
    "34": "Bihar",
    "35": "Madhya Pradesh",
    "36": "Uttar Pradesh",
    "37": "Chhattisgarh",
    "38": "Jharkhand",
    "39": "Uttarakhand",
    "40": "Telangana",
    "41": "Ladakh",
    "52": "The Dadra And Nagar Haveli And Daman And Diu",
}

# States carved out of others: a district may still sit under the parent in GeoNames.
PARENT_STATE = {
    "Telangana": "Andhra Pradesh",
    "Ladakh": "Jammu And Kashmir",
    "Uttarakhand": "Uttar Pradesh",
    "Jharkhand": "Bihar",
    "Chhattisgarh": "Madhya Pradesh",
}

# Hand-checked coordinates (district HQ) for names GeoNames does not carry.
# Mostly districts created or renamed after 2020.
MANUAL: dict[str, tuple[float, float]] = {
    "Siaha": (22.49, 92.98),
    "Sribhumi": (24.87, 92.36),  # formerly Karimganj
    "Khandwa (East Nimar)": (21.82, 76.35),
    "Bengaluru South": (12.72, 77.28),  # formerly Ramanagara
    "Balodabazar-Bhatapara": (21.66, 82.16),
    "Balrampur-Ramanujganj": (23.61, 83.61),
    "Dr. B.R. Ambedkar Konaseema": (16.58, 82.01),  # HQ Amalapuram
    "Shamator": (26.05, 94.92),
    "Didwana-Kuchaman": (27.40, 74.57),
    "Khairthal-Tijara": (27.80, 76.64),
    "Kotputli-Behror": (27.70, 76.20),
}

STOP = re.compile(r"\b(district|dist|division|rural|urban|nagar haveli)\b")


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    s = s.replace("&", " and ")
    s = STOP.sub(" ", s)
    s = re.sub(r"[^a-z]", "", s)
    # common transliteration variants
    for a, b in (("aa", "a"), ("ee", "i"), ("oo", "u"), ("w", "v"), ("ph", "f"), ("sh", "s")):
        s = s.replace(a, b)
    return s


def load_geonames() -> pd.DataFrame:
    with zipfile.ZipFile(RAW / "IN.zip") as z, z.open("IN.txt") as f:
        g = pd.read_csv(
            f,
            sep="\t",
            names=GEONAMES_COLS,
            dtype={"admin1": str, "admin2": str},
            usecols=["name", "asciiname", "alternatenames", "lat", "lon", "fcode", "admin1", "population"],
            keep_default_na=False,
            quoting=3,
        )
    g = g[g.fcode.isin(["ADM2", "PPLA", "PPLA2", "PPLC", "PPL", "PPLA3"])].copy()
    g["state"] = g.admin1.map(ADMIN1_TO_STATE)
    g["population"] = pd.to_numeric(g.population, errors="coerce").fillna(0)
    return g


def _keys(row) -> set[str]:
    names = {row["name"], row["asciiname"], *str(row["alternatenames"]).split(",")}
    return {norm(n) for n in names if n and len(n) < 60} - {""}


def build_index(g: pd.DataFrame) -> dict[tuple[str, str], list[tuple[int, float, float, int]]]:
    """(state, normalised name) -> candidates [(rank, lat, lon, population)]; lower rank is better."""
    rank = {"ADM2": 0, "PPLA": 1, "PPLC": 1, "PPLA2": 1, "PPLA3": 2, "PPL": 3}
    idx: dict[tuple[str, str], list] = {}
    for row in g.to_dict("records"):
        for k in _keys(row):
            idx.setdefault((row["state"], k), []).append(
                (rank[row["fcode"]], row["lat"], row["lon"], row["population"])
            )
    return idx


def pick(cands):
    return sorted(cands, key=lambda c: (c[0], -c[3]))[0]


def districts_from_apy() -> pd.DataFrame:
    cols = ["state_name", "district_name", "district_code"]
    apy = pd.read_csv(RAW / "apy_district.csv", usecols=cols, low_memory=False)
    upag = pd.read_csv(RAW / "apy_upag.csv", usecols=cols, low_memory=False)
    both = pd.concat([apy.assign(src=0), upag.assign(src=1)]).dropna(subset=["district_code"])
    both["district_code"] = both.district_code.astype(int)
    # Keep every spelling (used for matching), but name each district by its APY spelling.
    names = both.groupby("district_code").agg(
        state=("state_name", "first"),
        name=("district_name", "first"),
        aliases=("district_name", lambda s: sorted(set(s))),
    )
    return names.reset_index()


def build_gazetteer() -> pd.DataFrame:
    g = load_geonames()
    idx = build_index(g)
    # Fuzzy matching only against district-level features: villages (PPL) would swamp it.
    major = g[g.fcode.isin(["ADM2", "PPLA", "PPLA2", "PPLC"])]
    pools: dict[str, list[str]] = {}
    for row in major.to_dict("records"):
        pools.setdefault(row["state"], []).extend(_keys(row))
    pools = {k: sorted(set(v)) for k, v in pools.items()}
    out = []
    for r in districts_from_apy().to_dict("records"):
        states = [r["state"]] + ([PARENT_STATE[r["state"]]] if r["state"] in PARENT_STATE else [])
        hit, how = None, None
        if r["name"] in MANUAL:
            hit, how = (0, *MANUAL[r["name"]], 0), "manual"
        for st in states:
            if hit:
                break
            for alias in r["aliases"]:
                c = idx.get((st, norm(alias)))
                if c:
                    hit, how = pick(c), "exact"
                    break
        for st in states:
            if hit:
                break
            for alias in r["aliases"]:
                m = difflib.get_close_matches(norm(alias), pools.get(st, []), n=1, cutoff=0.86)
                if m:
                    hit, how = pick(idx[(st, m[0])]), f"fuzzy:{m[0]}"
                    break
        out.append(
            {
                "district_code": r["district_code"],
                "district": r["name"],
                "state": r["state"],
                "lat": round(hit[1], 4) if hit else None,
                "lon": round(hit[2], 4) if hit else None,
                "match": how or "unmatched",
            }
        )
    gz = pd.DataFrame(out)
    # Sanity check: a district should lie within ~450 km of its state's median point.
    med = gz.groupby("state")[["lat", "lon"]].transform("median")
    km = 111 * ((gz.lat - med.lat) ** 2 + ((gz.lon - med.lon) * 0.9) ** 2) ** 0.5
    gz["suspect"] = km > 450
    gz.to_csv(PROCESSED / "districts.csv", index=False)
    return gz


if __name__ == "__main__":
    gz = build_gazetteer()
    print(gz.match.str.split(":").str[0].value_counts())
    print(gz[gz.match == "unmatched"].to_string())
    print(gz[gz.match.str.startswith("fuzzy") | gz.suspect].to_string())
