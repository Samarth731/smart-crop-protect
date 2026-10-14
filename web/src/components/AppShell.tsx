import {
  BookOpen,
  BrainCircuit,
  CalendarDays,
  CloudSun,
  Home,
  IndianRupee,
  Mic,
  ScanLine,
  Settings,
  Volume2,
  WifiOff,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { bcp47, useT } from "@/i18n";
import { CROPS } from "@/lib/crops";
import { useProfile } from "@/state/profile";
import { CropGlyph, Logo } from "./art";
import { useToast } from "./ui";

const PRIMARY = [
  { to: "/", key: "today", icon: Home },
  { to: "/field", key: "field", icon: CloudSun },
  { to: "/scan", key: "scan", icon: ScanLine },
  { to: "/money", key: "money", icon: IndianRupee },
  { to: "/plan", key: "plan", icon: CalendarDays },
] as const;

const SECONDARY = [
  { to: "/learn", key: "learn", icon: BookOpen },
  { to: "/ai", key: "ai", icon: BrainCircuit },
  { to: "/settings", key: "settings", icon: Settings },
] as const;

// Spoken keywords per page, across English, Hindi, Marathi and Gujarati.
const VOICE: [string, string[]][] = [
  [
    "/field",
    [
      "weather",
      "rain",
      "water",
      "field",
      "मौसम",
      "बारिश",
      "पानी",
      "खेत",
      "हवामान",
      "पाऊस",
      "शेत",
      "હવામાન",
      "વરસાદ",
      "પાણી",
      "ખેતર",
    ],
  ],
  ["/scan", ["scan", "photo", "disease", "doctor", "स्कैन", "फोटो", "रोग", "स्कॅन", "સ્કેન", "ફોટો", "રોગ"]],
  [
    "/money",
    [
      "money",
      "price",
      "market",
      "yield",
      "पैसा",
      "भाव",
      "बाज़ार",
      "बाजार",
      "पैसे",
      "उत्पादन",
      "પૈસા",
      "ભાવ",
      "બજાર",
    ],
  ],
  ["/plan", ["plan", "task", "calendar", "योजना", "काम", "नियोजन", "कामे", "યોજના", "કામ"]],
  ["/learn", ["learn", "pest", "जानकारी", "कीट", "माहिती", "कीड", "માહિતી", "જીવાત"]],
  ["/", ["home", "today", "होम", "आज", "मुख्य", "હોમ", "આજે"]],
];

export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { lang, crop, place } = useProfile();
  const [scrolled, setScrolled] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to top on route change only
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const readAloud = () => {
    if (!("speechSynthesis" in window)) {
      toast(t.app.speechUnsupported);
      return;
    }
    speechSynthesis.cancel();
    const main = document.querySelector("main");
    const text = [...(main?.querySelectorAll("[data-speak]") ?? [])]
      .map((e) => (e as HTMLElement).innerText)
      .join(". ");
    const u = new SpeechSynthesisUtterance(text || main?.innerText.slice(0, 600) || "");
    u.lang = bcp47(lang);
    speechSynthesis.speak(u);
  };

  const voice = () => {
    const SR =
      (window as unknown as { SpeechRecognition?: typeof SpeechRecognitionCtor }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognitionCtor })
        .webkitSpeechRecognition;
    if (!SR) {
      toast(t.app.voiceUnsupported);
      return;
    }
    const r = new SR();
    r.lang = bcp47(lang);
    r.onresult = (e: { results: { 0: { 0: { transcript: string } } } }) => {
      const s = e.results[0][0].transcript.toLowerCase();
      if (/read|सुना|बोल|वाच|વાંચ/.test(s)) {
        readAloud();
        return;
      }
      const hit = VOICE.find(([, words]) => words.some((w) => s.includes(w)));
      toast(`🎤 ${s}`);
      if (hit) navigate(hit[0]);
    };
    r.onerror = () => toast(t.app.notHeard);
    r.start();
    toast(t.app.listening);
  };

  const navLabel = (key: string) => t.nav[key as keyof typeof t.nav];

  return (
    <div className="shell">
      <aside className="rail" aria-label={t.app.name}>
        <NavLink to="/" className="brand">
          <Logo size={36} />
          <span>
            {t.app.name}
            <small>{t.app.tagline}</small>
          </span>
        </NavLink>
        <nav aria-label="Primary">
          {PRIMARY.map(({ to, key, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === "/"} className="navlink">
              <Icon aria-hidden="true" />
              {navLabel(key)}
            </NavLink>
          ))}
        </nav>
        <div className="eyebrow rail-sep">{t.nav.learn}</div>
        <nav aria-label="Secondary">
          {SECONDARY.map(({ to, key, icon: Icon }) => (
            <NavLink key={to} to={to} className="navlink">
              <Icon aria-hidden="true" />
              {navLabel(key)}
            </NavLink>
          ))}
        </nav>
        <div className="rail-foot">
          <NavLink to="/settings" className="profile-chip">
            <CropGlyph crop={crop} size={30} />
            <span>
              <b>{CROPS[crop].name[lang]}</b>
              <small>{place ? `${place.district}, ${place.state}` : ""}</small>
            </span>
          </NavLink>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar" data-scrolled={scrolled}>
          <NavLink to="/" className="brand" aria-label={t.app.name}>
            <Logo size={30} />
            <span>{t.app.name}</span>
          </NavLink>
          {!online && (
            <span className="status" data-level="neutral" title={t.app.offline}>
              <WifiOff aria-hidden="true" />
              <span className="sr-only">{t.app.offline}</span>
            </span>
          )}
          <button
            type="button"
            className="iconbtn"
            onClick={voice}
            aria-label={t.app.voice}
            title={t.app.voice}
          >
            <Mic />
          </button>
          <button
            type="button"
            className="iconbtn"
            onClick={readAloud}
            aria-label={t.app.readAloud}
            title={t.app.readAloud}
          >
            <Volume2 />
          </button>
          <NavLink to="/settings" className="iconbtn mobile-only" aria-label={t.nav.settings}>
            <Settings />
          </NavLink>
        </header>
        <main className="main" id="main">
          {children}
        </main>
      </div>

      <nav className="bottomnav" aria-label="Primary">
        {PRIMARY.map(({ to, key, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} className={key === "scan" ? "scan-tab" : undefined}>
            {key === "scan" ? (
              <span className="scan-orb">
                <Icon aria-hidden="true" />
              </span>
            ) : (
              <Icon aria-hidden="true" />
            )}
            <span>{navLabel(key)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

// Minimal typing for the Web Speech API constructor (not in TS DOM lib).
declare const SpeechRecognitionCtor: {
  new (): {
    lang: string;
    onresult: (e: { results: { 0: { 0: { transcript: string } } } }) => void;
    onerror: () => void;
    start: () => void;
  };
};
