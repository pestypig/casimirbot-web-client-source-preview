import { create } from "zustand";
import type { StateCreator } from "zustand";
import type { HelixWorkstationBrowserPerformanceSample } from "@shared/helix-workstation-task-manager";

type WorkstationPerformanceState = {
  latest: HelixWorkstationBrowserPerformanceSample | null;
  updatedAtMs: number | null;
  setLatest: (sample: HelixWorkstationBrowserPerformanceSample) => void;
  reset: () => void;
};

const createWorkstationPerformanceStore: StateCreator<WorkstationPerformanceState> = (set) => ({
  latest: null,
  updatedAtMs: null,
  setLatest: (sample: HelixWorkstationBrowserPerformanceSample) => set({ latest: sample, updatedAtMs: Date.now() }),
  reset: () => set({ latest: null, updatedAtMs: null }),
});

export const useWorkstationPerformanceStore = create<WorkstationPerformanceState>()(createWorkstationPerformanceStore);
