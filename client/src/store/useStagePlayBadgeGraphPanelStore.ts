import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

const STAGE_PLAY_BADGE_GRAPH_PANEL_MEMORY_KEY =
  "stage-play-badge-graph-panel:v1";

type StagePlayBadgeGraphViewport = {
  scrollLeft: number;
  scrollTop: number;
};

type StagePlayBadgeGraphPanelState = {
  selectedBadgeId: string | null;
  selectedBadgeIds: string[];
  viewport: StagePlayBadgeGraphViewport;
  activeFilterKind: string | null;
  activeFilterStatus: string | null;
  setSelectedBadgeId: (badgeId: string | null) => void;
  setSelectedBadgeIds: (badgeIds: string[]) => void;
  toggleSelectedBadgeId: (badgeId: string) => void;
  rememberViewport: (viewport: StagePlayBadgeGraphViewport) => void;
  setActiveFilterKind: (kind: string | null) => void;
  setActiveFilterStatus: (status: string | null) => void;
  resetPanelMemory: () => void;
};

const fallbackSessionStorage = (() => {
  const memory: Record<string, string> = {};
  return {
    getItem: (name: string) => memory[name] ?? null,
    setItem: (name: string, value: string) => {
      memory[name] = value;
    },
    removeItem: (name: string) => {
      delete memory[name];
    },
  };
})();

function resolveSessionStorage() {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      return window.sessionStorage;
    }
  } catch {
    return fallbackSessionStorage;
  }
  return fallbackSessionStorage;
}

function normalizeScroll(value: number): number {
  return Math.max(0, Math.round(Number.isFinite(value) ? value : 0));
}

const initialState = {
  selectedBadgeId: null,
  selectedBadgeIds: [] as string[],
  viewport: {
    scrollLeft: 0,
    scrollTop: 0,
  },
  activeFilterKind: null as string | null,
  activeFilterStatus: null as string | null,
};

export const useStagePlayBadgeGraphPanelStore = create<StagePlayBadgeGraphPanelState>()(
  persist(
    (set) => ({
      ...initialState,
      setSelectedBadgeId: (badgeId) => set({ selectedBadgeId: badgeId }),
      setSelectedBadgeIds: (badgeIds) =>
        set({
          selectedBadgeIds: Array.from(new Set(badgeIds)),
        }),
      toggleSelectedBadgeId: (badgeId) =>
        set((state) => {
          const selectedBadgeIds = state.selectedBadgeIds.includes(badgeId)
            ? state.selectedBadgeIds.filter((id: string) => id !== badgeId)
            : [...state.selectedBadgeIds, badgeId];
          return {
            selectedBadgeId: badgeId,
            selectedBadgeIds,
          };
        }),
      rememberViewport: (viewport) =>
        set({
          viewport: {
            scrollLeft: normalizeScroll(viewport.scrollLeft),
            scrollTop: normalizeScroll(viewport.scrollTop),
          },
        }),
      setActiveFilterKind: (kind) => set({ activeFilterKind: kind }),
      setActiveFilterStatus: (status) => set({ activeFilterStatus: status }),
      resetPanelMemory: () => set(initialState),
    }),
    {
      name: STAGE_PLAY_BADGE_GRAPH_PANEL_MEMORY_KEY,
      storage: createJSONStorage(resolveSessionStorage),
      partialize: (state) => ({
        selectedBadgeId: state.selectedBadgeId,
        selectedBadgeIds: state.selectedBadgeIds,
        viewport: state.viewport,
        activeFilterKind: state.activeFilterKind,
        activeFilterStatus: state.activeFilterStatus,
      }),
    },
  ),
);
