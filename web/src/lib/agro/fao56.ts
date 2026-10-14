/**
 * Crop development and root-zone soil-water balance, after FAO Irrigation & Drainage Paper 56
 * (Allen, Pereira, Raes & Smith, 1998), chapters 6 and 8:
 *
 *   Dr[i] = Dr[i-1] - (P - RO)[i] - I[i] + ETc,adj[i]        0 <= Dr <= TAW
 *   TAW = 1000 (theta_FC - theta_WP) Zr ;  RAW = p TAW ;  Ks = (TAW - Dr) / ((1 - p) TAW)
 *
 * Runoff uses the USDA-SCS curve-number method; the starting depletion comes from the
 * forecast model's root-zone soil moisture so the balance does not assume a full profile.
 */
import type { CropInfo } from "../crops";

export type StageId = "presowing" | "initial" | "development" | "mid" | "late" | "harvest";

export interface StageInfo {
  das: number; // days after sowing
  stage: StageId;
  stageIndex: number; // 0..3 within the four FAO stages, -1 before sowing, 4 after
  dayInStage: number;
  stageLength: number;
  progress: number; // 0..1 of the whole season
  harvestDate: Date;
  nextStageDate: Date | null;
  kc: number;
  rootDepth: number;
}

const DAY = 86400000;
const ROOT_MIN = 0.15;

export const parseDate = (iso: string) => new Date(`${iso}T00:00:00`);
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY);

export function kcAt(crop: CropInfo, das: number): number {
  const [l1, l2, l3, l4] = crop.stages;
  const { ini, mid, end } = crop.kc;
  if (das < 0) return 0;
  if (das <= l1) return ini;
  if (das <= l1 + l2) return ini + ((das - l1) / l2) * (mid - ini);
  if (das <= l1 + l2 + l3) return mid;
  if (das <= l1 + l2 + l3 + l4) return mid + ((das - l1 - l2 - l3) / l4) * (end - mid);
  return 0;
}

export function rootDepthAt(crop: CropInfo, das: number): number {
  const [l1, l2] = crop.stages;
  if (das <= 0) return ROOT_MIN;
  return ROOT_MIN + (crop.rootMax - ROOT_MIN) * Math.min(1, das / (l1 + l2));
}

export function stageAt(crop: CropInfo, sowing: Date, on: Date): StageInfo {
  const das = daysBetween(sowing, on);
  const total = crop.stages.reduce((a, b) => a + b, 0);
  const harvestDate = addDays(sowing, total);
  const base = { das, harvestDate, kc: kcAt(crop, das), rootDepth: rootDepthAt(crop, das) };
  if (das < 0) {
    return {
      ...base,
      stage: "presowing",
      stageIndex: -1,
      dayInStage: das,
      stageLength: 0,
      progress: 0,
      nextStageDate: sowing,
    };
  }
  if (das >= total) {
    return {
      ...base,
      stage: "harvest",
      stageIndex: 4,
      dayInStage: das - total,
      stageLength: 0,
      progress: 1,
      nextStageDate: null,
    };
  }
  const ids: StageId[] = ["initial", "development", "mid", "late"];
  let start = 0;
  for (let i = 0; i < 4; i++) {
    const len = crop.stages[i]!;
    if (das < start + len) {
      return {
        ...base,
        stage: ids[i]!,
        stageIndex: i,
        dayInStage: das - start,
        stageLength: len,
        progress: das / total,
        nextStageDate: addDays(sowing, start + len),
      };
    }
    start += len;
  }
  throw new Error("unreachable");
}

export interface WaterDay {
  date: string;
  forecast: boolean;
  et0: number;
  kc: number;
  etc: number; // actual crop evapotranspiration after stress (mm)
  rain: number;
  effRain: number;
  irrigation: number;
  depletion: number; // root-zone depletion at end of day (mm below field capacity)
  taw: number;
  raw: number;
  ks: number;
}

export interface WaterInput {
  crop: CropInfo;
  sowing: Date;
  awcMmPerM: number;
  clayPct: number;
  days: { date: string; et0: number; rain: number; soil: number }[];
  todayIndex: number;
  soilFc?: number;
  soilWp?: number;
  irrigationLog?: { date: string; mm: number }[];
}

/** USDA-SCS curve-number runoff for a daily rainfall depth (mm). */
export function runoffMm(p: number, clayPct: number): number {
  const cn = clayPct >= 40 ? 82 : clayPct >= 20 ? 76 : 68;
  const s = 25400 / cn - 254;
  const ia = 0.2 * s;
  return p > ia ? (p - ia) ** 2 / (p - ia + s) : 0;
}

export function waterBalance(input: WaterInput): WaterDay[] {
  const { crop, sowing, awcMmPerM, clayPct, days } = input;
  const irr = new Map((input.irrigationLog ?? []).map((e) => [e.date, e.mm]));
  const out: WaterDay[] = [];
  let dr = Number.NaN;
  days.forEach((d, i) => {
    const das = daysBetween(sowing, parseDate(d.date));
    const kc = das >= 0 ? kcAt(crop, das) : 0;
    const zr = rootDepthAt(crop, das);
    const taw = awcMmPerM * zr;
    const etcPot = kc * d.et0;
    const p = Math.min(0.8, Math.max(0.1, crop.p + 0.04 * (5 - etcPot)));
    const raw = p * taw;
    if (Number.isNaN(dr)) dr = initialDepletion(d.soil, taw, input.soilFc, input.soilWp);
    // effective rain: losses to runoff, and very light showers mostly evaporate from the canopy
    const effRain = d.rain < 2 ? d.rain * 0.3 : Math.max(0, d.rain - runoffMm(d.rain, clayPct));
    const irrigation = irr.get(d.date) ?? 0;
    const ks = dr > raw ? Math.max(0, (taw - dr) / ((1 - p) * taw)) : 1;
    const etc = etcPot * ks;
    dr = Math.min(taw, Math.max(0, dr - effRain - irrigation + etc));
    out.push({
      date: d.date,
      forecast: i > input.todayIndex,
      et0: d.et0,
      kc,
      etc,
      rain: d.rain,
      effRain,
      irrigation,
      depletion: dr,
      taw,
      raw,
      ks,
    });
  });
  return out;
}

/** Depletion implied by modelled volumetric soil moisture, relative to the field's FC/WP. */
export function initialDepletion(theta: number, taw: number, fc = 0.32, wp = 0.14): number {
  if (!Number.isFinite(theta)) return taw * 0.4;
  const rel = (fc - theta) / Math.max(0.05, fc - wp);
  return Math.min(1, Math.max(0, rel)) * taw;
}

export type IrrigationAdvice =
  | { kind: "not-sown" | "harvest" }
  | { kind: "now"; netMm: number; grossMm: number; litresPerAcre: number }
  | { kind: "by"; date: string; netMm: number; grossMm: number; litresPerAcre: number }
  | { kind: "hold-rain"; rainMm: number; days: number }
  | { kind: "ok"; nextCheck: string; depletionPct: number }
  | { kind: "rainfed-stress"; date: string }
  | { kind: "rice"; status: "flooded" | "awd-irrigate" | "drain"; dryDays: number };

export const EFFICIENCY = { drip: 0.9, sprinkler: 0.75, flood: 0.6, rainfed: 1 } as const;
const LITRES_PER_MM_ACRE = 4046.86;

export function irrigationAdvice(
  series: WaterDay[],
  todayIndex: number,
  stage: StageInfo,
  method: keyof typeof EFFICIENCY,
  crop: CropInfo,
): IrrigationAdvice {
  if (stage.stage === "presowing") return { kind: "not-sown" };
  if (stage.stage === "harvest") return { kind: "harvest" };
  if (crop.flooded) return riceAdvice(series, todayIndex, stage);
  const eff = EFFICIENCY[method];
  const amount = (dr: number) => {
    const net = Math.round(dr);
    const gross = Math.round(dr / eff);
    return {
      netMm: net,
      grossMm: gross,
      litresPerAcre: Math.round((gross * LITRES_PER_MM_ACRE) / 1000) * 1000,
    };
  };
  const ahead = series.slice(todayIndex);
  const rain3 = ahead.slice(0, 3).reduce((s, d) => s + d.rain, 0);
  const today = ahead[0];
  if (!today) return { kind: "ok", nextCheck: "", depletionPct: 0 };
  const stressDay = ahead.findIndex((d) => d.depletion > d.raw);
  if (method === "rainfed") {
    if (stressDay >= 0 && stressDay <= 7) return { kind: "rainfed-stress", date: ahead[stressDay]!.date };
    return { kind: "ok", nextCheck: ahead[Math.min(3, ahead.length - 1)]!.date, depletionPct: pct(today) };
  }
  if (today.depletion > today.raw) {
    if (rain3 >= 20) return { kind: "hold-rain", rainMm: Math.round(rain3), days: 3 };
    return { kind: "now", ...amount(today.depletion) };
  }
  if (stressDay > 0 && stressDay <= 7) {
    const before = ahead[stressDay]!;
    const rainBefore = ahead.slice(0, stressDay + 1).reduce((s, d) => s + d.rain, 0);
    if (rainBefore >= 20) return { kind: "hold-rain", rainMm: Math.round(rainBefore), days: stressDay + 1 };
    return { kind: "by", date: before.date, ...amount(before.depletion) };
  }
  return { kind: "ok", nextCheck: ahead[Math.min(3, ahead.length - 1)]!.date, depletionPct: pct(today) };
}

const pct = (d: WaterDay) => Math.round((d.depletion / Math.max(1, d.taw)) * 100);

/**
 * Paddy: keep shallow standing water, or follow Alternate Wetting and Drying (AWD, IRRI):
 * re-flood ~5 cm once the field has had no effective rain for several days. Drain 10-15
 * days before harvest.
 */
function riceAdvice(series: WaterDay[], todayIndex: number, stage: StageInfo): IrrigationAdvice {
  const today = series[todayIndex];
  const daysToHarvest = today ? daysBetween(parseDate(today.date), stage.harvestDate) : 99;
  if (stage.stage === "late" && daysToHarvest <= 15) return { kind: "rice", status: "drain", dryDays: 0 };
  let dry = 0;
  let water = 0;
  for (let i = todayIndex; i >= 0; i--) {
    const d = series[i]!;
    water += d.effRain - d.etc - 3; // ~3 mm/day seepage and percolation in puddled soil
    if (d.effRain >= 15) break;
    dry++;
  }
  const status = dry >= 5 && water < -25 ? "awd-irrigate" : "flooded";
  return { kind: "rice", status, dryDays: dry };
}
