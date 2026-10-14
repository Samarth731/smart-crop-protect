/** District lookup: GPS -> nearest LGD district centroid (no external geocoder needed). */
import { asset, fetchJson } from "./api/http";

export interface District {
  c: number; // LGD district code
  n: string; // name
  s: string; // state
  k: string; // state slug (yield shard file name)
  la: number;
  lo: number;
}

let cache: Promise<District[]> | null = null;

export function loadDistricts(): Promise<District[]> {
  cache ??= fetchJson<District[]>(asset("data/districts.json")).catch((e) => {
    cache = null;
    throw e;
  });
  return cache;
}

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function nearestDistrict(list: District[], lat: number, lon: number): { d: District; km: number } {
  let best = list[0]!;
  let bestKm = Number.POSITIVE_INFINITY;
  for (const d of list) {
    const km = haversineKm(lat, lon, d.la, d.lo);
    if (km < bestKm) {
      best = d;
      bestKm = km;
    }
  }
  return { d: best, km: bestKm };
}

export function insideIndia(lat: number, lon: number): boolean {
  return lat > 6 && lat < 37.5 && lon > 68 && lon < 97.5;
}

export function getPosition(timeoutMs = 15000): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: timeoutMs,
      maximumAge: 10 * 60 * 1000,
    });
  });
}

/**
 * DoCA price-monitoring zones used by the market forecasts. Madhya Pradesh and Gujarat are
 * reported with the West zone, Chhattisgarh with the East.
 */
const ZONE: Record<string, "north" | "south" | "east" | "west" | "northeast"> = {
  "Jammu And Kashmir": "north",
  Ladakh: "north",
  "Himachal Pradesh": "north",
  Punjab: "north",
  Chandigarh: "north",
  Haryana: "north",
  Delhi: "north",
  Uttarakhand: "north",
  "Uttar Pradesh": "north",
  Rajasthan: "north",
  Gujarat: "west",
  Maharashtra: "west",
  Goa: "west",
  "Madhya Pradesh": "west",
  "The Dadra And Nagar Haveli And Daman And Diu": "west",
  Bihar: "east",
  Jharkhand: "east",
  "West Bengal": "east",
  Odisha: "east",
  Chhattisgarh: "east",
  "Andaman And Nicobar Islands": "east",
  "Andhra Pradesh": "south",
  Telangana: "south",
  Karnataka: "south",
  "Tamil Nadu": "south",
  Kerala: "south",
  Puducherry: "south",
  Lakshadweep: "south",
  Assam: "northeast",
  Meghalaya: "northeast",
  Tripura: "northeast",
  Mizoram: "northeast",
  Manipur: "northeast",
  Nagaland: "northeast",
  "Arunachal Pradesh": "northeast",
  Sikkim: "northeast",
};

export const zoneOf = (state: string) => ZONE[state] ?? "north";
