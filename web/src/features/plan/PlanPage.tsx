import { useQuery } from "@tanstack/react-query";
import { CalendarRange, ListChecks, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { CropGlyph } from "@/components/art";
import { Card, Skeleton, SourceNote } from "@/components/ui";
import { useFmt, useLang, useT } from "@/i18n";
import { addDays, parseDate, type StageId } from "@/lib/agro/fao56";
import { CROPS, type CropId, marketableQAcre, SEASON_NAMES, totalDays } from "@/lib/crops";
import { priceFor } from "@/lib/economics";
import { zoneOf } from "@/lib/geo";
import { nextSeason, sowingForecasts } from "@/lib/ml/yieldModel";
import { useProfile } from "@/state/profile";
import { useFieldModel, usePrices, useSoil } from "@/state/queries";

export default function PlanPage() {
  const t = useT();
  const p = useProfile();
  const crop = CROPS[p.crop];
  return (
    <div className="page">
      <header className="page-head">
        <span className="eyebrow">
          {crop.name[p.lang]} · {SEASON_NAMES[p.season][p.lang]}
        </span>
        <h1>{t.plan.title}</h1>
        <p>{t.plan.sub}</p>
      </header>
      <Timeline />
      <div className="grid grid-main">
        <Advisor />
        <Checklist />
      </div>
    </div>
  );
}

const STAGE_IDS: StageId[] = ["initial", "development", "mid", "late"];
const STAGE_COLORS = ["#C9B27A", "#8DBB5A", "#4F9A45", "#D4A84A"];

function Timeline() {
  const t = useT();
  const f = useFmt();
  const p = useProfile();
  const m = useFieldModel();
  const crop = CROPS[p.crop];
  const sow = parseDate(p.sowingDate);
  const total = totalDays(crop);
  let acc = 0;
  const segs = crop.stages.map((len, i) => {
    const s = { id: STAGE_IDS[i]!, start: acc, len, color: STAGE_COLORS[i]! };
    acc += len;
    return s;
  });
  const nowPct = Math.max(0, Math.min(100, (m.stage.das / total) * 100));
  return (
    <Card title={t.plan.timeline} icon={CalendarRange}>
      <div className="timeline">
        <div className="tl-track">
          {segs.map((s) => (
            <div
              key={s.id}
              className="tl-seg"
              data-active={m.stage.stage === s.id}
              style={{ width: `${(s.len / total) * 100}%`, background: s.color }}
            >
              <span>{t.stage[s.id]}</span>
            </div>
          ))}
          {m.stage.stage !== "presowing" && m.stage.stage !== "harvest" && (
            <div
              className="tl-now"
              style={{ left: `${nowPct}%` }}
              role="img"
              aria-label={t.stage.day(m.stage.das)}
            >
              <span>{t.stage.day(m.stage.das)}</span>
            </div>
          )}
        </div>
        <div className="tl-dates">
          {segs.map((s) => (
            <div key={s.id} style={{ width: `${(s.len / total) * 100}%` }}>
              <b>{f.date(addDays(sow, s.start))}</b>
              <small>{t.units.days(s.len)}</small>
            </div>
          ))}
        </div>
        <div className="spread" style={{ marginTop: 12 }}>
          <span className="pill-badge">
            {t.plan.sowing}: {f.date(sow)}
          </span>
          <span className="pill-badge">
            {t.plan.harvest}: {f.date(addDays(sow, total))}
          </span>
        </div>
      </div>
    </Card>
  );
}

function Checklist() {
  const t = useT();
  const p = useProfile();
  const m = useFieldModel();
  const [text, setText] = useState("");
  const stageTasks = t.plan.stageTasks[m.stage.stage];
  const key = (i: number) => `${p.crop}:${m.stage.stage}:${i}`;
  const add = () => {
    const v = text.trim();
    if (!v) return;
    p.addTask(v);
    setText("");
  };
  return (
    <Card title={t.plan.tasksTitle} sub={t.stage[m.stage.stage]} icon={ListChecks}>
      <div>
        {stageTasks.map((txt, i) => {
          const done = p.doneStageTasks.includes(key(i));
          const id = `st-${i}`;
          return (
            <div key={txt} className={`task ${done ? "done" : ""}`}>
              <input id={id} type="checkbox" checked={done} onChange={() => p.toggleStageTask(key(i))} />
              <label htmlFor={id}>{txt}</label>
            </div>
          );
        })}
        {p.tasks.map((task) => (
          <div key={task.id} className={`task ${task.done ? "done" : ""}`}>
            <input id={task.id} type="checkbox" checked={task.done} onChange={() => p.toggleTask(task.id)} />
            <label htmlFor={task.id}>{task.text}</label>
            <button
              type="button"
              className="iconbtn"
              aria-label="Delete"
              onClick={() => p.removeTask(task.id)}
            >
              <Trash2 />
            </button>
          </div>
        ))}
      </div>
      <label className="field" style={{ marginTop: 14 }}>
        <span>{t.plan.addTask}</span>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input
            className="input"
            value={text}
            maxLength={100}
            placeholder={t.plan.addPlaceholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <button type="button" className="btn" onClick={add} aria-label={t.plan.add}>
            <Plus />
          </button>
        </div>
      </label>
    </Card>
  );
}

function Advisor() {
  const t = useT();
  const f = useFmt();
  const lang = useLang();
  const p = useProfile();
  const prices = usePrices();
  const { soil } = useSoil(p.place);
  const season = nextSeason();
  const q = useQuery({
    queryKey: ["advisor", p.place?.districtCode, season],
    queryFn: () => sowingForecasts(p.place!.stateKey, p.place!.districtCode, season),
    enabled: !!p.place,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const zone = p.place ? zoneOf(p.place.state) : "north";
  const rows = (q.data ?? [])
    .map((fc) => {
      const crop = CROPS[fc.crop as CropId];
      if (!crop) return null;
      const price = priceFor(crop, prices.data, zone);
      if (!price) return null;
      const perAcre = marketableQAcre(crop, fc.p50) * price.perQuintal;
      const low = marketableQAcre(crop, fc.p10) * price.perQuintal;
      const phOk = !soil || (soil.ph >= crop.ph[0] - 0.3 && soil.ph <= crop.ph[1] + 0.3);
      return { crop, fc, perAcre, low, phOk, days: totalDays(crop) };
    })
    .filter((r): r is NonNullable<typeof r> => !!r)
    .sort((a, b) => b.perAcre - a.perAcre)
    .slice(0, 8);
  const best = rows[0]?.perAcre ?? 1;
  return (
    <Card
      title={t.plan.advisorTitle}
      sub={t.plan.advisorSub(SEASON_NAMES[season][lang], p.place?.district ?? "")}
      icon={Sparkles}
      tone="accent"
    >
      {q.isLoading || prices.isLoading ? (
        <Skeleton h={220} />
      ) : rows.length === 0 ? (
        <p className="muted">{t.plan.noAdvisor}</p>
      ) : (
        <div className="advisor">
          {rows.map((r, i) => (
            <div key={r.crop.id} className="adv-row" data-top={i === 0}>
              <CropGlyph crop={r.crop.id} size={32} />
              <div className="adv-main">
                <div className="spread">
                  <b>{r.crop.name[lang]}</b>
                  <b className="num">{f.compactInr(r.perAcre)}</b>
                </div>
                <div className="adv-bar" aria-hidden="true">
                  <i style={{ width: `${(r.perAcre / best) * 100}%` }} />
                  <i className="adv-low" style={{ left: 0, right: `${100 - (r.low / best) * 100}%` }} />
                </div>
                <div className="spread muted" style={{ fontSize: "var(--text-xs)" }}>
                  <span>
                    {t.plan.expectedYield}: {f.num(marketableQAcre(r.crop, r.fc.p50), 1)} {t.units.qacre} ·{" "}
                    {t.units.days(r.days)}
                    {!r.phOk && " · pH ⚠"}
                  </span>
                  <span>
                    {t.plan.risk}: {f.compactInr(r.low)}
                  </span>
                </div>
              </div>
            </div>
          ))}
          <SourceNote>
            Gross income at sowing-time yield forecast × MSP (or farm-gate market price); excludes cost of
            cultivation.
          </SourceNote>
        </div>
      )}
    </Card>
  );
}
