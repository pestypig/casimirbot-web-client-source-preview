import { createWithEqualityFn } from "zustand/traditional";
import { persist } from "zustand/middleware";
import { navigate } from "wouter/use-browser-location";
import type { PanelDefinition } from "@/lib/desktop/panelRegistry";
import { getPanelDef } from "@/lib/desktop/panelRegistry";
import * as lumaWhispers from "@/lib/luma-whispers-core";
import { recordPanelActivity } from "@/lib/essence/activityReporter";

const whisperPanelOpen: (panelId: string, title?: string) => void =
  lumaWhispers.whisperPanelOpen ?? (() => {});

export type Bounds = { x: number; y: number; w: number; h: number };

export const WINDOW_MIN_WIDTH = 360;
export const WINDOW_MAX_WIDTH = 2000;
export const WINDOW_MIN_HEIGHT = 260;
export const WINDOW_MAX_HEIGHT = 1400;
export const WINDOW_MIN_OPACITY = 0.3;
export const WINDOW_MAX_OPACITY = 1;

export type TextBlendMode = "auto" | "on" | "off";

export type WindowState = Bounds & {
  id: string;
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  isFullscreen: boolean;
  opacity: number;
  z: number;
  alwaysOnTop: boolean;
  noMinimize: boolean;
  textBlendMode: TextBlendMode;
  lastNormalBounds?: Bounds;
};

export type DesktopClickBehavior = "ToggleMinimize" | "FocusOnly";

type DesktopState = {
  windows: Record<string, WindowState>;
  pinned: Record<string, boolean>;
  recentPanelIds: string[];
  clickBehavior: DesktopClickBehavior;
  zCounter: number;
  topZCounter: number;
  registerFromManifest: (
    defs: PanelDefinition[],
    options?: { allowDefaultOpen?: boolean },
  ) => void;
  open: (id: string) => void;
  close: (id: string) => void;
  minimize: (id: string) => void;
  restore: (id: string) => void;
  focus: (id: string) => void;
  setOpacity: (id: string, opacity: number) => void;
  setTextBlendMode: (id: string, mode: TextBlendMode) => void;
  cycleTextBlendMode: (id: string) => void;
  moveByDelta: (id: string, dx: number, dy: number) => void;
  resizeTo: (id: string, w: number, h: number) => void;
  setBounds: (id: string, bounds: Partial<Bounds>) => void;
  togglePin: (id: string) => void;
  setClickBehavior: (behavior: DesktopClickBehavior) => void;
  toggleMaximize: (id: string, area: Bounds) => void;
  setFullscreen: (id: string, enabled: boolean, bounds?: Bounds) => void;
  openInHelix: (panelId: string) => void;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

const clampOpacity = (value?: number) => {
  const safe =
    typeof value === "number" && Number.isFinite(value) ? value : WINDOW_MAX_OPACITY;
  return clamp(safe, WINDOW_MIN_OPACITY, WINDOW_MAX_OPACITY);
};

const captureBounds = (w: WindowState): Bounds => ({
  x: w.x,
  y: w.y,
  w: w.w,
  h: w.h
});

const normalizeWindowState = (window: WindowState): WindowState => ({
  ...window,
  opacity: clampOpacity(window.opacity),
  textBlendMode: window.textBlendMode ?? "auto"
});

const STORAGE_KEY = "desktop-windows-v2";
const DESKTOP_STORE_VERSION = 1;
const LEGACY_AUTO_OPEN_PANELS = new Set([
  "helix-phoenix",
  "mass-provenance",
  "curvature-ledger",
  "endpoints",
]);

const shouldCloseLegacyAutoOpen = (windows?: Record<string, WindowState>) => {
  if (!windows) return false;
  const openIds = Object.values(windows)
    .filter((win) => win?.isOpen)
    .map((win) => win.id);
  if (openIds.length === 0) return false;
  return openIds.every((id) => LEGACY_AUTO_OPEN_PANELS.has(id));
};

const migrateDesktopStore = (state: unknown, version: number) => {
  if (!state || typeof state !== "object") return state as DesktopState;
  if (version >= DESKTOP_STORE_VERSION) return state as DesktopState;
  const current = state as DesktopState;
  if (!shouldCloseLegacyAutoOpen(current.windows)) return current;
  const windows = { ...current.windows };
  for (const id of LEGACY_AUTO_OPEN_PANELS) {
    const win = windows[id];
    if (!win?.isOpen) continue;
    windows[id] = {
      ...win,
      isOpen: false,
      isMinimized: false,
      isMaximized: false,
      isFullscreen: false,
    };
  }
  return { ...current, windows };
};

const DEFAULT_Z_BASE = 10;
const TOP_Z_BASE = 100000;
const MAX_RECENT_PANEL_IDS = 24;

const updateRecentPanelIds = (current: string[] | null | undefined, panelId: string): string[] =>
  [panelId, ...(current ?? []).filter((entry) => entry !== panelId)].slice(0, MAX_RECENT_PANEL_IDS);

const ensureZCounter = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : DEFAULT_Z_BASE;

const ensureTopZCounter = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : TOP_Z_BASE;

const nextZFor = (
  state: { zCounter?: number; topZCounter?: number },
  alwaysOnTop?: boolean
) => {
  const currentZ = ensureZCounter(state.zCounter);
  const currentTopZ = ensureTopZCounter(state.topZCounter);
  if (alwaysOnTop) {
    const z = currentTopZ + 1;
    return { z, zCounter: currentZ, topZCounter: z };
  }
  const z = currentZ + 1;
  return { z, zCounter: z, topZCounter: currentTopZ };
};

export const useDesktopStore = createWithEqualityFn<DesktopState>()(
  persist(
    (set, get) => ({
      windows: {},
      pinned: {},
      recentPanelIds: [],
      clickBehavior: "ToggleMinimize",
      zCounter: 10,
      topZCounter: TOP_Z_BASE,

      registerFromManifest: (defs, options) =>
        set((state) => {
          const allowDefaultOpen = options?.allowDefaultOpen ?? true;
          const windows = { ...state.windows };
          const pinned = { ...state.pinned };
          let zCounter = ensureZCounter(state.zCounter);
          let topZCounter = ensureTopZCounter(state.topZCounter);

          defs.forEach((def) => {
            const alwaysOnTop = Boolean(def.alwaysOnTop);
            const noMinimize = Boolean(def.noMinimize);
            const defaultOpen = allowDefaultOpen && Boolean(def.defaultOpen);
            if (!windows[def.id]) {
              if (alwaysOnTop) {
                topZCounter += 1;
              } else {
                zCounter += 1;
              }
              const z = alwaysOnTop ? topZCounter : zCounter;
              windows[def.id] = normalizeWindowState({
                id: def.id,
                isOpen: defaultOpen,
                isMinimized: false,
                isMaximized: false,
                isFullscreen: false,
                opacity: WINDOW_MAX_OPACITY,
                z,
                x: def.defaultPosition?.x ?? 64,
                y: def.defaultPosition?.y ?? 64,
                w: def.defaultSize?.w ?? 600,
                h: def.defaultSize?.h ?? 400,
                alwaysOnTop,
                noMinimize,
                textBlendMode: "auto"
              });
            } else {
              windows[def.id] = normalizeWindowState({
                ...windows[def.id],
                alwaysOnTop,
                noMinimize
              });
            }
            if (typeof pinned[def.id] === "undefined") {
              pinned[def.id] = Boolean(def.pinned);
            }
          });

          return { windows, pinned, zCounter, topZCounter };
        }),

      open: (id) => {
        const def = getPanelDef(id);
        whisperPanelOpen(id, def?.title);
        set((state) => {
          const current = state.windows[id];
          if (!current) return state;
          const { z, zCounter, topZCounter } = nextZFor(state, current.alwaysOnTop);
          return {
            zCounter,
            topZCounter,
            recentPanelIds: updateRecentPanelIds(state.recentPanelIds, id),
            windows: {
              ...state.windows,
              [id]: {
                ...current,
                isOpen: true,
                isMinimized: false,
                z
              }
            }
          };
        });
        recordPanelActivity(id, "open");
      },

      close: (id) => {
        set((state) => {
          const current = state.windows[id];
          if (!current) return state;
          return {
            windows: {
              ...state.windows,
              [id]: {
                ...current,
                isOpen: false,
                isMinimized: false,
                isMaximized: false,
                isFullscreen: false
              }
            }
          };
        });
        recordPanelActivity(id, "close");
      },

      minimize: (id) =>
        set((state) => {
          const current = state.windows[id];
          if (!current || current.noMinimize) return state;
          return {
            windows: {
              ...state.windows,
              [id]: { ...current, isMinimized: true }
            }
          };
        }),

      restore: (id) => {
        set((state) => {
          const current = state.windows[id];
          if (!current) return state;
          const { z, zCounter, topZCounter } = nextZFor(state, current.alwaysOnTop);
          return {
            zCounter,
            topZCounter,
            recentPanelIds: updateRecentPanelIds(state.recentPanelIds, id),
            windows: {
              ...state.windows,
              [id]: {
                ...current,
                isOpen: true,
                isMinimized: false,
                z
              }
            }
          };
        });
        recordPanelActivity(id, "restore");
      },

      focus: (id) => {
        set((state) => {
          const current = state.windows[id];
          if (!current) return state;
          const { z, zCounter, topZCounter } = nextZFor(state, current.alwaysOnTop);
          return {
            zCounter,
            topZCounter,
            recentPanelIds: updateRecentPanelIds(state.recentPanelIds, id),
            windows: {
              ...state.windows,
              [id]: { ...current, z }
            }
          };
        });
        recordPanelActivity(id, "focus");
      },

      setOpacity: (id, opacity) =>
        set((state) => {
          const current = state.windows[id];
          if (!current) return state;
          const nextOpacity = clampOpacity(opacity);
          return {
            windows: {
              ...state.windows,
              [id]: { ...current, opacity: nextOpacity }
            }
          };
        }),

      setTextBlendMode: (id, mode) =>
        set((state) => {
          const current = state.windows[id];
          if (!current) return state;
          return {
            windows: {
              ...state.windows,
              [id]: { ...current, textBlendMode: mode }
            }
          };
        }),

      cycleTextBlendMode: (id) =>
        set((state) => {
          const current = state.windows[id];
          if (!current) return state;
          const nextMode: TextBlendMode =
            current.textBlendMode === "auto"
              ? "on"
              : current.textBlendMode === "on"
                ? "off"
                : "auto";
          return {
            windows: {
              ...state.windows,
              [id]: { ...current, textBlendMode: nextMode }
            }
          };
        }),

      moveByDelta: (id, dx, dy) =>
        set((state) => {
          const current = state.windows[id];
          if (!current || current.isMaximized || current.isFullscreen) return state;
          return {
            windows: {
              ...state.windows,
              [id]: {
                ...current,
                x: Math.max(0, current.x + dx),
                y: Math.max(0, current.y + dy)
              }
            }
          };
        }),

      resizeTo: (id, wNew, hNew) =>
        set((state) => {
          const current = state.windows[id];
          if (!current || current.isMaximized || current.isFullscreen) return state;
          return {
            windows: {
              ...state.windows,
              [id]: {
                ...current,
                w: clamp(wNew, WINDOW_MIN_WIDTH, WINDOW_MAX_WIDTH),
                h: clamp(hNew, WINDOW_MIN_HEIGHT, WINDOW_MAX_HEIGHT)
              }
            }
          };
        }),

      setBounds: (id, bounds) =>
        set((state) => {
          const current = state.windows[id];
          if (!current || current.isMaximized || current.isFullscreen) return state;
          const nextW = clamp(bounds.w ?? current.w, WINDOW_MIN_WIDTH, WINDOW_MAX_WIDTH);
          const nextH = clamp(bounds.h ?? current.h, WINDOW_MIN_HEIGHT, WINDOW_MAX_HEIGHT);
          const nextX = Math.max(0, bounds.x ?? current.x);
          const nextY = Math.max(0, bounds.y ?? current.y);
          return {
            windows: {
              ...state.windows,
              [id]: {
                ...current,
                x: nextX,
                y: nextY,
                w: nextW,
                h: nextH
              }
            }
          };
        }),

      togglePin: (id) =>
        set((state) => ({
          pinned: { ...state.pinned, [id]: !state.pinned[id] }
        })),

      setClickBehavior: (behavior) => set(() => ({ clickBehavior: behavior })),

      toggleMaximize: (id, area) =>
        set((state) => {
          const current = state.windows[id];
          if (!current || current.isFullscreen) return state;
          const windows = { ...state.windows };

          if (current.isMaximized) {
            const fallback = current.lastNormalBounds ?? captureBounds(current);
            windows[id] = {
              ...current,
              ...fallback,
              isMaximized: false,
              isMinimized: false,
              lastNormalBounds: undefined
            };
            return { windows };
          }

          const { z, zCounter, topZCounter } = nextZFor(state, current.alwaysOnTop);
          windows[id] = {
            ...current,
            ...area,
            isOpen: true,
            isMinimized: false,
            isMaximized: true,
            isFullscreen: false,
            z,
            lastNormalBounds: captureBounds(current)
          };

          return { windows, zCounter, topZCounter };
        }),

      setFullscreen: (id, enabled, bounds) =>
        set((state) => {
          const current = state.windows[id];
          if (!current) return state;
          const windows = { ...state.windows };

          if (!enabled) {
            const fallback = current.lastNormalBounds ?? captureBounds(current);
            windows[id] = {
              ...current,
              ...fallback,
              isFullscreen: false,
              isMaximized: false,
              isMinimized: false,
              lastNormalBounds: undefined
            };
            return { windows };
          }

          if (!bounds) return state;

          const { z, zCounter, topZCounter } = nextZFor(state, current.alwaysOnTop);
          const baseline =
            current.isMaximized && current.lastNormalBounds
              ? current.lastNormalBounds
              : captureBounds(current);

          windows[id] = {
            ...current,
            ...bounds,
            isOpen: true,
            isMinimized: false,
            isMaximized: false,
            isFullscreen: true,
            z,
            lastNormalBounds: baseline
          };

          return { windows, zCounter, topZCounter };
        }),

      openInHelix: (panelId) => {
        const target = panelId?.trim();
        if (!target) return;
        const def = getPanelDef(target);
        whisperPanelOpen(target, def?.title);
        try {
          if (typeof window !== "undefined") {
            window.localStorage.setItem("helix:pending-panel", target);
          }
        } catch {
          // ignore storage failures
        }
        navigate("/desktop?desktop=1");
        recordPanelActivity(target, "openInHelix");
      }
    }),
    {
      name: STORAGE_KEY,
      version: DESKTOP_STORE_VERSION,
      migrate: migrateDesktopStore,
    }
  )
);

declare global {
  interface Window {
    openHelixPanel?: (panelId: string, props?: Record<string, unknown>) => void;
  }
}

if (typeof window !== "undefined" && !(window as any).openHelixPanel) {
  (window as any).openHelixPanel = (panelId: string) => {
    if (!panelId) return;
    try {
      useDesktopStore.getState().open(panelId);
    } catch {
      // best-effort opener
    }
  };
}
