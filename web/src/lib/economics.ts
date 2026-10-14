import type { PriceSeries, PricesJson } from "@/state/queries";
import type { CropInfo } from "./crops";

export interface PriceUsed {
  perQuintal: number;
  kind: "msp" | "market";
  season?: string;
  month?: string;
}

export function zoneSeries(prices: PricesJson | undefined, crop: CropInfo, zone: string): PriceSeries | null {
  if (!prices || !crop.priceKey) return null;
  const c = prices.commodities[crop.priceKey];
  return c?.zones[zone] ?? c?.national ?? null;
}

/** First forecast month at or after the current month (falls back to the last one). */
export function upcoming(series: PriceSeries, today = new Date()) {
  const ym = today.toISOString().slice(0, 7);
  return series.forecast.find((f) => f.month >= ym) ?? series.forecast[series.forecast.length - 1];
}

/**
 * Price a farmer can expect per quintal: the MSP where one is announced, otherwise the
 * retail forecast scaled to farm-gate with the RBI (2024) farmers' share of the consumer rupee.
 */
export function priceFor(crop: CropInfo, prices: PricesJson | undefined, zone: string): PriceUsed | null {
  if (crop.msp) return { perQuintal: crop.msp.price, kind: "msp", season: crop.msp.season };
  const s = zoneSeries(prices, crop, zone);
  const next = s ? upcoming(s) : undefined;
  if (!next) return null;
  return { perQuintal: next.p50 * 100 * (crop.farmGateShare ?? 0.35), kind: "market", month: next.month };
}

/** Gross income range (Rs) for a field from P10/P50/P90 marketable yields in quintals per acre. */
export function incomeRange(qAcre: { p10: number; p50: number; p90: number }, acres: number, price: number) {
  return { low: qAcre.p10 * acres * price, mid: qAcre.p50 * acres * price, high: qAcre.p90 * acres * price };
}
