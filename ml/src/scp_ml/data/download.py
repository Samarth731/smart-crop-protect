"""Download every raw dataset the pipeline uses (about 120 MB).

    python -m scp_ml.data.download

NASA POWER weather is fetched separately per district by ``scp_ml.data.weather`` (cached).
"""

from __future__ import annotations

import requests

from scp_ml.paths import RAW

SOURCES = {
    # Directorate of Economics & Statistics district APY 1997-2023, via India Data Portal (ODC-By)
    "apy_district.csv": "https://ckan.indiadataportal.com/dataset/5b8f4660-52d2-4edf-824b-1af41d290498/resource/"
    "a000ce51-a257-42e3-8ab7-3cd212966f88/download/crop-wise-area-production-yield.csv",
    # UPAg crop-wise APY 2013-2025, via India Data Portal (ODC-By)
    "apy_upag.csv": "https://ckan.indiadataportal.com/dataset/5b8f4660-52d2-4edf-824b-1af41d290498/resource/"
    "9668b3f8-8e23-45a5-b290-4193cbacc670/download/cropwise-area-production-yield-upag.csv",
    # WFP VAM food prices for India (HDX, CC BY-IGO)
    "wfp_food_prices_ind.csv": "https://data.humdata.org/dataset/dc663585-4b6f-46ae-a6d6-b2f3e4ea32b5/resource/"
    "3b1ff071-6b01-4998-aa62-2f3efb5d4888/download/wfp_food_prices_ind.csv",
    # GeoNames gazetteer for India (CC BY 4.0)
    "IN.zip": "https://download.geonames.org/export/dump/IN.zip",
}


def download(name: str, url: str, force: bool = False) -> None:
    path = RAW / name
    if path.exists() and not force:
        print(f"  {name}: cached")
        return
    with requests.get(url, stream=True, timeout=300) as r:
        r.raise_for_status()
        tmp = path.with_suffix(path.suffix + ".part")
        with tmp.open("wb") as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
        tmp.rename(path)
    print(f"  {name}: {path.stat().st_size / 1e6:.1f} MB")


def run(force: bool = False) -> None:
    for name, url in SOURCES.items():
        download(name, url, force)


if __name__ == "__main__":
    import sys

    run(force="--force" in sys.argv)
