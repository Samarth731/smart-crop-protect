import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { weatherAlerts } from "@/lib/agro/alerts";
import { diseaseRisk } from "@/lib/agro/disease";
import { irrigationAdvice, parseDate, stageAt, waterBalance } from "@/lib/agro/fao56";
import { sprayHours, sprayWindows } from "@/lib/agro/spray";
import { asset, fetchJson } from "@/lib/api/http";
import { fetchSoil, type Soil, TEXTURE_PRESETS } from "@/lib/api/soil";
import { fetchWeather } from "@/lib/api/weather";
import { CROPS } from "@/lib/crops";
import { loadDistricts } from "@/lib/geo";
import { forecastYield } from "@/lib/ml/yieldModel";
import { type Place, useProfile } from "./profile";

export function useDistricts() {
  return useQuery({ queryKey: ["districts"], queryFn: loadDistricts, staleTime: Number.POSITIVE_INFINITY });
}

export function useWeather(place: Place | null) {
  return useQuery({
    queryKey: ["weather", place?.lat.toFixed(2), place?.lon.toFixed(2)],
    queryFn: () => fetchWeather(place!.lat, place!.lon),
    enabled: !!place,
    staleTime: 15 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    retry: 1,
  });
}

export function useSoil(place: Place | null) {
  const pref = useProfile((s) => s.soil);
  const q = useQuery({
    queryKey: ["soil", place?.lat.toFixed(3), place?.lon.toFixed(3)],
    queryFn: () => fetchSoil(place!.lat, place!.lon),
    enabled: !!place && pref === "auto",
    staleTime: Number.POSITIVE_INFINITY,
    retry: 1,
  });
  const soil: Soil | null =
    pref !== "auto" ? TEXTURE_PRESETS[pref] : (q.data ?? (q.isFetched ? TEXTURE_PRESETS.loamy : null));
  return { soil, isLoading: pref === "auto" && q.isLoading, fromSoilGrids: pref === "auto" && !!q.data };
}

export interface PriceSeries {
  origin: string;
  last: number;
  history: [string, number][];
  forecast: { month: string; p10: number; p50: number; p90: number }[];
}
export interface PricesJson {
  generated: string;
  latest_month: string;
  source: string;
  commodities: Record<
    string,
    { label: string; unit: string; national: PriceSeries | null; zones: Record<string, PriceSeries> }
  >;
  backtest: {
    zones: Record<
      string,
      { mape_model: number; mape_naive: number; skill_vs_naive: number; coverage_conformal: number }
    >;
  };
}

export function usePrices() {
  return useQuery({
    queryKey: ["prices"],
    queryFn: () => fetchJson<PricesJson>(asset("data/prices.json")),
    staleTime: 6 * 3600 * 1000,
  });
}

export interface MandiJson {
  generated: string;
  unit: string;
  crops: Record<
    string,
    {
      state: string;
      district: string;
      market: string;
      variety: string;
      date: string;
      min: number;
      max: number;
      modal: number;
    }[]
  >;
}

/** Live Agmarknet prices, present once the daily GitHub Action has an API key. */
export function useMandi() {
  return useQuery({
    queryKey: ["mandi"],
    queryFn: () => fetchJson<MandiJson>(asset("data/mandi.json")).catch(() => null),
    staleTime: 3600 * 1000,
    retry: false,
  });
}

export function useYieldForecast() {
  const { place, crop, season } = useProfile();
  return useQuery({
    queryKey: ["yield", place?.districtCode, crop, season],
    queryFn: () =>
      forecastYield({
        stateKey: place!.stateKey,
        districtCode: place!.districtCode,
        lat: place!.lat,
        lon: place!.lon,
        crop,
        season,
      }),
    enabled: !!place && CROPS[crop].yieldModel,
    staleTime: 6 * 3600 * 1000,
    retry: 1,
  });
}

export interface IrrigationEvent {
  date: string;
  mm: number;
}

const IRR_KEY = "scp-irrigation-log";
export function readIrrigationLog(): IrrigationEvent[] {
  try {
    return JSON.parse(localStorage.getItem(IRR_KEY) ?? "[]") as IrrigationEvent[];
  } catch {
    return [];
  }
}
export function logIrrigation(e: IrrigationEvent) {
  const log = readIrrigationLog().filter((x) => x.date !== e.date);
  log.push(e);
  localStorage.setItem(IRR_KEY, JSON.stringify(log.slice(-60)));
}

/** Everything the Today and Field pages derive from weather + soil + crop profile. */
export function useFieldModel(irrigationVersion = 0) {
  const profile = useProfile();
  const weather = useWeather(profile.place);
  const { soil } = useSoil(profile.place);
  const crop = CROPS[profile.crop];
  // biome-ignore lint/correctness/useExhaustiveDependencies: irrigationVersion forces a recompute after logging
  return useMemo(() => {
    const w = weather.data;
    const today = new Date();
    const sowing = parseDate(profile.sowingDate);
    const stage = stageAt(
      crop,
      sowing,
      parseDate(w ? w.days[w.todayIndex]!.date : today.toISOString().slice(0, 10)),
    );
    if (!w || !soil) return { weather, soil, stage, crop, ready: false as const };
    const water = waterBalance({
      crop,
      sowing,
      awcMmPerM: soil.awcMmPerM,
      clayPct: soil.clay,
      days: w.days,
      todayIndex: w.todayIndex,
      soilFc: soil.fc,
      soilWp: soil.wp,
      irrigationLog: readIrrigationLog(),
    });
    const advice = irrigationAdvice(water, w.todayIndex, stage, profile.irrigation, crop);
    const spray = sprayHours(w.hours, w.nowIndex, 48);
    const windows = sprayWindows(spray);
    const risks = diseaseRisk(profile.crop, stage.stage, w.hours, w.days[w.todayIndex]!.date);
    const alerts = weatherAlerts(w.days, w.todayIndex);
    return {
      weather,
      soil,
      stage,
      crop,
      ready: true as const,
      w,
      water,
      advice,
      spray,
      windows,
      risks,
      alerts,
    };
  }, [weather, soil, crop, profile.sowingDate, profile.irrigation, profile.crop, irrigationVersion]);
}
