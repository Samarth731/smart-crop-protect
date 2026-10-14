import { Languages, Lock, MapPin, Monitor, Moon, RotateCcw, Sprout, Sun, Type } from "lucide-react";
import { useState } from "react";
import { CropPicker, LocationPicker } from "@/components/pickers";
import { Card, Seg, Sheet } from "@/components/ui";
import { LANGS, useT } from "@/i18n";
import { CROPS, SEASON_NAMES } from "@/lib/crops";
import { type Irrigation, type SoilTexture, useProfile } from "@/state/profile";

export default function SettingsPage() {
  const t = useT();
  const p = useProfile();
  const [locOpen, setLocOpen] = useState(false);
  const crop = CROPS[p.crop];
  return (
    <div className="page">
      <header className="page-head">
        <h1>{t.settings.title}</h1>
      </header>

      <div className="grid grid-2">
        <Card title={t.settings.profile} icon={Sprout}>
          <div className="stack">
            <div className="field">
              <span>{t.settings.location}</span>
              <button
                type="button"
                className="btn btn--secondary"
                style={{ justifyContent: "flex-start" }}
                onClick={() => setLocOpen(true)}
              >
                <MapPin />
                {p.place ? `${p.place.district}, ${p.place.state}` : t.onboarding.useGps}
              </button>
            </div>
            <div className="field">
              <span>{t.settings.crop}</span>
              <CropPicker value={p.crop} onChange={p.setCrop} lang={p.lang} />
            </div>
            <div className="grid grid-2" style={{ gap: 12 }}>
              <label className="field">
                <span>{t.onboarding.season}</span>
                <select
                  className="select"
                  value={p.season}
                  onChange={(e) => p.setSeason(e.target.value as typeof p.season)}
                >
                  {crop.seasons.map((s) => (
                    <option key={s} value={s}>
                      {SEASON_NAMES[s][p.lang]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t.onboarding.sowingDate}</span>
                <input
                  className="input"
                  type="date"
                  value={p.sowingDate}
                  onChange={(e) => e.target.value && p.set({ sowingDate: e.target.value })}
                />
              </label>
              <label className="field">
                <span>{t.onboarding.area}</span>
                <div className="input-group">
                  <input
                    className="input"
                    type="number"
                    min={0.1}
                    step={0.5}
                    inputMode="decimal"
                    value={p.areaAcres}
                    onChange={(e) => p.set({ areaAcres: Math.max(0.1, Number(e.target.value) || 0.1) })}
                  />
                  <span className="unit">{t.units.acres}</span>
                </div>
              </label>
              <label className="field">
                <span>{t.onboarding.irrigation}</span>
                <select
                  className="select"
                  value={p.irrigation}
                  onChange={(e) => p.set({ irrigation: e.target.value as Irrigation })}
                >
                  {(["rainfed", "flood", "sprinkler", "drip"] as Irrigation[]).map((m) => (
                    <option key={m} value={m}>
                      {t.irrigationMethod[m]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              <span>{t.settings.soil}</span>
              <select
                className="select"
                value={p.soil}
                onChange={(e) => p.set({ soil: e.target.value as SoilTexture })}
              >
                <option value="auto">{t.settings.soilAuto}</option>
                <option value="sandy">{t.settings.soilSandy}</option>
                <option value="loamy">{t.settings.soilLoamy}</option>
                <option value="clay">{t.settings.soilClay}</option>
                <option value="black">{t.settings.soilBlack}</option>
              </select>
            </label>
          </div>
        </Card>

        <div className="stack">
          <Card title={t.settings.language} icon={Languages}>
            <div className="lang-grid">
              {LANGS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className="lang-tile"
                  role="radio"
                  aria-checked={p.lang === l.id}
                  onClick={() => p.set({ lang: l.id })}
                  lang={l.id}
                >
                  <b>{l.native}</b>
                  <small>{l.label}</small>
                </button>
              ))}
            </div>
          </Card>
          <Card title={t.settings.theme} icon={Monitor}>
            <div className="stack">
              <Seg
                label={t.settings.theme}
                value={p.theme}
                onChange={(theme) => p.set({ theme })}
                options={[
                  {
                    id: "system",
                    label: (
                      <>
                        <Monitor width={16} height={16} /> {t.settings.themeSystem}
                      </>
                    ),
                  },
                  {
                    id: "light",
                    label: (
                      <>
                        <Sun width={16} height={16} /> {t.settings.themeLight}
                      </>
                    ),
                  },
                  {
                    id: "dark",
                    label: (
                      <>
                        <Moon width={16} height={16} /> {t.settings.themeDark}
                      </>
                    ),
                  },
                ]}
              />
              <div className="field">
                <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <Type width={16} height={16} /> {t.settings.textSize}
                </span>
                <Seg
                  label={t.settings.textSize}
                  value={String(p.textScale) as "1" | "1.15" | "1.3"}
                  onChange={(v) => p.set({ textScale: Number(v) })}
                  options={[
                    { id: "1", label: "A" },
                    { id: "1.15", label: <span style={{ fontSize: "1.15em" }}>A</span> },
                    { id: "1.3", label: <span style={{ fontSize: "1.3em" }}>A</span> },
                  ]}
                />
              </div>
            </div>
          </Card>
          <Card title={t.settings.privacy} icon={Lock}>
            <p className="ink-2">{t.settings.privacyBody}</p>
            <button
              type="button"
              className="btn btn--ghost"
              style={{ marginTop: 12, color: "var(--critical-ink)" }}
              onClick={() => {
                if (!window.confirm(t.settings.resetConfirm)) return;
                for (const k of Object.keys(localStorage))
                  if (k.startsWith("scp")) localStorage.removeItem(k);
                p.reset();
              }}
            >
              <RotateCcw /> {t.settings.reset}
            </button>
          </Card>
          <p className="source" style={{ textAlign: "center" }}>
            {t.app.name} · {t.settings.version(__APP_VERSION__)} ·{" "}
            <a href="https://github.com/Samarth731/smart-crop-protect">GitHub</a>
          </p>
        </div>
      </div>

      <Sheet open={locOpen} onClose={() => setLocOpen(false)} title={t.onboarding.locationTitle}>
        <LocationPicker
          value={p.place}
          onChange={(place) => {
            p.set({ place });
            setLocOpen(false);
          }}
        />
      </Sheet>
    </div>
  );
}
