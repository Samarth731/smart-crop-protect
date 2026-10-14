import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/art";
import { FieldScene } from "@/components/FieldScene";
import { CropPicker, LocationPicker } from "@/components/pickers";
import { LANGS, useT } from "@/i18n";
import { CROPS, SEASON_NAMES } from "@/lib/crops";
import { type Irrigation, useProfile } from "@/state/profile";

const STEPS = 4;

export function Onboarding() {
  const t = useT();
  const p = useProfile();
  const [step, setStep] = useState(0);
  const crop = CROPS[p.crop];
  const canNext = step !== 1 || !!p.place;
  const hour = new Date().getHours() + new Date().getMinutes() / 60;

  const next = () => {
    if (step < STEPS - 1) setStep(step + 1);
    else p.set({ onboarded: true });
  };

  return (
    <div className="onboard">
      <FieldScene hour={hour} sky="partly" crop={p.crop} progress={step >= 2 ? 0.55 : 0.4} height={0}>
        {null}
      </FieldScene>
      <div className="onboard-panel">
        <div className="onboard-top">
          <span className="brand">
            <Logo size={30} /> {t.app.name}
          </span>
          <div className="dots" aria-hidden="true">
            {Array.from({ length: STEPS }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length progress dots
              <i key={i} data-on={i === step} />
            ))}
          </div>
        </div>

        <div className="onboard-body" key={step}>
          {step === 0 && (
            <div className="stack">
              <h1 className="onboard-title">{t.onboarding.welcomeTitle}</h1>
              <p className="ink-2" style={{ fontSize: "1.08rem" }}>
                {t.onboarding.welcomeBody}
              </p>
              <div className="lang-grid" role="radiogroup" aria-label={t.onboarding.languageTitle}>
                {LANGS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    role="radio"
                    aria-checked={p.lang === l.id}
                    className="lang-tile"
                    onClick={() => p.set({ lang: l.id })}
                    lang={l.id}
                  >
                    <b>{l.native}</b>
                    <small>{l.label}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="stack">
              <h1 className="onboard-title">{t.onboarding.locationTitle}</h1>
              <p className="ink-2">{t.onboarding.locationBody}</p>
              <LocationPicker value={p.place} onChange={(place) => p.set({ place })} />
            </div>
          )}

          {step === 2 && (
            <div className="stack">
              <h1 className="onboard-title">{t.onboarding.cropTitle}</h1>
              <CropPicker value={p.crop} onChange={p.setCrop} lang={p.lang} />
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
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="stack">
              <h1 className="onboard-title">{t.onboarding.fieldTitle}</h1>
              <label className="field">
                <span>{t.onboarding.area}</span>
                <div className="input-group">
                  <input
                    className="input"
                    type="number"
                    inputMode="decimal"
                    min={0.1}
                    step={0.5}
                    value={p.areaAcres}
                    onChange={(e) => p.set({ areaAcres: Math.max(0.1, Number(e.target.value) || 0.1) })}
                  />
                  <span className="unit">{t.units.acres}</span>
                </div>
              </label>
              <div className="field">
                <span>{t.onboarding.irrigation}</span>
                <div className="choice-grid">
                  {(["rainfed", "flood", "sprinkler", "drip"] as Irrigation[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className="chip chip--lg"
                      aria-pressed={p.irrigation === m}
                      onClick={() => p.set({ irrigation: m })}
                    >
                      {t.irrigationMethod[m]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="note">
                <b>{t.onboarding.ready}.</b> {t.onboarding.readyBody}
              </div>
            </div>
          )}
        </div>

        <div className="onboard-nav">
          {step > 0 ? (
            <button type="button" className="btn btn--ghost" onClick={() => setStep(step - 1)}>
              <ArrowLeft /> {t.app.back}
            </button>
          ) : (
            <span />
          )}
          <button type="button" className="btn" onClick={next} disabled={!canNext}>
            {step === 0 ? t.onboarding.start : step === STEPS - 1 ? t.app.done : t.app.next}
            {step === STEPS - 1 ? <Check /> : <ArrowRight />}
          </button>
        </div>
      </div>
    </div>
  );
}
