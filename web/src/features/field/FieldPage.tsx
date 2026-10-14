import { Bug, CloudRain, Droplets, Layers, SprayCan, ThermometerSun } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { WeatherIcon } from "@/components/art";
import { ColumnChart, RangeChart, StatusStrip, WaterChart } from "@/components/charts";
import { Card, RiskBadge, Skeleton, SourceNote, Status, useToast } from "@/components/ui";
import { useFmt, useLang, useT } from "@/i18n";
import type { RiskLevel } from "@/lib/agro/disease";
import { EFFICIENCY } from "@/lib/agro/fao56";
import { skyOf } from "@/lib/api/weather";
import { threatById } from "@/lib/knowledge";
import { useProfile } from "@/state/profile";
import { logIrrigation, useFieldModel, useSoil } from "@/state/queries";
import { AlertList, IrrigationVerdict, SprayVerdict } from "../shared/verdicts";

export default function FieldPage() {
  const t = useT();
  const f = useFmt();
  const p = useProfile();
  const toast = useToast();
  const [irrVersion, setIrrVersion] = useState(0);
  const m = useFieldModel(irrVersion);
  const location = useLocation();

  useEffect(() => {
    if (!location.hash || !m.ready) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.hash, m.ready]);

  if (!p.place) {
    return (
      <div className="page">
        <div className="note">{t.today.setLocation}</div>
      </div>
    );
  }

  const w = m.ready ? m.w : undefined;
  const ahead = w ? w.days.slice(w.todayIndex, w.todayIndex + 10) : [];

  return (
    <div className="page">
      <header className="page-head">
        <span className="eyebrow">
          {p.place.district}, {p.place.state}
        </span>
        <h1>{t.field.title}</h1>
        <p>{t.field.sub}</p>
      </header>

      <Card
        title={t.field.forecast}
        icon={ThermometerSun}
        tone="heat"
        sub={w && t.app.updated(f.relative(w.fetchedAt))}
      >
        {w ? (
          <div className="stack" style={{ gap: 18 }}>
            <div className="scroll-x">
              {ahead.map((d, i) => (
                <div key={d.date} className="day" data-today={i === 0}>
                  <span className="muted" style={{ fontSize: "var(--text-xs)", fontWeight: 600 }}>
                    {i === 0 ? t.field.today : i === 1 ? t.field.tomorrow : f.day(d.date)}
                  </span>
                  <WeatherIcon sky={skyOf(d.code)} />
                  <b>{Math.round(d.tmax)}°</b>
                  <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                    {Math.round(d.tmin)}° · {Math.round(d.wind)} {t.units.kmh}
                  </span>
                </div>
              ))}
            </div>
            <div className="grid grid-2">
              <div>
                <h3 className="chart-title">{t.field.temperature}</h3>
                <RangeChart
                  label={t.field.temperature}
                  tableHead={["", t.field.min, t.field.max]}
                  data={ahead.map((d, i) => ({
                    key: d.date,
                    label: i === 0 ? t.field.today : f.day(d.date),
                    min: d.tmin,
                    max: d.tmax,
                    highlight: d.tmax === Math.max(...ahead.map((x) => x.tmax)),
                  }))}
                />
              </div>
              <div>
                <h3 className="chart-title">{t.field.rainfall}</h3>
                <ColumnChart
                  label={t.field.rainfall}
                  unit={t.units.mm}
                  tableHead={["", t.field.rainfall]}
                  valueFmt={(v) => (v < 10 ? v.toFixed(1) : v.toFixed(0))}
                  data={ahead.map((d, i) => ({
                    key: d.date,
                    label: i === 0 ? t.field.today : f.day(d.date),
                    value: d.rain,
                    highlight: d.rain === Math.max(...ahead.map((x) => x.rain)) && d.rain >= 1,
                    tip: `${f.day(d.date)} ${f.date(d.date)} · ${t.field.rainChance(d.pop)}`,
                  }))}
                />
              </div>
            </div>
            <SourceNote>
              {t.app.source}: <a href="https://open-meteo.com">Open-Meteo</a> (ECMWF, NCEP, DWD models)
            </SourceNote>
          </div>
        ) : (
          <Skeleton h={260} />
        )}
      </Card>

      {m.ready && m.alerts.length > 0 && (
        <Card title={t.today.alerts} icon={CloudRain} tone="water">
          <AlertList alerts={m.alerts} />
        </Card>
      )}

      <div className="grid grid-2" id="spray">
        <Card title={t.spray.planner} sub={t.spray.plannerSub} icon={SprayCan}>
          {m.ready ? (
            <div className="stack">
              <SprayVerdict hours={m.spray} windows={m.windows} />
              <StatusStrip
                label={t.spray.planner}
                cells={m.spray.map((h) => ({
                  key: h.time,
                  level: h.level,
                  tip: `${f.day(h.time)} ${f.time(h.time)} · ${h.reasons.map((r) => t.spray.reason[r]).join(", ") || t.level.good} · ΔT ${h.deltaT.toFixed(1)}°`,
                }))}
                ticks={m.spray
                  .map((h, i) => ({ h, i }))
                  .filter(({ h }) => h.time.endsWith("T00:00") || h.time.endsWith("T12:00"))
                  .map(({ h, i }) => ({ index: i, label: `${f.day(h.time)} ${f.time(h.time)}` }))}
              />
            </div>
          ) : (
            <Skeleton h={180} />
          )}
        </Card>

        <SoilCard />
      </div>

      <Card id="water" title={t.field.waterTitle} sub={t.field.waterSub} icon={Droplets} tone="water">
        {m.ready ? (
          <div className="stack">
            <div className="grid grid-2" style={{ alignItems: "center" }}>
              <IrrigationVerdict advice={m.advice} />
              <div className="stack" style={{ gap: 8 }}>
                {p.irrigation !== "rainfed" && !m.crop.flooded && (
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => {
                      const d = m.water[m.w.todayIndex];
                      const mm = d ? Math.round(d.depletion * EFFICIENCY[p.irrigation]) || 25 : 25;
                      logIrrigation({ date: m.w.days[m.w.todayIndex]!.date, mm: Math.max(20, mm) });
                      setIrrVersion((v) => v + 1);
                      toast(t.irrigate.logged);
                    }}
                  >
                    <Droplets /> {t.irrigate.logToday}
                  </button>
                )}
                <p className="muted" style={{ fontSize: "var(--text-sm)" }}>
                  {t.irrigationMethod[p.irrigation]} · {m.soil?.texture} · {m.soil?.awcMmPerM} mm/m
                </p>
              </div>
            </div>
            <WaterChart
              label={t.field.waterTitle}
              todayIndex={m.w.todayIndex}
              dayLabel={(d) => f.date(d)}
              labels={{ water: t.field.depletion, stress: t.field.raw, today: t.field.today }}
              days={m.water.map((d) => ({
                date: d.date,
                available: Math.max(0, d.taw - d.depletion),
                stressAt: d.taw - d.raw,
                capacity: d.taw,
                rain: d.rain,
                irrigation: d.irrigation,
              }))}
            />
            <SourceNote>
              FAO Irrigation & Drainage Paper 56 (Allen et al., 1998). ET₀ and soil moisture: Open-Meteo. Soil
              water holding: Saxton & Rawls (2006).
            </SourceNote>
          </div>
        ) : (
          <Skeleton h={260} />
        )}
      </Card>

      <Card id="risk" title={t.risk.title} sub={t.risk.sub} icon={Bug}>
        {m.ready ? <RiskTable risks={m.risks} /> : <Skeleton h={200} />}
      </Card>
    </div>
  );
}

const LEVEL_FILL = ["var(--surface-3)", "var(--warning)", "var(--serious)", "var(--critical)"];

function RiskTable({ risks }: { risks: import("@/lib/agro/disease").ThreatRisk[] }) {
  const t = useT();
  const f = useFmt();
  const lang = useLang();
  if (!risks.length) return <p className="muted">{t.risk.none}</p>;
  const days = risks[0]!.days;
  const levelName = (l: RiskLevel) => [t.level.none, t.level.low, t.level.moderate, t.level.high][l];
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div
        className="risk-grid"
        style={{ gridTemplateColumns: `minmax(120px, 1.4fr) repeat(${days.length}, minmax(26px, 1fr))` }}
      >
        <span />
        {days.map((d) => (
          <span key={d.date} className="tick-label">
            {f.day(d.date)}
          </span>
        ))}
        {risks.map((r) => {
          const th = threatById.get(r.threatId);
          return (
            <div key={r.threatId} className="risk-row" style={{ display: "contents" }}>
              <Link to={`/learn?q=${r.threatId}`} className="risk-name">
                <b>{th?.name[lang]}</b>
                <small>{t.risk.driver[r.driver]}</small>
              </Link>
              {r.days.map((d) => (
                <span
                  key={d.date}
                  className="risk-cell"
                  role="img"
                  style={{ background: LEVEL_FILL[d.level] }}
                  title={`${f.date(d.date)}: ${levelName(d.level)} (${d.hours} h)`}
                  aria-label={`${th?.name[lang]} ${f.date(d.date)}: ${levelName(d.level)}`}
                  data-level={d.level}
                >
                  {d.level >= 2 ? (d.level === 3 ? "H" : "M") : ""}
                </span>
              ))}
            </div>
          );
        })}
      </div>
      <div className="legend">
        {([1, 2, 3] as RiskLevel[]).map((l) => (
          <span key={l}>
            <i className="band" style={{ background: LEVEL_FILL[l], opacity: 0.9 }} />
            {levelName(l)}
          </span>
        ))}
      </div>
      {risks
        .filter((r) => r.peak >= 2)
        .slice(0, 3)
        .map((r) => {
          const th = threatById.get(r.threatId)!;
          return (
            <div key={r.threatId} className="alert" data-level={r.peak === 3 ? "critical" : "warning"}>
              <div style={{ display: "grid", gap: 6 }}>
                <div className="row" style={{ gap: 8 }}>
                  <RiskBadge level={r.peak} />
                  <b>{th.name[lang]}</b>
                </div>
                <p data-speak>{th.act[lang]}</p>
              </div>
            </div>
          );
        })}
    </div>
  );
}

function SoilCard() {
  const t = useT();
  const f = useFmt();
  const p = useProfile();
  const { soil, isLoading, fromSoilGrids } = useSoil(p.place);
  const m = useFieldModel();
  if (isLoading || !soil) {
    return (
      <Card title={t.field.soilTitle} icon={Layers} tone="accent">
        <Skeleton h={160} />
      </Card>
    );
  }
  const [lo, hi] = m.crop.ph;
  const phNote = soil.ph < lo ? t.field.phLow : soil.ph > hi ? t.field.phHigh : t.field.phOk;
  return (
    <Card
      title={t.field.soilTitle}
      sub={fromSoilGrids ? t.field.soilFrom : t.field.soilManual}
      icon={Layers}
      tone="accent"
    >
      <div className="soil-bar" aria-hidden="true">
        <i style={{ width: `${soil.sand}%`, background: "#D9B98A" }} />
        <i style={{ width: `${soil.silt}%`, background: "#B08D66" }} />
        <i style={{ width: `${soil.clay}%`, background: "#7E5A3C" }} />
      </div>
      <div className="legend" style={{ margin: "8px 0 14px" }}>
        <span>
          <i className="band" style={{ background: "#D9B98A", opacity: 1 }} />
          Sand {f.num(soil.sand)}%
        </span>
        <span>
          <i className="band" style={{ background: "#B08D66", opacity: 1 }} />
          Silt {f.num(soil.silt)}%
        </span>
        <span>
          <i className="band" style={{ background: "#7E5A3C", opacity: 1 }} />
          Clay {f.num(soil.clay)}%
        </span>
      </div>
      <dl className="kv">
        <dt>{t.field.texture}</dt>
        <dd style={{ textTransform: "capitalize" }}>{soil.texture}</dd>
        <dt>{t.field.ph}</dt>
        <dd>{f.num(soil.ph, 1)}</dd>
        <dt>{t.field.awc}</dt>
        <dd>{soil.awcMmPerM} mm/m</dd>
        <dt>{t.field.organicCarbon}</dt>
        <dd>{f.num(soil.socGkg, 1)} g/kg</dd>
      </dl>
      <div
        className="alert"
        data-level={phNote === t.field.phOk ? "good" : "warning"}
        style={{ marginTop: 14 }}
      >
        <Status level={phNote === t.field.phOk ? "good" : "warning"}>{t.field.ph}</Status>
        <p style={{ alignSelf: "center" }}>{phNote}</p>
      </div>
    </Card>
  );
}
