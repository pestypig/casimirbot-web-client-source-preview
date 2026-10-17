import { create } from "zustand";
import type { TheoryCompoundRunRowV1, TheoryCompoundRunV1 } from "@shared/contracts/theory-compound-run.v1";
import type { TheoryRuntimeMathTraceV1 } from "@shared/contracts/theory-runtime-math-trace.v1";

export type TheoryRunStatus = "idle" | "loaded" | "running" | "complete" | "failed";

export type TheoryCompoundRunState = {
  activeTheoryRun: TheoryCompoundRunV1 | null;
  selectedTheoryRunRowId: string | null;
  activeRuntimeTrace: TheoryRuntimeMathTraceV1 | null;
  theoryRunStatus: TheoryRunStatus;

  loadTheoryRun: (run: TheoryCompoundRunV1) => void;
  clearTheoryRun: () => void;
  selectTheoryRunRow: (rowId: string | null) => void;
  updateTheoryRunRow: (
    rowId: string,
    partial: Partial<Omit<TheoryCompoundRunRowV1, "id" | "index">>,
  ) => void;
  setActiveRuntimeTrace: (trace: TheoryRuntimeMathTraceV1 | null) => void;
  setTheoryRunStatus: (status: TheoryRunStatus) => void;
};

export const useTheoryCompoundRunStore = create<TheoryCompoundRunState>()((set) => ({
  activeTheoryRun: null,
  selectedTheoryRunRowId: null,
  activeRuntimeTrace: null,
  theoryRunStatus: "idle",

  loadTheoryRun: (run) =>
    set({
      activeTheoryRun: run,
      selectedTheoryRunRowId: run.rows[0]?.id ?? null,
      activeRuntimeTrace: run.rows[0]?.runtimeMathTraceV1 ?? null,
      theoryRunStatus: "loaded",
    }),
  clearTheoryRun: () =>
    set({
      activeTheoryRun: null,
      selectedTheoryRunRowId: null,
      activeRuntimeTrace: null,
      theoryRunStatus: "idle",
    }),
  selectTheoryRunRow: (rowId) =>
    set((state) => {
      const row = state.activeTheoryRun?.rows.find((candidate) => candidate.id === rowId) ?? null;
      return {
        selectedTheoryRunRowId: row ? row.id : null,
        activeRuntimeTrace: row?.runtimeMathTraceV1 ?? null,
      };
    }),
  updateTheoryRunRow: (rowId, partial) =>
    set((state) => {
      if (!state.activeTheoryRun) return state;
      const rows = state.activeTheoryRun.rows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              ...partial,
              id: row.id,
              index: row.index,
            }
          : row,
      );
      const selectedRow = rows.find((row) => row.id === state.selectedTheoryRunRowId) ?? null;
      return {
        activeTheoryRun: {
          ...state.activeTheoryRun,
          rows,
        },
        activeRuntimeTrace: selectedRow?.runtimeMathTraceV1 ?? null,
      };
    }),
  setActiveRuntimeTrace: (trace) => set({ activeRuntimeTrace: trace }),
  setTheoryRunStatus: (status) => set({ theoryRunStatus: status }),
}));

export function selectActiveTheoryRunRow(state: TheoryCompoundRunState): TheoryCompoundRunRowV1 | null {
  return state.activeTheoryRun?.rows.find((row) => row.id === state.selectedTheoryRunRowId) ?? null;
}

export function selectTheoryRunRows(state: TheoryCompoundRunState): TheoryCompoundRunRowV1[] {
  return state.activeTheoryRun?.rows ?? [];
}

export function selectScalarTheoryRunRows(state: TheoryCompoundRunState): TheoryCompoundRunRowV1[] {
  return selectTheoryRunRows(state).filter((row) => row.kind === "scalar");
}

export function selectRuntimeTheoryRunRows(state: TheoryCompoundRunState): TheoryCompoundRunRowV1[] {
  return selectTheoryRunRows(state).filter((row) => row.kind === "runtime" || row.kind === "tensor");
}
