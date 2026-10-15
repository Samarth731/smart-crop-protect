import { describe, expect, it } from "vitest";
import { analyzePixels, classifyPixel, rgbToHsv } from "./leafSeverity";

const GREEN = [60, 140, 50];
const YELLOW = [210, 190, 40];
const BROWN = [120, 70, 30];
const SOIL_GREY = [128, 128, 128];

/** w x h RGBA image filled by a per-pixel colour function. */
function image(w: number, h: number, color: (x: number, y: number) => number[]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = color(x, y);
      data.set([r!, g!, b!, 255], (y * w + x) * 4);
    }
  }
  return data;
}

describe("leaf severity colour segmentation", () => {
  it("converts RGB to HSV", () => {
    const [h, s, v] = rgbToHsv(0, 1, 0);
    expect(h).toBeCloseTo(120);
    expect(s).toBeCloseTo(1);
    expect(v).toBeCloseTo(1);
  });

  it("classifies leaf tissue colours", () => {
    expect(classifyPixel(GREEN[0]!, GREEN[1]!, GREEN[2]!)).toBe(1);
    expect(classifyPixel(YELLOW[0]!, YELLOW[1]!, YELLOW[2]!)).toBe(2);
    expect(classifyPixel(BROWN[0]!, BROWN[1]!, BROWN[2]!)).toBe(3);
    expect(classifyPixel(250, 250, 248)).toBe(4);
    expect(classifyPixel(SOIL_GREY[0]!, SOIL_GREY[1]!, SOIL_GREY[2]!)).toBe(0);
  });

  it("measures the damaged share of a leaf and ignores the background", () => {
    // a 40x40 leaf in the middle of a grey background; its left quarter is brown lesion
    const w = 80;
    const h = 80;
    const data = image(w, h, (x, y) => {
      const inLeaf = x >= 20 && x < 60 && y >= 20 && y < 60;
      if (!inLeaf) return SOIL_GREY;
      return x < 30 ? BROWN : GREEN;
    });
    const { area, counts } = analyzePixels(data, w, h);
    expect(area).toBeGreaterThan(1500);
    expect(area).toBeLessThan(1800);
    const severity = (counts[2]! + counts[3]! + counts[4]!) / area;
    expect(severity).toBeGreaterThan(0.2);
    expect(severity).toBeLessThan(0.3);
  });

  it("keeps only the largest leaf", () => {
    const w = 60;
    const h = 60;
    const data = image(w, h, (x, y) => ((x < 30 && y < 30) || (x > 52 && y > 52) ? GREEN : SOIL_GREY));
    const { area } = analyzePixels(data, w, h);
    expect(area).toBeGreaterThan(800);
    expect(area).toBeLessThan(1000);
  });
});
