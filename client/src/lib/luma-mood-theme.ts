import * as React from "react";
import { LUMA_MOOD_ORDER, publishLumaMood, type LumaMood } from "./luma-moods";
import { subscribe, unsubscribe } from "./luma-bus";

export const LUMA_MOOD_THEME_STORAGE_KEY = "helix:luma-mood";

function isMood(value: unknown): value is LumaMood {
  return typeof value === "string" && LUMA_MOOD_ORDER.includes(value as LumaMood);
}

export type LumaMoodUiPalette = {
  surfaceInk: string;
  surfaceInkSoft: string;
  surfaceLaminate: string;
  surfaceLaminateSoft: string;
  uiBackground: string;
  uiForeground: string;
  uiBorder: string;
  uiInput: string;
  uiRing: string;
  uiPrimary: string;
  uiPrimaryForeground: string;
  uiAccent: string;
  uiAccentForeground: string;
  uiMuted: string;
  uiMutedForeground: string;
  uiCard: string;
};

export const LUMA_MOOD_UI_PALETTE: Record<LumaMood, LumaMoodUiPalette> = {
  mad: {
    surfaceInk: "rgba(251, 113, 133, 0.46)",
    surfaceInkSoft: "rgba(251, 113, 133, 0.2)",
    surfaceLaminate: "rgba(28, 8, 15, 0.96)",
    surfaceLaminateSoft: "rgba(52, 13, 28, 0.92)",
    uiBackground: "342 38% 6%",
    uiForeground: "342 56% 94%",
    uiBorder: "342 40% 18%",
    uiInput: "342 40% 16%",
    uiRing: "344 82% 66%",
    uiPrimary: "344 80% 60%",
    uiPrimaryForeground: "342 52% 12%",
    uiAccent: "342 36% 14%",
    uiAccentForeground: "342 70% 92%",
    uiMuted: "342 30% 12%",
    uiMutedForeground: "342 24% 72%",
    uiCard: "342 34% 8%",
  },
  upset: {
    surfaceInk: "rgba(251, 191, 36, 0.46)",
    surfaceInkSoft: "rgba(251, 191, 36, 0.2)",
    surfaceLaminate: "rgba(32, 18, 4, 0.96)",
    surfaceLaminateSoft: "rgba(59, 34, 6, 0.92)",
    uiBackground: "38 52% 6%",
    uiForeground: "42 78% 94%",
    uiBorder: "38 44% 18%",
    uiInput: "38 44% 16%",
    uiRing: "40 96% 62%",
    uiPrimary: "40 94% 58%",
    uiPrimaryForeground: "36 62% 12%",
    uiAccent: "38 40% 14%",
    uiAccentForeground: "42 82% 92%",
    uiMuted: "38 34% 12%",
    uiMutedForeground: "38 22% 70%",
    uiCard: "38 46% 8%",
  },
  shock: {
    surfaceInk: "rgba(253, 224, 71, 0.5)",
    surfaceInkSoft: "rgba(253, 224, 71, 0.24)",
    surfaceLaminate: "rgba(30, 26, 4, 0.96)",
    surfaceLaminateSoft: "rgba(55, 47, 6, 0.92)",
    uiBackground: "54 58% 6%",
    uiForeground: "56 86% 94%",
    uiBorder: "54 46% 18%",
    uiInput: "54 46% 16%",
    uiRing: "55 96% 64%",
    uiPrimary: "55 94% 60%",
    uiPrimaryForeground: "50 68% 12%",
    uiAccent: "54 42% 14%",
    uiAccentForeground: "56 88% 92%",
    uiMuted: "54 36% 12%",
    uiMutedForeground: "54 24% 70%",
    uiCard: "54 48% 8%",
  },
  question: {
    surfaceInk: "rgba(125, 211, 252, 0.45)",
    surfaceInkSoft: "rgba(125, 211, 252, 0.2)",
    surfaceLaminate: "rgba(7, 17, 28, 0.96)",
    surfaceLaminateSoft: "rgba(10, 30, 48, 0.92)",
    uiBackground: "205 60% 6%",
    uiForeground: "204 78% 94%",
    uiBorder: "205 44% 18%",
    uiInput: "205 44% 16%",
    uiRing: "202 96% 66%",
    uiPrimary: "202 94% 60%",
    uiPrimaryForeground: "206 64% 12%",
    uiAccent: "205 40% 14%",
    uiAccentForeground: "204 82% 92%",
    uiMuted: "205 34% 12%",
    uiMutedForeground: "205 24% 72%",
    uiCard: "205 48% 8%",
  },
  happy: {
    surfaceInk: "rgba(110, 231, 183, 0.46)",
    surfaceInkSoft: "rgba(110, 231, 183, 0.2)",
    surfaceLaminate: "rgba(6, 24, 18, 0.96)",
    surfaceLaminateSoft: "rgba(9, 45, 34, 0.92)",
    uiBackground: "154 54% 6%",
    uiForeground: "152 74% 94%",
    uiBorder: "154 40% 18%",
    uiInput: "154 40% 16%",
    uiRing: "152 74% 62%",
    uiPrimary: "152 70% 56%",
    uiPrimaryForeground: "154 60% 12%",
    uiAccent: "154 36% 14%",
    uiAccentForeground: "152 78% 92%",
    uiMuted: "154 30% 12%",
    uiMutedForeground: "154 22% 72%",
    uiCard: "154 44% 8%",
  },
  friend: {
    surfaceInk: "rgba(94, 234, 212, 0.46)",
    surfaceInkSoft: "rgba(94, 234, 212, 0.2)",
    surfaceLaminate: "rgba(5, 24, 26, 0.96)",
    surfaceLaminateSoft: "rgba(7, 46, 50, 0.92)",
    uiBackground: "178 56% 6%",
    uiForeground: "176 74% 94%",
    uiBorder: "178 42% 18%",
    uiInput: "178 42% 16%",
    uiRing: "176 78% 64%",
    uiPrimary: "176 72% 56%",
    uiPrimaryForeground: "178 62% 12%",
    uiAccent: "178 38% 14%",
    uiAccentForeground: "176 78% 92%",
    uiMuted: "178 32% 12%",
    uiMutedForeground: "178 22% 72%",
    uiCard: "178 46% 8%",
  },
  love: {
    surfaceInk: "rgba(249, 168, 212, 0.48)",
    surfaceInkSoft: "rgba(249, 168, 212, 0.22)",
    surfaceLaminate: "rgba(31, 8, 22, 0.96)",
    surfaceLaminateSoft: "rgba(58, 12, 41, 0.92)",
    uiBackground: "326 48% 6%",
    uiForeground: "324 74% 94%",
    uiBorder: "326 40% 18%",
    uiInput: "326 40% 16%",
    uiRing: "326 82% 68%",
    uiPrimary: "326 78% 62%",
    uiPrimaryForeground: "324 60% 12%",
    uiAccent: "326 36% 14%",
    uiAccentForeground: "324 80% 92%",
    uiMuted: "326 30% 12%",
    uiMutedForeground: "326 22% 72%",
    uiCard: "326 44% 8%",
  },
};

export function readStoredLumaMood(): LumaMood | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(LUMA_MOOD_THEME_STORAGE_KEY);
    return isMood(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function storeLumaMood(mood: LumaMood | null) {
  if (typeof window === "undefined") return;
  try {
    if (mood) {
      window.localStorage.setItem(LUMA_MOOD_THEME_STORAGE_KEY, mood);
    } else {
      window.localStorage.removeItem(LUMA_MOOD_THEME_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures.
  }
}

export function broadcastLumaMood(mood: LumaMood | null) {
  if (mood) {
    storeLumaMood(mood);
    publishLumaMood(mood);
    return;
  }
  storeLumaMood(null);
  publishLumaMood(null);
}

function applyMoodPaletteToRoot(palette: LumaMoodUiPalette) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const rootVars: Record<string, string> = {
    "--background": palette.uiBackground,
    "--foreground": palette.uiForeground,
    "--card": palette.uiCard,
    "--card-foreground": palette.uiForeground,
    "--popover": palette.uiCard,
    "--popover-foreground": palette.uiForeground,
    "--border": palette.uiBorder,
    "--input": palette.uiInput,
    "--primary": palette.uiPrimary,
    "--primary-foreground": palette.uiPrimaryForeground,
    "--secondary": palette.uiMuted,
    "--secondary-foreground": palette.uiForeground,
    "--accent": palette.uiAccent,
    "--accent-foreground": palette.uiAccentForeground,
    "--muted": palette.uiMuted,
    "--muted-foreground": palette.uiMutedForeground,
    "--ring": palette.uiRing,
    "--surface-ink": palette.surfaceInk,
    "--surface-ink-soft": palette.surfaceInkSoft,
    "--surface-laminate": palette.surfaceLaminate,
    "--surface-laminate-soft": palette.surfaceLaminateSoft,
  };
  for (const [key, value] of Object.entries(rootVars)) {
    root.style.setProperty(key, value);
  }
}

type UseLumaMoodThemeOptions = {
  initialMood?: LumaMood;
  randomize?: boolean;
  listenToBus?: boolean;
};

export function useLumaMoodTheme(options?: UseLumaMoodThemeOptions) {
  const initialMood = options?.initialMood ?? "question";
  const randomize = options?.randomize ?? true;
  const listenToBus = options?.listenToBus ?? true;

  const pickRandomMood = React.useCallback((): LumaMood => {
    const idx = Math.floor(Math.random() * LUMA_MOOD_ORDER.length);
    return LUMA_MOOD_ORDER[idx] ?? initialMood;
  }, [initialMood]);

  const [mood, setMood] = React.useState<LumaMood>(initialMood);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = readStoredLumaMood();
    if (stored) {
      setMood(stored);
      return;
    }
    if (randomize) {
      setMood(pickRandomMood());
    }
  }, [pickRandomMood, randomize]);

  React.useEffect(() => {
    if (!listenToBus || typeof window === "undefined") return;
    const id = subscribe("luma:mood", (payload: any) => {
      const next = payload?.mood ?? payload;
      if (!isMood(next)) return;
      setMood((prev) => (prev === next ? prev : next));
      storeLumaMood(next);
    });
    return () => {
      if (id) unsubscribe(id);
    };
  }, [listenToBus]);

  const palette = React.useMemo(
    () => LUMA_MOOD_UI_PALETTE[mood] ?? LUMA_MOOD_UI_PALETTE.question,
    [mood],
  );

  React.useEffect(() => {
    applyMoodPaletteToRoot(palette);
    storeLumaMood(mood);
  }, [mood, palette]);

  const setMoodAndBroadcast = React.useCallback((next: LumaMood) => {
    setMood((prev) => (prev === next ? prev : next));
    broadcastLumaMood(next);
  }, []);

  return {
    mood,
    palette,
    setMood: setMoodAndBroadcast,
    setMoodLocal: setMood,
  };
}
