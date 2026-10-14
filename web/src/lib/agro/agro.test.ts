import { describe, expect, it } from "vitest";
import { saxtonRawls, usdaTexture } from "../api/soil";
import type { Day, Hour } from "../api/weather";
import { CROPS } from "../crops";
import { THREATS } from "../knowledge";
import { pickAgriYear } from "../ml/yieldModel";
import { weatherAlerts } from "./alerts";
import { diagnose } from "./diagnose";
import { diseaseRisk } from "./disease";
import { irrigationAdvice, kcAt, parseDate, runoffMm, stageAt, waterBalance } from "./fao56";
import { sprayHours, sprayWindows, wetBulb } from "./spray";

const hour = (time: string, o: Partial<Hour> = {}): Hour => ({
  time,
  t: 25,
  rh: 60,
  dew: 15,
  rain: 0,
  pop: 0,
  wind: 8,
  gust: 15,
  code: 1,
  leafWet: 0,
  vpd: 1,
  cloud: 20,
  isDay: true,
  ...o,
});

const dayOf = (date: string, o: Partial<Day> = {}): Day => ({
  date,
  code: 1,
  tmax: 32,
  tmin: 22,
  rain: 0,
  pop: 0,
  wind: 10,
  gust: 20,
  et0: 5,
  uv: 7,
  sunrise: "",
  sunset: "",
  soil: 0.25,
  ...o,
});

describe("soil hydraulics (Saxton & Rawls 2006)", () => {
  it("gives textbook field capacity and wilting point for a loam", () => {
    const { fc, wp } = saxtonRawls(0.4, 0.2, 2.5);
    expect(fc).toBeGreaterThan(0.26);
    expect(fc).toBeLessThan(0.32);
    expect(wp).toBeGreaterThan(0.1);
    expect(wp).toBeLessThan(0.16);
  });
  it("holds more water in clay than in sand", () => {
    const sand = saxtonRawls(0.88, 0.05, 1);
    const clay = saxtonRawls(0.2, 0.5, 2);
    expect(clay.fc - clay.wp).toBeGreaterThan(sand.fc - sand.wp);
  });
  it("classifies USDA textures", () => {
    expect(usdaTexture(40, 20)).toBe("loam");
    expect(usdaTexture(90, 3)).toBe("sand");
    expect(usdaTexture(15, 55)).toBe("clay");
  });
});

describe("FAO-56 crop development and water balance", () => {
  const rice = CROPS.rice;
  const wheat = CROPS.wheat;
  it("follows the Kc curve", () => {
    expect(kcAt(rice, 5)).toBeCloseTo(rice.kc.ini);
    expect(kcAt(rice, 60)).toBeCloseTo(rice.kc.mid);
    const devMid = rice.stages[0] + rice.stages[1] / 2;
    expect(kcAt(rice, devMid)).toBeCloseTo((rice.kc.ini + rice.kc.mid) / 2, 2);
  });
  it("locates the growth stage", () => {
    const sow = parseDate("2026-07-01");
    expect(stageAt(rice, sow, parseDate("2026-06-20")).stage).toBe("presowing");
    expect(stageAt(rice, sow, parseDate("2026-07-10")).stage).toBe("initial");
    expect(stageAt(rice, sow, parseDate("2026-09-01")).stage).toBe("mid");
    expect(stageAt(rice, sow, parseDate("2027-01-01")).stage).toBe("harvest");
  });
  it("computes SCS curve-number runoff", () => {
    expect(runoffMm(10, 25)).toBe(0);
    expect(runoffMm(50, 25)).toBeCloseTo(10.1, 0);
  });
  it("depletes without rain and refills after rain", () => {
    const days = Array.from({ length: 10 }, (_, i) =>
      dayOf(`2026-12-${String(i + 1).padStart(2, "0")}`, { rain: i === 8 ? 80 : 0, soil: 0.3 }),
    );
    const s = waterBalance({
      crop: wheat,
      sowing: parseDate("2026-11-10"),
      awcMmPerM: 150,
      clayPct: 25,
      days,
      todayIndex: 3,
      soilFc: 0.3,
      soilWp: 0.14,
    });
    expect(s[7]!.depletion).toBeGreaterThan(s[0]!.depletion);
    expect(s[8]!.depletion).toBeLessThan(s[7]!.depletion);
  });
  it("recommends irrigation when depletion passes RAW", () => {
    const days = Array.from({ length: 10 }, (_, i) =>
      dayOf(`2027-01-${String(i + 1).padStart(2, "0")}`, { et0: 6, soil: 0.15 }),
    );
    const sow = parseDate("2026-11-15");
    const s = waterBalance({ crop: wheat, sowing: sow, awcMmPerM: 120, clayPct: 25, days, todayIndex: 2 });
    const advice = irrigationAdvice(s, 2, stageAt(wheat, sow, parseDate("2027-01-03")), "drip", wheat);
    expect(["now", "by"]).toContain(advice.kind);
  });
});

describe("spray conditions", () => {
  it("matches Stull's wet-bulb example (20 C, 50 % -> 13.7 C)", () => {
    expect(wetBulb(20, 50)).toBeCloseTo(13.7, 1);
  });
  it("flags rain and wind, and finds good windows", () => {
    const hrs = Array.from({ length: 12 }, (_, i) =>
      hour(
        `2026-10-14T${String(6 + i).padStart(2, "0")}:00`,
        i >= 8 ? { rain: 2, pop: 90 } : { rh: 65, t: 26 },
      ),
    );
    const s = sprayHours(hrs, 0, 12);
    expect(s[9]!.level).toBe("poor");
    expect(s[5]!.reasons).toContain("rain-soon");
    expect(sprayWindows(s).length).toBeGreaterThan(0);
    const windy = sprayHours([hour("2026-10-14T10:00", { wind: 30 })], 0, 1);
    expect(windy[0]!.reasons).toContain("wind-high");
  });
});

describe("weather alerts (IMD thresholds)", () => {
  it("classifies heat and heavy rain", () => {
    const days = [dayOf("2026-05-01", { tmax: 45.5 }), dayOf("2026-05-02", { rain: 130 })];
    const a = weatherAlerts(days, 0);
    expect(a.find((x) => x.kind === "heat")?.level).toBe("critical");
    expect(a.find((x) => x.kind === "heavy-rain")?.level).toBe("serious");
  });
});

describe("disease risk models", () => {
  it("flags late blight after two Hutton days", () => {
    const hrs: Hour[] = [];
    for (const d of ["2026-12-01", "2026-12-02", "2026-12-03"]) {
      for (let h = 0; h < 24; h++)
        hrs.push(hour(`${d}T${String(h).padStart(2, "0")}:00`, { t: 14, rh: h < 10 ? 95 : 80 }));
    }
    const r = diseaseRisk("potato", "mid", hrs, "2026-12-02");
    expect(r.find((x) => x.threatId === "late-blight")?.peak).toBe(3);
  });
  it("flags rice blast in long warm wet spells", () => {
    const hrs: Hour[] = [];
    for (const d of ["2026-08-01", "2026-08-02"]) {
      for (let h = 0; h < 24; h++)
        hrs.push(hour(`${d}T${String(h).padStart(2, "0")}:00`, { t: 24, rh: 96, leafWet: 90 }));
    }
    const r = diseaseRisk("rice", "development", hrs, "2026-08-01");
    expect(r[0]?.threatId).toBe("rice-blast");
    expect(r[0]?.peak).toBe(3);
  });
});

describe("symptom checker", () => {
  it("ranks the textbook cause first", () => {
    expect(diagnose("rice", ["eye-lesions", "spots"])[0]?.threat.id).toBe("rice-blast");
    expect(diagnose("maize", ["holes", "frass"])[0]?.threat.id).toBe("maize-faw");
    expect(diagnose("moong", ["mosaic", "yellowing"])[0]?.threat.id).toBe("yellow-mosaic");
  });
  it("returns a probability distribution", () => {
    const d = diagnose("cotton", ["sticky-insects"]);
    expect(d.reduce((s, x) => s + x.probability, 0)).toBeCloseTo(1, 6);
  });
});

describe("knowledge base", () => {
  it("translates every threat into all four languages", () => {
    for (const t of THREATS) {
      for (const l of ["en", "hi", "gu", "mr"] as const) {
        expect(t.name[l], `${t.id} name ${l}`).toBeTruthy();
        expect(t.act[l], `${t.id} act ${l}`).toBeTruthy();
      }
    }
  });
  it("has unique ids", () => {
    expect(new Set(THREATS.map((t) => t.id)).size).toBe(THREATS.length);
  });
});

describe("agricultural year", () => {
  it("picks the current or upcoming season", () => {
    expect(pickAgriYear("rice", "kharif", new Date(2026, 9, 14))).toBe(2026);
    expect(pickAgriYear("wheat", "rabi", new Date(2026, 9, 14))).toBe(2026);
    expect(pickAgriYear("rice", "kharif", new Date(2027, 1, 20))).toBe(2027);
    expect(pickAgriYear("wheat", "rabi", new Date(2027, 1, 20))).toBe(2026);
  });
});
