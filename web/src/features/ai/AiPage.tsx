import { useQuery } from "@tanstack/react-query";
import {
  BrainCircuit,
  Database,
  FlaskConical,
  LineChart,
  Microscope,
  ShieldCheck,
  Sprout,
  Wheat,
} from "lucide-react";
import { HBarChart } from "@/components/charts";
import { Card, Skeleton } from "@/components/ui";
import { useLang } from "@/i18n";
import { asset, fetchJson } from "@/lib/api/http";
import { CROPS, type CropId, type Lang } from "@/lib/crops";

interface Metrics {
  generated: string;
  yield?: {
    test: {
      n: number;
      mdape: { model: number; baseline: number; trend: number };
      skill: number;
      skillVsTrend: number;
      coverage: number;
      r2: number;
    };
    byStage: { stage: number; mdape: number; skill: number; coverage: number }[];
    byCrop: { crop: CropId; n: number; mdape: number; mdapeBase: number; skill: number; coverage: number }[];
    ablation: Record<string, number>;
    importance: { feature: string; value: number }[];
    rows: { train: number; calibrate: number; test: number };
    trainedRows: number;
    bytes: { onnx: number; trees: number };
  };
  price?: {
    zones: {
      h: number;
      mape: number;
      naive: number;
      seasonalNaive: number;
      skill: number;
      coverage: number;
      direction: number;
    }[];
    markets: { h: number; mape: number; naive: number; skill: number; coverage: number }[];
    modelWeight: Record<string, number>;
    testOrigins: string;
  };
  leaf?: {
    classes: number;
    images: number;
    test: { accuracy: number; macroF1: number; n: number; top3: number };
    field: {
      accuracy: number;
      top3: number;
      n: number;
      note: string;
      labOnlyAccuracy: number | null;
      withFieldAccuracy: number | null;
      selective: { threshold: number; coverage: number; accuracy: number };
      ece: number;
      cropKnown: {
        accuracy: number;
        top3: number;
        selective: { threshold: number; coverage: number; accuracy: number };
        labOnlyAccuracy: number | null;
        withFieldAccuracy: number | null;
      };
    };
    byCrop: { crop: string; accuracy: number; n: number }[];
    fieldByCrop: { crop: string; accuracy: number; n: number }[];
    calibration: { eceBefore: number; eceAfter: number };
    sizeMb: number;
    arch: string;
    quantization: {
      shipped: string;
      fp32Mb: number | null;
      int8Mb: number | null;
      fp32TestAccuracy: number | null;
      fp32FieldCropKnown: number | null;
    };
  };
}

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;

/** Leaf-model crops include a few the app does not plan for (bell pepper). */
const leafCropName = (crop: string, lang: Lang) =>
  CROPS[crop as CropId]?.name[lang] ?? (crop === "pepper" ? "Bell pepper" : crop);

const FEATURE_LABEL: Record<string, string> = {
  base_cv: "Year-to-year variability",
  crop: "Crop",
  log_base: "District normal yield",
  state_rel: "District vs state level",
  state: "State",
  base_trend: "Yield trend",
  d_lrain: "Season rainfall",
  d_tmin: "Night temperature",
  d_gwet: "Root-zone soil moisture",
  d_tmax: "Hottest-day temperature",
  log_area: "Area under the crop",
  season: "Season",
  d_dry_months: "Dry months",
  d_hot_months: "Heat-stress months",
  clim_rain_log: "Normal rainfall (climate)",
  clim_tmax: "Normal temperature",
  clim_gwet: "Normal soil moisture",
  base_n: "Years of history",
  obs_frac: "Season observed",
};

export default function AiPage() {
  const lang = useLang();
  const q = useQuery({
    queryKey: ["metrics"],
    queryFn: () => fetchJson<Metrics>(asset("data/metrics.json")),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const m = q.data;
  return (
    <div className="page ai-page">
      <header className="page-head">
        <span className="eyebrow">Model cards · evaluated on data the models never saw</span>
        <h1>How the AI works</h1>
        <p>
          Three machine-learning models and four agronomic engines power this app. They are trained on public
          Indian government statistics and satellite-era weather, evaluated on later years, and then run on
          your phone, so they work offline and your data never leaves the device.
        </p>
      </header>

      <div className="pipeline" role="group" aria-label="Pipeline">
        {[
          ["Open data", "DES/UPAg crop statistics · NASA POWER · WFP/DoCA prices · leaf image datasets"],
          ["Train & test", "scikit-learn and PyTorch, strict time-based hold-out, calibrated intervals"],
          ["Export & verify", "ONNX + compact tree JSON, parity-tested in Python, Node and browser"],
          ["On your phone", "No server, no account; cached for offline use"],
        ].map(([h, s], i) => (
          <div key={h} className="pipe-step">
            <span className="pipe-n">{i + 1}</span>
            <b>{h}</b>
            <small>{s}</small>
          </div>
        ))}
      </div>

      {!m ? (
        <Skeleton h={400} r={22} />
      ) : (
        <>
          {m.yield && (
            <Card
              title="District yield forecaster"
              sub="Gradient-boosted trees (scikit-learn HistGradientBoosting)"
              icon={Wheat}
            >
              <div className="grid grid-4 tiles">
                <Tile
                  label="Median error, 2020–24"
                  value={pct(m.yield.test.mdape.model)}
                  sub={`vs ${pct(m.yield.test.mdape.baseline)} district normal`}
                />
                <Tile
                  label="Skill over district normal"
                  value={`+${pct(m.yield.test.skill, 0)}`}
                  sub={`+${pct(m.yield.test.skillVsTrend, 0)} over trend line`}
                />
                <Tile
                  label="80% interval coverage"
                  value={pct(m.yield.test.coverage, 0)}
                  sub="split-conformal, per crop & stage"
                />
                <Tile
                  label="Training rows"
                  value={m.yield.trainedRows.toLocaleString("en-IN")}
                  sub="16 crops · 700+ districts · 1999–2024"
                />
              </div>
              <div className="grid grid-2" style={{ marginTop: 20 }}>
                <div>
                  <h3 className="chart-title">Skill over the district normal, by crop (2020–24)</h3>
                  <HBarChart
                    label="Skill by crop"
                    tableHead={["Crop", "Skill"]}
                    valueFmt={(v) => `${(v * 100).toFixed(0)}%`}
                    data={m.yield.byCrop.map((c) => ({
                      key: c.crop,
                      label: CROPS[c.crop]?.name[lang] ?? c.crop,
                      value: c.skill,
                    }))}
                  />
                  <p className="note" style={{ marginTop: 10 }}>
                    Rainfed crops (cotton, bajra, maize, groundnut) gain most from weather; irrigated wheat is
                    already stable, so its normal is hard to beat.
                  </p>
                </div>
                <div>
                  <h3 className="chart-title">What drives the forecast (permutation importance)</h3>
                  <HBarChart
                    label="Feature importance"
                    tableHead={["Feature", "Importance"]}
                    color="var(--series-2)"
                    valueFmt={(v) => (v * 1000).toFixed(1)}
                    data={m.yield.importance
                      .filter((f) => f.value > 0)
                      .slice(0, 10)
                      .map((f) => ({
                        key: f.feature,
                        label: FEATURE_LABEL[f.feature] ?? f.feature,
                        value: f.value,
                      }))}
                  />
                </div>
              </div>
              <div className="grid grid-2" style={{ marginTop: 20 }}>
                <div>
                  <h3 className="chart-title">Ablation: which weather signal generalises?</h3>
                  <HBarChart
                    label="Ablation"
                    tableHead={["Variant", "Skill"]}
                    color="var(--series-4)"
                    valueFmt={(v) => `${(v * 100).toFixed(1)}%`}
                    data={Object.entries(m.yield.ablation).map(([k, v]) => ({
                      key: k,
                      label: k.replace(/_/g, " ").replace(" (deployed)", " ✓"),
                      value: v,
                      muted: !k.includes("deployed"),
                    }))}
                  />
                </div>
                <div className="stack" style={{ gap: 10 }}>
                  <h3 className="chart-title">Design decisions</h3>
                  <ul className="bullets">
                    <li>
                      Target is <b>log(yield ÷ district normal)</b>; the normal uses statistics lagged two
                      years, matching their real publication delay.
                    </li>
                    <li>
                      Training rows are replicated at sowing, ⅓, ⅔ and full season with unseen months set to
                      climatology, so one model forecasts in-season. Skill holds from{" "}
                      {pct(m.yield.byStage[0]?.skill ?? 0, 0)} at sowing to{" "}
                      {pct(m.yield.byStage[2]?.skill ?? 0, 0)} mid-season.
                    </li>
                    <li>
                      Data fixes: APY cotton reported in bales (×170 kg), rice as milled rice (paddy = ÷0.67),
                      sub-seasons such as aus/aman rice merged.
                    </li>
                    <li>
                      In the browser the model is a {Math.round(m.yield.bytes.trees / 1024)} KB tree file
                      evaluated in pure TypeScript (float64-exact to scikit-learn) instead of a 14 MB ONNX
                      runtime.
                    </li>
                  </ul>
                </div>
              </div>
              <Limitations
                items={[
                  "District averages hide field-to-field variation; your field can do much better or worse than the forecast.",
                  "Government statistics come from crop-cutting surveys that carry sampling error, especially in small districts.",
                  "Pests, hail and price shocks are not in the model. Weather comes from reanalysis, not a station in your village.",
                ]}
              />
            </Card>
          )}

          {m.price && (
            <Card
              title="Market price forecaster"
              sub="Global quantile gradient boosting + conformal calibration"
              icon={LineChart}
            >
              <div className="grid grid-4 tiles">
                {m.price.zones
                  .filter((z) => [1, 3, 6].includes(z.h))
                  .map((z) => (
                    <Tile
                      key={z.h}
                      label={`${z.h} month${z.h > 1 ? "s" : ""} ahead`}
                      value={pct(z.mape)}
                      sub={`error vs ${pct(z.naive)} naive · ${z.skill >= 0 ? "+" : ""}${pct(z.skill, 0)} skill`}
                    />
                  ))}
                <Tile
                  label="80% interval coverage"
                  value={pct(m.price.zones.reduce((s, z) => s + z.coverage, 0) / m.price.zones.length, 0)}
                  sub="conformalized quantile regression"
                />
              </div>
              <div className="grid grid-2" style={{ marginTop: 20 }}>
                <div>
                  <h3 className="chart-title">
                    Skill over a naive forecast, zone prices ({m.price.testOrigins})
                  </h3>
                  <HBarChart
                    label="Price skill by horizon"
                    tableHead={["Horizon", "Skill"]}
                    valueFmt={(v) => `${(v * 100).toFixed(0)}%`}
                    data={m.price.zones.map((z) => ({
                      key: String(z.h),
                      label: `${z.h} month${z.h > 1 ? "s" : ""}`,
                      value: z.skill,
                    }))}
                  />
                </div>
                <ul className="bullets">
                  <li>
                    One model learns from ~1,700 market × commodity series (1994–2026) using scale-free
                    features: momentum, seasonality, volatility and national trend.
                  </li>
                  <li>
                    Smooth zone averages get a learned blend with "no change": weight{" "}
                    {Object.entries(m.price.modelWeight)
                      .map(([h, w]) => `${w} at ${h}m`)
                      .join(", ")}
                    .
                  </li>
                  <li>
                    Source data repeats the last value when a month is not updated; these stale carry-forwards
                    are removed before training.
                  </li>
                  <li>
                    Retail prices are scaled to farm-gate using the RBI (2024) farmers' share of the consumer
                    rupee where no MSP exists.
                  </li>
                </ul>
              </div>
              <Limitations
                items={[
                  "Retail price trends show market direction, not the mandi price you will receive.",
                  "Policy shocks (export bans, stock limits) cannot be forecast from price history.",
                ]}
              />
            </Card>
          )}

          <Card
            title="Leaf disease classifier"
            sub="Convolutional neural network, on-device (ONNX Runtime Web)"
            icon={Microscope}
          >
            {m.leaf ? (
              <>
                <div className="grid grid-4 tiles">
                  <Tile
                    label="Held-out lab images"
                    value={pct(m.leaf.test.accuracy)}
                    sub={`${m.leaf.test.n.toLocaleString("en-IN")} images · macro F1 ${m.leaf.test.macroF1.toFixed(3)}`}
                  />
                  <Tile
                    label="Real field photos, crop known"
                    value={pct(m.leaf.field.cropKnown.accuracy)}
                    sub={`${pct(m.leaf.field.accuracy, 0)} without the crop · top-3 ${pct(m.leaf.field.cropKnown.top3, 0)} · ${m.leaf.field.n} unseen PlantDoc photos`}
                  />
                  <Tile
                    label="Calibration error (ECE)"
                    value={pct(m.leaf.calibration.eceAfter)}
                    sub={`${pct(m.leaf.calibration.eceBefore)} before temperature scaling`}
                  />
                  <Tile
                    label="Model download"
                    value={`${m.leaf.sizeMb.toFixed(1)} MB`}
                    sub={`${m.leaf.arch} · ${m.leaf.classes} classes`}
                  />
                </div>
                <div className="grid grid-2" style={{ marginTop: 20 }}>
                  <div className="stack">
                    <div>
                      <h3 className="chart-title">Accuracy by crop: held-out lab images</h3>
                      <HBarChart
                        label="Leaf accuracy by crop on lab images"
                        tableHead={["Crop", "Accuracy"]}
                        domainMax={1}
                        valueFmt={(v) => `${(v * 100).toFixed(0)}%`}
                        data={m.leaf.byCrop
                          .filter((c) => c.crop !== "none")
                          .map((c) => ({
                            key: c.crop,
                            label: leafCropName(c.crop, lang),
                            value: c.accuracy,
                          }))}
                      />
                    </div>
                    <div>
                      <h3 className="chart-title">Real field photos, crop known</h3>
                      <HBarChart
                        label="Leaf accuracy by crop on field photos"
                        tableHead={["Crop", "Accuracy"]}
                        domainMax={1}
                        color="var(--series-2)"
                        valueFmt={(v) => `${(v * 100).toFixed(0)}%`}
                        data={m.leaf.fieldByCrop.map((c) => ({
                          key: c.crop,
                          label: leafCropName(c.crop, lang),
                          value: c.accuracy,
                        }))}
                      />
                      <p className="muted" style={{ fontSize: "var(--text-xs)", marginTop: 6 }}>
                        PlantDoc has no rice, cotton or groundnut photos, so those crops are tested on lab
                        images only.
                      </p>
                    </div>
                  </div>
                  <ul className="bullets">
                    <li>
                      Lab photos (plain backgrounds) overstate real-world accuracy. Half of the PlantDoc field
                      photos are held out entirely: they are the honest number.
                    </li>
                    {m.leaf.field.labOnlyAccuracy !== null &&
                      m.leaf.field.withFieldAccuracy !== null &&
                      m.leaf.field.cropKnown.labOnlyAccuracy !== null &&
                      m.leaf.field.cropKnown.withFieldAccuracy !== null && (
                        <li>
                          Field photos in training are what make it work outdoors. Trained on lab images
                          alone, the same network scores <b>{pct(m.leaf.field.labOnlyAccuracy)}</b> on the
                          held-out field photos; adding the other half of PlantDoc (weighted 3×) raises that
                          to <b>{pct(m.leaf.field.withFieldAccuracy)}</b> (
                          {pct(m.leaf.field.cropKnown.labOnlyAccuracy)} →{" "}
                          {pct(m.leaf.field.cropKnown.withFieldAccuracy)} when the crop is known), while lab
                          accuracy is unchanged. Both runs are compared before int8 quantisation.
                        </li>
                      )}
                    <li>
                      Knowing your crop matters: it is used as a prior (other crops' diseases are
                      down-weighted, not removed), which lifts field accuracy from{" "}
                      {pct(m.leaf.field.accuracy)} to <b>{pct(m.leaf.field.cropKnown.accuracy)}</b>.
                    </li>
                    <li>
                      The app abstains below {pct(m.leaf.field.cropKnown.selective.threshold, 0)} confidence:
                      on field photos it answers {pct(m.leaf.field.cropKnown.selective.coverage, 0)} of the
                      time and is right {pct(m.leaf.field.cropKnown.selective.accuracy, 0)} of those times. A
                      "not a leaf" class rejects soil, hands and sky.
                    </li>
                    <li>
                      Temperature scaling makes confidence honest on lab images (calibration error{" "}
                      {pct(m.leaf.calibration.eceAfter)}); on field photos it is {pct(m.leaf.field.ece)}, so
                      percentages there are optimistic and shown with a top-3 list.
                    </li>
                    {m.leaf.quantization.shipped === "int8" &&
                      m.leaf.quantization.fp32Mb !== null &&
                      m.leaf.quantization.fp32TestAccuracy !== null &&
                      m.leaf.quantization.fp32FieldCropKnown !== null && (
                        <li>
                          int8 quantisation shrinks the download from {m.leaf.quantization.fp32Mb.toFixed(1)}{" "}
                          MB to <b>{m.leaf.sizeMb.toFixed(1)} MB</b>. Every number here is for the int8 model
                          you download; the full-precision network scores{" "}
                          {pct(m.leaf.quantization.fp32TestAccuracy)} on lab images and{" "}
                          {pct(m.leaf.quantization.fp32FieldCropKnown)} on field photos.
                        </li>
                      )}
                  </ul>
                </div>
              </>
            ) : (
              <p className="ink-2">
                The CNN is trained on labelled leaf images for rice (India), cotton, groundnut, maize, potato
                and tomato, and is tested on real field photos (PlantDoc). Until it is installed, the scanner
                uses the on-device colour-segmentation severity analysis.
              </p>
            )}
          </Card>

          <Card
            title="Agronomic engines"
            sub="Physics and published plant-pathology models, not black boxes"
            icon={Sprout}
          >
            <div className="grid grid-2 engines">
              <Engine
                title="Irrigation (FAO-56)"
                body="Daily root-zone water balance with crop coefficients by growth stage, curve-number runoff, and water-stress coefficient. Soil water holding from SoilGrids texture via Saxton & Rawls (2006); starting moisture from the forecast model's soil layers."
              />
              <Engine
                title="Pest & disease risk"
                body="Hourly infection windows from humidity, leaf wetness and temperature: Hutton criteria for late blight, Jensen–Boyle for groundnut leaf spot, and published wetness/temperature bands for rusts, blast and blights."
              />
              <Engine
                title="Spray planner"
                body="Hour-by-hour suitability using rain-free time, wind at boom height, temperature and Delta-T (wet-bulb depression, Stull 2011)."
              />
              <Engine
                title="Symptom checker"
                body="Naive-Bayes expert system over 45 threats, with priors raised when this week's weather favours a disease."
              />
            </div>
          </Card>

          <Card title="Data sources" icon={Database}>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Publisher</th>
                    <th>Licence</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    [
                      "District crop area, production & yield 1997–2025",
                      "DES & UPAg, Ministry of Agriculture (via India Data Portal)",
                      "ODC-By",
                    ],
                    ["Monthly & daily weather 1996–2026", "NASA POWER (MERRA-2 / CERES)", "Public domain"],
                    ["10-day forecast, soil moisture, leaf wetness", "Open-Meteo", "CC BY 4.0"],
                    ["Soil texture, pH, carbon (250 m)", "ISRIC SoilGrids 2.0", "CC BY 4.0"],
                    [
                      "Retail food prices 1994–2026",
                      "WFP VAM / Dept. of Consumer Affairs (HDX)",
                      "CC BY-IGO",
                    ],
                    [
                      "Minimum Support Prices 2026-27",
                      "Cabinet Committee on Economic Affairs (PIB)",
                      "Public",
                    ],
                    ["District gazetteer", "GeoNames", "CC BY 4.0"],
                    [
                      "Leaf images",
                      "Project-AgML (UC Davis): PlantVillage, Indian rice, cotton, groundnut; PlantDoc",
                      "CC BY / CC BY-SA / CC BY-NC",
                    ],
                  ].map(([a, b, c]) => (
                    <tr key={a}>
                      <td style={{ whiteSpace: "normal" }}>{a}</td>
                      <td style={{ whiteSpace: "normal" }}>{b}</td>
                      <td>{c}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Engineering guarantees" icon={ShieldCheck}>
            <ul className="bullets">
              <li>
                Every exported model is checked against scikit-learn before it is written; 40 golden cases
                re-check the TypeScript feature code and tree evaluator in CI.
              </li>
              <li>
                All agronomic formulas are unit-tested against published reference values (Stull wet-bulb, SCS
                runoff, Saxton–Rawls, IMD thresholds, Hutton periods).
              </li>
              <li>
                The app is a Progressive Web App: it installs to the home screen, caches models and data, and
                keeps working without signal.
              </li>
              <li>
                No accounts, analytics or trackers. Only your field's coordinates are sent, to the public
                weather and soil services.
              </li>
            </ul>
            <p className="source" style={{ marginTop: 10 }}>
              <BrainCircuit width={14} height={14} style={{ verticalAlign: "-2px" }} /> Metrics generated{" "}
              {m.generated}. <FlaskConical width={14} height={14} style={{ verticalAlign: "-2px" }} />{" "}
              Reproduce them with <code>make train</code> in the repository.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="tile">
      <span className="label">{label}</span>
      <span className="value">{value}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

function Engine({ title, body }: { title: string; body: string }) {
  return (
    <div className="engine">
      <b>{title}</b>
      <p>{body}</p>
    </div>
  );
}

function Limitations({ items }: { items: string[] }) {
  return (
    <details className="limits">
      <summary>Limitations</summary>
      <ul className="bullets">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </details>
  );
}
