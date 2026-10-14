/**
 * Weather hazard alerts. Rain categories follow IMD's 24-hour classification
 * (heavy 64.5-115.5 mm, very heavy 115.6-204.4 mm, extremely heavy >= 204.5 mm);
 * heat and cold follow IMD heat-wave / cold-wave practice for the plains.
 */
import type { Day } from "../api/weather";

export type AlertLevel = "warning" | "serious" | "critical";
export type AlertKind = "heat" | "cold" | "frost" | "heavy-rain" | "wind" | "storm" | "hail" | "dry-spell";

export interface WeatherAlert {
  kind: AlertKind;
  level: AlertLevel;
  date: string; // first day it applies
  value: number; // the triggering quantity (deg C, mm, km/h, days)
}

const rank: Record<AlertLevel, number> = { warning: 0, serious: 1, critical: 2 };

export function weatherAlerts(days: Day[], todayIndex: number, horizon = 7): WeatherAlert[] {
  const ahead = days.slice(todayIndex, todayIndex + horizon);
  const found = new Map<AlertKind, WeatherAlert>();
  const add = (a: WeatherAlert) => {
    const prev = found.get(a.kind);
    if (!prev || rank[a.level] > rank[prev.level]) found.set(a.kind, a);
  };
  for (const d of ahead) {
    if (d.tmax >= 45) add({ kind: "heat", level: "critical", date: d.date, value: d.tmax });
    else if (d.tmax >= 42) add({ kind: "heat", level: "serious", date: d.date, value: d.tmax });
    else if (d.tmax >= 40) add({ kind: "heat", level: "warning", date: d.date, value: d.tmax });
    if (d.tmin <= 2) add({ kind: "frost", level: "critical", date: d.date, value: d.tmin });
    else if (d.tmin <= 4) add({ kind: "frost", level: "serious", date: d.date, value: d.tmin });
    else if (d.tmin <= 7) add({ kind: "cold", level: "warning", date: d.date, value: d.tmin });
    if (d.rain >= 204.5) add({ kind: "heavy-rain", level: "critical", date: d.date, value: d.rain });
    else if (d.rain >= 115.6) add({ kind: "heavy-rain", level: "serious", date: d.date, value: d.rain });
    else if (d.rain >= 64.5) add({ kind: "heavy-rain", level: "warning", date: d.date, value: d.rain });
    if (d.gust >= 70) add({ kind: "wind", level: "critical", date: d.date, value: d.gust });
    else if (d.gust >= 55) add({ kind: "wind", level: "serious", date: d.date, value: d.gust });
    else if (d.gust >= 40) add({ kind: "wind", level: "warning", date: d.date, value: d.gust });
    if (d.code === 96 || d.code === 99) add({ kind: "hail", level: "serious", date: d.date, value: 0 });
    else if (d.code >= 95) add({ kind: "storm", level: "warning", date: d.date, value: 0 });
  }
  // dry spell: no day with >= 2.5 mm (IMD "rainy day") over the whole outlook, with high demand
  const rainy = ahead.some((d) => d.rain >= 2.5);
  const meanEt0 = ahead.reduce((s, d) => s + d.et0, 0) / Math.max(1, ahead.length);
  if (!rainy && ahead.length >= 7 && meanEt0 >= 4) {
    add({ kind: "dry-spell", level: "warning", date: ahead[0]!.date, value: ahead.length });
  }
  return [...found.values()].sort((a, b) => rank[b.level] - rank[a.level] || a.date.localeCompare(b.date));
}
