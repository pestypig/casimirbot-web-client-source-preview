import { create } from "zustand";
import type { StateCreator } from "zustand";
import type {
  WorkstationInteractionMode,
  WorkstationTaskPriority,
} from "@/lib/workstation/performance/workstationInteractionScheduler";

export type WorkstationInteractionState = {
  mode: WorkstationInteractionMode;
  source: string | null;
  activeSinceMs: number | null;
  lastInteractionAtMs: number | null;
  lastQuietAtMs: number | null;
  pendingTaskCount: number;
  pendingByPriority: Record<WorkstationTaskPriority, number>;
  deferredTaskCount: number;
  lastDeferredAtMs: number | null;
  setInteractionSnapshot: (snapshot: {
    mode: WorkstationInteractionMode;
    source: string | null;
    activeSinceMs: number | null;
    lastInteractionAtMs: number | null;
    lastQuietAtMs?: number | null;
  }) => void;
  setPendingSnapshot: (snapshot: {
    pendingTaskCount: number;
    pendingByPriority: Record<WorkstationTaskPriority, number>;
    deferredTaskCount: number;
    lastDeferredAtMs: number | null;
  }) => void;
  reset: () => void;
};

const emptyPendingByPriority = (): Record<WorkstationTaskPriority, number> => ({
  immediate_input: 0,
  visual_frame: 0,
  committed_layout: 0,
  evidence_refresh: 0,
  share_state: 0,
  background_diagnostics: 0,
});

const createWorkstationInteractionStore: StateCreator<WorkstationInteractionState> = (set) => ({
  mode: "idle",
  source: null,
  activeSinceMs: null,
  lastInteractionAtMs: null,
  lastQuietAtMs: null,
  pendingTaskCount: 0,
  pendingByPriority: emptyPendingByPriority(),
  deferredTaskCount: 0,
  lastDeferredAtMs: null,
  setInteractionSnapshot: (snapshot) =>
    set((state: WorkstationInteractionState) => ({
      mode: snapshot.mode,
      source: snapshot.source,
      activeSinceMs: snapshot.activeSinceMs,
      lastInteractionAtMs: snapshot.lastInteractionAtMs,
      lastQuietAtMs: snapshot.lastQuietAtMs ?? state.lastQuietAtMs,
    })),
  setPendingSnapshot: (snapshot) =>
    set(() => ({
      pendingTaskCount: snapshot.pendingTaskCount,
      pendingByPriority: snapshot.pendingByPriority,
      deferredTaskCount: snapshot.deferredTaskCount,
      lastDeferredAtMs: snapshot.lastDeferredAtMs,
    })),
  reset: () =>
    set(() => ({
      mode: "idle",
      source: null,
      activeSinceMs: null,
      lastInteractionAtMs: null,
      lastQuietAtMs: Date.now(),
      pendingTaskCount: 0,
      pendingByPriority: emptyPendingByPriority(),
      deferredTaskCount: 0,
      lastDeferredAtMs: null,
    })),
});

export const useWorkstationInteractionStore = create<WorkstationInteractionState>()(
  createWorkstationInteractionStore,
);
