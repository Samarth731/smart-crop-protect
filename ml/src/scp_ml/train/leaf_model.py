"""Fine-tune MobileNetV3-Large on leaf disease images and export it for the browser.

    python -m scp_ml.data.leaves          # build the dataset first
    python -m scp_ml.train.leaf_model     # train, calibrate, evaluate, quantise, export
    python -m scp_ml.train.leaf_model --no-field   # ablation: lab images only
    python -m scp_ml.train.leaf_model --export-only  # re-evaluate and re-export the saved weights

Protocol
* train on lab images (80 %) + half of the PlantDoc field photos (up-weighted);
* select and calibrate on lab validation images (10 %);
* report on lab test images (10 %) and on the *other* half of PlantDoc - real field photos
  the model never saw, which is the number that matters for farmers.
"""

from __future__ import annotations

import argparse
import json
import math
import tempfile
import time
from collections import Counter, deque
from concurrent.futures import ThreadPoolExecutor
from itertools import islice
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch
from PIL import Image
from torch import nn
from torch.utils.data import Dataset, WeightedRandomSampler
from torchvision import models, transforms

from scp_ml.data.leaves import CLASSES, OUT
from scp_ml.paths import MODELS, REPORTS, WEB_MODELS

MEAN, STD = (0.485, 0.456, 0.406), (0.229, 0.224, 0.225)
SIZE = 224
CLASS_IDS = list(CLASSES)
UNSURE_BELOW = 0.5
CROP_PRIOR = 0.15  # weight of other crops' classes once the farmer's crop is known (as in the app)
# Stem and the 112/56/28 px blocks stay at their ImageNet weights: they detect generic edges and textures,
# and leaving them frozen means autograd keeps none of their (large, high-resolution) activations.
FROZEN_BLOCKS = 7
HEAD_LR, FINETUNE_LR = 2e-3, 4e-4


class LeafSet(Dataset):
    def __init__(self, splits: list[str], tf, field_weight: float = 1.0):
        self.items: list[tuple[Path, int, bool]] = []
        for split in splits:
            root = OUT / split
            if not root.exists():
                continue
            for i, cls in enumerate(CLASS_IDS):
                for f in sorted((root / cls).glob("*.jpg")):
                    self.items.append((f, i, split.startswith("field")))
        self.tf = tf
        self.field_weight = field_weight

    def __len__(self) -> int:
        return len(self.items)

    def __getitem__(self, i):
        path, y, _ = self.items[i]
        return self.tf(Image.open(path).convert("RGB")), y

    def sample_weights(self) -> torch.Tensor:
        counts = Counter(y for _, y, _ in self.items)
        w = [(1 / math.sqrt(counts[y])) * (self.field_weight if field else 1.0) for _, y, field in self.items]
        return torch.tensor(w, dtype=torch.double)


TRAIN_TF = transforms.Compose(
    [
        transforms.RandomResizedCrop(SIZE, scale=(0.35, 1.0), ratio=(0.75, 1.33)),
        transforms.RandomHorizontalFlip(),
        transforms.RandomVerticalFlip(0.2),
        transforms.RandomRotation(20),
        transforms.ColorJitter(0.35, 0.35, 0.35, 0.06),
        transforms.RandomGrayscale(0.03),
        transforms.RandomApply([transforms.GaussianBlur(5, (0.1, 2.0))], p=0.2),
        transforms.ToTensor(),
        transforms.Normalize(MEAN, STD),
    ]
)
# The app center-crops the photo to a square and resizes to 224: evaluate the same way.
EVAL_TF = transforms.Compose([transforms.Resize((SIZE, SIZE)), transforms.ToTensor(), transforms.Normalize(MEAN, STD)])


class ThreadLoader:
    """Batches decoded by a thread pool.

    PIL decoding and torchvision transforms release the GIL, so threads parallelise them without the memory
    of DataLoader worker processes - each of those is a full Python + PyTorch copy, which pushed the 8 GB
    target laptop into swap."""

    def __init__(self, ds: LeafSet, batch: int, sampler=None, drop_last: bool = False, threads: int = 4):
        self.ds, self.batch, self.sampler, self.drop_last, self.threads = ds, batch, sampler, drop_last, threads

    def __len__(self) -> int:
        n = len(self.sampler) if self.sampler is not None else len(self.ds)
        return n // self.batch if self.drop_last else math.ceil(n / self.batch)

    def __iter__(self):
        order = [int(i) for i in (self.sampler if self.sampler is not None else range(len(self.ds)))]
        if self.drop_last:
            order = order[: len(order) // self.batch * self.batch]
        todo = iter(order)
        with ThreadPoolExecutor(self.threads) as pool:
            pending = deque(pool.submit(self.ds.__getitem__, i) for i in islice(todo, 3 * self.batch))
            while pending:
                xs, ys = [], []
                for _ in range(min(self.batch, len(pending))):
                    x, y = pending.popleft().result()
                    xs.append(x)
                    ys.append(y)
                    nxt = next(todo, None)
                    if nxt is not None:
                        pending.append(pool.submit(self.ds.__getitem__, nxt))
                yield torch.stack(xs), torch.tensor(ys)


def build_model(n_classes: int) -> nn.Module:
    m = models.mobilenet_v3_large(weights=models.MobileNet_V3_Large_Weights.IMAGENET1K_V2)
    m.classifier[3] = nn.Linear(m.classifier[3].in_features, n_classes)
    return m


def set_stage(model: nn.Module, head_only: bool) -> list[nn.Parameter]:
    """Freeze the backbone (head-only warm-up) or just its first blocks; frozen batch-norms keep their
    ImageNet statistics. Returns the trainable parameters."""
    first_trainable = len(model.features) if head_only else FROZEN_BLOCKS
    model.train()
    for i, block in enumerate(model.features):
        trainable = i >= first_trainable
        block.train(trainable)
        for p in block.parameters():
            p.requires_grad = trainable
    return [p for p in model.parameters() if p.requires_grad]


@torch.no_grad()
def predict(model: nn.Module, loader: ThreadLoader, device) -> tuple[np.ndarray, np.ndarray]:
    model.eval()
    logits, ys = [], []
    for x, y in loader:
        logits.append(model(x.to(device)).float().cpu())
        ys.append(y)
    return torch.cat(logits).numpy(), torch.cat(ys).numpy()


def fit_temperature(logits: np.ndarray, y: np.ndarray) -> float:
    t = torch.zeros(1, requires_grad=True)
    lg, yt = torch.tensor(logits), torch.tensor(y)
    opt = torch.optim.LBFGS([t], lr=0.1, max_iter=200)

    def closure():
        opt.zero_grad()
        loss = nn.functional.cross_entropy(lg / t.exp(), yt)
        loss.backward()
        return loss

    opt.step(closure)
    return float(t.exp())


def softmax(z: np.ndarray, t: float = 1.0) -> np.ndarray:
    z = z / t
    z = z - z.max(1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(1, keepdims=True)


def ece(p: np.ndarray, y: np.ndarray, bins: int = 15) -> float:
    conf, pred = p.max(1), p.argmax(1)
    edges = np.linspace(0, 1, bins + 1)
    total = 0.0
    for lo, hi in zip(edges[:-1], edges[1:], strict=True):
        m = (conf > lo) & (conf <= hi)
        if m.any():
            total += m.mean() * abs((pred[m] == y[m]).mean() - conf[m].mean())
    return float(total)


def with_crop_prior(p: np.ndarray, y: np.ndarray) -> np.ndarray:
    """Probabilities after the app's crop prior (web/src/lib/ml/leafModel.ts): the farmer's crop is known,
    so classes of other crops are down-weighted, not removed. Not-a-leaf images carry no crop."""
    crop_of = np.array([CLASSES[c][0] for c in CLASS_IDS])
    keep = crop_of[None, :] == crop_of[y][:, None]
    keep[:, CLASS_IDS.index("background")] = True
    keep[crop_of[y] == "none"] = True
    q = p * np.where(keep, 1.0, CROP_PRIOR)
    return q / q.sum(1, keepdims=True)


def metrics(p: np.ndarray, y: np.ndarray) -> dict:
    pred = p.argmax(1)
    present = sorted(set(y.tolist()))
    f1s = []
    for c in present:
        tp = ((pred == c) & (y == c)).sum()
        fp = ((pred == c) & (y != c)).sum()
        fn = ((pred != c) & (y == c)).sum()
        f1s.append(2 * tp / max(1, 2 * tp + fp + fn))
    conf = p.max(1)
    sure = conf >= UNSURE_BELOW
    crops = np.array([CLASSES[CLASS_IDS[i]][0] for i in y])
    by_crop = []
    for crop in sorted(set(crops.tolist())):
        m = crops == crop
        by_crop.append({"crop": crop, "accuracy": float((pred[m] == y[m]).mean()), "n": int(m.sum())})
    return {
        "n": int(len(y)),
        "accuracy": float((pred == y).mean()),
        "macroF1": float(np.mean(f1s)),
        "top3": float(np.mean([y[i] in np.argsort(-p[i])[:3] for i in range(len(y))])),
        "selective": {
            "threshold": UNSURE_BELOW,
            "coverage": float(sure.mean()),
            "accuracy": float((pred[sure] == y[sure]).mean()) if sure.any() else 0.0,
        },
        "selectiveCurve": [
            {
                "threshold": th,
                "coverage": float((conf >= th).mean()),
                "accuracy": float((pred[conf >= th] == y[conf >= th]).mean()) if (conf >= th).any() else None,
            }
            for th in (0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9)
        ],
        "ece": ece(p, y),
        "byCrop": by_crop,
    }


def evaluate(p: np.ndarray, y: np.ndarray) -> dict:
    """Metrics of the raw classifier, plus the headline numbers with the crop prior the app applies."""
    m = metrics(p, y)
    prior = metrics(with_crop_prior(p, y), y)
    m["withCropPrior"] = {k: prior[k] for k in ("accuracy", "macroF1", "top3", "selective", "byCrop")}
    return m


def export_onnx(model: nn.Module, path: Path) -> None:
    model = model.cpu().eval()
    x = torch.randn(1, 3, SIZE, SIZE)
    torch.onnx.export(
        model,
        x,
        path,
        input_names=["input"],
        output_names=["logits"],
        opset_version=17,
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
        dynamo=False,
    )
    onnx.checker.check_model(onnx.load(path))
    sess = ort.InferenceSession(str(path))
    with torch.no_grad():
        ref = model(x).numpy()
    got = sess.run(None, {"input": x.numpy()})[0]
    assert np.abs(ref - got).max() < 1e-3, "ONNX export does not match PyTorch"


class CalibReader:
    """Feeds images to the int8 static quantiser so it can measure activation ranges."""

    def __init__(self, sets: list[LeafSet], n: int = 300):
        rng = np.random.default_rng(0)
        picks = [(ds, int(i)) for ds in sets for i in rng.choice(len(ds), min(n // len(sets), len(ds)), replace=False)]
        self.batches = iter([{"input": ds[i][0].unsqueeze(0).numpy()} for ds, i in picks])

    def get_next(self):
        return next(self.batches, None)


def calibrate(pre: Path, reader: CalibReader, cache: Path) -> None:
    """Percentile activation ranges from ORT's own calibrator, written as an ORT calibration cache.

    ORT's percentile calibrator keeps every activation of every calibration image in memory before it
    builds histograms: ~44 MB per image for this network, 13 GB for 300 images. This builds the same
    histograms in two streaming passes, each tensor's range first and then bin counts over that range.
    It fits on an 8 GB laptop and gives a bit-identical model."""
    from onnxruntime.quantization import CalibrationMethod
    from onnxruntime.quantization.calibrate import HistogramCollector, create_calibrator, save_tensors_data
    from onnxruntime.quantization.registry import QDQRegistry, QLinearOpsRegistry

    inputs = list(iter(reader.get_next, None))
    with tempfile.TemporaryDirectory() as tmp:
        cal = create_calibrator(
            pre,
            list(set(QLinearOpsRegistry) | set(QDQRegistry)),  # what quantize_static calibrates by default
            augmented_model_path=str(Path(tmp) / "augmented.onnx"),
            calibrate_method=CalibrationMethod.Percentile,
        )
        names = [o.name for o in cal.infer_session.get_outputs()]
        wanted = [(i, n) for i, n in enumerate(names) if n in cal.tensors_to_calibrate]

        def activations():
            for x in inputs:
                out = cal.infer_session.run(None, x)
                yield [(n, out[i]) for i, n in wanted]

        lo, hi, abs_lo, abs_hi = {}, {}, {}, {}
        for acts in activations():
            for n, a in acts:
                mag = np.abs(a)
                pairs = ((lo, np.nanmin(a), min), (hi, np.nanmax(a), max))
                pairs += ((abs_lo, mag.min(), min), (abs_hi, mag.max(), max))
                for d, v, pick in pairs:
                    d[n] = v if n not in d else pick(d[n], v)
        hist, edges = {}, {}
        for acts in activations():
            for n, a in acts:
                # the float32 range np.histogram derives itself when given all the data at once
                h, edges[n] = np.histogram(np.abs(a), bins=cal.num_bins, range=(abs_lo[n], abs_hi[n]))
                hist[n] = hist.get(n, 0) + h
        cal.collector = HistogramCollector(
            method=cal.method,
            symmetric=cal.symmetric,
            num_bins=cal.num_bins,
            num_quantized_bins=cal.num_quantized_bins,
            percentile=cal.percentile,
            scenario=cal.scenario,
        )
        cal.collector.histogram_dict = {n: (hist[n], edges[n].astype(np.float32), lo[n], hi[n]) for n in hist}
        save_tensors_data(cal.compute_data(), cache)


def onnx_logits(path: Path, ds: LeafSet, batch: int = 64) -> tuple[np.ndarray, np.ndarray]:
    sess = ort.InferenceSession(str(path))
    out, ys = [], []
    for i in range(0, len(ds), batch):
        xs, yy = zip(*[ds[j] for j in range(i, min(len(ds), i + batch))], strict=True)
        out.append(sess.run(None, {"input": torch.stack(xs).numpy()})[0])
        ys.extend(yy)
    return np.concatenate(out), np.array(ys)


def device_for_training() -> torch.device:
    return torch.device("mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu")


def train_model(use_field: bool, epochs: int, batch: int, resume: bool, device) -> tuple[nn.Module, list[dict]]:
    """Fine-tune and return the epoch with the best lab-validation accuracy, plus the training history."""
    train_splits = ["train"] + (["field_train"] if use_field else [])
    train = LeafSet(train_splits, TRAIN_TF, field_weight=3.0)
    val = LeafSet(["val"], EVAL_TF)
    print(f"train {len(train)} · val {len(val)} on {device}", flush=True)
    sampler = WeightedRandomSampler(train.sample_weights(), num_samples=len(train), replacement=True)
    train_dl = ThreadLoader(train, batch, sampler=sampler, drop_last=True)
    val_dl = ThreadLoader(val, 64)

    suffix = "" if use_field else "_labonly"
    MODELS.mkdir(exist_ok=True)
    ckpt_path = MODELS / f"leaf_ckpt{suffix}.pt"
    model = build_model(len(CLASS_IDS)).to(device)
    loss_fn = nn.CrossEntropyLoss(label_smoothing=0.1)
    best, best_state, history, start = -1.0, None, [], 0
    if resume and ckpt_path.exists():
        ck = torch.load(ckpt_path, weights_only=False)
        model.load_state_dict(ck["model"])
        best, best_state, history, start = ck["best"], ck["best_state"], ck["history"], ck["epoch"] + 1
        print(f"resumed after epoch {ck['epoch']} (best val {best:.4f})", flush=True)

    steps = len(train_dl)
    finetune_steps = (epochs - 1) * steps
    opt = None
    for epoch in range(start, epochs):
        head_only = epoch == 0  # the new classifier first learns on top of fixed features
        params = set_stage(model, head_only)
        if opt is None or epoch == 1:
            opt = torch.optim.AdamW(params, lr=HEAD_LR if head_only else FINETUNE_LR, weight_decay=0.02)
            if resume and epoch == start and start > 1:
                opt.load_state_dict(ck["opt"])
        seen, correct, running, te = 0, 0, 0.0, time.time()
        for step, (x, y) in enumerate(train_dl):
            if not head_only:  # cosine decay over the fine-tuning steps
                k = (epoch - 1) * steps + step
                for g in opt.param_groups:
                    g["lr"] = FINETUNE_LR * 0.5 * (1 + math.cos(math.pi * k / finetune_steps))
            x, y = x.to(device), y.to(device)
            out = model(x)
            loss = loss_fn(out, y)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            running += loss.item() * len(y)
            seen += len(y)
            correct += (out.argmax(1) == y).sum().item()
            if step % 100 == 99:
                print(
                    f"  epoch {epoch} step {step + 1}/{steps}: loss {running / seen:.3f} "
                    f"{seen / (time.time() - te):.0f} img/s",
                    flush=True,
                )
        vl, vy = predict(model, val_dl, device)
        vacc = float((vl.argmax(1) == vy).mean())
        history.append(
            {
                "epoch": epoch,
                "loss": running / seen,
                "train_acc": correct / seen,
                "val_acc": vacc,
                "seconds": round(time.time() - te),
            }
        )
        print(
            f"epoch {epoch}: loss {running / seen:.3f} train {correct / seen:.3f} val {vacc:.4f} "
            f"({time.time() - te:.0f}s)",
            flush=True,
        )
        if vacc > best:
            best, best_state = vacc, {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
        torch.save(
            {
                "epoch": epoch,
                "model": model.state_dict(),
                "opt": opt.state_dict(),
                "best": best,
                "best_state": best_state,
                "history": history,
            },
            ckpt_path,
        )
        if device.type == "mps":
            torch.mps.empty_cache()

    model.load_state_dict(best_state)
    torch.save(model.state_dict(), MODELS / f"leaf{suffix}.pt")
    return model, history


def quantize(fp32: Path) -> dict:
    """int8 static quantisation (QDQ, per-channel 7-bit weights). Activation ranges use 99.999th-percentile
    clipping: MobileNetV3's hard-swish and squeeze-excite layers have outliers that make min/max (and, in
    our runs, entropy) calibration collapse to ~34 % accuracy; dynamic quantisation reached 85 %.

    Weights use 7 bits (reduce_range) so that every CPU gives the same answer. x86 CPUs without VNNI
    (AVX2, or AVX-512 without VNNI, e.g. the AMD EPYC 7763 behind many GitHub runners) multiply uint8
    activations by int8 weights with VPMADDUBSW, which saturates each pair of products at int16:
    2 x 255 x 127 overflows, 2 x 255 x 64 does not. With 8-bit weights, those CPUs read the rice sample
    photo as sheath blight at 0.49 instead of blast at 0.75. ARM, VNNI CPUs and the browser's WebAssembly
    accumulate exactly. uint8 weights avoid the overflow too, but lost 1.6 points on the selection sets
    against 1.05 for 7 bits.

    The int8 model ships if it loses at most 1.5 points on the selection sets (lab validation and the
    training half of the field photos). Test-set drops are reported, never used to decide."""
    from onnxruntime.quantization import CalibrationMethod, QuantFormat, QuantType, quantize_static
    from onnxruntime.quantization.shape_inference import quant_pre_process

    pre, int8 = MODELS / "leaf_pre.onnx", MODELS / "leaf_int8.onnx"
    quant_pre_process(str(fp32), str(pre))
    val, field_train = LeafSet(["val"], EVAL_TF), LeafSet(["field_train"], EVAL_TF)
    with tempfile.TemporaryDirectory() as tmp:
        cache = Path(tmp) / "calibration.json"
        # ranges from both lab and field-style photos: the app sees the latter (worst-case selection drop
        # 0.7 points vs 0.9 when calibrating on lab images alone, measured with 8-bit weights)
        calibrate(pre, CalibReader([val, field_train]), cache)
        quantize_static(
            str(pre),
            str(int8),
            None,
            calibration_cache_path=str(cache),
            quant_format=QuantFormat.QDQ,
            per_channel=True,
            reduce_range=True,
            weight_type=QuantType.QInt8,
            activation_type=QuantType.QUInt8,
            calibrate_method=CalibrationMethod.Percentile,
        )

    def acc(path: Path, ds: LeafSet) -> float:
        lg, y = onnx_logits(path, ds)
        return float((lg.argmax(1) == y).mean())

    selection_drop = max(acc(fp32, ds) - acc(int8, ds) for ds in (val, field_train))
    return {
        "method": "static QDQ, per-channel 7-bit int8 weights, uint8 activations, percentile calibration",
        "selectionDrop": selection_drop,
        "fp32Mb": fp32.stat().st_size / 1e6,
        "int8Mb": int8.stat().st_size / 1e6,
        "shipped": "int8" if selection_drop <= 0.015 else "fp32",
    }


def run(
    epochs: int = 8, use_field: bool = True, batch: int = 32, resume: bool = False, export_only: bool = False
) -> dict:
    t0 = time.time()
    torch.set_num_threads(1)  # the loader threads do the CPU work; avoid oversubscribing them
    device = device_for_training()
    suffix = "" if use_field else "_labonly"
    if export_only:
        model = build_model(len(CLASS_IDS))
        model.load_state_dict(torch.load(MODELS / f"leaf{suffix}.pt"))
        model.to(device)
        history = json.loads((REPORTS / f"leaf_training{suffix}.json").read_text())["history"]
    else:
        model, history = train_model(use_field, epochs, batch, resume, device)

    val, test, field = (LeafSet([s], EVAL_TF) for s in ("val", "test", "field_test"))
    vl, vy = predict(model, ThreadLoader(val, 64), device)
    temperature = fit_temperature(vl, vy)
    tl, ty = predict(model, ThreadLoader(test, 64), device)
    fl, fy = predict(model, ThreadLoader(field, 64), device)
    n_train = len(LeafSet(["train"] + (["field_train"] if use_field else []), EVAL_TF))
    report = {
        "arch": "MobileNetV3-Large",
        "classes": len(CLASS_IDS),
        "images": n_train + len(val) + len(test),
        "fieldTraining": use_field,
        "temperature": temperature,
        "history": history,
        "test": evaluate(softmax(tl, temperature), ty),
        "fieldResult": evaluate(softmax(fl, temperature), fy),
        "calibration": {"eceBefore": ece(softmax(vl), vy), "eceAfter": ece(softmax(vl, temperature), vy)},
    }

    if use_field:
        WEB_MODELS.mkdir(parents=True, exist_ok=True)
        fp32 = MODELS / "leaf_fp32.onnx"
        export_onnx(model, fp32)
        report["quantization"] = quantize(fp32)
        ship = MODELS / ("leaf_int8.onnx" if report["quantization"]["shipped"] == "int8" else "leaf_fp32.onnx")
        if ship != fp32:
            # every headline number describes the model the app actually downloads
            report["fp32"] = {k: report[k] for k in ("test", "fieldResult")}
            report["test"] = evaluate(softmax(onnx_logits(ship, test)[0], temperature), ty)
            report["fieldResult"] = evaluate(softmax(onnx_logits(ship, field)[0], temperature), fy)
        (WEB_MODELS / "leaf.onnx").write_bytes(ship.read_bytes())
        meta = {
            "classes": [
                {"id": k, "crop": v[0], "name": v[1], "threat": v[2], "healthy": v[3]} for k, v in CLASSES.items()
            ],
            "input": {"size": SIZE, "mean": list(MEAN), "std": list(STD)},
            "temperature": temperature,
            "unsureBelow": UNSURE_BELOW,
            "rejectClass": "background",
        }
        (WEB_MODELS / "leaf.meta.json").write_text(json.dumps(meta))
        report["sizeMb"] = ship.stat().st_size / 1e6
    print(f"evaluated and exported in {time.time() - t0:.0f}s", flush=True)
    (REPORTS / f"leaf_training{suffix}.json").write_text(json.dumps(report, indent=1))
    print(json.dumps({k: report[k] for k in ("test", "fieldResult", "calibration")}, indent=1)[:2000])
    return report


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=8)
    ap.add_argument("--no-field", action="store_true")
    ap.add_argument("--resume", action="store_true", help="continue from the last epoch checkpoint")
    ap.add_argument("--export-only", action="store_true", help="skip training: evaluate and export saved weights")
    a = ap.parse_args()
    run(epochs=a.epochs, use_field=not a.no_field, resume=a.resume, export_only=a.export_only)
