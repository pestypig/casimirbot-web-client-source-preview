import { describe, expect, it } from "vitest";

import {
  resolveScientificCalculatorVisibleDebugEvents,
  resolveScientificCalculatorVisibleHistory,
} from "@/components/panels/ScientificCalculatorPanel";
import type { ScientificCalculatorDebugEvent, ScientificCalculatorHistoryEntry } from "@/store/useScientificCalculatorStore";

const event = (
  id: string,
  compoundRunId: string | null,
  compoundSubgoalId: string | null,
): ScientificCalculatorDebugEvent => ({
  id,
  ts: `2026-05-24T00:00:0${id}.000Z`,
  panel_id: "scientific-calculator",
  action_id: "solve_expression",
  source: "workstation_action",
  ok: true,
  input_latex: `x+${id}`,
  compound_run_id: compoundRunId,
  compound_subgoal_id: compoundSubgoalId,
});

const historyEntry = (id: string, compoundRunId: string | null): ScientificCalculatorHistoryEntry => ({
  id,
  latex: `x+${id}`,
  sourcePath: null,
  anchor: null,
  calculatorSetup: null,
  compound_run_id: compoundRunId,
  compound_subgoal_id: null,
  ts: `2026-05-24T00:00:0${id}.000Z`,
});

describe("ScientificCalculatorPanel debug parity filtering", () => {
  it("shows only the current compound run in the visible debug event state", () => {
    const state = resolveScientificCalculatorVisibleDebugEvents([
      event("3", "compound:new", "sg:2"),
      event("2", "compound:old", "sg:1"),
      event("1", null, null),
    ]);

    expect(state.currentCompoundRunId).toBe("compound:new");
    expect(state.visibleEvents.map((entry) => entry.id)).toEqual(["3"]);
    expect(state.visibleCompoundRunIds).toEqual(["compound:new"]);
    expect(state.staleCompoundRunVisible).toBe(false);
  });

  it("falls back to normal event history when no compound run exists", () => {
    const state = resolveScientificCalculatorVisibleDebugEvents([event("2", null, null), event("1", null, null)], 1);

    expect(state.currentCompoundRunId).toBeNull();
    expect(state.visibleEvents.map((entry) => entry.id)).toEqual(["2"]);
    expect(state.visibleCompoundRunIds).toEqual([]);
    expect(state.staleCompoundRunVisible).toBe(false);
  });

  it("filters visible ingest history to the current compound run", () => {
    const visibleHistory = resolveScientificCalculatorVisibleHistory(
      [
        historyEntry("3", "compound:new"),
        historyEntry("2", "compound:old"),
        historyEntry("1", null),
      ],
      "compound:new",
    );

    expect(visibleHistory.map((entry) => entry.id)).toEqual(["3"]);
  });

  it("falls back to normal ingest history when no compound run exists", () => {
    const visibleHistory = resolveScientificCalculatorVisibleHistory(
      [historyEntry("2", null), historyEntry("1", null)],
      null,
      1,
    );

    expect(visibleHistory.map((entry) => entry.id)).toEqual(["2"]);
  });
});
