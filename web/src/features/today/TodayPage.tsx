import { ArrowUpRight, CalendarCheck, Lightbulb, MapPin, TrendingDown, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { CropGlyph, WeatherIcon } from "@/components/art";
import { FieldScene } from "@/components/FieldScene";
import { Card, Skeleton } from "@/components/ui";
import { useFmt, useT } from "@/i18n";
import { skyOf } from "@/lib/api/weather";
import { CROPS, marketableQAcre, SEASON_NAMES } from "@/lib/crops";
import { zoneOf } from "@/lib/geo";
import { useProfile } from "@/state/profile";
import { useFieldModel, usePrices, useYieldForecast } from "@/state/queries";
import { AlertList, IrrigationVerdict, RiskVerdict, SprayVerdict, StageVerdict } from "../shared/verdicts";

export function TodayPage() {
  const t = useT();
  const f = useFmt();
  const p = useProfile();
  const m = useFieldModel();
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  const greet = hour < 12 ? t.greet.morning : hour < 17 ? t.greet.afternoon : t.greet.evening;
  const crop = CROPS[p.crop];
  const w = m.ready ? m.w : undefined;
  const today = w?.days[w.todayIndex];
  const currentHour = w?.hours[w.nowIndex];
  const sky = currentHour ? skyOf(currentHour.code) : "partly";

  return (
    <div className="page">
      <FieldScene
        hour={hour}
        sky={sky}
        crop={p.crop}
        progress={m.stage.progress + (m.stage.stage === "presowing" ? -1 : 0)}
        height={300}
      >
        <div className="spread" style={{ alignItems: "flex-start" }}>
          <div>
            <div className="eyebrow" style={{ color: "inherit", opacity: 0.85 }}>
              {f.longDate(now)}
            </div>
            <h1 style={{ marginTop: 4 }} data-speak>
              {greet}
            </h1>
          </div>
          <Link to="/settings" className="glass">
            <MapPin aria-hidden="true" />
            {p.place ? p.place.district : t.today.setLocation}
          </Link>
        </div>
        <div className="spread" style={{ alignItems: "flex-end" }}>
          <div data-speak>
            {currentHour ? (
              <>
                <div className="temp">{Math.round(currentHour.t)}°</div>
                <div className="cond" style={{ whiteSpace: "nowrap" }}>
                  {today &&
                    `${t.field.max} ${Math.round(today.tmax)}° · ${t.field.min} ${Math.round(today.tmin)}°`}
                </div>
              </>
            ) : (
              <Skeleton h={64} w={120} />
            )}
          </div>
          <Link to="/plan" className="glass" title={SEASON_NAMES[p.season][p.lang]}>
            <CropGlyph crop={p.crop} size={22} />
            <span>{crop.name[p.lang]}</span>
          </Link>
        </div>
      </FieldScene>

      {m.weather.data?.stale && <div className="note">{t.app.staleData}</div>}

      <div className="grid grid-main">
        <div className="stack">
          <div className="grid grid-2">
            {m.ready ? (
              <>
                <IrrigationVerdict advice={m.advice} to="/field#water" />
                <SprayVerdict hours={m.spray} windows={m.windows} to="/field#spray" />
                <RiskVerdict risks={m.risks} to="/field#risk" />
                <StageVerdict stage={m.stage} to="/plan" />
              </>
            ) : (
              [0, 1, 2, 3].map((i) => <Skeleton key={i} h={138} r={22} />)
            )}
          </div>

          <section aria-labelledby="week">
            <div className="section-title">
              <h2 id="week">{t.today.week}</h2>
              <Link to="/field" className="linkbtn">
                {t.app.seeAll}
              </Link>
            </div>
            <div className="scroll-x" style={{ marginTop: 10 }}>
              {w
                ? w.days.slice(w.todayIndex, w.todayIndex + 7).map((d, i) => (
                    <div key={d.date} className="day" data-today={i === 0}>
                      <span className="muted" style={{ fontSize: "var(--text-xs)", fontWeight: 600 }}>
                        {i === 0 ? t.field.today : f.day(d.date)}
                      </span>
                      <WeatherIcon sky={skyOf(d.code)} />
                      <b>{Math.round(d.tmax)}°</b>
                      <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                        {Math.round(d.tmin)}°
                      </span>
                      <span
                        style={{
                          fontSize: "var(--text-xs)",
                          fontWeight: 600,
                          color: d.rain >= 1 ? "var(--water)" : undefined,
                        }}
                      >
                        {d.rain >= 1 ? `${Math.round(d.rain)} mm` : `${d.pop}%`}
                      </span>
                    </div>
                  ))
                : [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={140} w={78} r={16} />)}
            </div>
          </section>
        </div>

        <div className="stack">
          <Card title={t.today.alerts}>
            {m.ready ? <AlertList alerts={m.alerts} /> : <Skeleton h={60} />}
          </Card>
          <Outlook />
          <NextTasks />
          <TipCard />
        </div>
      </div>
    </div>
  );
}

function Outlook() {
  const t = useT();
  const f = useFmt();
  const p = useProfile();
  const crop = CROPS[p.crop];
  const y = useYieldForecast();
  const prices = usePrices();
  const fc = y.data?.ok ? y.data.forecast : null;
  const series = crop.priceKey ? prices.data?.commodities[crop.priceKey] : undefined;
  const zone = p.place ? zoneOf(p.place.state) : "north";
  const ps = series?.zones[zone] ?? series?.national ?? null;
  const nextFc = ps?.forecast.find((x) => x.month >= new Date().toISOString().slice(0, 7)) ?? ps?.forecast[0];
  const change = ps && nextFc ? (nextFc.p50 / ps.last - 1) * 100 : null;

  return (
    <Link to="/money" className="card card--link outlook">
      <div className="spread">
        <span className="eyebrow">{t.today.outlook}</span>
        <ArrowUpRight width={18} height={18} aria-hidden="true" />
      </div>
      <div className="outlook-grid">
        <div className="stat">
          <span className="label">{t.money.yieldTitle}</span>
          {crop.yieldModel ? (
            fc ? (
              <>
                <span className="value">
                  {f.num(marketableQAcre(crop, fc.p50), 1)}
                  <small>{t.units.qacre}</small>
                </span>
                <span className="delta" data-dir={fc.p50 >= fc.baseline ? "up-good" : "down-bad"}>
                  {t.money.vsNormal(Math.round((fc.p50 / fc.baseline - 1) * 100))}
                </span>
              </>
            ) : y.isLoading ? (
              <Skeleton h={34} w="70%" />
            ) : (
              <span className="muted">{t.money.noYieldData}</span>
            )
          ) : (
            <span className="muted">{t.money.tomatoNote}</span>
          )}
        </div>
        <div className="stat">
          <span className="label">{crop.msp ? t.money.mspTitle : t.money.marketLabel}</span>
          {crop.msp ? (
            <>
              <span className="value">
                {f.inr(crop.msp.price)}
                <small>{t.units.perQuintal}</small>
              </span>
              <span className="delta" data-dir="neutral">
                {crop.msp.season}
              </span>
            </>
          ) : ps && nextFc ? (
            <>
              <span className="value">
                {f.inr(nextFc.p50)}
                <small>{t.units.perKg}</small>
              </span>
              <span className="delta" data-dir={change !== null && change >= 0 ? "up-good" : "down-bad"}>
                {change !== null &&
                  (change >= 0 ? (
                    <TrendingUp width={14} height={14} />
                  ) : (
                    <TrendingDown width={14} height={14} />
                  ))}{" "}
                {change !== null && `${change >= 0 ? "+" : ""}${change.toFixed(0)}%`} ·{" "}
                {f.month(nextFc.month)}
              </span>
            </>
          ) : (
            <span className="muted">{t.money.noPrice}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

function NextTasks() {
  const t = useT();
  const p = useProfile();
  const m = useFieldModel();
  const list = t.plan.stageTasks[m.stage.stage];
  const pending = list
    .filter((_, i) => !p.doneStageTasks.includes(`${p.crop}:${m.stage.stage}:${i}`))
    .slice(0, 3);
  const custom = p.tasks.filter((x) => !x.done).slice(0, 2);
  return (
    <Card
      title={t.today.tasks}
      icon={CalendarCheck}
      action={
        <Link to="/plan" className="linkbtn">
          {t.app.seeAll}
        </Link>
      }
    >
      <ul className="list">
        {[...pending, ...custom.map((c) => c.text)].map((txt) => (
          <li key={txt}>
            <span className="dotmark" aria-hidden="true" />
            <span>{txt}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TipCard() {
  const t = useT();
  const day = Math.floor(Date.now() / 86400000);
  return (
    <div className="card card--flat tip">
      <Lightbulb aria-hidden="true" />
      <div>
        <div className="eyebrow">{t.today.tip}</div>
        <p data-speak>{t.tips[day % t.tips.length]}</p>
      </div>
    </div>
  );
}
