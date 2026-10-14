import { type ReactNode, useId } from "react";
import type { Sky } from "@/lib/api/weather";
import type { CropId } from "@/lib/crops";

/**
 * A living illustration of the user's field: sky for the local hour and forecast condition,
 * crop rows in perspective coloured by growth stage, and foreground plants for the crop.
 */

type Period = "night" | "dawn" | "day" | "dusk";

const hex = (h: string) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
const toHex = (c: number[]) =>
  `#${c
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
export const mix = (a: string, b: string, t: number) => {
  const x = hex(a);
  const y = hex(b);
  return toHex(x.map((v, i) => v + (y[i]! - v) * t));
};

const SKY: Record<Period, [string, string]> = {
  night: ["#0B1626", "#24384A"],
  dawn: ["#7E9CC4", "#F6C99A"],
  day: ["#7FB6DE", "#E6EFE2"],
  dusk: ["#4E5488", "#EE9C6E"],
};

function periodOf(hour: number): Period {
  if (hour < 5 || hour >= 20) return "night";
  if (hour < 7.5) return "dawn";
  if (hour < 17.3) return "day";
  return "dusk";
}

const overcast: Record<Sky, number> = {
  clear: 0,
  partly: 0.12,
  cloudy: 0.45,
  fog: 0.55,
  drizzle: 0.55,
  rain: 0.68,
  storm: 0.82,
};

function skyColors(period: Period, sky: Sky): [string, string] {
  const [top, hor] = SKY[period];
  const t = overcast[sky];
  const grey = period === "night" ? "#202a33" : sky === "storm" ? "#4c5860" : "#9aa5a8";
  return [mix(top, grey, t), mix(hor, period === "night" ? "#2b3640" : "#c5cbc6", t * 0.85)];
}

export function sceneTone(hour: number, sky: Sky): "light" | "dark" {
  const p = periodOf(hour);
  if (p === "night" || p === "dusk") return "light";
  if (sky === "storm" || sky === "rain") return "light";
  return "dark";
}

interface CropLook {
  young: string;
  green: string;
  ripe: string;
  accent?: string; // flowers / bolls / fruit
  tall: number; // relative plant height
  form: "grass" | "maize" | "bush" | "cane" | "low";
}

const LOOK: Record<CropId, CropLook> = {
  rice: { young: "#8CCB5E", green: "#5DAE45", ripe: "#D8B44A", tall: 0.8, form: "grass" },
  wheat: { young: "#8CC25C", green: "#5E9E48", ripe: "#DDB65A", tall: 0.85, form: "grass" },
  bajra: { young: "#86B85A", green: "#5A9446", ripe: "#B7A06A", tall: 1.1, form: "grass" },
  jowar: { young: "#86B85A", green: "#5A9446", ripe: "#B9724A", tall: 1.15, form: "grass" },
  maize: { young: "#7DBE57", green: "#4F9A43", ripe: "#C9B27A", accent: "#E2B33D", tall: 1.2, form: "maize" },
  cotton: { young: "#7DBA5A", green: "#4E8E45", ripe: "#6F8A4A", accent: "#FFFFFF", tall: 0.9, form: "bush" },
  groundnut: {
    young: "#86C25E",
    green: "#5B9F48",
    ripe: "#9A9A55",
    accent: "#F2C230",
    tall: 0.45,
    form: "low",
  },
  soybean: { young: "#86C25E", green: "#4F9A45", ripe: "#C7A24E", tall: 0.6, form: "bush" },
  chickpea: {
    young: "#8DBB66",
    green: "#6A9C52",
    ripe: "#B79E62",
    accent: "#C88BB3",
    tall: 0.5,
    form: "low",
  },
  pigeonpea: {
    young: "#86B85A",
    green: "#558F45",
    ripe: "#9A8A4E",
    accent: "#E9B62F",
    tall: 1,
    form: "bush",
  },
  moong: { young: "#86C25E", green: "#5B9F48", ripe: "#8D8A45", accent: "#E7CF3A", tall: 0.45, form: "low" },
  urad: { young: "#86C25E", green: "#4F8E45", ripe: "#6E6B3E", tall: 0.45, form: "low" },
  mustard: {
    young: "#8CC25C",
    green: "#6CA84E",
    ripe: "#B8A050",
    accent: "#F2D02E",
    tall: 0.9,
    form: "bush",
  },
  sugarcane: { young: "#7FBE57", green: "#5A9A42", ripe: "#7DA44A", tall: 1.45, form: "cane" },
  potato: { young: "#86C25E", green: "#5B9F48", ripe: "#A7A35A", accent: "#F1EEE4", tall: 0.4, form: "low" },
  onion: { young: "#9CC46A", green: "#78A85A", ripe: "#B6A563", tall: 0.4, form: "low" },
  tomato: { young: "#7DBA5A", green: "#4E8E45", ripe: "#5E8A44", accent: "#D9473A", tall: 0.6, form: "bush" },
};

const SOIL = ["#9B7A56", "#86684A"];

function stageColor(look: CropLook, p: number): string {
  if (p < 0) return SOIL[0]!;
  if (p < 0.15) return mix(SOIL[0]!, look.young, p / 0.15);
  if (p < 0.35) return mix(look.young, look.green, (p - 0.15) / 0.2);
  if (p < 0.7) return look.green;
  if (p < 1) return mix(look.green, look.ripe, (p - 0.7) / 0.3);
  return look.ripe;
}

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function FieldScene({
  hour,
  sky,
  crop,
  progress,
  children,
  height = 260,
}: {
  hour: number;
  sky: Sky;
  crop: CropId;
  progress: number;
  children?: ReactNode;
  height?: number;
}) {
  const id = useId().replace(/:/g, "");
  const period = periodOf(hour);
  const [top, horizon] = skyColors(period, sky);
  const look = LOOK[crop];
  const night = period === "night";
  const dim = night ? 0.62 : period === "dusk" ? 0.25 : overcast[sky] * 0.25;
  const shade = (c: string) => mix(c, night ? "#0d1712" : "#2a2a2a", dim);
  const field = shade(stageColor(look, progress));
  const fieldAlt = mix(field, night ? "#06100b" : "#1d3a20", 0.18);
  const haze = horizon;
  const hillFar = shade(mix("#8FB07C", haze, 0.45));
  const hillNear = shade(mix("#6A9658", haze, 0.18));
  const showFlowers = look.accent && progress > 0.3 && progress < 1.05;
  const flooded = crop === "rice" && progress >= 0 && progress < 0.75;

  // sun / moon position on a simple arc
  const dayT = Math.min(1, Math.max(0, (hour - 6) / 12));
  const sunX = 80 + dayT * 640;
  const sunY = 150 - Math.sin(dayT * Math.PI) * 110;
  const moonT = ((hour + 24 - 19) % 24) / 11;
  const moonX = 120 + Math.min(1, moonT) * 560;
  const moonY = 140 - Math.sin(Math.min(1, moonT) * Math.PI) * 90;

  // perspective field stripes
  const vp = { x: 400, y: 120 };
  const fieldTop = 196;
  const stripes = 22;
  const stripePolys: string[] = [];
  for (let i = 0; i < stripes; i++) {
    const x0 = -700 + (i * 2200) / stripes;
    const x1 = -700 + ((i + 1) * 2200) / stripes;
    const atTop = (x: number) => vp.x + ((x - vp.x) * (fieldTop - vp.y)) / (300 - vp.y);
    stripePolys.push(`${x0},300 ${x1},300 ${atTop(x1)},${fieldTop} ${atTop(x0)},${fieldTop}`);
  }

  // foreground plants
  const rand = rng(crop.length * 7919 + 104729);
  const plants = Array.from({ length: 15 }, (_, i) => ({
    x: 18 + i * 55 + (rand() - 0.5) * 22,
    s: 0.82 + rand() * 0.36,
    flip: rand() > 0.5,
  }));
  const growth = progress < 0 ? 0 : Math.min(1, 0.25 + progress * 1.1);
  const plantColor = shade(stageColor(look, progress));
  const plantDark = mix(plantColor, "#0f2414", 0.3);

  const rainy = sky === "rain" || sky === "drizzle" || sky === "storm";
  const clouds = sky !== "clear";

  return (
    <div className="scene" style={{ height }} data-tone={sceneTone(hour, sky)}>
      <svg
        className="scene-art"
        viewBox="0 0 800 300"
        preserveAspectRatio="xMidYMax slice"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`sky${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={top} />
            <stop offset="1" stopColor={horizon} />
          </linearGradient>
          <radialGradient id={`glow${id}`}>
            <stop offset="0" stopColor="#FFE9B0" stopOpacity={night ? 0 : 0.7 - overcast[sky] * 0.6} />
            <stop offset="1" stopColor="#FFE9B0" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`fade${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.55" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity={night ? 0.35 : 0.18} />
          </linearGradient>
          <linearGradient id={`haze${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={horizon} stopOpacity={night ? 0.35 : 0.75} />
            <stop offset="1" stopColor={horizon} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`water${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={mix(horizon, "#ffffff", 0.3)} stopOpacity=".55" />
            <stop offset="1" stopColor={mix(top, "#ffffff", 0.2)} stopOpacity=".15" />
          </linearGradient>
          <filter id={`soft${id}`} x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="3.2" />
          </filter>
          <clipPath id={`fieldclip${id}`}>
            <rect x="0" y={fieldTop} width="800" height={300 - fieldTop} />
          </clipPath>
        </defs>

        <rect width="800" height="300" fill={`url(#sky${id})`} />

        {night &&
          sky === "clear" &&
          (() => {
            const r = rng(7919);
            return Array.from({ length: 40 }, (_, i) => (
              <circle
                key={i}
                cx={r() * 800}
                cy={r() * 140}
                r={r() * 1.1 + 0.3}
                fill="#fff"
                opacity={0.35 + r() * 0.5}
              />
            ));
          })()}

        {!night && (
          <g>
            <circle cx={sunX} cy={sunY} r="70" fill={`url(#glow${id})`} />
            <circle cx={sunX} cy={sunY} r="20" fill="#FFD27A" opacity={1 - overcast[sky] * 0.9} />
          </g>
        )}
        {night && (
          <path
            d={`M${moonX} ${moonY - 14}a14 14 0 1 0 11 22.7A16 16 0 0 1 ${moonX} ${moonY - 14}Z`}
            fill="#E8E2CC"
            opacity={1 - overcast[sky] * 0.7}
          />
        )}

        {clouds && (
          <g className="scene-clouds" opacity={sky === "partly" ? 0.6 : 0.9} filter={`url(#soft${id})`}>
            {(sky === "partly"
              ? [
                  [150, 58, 0.55],
                  [620, 40, 0.7],
                ]
              : [
                  [90, 62, 0.75],
                  [330, 40, 0.95],
                  [560, 74, 0.7],
                  [740, 46, 0.85],
                ]
            ).map(([x, y, s], i) => (
              <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
                <path
                  d="M-60 18h120a26 26 0 0 0-10-50 34 34 0 0 0-62-6 26 26 0 0 0-48 30 13 13 0 0 0 0 26Z"
                  fill={mix(night ? "#3a4652" : sky === "storm" ? "#6c7880" : "#ffffff", horizon, 0.25)}
                  opacity={0.9}
                />
              </g>
            ))}
          </g>
        )}

        <path d="M0 176 C120 140 230 150 330 166 S560 150 640 160 S760 150 800 156 V210 H0Z" fill={hillFar} />
        <path d="M0 196 C140 168 260 178 380 190 S620 172 800 186 V215 H0Z" fill={hillNear} />

        {/* trees on the horizon */}
        {[60, 180, 470, 690].map((x, i) => (
          <g
            key={x}
            transform={`translate(${x} ${183 + (i % 2) * 4})`}
            fill={shade(mix("#3F6B3C", haze, 0.12))}
          >
            <rect x="-1.5" y="0" width="3" height="10" fill={shade("#5b4630")} />
            <ellipse cx="0" cy="-4" rx={9 + (i % 3) * 3} ry={8 + (i % 2) * 2} />
          </g>
        ))}

        <g clipPath={`url(#fieldclip${id})`}>
          <rect x="0" y={fieldTop} width="800" height={300 - fieldTop} fill={field} />
          {stripePolys.map((pts, i) => (
            <polygon key={pts} points={pts} fill={i % 2 ? fieldAlt : field} />
          ))}
          {flooded &&
            stripePolys.map((pts, i) =>
              i % 2 ? <polygon key={`w${pts}`} points={pts} fill={`url(#water${id})`} /> : null,
            )}
          {showFlowers &&
            (() => {
              const r = rng(104729);
              return Array.from({ length: 140 }, (_, i) => {
                const y = fieldTop + 30 + r() ** 1.1 * (300 - fieldTop - 30);
                const scale = 0.4 + ((y - fieldTop) / (300 - fieldTop)) * 1.6;
                const bloom =
                  crop === "mustard"
                    ? Math.max(0, 1 - Math.abs(progress - 0.5) * 3.2)
                    : crop === "cotton"
                      ? Math.max(0, (progress - 0.7) * 3.3)
                      : 0.6;
                if (r() > bloom) return null;
                return (
                  <circle key={i} cx={r() * 800} cy={y} r={1.1 * scale} fill={look.accent} opacity=".85" />
                );
              });
            })()}
          <rect x="0" y={fieldTop} width="800" height={300 - fieldTop} fill={`url(#fade${id})`} />
          <rect x="0" y={fieldTop} width="800" height="38" fill={`url(#haze${id})`} />
        </g>

        {rainy && (
          <g
            className="scene-rain"
            stroke={night ? "#9fb4c8" : "#e8f0f6"}
            strokeWidth="1.4"
            opacity={sky === "drizzle" ? 0.35 : 0.55}
          >
            {(() => {
              const r = rng(15485863);
              return Array.from({ length: sky === "drizzle" ? 50 : 110 }, (_, i) => {
                const x = r() * 900 - 50;
                const y = r() * 300 - 40;
                return <line key={i} x1={x} y1={y} x2={x - 6} y2={y + 18} />;
              });
            })()}
          </g>
        )}
        {sky === "fog" && <rect width="800" height="300" fill="#ffffff" opacity=".28" />}
        {sky === "storm" && <rect className="scene-flash" width="800" height="300" fill="#ffffff" />}

        {/* foreground plants */}
        {growth > 0 && (
          <g>
            {plants.map((p) => (
              <g
                key={p.x}
                transform={`translate(${p.x} 300) scale(${(p.flip ? -1 : 1) * p.s * growth * look.tall} ${p.s * growth * look.tall})`}
              >
                <PlantShape
                  form={look.form}
                  color={plantColor}
                  dark={plantDark}
                  accent={look.accent}
                  progress={progress}
                  ripe={shade(look.ripe)}
                />
              </g>
            ))}
          </g>
        )}
      </svg>
      <div className="scene-scrim" />
      <div className="scene-body">{children}</div>
    </div>
  );
}

function PlantShape({
  form,
  color,
  dark,
  accent,
  progress,
  ripe,
}: {
  form: CropLook["form"];
  color: string;
  dark: string;
  accent?: string;
  progress: number;
  ripe: string;
}) {
  const late = progress > 0.55;
  if (form === "grass") {
    return (
      <g fill="none" strokeLinecap="round">
        {[-18, -10, -3, 4, 11, 19].map((a, i) => (
          <path
            key={a}
            d={`M0 0 Q${a * 0.6} -40 ${a * 1.6} -${70 + (i % 3) * 12}`}
            stroke={i % 2 ? color : dark}
            strokeWidth="3"
          />
        ))}
        {late &&
          [-8, 8].map((a) => (
            <path
              key={a}
              d={`M${a * 0.5} -60 q${a} -22 ${a * 2.2} -8`}
              stroke={ripe}
              strokeWidth="6"
              strokeDasharray="3 2.5"
            />
          ))}
      </g>
    );
  }
  if (form === "maize") {
    return (
      <g>
        <path d="M-2 0h4v-118h-4Z" fill={dark} />
        {[0, 1, 2, 3].map((i) => (
          <path
            key={i}
            d={`M0 -${26 + i * 22} q${i % 2 ? 30 : -30} -10 ${i % 2 ? 42 : -42} 8`}
            stroke={color}
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
          />
        ))}
        {late && <ellipse cx="6" cy="-62" rx="5" ry="12" fill={accent} transform="rotate(18 6 -62)" />}
        <path
          d="M0 -118 l-6 -16 M0 -118 l0 -18 M0 -118 l6 -15"
          stroke={ripe}
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>
    );
  }
  if (form === "cane") {
    return (
      <g>
        {[-8, 0, 8].map((x) => (
          <rect key={x} x={x - 2.5} y={-150} width="5" height="150" rx="2" fill={x === 0 ? dark : color} />
        ))}
        {[-1, 1].map((d) => (
          <path
            key={d}
            d={`M0 -150 q${d * 40} -10 ${d * 55} 22`}
            stroke={color}
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
          />
        ))}
      </g>
    );
  }
  if (form === "bush") {
    return (
      <g>
        <path d="M-1.5 0h3v-60h-3Z" fill={dark} />
        {(
          [
            [-14, -30, 16],
            [14, -36, 15],
            [-8, -52, 14],
            [10, -58, 13],
            [0, -66, 12],
          ] as [number, number, number][]
        ).map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill={i % 2 ? color : dark} />
        ))}
        {accent &&
          progress > 0.45 &&
          [
            [-10, -42],
            [12, -50],
            [2, -70],
          ].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="4.5" fill={accent} />)}
      </g>
    );
  }
  return (
    <g>
      {(
        [
          [-14, -14, 13],
          [12, -16, 12],
          [0, -26, 13],
        ] as [number, number, number][]
      ).map(([x, y, r], i) => (
        <ellipse key={i} cx={x} cy={y} rx={r} ry={r * 0.8} fill={i % 2 ? color : dark} />
      ))}
      {accent && progress > 0.4 && <circle cx="4" cy="-34" r="3.6" fill={accent} />}
    </g>
  );
}
