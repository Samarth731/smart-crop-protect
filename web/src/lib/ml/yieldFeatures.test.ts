/**
 * Parity with the Python pipeline: golden feature vectors and predictions exported by
 * `python -m scp_ml.export.web_data` must be reproduced exactly by the TypeScript code,
 * and the JSON tree evaluator must match both scikit-learn and the ONNX export.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import golden from "./__fixtures__/yield_golden.json";
import { type EnsembleJson, predictRow } from "./trees";
import { buildFeatureRow, type FeatureSpec, phaseSlices } from "./yieldFeatures";

const pub = (p: string) => JSON.parse(readFileSync(resolve(__dirname, "../../../public", p), "utf8"));
const meta = pub("models/yield.meta.json") as FeatureSpec;
const trees = pub("models/yield.trees.json") as EnsembleJson;

describe("yield features", () => {
  it("splits seasons like numpy.array_split", () => {
    expect(phaseSlices(4)).toEqual([
      [0, 2],
      [2, 3],
      [3, 4],
    ]);
    expect(phaseSlices(5)).toEqual([
      [0, 2],
      [2, 4],
      [4, 5],
    ]);
    expect(phaseSlices(7)).toEqual([
      [0, 3],
      [3, 5],
      [5, 7],
    ]);
    expect(phaseSlices(12)).toEqual([
      [0, 4],
      [4, 8],
      [8, 12],
    ]);
  });

  it("uses the same column order as the model", () => {
    expect(meta.columns).toEqual(golden.columns);
  });

  for (const c of golden.cases) {
    it(`reproduces ${c.crop}/${c.season} district ${c.district} ${c.year} (observed ${c.observed})`, () => {
      const row = buildFeatureRow(meta, {
        crop: c.crop,
        season: c.season,
        state: c.state,
        base: c.base,
        normals12: c.normals,
        obs: c.obs,
        observed: c.observed,
      });
      c.expected.forEach((v, i) => {
        expect(row[i], meta.columns[i]).toBeCloseTo(v, 9);
      });
      const pred = predictRow(trees, row);
      expect(Math.abs(pred - c.prediction)).toBeLessThan(1e-5);
      // ONNX uses float32 thresholds; it agrees to within a small tolerance
      expect(Math.abs(pred - c.predictionOnnx)).toBeLessThan(0.05);
    });
  }
});
