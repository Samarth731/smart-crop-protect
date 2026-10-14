/**
 * Dependency-free evaluator for gradient-boosted trees exported by ml/src/scp_ml/export/trees.py.
 * ~70 KB gzipped model instead of a 14 MB ONNX Runtime download - and exact float64 parity
 * with scikit-learn.
 */

export interface TreeJson {
  f: number[];
  t: number[];
  l: number[];
  r: number[];
  m: number[];
  v: number[];
}

export interface EnsembleJson {
  baseline: number;
  trees: TreeJson[];
}

export function predictRow(model: EnsembleJson, x: ArrayLike<number>): number {
  let out = model.baseline;
  for (const tr of model.trees) {
    let node = 0;
    let f = tr.f[0]!;
    while (f >= 0) {
      const v = x[f]!;
      node = Number.isNaN(v)
        ? tr.m[node]
          ? tr.l[node]!
          : tr.r[node]!
        : v <= tr.t[node]!
          ? tr.l[node]!
          : tr.r[node]!;
      f = tr.f[node]!;
    }
    out += tr.v[node]!;
  }
  return out;
}
