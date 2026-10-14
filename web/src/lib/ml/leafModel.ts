/**
 * Leaf disease classifier (MobileNetV3 fine-tuned on Indian and PlantVillage leaf datasets),
 * run on-device with ONNX Runtime Web. Its WebAssembly runtime (~3.7 MB compressed) is bundled by
 * Vite, downloaded the first time a photo is analysed, then cached by the service worker.
 */
import { asset, fetchJson } from "../api/http";

export interface LeafClass {
  id: string;
  crop: string; // app crop id or a non-app crop (e.g. "apple")
  name: string;
  healthy: boolean;
  threat?: string; // knowledge-base threat id
}

interface LeafMeta {
  classes: LeafClass[];
  input: { size: number; mean: [number, number, number]; std: [number, number, number] };
  temperature?: number;
  unsureBelow?: number;
}

export interface LeafPrediction {
  top: { cls: LeafClass; p: number }[];
  unsure: boolean;
}

type Ort = typeof import("onnxruntime-web/wasm");
let ortP: Promise<Ort> | null = null;
let sessionP: Promise<{ session: import("onnxruntime-web").InferenceSession; meta: LeafMeta }> | null = null;

export async function leafModelMeta(): Promise<LeafMeta | null> {
  try {
    return await fetchJson<LeafMeta>(asset("models/leaf.meta.json"), 8000);
  } catch {
    return null;
  }
}

function loadSession() {
  sessionP ??= (async () => {
    const meta = await leafModelMeta();
    if (!meta) throw new Error("leaf model not installed");
    ortP ??= import("onnxruntime-web/wasm");
    const ort = await ortP;
    ort.env.wasm.numThreads = 1;
    const session = await ort.InferenceSession.create(asset("models/leaf.onnx"), {
      executionProviders: ["wasm"],
    });
    return { session, meta };
  })();
  sessionP.catch(() => {
    sessionP = null;
  });
  return sessionP;
}

/** Center-crop, resize and normalise to a CHW float tensor. */
async function preprocess(file: Blob, size: number, mean: number[], std: number[]): Promise<Float32Array> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  bmp.close();
  const { data } = ctx.getImageData(0, 0, size, size);
  const out = new Float32Array(3 * size * size);
  const plane = size * size;
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) out[c * plane + i] = (data[i * 4 + c]! / 255 - mean[c]!) / std[c]!;
  }
  return out;
}

export async function classifyLeaf(file: Blob, cropHint?: string): Promise<LeafPrediction> {
  const { session, meta } = await loadSession();
  const ort = await ortP!;
  const { size, mean, std } = meta.input;
  const x = await preprocess(file, size, mean, std);
  const feeds = { [session.inputNames[0]!]: new ort.Tensor("float32", x, [1, 3, size, size]) };
  const out = await session.run(feeds);
  const logits = out[session.outputNames[0]!]!.data as Float32Array;
  const T = meta.temperature ?? 1;
  const mx = Math.max(...logits);
  const exps = Array.from(logits, (l) => Math.exp((l - mx) / T));
  const z = exps.reduce((a, b) => a + b, 0);
  let probs = exps.map((e) => e / z);
  // Prior from the user's crop: classes of other crops are down-weighted, not removed.
  if (cropHint) {
    probs = probs.map((p, i) => p * (meta.classes[i]!.crop === cropHint ? 1 : 0.15));
    const s = probs.reduce((a, b) => a + b, 0);
    probs = probs.map((p) => p / s);
  }
  const top = probs
    .map((p, i) => ({ cls: meta.classes[i]!, p }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 3);
  return { top, unsure: top[0]!.p < (meta.unsureBelow ?? 0.45) };
}
