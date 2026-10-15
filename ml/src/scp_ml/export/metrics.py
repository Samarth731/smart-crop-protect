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


def leaf_card(r: dict, lab_only: dict | None) -> dict:
    q = r.get("quantization", {})
    # the lab-only ablation is evaluated unquantised: pair it with the fp32 with-field run, not the shipped int8
    ref = r.get("fp32", r)["fieldResult"]
    return {
        "arch": r["arch"] + (" · int8" if q.get("shipped") == "int8" else ""),
        "classes": r["classes"],
        "images": r["images"],
        "test": {k: _r(r["test"][k]) if k != "n" else r["test"][k] for k in ("accuracy", "macroF1", "n", "top3")},
        "field": {
            "accuracy": _r(r["fieldResult"]["accuracy"]),
            "top3": _r(r["fieldResult"]["top3"]),
            "n": r["fieldResult"]["n"],
            "note": "PlantDoc field photos never seen in training",
            "labOnlyAccuracy": _r(lab_only["fieldResult"]["accuracy"]) if lab_only else None,
            "withFieldAccuracy": _r(ref["accuracy"]) if lab_only else None,
            "selective": r["fieldResult"]["selective"],
            "ece": _r(r["fieldResult"]["ece"]),
            # as deployed: the app knows the farmer's crop and uses it as a prior
            "cropKnown": {
                "accuracy": _r(r["fieldResult"]["withCropPrior"]["accuracy"]),
                "top3": _r(r["fieldResult"]["withCropPrior"]["top3"]),
                "selective": r["fieldResult"]["withCropPrior"]["selective"],
                "labOnlyAccuracy": _r(lab_only["fieldResult"]["withCropPrior"]["accuracy"]) if lab_only else None,
                "withFieldAccuracy": _r(ref["withCropPrior"]["accuracy"]) if lab_only else None,
            },
            "selectiveCurve": r["fieldResult"]["selectiveCurve"],
        },
        "byCrop": r["test"]["byCrop"],
        "fieldByCrop": r["fieldResult"]["withCropPrior"]["byCrop"],
        "calibration": {k: _r(v) for k, v in r["calibration"].items()},
        "sizeMb": _r(r["sizeMb"], 2),
        "quantization": {
            "shipped": q.get("shipped", "fp32"),
            "fp32Mb": _r(q["fp32Mb"], 2) if q else None,
            "int8Mb": _r(q["int8Mb"], 2) if q else None,
            # the same evaluation for the unquantised network, when int8 is shipped
            "fp32TestAccuracy": _r(r["fp32"]["test"]["accuracy"]) if "fp32" in r else None,
            "fp32FieldCropKnown": _r(r["fp32"]["fieldResult"]["withCropPrior"]["accuracy"]) if "fp32" in r else None,
        },
    }


def run() -> None:
    out = {"generated": datetime.now(UTC).strftime("%Y-%m-%d")}
    if y := _load("yield_metrics.json"):
        out["yield"] = yield_card(y)
    if p := _load("price_metrics.json"):
        out["price"] = price_card(p)
    if leaf := _load("leaf_training.json"):
        out["leaf"] = leaf_card(leaf, _load("leaf_training_labonly.json"))
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    (WEB_DATA / "metrics.json").write_text(json.dumps(out, separators=(",", ":")))
    print("metrics.json:", ", ".join(k for k in out if k != "generated"))


if __name__ == "__main__":
    run()
