"""Collect evaluation reports into web/public/data/metrics.json for the in-app model cards.

python -m scp_ml.export.metrics
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

from scp_ml.paths import REPORTS, WEB_DATA


def _load(name: str) -> dict | None:
    p = REPORTS / name
    return json.loads(p.read_text()) if p.exists() else None


def _r(x: float, n: int = 4) -> float:
    return round(float(x), n)


def yield_card(r: dict) -> dict:
    t = r["test_full_season"]
    return {
        "test": {
            "n": t["n"],
            "mdape": {k: _r(v) for k, v in t["mdape"].items()},
            "skill": _r(t["skill_vs_baseline"]),
            "skillVsTrend": _r(t["skill_vs_trend"]),
            "coverage": _r(t["coverage_80"]),
            "r2": _r(t["r2_log_yield"]),
        },
        "byStage": [
            {
                "stage": int(s),
                "mdape": _r(v["mdape"]["model"]),
                "skill": _r(v["skill_vs_baseline"]),
                "coverage": _r(v["coverage_80"]),
            }
            for s, v in r["by_stage"].items()
        ],
        "byCrop": sorted(
            [
                {
                    "crop": c,
                    "n": v["n"],
                    "mdape": _r(v["mdape"]["model"]),
                    "mdapeBase": _r(v["mdape"]["baseline"]),
                    "skill": _r(v["skill_vs_baseline"]),
                    "coverage": _r(v["coverage_80"]),
                }
                for c, v in r["by_crop"].items()
            ],
            key=lambda x: -x["skill"],
        ),
        "ablation": {k: _r(v) for k, v in r.get("ablation_skill_vs_baseline", {}).items()},
        "importance": [{"feature": k, "value": _r(v, 5)} for k, v in list(r["importance"].items())[:12]],
        "rows": r["rows"],
        "trainedRows": r.get("trained_rows"),
        "params": r["params"],
        "bytes": {"onnx": r.get("onnx_bytes"), "trees": r.get("trees_json_bytes")},
    }


def price_card(r: dict) -> dict:
    def table(block: dict) -> list[dict]:
        return [
            {
                "h": int(h[1:]),
                "mape": _r(v["mape_model"]),
                "naive": _r(v["mape_naive"]),
                "seasonalNaive": _r(v["mape_seasonal_naive"]),
                "skill": _r(v["skill_vs_naive"]),
                "coverage": _r(v["coverage_conformal"]),
                "direction": _r(v["direction_accuracy"]),
                "n": v["n"],
            }
            for h, v in block.items()
        ]

    return {
        "zones": table(r["zones"]),
        "markets": table(r["markets"]),
        "national": table(r["national"]),
        "modelWeight": {int(k): _r(v, 2) for k, v in r.get("aggregate_model_weight", {}).items()},
        "testOrigins": r["test_origins"],
        "calibration": r.get("calibration_origins"),
    }


def run() -> None:
    out = {"generated": datetime.now(UTC).strftime("%Y-%m-%d")}
    if y := _load("yield_metrics.json"):
        out["yield"] = yield_card(y)
    if p := _load("price_metrics.json"):
        out["price"] = price_card(p)
    if leaf := _load("leaf_metrics.json"):
        out["leaf"] = leaf
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    (WEB_DATA / "metrics.json").write_text(json.dumps(out, separators=(",", ":")))
    print("metrics.json:", ", ".join(k for k in out if k != "generated"))


if __name__ == "__main__":
    run()
