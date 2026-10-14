import { BarChart3, ExternalLink, HandCoins, Landmark, LineChart, Phone, Wheat } from "lucide-react";
import { useState } from "react";
import { ColumnChart, FanChart } from "@/components/charts";
import { Card, Seg, Skeleton, SourceNote } from "@/components/ui";
import { useFmt, useLang, useT } from "@/i18n";
import { CROPS, marketableQAcre, SEASON_NAMES } from "@/lib/crops";
import { incomeRange, priceFor, upcoming } from "@/lib/economics";
import { zoneOf } from "@/lib/geo";
import type { YieldForecast } from "@/lib/ml/yieldModel";
import { useProfile } from "@/state/profile";
import { type PriceSeries, useMandi, usePrices, useYieldForecast } from "@/state/queries";

export default function MoneyPage() {
  const t = useT();
  const p = useProfile();
  const crop = CROPS[p.crop];
  const y = useYieldForecast();
  const fc = y.data?.ok ? y.data.forecast : null;

  return (
    <div className="page">
      <header className="page-head">
        <span className="eyebrow">
          {crop.name[p.lang]} · {SEASON_NAMES[p.season][p.lang]}
        </span>
        <h1>{t.money.title}</h1>
        <p>{t.money.sub}</p>
      </header>

      <div className="grid grid-main">
        <div className="stack">
          <YieldCard
            fc={fc}
            loading={y.isLoading}
            unavailable={!crop.yieldModel || (y.data ? !y.data.ok : false)}
          />
          <PriceCard />
        </div>
        <div className="stack">
          <IncomeCard fc={fc} />
          <MandiCard />
          <MspCard />
          <HelpCard />
        </div>
      </div>
    </div>
  );
}

function YieldCard({
  fc,
  loading,
  unavailable,
}: {
  fc: YieldForecast | null;
  loading: boolean;
  unavailable: boolean;
}) {
  const t = useT();
  const f = useFmt();
  const lang = useLang();
  const p = useProfile();
  const crop = CROPS[p.crop];
  const [scenario, setScenario] = useState<"dry" | "normal" | "wet" | null>(null);
  const q = (kg: number) => marketableQAcre(crop, kg);
  const unit = `${t.units.qacre}${crop.sold ? ` (${crop.sold.label[lang]})` : ""}`;

  if (unavailable) {
    return (
      <Card title={t.money.yieldTitle} icon={Wheat}>
        <p className="muted">{crop.yieldModel ? t.money.noYieldData : t.money.tomatoNote}</p>
      </Card>
    );
  }
  if (loading || !fc) {
    return (
      <Card title={t.money.yieldTitle} icon={Wheat}>
        <Skeleton h={280} />
      </Card>
    );
  }
  const shown = scenario ? (fc.scenarios.find((s) => s.id === scenario)?.p50 ?? fc.p50) : fc.p50;
  const vs = Math.round((shown / fc.baseline - 1) * 100);
  const hist = fc.history.slice(-10);
  const seasonLabel = `${fc.agriYear}${fc.season === "kharif" ? "" : `-${String(fc.agriYear + 1).slice(2)}`}`;

  return (
    <Card title={t.money.yieldTitle} sub={t.money.yieldSub(p.place?.district ?? "")} icon={Wheat}>
      <div className="yield-hero" data-speak>
        <div className="hero-figure">
          {f.num(q(shown), 1)}
          <small>{unit}</small>
        </div>
        <div className="stack" style={{ gap: 4 }}>
          <span className="delta" data-dir={vs >= 0 ? "up-good" : "down-bad"} style={{ fontWeight: 650 }}>
            {t.money.vsNormal(vs)}
          </span>
          {!scenario && (
            <span className="ink-2">{t.money.range(f.num(q(fc.p10), 1), f.num(q(fc.p90), 1))}</span>
          )}
          <span className="muted" style={{ fontSize: "var(--text-sm)" }}>
            {t.money.basedOn(fc.observedMonths, fc.totalMonths)}
            {fc.rainPctOfNormal !== null && ` · ${t.money.rainSoFar(fc.rainPctOfNormal)}`}
          </span>
        </div>
      </div>

      {fc.scenarios.length > 0 && (
        <div className="stack" style={{ gap: 8, margin: "14px 0 4px" }}>
          <span className="eyebrow">{t.money.scenarioTitle}</span>
          <Seg
            label={t.money.scenarioTitle}
            value={scenario ?? ("none" as const)}
            onChange={(v) => setScenario(v === "none" || v === scenario ? null : v)}
            options={[
              { id: "dry", label: `${t.money.dry} ${f.num(q(fc.scenarios[0]!.p50), 1)}` },
              { id: "normal", label: `${t.money.normal} ${f.num(q(fc.scenarios[1]!.p50), 1)}` },
              { id: "wet", label: `${t.money.wet} ${f.num(q(fc.scenarios[2]!.p50), 1)}` },
            ]}
          />
        </div>
      )}

      <h3 className="chart-title" style={{ marginTop: 16 }}>
        {t.money.history} ({unit})
      </h3>
      <ColumnChart
        label={t.money.history}
        unit={t.units.qacre}
        tableHead={["", t.money.yieldTitle]}
        valueFmt={(v) => v.toFixed(1)}
        height={180}
        refLine={{ value: q(fc.baseline), label: t.money.normal }}
        data={[
          ...hist.map((h) => ({
            key: String(h.year),
            label: `${String(h.year).slice(2)}`,
            value: q(h.yield),
            muted: true,
            tip: `${h.year}-${String(h.year + 1).slice(2)}`,
          })),
          {
            key: "fc",
            label: seasonLabel.slice(2),
            value: q(shown),
            accent: true,
            highlight: true,
            range: scenario ? undefined : ([q(fc.p10), q(fc.p90)] as [number, number]),
            tip: `${t.money.forecastMark} ${seasonLabel}`,
          },
        ]}
      />
      <SourceNote>
        {t.app.source}: DES / UPAg district crop statistics 1997–2024, NASA POWER weather. Gradient-boosted
        trees with split-conformal 80% intervals, run on this device.
      </SourceNote>
    </Card>
  );
}

function IncomeCard({ fc }: { fc: YieldForecast | null }) {
  const t = useT();
  const f = useFmt();
  const p = useProfile();
  const crop = CROPS[p.crop];
  const prices = usePrices();
  const zone = p.place ? zoneOf(p.place.state) : "north";
  const price = priceFor(crop, prices.data, zone);
  if (!fc || !price) return null;
  const q = {
    p10: marketableQAcre(crop, fc.p10),
    p50: marketableQAcre(crop, fc.p50),
    p90: marketableQAcre(crop, fc.p90),
  };
  const inc = incomeRange(q, p.areaAcres, price.perQuintal);
  return (
    <Card title={t.money.incomeTitle} sub={t.money.incomeSub} icon={HandCoins} tone="accent">
      <div className="hero-figure" style={{ fontSize: "clamp(2rem, 1.5rem + 2vw, 2.8rem)" }} data-speak>
        {f.compactInr(inc.mid)}
      </div>
      <p className="ink-2" style={{ marginTop: 4 }}>
        {t.money.range(f.compactInr(inc.low), f.compactInr(inc.high))}
      </p>
      <dl className="kv" style={{ marginTop: 14 }}>
        <dt>{t.onboarding.area}</dt>
        <dd>
          {f.num(p.areaAcres, 1)} {t.units.acres}
        </dd>
        <dt>{t.money.production}</dt>
        <dd>{f.num(q.p50 * p.areaAcres, 1)} q</dd>
        <dt>{t.money.priceUsed}</dt>
        <dd>
          {f.inr(price.perQuintal)} / q
          <div className="muted" style={{ fontSize: "var(--text-xs)", fontWeight: 500 }}>
            {price.kind === "msp"
              ? t.money.mspLabel(price.season ?? "")
              : `${t.money.marketLabel} · ${f.month(price.month!)}`}
          </div>
        </dd>
      </dl>
    </Card>
  );
}

function PriceCard() {
  const t = useT();
  const f = useFmt();
  const p = useProfile();
  const crop = CROPS[p.crop];
  const prices = usePrices();
  const defaultZone = p.place ? zoneOf(p.place.state) : "north";
  const [zone, setZone] = useState<string>(defaultZone);
  const c = crop.priceKey ? prices.data?.commodities[crop.priceKey] : undefined;

  if (prices.isLoading) {
    return (
      <Card title={t.money.pricesTitle} icon={LineChart}>
        <Skeleton h={240} />
      </Card>
    );
  }
  if (!c) {
    return (
      <Card title={t.money.pricesTitle} icon={LineChart}>
        <p className="muted">{t.money.noPrice}</p>
      </Card>
    );
  }
  const zones = Object.keys(c.zones);
  const activeZone = zones.includes(zone) ? zone : (zones[0] ?? "india");
  const series: PriceSeries | null =
    activeZone === "india" ? c.national : (c.zones[activeZone] ?? c.national);
  if (!series) return null;
  const next = upcoming(series);
  const nowYm = new Date().toISOString().slice(0, 7);
  const data = [
    ...series.history.slice(-24).map(([m, v]) => ({ key: m, label: f.month(m), value: v })),
    ...series.forecast.map((x) => ({
      key: x.month,
      label: f.month(x.month),
      p10: x.p10,
      p50: x.p50,
      p90: x.p90,
    })),
  ];
  const zoneLabel = (z: string) =>
    z === "india" ? "India" : (t.money.zone[z as keyof typeof t.money.zone] ?? z);
  const metrics = prices.data?.backtest.zones;
  return (
    <Card
      title={`${t.money.pricesTitle}: ${c.label}`}
      sub={t.money.pricesSub(zoneLabel(activeZone))}
      icon={LineChart}
    >
      <div className="chips chips--scroll" style={{ marginBottom: 12 }}>
        {[...zones, "india"].map((z) => (
          <button
            key={z}
            type="button"
            className="chip"
            aria-pressed={z === activeZone}
            onClick={() => setZone(z)}
          >
            {zoneLabel(z)}
          </button>
        ))}
      </div>
      <div className="grid grid-2" style={{ marginBottom: 12 }}>
        <div className="stat">
          <span className="label">{t.money.latest(f.month(series.origin))}</span>
          <span className="value">
            {f.inr(series.last)}
            <small>{t.units.perKg}</small>
          </span>
        </div>
        {next && (
          <div className="stat" data-speak>
            <span className="label">{t.money.expected(f.month(next.month))}</span>
            <span className="value">
              {f.inr(next.p50)}
              <small>{t.units.perKg}</small>
            </span>
            <span className="delta" data-dir={next.p50 >= series.last ? "up-good" : "down-bad"}>
              {next.p50 >= series.last ? "+" : ""}
              {((next.p50 / series.last - 1) * 100).toFixed(0)}% · {f.inr(next.p10)}–{f.inr(next.p90)}
            </span>
          </div>
        )}
      </div>
      <FanChart
        label={t.money.pricesTitle}
        unit="₹/kg"
        data={data}
        nowKey={data.find((d) => d.key >= nowYm)?.key}
        valueFmt={(v) => `₹${v.toFixed(0)}`}
        tableHead={["", "₹/kg", "80%"]}
        legend={
          <>
            <span>
              <i style={{ background: "var(--series-1)" }} />
              {c.label}
            </span>
            <span>
              <i className="band" style={{ background: "var(--series-1)" }} />
              80%
            </span>
          </>
        }
      />
      <p className="note" style={{ marginTop: 12 }}>
        {t.money.retailNote}
      </p>
      <SourceNote>
        {t.app.source}: WFP / Department of Consumer Affairs retail prices (HDX, CC BY-IGO).{" "}
        {metrics?.h3 &&
          `Backtest 2022–26, 3 months ahead: ${(metrics.h3.mape_model * 100).toFixed(1)}% error vs ${(metrics.h3.mape_naive * 100).toFixed(1)}% naive.`}
      </SourceNote>
    </Card>
  );
}

function MandiCard() {
  const t = useT();
  const f = useFmt();
  const p = useProfile();
  const { data } = useMandi();
  const quotes = data?.crops[p.crop] ?? [];
  if (!data || quotes.length === 0) return null;
  const inState = quotes.filter((q) => q.state.toLowerCase() === p.place?.state.toLowerCase());
  const rows = (inState.length ? inState : quotes)
    .slice()
    .sort((a, b) => b.modal - a.modal)
    .slice(0, 8);
  return (
    <Card title={t.money.mandiTitle} sub={t.money.mandiSub(data.generated.slice(0, 10))} icon={BarChart3}>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Market</th>
              <th className="n">{t.money.modal}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => (
              <tr key={`${q.market}-${q.variety}`}>
                <td style={{ whiteSpace: "normal" }}>
                  {q.market}
                  <div className="muted" style={{ fontSize: "var(--text-xs)" }}>
                    {q.district} · {q.variety} · {q.date}
                  </div>
                </td>
                <td className="n">{f.inr(q.modal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function MspCard() {
  const t = useT();
  const f = useFmt();
  const p = useProfile();
  const crop = CROPS[p.crop];
  return (
    <Card title={t.money.mspTitle} icon={Landmark}>
      {crop.msp ? (
        <div className="stat" data-speak>
          <span className="value">
            {f.inr(crop.msp.price)}
            <small>{t.units.perQuintal}</small>
          </span>
          <span className="muted" style={{ fontSize: "var(--text-sm)" }}>
            {crop.msp.season}
            {crop.msp.note && ` · ${crop.msp.note}`}
          </span>
        </div>
      ) : (
        <p className="muted">{t.money.mspNone}</p>
      )}
    </Card>
  );
}

function HelpCard() {
  const t = useT();
  const links = [
    { href: "https://agmarknet.gov.in", label: t.money.agmarknet, icon: BarChart3 },
    { href: "https://enam.gov.in", label: t.money.enam, icon: ExternalLink },
    { href: "https://pmfby.gov.in", label: t.money.pmfby, icon: ExternalLink },
    { href: "https://kvk.icar.gov.in", label: t.money.kvk, icon: ExternalLink },
    { href: "tel:18001801551", label: t.money.kcc, icon: Phone },
  ];
  return (
    <Card title={t.money.helpTitle}>
      <ul className="list linklist">
        {links.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
              <Icon aria-hidden="true" width={18} height={18} />
              {label}
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}
