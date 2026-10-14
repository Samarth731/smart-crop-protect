/**
 * Crop catalogue: names, seasons, FAO-56 water parameters and support prices.
 *
 * Crop coefficients (Kc) and stage lengths follow FAO Irrigation & Drainage Paper 56
 * (Allen et al., 1998), Tables 11-12 and 22, with stage lengths adjusted to common Indian
 * varieties. MSPs are the Government of India's announced Minimum Support Prices.
 */

export type Lang = "en" | "hi" | "gu" | "mr";
export type Season = "kharif" | "rabi" | "summer" | "annual";
export type CropId =
  | "rice"
  | "wheat"
  | "maize"
  | "cotton"
  | "groundnut"
  | "soybean"
  | "chickpea"
  | "pigeonpea"
  | "mustard"
  | "bajra"
  | "jowar"
  | "sugarcane"
  | "moong"
  | "urad"
  | "potato"
  | "onion"
  | "tomato";

export interface CropInfo {
  id: CropId;
  name: Record<Lang, string>;
  group: "cereal" | "pulse" | "oilseed" | "fibre" | "cash" | "vegetable";
  seasons: Season[];
  /** typical sowing months (1-12) per season, used to suggest a sowing date */
  sowing: Partial<Record<Season, number[]>>;
  /** FAO-56 crop coefficients */
  kc: { ini: number; mid: number; end: number };
  /** FAO-56 stage lengths in days: initial, development, mid-season, late season */
  stages: [number, number, number, number];
  /** effective root depth at full cover (m) and at sowing */
  rootMax: number;
  /** soil water depletion fraction p before stress (FAO-56 Table 22) */
  p: number;
  /** soil pH range the crop tolerates well (FAO EcoCrop optimum) */
  ph: [number, number];
  /** yield model available (district statistics exist) */
  yieldModel: boolean;
  /** price series key in prices.json */
  priceKey?: string;
  msp?: { price: number; season: string; note?: string };
  /** paddy is grown in standing water: irrigation advice differs */
  flooded?: boolean;
  unit: "kg/ha";
  /**
   * Statistics report rice as milled rice and cotton as lint, but farmers sell paddy and
   * kapas: multiply reported yield by `factor` to get the marketable produce.
   */
  sold?: { factor: number; label: Record<Lang, string> };
  /** Farmers' share of the retail price (RBI 2024) for crops priced from retail data. */
  farmGateShare?: number;
}

const KMS = "Kharif 2026-27";
const RMS = "Rabi 2027-28";

export const CROPS: Record<CropId, CropInfo> = {
  rice: {
    id: "rice",
    name: { en: "Rice (paddy)", hi: "धान", gu: "ડાંગર", mr: "भात" },
    group: "cereal",
    seasons: ["kharif", "rabi", "summer"],
    sowing: { kharif: [6, 7], rabi: [11, 12], summer: [2, 3] },
    kc: { ini: 1.05, mid: 1.2, end: 0.75 },
    stages: [20, 30, 45, 25],
    rootMax: 0.5,
    p: 0.2,
    ph: [5.0, 7.5],
    yieldModel: true,
    priceKey: "rice",
    msp: { price: 2441, season: KMS, note: "Common paddy; Grade A ₹2,461" },
    flooded: true,
    unit: "kg/ha",
    sold: { factor: 1 / 0.67, label: { en: "paddy", hi: "धान", gu: "ડાંગર", mr: "भात" } },
  },
  wheat: {
    id: "wheat",
    name: { en: "Wheat", hi: "गेहूं", gu: "ઘઉં", mr: "गहू" },
    group: "cereal",
    seasons: ["rabi"],
    sowing: { rabi: [11, 12] },
    kc: { ini: 0.4, mid: 1.15, end: 0.3 },
    stages: [15, 25, 50, 30],
    rootMax: 1.2,
    p: 0.55,
    ph: [6.0, 7.5],
    yieldModel: true,
    priceKey: "wheat",
    msp: { price: 2610, season: RMS },
    unit: "kg/ha",
  },
  maize: {
    id: "maize",
    name: { en: "Maize", hi: "मक्का", gu: "મકાઈ", mr: "मका" },
    group: "cereal",
    seasons: ["kharif", "rabi", "summer"],
    sowing: { kharif: [6, 7], rabi: [10, 11], summer: [2, 3] },
    kc: { ini: 0.3, mid: 1.2, end: 0.5 },
    stages: [20, 35, 40, 25],
    rootMax: 1.0,
    p: 0.55,
    ph: [5.5, 7.5],
    yieldModel: true,
    msp: { price: 2410, season: KMS },
    unit: "kg/ha",
  },
  cotton: {
    id: "cotton",
    name: { en: "Cotton", hi: "कपास", gu: "કપાસ", mr: "कापूस" },
    group: "fibre",
    seasons: ["kharif"],
    sowing: { kharif: [5, 6] },
    kc: { ini: 0.35, mid: 1.18, end: 0.6 },
    stages: [30, 50, 55, 45],
    rootMax: 1.2,
    p: 0.65,
    ph: [5.8, 8.0],
    yieldModel: true,
    msp: { price: 8267, season: KMS, note: "Medium staple kapas; long staple ₹8,667" },
    unit: "kg/ha",
    sold: {
      factor: 1 / 0.34,
      label: { en: "kapas", hi: "कपास (बिनौले सहित)", gu: "કપાસ", mr: "कापूस (सरकी सह)" },
    },
  },
  groundnut: {
    id: "groundnut",
    name: { en: "Groundnut", hi: "मूंगफली", gu: "મગફળી", mr: "भुईमूग" },
    group: "oilseed",
    seasons: ["kharif", "rabi", "summer"],
    sowing: { kharif: [6, 7], rabi: [10, 11], summer: [1, 2] },
    kc: { ini: 0.4, mid: 1.15, end: 0.6 },
    stages: [25, 35, 45, 25],
    rootMax: 0.6,
    p: 0.5,
    ph: [5.5, 7.0],
    yieldModel: true,
    priceKey: "groundnut",
    msp: { price: 7517, season: KMS, note: "In-shell pods" },
    unit: "kg/ha",
  },
  soybean: {
    id: "soybean",
    name: { en: "Soybean", hi: "सोयाबीन", gu: "સોયાબીન", mr: "सोयाबीन" },
    group: "oilseed",
    seasons: ["kharif"],
    sowing: { kharif: [6, 7] },
    kc: { ini: 0.4, mid: 1.15, end: 0.5 },
    stages: [15, 25, 45, 20],
    rootMax: 0.8,
    p: 0.5,
    ph: [6.0, 7.5],
    yieldModel: true,
    priceKey: "soybean",
    msp: { price: 5708, season: KMS, note: "Yellow" },
    unit: "kg/ha",
  },
  chickpea: {
    id: "chickpea",
    name: { en: "Chickpea (gram)", hi: "चना", gu: "ચણા", mr: "हरभरा" },
    group: "pulse",
    seasons: ["rabi"],
    sowing: { rabi: [10, 11] },
    kc: { ini: 0.4, mid: 1.0, end: 0.35 },
    stages: [20, 30, 45, 25],
    rootMax: 0.8,
    p: 0.5,
    ph: [6.0, 8.0],
    yieldModel: true,
    msp: { price: 5958, season: RMS },
    unit: "kg/ha",
  },
  pigeonpea: {
    id: "pigeonpea",
    name: { en: "Pigeon pea (tur)", hi: "अरहर (तुअर)", gu: "તુવેર", mr: "तूर" },
    group: "pulse",
    seasons: ["kharif"],
    sowing: { kharif: [6, 7] },
    kc: { ini: 0.4, mid: 1.15, end: 0.35 },
    stages: [20, 40, 70, 40],
    rootMax: 1.0,
    p: 0.5,
    ph: [5.5, 7.5],
    yieldModel: true,
    priceKey: "pigeonpea",
    msp: { price: 8450, season: KMS },
    unit: "kg/ha",
  },
  mustard: {
    id: "mustard",
    name: { en: "Mustard", hi: "सरसों", gu: "રાઈ", mr: "मोहरी" },
    group: "oilseed",
    seasons: ["rabi"],
    sowing: { rabi: [10, 11] },
    kc: { ini: 0.35, mid: 1.05, end: 0.35 },
    stages: [25, 35, 45, 25],
    rootMax: 1.0,
    p: 0.6,
    ph: [6.0, 7.5],
    yieldModel: true,
    priceKey: "mustard",
    msp: { price: 6613, season: RMS, note: "Rapeseed & mustard" },
    unit: "kg/ha",
  },
  bajra: {
    id: "bajra",
    name: { en: "Pearl millet (bajra)", hi: "बाजरा", gu: "બાજરી", mr: "बाजरी" },
    group: "cereal",
    seasons: ["kharif", "summer"],
    sowing: { kharif: [6, 7], summer: [2, 3] },
    kc: { ini: 0.3, mid: 1.0, end: 0.3 },
    stages: [15, 20, 30, 20],
    rootMax: 1.0,
    p: 0.55,
    ph: [5.5, 8.0],
    yieldModel: true,
    msp: { price: 2900, season: KMS },
    unit: "kg/ha",
  },
  jowar: {
    id: "jowar",
    name: { en: "Sorghum (jowar)", hi: "ज्वार", gu: "જુવાર", mr: "ज्वारी" },
    group: "cereal",
    seasons: ["kharif", "rabi"],
    sowing: { kharif: [6, 7], rabi: [9, 10] },
    kc: { ini: 0.3, mid: 1.05, end: 0.55 },
    stages: [20, 30, 35, 25],
    rootMax: 1.0,
    p: 0.55,
    ph: [5.5, 8.0],
    yieldModel: true,
    msp: { price: 4023, season: KMS, note: "Hybrid; Maldandi ₹4,073" },
    unit: "kg/ha",
  },
  sugarcane: {
    id: "sugarcane",
    name: { en: "Sugarcane", hi: "गन्ना", gu: "શેરડી", mr: "ऊस" },
    group: "cash",
    seasons: ["kharif"],
    sowing: { kharif: [2, 3, 10] },
    kc: { ini: 0.4, mid: 1.25, end: 0.75 },
    stages: [30, 60, 180, 95],
    rootMax: 1.2,
    p: 0.65,
    ph: [6.0, 7.5],
    yieldModel: true,
    priceKey: "sugarcane",
    msp: { price: 355, season: "Sugar season 2025-26", note: "Fair & Remunerative Price (FRP), not MSP" },
    unit: "kg/ha",
  },
  moong: {
    id: "moong",
    name: { en: "Green gram (moong)", hi: "मूंग", gu: "મગ", mr: "मूग" },
    group: "pulse",
    seasons: ["kharif", "summer"],
    sowing: { kharif: [6, 7], summer: [3, 4] },
    kc: { ini: 0.4, mid: 1.05, end: 0.35 },
    stages: [15, 20, 25, 10],
    rootMax: 0.6,
    p: 0.45,
    ph: [6.0, 7.5],
    yieldModel: true,
    priceKey: "moong",
    msp: { price: 8780, season: KMS },
    unit: "kg/ha",
  },
  urad: {
    id: "urad",
    name: { en: "Black gram (urad)", hi: "उड़द", gu: "અડદ", mr: "उडीद" },
    group: "pulse",
    seasons: ["kharif", "rabi"],
    sowing: { kharif: [6, 7], rabi: [10, 11] },
    kc: { ini: 0.4, mid: 1.05, end: 0.35 },
    stages: [15, 20, 30, 15],
    rootMax: 0.6,
    p: 0.45,
    ph: [6.0, 7.5],
    yieldModel: true,
    priceKey: "urad",
    msp: { price: 8200, season: KMS },
    unit: "kg/ha",
  },
  potato: {
    id: "potato",
    name: { en: "Potato", hi: "आलू", gu: "બટાકા", mr: "बटाटा" },
    group: "vegetable",
    seasons: ["rabi", "kharif"],
    sowing: { rabi: [10, 11], kharif: [7, 8] },
    kc: { ini: 0.5, mid: 1.15, end: 0.75 },
    stages: [25, 30, 30, 20],
    rootMax: 0.4,
    p: 0.35,
    ph: [5.0, 6.5],
    yieldModel: true,
    priceKey: "potato",
    unit: "kg/ha",
    farmGateShare: 0.367,
  },
  onion: {
    id: "onion",
    name: { en: "Onion", hi: "प्याज", gu: "ડુંગળી", mr: "कांदा" },
    group: "vegetable",
    seasons: ["rabi", "kharif"],
    sowing: { rabi: [11, 12], kharif: [6, 7] },
    kc: { ini: 0.7, mid: 1.05, end: 0.75 },
    stages: [15, 25, 60, 30],
    rootMax: 0.4,
    p: 0.3,
    ph: [6.0, 7.5],
    yieldModel: true,
    priceKey: "onion",
    unit: "kg/ha",
    farmGateShare: 0.362,
  },
  tomato: {
    id: "tomato",
    name: { en: "Tomato", hi: "टमाटर", gu: "ટામેટા", mr: "टोमॅटो" },
    group: "vegetable",
    seasons: ["rabi", "kharif"],
    sowing: { rabi: [9, 10], kharif: [6, 7] },
    kc: { ini: 0.6, mid: 1.15, end: 0.8 },
    stages: [25, 35, 40, 25],
    rootMax: 0.8,
    p: 0.4,
    ph: [6.0, 7.0],
    yieldModel: false,
    priceKey: "tomato",
    unit: "kg/ha",
    farmGateShare: 0.335,
  },
};

export const CROP_IDS = Object.keys(CROPS) as CropId[];

export const SEASON_NAMES: Record<Season, Record<Lang, string>> = {
  kharif: { en: "Kharif (monsoon)", hi: "खरीफ", gu: "ખરીફ", mr: "खरीप" },
  rabi: { en: "Rabi (winter)", hi: "रबी", gu: "રવી", mr: "रब्बी" },
  summer: { en: "Zaid (summer)", hi: "ज़ायद", gu: "ઉનાળુ", mr: "उन्हाळी" },
  annual: { en: "Whole year", hi: "वार्षिक", gu: "વાર્ષિક", mr: "वार्षिक" },
};

/** Reported yield (kg/ha) -> marketable produce in quintal per acre. */
export const marketableQAcre = (c: CropInfo, kgHa: number) => (kgHa * (c.sold?.factor ?? 1) * 0.404686) / 100;

export const totalDays = (c: CropInfo) => c.stages.reduce((a, b) => a + b, 0);

/** The season a crop is most likely in for a given month. */
export function likelySeason(crop: CropInfo, month: number): Season {
  let best: Season = crop.seasons[0]!;
  let bestDist = 99;
  for (const s of crop.seasons) {
    for (const m of crop.sowing[s] ?? []) {
      // months since sowing, wrapping the year; prefer seasons that started recently
      const d = (month - m + 12) % 12;
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
  }
  return best;
}

/** A plausible default sowing date for crop/season around `today`. */
export function defaultSowingDate(crop: CropInfo, season: Season, today = new Date()): string {
  const months = crop.sowing[season] ?? crop.sowing[crop.seasons[0]!] ?? [today.getMonth() + 1];
  const m = months[0]!;
  let y = today.getFullYear();
  const candidate = new Date(Date.UTC(y, m - 1, 15));
  // most recent sowing that is not in the future and not older than the crop duration
  if (candidate > today) y -= 1;
  const d = new Date(Date.UTC(y, m - 1, 15));
  if ((today.getTime() - d.getTime()) / 86400000 > totalDays(crop) + 30) {
    return new Date(Date.UTC(y + 1, m - 1, 15)).toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}
