import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CropGlyph } from "@/components/art";
import { useLang, useT } from "@/i18n";
import { CROP_IDS, CROPS, type CropId } from "@/lib/crops";
import { THREATS, type ThreatKind } from "@/lib/knowledge";
import { useProfile } from "@/state/profile";
import { KindBadge, ThreatDetail } from "../shared/ThreatDetail";

const KINDS: ("all" | ThreatKind)[] = ["all", "fungal", "bacterial", "viral", "insect", "mite", "abiotic"];

export default function LearnPage() {
  const t = useT();
  const lang = useLang();
  const profile = useProfile();
  const [params] = useSearchParams();
  const focus = params.get("q");
  const [crop, setCrop] = useState<CropId | "all">(profile.crop);
  const [kind, setKind] = useState<"all" | ThreatKind>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(focus);

  useEffect(() => {
    if (!focus) return;
    setCrop("all");
    setOpen(focus);
    setTimeout(
      () => document.getElementById(`t-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "start" }),
      50,
    );
  }, [focus]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return THREATS.filter(
      (th) =>
        (crop === "all" || th.crops === "all" || th.crops.includes(crop)) &&
        (kind === "all" || th.kind === kind) &&
        (!q ||
          Object.values(th.name).some((n) => n.toLowerCase().includes(q)) ||
          th.signs.toLowerCase().includes(q)),
    );
  }, [crop, kind, query]);

  return (
    <div className="page">
      <header className="page-head">
        <h1>{t.learn.title}</h1>
        <p>{t.learn.sub}</p>
      </header>
      <div className="searchbox">
        <Search aria-hidden="true" />
        <input
          className="input"
          type="search"
          placeholder={t.learn.search}
          aria-label={t.learn.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="chips chips--scroll" role="group" aria-label={t.settings.crop}>
        <button type="button" className="chip" aria-pressed={crop === "all"} onClick={() => setCrop("all")}>
          {t.learn.allCrops}
        </button>
        {CROP_IDS.map((c) => (
          <button key={c} type="button" className="chip" aria-pressed={crop === c} onClick={() => setCrop(c)}>
            <CropGlyph crop={c} size={18} /> {CROPS[c].name[lang]}
          </button>
        ))}
      </div>
      <div className="chips" role="group">
        {KINDS.map((k) => (
          <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {t.kind[k]}
          </button>
        ))}
      </div>
      <div className="grid grid-2">
        {list.map((th) => (
          <article key={th.id} id={`t-${th.id}`} className="card threat-card" data-open={open === th.id}>
            <button
              type="button"
              className="threat-head"
              onClick={() => setOpen(open === th.id ? null : th.id)}
            >
              <span>
                <KindBadge kind={th.kind} />
                <h2>{th.name[lang]}</h2>
                {lang !== "en" && <small className="muted">{th.name.en}</small>}
              </span>
            </button>
            <ThreatDetail threat={th} compact={open !== th.id} />
          </article>
        ))}
      </div>
    </div>
  );
}
