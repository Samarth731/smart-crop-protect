/**
 * Chart kit. Rules (see docs/design.md): thin 2px lines, 10% area washes, hairline solid grid,
 * bars <= 24px with 4px rounded data-ends anchored to the baseline, a tooltip on hover/keyboard,
 * and a table view for every chart. Text uses ink tokens, never the series colour.
 */
import { scaleBand, scaleLinear } from "d3-scale";
import { curveMonotoneX, area as d3area, line as d3line } from "d3-shape";
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n";

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e!.contentRect.width)));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export interface TableSpec {
  head: string[];
  rows: (string | number)[][];
}

function ChartShell({
  label,
  table,
  legend,
  children,
}: {
  label: string;
  table: TableSpec;
  legend?: ReactNode;
  children: (width: number) => ReactNode;
}) {
  const t = useT();
  const [ref, width] = useWidth<HTMLDivElement>();
  const [asTable, setAsTable] = useState(false);
  return (
    <figure style={{ margin: 0 }}>
      {asTable ? (
        <div className="table-wrap">
          <table className="data">
            <caption className="sr-only">{label}</caption>
            <thead>
              <tr>
                {table.head.map((h, i) => (
                  <th key={h} className={i ? "n" : undefined}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r) => (
                <tr key={String(r[0])}>
                  {r.map((c, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: columns are positional
                    <td key={i} className={i ? "n" : undefined}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart" ref={ref} role="img" aria-label={label}>
          {width > 0 && children(width)}
        </div>
      )}
      <figcaption className="chart-foot">
        <div className="legend">{legend}</div>
        <button type="button" className="linkbtn" onClick={() => setAsTable((v) => !v)}>
          {asTable ? t.app.viewChart : t.app.viewTable}
        </button>
      </figcaption>
    </figure>
  );
}

/** Pointer + keyboard index tracking over a band of n items. */
function useHover(n: number, xOf: (i: number) => number) {
  const [i, setI] = useState<number | null>(null);
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left;
    let best = 0;
    let bestD = Number.POSITIVE_INFINITY;
    for (let k = 0; k < n; k++) {
      const d = Math.abs(xOf(k) - x);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    setI(best);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") setI((v) => Math.min(n - 1, (v ?? -1) + 1));
    else if (e.key === "ArrowLeft") setI((v) => Math.max(0, (v ?? n) - 1));
    else if (e.key === "Escape") setI(null);
  };
  return { i, setI, onMove, onKey };
}

function Tooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div className="chart-tooltip" style={{ left: x, top: y }}>
      {children}
    </div>
  );
}

const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => m <= s) ?? 10;
  return step * p;
};

/* ---------------------------------------------------------------- columns */

export interface ColumnDatum {
  key: string;
  label: string; // axis label
  value: number;
  highlight?: boolean;
  muted?: boolean;
  accent?: boolean;
  range?: [number, number];
  tip?: ReactNode;
}

export function ColumnChart({
  data,
  height = 140,
  color = "var(--series-2)",
  unit,
  label,
  valueFmt = (v: number) => String(Math.round(v)),
  refLine,
  tableHead,
}: {
  data: ColumnDatum[];
  height?: number;
  color?: string;
  unit: string;
  label: string;
  valueFmt?: (v: number) => string;
  refLine?: { value: number; label: string };
  tableHead: [string, string];
}) {
  const pad = { t: 18, r: 8, b: 24, l: 34 };
  return (
    <ChartShell
      label={label}
      table={{ head: tableHead, rows: data.map((d) => [d.label, `${valueFmt(d.value)} ${unit}`]) }}
    >
      {(w) => (
        <Columns
          data={data}
          w={w}
          h={height}
          pad={pad}
          color={color}
          unit={unit}
          valueFmt={valueFmt}
          refLine={refLine}
        />
      )}
    </ChartShell>
  );
}

function Columns({
  data,
  w,
  h,
  pad,
  color,
  unit,
  valueFmt,
  refLine,
}: {
  data: ColumnDatum[];
  w: number;
  h: number;
  pad: { t: number; r: number; b: number; l: number };
  color: string;
  unit: string;
  valueFmt: (v: number) => string;
  refLine?: { value: number; label: string };
}) {
  const max = niceMax(
    Math.max(...data.map((d) => Math.max(d.value, d.range?.[1] ?? 0)), refLine?.value ?? 0, 1),
  );
  const x = scaleBand<string>()
    .domain(data.map((d) => d.key))
    .range([pad.l, w - pad.r])
    .paddingInner(0.25)
    .paddingOuter(0.1);
  const y = scaleLinear()
    .domain([0, max])
    .range([h - pad.b, pad.t]);
  const bw = Math.min(24, x.bandwidth());
  const cx = (i: number) => (x(data[i]!.key) ?? 0) + x.bandwidth() / 2;
  const hv = useHover(data.length, cx);
  const ticks = y.ticks(3);
  const every = Math.ceil(data.length / Math.max(1, Math.floor((w - pad.l) / 44)));
  return (
    <>
      <svg
        width={w}
        height={h}
        role="application"
        aria-label="Use arrow keys to read values"
        onKeyDown={hv.onKey}
        onBlur={() => hv.setI(null)}
      >
        {ticks.map((tk) => (
          <g key={tk}>
            <line className="grid-line" x1={pad.l} x2={w - pad.r} y1={y(tk)} y2={y(tk)} />
            <text className="tick" x={pad.l - 6} y={y(tk)} dy="0.32em" textAnchor="end">
              {tk}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x0 = cx(i) - bw / 2;
          const y0 = y(d.value);
          const hgt = Math.max(0, h - pad.b - y0);
          const r = Math.min(4, bw / 2, hgt);
          const path = `M${x0},${h - pad.b} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + bw - r} Q${x0 + bw},${y0} ${x0 + bw},${y0 + r} V${h - pad.b} Z`;
          return (
            <g key={d.key}>
              {hgt > 0 && (
                <path
                  d={path}
                  fill={d.muted ? "var(--muted-mark)" : d.accent ? "var(--series-6)" : color}
                  opacity={hv.i === null || hv.i === i ? (d.muted ? 0.7 : 1) : 0.45}
                />
              )}
              {d.range && (
                <g stroke="var(--ink-2)" strokeWidth={1.5} strokeLinecap="round">
                  <line x1={cx(i)} x2={cx(i)} y1={y(d.range[0])} y2={y(d.range[1])} />
                  <line x1={cx(i) - 5} x2={cx(i) + 5} y1={y(d.range[0])} y2={y(d.range[0])} />
                  <line x1={cx(i) - 5} x2={cx(i) + 5} y1={y(d.range[1])} y2={y(d.range[1])} />
                </g>
              )}
              {d.highlight && (
                <text
                  className="direct-label"
                  x={cx(i)}
                  y={Math.min(y0, d.range ? y(d.range[1]) : y0) - 6}
                  textAnchor="middle"
                >
                  {valueFmt(d.value)}
                </text>
              )}
              {i % every === 0 && (
                <text className="tick" x={cx(i)} y={h - pad.b + 15} textAnchor="middle">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
        <line className="axis-line" x1={pad.l} x2={w - pad.r} y1={h - pad.b} y2={h - pad.b} />
        {refLine && (
          <g>
            <line
              x1={pad.l}
              x2={w - pad.r}
              y1={y(refLine.value)}
              y2={y(refLine.value)}
              stroke="var(--ink-3)"
              strokeWidth="1.5"
            />
            <text className="tick" x={w - pad.r} y={y(refLine.value) - 5} textAnchor="end">
              {refLine.label}
            </text>
          </g>
        )}
        <rect
          x={pad.l}
          y={0}
          width={Math.max(0, w - pad.l - pad.r)}
          height={h}
          fill="transparent"
          onPointerMove={hv.onMove}
          onPointerLeave={() => hv.setI(null)}
        />
      </svg>
      {hv.i !== null && data[hv.i] && (
        <Tooltip x={cx(hv.i)} y={y(data[hv.i]!.value)}>
          <b>
            {valueFmt(data[hv.i]!.value)} {unit}
          </b>
          {data[hv.i]!.tip ?? data[hv.i]!.label}
        </Tooltip>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- range bars (temperature) */

export function RangeChart({
  data,
  height = 150,
  label,
  tableHead,
}: {
  data: { key: string; label: string; min: number; max: number; highlight?: boolean }[];
  height?: number;
  label: string;
  tableHead: [string, string, string];
}) {
  const pad = { t: 22, r: 8, b: 24, l: 34 };
  return (
    <ChartShell
      label={label}
      table={{
        head: tableHead,
        rows: data.map((d) => [d.label, `${Math.round(d.min)}°`, `${Math.round(d.max)}°`]),
      }}
    >
      {(w) => {
        const lo = Math.floor(Math.min(...data.map((d) => d.min)) - 2);
        const hi = Math.ceil(Math.max(...data.map((d) => d.max)) + 2);
        const x = scaleBand<string>()
          .domain(data.map((d) => d.key))
          .range([pad.l, w - pad.r])
          .padding(0.3);
        const y = scaleLinear()
          .domain([lo, hi])
          .range([height - pad.b, pad.t])
          .nice();
        const bw = Math.min(14, x.bandwidth());
        const every = Math.ceil(data.length / Math.max(1, Math.floor((w - pad.l) / 44)));
        return (
          <svg width={w} height={height}>
            {y.ticks(3).map((tk) => (
              <g key={tk}>
                <line className="grid-line" x1={pad.l} x2={w - pad.r} y1={y(tk)} y2={y(tk)} />
                <text className="tick" x={pad.l - 6} y={y(tk)} dy="0.32em" textAnchor="end">
                  {tk}°
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const cx = (x(d.key) ?? 0) + x.bandwidth() / 2;
              return (
                <g key={d.key}>
                  <rect
                    x={cx - bw / 2}
                    y={y(d.max)}
                    width={bw}
                    height={Math.max(2, y(d.min) - y(d.max))}
                    rx={bw / 2}
                    fill="var(--series-3)"
                    opacity={d.highlight ? 1 : 0.75}
                  />
                  {(d.highlight || i === 0) && (
                    <>
                      <text className="direct-label" x={cx} y={y(d.max) - 6} textAnchor="middle">
                        {Math.round(d.max)}°
                      </text>
                      <text className="tick" x={cx} y={y(d.min) + 13} textAnchor="middle">
                        {Math.round(d.min)}°
                      </text>
                    </>
                  )}
                  {i % every === 0 && (
                    <text className="tick" x={cx} y={height - pad.b + 15} textAnchor="middle">
                      {d.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        );
      }}
    </ChartShell>
  );
}

/* ---------------------------------------------------------------- line / fan chart */

export interface FanPoint {
  key: string; // x key
  label: string;
  value?: number; // observed
  p10?: number;
  p50?: number;
  p90?: number;
}

export function FanChart({
  data,
  height = 200,
  label,
  unit,
  valueFmt = (v: number) => v.toFixed(0),
  refLine,
  nowKey,
  legend,
  color = "var(--series-1)",
  tableHead,
}: {
  data: FanPoint[];
  height?: number;
  label: string;
  unit: string;
  valueFmt?: (v: number) => string;
  refLine?: { value: number; label: string };
  nowKey?: string;
  legend?: ReactNode;
  color?: string;
  tableHead: [string, string, string];
}) {
  const pad = { t: 16, r: 46, b: 24, l: 40 };
  return (
    <ChartShell
      label={label}
      legend={legend}
      table={{
        head: tableHead,
        rows: data.map((d) => [
          d.label,
          d.value !== undefined ? valueFmt(d.value) : d.p50 !== undefined ? valueFmt(d.p50) : "",
          d.p10 !== undefined && d.p90 !== undefined ? `${valueFmt(d.p10)} – ${valueFmt(d.p90)}` : "",
        ]),
      }}
    >
      {(w) => (
        <Fan
          data={data}
          w={w}
          h={height}
          pad={pad}
          unit={unit}
          valueFmt={valueFmt}
          refLine={refLine}
          nowKey={nowKey}
          color={color}
        />
      )}
    </ChartShell>
  );
}

function Fan({
  data,
  w,
  h,
  pad,
  unit,
  valueFmt,
  refLine,
  nowKey,
  color,
}: {
  data: FanPoint[];
  w: number;
  h: number;
  pad: { t: number; r: number; b: number; l: number };
  unit: string;
  valueFmt: (v: number) => string;
  refLine?: { value: number; label: string };
  nowKey?: string;
  color: string;
}) {
  const vals = data.flatMap((d) =>
    [d.value, d.p10, d.p90, d.p50].filter((v): v is number => v !== undefined),
  );
  if (refLine) vals.push(refLine.value);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || hi * 0.1 || 1;
  const y = scaleLinear()
    .domain([Math.max(0, lo - span * 0.12), hi + span * 0.12])
    .range([h - pad.b, pad.t])
    .nice();
  const x = scaleLinear()
    .domain([0, Math.max(1, data.length - 1)])
    .range([pad.l, w - pad.r]);
  const obs = data
    .map((d, i) => ({ i, v: d.value }))
    .filter((d): d is { i: number; v: number } => d.v !== undefined);
  const fc = data.map((d, i) => ({ i, d })).filter(({ d }) => d.p50 !== undefined);
  const lineGen = d3line<{ i: number; v: number }>()
    .x((d) => x(d.i))
    .y((d) => y(d.v))
    .curve(curveMonotoneX);
  const lastObs = obs[obs.length - 1];
  const fcLine = lastObs
    ? [lastObs, ...fc.map(({ i, d }) => ({ i, v: d.p50! }))]
    : fc.map(({ i, d }) => ({ i, v: d.p50! }));
  const band = d3area<{ i: number; lo: number; hi: number }>()
    .x((d) => x(d.i))
    .y0((d) => y(d.lo))
    .y1((d) => y(d.hi))
    .curve(curveMonotoneX);
  const bandData = [
    ...(lastObs ? [{ i: lastObs.i, lo: lastObs.v, hi: lastObs.v }] : []),
    ...fc.map(({ i, d }) => ({ i, lo: d.p10!, hi: d.p90! })),
  ];
  const hv = useHover(data.length, (i) => x(i));
  const every = Math.ceil(data.length / Math.max(1, Math.floor((w - pad.l - pad.r) / 56)));
  const nowI = nowKey ? data.findIndex((d) => d.key === nowKey) : -1;
  const lastFc = fc[fc.length - 1];
  const hover = hv.i !== null ? data[hv.i] : undefined;
  return (
    <>
      <svg
        width={w}
        height={h}
        role="application"
        aria-label="Use arrow keys to read values"
        onKeyDown={hv.onKey}
        onBlur={() => hv.setI(null)}
      >
        {y.ticks(4).map((tk) => (
          <g key={tk}>
            <line className="grid-line" x1={pad.l} x2={w - pad.r} y1={y(tk)} y2={y(tk)} />
            <text className="tick" x={pad.l - 6} y={y(tk)} dy="0.32em" textAnchor="end">
              {valueFmt(tk)}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % every === 0 ? (
            <text key={d.key} className="tick" x={x(i)} y={h - pad.b + 15} textAnchor="middle">
              {d.label}
            </text>
          ) : null,
        )}
        {refLine && (
          <g>
            <line
              x1={pad.l}
              x2={w - pad.r}
              y1={y(refLine.value)}
              y2={y(refLine.value)}
              stroke="var(--ink-3)"
              strokeWidth="1"
            />
            <text className="tick" x={pad.l + 4} y={y(refLine.value) - 5}>
              {refLine.label}
            </text>
          </g>
        )}
        {nowI >= 0 && (
          <line x1={x(nowI)} x2={x(nowI)} y1={pad.t} y2={h - pad.b} stroke="var(--axis)" strokeWidth="1" />
        )}
        {bandData.length > 1 && <path d={band(bandData) ?? ""} fill={color} opacity={0.16} />}
        {obs.length > 1 && (
          <path d={lineGen(obs) ?? ""} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        )}
        {fcLine.length > 1 && (
          <path
            d={lineGen(fcLine) ?? ""}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeDasharray="5 4"
            strokeLinejoin="round"
          />
        )}
        {lastObs && (
          <circle
            cx={x(lastObs.i)}
            cy={y(lastObs.v)}
            r={4.5}
            fill={color}
            stroke="var(--surface)"
            strokeWidth={2}
          />
        )}
        {lastFc && (
          <>
            <circle
              cx={x(lastFc.i)}
              cy={y(lastFc.d.p50!)}
              r={4.5}
              fill="var(--surface)"
              stroke={color}
              strokeWidth={2}
            />
            <text className="direct-label" x={x(lastFc.i) + 8} y={y(lastFc.d.p50!)} dy="0.32em">
              {valueFmt(lastFc.d.p50!)}
            </text>
          </>
        )}
        {hover && hv.i !== null && (
          <line x1={x(hv.i)} x2={x(hv.i)} y1={pad.t} y2={h - pad.b} stroke="var(--ink-3)" strokeWidth={1} />
        )}
        <rect
          x={pad.l}
          y={0}
          width={Math.max(0, w - pad.l - pad.r)}
          height={h}
          fill="transparent"
          onPointerMove={hv.onMove}
          onPointerLeave={() => hv.setI(null)}
        />
      </svg>
      {hover && hv.i !== null && (
        <Tooltip x={x(hv.i)} y={y(hover.value ?? hover.p50 ?? 0)}>
          <b>
            {valueFmt(hover.value ?? hover.p50 ?? 0)} {unit}
          </b>
          {hover.label}
          {hover.p10 !== undefined && hover.p90 !== undefined && (
            <div className="muted">
              {valueFmt(hover.p10)} – {valueFmt(hover.p90)}
            </div>
          )}
        </Tooltip>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- soil water balance */

export function WaterChart({
  days,
  todayIndex,
  height = 190,
  label,
  labels,
  dayLabel,
}: {
  days: {
    date: string;
    available: number;
    stressAt: number;
    capacity: number;
    rain: number;
    irrigation: number;
  }[];
  todayIndex: number;
  height?: number;
  label: string;
  labels: { water: string; stress: string; today: string };
  dayLabel: (iso: string) => string;
}) {
  const pad = { t: 14, r: 10, b: 24, l: 36 };
  return (
    <ChartShell
      label={label}
      legend={
        <>
          <span>
            <i style={{ background: "var(--series-2)" }} />
            {labels.water}
          </span>
          <span>
            <i style={{ background: "var(--critical)" }} />
            {labels.stress}
          </span>
        </>
      }
      table={{
        head: ["", `${labels.water} (mm)`, `${labels.stress} (mm)`],
        rows: days.map((d) => [dayLabel(d.date), Math.round(d.available), Math.round(d.stressAt)]),
      }}
    >
      {(w) => {
        const max = niceMax(Math.max(...days.map((d) => d.capacity)) * 1.05);
        const x = scaleLinear()
          .domain([0, days.length - 1])
          .range([pad.l, w - pad.r]);
        const y = scaleLinear()
          .domain([0, max])
          .range([height - pad.b, pad.t]);
        const pts = days.map((d, i) => ({ i, v: d.available }));
        const ln = d3line<{ i: number; v: number }>()
          .x((d) => x(d.i))
          .y((d) => y(d.v))
          .curve(curveMonotoneX);
        const ar = d3area<{ i: number; v: number }>()
          .x((d) => x(d.i))
          .y0(y(0))
          .y1((d) => y(d.v))
          .curve(curveMonotoneX);
        const stress = days.map((d, i) => ({ i, v: d.stressAt }));
        const past = pts.slice(0, todayIndex + 1);
        const future = pts.slice(todayIndex);
        const every = Math.ceil(days.length / Math.max(1, Math.floor((w - pad.l) / 50)));
        return (
          <svg width={w} height={height}>
            {y.ticks(4).map((tk) => (
              <g key={tk}>
                <line className="grid-line" x1={pad.l} x2={w - pad.r} y1={y(tk)} y2={y(tk)} />
                <text className="tick" x={pad.l - 6} y={y(tk)} dy="0.32em" textAnchor="end">
                  {tk}
                </text>
              </g>
            ))}
            <path d={ar(past) ?? ""} fill="var(--series-2)" opacity={0.14} />
            <path d={ar(future) ?? ""} fill="var(--series-2)" opacity={0.07} />
            <path d={ln(past) ?? ""} fill="none" stroke="var(--series-2)" strokeWidth={2} />
            <path
              d={ln(future) ?? ""}
              fill="none"
              stroke="var(--series-2)"
              strokeWidth={2}
              strokeDasharray="5 4"
            />
            <path d={ln(stress) ?? ""} fill="none" stroke="var(--critical)" strokeWidth={1.5} opacity={0.8} />
            {days.map((d, i) =>
              d.rain >= 2 || d.irrigation > 0 ? (
                <g key={d.date}>
                  <circle
                    cx={x(i)}
                    cy={pad.t + 2}
                    r={Math.min(6, 2.5 + Math.sqrt(d.rain + d.irrigation) / 2)}
                    fill={d.irrigation > 0 ? "var(--series-4)" : "var(--series-2)"}
                    stroke="var(--surface)"
                    strokeWidth={2}
                  />
                </g>
              ) : null,
            )}
            <line
              x1={x(todayIndex)}
              x2={x(todayIndex)}
              y1={pad.t}
              y2={height - pad.b}
              stroke="var(--ink-3)"
              strokeWidth={1}
            />
            <text className="tick" x={x(todayIndex) + 4} y={height - pad.b - 6}>
              {labels.today}
            </text>
            {days.map((d, i) =>
              i % every === 0 ? (
                <text key={d.date} className="tick" x={x(i)} y={height - pad.b + 15} textAnchor="middle">
                  {dayLabel(d.date)}
                </text>
              ) : null,
            )}
            <line className="axis-line" x1={pad.l} x2={w - pad.r} y1={height - pad.b} y2={height - pad.b} />
          </svg>
        );
      }}
    </ChartShell>
  );
}

/* ---------------------------------------------------------------- horizontal bars */

export function HBarChart({
  data,
  label,
  unit = "",
  valueFmt = (v: number) => v.toFixed(0),
  color = "var(--series-1)",
  tableHead,
  domainMax,
}: {
  data: { key: string; label: string; value: number; muted?: boolean }[];
  label: string;
  unit?: string;
  valueFmt?: (v: number) => string;
  color?: string;
  tableHead: [string, string];
  domainMax?: number;
}) {
  const rowH = 30;
  return (
    <ChartShell
      label={label}
      table={{ head: tableHead, rows: data.map((d) => [d.label, `${valueFmt(d.value)}${unit}`]) }}
    >
      {(w) => {
        const labW = Math.min(130, w * 0.38);
        const min = Math.min(0, ...data.map((d) => d.value));
        const max = domainMax ?? Math.max(...data.map((d) => d.value), 0.0001);
        const x = scaleLinear()
          .domain([min, max])
          .range([labW, w - 52]);
        const h = data.length * rowH + 4;
        return (
          <svg width={w} height={h}>
            {min < 0 && <line className="axis-line" x1={x(0)} x2={x(0)} y1={0} y2={h} />}
            {data.map((d, i) => {
              const y0 = i * rowH + 6;
              const x0 = x(Math.min(0, d.value));
              const bw = Math.abs(x(d.value) - x(0));
              return (
                <g key={d.key}>
                  <text
                    className="tick"
                    x={labW - 8}
                    y={y0 + 9}
                    dy="0.32em"
                    textAnchor="end"
                    style={{ fontSize: 12 }}
                  >
                    {d.label}
                  </text>
                  <rect
                    x={x0}
                    y={y0}
                    width={Math.max(1, bw)}
                    height={18}
                    rx={4}
                    fill={d.muted ? "var(--muted-mark)" : color}
                  />
                  <text className="direct-label" x={x(Math.max(0, d.value)) + 6} y={y0 + 9} dy="0.32em">
                    {valueFmt(d.value)}
                    {unit}
                  </text>
                </g>
              );
            })}
          </svg>
        );
      }}
    </ChartShell>
  );
}

/* ---------------------------------------------------------------- hourly strip */

export function StatusStrip({
  cells,
  label,
  ticks,
}: {
  cells: { key: string; level: "good" | "marginal" | "poor"; tip: string }[];
  label: string;
  ticks: { index: number; label: string }[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const colors = { good: "var(--good)", marginal: "var(--warning)", poor: "var(--critical)" };
  const t = useT();
  const levels = useMemo(() => ({ good: t.level.good, marginal: t.level.marginal, poor: t.level.poor }), [t]);
  return (
    <ChartShell
      label={label}
      legend={(["good", "marginal", "poor"] as const).map((l) => (
        <span key={l}>
          <i className="band" style={{ background: colors[l], opacity: 0.85 }} />
          {levels[l]}
        </span>
      ))}
      table={{ head: ["", label], rows: cells.map((c) => [c.tip, levels[c.level]]) }}
    >
      {(w) => {
        const n = cells.length;
        const gap = 2;
        const cw = (w - gap * (n - 1)) / n;
        return (
          <>
            <svg width={w} height={46}>
              {cells.map((c, i) => (
                <rect
                  key={c.key}
                  x={i * (cw + gap)}
                  y={4}
                  width={Math.max(1, cw)}
                  height={22}
                  rx={Math.min(4, cw / 2)}
                  fill={colors[c.level]}
                  opacity={hover === null || hover === i ? 0.85 : 0.35}
                  onPointerEnter={() => setHover(i)}
                  onPointerLeave={() => setHover(null)}
                />
              ))}
              {ticks.map((tk) => (
                <text key={tk.index} className="tick" x={tk.index * (cw + gap)} y={42}>
                  {tk.label}
                </text>
              ))}
            </svg>
            {hover !== null && cells[hover] && (
              <Tooltip x={hover * (cw + gap) + cw / 2} y={4}>
                <b>{levels[cells[hover]!.level]}</b>
                {cells[hover]!.tip}
              </Tooltip>
            )}
          </>
        );
      }}
    </ChartShell>
  );
}
