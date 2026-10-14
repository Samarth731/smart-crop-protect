"""Live mandi (wholesale market) prices from Agmarknet via the data.gov.in Open Government Data API.

    DATA_GOV_IN_API_KEY=... python -m scp_ml.data.mandi

Resource 9ef84268-d588-465a-a308-a864a43d0070: "Current daily price of various commodities from
various markets (Mandi)". Writes web/public/data/mandi.json with the latest modal price per market
for each app commodity. Runs daily from GitHub Actions once the repository secret
DATA_GOV_IN_API_KEY is set (free key: https://data.gov.in/user/register).
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import UTC, datetime

import requests

from scp_ml.paths import WEB_DATA

RESOURCE = "9ef84268-d588-465a-a308-a864a43d0070"
URL = f"https://api.data.gov.in/resource/{RESOURCE}"

# app crop id -> Agmarknet commodity names
COMMODITIES: dict[str, list[str]] = {
    "rice": ["Paddy(Dhan)(Common)", "Paddy(Dhan)(Basmati)"],
    "wheat": ["Wheat"],
    "maize": ["Maize"],
    "cotton": ["Cotton"],
    "groundnut": ["Groundnut"],
    "soybean": ["Soyabean"],
    "chickpea": ["Bengal Gram(Gram)(Whole)"],
    "pigeonpea": ["Arhar (Tur/Red Gram)(Whole)"],
    "mustard": ["Mustard"],
    "bajra": ["Bajra(Pearl Millet/Cumbu)"],
    "jowar": ["Jowar(Sorghum)"],
    "moong": ["Green Gram (Moong)(Whole)"],
    "urad": ["Black Gram (Urd Beans)(Whole)"],
    "potato": ["Potato"],
    "onion": ["Onion"],
    "tomato": ["Tomato"],
}


def fetch(key: str, commodity: str, limit: int = 1000) -> list[dict]:
    rows, offset = [], 0
    while True:
        params = {"api-key": key, "format": "json", "limit": limit, "offset": offset, "filters[commodity]": commodity}
        for attempt in range(4):
            r = requests.get(URL, params=params, timeout=60)
            if r.status_code == 429:
                time.sleep(5 * (attempt + 1))
                continue
            r.raise_for_status()
            break
        recs = r.json().get("records", [])
        rows += recs
        if len(recs) < limit:
            return rows
        offset += limit


def run() -> None:
    key = os.environ.get("DATA_GOV_IN_API_KEY")
    if not key:
        print("DATA_GOV_IN_API_KEY not set; skipping live mandi prices")
        sys.exit(0)
    out: dict[str, list[dict]] = {}
    for crop, names in COMMODITIES.items():
        markets = []
        for name in names:
            for r in fetch(key, name):
                try:
                    markets.append(
                        {
                            "state": r["state"],
                            "district": r["district"],
                            "market": r["market"],
                            "variety": r.get("variety", ""),
                            "date": r["arrival_date"],
                            "min": float(r["min_price"]),
                            "max": float(r["max_price"]),
                            "modal": float(r["modal_price"]),
                        }
                    )
                except (KeyError, ValueError):
                    continue
        out[crop] = sorted(markets, key=lambda m: (m["state"], m["district"], m["market"]))
        print(f"{crop}: {len(markets)} market quotes")
    payload = {
        "generated": datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC"),
        "source": "Agmarknet via data.gov.in (OGD Platform India)",
        "unit": "₹/quintal",
        "crops": out,
    }
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    (WEB_DATA / "mandi.json").write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False))


if __name__ == "__main__":
    run()
