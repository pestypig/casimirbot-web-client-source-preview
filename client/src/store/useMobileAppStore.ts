import { StateCreator } from "zustand";
import { createWithEqualityFn } from "zustand/traditional";
import { createJSONStorage, persist } from "zustand/middleware";
import type { PanelDefinition } from "@/lib/desktop/panelRegistry";
import { panelRegistry } from "@/lib/desktop/panelRegistry";
import * as lumaWhispers from "@/lib/luma-whispers-core";

type PanelLoader = PanelDefinition["loader"];

export type MobileAppEntry = {
  panelId: string;
  title: string;
  loader: PanelLoader;
  openedAt: number;
};

type MobileAppState = {
  stack: MobileAppEntry[];
  activeId?: string;
  open: (panelId: string) => void;
  activate: (panelId: string) => void;
  close: (panelId: string) => void;
  closeAll: () => void;
  goHome: () => void;
};

const resolvePanel = (panelId: string) =>
  panelRegistry.find((panel) => panel.id === panelId);

const hydrateEntry = (panelId: string, openedAt?: number): MobileAppEntry | null => {
  const panel = resolvePanel(panelId);
  if (!panel) return null;
  return {
    panelId: panel.id,
    title: panel.title,
    loader: panel.loader,
    openedAt: openedAt ?? Date.now()
  };
};

const whisperPanelOpen: (panelId: string, title?: string) => void =
  lumaWhispers.whisperPanelOpen ?? (() => {});

const MAX_STACK_SMALL = 4;
const isSmallViewport = () =>
  typeof window !== "undefined" && window.innerWidth <= 520;

const hasSessionStorage =
  typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";

const memoryStorage: Storage = {
  length: 0,
  clear: () => {},
  getItem: () => null,
  key: () => null,
  removeItem: () => {},
  setItem: () => {}
};

const mobileStoreCreator: StateCreator<MobileAppState> = (set, get) => ({
  stack: [],
  activeId: undefined,

  open: (panelId) =>
    set((state) => {
      const existing = state.stack.find((entry) => entry.panelId === panelId);
      if (existing) {
        const hydrated = existing;
        whisperPanelOpen(panelId, hydrated.title);
        return {
          ...state,
          stack: state.stack.map((entry) =>
            entry.panelId === panelId ? hydrated : entry
          ),
          activeId: panelId
        };
      }
      const entry = hydrateEntry(panelId);
      if (!entry) return state;
      whisperPanelOpen(entry.panelId, entry.title);
      const shouldLimit = isSmallViewport();
      const stack =
        shouldLimit && state.stack.length >= MAX_STACK_SMALL
          ? state.stack.slice(state.stack.length - (MAX_STACK_SMALL - 1))
          : state.stack;
      return {
        stack: [...stack, entry],
        activeId: entry.panelId
      };
    }),

  activate: (panelId) => {
    const exists = get().stack.some((entry) => entry.panelId === panelId);
    if (!exists) return;
    set({ activeId: panelId });
  },

  close: (panelId) =>
    set((state) => {
      const nextStack = state.stack.filter((entry) => entry.panelId !== panelId);
      const wasActive = state.activeId === panelId;
      return {
        stack: nextStack,
        activeId: wasActive ? nextStack[nextStack.length - 1]?.panelId : state.activeId
      };
    }),

  closeAll: () => set({ stack: [], activeId: undefined }),

  goHome: () => set({ activeId: undefined })
});

const withPersistence = persist(mobileStoreCreator, {
  name: "mobile-app-store",
  storage: createJSONStorage(() =>
    hasSessionStorage ? window.sessionStorage : memoryStorage
  ),
  partialize: (state) => ({
    stack: state.stack.map(({ panelId, openedAt }) => ({ panelId, openedAt })),
    activeId: state.activeId
  }),
  merge: (persistedState, currentState) => {
    const stored = persistedState as Partial<Pick<MobileAppState, "stack" | "activeId">>;
    const hydratedStack =
      stored.stack
        ?.map((entry) => hydrateEntry(entry.panelId, entry.openedAt))
        .filter((entry): entry is MobileAppEntry => Boolean(entry)) ?? [];

    const hasActive =
      stored.activeId && hydratedStack.some((entry) => entry.panelId === stored.activeId);

    return {
      ...currentState,
      stack: hydratedStack,
      activeId: hasActive
        ? stored.activeId
        : hydratedStack[hydratedStack.length - 1]?.panelId
    };
  }
});

export const useMobileAppStore = createWithEqualityFn<MobileAppState>()(withPersistence);
