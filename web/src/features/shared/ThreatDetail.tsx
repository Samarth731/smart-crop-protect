import { FlaskConical, Leaf, Shovel } from "lucide-react";
import { useLang, useT } from "@/i18n";
import { CROPS } from "@/lib/crops";
import type { Threat } from "@/lib/knowledge";

export function KindBadge({ kind }: { kind: Threat["kind"] }) {
  const t = useT();
  return <span className={`kind kind--${kind}`}>{t.kind[kind]}</span>;
}

export function ThreatDetail({ threat, compact = false }: { threat: Threat; compact?: boolean }) {
  const t = useT();
  const lang = useLang();
  return (
    <div className="threat">
      <div className="threat-act" data-speak>
        <b>{t.scan.whatToDo}</b>
        <p>{threat.act[lang]}</p>
      </div>
      {!compact && (
        <>
          <dl className="threat-facts">
            <dt>{t.scan.signs}</dt>
            <dd>{threat.signs}</dd>
            <dt>{t.scan.favours}</dt>
            <dd>{threat.favours}</dd>
          </dl>
          <div className="manage">
            <ManageList icon={Shovel} title={t.scan.cultural} items={threat.manage.cultural} />
            {threat.manage.biological && (
              <ManageList icon={Leaf} title={t.scan.biological} items={threat.manage.biological} />
            )}
            {threat.manage.chemical && (
              <ManageList icon={FlaskConical} title={t.scan.chemical} items={threat.manage.chemical} />
            )}
          </div>
          {threat.crops !== "all" && (
            <p className="muted" style={{ fontSize: "var(--text-xs)", marginTop: 8 }}>
              {threat.crops.map((c) => CROPS[c].name[lang]).join(" · ")}
            </p>
          )}
          <p className="source" style={{ marginTop: 6 }}>
            {t.app.disclaimer}
          </p>
        </>
      )}
    </div>
  );
}

function ManageList({ icon: Icon, title, items }: { icon: typeof Leaf; title: string; items: string[] }) {
  return (
    <div className="manage-col">
      <span className="eyebrow" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <Icon width={15} height={15} aria-hidden="true" /> {title}
      </span>
      <ul className="bullets">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}
