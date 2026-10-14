/**
 * NASA POWER daily data aggregated to the monthly values the yield model was trained on.
 *
 * Training used POWER's monthly product, which is: precipitation = mean of daily mm/day,
 * T2M_MAX = hottest day of the month, T2M_MIN = coldest night, GWETROOT = mean. We rebuild
 * exactly that from daily data, keeping only complete months.
 */
import { cachedJson } from "./http";

/** Same order as the model's WX_VARS: rain_mm, T2M_MAX, T2M_MIN, ALLSKY_SFC_SW_DWN, GWETROOT, RH2M */
export type MonthVec = [number, number, number, number, number, number];

const DAYS_IN_MONTH = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

interface PowerDaily {
  properties: { parameter: Record<string, Record<string, number>> };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10).replaceAll("-", "");

/** Monthly aggregates keyed "YYYY-MM" for every complete month in [start, end]. */
export async function fetchPowerMonthly(
  lat: number,
  lon: number,
  start: Date,
  end: Date,
): Promise<Map<string, MonthVec>> {
  const url =
    "https://power.larc.nasa.gov/api/temporal/daily/point?" +
    new URLSearchParams({
      parameters: "PRECTOTCORR,T2M_MAX,T2M_MIN,GWETROOT",
      community: "AG",
      latitude: lat.toFixed(4),
      longitude: lon.toFixed(4),
      start: ymd(start),
      end: ymd(end),
      format: "JSON",
    });
  const key = `power:${lat.toFixed(3)},${lon.toFixed(3)}:${ymd(start)}:${ymd(end)}`;
  const { data } = await cachedJson<PowerDaily>(key, url, { maxAgeMs: 12 * 3600 * 1000, timeoutMs: 30000 });
  return aggregateMonthly(data.properties.parameter);
}

export function aggregateMonthly(p: Record<string, Record<string, number>>): Map<string, MonthVec> {
  const byMonth = new Map<
    string,
    { rain: number[]; tx: number[]; tn: number[]; gw: number[]; days: number }
  >();
  const pr = p.PRECTOTCORR ?? {};
  for (const day of Object.keys(pr)) {
    const k = `${day.slice(0, 4)}-${day.slice(4, 6)}`;
    const m = byMonth.get(k) ?? { rain: [], tx: [], tn: [], gw: [], days: 0 };
    m.days += 1;
    const push = (arr: number[], v: number | undefined) => {
      if (v !== undefined && v > -900) arr.push(v);
    };
    push(m.rain, pr[day]);
    push(m.tx, p.T2M_MAX?.[day]);
    push(m.tn, p.T2M_MIN?.[day]);
    push(m.gw, p.GWETROOT?.[day]);
    byMonth.set(k, m);
  }
  const out = new Map<string, MonthVec>();
  for (const [k, m] of byMonth) {
    const month = Number(k.slice(5, 7));
    const year = Number(k.slice(0, 4));
    const full = new Date(Date.UTC(year, month, 0)).getUTCDate();
    // complete month: every day present and every variable valid on (almost) every day
    if (m.days < full || m.rain.length < full - 1 || m.tx.length < full - 1 || m.gw.length < full - 1)
      continue;
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    out.set(k, [
      mean(m.rain) * DAYS_IN_MONTH[month - 1]!,
      Math.max(...m.tx),
      Math.min(...m.tn),
      Number.NaN, // solar radiation: not used by the model
      mean(m.gw),
      Number.NaN, // humidity: not used by the model
    ]);
  }
  return out;
}
