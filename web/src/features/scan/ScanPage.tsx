import { useQuery } from "@tanstack/react-query";
import {
  Camera,
  CloudSun,
  Eye,
  ImagePlus,
  Layers,
  Loader2,
  NotebookPen,
  ScanSearch,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Card, Meter, Seg, Skeleton, Status, useToast } from "@/components/ui";
import { useFmt, useLang, useT } from "@/i18n";
import { diagnose } from "@/lib/agro/diagnose";
import { CROPS } from "@/lib/crops";
import { SYMPTOM_LIST, type Symptom, threatById } from "@/lib/knowledge";
import { classifyLeaf, type LeafPrediction, leafModelMeta } from "@/lib/ml/leafModel";
import { analyzeLeaf, type Severity, thumbnail } from "@/lib/ml/leafSeverity";
import { useProfile } from "@/state/profile";
import { useFieldModel } from "@/state/queries";
import { ThreatDetail } from "../shared/ThreatDetail";

interface LogEntry {
  at: number;
  crop: string;
  thumb: string;
  result: string;
  severity?: number;
}

const LOG_KEY = "scp-scan-log";
const readLog = (): LogEntry[] => {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]") as LogEntry[];
  } catch {
    return [];
  }
};

export default function ScanPage() {
  const t = useT();
  const [tab, setTab] = useState<"photo" | "symptoms">("photo");
  const [log, setLog] = useState<LogEntry[]>(readLog);
  const save = (e: LogEntry) => {
    const next = [e, ...log].slice(0, 20);
    setLog(next);
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(next));
    } catch {
      /* quota */
    }
  };
  return (
    <div className="page">
      <header className="page-head">
        <span className="eyebrow" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <ShieldCheck width={15} height={15} /> {t.scan.privacy}
        </span>
        <h1>{t.scan.title}</h1>
        <p>{t.scan.sub}</p>
      </header>
      <Seg
        label={t.scan.title}
        value={tab}
        onChange={setTab}
        options={[
          { id: "photo", label: t.scan.photoTab },
          { id: "symptoms", label: t.scan.symptomsTab },
        ]}
      />
      {tab === "photo" ? <PhotoScan onSave={save} /> : <SymptomCheck />}
      <FieldLog log={log} />
    </div>
  );
}

function PhotoScan({ onSave }: { onSave: (e: LogEntry) => void }) {
  const t = useT();
  const lang = useLang();
  const toast = useToast();
  const { crop } = useProfile();
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sev, setSev] = useState<Severity | null>(null);
  const [pred, setPred] = useState<LeafPrediction | null>(null);
  const [showMap, setShowMap] = useState(true);
  const model = useQuery({
    queryKey: ["leaf-meta"],
    queryFn: leafModelMeta,
    staleTime: Number.POSITIVE_INFINITY,
  });

  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);

  const pick = (f: File | undefined) => {
    if (!f?.type.startsWith("image/")) return;
    setFile(f);
    setUrl(URL.createObjectURL(f));
    setSev(null);
    setPred(null);
  };

  const analyse = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const [s, p] = await Promise.all([
        analyzeLeaf(file),
        model.data ? classifyLeaf(file, crop).catch(() => null) : Promise.resolve(null),
      ]);
      setSev(s);
      setPred(p);
      setShowMap(true);
    } catch {
      toast(t.app.error);
    } finally {
      setBusy(false);
    }
  };

  const top = pred?.top[0];
  const topThreat = top?.cls.threat ? threatById.get(top.cls.threat) : undefined;

  return (
    <div className="grid grid-2">
      <Card title={t.scan.take} sub={t.scan.tips} icon={Camera}>
        <label className="dropzone" data-has={!!url}>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          {url ? (
            <img src={showMap && sev ? sev.overlay : url} alt="" />
          ) : (
            <span className="dz-empty">
              <ImagePlus aria-hidden="true" />
              {t.scan.take}
            </span>
          )}
        </label>
        <div className="row" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn"
            onClick={analyse}
            disabled={!file || busy}
            style={{ flex: 1 }}
          >
            {busy ? <Loader2 className="spin" /> : <ScanSearch />}
            {busy ? (model.data ? t.scan.loadingModel : t.scan.analyzing) : t.scan.analyze}
          </button>
          {sev && (
            <button
              type="button"
              className="btn btn--secondary btn--icon"
              aria-pressed={showMap}
              aria-label={t.scan.severity}
              onClick={() => setShowMap((v) => !v)}
            >
              {showMap ? <Eye /> : <Layers />}
            </button>
          )}
        </div>
        {model.isFetched && !model.data && (
          <p className="muted" style={{ fontSize: "var(--text-sm)", marginTop: 10 }}>
            {t.scan.modelUnavailable}
          </p>
        )}
      </Card>

      <Card title={t.scan.results} icon={Stethoscope}>
        {!sev && !busy && <p className="muted">{t.scan.tips}</p>}
        {busy && <Skeleton h={180} />}
        {sev && (
          <div className="stack">
            {pred && top && (
              <div className="stack" style={{ gap: 10 }}>
                {pred.unsure ? (
                  <div className="alert" data-level="warning">
                    <p style={{ color: "var(--ink)" }}>{t.scan.unsure}</p>
                  </div>
                ) : (
                  <div className="diag-top" data-speak>
                    <span className="eyebrow">{t.scan.likely}</span>
                    <h3>{top.cls.healthy ? t.scan.healthy : (topThreat?.name[lang] ?? top.cls.name)}</h3>
                    <Status level={top.cls.healthy ? "good" : top.p > 0.75 ? "critical" : "warning"}>
                      {t.scan.confidence(Math.round(top.p * 100))}
                    </Status>
                    {top.cls.crop !== crop && CROPS[top.cls.crop as keyof typeof CROPS] && (
                      <p className="muted">
                        {t.scan.otherCrop(CROPS[top.cls.crop as keyof typeof CROPS].name[lang])}
                      </p>
                    )}
                  </div>
                )}
                <div className="stack" style={{ gap: 8 }}>
                  {pred.top.slice(pred.unsure ? 0 : 1).map((x) => (
                    <div key={x.cls.id} className="prob-row">
                      <span>
                        {x.cls.healthy
                          ? `${t.scan.healthy} (${CROPS[x.cls.crop as keyof typeof CROPS]?.name[lang] ?? x.cls.crop})`
                          : (x.cls.threat && threatById.get(x.cls.threat)?.name[lang]) || x.cls.name}
                      </span>
                      <Meter value={x.p} label={x.cls.name} />
                      <b className="num">{Math.round(x.p * 100)}%</b>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="spread">
                <span className="eyebrow">{t.scan.severity}</span>
                <b className="num" style={{ fontSize: "var(--text-xl)" }}>
                  {sev.leafFraction < 0.06 ? "—" : `${Math.round(sev.severity * 100)}%`}
                </b>
              </div>
              <div className="sev-bar" aria-hidden="true">
                <i style={{ width: `${sev.healthy * 100}%`, background: "var(--good)" }} />
                <i style={{ width: `${sev.chlorotic * 100}%`, background: "var(--warning)" }} />
                <i style={{ width: `${sev.necrotic * 100}%`, background: "var(--critical)" }} />
                <i style={{ width: `${sev.powdery * 100}%`, background: "var(--water)" }} />
              </div>
              <p className="muted" style={{ fontSize: "var(--text-xs)", marginTop: 6 }}>
                {sev.leafFraction < 0.06 ? t.scan.unsure : t.scan.severityNote}
              </p>
            </div>
            {topThreat && !pred?.unsure && <ThreatDetail threat={topThreat} />}
            <button
              type="button"
              className="btn btn--secondary"
              onClick={async () => {
                if (!file) return;
                onSave({
                  at: Date.now(),
                  crop,
                  thumb: await thumbnail(file),
                  result:
                    top && !pred?.unsure
                      ? top.cls.healthy
                        ? t.scan.healthy
                        : (topThreat?.name[lang] ?? top.cls.name)
                      : t.scan.severity,
                  severity: sev.severity,
                });
                toast(t.scan.saved);
              }}
            >
              <NotebookPen /> {t.scan.saveLog}
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}

function SymptomCheck() {
  const t = useT();
  const lang = useLang();
  const { crop } = useProfile();
  const m = useFieldModel();
  const [seen, setSeen] = useState<Symptom[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const results = useMemo(
    () => (seen.length ? diagnose(crop, seen, m.ready ? m.risks : []) : []),
    [crop, seen, m],
  );
  const riskBy = new Map((m.ready ? m.risks : []).map((r) => [r.threatId, r.peak]));
  const toggle = (s: Symptom) => setSeen((v) => (v.includes(s) ? v.filter((x) => x !== s) : [...v, s]));
  return (
    <div className="grid grid-2">
      <Card title={t.scan.pickSymptoms} sub={CROPS[crop].name[lang]} icon={Eye}>
        <div className="chips">
          {SYMPTOM_LIST.map((s) => (
            <button
              key={s}
              type="button"
              className="chip"
              aria-pressed={seen.includes(s)}
              onClick={() => toggle(s)}
            >
              {t.symptom[s]}
            </button>
          ))}
        </div>
        {seen.length > 0 && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            style={{ marginTop: 12 }}
            onClick={() => setSeen([])}
          >
            {t.scan.clear}
          </button>
        )}
      </Card>
      <Card title={t.scan.results} icon={Stethoscope}>
        {!results.length ? (
          <p className="muted">{t.scan.noMatch}</p>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            {results.slice(0, 4).map((r, i) => (
              <div
                key={r.threat.id}
                className="diag-row"
                data-open={open === r.threat.id || (open === null && i === 0)}
              >
                <button
                  type="button"
                  className="diag-head"
                  onClick={() => setOpen(open === r.threat.id ? "" : r.threat.id)}
                >
                  <span className="diag-name">
                    <b>{r.threat.name[lang]}</b>
                    <small>
                      {i === 0 ? t.scan.likely : t.scan.possible}
                      {r.matched.length > 0 &&
                        ` · ${t.scan.matched}: ${r.matched.map((s) => t.symptom[s]).join(", ")}`}
                    </small>
                    {(riskBy.get(r.threat.id) ?? 0) >= 2 && (
                      <span className="status" data-level="info" style={{ marginTop: 4 }}>
                        <CloudSun /> {t.scan.weatherBoost}
                      </span>
                    )}
                  </span>
                  <span className="diag-p">
                    <b className="num">{Math.round(r.probability * 100)}%</b>
                    <Meter value={r.probability} label={r.threat.name[lang]} />
                  </span>
                </button>
                {(open === r.threat.id || (open === null && i === 0)) && <ThreatDetail threat={r.threat} />}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function FieldLog({ log }: { log: LogEntry[] }) {
  const t = useT();
  const f = useFmt();
  const lang = useLang();
  return (
    <Card title={t.scan.log} icon={NotebookPen}>
      {log.length === 0 ? (
        <p className="muted">{t.scan.logEmpty}</p>
      ) : (
        <ul className="list">
          {log.map((e) => (
            <li key={e.at}>
              <img src={e.thumb} alt="" width={48} height={48} className="thumb" />
              <span style={{ flex: 1 }}>
                <b>{e.result}</b>
                <br />
                <small className="muted">
                  {f.date(new Date(e.at))} · {CROPS[e.crop as keyof typeof CROPS]?.name[lang]}
                  {e.severity !== undefined && ` · ${Math.round(e.severity * 100)}%`}
                </small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
