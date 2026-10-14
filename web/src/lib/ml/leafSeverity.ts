/**
 * Leaf disease severity by colour segmentation (the approach behind tools such as Leaf Doctor):
 *   1. pixels are classified in HSV as green tissue, chlorotic (yellow), necrotic (brown/dark)
 *      or powdery (white, low saturation);
 *   2. the leaf is the largest connected region of plant-coloured pixels after a
 *      morphological closing, which also absorbs lesions inside the leaf;
 *   3. severity = damaged pixels / leaf pixels.
 * Runs entirely on-device in a few milliseconds and also produces a damage map overlay.
 */

export interface Severity {
  leafFraction: number; // share of the photo covered by the leaf
  healthy: number;
  chlorotic: number;
  necrotic: number;
  powdery: number;
  severity: number; // 0..1 of leaf area damaged
  overlay: string; // data URL of the damage map
  width: number;
  height: number;
}

enum Px {
  Background = 0,
  Green = 1,
  Yellow = 2,
  Brown = 3,
  Powder = 4,
}

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx];
}

export function classifyPixel(r: number, g: number, b: number): Px {
  const [h, s, v] = rgbToHsv(r / 255, g / 255, b / 255);
  if (s < 0.14 && v > 0.8) return Px.Powder;
  if (v < 0.1) return Px.Background;
  if (h >= 65 && h <= 175 && s >= 0.18) return Px.Green;
  if (h >= 42 && h < 65 && s >= 0.25 && v >= 0.35) return Px.Yellow;
  if (((h >= 8 && h < 42) || h >= 340) && s >= 0.2 && v < 0.85) return Px.Brown;
  if (v < 0.32 && s >= 0.12 && h >= 8 && h < 80) return Px.Brown;
  return Px.Background;
}

function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = 0;
      for (let dy = -r; dy <= r && !on; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < w && mask[yy * w + xx]) {
            on = 1;
            break;
          }
        }
      }
      out[y * w + x] = on;
    }
  }
  return out;
}

function erode(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const inv = mask.map((v) => (v ? 0 : 1));
  return dilate(inv, w, h, r).map((v) => (v ? 0 : 1));
}

/** Keep only the largest 4-connected component. */
function largestComponent(mask: Uint8Array, w: number, h: number): Uint8Array {
  const label = new Int32Array(mask.length);
  let best = 0;
  let bestSize = 0;
  let next = 1;
  const stack: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || label[i]) continue;
    let size = 0;
    stack.push(i);
    label[i] = next;
    while (stack.length) {
      const k = stack.pop()!;
      size++;
      const x = k % w;
      const y = (k - x) / w;
      const nbrs = [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1];
      for (const n of nbrs) {
        if (n >= 0 && mask[n] && !label[n]) {
          label[n] = next;
          stack.push(n);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = next;
    }
    next++;
  }
  return label.map((l) => (l === best && best > 0 ? 1 : 0)) as unknown as Uint8Array;
}

export function analyzePixels(data: Uint8ClampedArray, w: number, h: number) {
  const cls = new Uint8Array(w * h);
  const plant = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const c = classifyPixel(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!);
    cls[i] = c;
    plant[i] = c === Px.Green || c === Px.Yellow || c === Px.Brown ? 1 : 0;
  }
  const r = Math.max(1, Math.round(Math.min(w, h) / 80));
  const leaf = largestComponent(erode(dilate(plant, w, h, r), w, h, r), w, h);
  const counts = [0, 0, 0, 0, 0];
  let area = 0;
  for (let i = 0; i < w * h; i++) {
    if (!leaf[i]) continue;
    area++;
    counts[cls[i]!]! += 1;
  }
  return { cls, leaf, area, counts };
}

export async function analyzeLeaf(file: Blob, maxSide = 384): Promise<Severity> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const img = ctx.getImageData(0, 0, w, h);
  const { cls, leaf, area, counts } = analyzePixels(img.data, w, h);

  // damage map: dim the background, tint lesions
  const out = ctx.createImageData(w, h);
  const tint: Record<number, [number, number, number]> = {
    [Px.Yellow]: [245, 176, 25],
    [Px.Brown]: [208, 59, 59],
    [Px.Powder]: [59, 127, 196],
  };
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const [r, g, b] = [img.data[o]!, img.data[o + 1]!, img.data[o + 2]!];
    if (!leaf[i]) {
      const grey = (r + g + b) / 3;
      out.data[o] = grey * 0.35;
      out.data[o + 1] = grey * 0.35;
      out.data[o + 2] = grey * 0.35;
    } else {
      const t = tint[cls[i]!];
      out.data[o] = t ? r * 0.25 + t[0] * 0.75 : r;
      out.data[o + 1] = t ? g * 0.25 + t[1] * 0.75 : g;
      out.data[o + 2] = t ? b * 0.25 + t[2] * 0.75 : b;
    }
    out.data[o + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  const leafArea = Math.max(1, area);
  const damaged = counts[Px.Yellow]! + counts[Px.Brown]! + counts[Px.Powder]!;
  return {
    leafFraction: area / (w * h),
    healthy: counts[Px.Green]! / leafArea,
    chlorotic: counts[Px.Yellow]! / leafArea,
    necrotic: counts[Px.Brown]! / leafArea,
    powdery: counts[Px.Powder]! / leafArea,
    severity: damaged / leafArea,
    overlay: canvas.toDataURL("image/jpeg", 0.85),
    width: w,
    height: h,
  };
}

export async function thumbnail(file: Blob, side = 96): Promise<string> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const s = Math.min(bmp.width, bmp.height);
  const c = document.createElement("canvas");
  c.width = side;
  c.height = side;
  c.getContext("2d")!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, side, side);
  bmp.close();
  return c.toDataURL("image/jpeg", 0.7);
}
