import { Bug, ChevronRight, Droplets, type LucideIcon, SprayCan, Sprout } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { RiskBadge, Status, type StatusLevel } from "@/components/ui";
import { useFmt, useLang, useT } from "@/i18n";
import type { WeatherAlert } from "@/lib/agro/alerts";
import type { ThreatRisk } from "@/lib/agro/disease";
import type { IrrigationAdvice, StageInfo } from "@/lib/agro/fao56";
import type { SprayHour, SprayWindow } from "@/lib/agro/spray";
import { threatById } from "@/lib/knowledge";

export function Verdict({
  tone,
  icon: Icon,
  eyebrow,
  title,
  sub,
  badge,
  to,
}: {
  tone: StatusLevel | "water";
  icon: LucideIcon;
  eyebrow: string;
  title: ReactNode;
  sub?: ReactNode;
  badge?: ReactNode;
  to?: string;
}) {
  const body = (
    <>
      <div className="v-top">
        <span className="eyebrow" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon aria-hidden="true" width={16} height={16} />
          {eyebrow}
        </span>
        {badge}
      </div>
      <div className="v-title" data-speak>
        {title}
      </div>
      {sub && <div className="v-sub">{sub}</div>}
      {to && <ChevronRight className="v-go" aria-hidden="true" />}
    </>
  );
  return to ? (
    <Link to={to} className="verdict verdict--link" data-tone={tone}>
      {body}
    </Link>
  ) : (
    <div className="verdict" data-tone={tone}>
      {body}
    </div>
  );
}

export function IrrigationVerdict({ advice, to }: { advice: IrrigationAdvice; to?: string }) {
  const t = useT();
  const f = useFmt();
  let tone: StatusLevel | "water" = "water";
  let title: ReactNode = "";
  let sub: ReactNode = null;
  switch (advice.kind) {
    case "now":
      tone = "serious";
      title = t.irrigate.now(advice.grossMm);
      sub = t.irrigate.byAmount(advice.grossMm, f.num(advice.litresPerAcre));
      break;
    case "by":
      tone = "warning";
      title = t.irrigate.by(f.date(advice.date));
      sub = t.irrigate.byAmount(advice.grossMm, f.num(advice.litresPerAcre));
      break;
    case "hold-rain":
      tone = "water";
      title = t.irrigate.hold(advice.rainMm, advice.days);
      break;
    case "ok":
      tone = "good";
      title = t.irrigate.ok;
      sub = t.irrigate.okSub(advice.depletionPct);
      break;
    case "rainfed-stress":
      tone = "warning";
      title = t.irrigate.rainfedStress(f.date(advice.date));
      sub = t.irrigate.rainfedSub;
      break;
    case "not-sown":
      tone = "neutral";
      title = t.irrigate.notSown;
      break;
    case "harvest":
      tone = "neutral";
      title = t.irrigate.harvest;
      break;
    case "rice":
      tone = advice.status === "awd-irrigate" ? "warning" : "water";
      title =
        advice.status === "drain"
          ? t.irrigate.riceDrain
          : advice.status === "awd-irrigate"
            ? t.irrigate.riceAwd(advice.dryDays)
            : t.irrigate.riceFlooded;
      sub = advice.status === "awd-irrigate" ? t.irrigate.riceAwdSub : null;
      break;
  }
  return <Verdict tone={tone} icon={Droplets} eyebrow={t.today.irrigation} title={title} sub={sub} to={to} />;
}

export function SprayVerdict({
  hours,
  windows,
  to,
}: {
  hours: SprayHour[];
  windows: SprayWindow[];
  to?: string;
}) {
  const t = useT();
  const f = useFmt();
  const now = hours[0];
  const first = windows[0];
  if (now?.level === "good") {
    const until = windows.find((w) => w.start === now.time);
    return (
      <Verdict
        tone="good"
        icon={SprayCan}
        eyebrow={t.today.spraying}
        title={t.spray.goodNow}
        sub={until ? t.spray.window(f.time(until.start), f.time(addHour(until.end))) : null}
        to={to}
      />
    );
  }
  if (first) {
    const sameDay = first.start.slice(0, 10) === hours[0]?.time.slice(0, 10);
    return (
      <Verdict
        tone="warning"
        icon={SprayCan}
        eyebrow={t.today.spraying}
        title={t.spray.window(
          `${sameDay ? "" : `${f.day(first.start)} `}${f.time(first.start)}`,
          f.time(addHour(first.end)),
        )}
        sub={now ? now.reasons.map((r) => t.spray.reason[r]).join(" · ") : null}
        to={to}
      />
    );
  }
  return (
    <Verdict
      tone="critical"
      icon={SprayCan}
      eyebrow={t.today.spraying}
      title={t.spray.none}
      sub={t.spray.noneSub}
      to={to}
    />
  );
}

/** "2026-10-14T06:00" + 1 h, staying in the field's local clock (strings carry no zone). */
const addHour = (iso: string) => {
  const d = new Date(`${iso}:00Z`);
  d.setUTCHours(d.getUTCHours() + 1);
  return d.toISOString().slice(0, 16);
};

export function RiskVerdict({ risks, to }: { risks: ThreatRisk[]; to?: string }) {
  const t = useT();
  const f = useFmt();
  const lang = useLang();
  const top = risks[0];
  if (!top || top.peak <= 1) {
    return (
      <Verdict
        tone="good"
        icon={Bug}
        eyebrow={t.today.pestRisk}
        title={t.risk.none}
        sub={t.risk.noneSub}
        to={to}
      />
    );
  }
  const threat = threatById.get(top.threatId);
  return (
    <Verdict
      tone={top.peak === 3 ? "critical" : "warning"}
      icon={Bug}
      eyebrow={t.today.pestRisk}
      badge={<RiskBadge level={top.peak} />}
      title={threat?.name[lang] ?? top.threatId}
      sub={`${t.risk.driver[top.driver]} · ${t.risk.peak(f.date(top.peakDate))}`}
      to={to}
    />
  );
}

export function StageVerdict({ stage, to }: { stage: StageInfo; to?: string }) {
  const t = useT();
  const f = useFmt();
  const daysLeft = Math.max(0, Math.round((stage.harvestDate.getTime() - Date.now()) / 86400000));
  const sub =
    stage.stage === "presowing"
      ? t.stage.sowsIn(-stage.das)
      : stage.stage === "harvest"
        ? t.stage.harvestOn(f.date(stage.harvestDate))
        : `${t.stage.day(stage.das)} · ${t.stage.harvestIn(daysLeft)}`;
  return (
    <Verdict
      tone="good"
      icon={Sprout}
      eyebrow={t.today.cropStage}
      title={t.stage[stage.stage]}
      sub={
        <span className="stage-sub">
          <span>{sub}</span>
          <span className="stage-bar" aria-hidden="true">
            <i style={{ width: `${Math.round(stage.progress * 100)}%` }} />
          </span>
        </span>
      }
      to={to}
    />
  );
}

const ALERT_LEVEL: Record<WeatherAlert["level"], StatusLevel> = {
  warning: "warning",
  serious: "serious",
  critical: "critical",
};

export function AlertList({ alerts }: { alerts: WeatherAlert[] }) {
  const t = useT();
  const f = useFmt();
  if (!alerts.length) {
    return (
      <div className="alert" data-level="good">
        <Status level="good">{t.level.good}</Status>
        <p style={{ alignSelf: "center" }}>{t.today.noAlerts}</p>
      </div>
    );
  }
  return (
    <div className="stack" style={{ gap: 10 }}>
      {alerts.map((a) => (
        <div key={a.kind} className="alert" data-level={a.level} data-speak>
          <div style={{ display: "grid", gap: 6 }}>
            <div className="row" style={{ gap: 8 }}>
              <Status level={ALERT_LEVEL[a.level]}>{t.level[a.level]}</Status>
              <span className="muted" style={{ fontSize: "var(--text-sm)" }}>
                {f.day(a.date)} {f.date(a.date)}
              </span>
            </div>
            <p style={{ color: "var(--ink)" }}>{t.alert[a.kind](Math.round(a.value))}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
