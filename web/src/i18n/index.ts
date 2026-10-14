import type { Lang } from "@/lib/crops";
import { useProfile } from "@/state/profile";
import { en, type Messages } from "./en";
import { gu } from "./gu";
import { hi } from "./hi";
import { mr } from "./mr";

export const MESSAGES: Record<Lang, Messages> = { en, hi, gu, mr };

export const LANGS: { id: Lang; label: string; native: string; bcp47: string }[] = [
  { id: "en", label: "English", native: "English", bcp47: "en-IN" },
  { id: "hi", label: "Hindi", native: "हिन्दी", bcp47: "hi-IN" },
  { id: "mr", label: "Marathi", native: "मराठी", bcp47: "mr-IN" },
  { id: "gu", label: "Gujarati", native: "ગુજરાતી", bcp47: "gu-IN" },
];

export const bcp47 = (l: Lang) => LANGS.find((x) => x.id === l)?.bcp47 ?? "en-IN";

export function useT(): Messages {
  const lang = useProfile((s) => s.lang);
  return MESSAGES[lang];
}

export function useLang(): Lang {
  return useProfile((s) => s.lang);
}

/** Locale-aware formatting helpers bound to the current language. */
export function useFmt() {
  const lang = useLang();
  // Latin digits everywhere: they are what mandi boards, MSP notices and phones show.
  const loc = `${bcp47(lang)}-u-nu-latn`;
  return {
    lang,
    num: (n: number, digits = 0) =>
      new Intl.NumberFormat(loc, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n),
    inr: (n: number) =>
      new Intl.NumberFormat(loc, { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n),
    compactInr: (n: number) =>
      new Intl.NumberFormat(loc, {
        style: "currency",
        currency: "INR",
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(n),
    day: (iso: string) =>
      new Intl.DateTimeFormat(loc, { weekday: "short" }).format(new Date(`${iso.slice(0, 10)}T12:00:00`)),
    date: (iso: string | Date) =>
      new Intl.DateTimeFormat(loc, { day: "numeric", month: "short" }).format(
        typeof iso === "string" ? new Date(`${iso.slice(0, 10)}T12:00:00`) : iso,
      ),
    longDate: (d: Date) =>
      new Intl.DateTimeFormat(loc, { weekday: "long", day: "numeric", month: "long" }).format(d),
    month: (ym: string) =>
      new Intl.DateTimeFormat(loc, { month: "short", year: "numeric" }).format(new Date(`${ym}-15T12:00:00`)),
    time: (iso: string) =>
      new Intl.DateTimeFormat(loc, { hour: "numeric", hour12: true }).format(
        new Date(iso.length <= 16 ? `${iso}:00` : iso),
      ),
    relative: (ms: number) => {
      const mins = Math.round((Date.now() - ms) / 60000);
      const rtf = new Intl.RelativeTimeFormat(loc, { numeric: "auto" });
      if (mins < 60) return rtf.format(-mins, "minute");
      const hrs = Math.round(mins / 60);
      if (hrs < 48) return rtf.format(-hrs, "hour");
      return rtf.format(-Math.round(hrs / 24), "day");
    },
  };
}

/** Yield: kg/ha -> the farmer's unit (quintal per acre). */
export const kgHaToQAcre = (kgHa: number) => (kgHa / 100) * 0.404686;
