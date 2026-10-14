/**
 * Hour-by-hour spraying conditions. Thresholds follow common extension guidance
 * (e.g. GRDC "Weather essentials for pesticide application"; ICAR/TNAU spraying advisories):
 *
 *  - rain: none now and none expected within 4 h (wash-off)
 *  - wind at boom height 3-15 km/h (drift above, inversion risk below)
 *  - Delta-T (dry bulb - wet bulb) 2-8 deg C; above 10 droplets evaporate before landing
 *  - air temperature below ~32 deg C
 */
import type { Hour } from "../api/weather";

export type SprayLevel = "good" | "marginal" | "poor";
export type SprayReason =
  | "rain-now"
  | "rain-soon"
  | "wind-high"
  | "wind-calm"
  | "hot"
  | "dry-air"
  | "humid"
  | "dark";

export interface SprayHour {
  time: string;
  level: SprayLevel;
  reasons: SprayReason[];
  deltaT: number;
  windBoom: number;
}

/** Wet-bulb temperature, Stull (2011), J. Appl. Meteor. Climatol. 50:2267. */
export function wetBulb(t: number, rh: number): number {
  return (
    t * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
    Math.atan(t + rh) -
    Math.atan(rh - 1.676331) +
    0.00391838 * rh ** 1.5 * Math.atan(0.023101 * rh) -
    4.686035
  );
}

/** 10 m wind -> ~2 m (boom height) using the FAO-56 log-profile factor 4.87 / ln(67.8 z - 5.42). */
export const toBoomHeight = (u10: number) => u10 * 0.748;

export function sprayHours(hours: Hour[], from: number, count = 48): SprayHour[] {
  const out: SprayHour[] = [];
  for (let i = from; i < Math.min(hours.length, from + count); i++) {
    const h = hours[i]!;
    const reasons: SprayReason[] = [];
    let level: SprayLevel = "good";
    const worse = (l: SprayLevel, r: SprayReason) => {
      reasons.push(r);
      if (l === "poor" || level === "good") level = l;
    };
    const next4 = hours.slice(i + 1, i + 5);
    if (h.rain > 0.1 || h.pop >= 60) worse("poor", "rain-now");
    else if (next4.some((x) => x.rain > 0.2 || x.pop >= 50)) worse("poor", "rain-soon");
    const wind = toBoomHeight(h.wind);
    if (wind > 15) worse("poor", "wind-high");
    else if (wind < 3) worse("marginal", "wind-calm");
    if (h.t > 35) worse("poor", "hot");
    else if (h.t > 32) worse("marginal", "hot");
    const dT = h.t - wetBulb(h.t, h.rh);
    if (dT > 10) worse("poor", "dry-air");
    else if (dT > 8) worse("marginal", "dry-air");
    else if (dT < 2) worse("marginal", "humid");
    if (!h.isDay) worse("marginal", "dark");
    out.push({ time: h.time, level, reasons, deltaT: dT, windBoom: wind });
  }
  return out;
}

export interface SprayWindow {
  start: string;
  end: string;
  hours: number;
}

/** Contiguous runs of at least `minHours` good hours. */
export function sprayWindows(hours: SprayHour[], minHours = 2): SprayWindow[] {
  const out: SprayWindow[] = [];
  let start = -1;
  hours.forEach((h, i) => {
    const good = h.level === "good";
    if (good && start < 0) start = i;
    if ((!good || i === hours.length - 1) && start >= 0) {
      const end = good ? i : i - 1;
      if (end - start + 1 >= minHours)
        out.push({ start: hours[start]!.time, end: hours[end]!.time, hours: end - start + 1 });
      start = -1;
    }
  });
  return out;
}
