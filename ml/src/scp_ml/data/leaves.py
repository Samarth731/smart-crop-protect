"""Build the leaf-disease image dataset from Project-AgML (UC Davis) mirrors on Hugging Face.

    python -m scp_ml.data.leaves

Each parquet shard is streamed to disk, decoded, mapped onto one 37-class taxonomy shared with the
app's knowledge base, resized to 256 px squares and deleted, so peak extra disk use is one shard
(< 500 MB). Output: ml/data/processed/leaves/{train|val|test|field_train|field_test}/<class>/*.jpg

Sources (licence)
    plant_village_classification             maize, potato, tomato, pepper, background  (CC BY-SA)
    rice_leaf_disease_classification_india   rice, India                                (CC BY 4.0)
    rice_leaf_disease_classification         rice incl. healthy                         (CC BY 4.0)
    cotton_leaf_disease_classification/raw   cotton                                     (CC BY-NC 4.0)
    groundnut_leaf_disease_classification_2  groundnut                                  (CC BY 4.0)
    plant_doc_classification                 real field photos for evaluation           (CC BY-SA 4.0)
"""

from __future__ import annotations

import io
import json
import random
import shutil
from collections import Counter, defaultdict

import pyarrow.parquet as pq
import requests
from PIL import Image

from scp_ml.paths import PROCESSED, RAW

OUT = PROCESSED / "leaves"
SIZE = 256
PV_CAP = 1200  # PlantVillage images per class: keeps lab images from swamping the Indian datasets
SEED = 13

# unified class id -> (crop, display name, knowledge-base threat id or None, healthy)
CLASSES: dict[str, tuple[str, str, str | None, bool]] = {
    "maize_gray_leaf_spot": ("maize", "Grey leaf spot", "maize-gls", False),
    "maize_common_rust": ("maize", "Common rust", "maize-rust", False),
    "maize_northern_leaf_blight": ("maize", "Turcicum leaf blight", "maize-nlb", False),
    "maize_healthy": ("maize", "Healthy maize", None, True),
    "potato_early_blight": ("potato", "Early blight", "early-blight", False),
    "potato_late_blight": ("potato", "Late blight", "late-blight", False),
    "potato_healthy": ("potato", "Healthy potato", None, True),
    "tomato_bacterial_spot": ("tomato", "Bacterial spot", "tomato-bacterial-spot", False),
    "tomato_early_blight": ("tomato", "Early blight", "early-blight", False),
    "tomato_late_blight": ("tomato", "Late blight", "late-blight", False),
    "tomato_leaf_mold": ("tomato", "Leaf mould", "tomato-leaf-mold", False),
    "tomato_septoria": ("tomato", "Septoria leaf spot", "tomato-septoria", False),
    "tomato_spider_mites": ("tomato", "Spider mites", "spider-mites", False),
    "tomato_target_spot": ("tomato", "Target spot", "tomato-target-spot", False),
    "tomato_yellow_leaf_curl": ("tomato", "Yellow leaf curl virus", "leaf-curl-virus", False),
    "tomato_mosaic": ("tomato", "Mosaic virus", "tomato-mosaic", False),
    "tomato_healthy": ("tomato", "Healthy tomato", None, True),
    "pepper_bacterial_spot": ("pepper", "Bacterial spot (pepper)", "tomato-bacterial-spot", False),
    "pepper_healthy": ("pepper", "Healthy pepper", None, True),
    "rice_bacterial_blight": ("rice", "Bacterial leaf blight", "rice-blb", False),
    "rice_blast": ("rice", "Blast", "rice-blast", False),
    "rice_brown_spot": ("rice", "Brown spot", "rice-brown-spot", False),
    "rice_tungro": ("rice", "Tungro", "rice-tungro", False),
    "rice_sheath_blight": ("rice", "Sheath blight", "rice-sheath-blight", False),
    "rice_leaf_scald": ("rice", "Leaf scald", "rice-leaf-scald", False),
    "rice_healthy": ("rice", "Healthy rice", None, True),
    "cotton_alternaria": ("cotton", "Alternaria leaf spot", "cotton-alternaria", False),
    "cotton_bacterial_blight": ("cotton", "Bacterial blight", "cotton-bacterial-blight", False),
    "cotton_fusarium_wilt": ("cotton", "Fusarium wilt", "wilt", False),
    "cotton_verticillium_wilt": ("cotton", "Verticillium wilt", "wilt", False),
    "cotton_healthy": ("cotton", "Healthy cotton", None, True),
    "groundnut_early_leaf_spot": ("groundnut", "Early leaf spot", "groundnut-leaf-spot", False),
    "groundnut_late_leaf_spot": ("groundnut", "Late leaf spot (tikka)", "groundnut-leaf-spot", False),
    "groundnut_rust": ("groundnut", "Rust", "groundnut-rust", False),
    "groundnut_nutrient_deficiency": ("groundnut", "Nutrient deficiency", "nutrient", False),
    "groundnut_healthy": ("groundnut", "Healthy groundnut", None, True),
    "background": ("none", "Not a leaf", None, False),
}

SOURCES: dict[str, dict] = {
    "plant_village_classification": {
        "files": ["data/train-00000-of-00002.parquet", "data/train-00001-of-00002.parquet"],
        "cap": PV_CAP,
        "map": {
            "Corn___Cercospora_leaf_spot Gray_leaf_spot": "maize_gray_leaf_spot",
            "Corn___Common_rust": "maize_common_rust",
            "Corn___Northern_Leaf_Blight": "maize_northern_leaf_blight",
            "Corn___healthy": "maize_healthy",
            "Potato___Early_blight": "potato_early_blight",
            "Potato___Late_blight": "potato_late_blight",
            "Potato___healthy": "potato_healthy",
            "Tomato___Bacterial_spot": "tomato_bacterial_spot",
            "Tomato___Early_blight": "tomato_early_blight",
            "Tomato___Late_blight": "tomato_late_blight",
            "Tomato___Leaf_Mold": "tomato_leaf_mold",
            "Tomato___Septoria_leaf_spot": "tomato_septoria",
            "Tomato___Spider_mites Two-spotted_spider_mite": "tomato_spider_mites",
            "Tomato___Target_Spot": "tomato_target_spot",
            "Tomato___Tomato_Yellow_Leaf_Curl_Virus": "tomato_yellow_leaf_curl",
            "Tomato___Tomato_mosaic_virus": "tomato_mosaic",
            "Tomato___healthy": "tomato_healthy",
            "Pepper,_bell___Bacterial_spot": "pepper_bacterial_spot",
            "Pepper,_bell___healthy": "pepper_healthy",
            "Background_without_leaves": "background",
        },
    },
    "rice_leaf_disease_classification_india": {
        "files": ["data/train-00000-of-00001.parquet"],
        "map": {
            "Bacterialblight": "rice_bacterial_blight",
            "Blast": "rice_blast",
            "Brownspot": "rice_brown_spot",
            "Tungro": "rice_tungro",
        },
    },
    "rice_leaf_disease_classification": {
        "files": [f"data/train-0000{i}-of-00003.parquet" for i in range(3)],
        "map": {
            "Bacterial_Leaf_Blight": "rice_bacterial_blight",
            "Brown_Spot": "rice_brown_spot",
            "Healthy_Rice_Leaf": "rice_healthy",
            "Leaf_Blast": "rice_blast",
            "Leaf_Scald": "rice_leaf_scald",
            "Sheath_Blight": "rice_sheath_blight",
        },
    },
    "cotton_leaf_disease_classification": {
        "files": ["raw/train-00000-of-00001.parquet"],
        "config": "raw",
        "map": {
            "Alternaria_Leaf": "cotton_alternaria",
            "Bacterial_Blight": "cotton_bacterial_blight",
            "Fusarium_Wilt": "cotton_fusarium_wilt",
            "Healthy_Leaf": "cotton_healthy",
            "Verticillium_Wilt": "cotton_verticillium_wilt",
        },
    },
    "groundnut_leaf_disease_classification_2": {
        "files": ["data/train-00000-of-00002.parquet", "data/train-00001-of-00002.parquet"],
        "map": {
            "early_leaf_spot": "groundnut_early_leaf_spot",
            "healthy leaf": "groundnut_healthy",
            "late leaf spot": "groundnut_late_leaf_spot",
            "nutrition deficiency": "groundnut_nutrient_deficiency",
            "rust": "groundnut_rust",
        },
    },
    "plant_doc_classification": {
        "files": ["data/train-00000-of-00002.parquet", "data/train-00001-of-00002.parquet"],
        "field": True,
        "map": {
            "Corn Gray leaf spot": "maize_gray_leaf_spot",
            "Corn leaf blight": "maize_northern_leaf_blight",
            "Corn rust leaf": "maize_common_rust",
            "Potato leaf early blight": "potato_early_blight",
            "Potato leaf late blight": "potato_late_blight",
            "Tomato Early blight leaf": "tomato_early_blight",
            "Tomato Septoria leaf spot": "tomato_septoria",
            "Tomato leaf": "tomato_healthy",
            "Tomato leaf bacterial spot": "tomato_bacterial_spot",
            "Tomato leaf late blight": "tomato_late_blight",
            "Tomato leaf mosaic virus": "tomato_mosaic",
            "Tomato leaf yellow virus": "tomato_yellow_leaf_curl",
            "Tomato mold leaf": "tomato_leaf_mold",
            "Tomato two spotted spider mites leaf": "tomato_spider_mites",
            "Bell_pepper leaf": "pepper_healthy",
            "Bell_pepper leaf spot": "pepper_bacterial_spot",
        },
    },
}

HF = "https://huggingface.co/datasets/Project-AgML/{ds}/resolve/main/{file}"
INFO = "https://datasets-server.huggingface.co/info?dataset=Project-AgML/{ds}"


def label_names(ds: str, config: str = "default") -> list[str]:
    info = requests.get(INFO.format(ds=ds), timeout=60).json()["dataset_info"][config]
    return info["features"]["label"]["names"]


def square(img: Image.Image) -> Image.Image:
    img = img.convert("RGB")
    w, h = img.size
    s = min(w, h)
    img = img.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
    return img.resize((SIZE, SIZE), Image.BICUBIC)


def stream_shard(ds: str, file: str):
    tmp = RAW / f"_shard_{ds}.parquet"
    with requests.get(HF.format(ds=ds, file=file), stream=True, timeout=600) as r:
        r.raise_for_status()
        with tmp.open("wb") as f:
            for chunk in r.iter_content(1 << 22):
                f.write(chunk)
    try:
        pf = pq.ParquetFile(tmp)
        for batch in pf.iter_batches(batch_size=128, columns=["image", "label"]):
            yield from zip(batch.column("image").to_pylist(), batch.column("label").to_pylist(), strict=True)
    finally:
        tmp.unlink(missing_ok=True)


def run() -> None:
    rng = random.Random(SEED)
    if OUT.exists():
        shutil.rmtree(OUT)
    staging = OUT / "_all"
    counts: dict[str, Counter] = defaultdict(Counter)
    for ds, spec in SOURCES.items():
        names = label_names(ds, spec.get("config", "default"))
        field = spec.get("field", False)
        seen: Counter = Counter()
        for file in spec["files"]:
            for img, label in stream_shard(ds, file):
                cls = spec["map"].get(names[label])
                if cls is None:
                    continue
                if spec.get("cap") and seen[cls] >= spec["cap"] * 3:
                    continue  # over-collect, then subsample uniformly below
                seen[cls] += 1
                try:
                    im = square(Image.open(io.BytesIO(img["bytes"])))
                except Exception:  # noqa: BLE001 - corrupt images are skipped
                    continue
                d = staging / ("field" if field else "lab") / cls
                d.mkdir(parents=True, exist_ok=True)
                im.save(d / f"{ds[:12]}_{seen[cls]:05d}.jpg", quality=90)
            print(f"  {ds}/{file}: {sum(seen.values())} images", flush=True)
        counts[ds] = seen

    # splits: lab images 80/10/10 per class (after the PlantVillage cap); field photos 50/50
    split_counts: dict[str, Counter] = defaultdict(Counter)
    for kind in ("lab", "field"):
        root = staging / kind
        if not root.exists():
            continue
        for cls_dir in sorted(root.iterdir()):
            files = sorted(cls_dir.glob("*.jpg"))
            rng.shuffle(files)
            pv = [f for f in files if f.name.startswith("plant_villag")]
            other = [f for f in files if not f.name.startswith("plant_villag")]
            files = pv[:PV_CAP] + other
            rng.shuffle(files)
            n = len(files)
            if kind == "lab":
                parts = {
                    "train": files[: int(n * 0.8)],
                    "val": files[int(n * 0.8) : int(n * 0.9)],
                    "test": files[int(n * 0.9) :],
                }
            else:
                parts = {"field_train": files[: n // 2], "field_test": files[n // 2 :]}
            for split, fs in parts.items():
                dest = OUT / split / cls_dir.name
                dest.mkdir(parents=True, exist_ok=True)
                for f in fs:
                    f.rename(dest / f.name)
                split_counts[split][cls_dir.name] = len(fs)
    shutil.rmtree(staging)
    summary = {
        "classes": {k: {"crop": v[0], "name": v[1], "threat": v[2], "healthy": v[3]} for k, v in CLASSES.items()},
        "splits": {s: dict(c) for s, c in split_counts.items()},
        "totals": {s: sum(c.values()) for s, c in split_counts.items()},
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=1))
    print(json.dumps(summary["totals"]))


if __name__ == "__main__":
    run()
