import { create } from "zustand";

export const NHM2_SOLVE_PANEL_ID = "nhm2-solve-state";

export type Nhm2ResearchTool =
  | "guards"
  | "pipeline"
  | "proof"
  | "viewer"
  | "lattice"
  | "tiles"
  | "qi-controller"
  | "diagnostics";

type Nhm2ResearchToolState = {
  selectedTool: Nhm2ResearchTool;
  selectTool: (tool: Nhm2ResearchTool) => void;
};

export const useNhm2ResearchToolStore = create<Nhm2ResearchToolState>((set) => ({
  selectedTool: "guards",
  selectTool: (selectedTool) => set({ selectedTool }),
}));

export function openNhm2ResearchTool(tool: Nhm2ResearchTool) {
  useNhm2ResearchToolStore.getState().selectTool(tool);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("open-helix-panel", {
      detail: { id: NHM2_SOLVE_PANEL_ID },
    }));
  }
}
