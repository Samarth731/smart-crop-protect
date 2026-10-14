/**
 * Topsoil properties from ISRIC SoilGrids 2.0 (250 m global soil maps, CC-BY 4.0),
 * averaged over 0-30 cm, plus available water capacity from Saxton & Rawls (2006).
 */
import { fetchJson, readCache, writeCache } from "./http";

export interface Soil {
  sand: number; // %
  silt: number; // %
  clay: number; // %
  socGkg: number; // soil organic carbon, g/kg
  ph: number;
  nitrogenGkg: number; // total N, g/kg
  bulkDensity: number; // g/cm3
  texture: string; // USDA texture class
  fc: number; // field capacity (m3/m3)
  wp: number; // wilting point (m3/m3)
  awcMmPerM: number; // available water capacity, mm per metre of soil
  source: "soilgrids" | "texture";
}

interface Layer {
  name: string;
  unit_measure: { d_factor: number };
  depths: { label: string; values: { mean: number | null } }[];
}

const DEPTHS = [
  ["0-5cm", 5],
  ["5-15cm", 10],
  ["15-30cm", 15],
] as const;

export async function fetchSoil(lat: number, lon: number): Promise<Soil | null> {
  const key = `soil2:${lat.toFixed(3)},${lon.toFixed(3)}`;
  const hit = readCache<Soil>(key);
  if (hit) return hit.data; // soil does not change: cache forever
  const qs = new URLSearchParams({ lon: lon.toFixed(4), lat: lat.toFixed(4), value: "mean" });
  for (const p of ["sand", "silt", "clay", "soc", "phh2o", "nitrogen", "bdod"]) qs.append("property", p);
  for (const [d] of DEPTHS) qs.append("depth", d);
  try {
    const json = await fetchJson<{ properties: { layers: Layer[] } }>(
      `https://rest.isric.org/soilgrids/v2.0/properties/query?${qs}`,
      20000,
    );
    const v: Record<string, number> = {};
    for (const layer of json.properties.layers) {
      let sum = 0;
      let w = 0;
      for (const [label, thick] of DEPTHS) {
        const m = layer.depths.find((d) => d.label === label)?.values.mean;
        if (m != null) {
          sum += (m / layer.unit_measure.d_factor) * thick;
          w += thick;
        }
      }
      if (w) v[layer.name] = sum / w;
    }
    if (v.sand == null || v.clay == null) return null; // water body, urban or no data
    // after d_factor: sand/silt/clay %, soc g/kg, pH, N g/kg, bulk density kg/dm3
    const soil = fromProperties({
      sand: v.sand,
      silt: v.silt ?? 100 - v.sand - v.clay,
      clay: v.clay,
      socGkg: v.soc ?? 10,
      ph: v.phh2o ?? 7,
      nitrogenGkg: v.nitrogen ?? 1,
      bulkDensity: v.bdod ?? 1.4,
    });
    writeCache(key, soil);
    return soil;
  } catch {
    return null;
  }
}

export function fromProperties(p: Omit<Soil, "texture" | "fc" | "wp" | "awcMmPerM" | "source">): Soil {
  const { fc, wp } = saxtonRawls(p.sand / 100, p.clay / 100, (p.socGkg / 10) * 1.724);
  return {
    ...p,
    texture: usdaTexture(p.sand, p.clay),
    fc,
    wp,
    awcMmPerM: Math.round((fc - wp) * 1000),
    source: "soilgrids",
  };
}

/**
 * Saxton & Rawls (2006), Soil Sci. Soc. Am. J. 70:1569. Water at -33 kPa (field capacity) and
 * -1500 kPa (wilting point) from sand and clay fractions and organic matter (% by weight).
 */
export function saxtonRawls(S: number, C: number, OM: number): { fc: number; wp: number } {
  const om = Math.min(OM, 8);
  const t1500 = -0.024 * S + 0.487 * C + 0.006 * om + 0.005 * S * om - 0.013 * C * om + 0.068 * S * C + 0.031;
  const wp = t1500 + (0.14 * t1500 - 0.02);
  const t33 = -0.251 * S + 0.195 * C + 0.011 * om + 0.006 * S * om - 0.027 * C * om + 0.452 * S * C + 0.299;
  const fc = t33 + (1.283 * t33 * t33 - 0.374 * t33 - 0.015);
  return { fc, wp: Math.max(0.01, wp) };
}

/** USDA soil texture triangle. */
export function usdaTexture(sand: number, clay: number): string {
  const silt = 100 - sand - clay;
  if (clay >= 40 && silt < 40 && sand <= 45) return "clay";
  if (clay >= 40 && silt >= 40) return "silty clay";
  if (clay >= 35 && sand > 45) return "sandy clay";
  if (clay >= 27 && clay < 40 && sand <= 20) return "silty clay loam";
  if (clay >= 27 && clay < 40 && sand > 20 && sand <= 45) return "clay loam";
  if (clay >= 20 && clay < 35 && silt < 28 && sand > 45) return "sandy clay loam";
  if (silt >= 80 && clay < 12) return "silt";
  if (silt >= 50 && ((clay >= 12 && clay < 27) || (silt < 80 && clay < 12))) return "silt loam";
  if (clay >= 7 && clay < 27 && silt >= 28 && silt < 50 && sand <= 52) return "loam";
  if (sand >= 85 && silt + 1.5 * clay < 15) return "sand";
  if (sand >= 70 && sand < 91 && silt + 1.5 * clay >= 15 && silt + 2 * clay < 30) return "loamy sand";
  return "sandy loam";
}

/** Manual fallback when SoilGrids has no data: typical Indian soils. */
export const TEXTURE_PRESETS: Record<"sandy" | "loamy" | "clay" | "black", Soil> = {
  sandy: preset(78, 12, 10, 3, 7.2),
  loamy: preset(42, 38, 20, 6, 7.0),
  clay: preset(25, 30, 45, 7, 7.4),
  black: preset(18, 27, 55, 6, 7.9), // vertisol, "black cotton soil"
};

function preset(sand: number, silt: number, clay: number, socGkg: number, ph: number): Soil {
  return {
    ...fromProperties({ sand, silt, clay, socGkg, ph, nitrogenGkg: 0.8, bulkDensity: 1.4 }),
    source: "texture",
  };
}
