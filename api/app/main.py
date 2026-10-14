"""Smart Crop Protect API: the same models the web app runs on-device, served over HTTP.

    uvicorn app.main:app --reload

Useful for integrations (SMS/IVR advisories, partner apps, batch scoring) where running the
models on a phone is not possible. Model and data artefacts are read from web/public.
"""

from __future__ import annotations

import io
import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .features import BASE_FEATURES, feature_row, window_for

ASSETS = Path(os.environ.get("SCP_ASSETS", Path(__file__).resolve().parents[2] / "web" / "public"))
Season = Literal["kharif", "rabi", "summer", "annual"]

app = FastAPI(
    title="Smart Crop Protect API",
    version="2.0.0",
    description="District yield forecasts, market price outlooks and leaf disease classification for Indian farms.",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["*"])


@lru_cache
def yield_model() -> tuple[ort.InferenceSession, dict]:
    meta = json.loads((ASSETS / "models" / "yield.meta.json").read_text())
    return ort.InferenceSession(str(ASSETS / "models" / "yield.onnx")), meta


@lru_cache
def districts() -> dict[int, dict]:
    return {d["c"]: d for d in json.loads((ASSETS / "data" / "districts.json").read_text())}


@lru_cache(maxsize=64)
def shard(state_key: str) -> dict:
    path = ASSETS / "data" / "yield" / f"{state_key}.json"
    if not path.exists():
        raise HTTPException(404, f"no yield data for state '{state_key}'")
    return json.loads(path.read_text())


@lru_cache
def prices() -> dict:
    return json.loads((ASSETS / "data" / "prices.json").read_text())


@lru_cache
def leaf_model() -> tuple[ort.InferenceSession, dict] | None:
    onnx_path = ASSETS / "models" / "leaf.onnx"
    if not onnx_path.exists():
        return None
    meta = json.loads((ASSETS / "models" / "leaf.meta.json").read_text())
    return ort.InferenceSession(str(onnx_path)), meta


class YieldRequest(BaseModel):
    district_code: int = Field(examples=[500])
    crop: str = Field(examples=["cotton"])
    season: Season = "kharif"
    monthly_weather: list[list[float | None]] | None = Field(
        default=None,
        description="Observed monthly weather for the season window so far, each row "
        "[rain_mm, tmax_hottest_day, tmin_coldest_night, srad, root_zone_wetness, rh]. "
        "Leave empty for a forecast at sowing.",
    )


class YieldResponse(BaseModel):
    district: str
    state: str
    crop: str
    season: str
    observed_months: int
    total_months: int
    baseline_kg_ha: float
    p10_kg_ha: float
    p50_kg_ha: float
    p90_kg_ha: float
    history: list[tuple[int, float, float]]


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "leaf_model": leaf_model() is not None}


@app.post("/v1/yield/forecast", response_model=YieldResponse)
def forecast_yield(req: YieldRequest) -> YieldResponse:
    d = districts().get(req.district_code)
    if d is None:
        raise HTTPException(404, "unknown district code (use LGD codes, see /v1/districts)")
    s = shard(d["k"])
    dist = s["districts"].get(str(req.district_code))
    series = dist and dist["series"].get(f"{req.crop}|{req.season}")
    if not series:
        raise HTTPException(404, f"no statistics for {req.crop}/{req.season} in {d['n']}")
    session, meta = yield_model()
    win = window_for(req.crop, req.season)
    obs = (req.monthly_weather or [])[: len(win)]
    observed = len(obs)
    obs = obs + [[None] * 6] * (len(win) - observed)
    row = feature_row(meta, req.crop, req.season, s["state"], series["b"], dist["normals"], obs, observed)
    pred = float(session.run(None, {"input": row[None, :].astype(np.float32)})[0][0, 0])
    stage = round(observed / len(win) * 3)
    lo, hi = meta["intervals"]["by_crop"].get(req.crop, {}).get(str(stage), meta["intervals"]["pooled"][str(stage)])
    log_base = series["b"][BASE_FEATURES.index("log_base")]
    return YieldResponse(
        district=d["n"],
        state=d["s"],
        crop=req.crop,
        season=req.season,
        observed_months=observed,
        total_months=len(win),
        baseline_kg_ha=float(np.exp(log_base)),
        p10_kg_ha=float(np.exp(log_base + pred + lo)),
        p50_kg_ha=float(np.exp(log_base + pred)),
        p90_kg_ha=float(np.exp(log_base + pred + hi)),
        history=[tuple(h) for h in series["h"]],
    )


@app.get("/v1/districts")
def list_districts(state: str | None = None) -> list[dict]:
    return [
        {"code": d["c"], "name": d["n"], "state": d["s"], "lat": d["la"], "lon": d["lo"]}
        for d in districts().values()
        if state is None or d["s"].lower() == state.lower()
    ]


@app.get("/v1/prices/{commodity}")
def price_outlook(commodity: str, zone: str | None = Query(None, examples=["west"])) -> dict:
    c = prices()["commodities"].get(commodity)
    if c is None:
        raise HTTPException(404, f"no price series for '{commodity}'")
    series = c["zones"].get(zone) if zone else c["national"]
    if series is None:
        raise HTTPException(404, f"no '{zone}' zone series for '{commodity}'")
    return {"commodity": c["label"], "unit": c["unit"], "zone": zone or "india", **series}


@app.post("/v1/leaf/classify")
async def classify_leaf(image: Annotated[UploadFile, File()], crop: str | None = None) -> dict:
    model = leaf_model()
    if model is None:
        raise HTTPException(503, "leaf model not installed")
    from PIL import Image  # imported lazily: only needed for this endpoint

    session, meta = model
    size = meta["input"]["size"]
    img = Image.open(io.BytesIO(await image.read())).convert("RGB")
    side = min(img.size)
    left, top = (img.width - side) // 2, (img.height - side) // 2
    img = img.crop((left, top, left + side, top + side)).resize((size, size), Image.BILINEAR)
    x = (np.asarray(img, dtype=np.float32) / 255 - meta["input"]["mean"]) / meta["input"]["std"]
    logits = session.run(None, {session.get_inputs()[0].name: x.transpose(2, 0, 1)[None].astype(np.float32)})[0][0]
    z = logits / meta.get("temperature", 1.0)
    p = np.exp(z - z.max())
    p /= p.sum()
    if crop:
        p = p * np.array([1.0 if c["crop"] == crop else 0.15 for c in meta["classes"]])
        p /= p.sum()
    top = np.argsort(-p)[:3]
    return {
        "predictions": [{**meta["classes"][i], "probability": float(p[i])} for i in top],
        "unsure": bool(p[top[0]] < meta.get("unsureBelow", 0.45)),
    }
