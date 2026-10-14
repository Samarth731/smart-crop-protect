"""Canonical filesystem locations used across the pipeline."""

from pathlib import Path

ML_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = ML_ROOT.parent
RAW = ML_ROOT / "data" / "raw"
PROCESSED = ML_ROOT / "data" / "processed"
REPORTS = ML_ROOT / "reports"
MODELS = ML_ROOT / "models"
WEB_PUBLIC = REPO_ROOT / "web" / "public"
WEB_MODELS = WEB_PUBLIC / "models"
WEB_DATA = WEB_PUBLIC / "data"

for _p in (RAW, PROCESSED, REPORTS, MODELS):
    _p.mkdir(parents=True, exist_ok=True)
