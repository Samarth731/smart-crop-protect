import type { Sky } from "@/lib/api/weather";
import type { CropId } from "@/lib/crops";

/** Brand mark: a sprout sheltered by a shield, with a turmeric sun. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <path
        d="M20 2.5c6.2 2.6 11 3.3 15.5 3.3V18c0 10.6-6.6 17.4-15.5 20.3C11.1 35.4 4.5 28.6 4.5 18V5.8C9 5.8 13.8 5.1 20 2.5Z"
        fill="#1F5135"
      />
      <path d="M20 31.5V18.2" stroke="#F4EFE4" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M20 22.5c-4.8.3-8.3-2.4-9-7.2 4.8-.3 8.2 2.3 9 7.2Z" fill="#9BCB6B" />
      <path d="M20 19.6c.5-5.2 3.9-8.6 9.3-8.9-.4 5.3-3.9 8.6-9.3 8.9Z" fill="#F4EFE4" />
      <circle cx="28.6" cy="26.4" r="3.1" fill="#E2A23B" />
    </svg>
  );
}

/** Flat weather icons keyed by sky condition; night variants swap the sun for a moon. */
export function WeatherIcon({ sky, night = false, size = 32 }: { sky: Sky; night?: boolean; size?: number }) {
  const sun = night ? (
    <path d="M21 8.5a8 8 0 1 0 6.6 12.4A9 9 0 0 1 21 8.5Z" fill="#D9D3BE" />
  ) : (
    <g>
      <circle cx="16" cy="14" r="6" fill="#E8A33D" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line
          key={a}
          x1={16 + Math.cos((a * Math.PI) / 180) * 8.6}
          y1={14 + Math.sin((a * Math.PI) / 180) * 8.6}
          x2={16 + Math.cos((a * Math.PI) / 180) * 11}
          y2={14 + Math.sin((a * Math.PI) / 180) * 11}
          stroke="#E8A33D"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      ))}
    </g>
  );
  const cloud = (fill: string, dx = 0, dy = 0) => (
    <path
      transform={`translate(${dx} ${dy})`}
      d="M10 27h15.5a5.5 5.5 0 0 0 .6-11A7.5 7.5 0 0 0 11.8 17 5 5 0 0 0 10 27Z"
      fill={fill}
    />
  );
  const drops = (n: number, color = "#3B7FC4") =>
    Array.from({ length: n }, (_, i) => (
      <line
        key={i}
        x1={12 + i * 5}
        y1={29.5}
        x2={10.5 + i * 5}
        y2={33}
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    ));
  return (
    <svg viewBox="0 0 36 36" width={size} height={size} aria-hidden="true">
      {sky === "clear" && <g transform="translate(2 4)">{sun}</g>}
      {sky === "partly" && (
        <>
          <g transform="translate(-2 -2)">{sun}</g>
          {cloud("#C9D3D8", 3, 2)}
        </>
      )}
      {sky === "cloudy" && (
        <>
          {cloud("#B3BEC4", -3, -4)}
          {cloud("#D4DCE0", 3, 1)}
        </>
      )}
      {sky === "fog" && (
        <>
          {cloud("#C9D1D4", 2, -3)}
          {[26, 30].map((y) => (
            <line
              key={y}
              x1="7"
              y1={y}
              x2="29"
              y2={y}
              stroke="#9AA6AC"
              strokeWidth="2"
              strokeLinecap="round"
            />
          ))}
        </>
      )}
      {sky === "drizzle" && (
        <>
          {cloud("#B9C4CA", 2, -3)}
          {drops(3, "#6FA0D2")}
        </>
      )}
      {sky === "rain" && (
        <>
          {cloud("#9AA8B0", 2, -3)}
          {drops(4)}
        </>
      )}
      {sky === "storm" && (
        <>
          {cloud("#7C8A93", 2, -4)}
          <path d="M19 22l-4 7h4l-2 6 7-9h-4l2-4Z" fill="#E8A33D" />
        </>
      )}
    </svg>
  );
}

type GlyphKind =
  | "grain"
  | "maize"
  | "boll"
  | "pod"
  | "flower"
  | "cane"
  | "tuber"
  | "bulb"
  | "fruit"
  | "groundnut";
const GLYPH: Record<CropId, [GlyphKind, string]> = {
  rice: ["grain", "#C9A227"],
  wheat: ["grain", "#D4A84A"],
  bajra: ["grain", "#8C7A4E"],
  jowar: ["grain", "#A85F3A"],
  maize: ["maize", "#E2B33D"],
  cotton: ["boll", "#F5F2EA"],
  groundnut: ["groundnut", "#C69A64"],
  soybean: ["pod", "#B7A15A"],
  chickpea: ["pod", "#C8A46A"],
  pigeonpea: ["pod", "#7FA14A"],
  moong: ["pod", "#5E9A4A"],
  urad: ["pod", "#4B4B3F"],
  mustard: ["flower", "#E9C531"],
  sugarcane: ["cane", "#7FAF5A"],
  potato: ["tuber", "#C79A5E"],
  onion: ["bulb", "#B4566E"],
  tomato: ["fruit", "#D9473A"],
};

/** Small crop glyphs for pickers and chips. */
export function CropGlyph({ crop, size = 28 }: { crop: CropId; size?: number }) {
  const [kind, color] = GLYPH[crop];
  const leaf = "#4E8E4A";
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      {kind === "grain" && (
        <g>
          <path d="M16 30V10" stroke={leaf} strokeWidth="1.8" strokeLinecap="round" />
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <ellipse
                cx={12.6}
                cy={10 + i * 4.2}
                rx="2.3"
                ry="3.4"
                transform={`rotate(-30 12.6 ${10 + i * 4.2})`}
                fill={color}
              />
              <ellipse
                cx={19.4}
                cy={10 + i * 4.2}
                rx="2.3"
                ry="3.4"
                transform={`rotate(30 19.4 ${10 + i * 4.2})`}
                fill={color}
              />
            </g>
          ))}
          <ellipse cx="16" cy="6.5" rx="2.2" ry="3.4" fill={color} />
        </g>
      )}
      {kind === "maize" && (
        <g>
          <path d="M10 28c2-9 4-15 6-21 2 6 4 12 6 21Z" fill={leaf} />
          <ellipse cx="16" cy="15" rx="4.3" ry="8.5" fill={color} />
          {[9, 12, 15, 18, 21].map((y) => (
            <line key={y} x1="12.3" y1={y} x2="19.7" y2={y} stroke="#B8862A" strokeWidth=".8" opacity=".6" />
          ))}
          <path
            d="M16 6.5c-.4-2.2.4-3.7 1.6-4.5"
            stroke="#B8862A"
            strokeWidth="1.2"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      )}
      {kind === "boll" && (
        <g>
          <path d="M16 30v-8" stroke="#6B4E2E" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M8.5 21.5c2.5 2.8 12.5 2.8 15 0l-2-3h-11Z" fill="#6B4E2E" />
          <circle cx="12" cy="14.5" r="5" fill={color} stroke="#D9D2C2" strokeWidth=".8" />
          <circle cx="20" cy="14.5" r="5" fill={color} stroke="#D9D2C2" strokeWidth=".8" />
          <circle cx="16" cy="10" r="5.2" fill="#FFFFFF" stroke="#D9D2C2" strokeWidth=".8" />
        </g>
      )}
      {kind === "pod" && (
        <g>
          <path d="M6 24C9 12 18 6 27 6c-1 9-7 18-21 18Z" fill={color} />
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={11 + i * 5} cy={19 - i * 4} r="2.2" fill="rgba(0,0,0,.18)" />
          ))}
          <path d="M6 24c3-2 8-5 21-18" stroke="rgba(0,0,0,.25)" strokeWidth="1" fill="none" />
        </g>
      )}
      {kind === "groundnut" && (
        <g>
          <path
            d="M11 6c4 0 6 3 5 7-.4 1.6 1 2.4 2.8 3 3.5 1.2 5.2 4 4.4 7.4-.9 3.6-4.6 5.6-8.6 4.3-3-1-4-3.3-3.7-5.9.2-1.6-.6-2.5-2.2-3.4C5.5 16.7 5 13 6.4 9.6 7.3 7.4 9 6 11 6Z"
            fill={color}
          />
          <path
            d="M9 10.5h4M11 15h4M15 20h5M16 24h4"
            stroke="rgba(0,0,0,.18)"
            strokeWidth="1.1"
            strokeLinecap="round"
          />
        </g>
      )}
      {kind === "flower" && (
        <g>
          <path d="M16 30V15" stroke={leaf} strokeWidth="1.8" strokeLinecap="round" />
          {[0, 90, 180, 270].map((a) => (
            <ellipse key={a} cx="16" cy="7.5" rx="3" ry="4.6" transform={`rotate(${a} 16 11)`} fill={color} />
          ))}
          <circle cx="16" cy="11" r="2.2" fill="#B98B12" />
        </g>
      )}
      {kind === "cane" && (
        <g>
          {[11, 17].map((x) => (
            <g key={x}>
              <rect x={x - 2} y="8" width="4.5" height="22" rx="1.6" fill={color} />
              {[13, 19, 25].map((y) => (
                <line key={y} x1={x - 2} y1={y} x2={x + 2.5} y2={y} stroke="#4F7A35" strokeWidth="1.2" />
              ))}
            </g>
          ))}
          <path
            d="M14 8c-3-3-7-4-10-3M20 8c3-3 6-4 9-3"
            stroke={leaf}
            strokeWidth="1.8"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      )}
      {kind === "tuber" && (
        <g>
          <path d="M6 17c0-6 5-10 11-10s10 4 9 10-6 9-11 9-9-3-9-9Z" fill={color} />
          {[
            [11, 14],
            [18, 12],
            [21, 19],
            [13, 21],
          ].map(([x, y]) => (
            <circle key={`${x}${y}`} cx={x} cy={y} r="1" fill="rgba(0,0,0,.22)" />
          ))}
        </g>
      )}
      {kind === "bulb" && (
        <g>
          <path d="M16 4c1.5 4 1 7 0 9-1-2-1.5-5 0-9Z" fill={leaf} />
          <path d="M16 11c6 3 9 7 9 11 0 5-4 8-9 8s-9-3-9-8c0-4 3-8 9-11Z" fill={color} />
          <path
            d="M16 12c-2 4-3 9-2 17M16 12c2 4 3 9 2 17"
            stroke="rgba(255,255,255,.35)"
            strokeWidth="1"
            fill="none"
          />
        </g>
      )}
      {kind === "fruit" && (
        <g>
          <circle cx="16" cy="18.5" r="10" fill={color} />
          <path d="M11 10l5 3 5-3-2 4h-6Z" fill={leaf} />
          <ellipse cx="12.5" cy="15.5" rx="2.5" ry="1.6" fill="rgba(255,255,255,.35)" />
        </g>
      )}
    </svg>
  );
}
