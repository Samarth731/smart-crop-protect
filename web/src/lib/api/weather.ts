/**
 * Open-Meteo forecast (free, no key): 14 past days + 10 forecast days, hourly and daily.
 * The past days drive the soil-water balance; the hourly series drives disease and spray models.
 */
import { cachedJson } from "./http";

export interface Hour {
  time: string; // local ISO "2026-10-14T06:00"
  t: number; // air temperature (deg C)
  rh: number; // relative humidity (%)
  dew: number;
  rain: number; // mm in the hour
  pop: number; // precipitation probability (%)
  wind: number; // 10 m wind (km/h)
  gust: number;
  code: number; // WMO weather code
  leafWet: number; // leaf wetness probability (%)
  vpd: number; // kPa
  cloud: number;
  isDay: boolean;
}

export interface Day {
  date: string; // "2026-10-14"
  code: number;
  tmax: number;
  tmin: number;
  rain: number;
  pop: number;
  wind: number;
  gust: number;
  et0: number;
  uv: number;
  sunrise: string;
  sunset: string;
  /** root-zone (9-81 cm) volumetric soil moisture, daily mean (m3/m3) */
  soil: number;
}

export interface Weather {
  days: Day[];
  hours: Hour[];
  todayIndex: number; // index of today in `days`
  nowIndex: number; // index of the current hour in `hours`
  timezone: string;
  fetchedAt: number;
  stale: boolean;
}

const HOURLY = [
  "temperature_2m",
  "relative_humidity_2m",
  "dew_point_2m",
  "precipitation",
  "precipitation_probability",
  "wind_speed_10m",
  "wind_gusts_10m",
  "weather_code",
  "leaf_wetness_probability",
  "vapour_pressure_deficit",
  "cloud_cover",
  "is_day",
  "soil_moisture_9_to_27cm",
  "soil_moisture_27_to_81cm",
] as const;
const DAILY = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_sum",
  "precipitation_probability_max",
  "wind_speed_10m_max",
  "wind_gusts_10m_max",
  "et0_fao_evapotranspiration",
  "uv_index_max",
  "sunrise",
  "sunset",
] as const;

type Series<K extends string> = { time: string[] } & Record<K, (number | null)[]>;
interface Raw {
  timezone: string;
  hourly: Series<(typeof HOURLY)[number]>;
  daily: Series<Exclude<(typeof DAILY)[number], "sunrise" | "sunset">> & {
    sunrise: string[];
    sunset: string[];
  };
}

const n = (v: number | null | undefined, d = 0) => (v == null || Number.isNaN(v) ? d : v);

export async function fetchWeather(lat: number, lon: number): Promise<Weather> {
  const url =
    "https://api.open-meteo.com/v1/forecast?" +
    new URLSearchParams({
      latitude: lat.toFixed(3),
      longitude: lon.toFixed(3),
      hourly: HOURLY.join(","),
      daily: DAILY.join(","),
      past_days: "14",
      forecast_days: "10",
      timezone: "auto",
      wind_speed_unit: "kmh",
    });
  const key = `wx:${lat.toFixed(2)},${lon.toFixed(2)}`;
  const { data, at, stale } = await cachedJson<Raw>(key, url, { maxAgeMs: 20 * 60 * 1000 });
  return parseWeather(data, at, stale);
}

export function parseWeather(raw: Raw, fetchedAt: number, stale = false, now = new Date()): Weather {
  const h = raw.hourly;
  const hours: Hour[] = h.time.map((time, i) => ({
    time,
    t: n(h.temperature_2m[i]),
    rh: n(h.relative_humidity_2m[i]),
    dew: n(h.dew_point_2m[i]),
    rain: n(h.precipitation[i]),
    pop: n(h.precipitation_probability[i]),
    wind: n(h.wind_speed_10m[i]),
    gust: n(h.wind_gusts_10m[i]),
    code: n(h.weather_code[i]),
    leafWet: n(h.leaf_wetness_probability[i]),
    vpd: n(h.vapour_pressure_deficit[i]),
    cloud: n(h.cloud_cover[i]),
    isDay: n(h.is_day[i]) === 1,
  }));
  // daily mean root-zone soil moisture, weighting the two layers by thickness (18 cm, 54 cm)
  const soilByDay = new Map<string, number[]>();
  h.time.forEach((t, i) => {
    const a = h.soil_moisture_9_to_27cm[i];
    const b = h.soil_moisture_27_to_81cm[i];
    if (a == null || b == null) return;
    const d = t.slice(0, 10);
    const arr = soilByDay.get(d) ?? [];
    arr.push((a * 18 + b * 54) / 72);
    soilByDay.set(d, arr);
  });
  const d = raw.daily;
  const days: Day[] = d.time.map((date, i) => {
    const s = soilByDay.get(date) ?? [];
    return {
      date,
      code: n(d.weather_code[i]),
      tmax: n(d.temperature_2m_max[i]),
      tmin: n(d.temperature_2m_min[i]),
      rain: n(d.precipitation_sum[i]),
      pop: n(d.precipitation_probability_max[i]),
      wind: n(d.wind_speed_10m_max[i]),
      gust: n(d.wind_gusts_10m_max[i]),
      et0: n(d.et0_fao_evapotranspiration[i], 4),
      uv: n(d.uv_index_max[i]),
      sunrise: d.sunrise[i] ?? "",
      sunset: d.sunset[i] ?? "",
      soil: s.length ? s.reduce((x, y) => x + y, 0) / s.length : Number.NaN,
    };
  });
  const local = localIso(now, raw.timezone);
  const todayIndex = Math.max(
    0,
    days.findIndex((x) => x.date === local.slice(0, 10)),
  );
  const nowIndex = Math.max(
    0,
    hours.findIndex((x) => x.time.slice(0, 13) === local.slice(0, 13)),
  );
  return { days, hours, todayIndex, nowIndex, timezone: raw.timezone, fetchedAt, stale };
}

/** "YYYY-MM-DDTHH:mm" in the given IANA zone. */
export function localIso(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

/** WMO weather code -> condition family used by icons and the field scene. */
export type Sky = "clear" | "partly" | "cloudy" | "fog" | "drizzle" | "rain" | "storm";
export function skyOf(code: number): Sky {
  if (code <= 1) return "clear";
  if (code === 2) return "partly";
  if (code === 3) return "cloudy";
  if (code <= 48) return "fog";
  if (code <= 57) return "drizzle";
  if (code <= 67 || (code >= 80 && code <= 82)) return "rain";
  if (code >= 95) return "storm";
  return "rain";
}
