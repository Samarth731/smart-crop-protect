/**
 * On-device district yield forecast:
 *   state shard (baseline + climate normals) + NASA POWER season-to-date weather
 *   -> features (yieldFeatures.ts) -> gradient-boosted trees (trees.ts)
 *   -> split-conformal 80 % interval for the crop and season stage.
 */
import { asset, fetchJson } from "../api/http";
import { fetchPowerMonthly } from "../api/power";
import type { CropId, Season } from "../crops";
import { type EnsembleJson, predictRow } from "./trees";
import { BASE_FEATURES, buildFeatureRow, type FeatureSpec, windowFor } from "./yieldFeatures";

export interface YieldShard {
  state: string;
  forecastYear: number;
  districts: Record<
    string,
    { normals: number[][]; series: Record<string, { b: number[]; h: [number, number, number][] }> }
  >;
}

interface Meta extends FeatureSpec {
  intervals: {
    alpha: number;
    pooled: Record<string, [number, number]>;
    by_crop: Record<string, Record<string, [number, number]>>;
  };
  data_years: [number, number];
}

const shards = new Map<string, Promise<YieldShard>>();
export function loadShard(stateKey: string): Promise<YieldShard> {
  let p = shards.get(stateKey);
  if (!p) {
    p = fetchJson<YieldShard>(asset(`data/yield/${stateKey}.json`));
    p.catch(() => shards.delete(stateKey));
    shards.set(stateKey, p);
  }
  return p;
}

let model: Promise<{ meta: Meta; trees: EnsembleJson }> | null = null;
export function loadYieldModel() {
  model ??= Promise.all([
    fetchJson<Meta>(asset("models/yield.meta.json")),
    fetchJson<EnsembleJson>(asset("models/yield.trees.json")),
  ]).then(([meta, trees]) => ({ meta, trees }));
  model.catch(() => {
    model = null;
  });
  return model;
}

export interface Scenario {
  id: "dry" | "normal" | "wet";
  p50: number;
}

export interface YieldForecast {
  crop: CropId;
  season: Season;
  agriYear: number;
  windowStart: string; // "YYYY-MM"
  windowEnd: string;
  observedMonths: number;
  totalMonths: number;
  stage: number; // 0..3 (conformal stage)
  baseline: number; // kg/ha, district normal
  p10: number;
  p50: number;
  p90: number;
  history: { year: number; yield: number; area: number }[];
  rainPctOfNormal: number | null; // season-to-date rainfall vs normal
  soilWetAnom: number | null;
  scenarios: Scenario[];
  weatherError: boolean;
  seasonUsed: Season;
}

export type YieldResult =
  | { ok: true; forecast: YieldForecast }
  | { ok: false; reason: "no-series" | "no-district" };

const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;

/** Agricultural year (Jun-May) whose season window is current or next for `today`. */
export function pickAgriYear(crop: string, season: string, today: Date): number {
  const win = windowFor(crop, season);
  const y = today.getMonth() + 1 >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  const [dy, m] = win[win.length - 1]!;
  const end = new Date(y + dy, m, 0); // last day of the final window month
  const graceDays = 45;
  return today.getTime() > end.getTime() + graceDays * 86400000 ? y + 1 : y;
}

export async function forecastYield(opts: {
  stateKey: string;
  districtCode: number;
  lat: number;
  lon: number;
  crop: CropId;
  season: Season;
  today?: Date;
}): Promise<YieldResult> {
  const today = opts.today ?? new Date();
  const [shard, { meta, trees }] = await Promise.all([loadShard(opts.stateKey), loadYieldModel()]);
  const district = shard.districts[String(opts.districtCode)];
  if (!district) return { ok: false, reason: "no-district" };
  let season: Season = opts.season;
  let series = district.series[`${opts.crop}|${season}`];
  if (!series && district.series[`${opts.crop}|annual`]) {
    season = "annual";
    series = district.series[`${opts.crop}|annual`];
  }
  if (!series) return { ok: false, reason: "no-series" };

  const win = windowFor(opts.crop, season);
  const agriYear = pickAgriYear(opts.crop, season, today);
  const months = win.map(([dy, m]) => ym(agriYear + dy, m));
  const first = win[0]!;
  const last = win[win.length - 1]!;
  const start = new Date(Date.UTC(agriYear + first[0], first[1] - 1, 1));
  const lastDay = new Date(Date.UTC(agriYear + last[0], last[1], 0));
  const end = new Date(Math.min(lastDay.getTime(), today.getTime() - 86400000));

  let obs: (number | null)[][] = win.map(() => [null, null, null, null, null, null]);
  let observed = 0;
  let weatherError = false;
  if (end > start) {
    try {
      const monthly = await fetchPowerMonthly(opts.lat, opts.lon, start, end);
      obs = months.map(
        (k) => (monthly.get(k) as number[] | undefined) ?? [null, null, null, null, null, null],
      );
      while (observed < months.length && monthly.has(months[observed]!)) observed++;
    } catch {
      weatherError = true;
    }
  }

  const input = {
    crop: opts.crop,
    season,
    state: shard.state,
    base: series.b,
    normals12: district.normals,
  };
  const logBase = series.b[BASE_FEATURES.indexOf("log_base")]!;
  const predict = (o: (number | null)[][], k: number) =>
    predictRow(trees, buildFeatureRow(meta, { ...input, obs: o, observed: k }));
  const pred = predict(obs, observed);
  const stage = Math.round((observed / win.length) * 3);
  const [lo, hi] = meta.intervals.by_crop[opts.crop]?.[String(stage)] ??
    meta.intervals.pooled[String(stage)] ?? [-0.3, 0.3];

  // What-if: the remaining months turn out dry / normal / wet.
  const scenarios: Scenario[] = [];
  if (observed < win.length) {
    const nrm = win.map(([, m]) => district.normals[m - 1]!);
    const fill = (rainX: number, gwetD: number, tmaxD: number) =>
      obs.map((o, i) =>
        i < observed
          ? o
          : nrm[i]!.map((v, j) =>
              j === 0 ? v * rainX : j === 4 ? Math.min(1, Math.max(0, v + gwetD)) : j === 1 ? v + tmaxD : v,
            ),
      );
    for (const [id, args] of [
      ["dry", [0.6, -0.06, 1.2]],
      ["normal", [1, 0, 0]],
      ["wet", [1.35, 0.05, -0.5]],
    ] as const) {
      scenarios.push({ id, p50: Math.exp(logBase + predict(fill(args[0], args[1], args[2]), win.length)) });
    }
  }

  // Season-to-date rainfall and soil wetness vs normal, for the explanation.
  let rainPct: number | null = null;
  let gwet: number | null = null;
  if (observed > 0) {
    let ro = 0;
    let rn = 0;
    let gw = 0;
    for (let i = 0; i < observed; i++) {
      const n = district.normals[win[i]![1] - 1]!;
      ro += obs[i]![0] as number;
      rn += n[0]!;
      gw += (obs[i]![4] as number) - n[4]!;
    }
    rainPct = rn > 1 ? Math.round((ro / rn) * 100) : null;
    gwet = gw / observed;
  }

  return {
    ok: true,
    forecast: {
      crop: opts.crop,
      season,
      seasonUsed: season,
      agriYear,
      windowStart: months[0]!,
      windowEnd: months[months.length - 1]!,
      observedMonths: observed,
      totalMonths: win.length,
      stage,
      baseline: Math.exp(logBase),
      p10: Math.exp(logBase + pred + lo),
      p50: Math.exp(logBase + pred),
      p90: Math.exp(logBase + pred + hi),
      history: series.h.map(([year, y, area]) => ({ year, yield: y, area })),
      rainPctOfNormal: rainPct,
      soilWetAnom: gwet,
      scenarios,
      weatherError,
    },
  };
}

export interface SowingForecast {
  crop: CropId;
  p10: number;
  p50: number;
  p90: number;
  baseline: number;
}

/**
 * Forecast at sowing (no season weather yet) for every crop the district reports in `season`.
 * Used by the next-season crop advisor; needs no network beyond the cached shard and model.
 */
export async function sowingForecasts(
  stateKey: string,
  districtCode: number,
  season: Season,
): Promise<SowingForecast[]> {
  const [shard, { meta, trees }] = await Promise.all([loadShard(stateKey), loadYieldModel()]);
  const district = shard.districts[String(districtCode)];
  if (!district) return [];
  const out: SowingForecast[] = [];
  for (const [key, series] of Object.entries(district.series)) {
    const [crop, s] = key.split("|") as [CropId, Season];
    if (s !== season) continue;
    const win = windowFor(crop, s);
    const pred = predictRow(
      trees,
      buildFeatureRow(meta, {
        crop,
        season: s,
        state: shard.state,
        base: series.b,
        normals12: district.normals,
        obs: win.map(() => [null, null, null, null, null, null]),
        observed: 0,
      }),
    );
    const logBase = series.b[BASE_FEATURES.indexOf("log_base")]!;
    const [lo, hi] = meta.intervals.by_crop[crop]?.["0"] ?? meta.intervals.pooled["0"] ?? [-0.3, 0.3];
    out.push({
      crop,
      baseline: Math.exp(logBase),
      p50: Math.exp(logBase + pred),
      p10: Math.exp(logBase + pred + lo),
      p90: Math.exp(logBase + pred + hi),
    });
  }
  return out;
}

/** The season whose window starts next (at least two weeks ahead). */
export function nextSeason(today = new Date()): Season {
  const starts: [Season, number][] = [
    ["kharif", 6],
    ["rabi", 11],
    ["summer", 3],
  ];
  const ahead = (m: number) => {
    const d = new Date(today.getFullYear(), m - 1, 1);
    if (d.getTime() < today.getTime() + 14 * 86400000) d.setFullYear(d.getFullYear() + 1);
    return d.getTime();
  };
  return starts.sort((a, b) => ahead(a[1]) - ahead(b[1]))[0]![0];
}
