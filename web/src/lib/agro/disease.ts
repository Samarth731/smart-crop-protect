/**
 * Weather-driven pest and disease risk from the hourly forecast.
 *
 * Each model counts "infection hours" - hours with free moisture on the leaf (leaf wetness
 * probability, RH at or near saturation, or rain) inside the pathogen's temperature range -
 * following published infection criteria, e.g. Hutton criteria for potato late blight
 * (AHDB 2017), the Jensen & Boyle groundnut leaf-spot advisory, and rust / blast infection
 * windows from ICAR crop-protection literature. Insect models use the temperature and
 * humidity bands that favour population build-up.
 */
import type { Hour } from "../api/weather";
import type { CropId } from "../crops";
import type { StageId } from "./fao56";

export type RiskLevel = 0 | 1 | 2 | 3; // none, low, moderate, high

export interface DayRisk {
  date: string;
  level: RiskLevel;
  hours: number; // favourable hours that day
}

export interface ThreatRisk {
  threatId: string;
  days: DayRisk[];
  peak: RiskLevel;
  peakDate: string;
  driver: "wetness" | "warm-humid" | "hot-dry" | "cool-humid" | "rain-wind" | "warm";
}

const wet = (h: Hour) => h.leafWet >= 60 || h.rh >= 92 || h.rain > 0.1;
const humid = (h: Hour, rh = 85) => h.rh >= rh || h.rain > 0.1;
const within = (t: number, lo: number, hi: number) => t >= lo && t <= hi;
const count = (hs: Hour[], f: (h: Hour) => boolean) => hs.reduce((n, h) => n + (f(h) ? 1 : 0), 0);
const mean = (hs: Hour[], f: (h: Hour) => number) =>
  hs.reduce((s, h) => s + f(h), 0) / Math.max(1, hs.length);
const levelFor = (n: number, [low, mid, high]: [number, number, number]): RiskLevel =>
  n >= high ? 3 : n >= mid ? 2 : n >= low ? 1 : 0;

interface Model {
  threatId: string;
  crops: CropId[];
  driver: ThreatRisk["driver"];
  stages?: StageId[];
  day: (hs: Hour[], prev: Hour[]) => { level: RiskLevel; hours: number };
}

const wetness =
  (lo: number, hi: number, thresholds: [number, number, number]) =>
  (hs: Hour[]): { level: RiskLevel; hours: number } => {
    const n = count(hs, (h) => wet(h) && within(h.t, lo, hi));
    return { level: levelFor(n, thresholds), hours: n };
  };

const hotDry = (hs: Hour[]) => {
  const n = count(hs, (h) => h.t >= 30 && h.rh <= 60 && h.rain === 0);
  const tmax = Math.max(...hs.map((h) => h.t));
  const level: RiskLevel = tmax >= 32 && n >= 6 ? (n >= 9 ? 3 : 2) : n >= 3 ? 1 : 0;
  return { level, hours: n };
};

const warmBand = (lo: number, hi: number) => (hs: Hour[]) => {
  const m = mean(hs, (h) => h.t);
  const n = count(hs, (h) => within(h.t, lo, hi));
  const level: RiskLevel = within(m, lo, hi) ? (n >= 18 ? 2 : 1) : 0;
  return { level, hours: n };
};

/** Hutton criteria: Tmin >= 10 C and >= 6 h with RH >= 90 %, on two consecutive days. */
const hutton = (hs: Hour[], prev: Hour[]) => {
  const ok = (d: Hour[]) =>
    d.length > 0 && Math.min(...d.map((h) => h.t)) >= 10 && count(d, (h) => h.rh >= 90) >= 6;
  const today = ok(hs);
  const level: RiskLevel = today && ok(prev) ? 3 : today ? 2 : count(hs, (h) => h.rh >= 90) >= 4 ? 1 : 0;
  return { level, hours: count(hs, (h) => h.rh >= 90) };
};

const MODELS: Model[] = [
  { threatId: "rice-blast", crops: ["rice"], driver: "wetness", day: wetness(20, 28, [4, 7, 10]) },
  {
    threatId: "rice-sheath-blight",
    crops: ["rice"],
    driver: "warm-humid",
    stages: ["development", "mid"],
    day: (hs) => {
      const n = count(hs, (h) => humid(h, 85) && within(h.t, 25, 32));
      return { level: levelFor(n, [6, 10, 14]), hours: n };
    },
  },
  {
    threatId: "rice-blb",
    crops: ["rice"],
    driver: "rain-wind",
    day: (hs) => {
      const rain = hs.reduce((s, h) => s + h.rain, 0);
      const gust = Math.max(...hs.map((h) => h.gust));
      const tm = mean(hs, (h) => h.t);
      const level: RiskLevel =
        rain >= 25 && gust >= 30 && within(tm, 24, 34)
          ? 3
          : rain >= 10 && within(tm, 24, 34)
            ? 2
            : rain >= 5
              ? 1
              : 0;
      return { level, hours: count(hs, (h) => h.rain > 0) };
    },
  },
  {
    threatId: "rice-bph",
    crops: ["rice"],
    driver: "warm-humid",
    stages: ["mid", "late"],
    day: (hs) => {
      const tm = mean(hs, (h) => h.t);
      const rh = mean(hs, (h) => h.rh);
      const level: RiskLevel = within(tm, 25, 30) && rh >= 80 ? 2 : within(tm, 24, 32) && rh >= 75 ? 1 : 0;
      return { level, hours: count(hs, (h) => h.rh >= 80) };
    },
  },
  { threatId: "wheat-yellow-rust", crops: ["wheat"], driver: "cool-humid", day: wetness(7, 15, [3, 5, 8]) },
  { threatId: "wheat-brown-rust", crops: ["wheat"], driver: "wetness", day: wetness(15, 25, [3, 6, 9]) },
  {
    threatId: "aphid",
    crops: ["wheat", "mustard", "potato", "chickpea"],
    driver: "cool-humid",
    day: (hs) => {
      const tm = mean(hs, (h) => h.t);
      const cloud = mean(hs, (h) => h.cloud);
      const level: RiskLevel = within(tm, 10, 20) ? (cloud >= 60 ? 3 : 2) : within(tm, 8, 24) ? 1 : 0;
      return { level, hours: count(hs, (h) => within(h.t, 10, 20)) };
    },
  },
  {
    threatId: "maize-faw",
    crops: ["maize", "jowar", "bajra"],
    driver: "warm",
    stages: ["initial", "development", "mid"],
    day: (hs) => {
      const r = warmBand(24, 32)(hs);
      const dry = hs.every((h) => h.rain < 0.5);
      return { level: (r.level && dry ? r.level + 1 : r.level) as RiskLevel, hours: r.hours };
    },
  },
  { threatId: "maize-nlb", crops: ["maize"], driver: "wetness", day: wetness(18, 27, [3, 6, 9]) },
  { threatId: "maize-rust", crops: ["maize"], driver: "cool-humid", day: wetness(16, 23, [3, 6, 9]) },
  {
    threatId: "whitefly",
    crops: ["cotton", "moong", "urad", "soybean", "tomato"],
    driver: "hot-dry",
    day: hotDry,
  },
  {
    threatId: "cotton-pbw",
    crops: ["cotton"],
    driver: "warm",
    stages: ["mid", "late"],
    day: warmBand(25, 32),
  },
  {
    threatId: "cotton-bacterial-blight",
    crops: ["cotton"],
    driver: "rain-wind",
    day: (hs) => {
      const rain = hs.reduce((s, h) => s + h.rain, 0);
      const n = count(hs, (h) => humid(h, 85) && within(h.t, 25, 35));
      return { level: rain >= 10 && n >= 8 ? 3 : rain >= 5 && n >= 6 ? 2 : n >= 6 ? 1 : 0, hours: n };
    },
  },
  { threatId: "cotton-alternaria", crops: ["cotton"], driver: "wetness", day: wetness(24, 30, [4, 7, 10]) },
  {
    threatId: "groundnut-leaf-spot",
    crops: ["groundnut"],
    driver: "wetness",
    day: (hs) => {
      // Jensen & Boyle: hours at RH >= 95 % and their mean temperature
      const wetHrs = hs.filter((h) => h.rh >= 95 || h.leafWet >= 80);
      const tm = mean(wetHrs, (h) => h.t);
      const n = wetHrs.length;
      const level: RiskLevel =
        n >= 6 && within(tm, 21, 28) ? (n >= 10 ? 3 : 2) : n >= 6 && within(tm, 16, 32) ? 1 : n >= 3 ? 1 : 0;
      return { level, hours: n };
    },
  },
  {
    threatId: "groundnut-rust",
    crops: ["groundnut", "soybean"],
    driver: "wetness",
    day: wetness(18, 28, [4, 7, 10]),
  },
  { threatId: "thrips", crops: ["groundnut", "onion", "cotton"], driver: "hot-dry", day: hotDry },
  {
    threatId: "pod-borer",
    crops: ["chickpea", "pigeonpea", "cotton", "tomato"],
    driver: "warm",
    stages: ["mid", "late"],
    day: warmBand(20, 30),
  },
  {
    threatId: "chickpea-ascochyta",
    crops: ["chickpea"],
    driver: "cool-humid",
    day: wetness(15, 25, [4, 7, 10]),
  },
  {
    threatId: "powdery-mildew",
    crops: ["moong", "urad", "pigeonpea", "tomato", "onion"],
    driver: "cool-humid",
    day: (hs) => {
      const dayDry = hs.filter((h) => h.isDay).every((h) => h.rh < 75);
      const nightHumid = count(
        hs.filter((h) => !h.isDay),
        (h) => h.rh >= 85,
      );
      const tm = mean(hs, (h) => h.t);
      const level: RiskLevel =
        dayDry && nightHumid >= 5 && within(tm, 18, 28) ? (nightHumid >= 8 ? 3 : 2) : 0;
      return { level, hours: nightHumid };
    },
  },
  { threatId: "mustard-alternaria", crops: ["mustard"], driver: "wetness", day: wetness(18, 27, [5, 8, 11]) },
  {
    threatId: "mustard-white-rust",
    crops: ["mustard"],
    driver: "cool-humid",
    day: wetness(10, 20, [3, 6, 9]),
  },
  {
    threatId: "bajra-downy-mildew",
    crops: ["bajra"],
    driver: "wetness",
    stages: ["initial", "development"],
    day: (hs) => {
      const n = count(hs, (h) => h.rh >= 90 && within(h.t, 20, 30));
      return { level: levelFor(n, [4, 7, 10]), hours: n };
    },
  },
  {
    threatId: "jowar-grain-mold",
    crops: ["jowar", "bajra"],
    driver: "wetness",
    stages: ["late"],
    day: (hs) => {
      const rain = hs.reduce((s, h) => s + h.rain, 0);
      const n = count(hs, (h) => h.rh >= 90);
      return { level: rain >= 5 && n >= 8 ? 3 : rain >= 1 || n >= 10 ? 2 : n >= 6 ? 1 : 0, hours: n };
    },
  },
  {
    threatId: "sugarcane-red-rot",
    crops: ["sugarcane"],
    driver: "warm-humid",
    day: (hs) => {
      const rain = hs.reduce((s, h) => s + h.rain, 0);
      const n = count(hs, (h) => humid(h, 85) && within(h.t, 25, 32));
      return { level: rain >= 20 && n >= 12 ? 2 : n >= 14 ? 1 : 0, hours: n };
    },
  },
  { threatId: "late-blight", crops: ["potato", "tomato"], driver: "cool-humid", day: hutton },
  {
    threatId: "early-blight",
    crops: ["potato", "tomato"],
    driver: "wetness",
    day: wetness(22, 30, [4, 6, 9]),
  },
  {
    threatId: "onion-purple-blotch",
    crops: ["onion"],
    driver: "warm-humid",
    day: wetness(20, 30, [5, 8, 11]),
  },
  { threatId: "tomato-septoria", crops: ["tomato"], driver: "wetness", day: wetness(18, 27, [5, 8, 12]) },
  {
    threatId: "yellow-mosaic",
    crops: ["moong", "urad", "soybean"],
    driver: "hot-dry",
    stages: ["initial", "development"],
    day: hotDry,
  },
  { threatId: "spider-mites", crops: ["tomato", "cotton", "pigeonpea"], driver: "hot-dry", day: hotDry },
];

/** Group hours into local calendar days. */
export function hoursByDay(hours: Hour[]): Map<string, Hour[]> {
  const m = new Map<string, Hour[]>();
  for (const h of hours) {
    const d = h.time.slice(0, 10);
    const arr = m.get(d);
    if (arr) arr.push(h);
    else m.set(d, [h]);
  }
  return m;
}

/**
 * Risk for every threat relevant to the crop, from yesterday through the forecast horizon.
 * `stage` filters stage-specific threats (e.g. pod borer only matters at flowering/podding).
 */
export function diseaseRisk(
  crop: CropId,
  stage: StageId,
  hours: Hour[],
  today: string,
  horizonDays = 7,
): ThreatRisk[] {
  const days = [...hoursByDay(hours).entries()].filter(([, hs]) => hs.length >= 20);
  const start = Math.max(
    0,
    days.findIndex(([d]) => d === today),
  );
  const window = days.slice(Math.max(0, start - 1), start + horizonDays);
  const results: ThreatRisk[] = [];
  for (const m of MODELS) {
    if (!m.crops.includes(crop)) continue;
    if (m.stages && !m.stages.includes(stage)) continue;
    const series: DayRisk[] = window.map(([date, hs]) => {
      const idx = days.findIndex(([d]) => d === date);
      const prev = idx > 0 ? days[idx - 1]![1] : [];
      const r = m.day(hs, prev);
      return { date, level: r.level, hours: r.hours };
    });
    const ahead = series.filter((d) => d.date >= today);
    const peakDay = ahead.reduce((a, b) => (b.level > a.level ? b : a), ahead[0] ?? series[0]!);
    if (!peakDay) continue;
    results.push({
      threatId: m.threatId,
      days: series,
      peak: peakDay.level,
      peakDate: peakDay.date,
      driver: m.driver,
    });
  }
  return results.sort((a, b) => b.peak - a.peak || a.peakDate.localeCompare(b.peakDate));
}

export const MODELLED_THREATS = new Set(MODELS.map((m) => m.threatId));
