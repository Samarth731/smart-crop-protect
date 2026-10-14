/**
 * TypeScript port of ml/src/scp_ml/features/yield_features.py. Any change here must keep
 * `yieldFeatures.test.ts` (golden vectors exported from Python) passing.
 */

export type MonthWeather = [number, number, number, number, number, number]; // rain_mm, tmax, tmin, srad, gwet, rh
export type Window = [number, number][]; // [year offset, calendar month]

const R = 0;
const TX = 1;
const TN = 2;
const GW = 4;

const months = (start: [number, number], n: number): Window => {
  const out: Window = [];
  let [dy, m] = start;
  for (let i = 0; i < n; i++) {
    out.push([dy, m]);
    m += 1;
    if (m === 13) {
      dy += 1;
      m = 1;
    }
  }
  return out;
};

export const SEASON_WINDOWS: Record<string, Window> = {
  kharif: months([0, 6], 5),
  rabi: months([0, 11], 5),
  summer: months([1, 3], 4),
  annual: months([0, 6], 12),
};

const CROP_WINDOWS: Record<string, Window> = {
  "cotton|kharif": months([0, 6], 7),
  "pigeonpea|kharif": months([0, 6], 7),
  "sugarcane|kharif": months([0, 3], 12),
  "potato|rabi": months([0, 10], 5),
  "mustard|rabi": months([0, 10], 5),
  "chickpea|rabi": months([0, 10], 6),
};

export const windowFor = (crop: string, season: string): Window =>
  CROP_WINDOWS[`${crop}|${season}`] ?? SEASON_WINDOWS[season] ?? SEASON_WINDOWS.kharif!;

/** Sizes as numpy.array_split(range(n), 3). */
export function phaseSlices(n: number): [number, number][] {
  const base = Math.floor(n / 3);
  const extra = n % 3;
  const out: [number, number][] = [];
  let i = 0;
  for (let k = 0; k < 3; k++) {
    const size = base + (k < extra ? 1 : 0);
    out.push([i, i + size]);
    i += size;
  }
  return out;
}

/**
 * Season weather features. `obs[i]` may contain NaN/null for months not yet available;
 * months at index >= observed are replaced by the climatological normal.
 */
export function weatherFeatures(
  obsIn: (number | null)[][],
  nrm: number[][],
  observed: number,
): Record<string, number> {
  const n = nrm.length;
  const obs = nrm.map((normal, i) =>
    normal.map((v, j) => {
      const o = obsIn[i]?.[j];
      return i < observed && o != null && !Number.isNaN(o) ? o : v;
    }),
  );
  const f: Record<string, number> = {};
  const block = ([a, b]: [number, number], tag: string) => {
    let ro = 0;
    let rc = 0;
    let gw = 0;
    let tx = 0;
    const len = b - a;
    for (let i = a; i < b; i++) {
      ro += obs[i]![R]!;
      rc += nrm[i]![R]!;
      gw += obs[i]![GW]! - nrm[i]![GW]!;
      tx += obs[i]![TX]! - nrm[i]![TX]!;
    }
    f[`lrain${tag}`] = Math.log(Math.min(4, Math.max(0.05, ro / Math.max(rc, 1))));
    f[`gwet${tag}`] = len ? gw / len : Number.NaN;
    f[`tmax${tag}`] = len ? tx / len : Number.NaN;
  };
  block([0, n], "");
  for (const [k, sl] of phaseSlices(n).entries()) block(sl, `_p${k + 1}`);
  let tn = 0;
  let dry = 0;
  let hot = 0;
  for (let i = 0; i < n; i++) {
    tn += obs[i]![TN]! - nrm[i]![TN]!;
    const seen = i < observed;
    if (seen && nrm[i]![R]! >= 30 && obs[i]![R]! < 0.5 * nrm[i]![R]!) dry++;
    if (seen && obs[i]![TX]! > 35 && obs[i]![TX]! - nrm[i]![TX]! > 1) hot++;
  }
  f.tmin = tn / n;
  f.dry_months = dry;
  f.hot_months = hot;
  return f;
}

export function climateFeatures(nrm: number[][]): Record<string, number> {
  const n = nrm.length;
  return {
    clim_rain_log: Math.log1p(nrm.reduce((s, m) => s + m[R]!, 0)),
    clim_tmax: nrm.reduce((s, m) => s + m[TX]!, 0) / n,
    clim_gwet: nrm.reduce((s, m) => s + m[GW]!, 0) / n,
  };
}

export interface FeatureSpec {
  numeric: string[];
  crops: string[];
  seasons: string[];
  states: string[];
  columns: string[];
}

export const BASE_FEATURES = [
  "log_base",
  "base_trend",
  "base_cv",
  "base_n",
  "log_area",
  "state_rel",
] as const;

export interface FeatureInput {
  crop: string;
  season: string;
  state: string;
  base: number[]; // BASE_FEATURES order
  normals12: number[][]; // [12 months][6 vars] district climatology
  obs: (number | null)[][]; // [window months][6 vars]
  observed: number;
}

/** Full model input row in FeatureSpec column order (float64). */
export function buildFeatureRow(spec: FeatureSpec, x: FeatureInput): Float64Array {
  const win = windowFor(x.crop, x.season);
  const nrm = win.map(([, m]) => x.normals12[m - 1]!);
  const values: Record<string, number> = {
    ...Object.fromEntries(BASE_FEATURES.map((k, i) => [k, x.base[i]!])),
    ...climateFeatures(nrm),
    ...Object.fromEntries(
      Object.entries(weatherFeatures(x.obs, nrm, x.observed)).map(([k, v]) => [`d_${k}`, v]),
    ),
    obs_frac: x.observed / win.length,
  };
  const row = new Float64Array(spec.columns.length);
  spec.numeric.forEach((name, i) => {
    const v = values[name];
    if (v === undefined) throw new Error(`missing feature ${name}`);
    row[i] = v;
  });
  let off = spec.numeric.length;
  for (const [vals, v] of [
    [spec.crops, x.crop],
    [spec.seasons, x.season],
    [spec.states, x.state],
  ] as const) {
    const idx = vals.indexOf(v);
    if (idx >= 0) row[off + idx] = 1;
    off += vals.length;
  }
  return row;
}
