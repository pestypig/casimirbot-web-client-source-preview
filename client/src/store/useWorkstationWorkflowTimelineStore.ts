import { create } from "zustand";
import { persist } from "zustand/middleware";

const WORKSTATION_TIMELINE_STORAGE_KEY = "workstation-workflow-timeline:v1";
const WORKSTATION_TIMELINE_MAX_ENTRIES = 320;

export type WorkstationTimelineLane = "procedural" | "chat" | "clipboard" | "notes";

export type WorkstationTimelineEntry = {
  id: string;
  ts: string;
  lane: WorkstationTimelineLane;
  label: string;
  detail?: string;
  traceId?: string;
  panelId?: string;
  step?: string;
};

type WorkstationWorkflowTimelineState = {
  entries: WorkstationTimelineEntry[];
  addEntry: (entry: Omit<WorkstationTimelineEntry, "id" | "ts"> & { id?: string; ts?: string }) => void;
  clear: () => void;
};

export const useWorkstationWorkflowTimelineStore = create<WorkstationWorkflowTimelineState>()(
  persist(
    (set) => ({
      entries: [],
      addEntry: (entry) =>
        set((state) => {
          const complete: WorkstationTimelineEntry = {
            id: entry.id?.trim() || `timeline:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
            ts: entry.ts?.trim() || new Date().toISOString(),
            lane: entry.lane,
            label: entry.label,
            detail: entry.detail,
            traceId: entry.traceId,
            panelId: entry.panelId,
            step: entry.step,
          };
          return {
            entries: [complete, ...state.entries].slice(0, WORKSTATION_TIMELINE_MAX_ENTRIES),
          };
        }),
      clear: () => set({ entries: [] }),
    }),
    {
      name: WORKSTATION_TIMELINE_STORAGE_KEY,
      partialize: (state) => ({ entries: state.entries }),
    },
  ),
);

export function recordWorkstationTimelineEntry(
  entry: Omit<WorkstationTimelineEntry, "id" | "ts"> & { id?: string; ts?: string },
): void {
  useWorkstationWorkflowTimelineStore.getState().addEntry(entry);
}
