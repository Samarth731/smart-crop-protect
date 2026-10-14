import { Loader2, LocateFixed } from "lucide-react";
import { useMemo, useState } from "react";
import { useT } from "@/i18n";
import { CROP_IDS, CROPS, type CropId, type Lang } from "@/lib/crops";
import { type District, getPosition, insideIndia, nearestDistrict } from "@/lib/geo";
import type { Place } from "@/state/profile";
import { useDistricts } from "@/state/queries";
import { CropGlyph } from "./art";

export const placeFromDistrict = (d: District, source: Place["source"], lat = d.la, lon = d.lo): Place => ({
  lat,
  lon,
  districtCode: d.c,
  district: d.n,
  state: d.s,
  stateKey: d.k,
  source,
});

export function LocationPicker({ value, onChange }: { value: Place | null; onChange: (p: Place) => void }) {
  const t = useT();
  const { data: districts } = useDistricts();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [stateSel, setStateSel] = useState(value?.state ?? "");

  const states = useMemo(() => [...new Set((districts ?? []).map((d) => d.s))].sort(), [districts]);
  const inState = useMemo(
    () => (districts ?? []).filter((d) => d.s === stateSel).sort((a, b) => a.n.localeCompare(b.n)),
    [districts, stateSel],
  );

  const gps = async () => {
    setBusy(true);
    setMsg(t.onboarding.locating);
    try {
      const pos = await getPosition();
      const { latitude: lat, longitude: lon } = pos.coords;
      if (!insideIndia(lat, lon) || !districts) {
        setMsg(t.onboarding.outsideIndia);
        return;
      }
      const { d } = nearestDistrict(districts, lat, lon);
      setStateSel(d.s);
      onChange(placeFromDistrict(d, "gps", +lat.toFixed(4), +lon.toFixed(4)));
      setMsg(null);
    } catch {
      setMsg(t.onboarding.gpsFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 14 }}>
      <button type="button" className="btn btn--block" onClick={gps} disabled={busy || !districts}>
        {busy ? <Loader2 className="spin" /> : <LocateFixed />}
        {t.onboarding.useGps}
      </button>
      {value && (
        <div className="place-pill" data-speak>
          <LocateFixed aria-hidden="true" />
          <span>
            <b>{value.district}</b>, {value.state}
          </span>
        </div>
      )}
      {msg && (
        <p className="muted" role="status">
          {msg}
        </p>
      )}
      <div className="eyebrow" style={{ textAlign: "center" }}>
        {t.onboarding.orChoose}
      </div>
      <div className="grid grid-2" style={{ gap: 12 }}>
        <label className="field">
          <span>{t.onboarding.state}</span>
          <select className="select" value={stateSel} onChange={(e) => setStateSel(e.target.value)}>
            <option value="" disabled>
              —
            </option>
            {states.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t.onboarding.district}</span>
          <select
            className="select"
            value={value && value.state === stateSel ? String(value.districtCode) : ""}
            disabled={!stateSel}
            onChange={(e) => {
              const d = inState.find((x) => String(x.c) === e.target.value);
              if (d) onChange(placeFromDistrict(d, "manual"));
            }}
          >
            <option value="" disabled>
              —
            </option>
            {inState.map((d) => (
              <option key={d.c} value={d.c}>
                {d.n}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

export function CropPicker({
  value,
  onChange,
  lang,
}: {
  value: CropId;
  onChange: (c: CropId) => void;
  lang: Lang;
}) {
  return (
    <div className="crop-grid" role="radiogroup">
      {CROP_IDS.map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={id === value}
          className="crop-tile"
          onClick={() => onChange(id)}
        >
          <CropGlyph crop={id} size={34} />
          <span>{CROPS[id].name[lang]}</span>
        </button>
      ))}
    </div>
  );
}
