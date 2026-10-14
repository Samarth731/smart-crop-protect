import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { CROPS, type CropId, defaultSowingDate, type Lang, likelySeason, type Season } from "@/lib/crops";

export type Theme = "system" | "light" | "dark";
export type Irrigation = "rainfed" | "flood" | "sprinkler" | "drip";
export type SoilTexture = "auto" | "sandy" | "loamy" | "clay" | "black";

export interface Place {
  lat: number;
  lon: number;
  districtCode: number;
  district: string;
  state: string;
  stateKey: string;
  source: "gps" | "manual";
}

export interface Task {
  id: string;
  text: string;
  done: boolean;
  custom: boolean;
}

export interface Profile {
  onboarded: boolean;
  lang: Lang;
  theme: Theme;
  textScale: number;
  place: Place | null;
  crop: CropId;
  season: Season;
  sowingDate: string;
  areaAcres: number;
  irrigation: Irrigation;
  soil: SoilTexture;
  tasks: Task[];
  doneStageTasks: string[];
}

interface Actions {
  set: (patch: Partial<Profile>) => void;
  setCrop: (crop: CropId) => void;
  setSeason: (season: Season) => void;
  toggleTask: (id: string) => void;
  addTask: (text: string) => void;
  removeTask: (id: string) => void;
  toggleStageTask: (key: string) => void;
  reset: () => void;
}

const now = new Date();
const initialCrop: CropId = "rice";
const initialSeason = likelySeason(CROPS[initialCrop], now.getMonth() + 1);

const initial: Profile = {
  onboarded: false,
  lang: "en",
  theme: "system",
  textScale: 1,
  place: null,
  crop: initialCrop,
  season: initialSeason,
  sowingDate: defaultSowingDate(CROPS[initialCrop], initialSeason, now),
  areaAcres: 2,
  irrigation: "flood",
  soil: "auto",
  tasks: [],
  doneStageTasks: [],
};

export const useProfile = create<Profile & Actions>()(
  persist(
    (set, get) => ({
      ...initial,
      set: (patch) => set(patch),
      setCrop: (crop) => {
        const season = likelySeason(CROPS[crop], new Date().getMonth() + 1);
        set({ crop, season, sowingDate: defaultSowingDate(CROPS[crop], season), doneStageTasks: [] });
      },
      setSeason: (season) => set({ season, sowingDate: defaultSowingDate(CROPS[get().crop], season) }),
      toggleTask: (id) => set({ tasks: get().tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) }),
      addTask: (text) =>
        set({
          tasks: [
            ...get().tasks,
            { id: `c${Date.now()}`, text: text.slice(0, 100), done: false, custom: true },
          ],
        }),
      removeTask: (id) => set({ tasks: get().tasks.filter((t) => t.id !== id) }),
      toggleStageTask: (key) => {
        const s = new Set(get().doneStageTasks);
        if (s.has(key)) s.delete(key);
        else s.add(key);
        set({ doneStageTasks: [...s] });
      },
      reset: () => set({ ...initial }),
    }),
    {
      name: "scp-profile",
      version: 2,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** Apply theme, language and text size to <html>. */
export function applyDocumentPrefs(p: Pick<Profile, "theme" | "lang" | "textScale">) {
  const root = document.documentElement;
  if (p.theme === "system") delete root.dataset.theme;
  else root.dataset.theme = p.theme;
  root.lang = p.lang;
  root.style.fontSize = p.textScale === 1 ? "" : `${p.textScale * 100}%`;
}

/** `?demo` opens a sample farm so visitors can explore without onboarding. */
export function applyDemoFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("demo")) return;
  const lang = params.get("lang");
  useProfile.getState().set({
    onboarded: true,
    place: {
      lat: 20.15,
      lon: 78.35,
      districtCode: 500,
      district: "Yavatmal",
      state: "Maharashtra",
      stateKey: "maharashtra",
      source: "manual",
    },
    crop: "cotton",
    season: "kharif",
    sowingDate: `${new Date().getFullYear()}-06-18`,
    areaAcres: 3,
    irrigation: "rainfed",
    soil: "auto",
    ...(lang === "hi" || lang === "mr" || lang === "gu" || lang === "en" ? { lang } : {}),
  });
  params.delete("demo");
  params.delete("lang");
  const qs = params.toString();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`,
  );
}
