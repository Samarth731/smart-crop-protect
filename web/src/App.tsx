import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Skeleton } from "./components/ui";
import { Onboarding } from "./features/onboarding/Onboarding";
import { TodayPage } from "./features/today/TodayPage";
import { applyDocumentPrefs, useProfile } from "./state/profile";

const FieldPage = lazy(() => import("./features/field/FieldPage"));
const ScanPage = lazy(() => import("./features/scan/ScanPage"));
const MoneyPage = lazy(() => import("./features/money/MoneyPage"));
const PlanPage = lazy(() => import("./features/plan/PlanPage"));
const LearnPage = lazy(() => import("./features/learn/LearnPage"));
const AiPage = lazy(() => import("./features/ai/AiPage"));
const SettingsPage = lazy(() => import("./features/settings/SettingsPage"));

// Load Indic fonts only when the user picks an Indic language.
const FONT_LOADERS = {
  hi: () => import("@fontsource-variable/anek-devanagari"),
  mr: () => import("@fontsource-variable/anek-devanagari"),
  gu: () => import("@fontsource-variable/anek-gujarati"),
} as const;

function PageFallback() {
  return (
    <div className="page" aria-busy="true">
      <Skeleton h={40} w="50%" />
      <Skeleton h={220} r={22} />
      <Skeleton h={160} r={22} />
    </div>
  );
}

export function App() {
  const { onboarded, theme, lang, textScale } = useProfile();
  useEffect(() => {
    applyDocumentPrefs({ theme, lang, textScale });
    if (lang !== "en") void FONT_LOADERS[lang]();
  }, [theme, lang, textScale]);

  if (!onboarded) return <Onboarding />;

  return (
    <AppShell>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<TodayPage />} />
          <Route path="/field" element={<FieldPage />} />
          <Route path="/scan" element={<ScanPage />} />
          <Route path="/money" element={<MoneyPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/learn" element={<LearnPage />} />
          <Route path="/ai" element={<AiPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
