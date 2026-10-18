import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildNhm2TheoryBadgeGraphV1 } from "@shared/theory/nhm2-theory-badges";
import { buildTheoryCompoundRun } from "@shared/theory/theory-compound-run-builder";
import {
  selectActiveTheoryRunRow,
  selectRuntimeTheoryRunRows,
  selectScalarTheoryRunRows,
  useTheoryCompoundRunStore,
} from "../useTheoryCompoundRunStore";

const graph = buildNhm2TheoryBadgeGraphV1();
const storageData: Record<string, string> = {};
const localStorageStub = {
  getItem: (key: string) => storageData[key] ?? null,
  setItem: (key: string, value: string) => {
    storageData[key] = value;
  },
  removeItem: (key: string) => {
    delete storageData[key];
  },
};

function buildScalarRun() {
  return buildTheoryCompoundRun({
    graph,
    badgeIds: ["casimir.cavity.mass_equivalent_proxy"],
    mode: "selected_badges",
    generatedAt: "2026-05-29T00:00:00.000Z",
  });
}

function buildMixedRun() {
  return buildTheoryCompoundRun({
    graph,
    badgeIds: ["physics.gr.einstein_field_equation", "nhm2.energy_condition.diagnostic_gate"],
    mode: "selected_badges",
    generatedAt: "2026-05-29T00:00:00.000Z",
  });
}

describe("useTheoryCompoundRunStore", () => {
  beforeEach(() => {
    for (const key of Object.keys(storageData)) delete storageData[key];
    vi.stubGlobal("localStorage", localStorageStub);
    useTheoryCompoundRunStore.getState().clearTheoryRun();
  });

  it("loads and clears a compound theory run", () => {
    const run = buildScalarRun();

    useTheoryCompoundRunStore.getState().loadTheoryRun(run);

    expect(useTheoryCompoundRunStore.getState().activeTheoryRun?.runId).toBe(run.runId);
    expect(useTheoryCompoundRunStore.getState().selectedTheoryRunRowId).toBe(run.rows[0]?.id);
    expect(useTheoryCompoundRunStore.getState().theoryRunStatus).toBe("loaded");
    expect(selectScalarTheoryRunRows(useTheoryCompoundRunStore.getState())).toHaveLength(1);

    useTheoryCompoundRunStore.getState().clearTheoryRun();

    expect(useTheoryCompoundRunStore.getState().activeTheoryRun).toBeNull();
    expect(useTheoryCompoundRunStore.getState().selectedTheoryRunRowId).toBeNull();
    expect(useTheoryCompoundRunStore.getState().activeRuntimeTrace).toBeNull();
    expect(useTheoryCompoundRunStore.getState().theoryRunStatus).toBe("idle");
  });

  it("selects a row and exposes the active row helper", () => {
    const run = buildMixedRun();
    const targetRow = run.rows.find((row) => row.kind === "gate");
    expect(targetRow).toBeDefined();

    useTheoryCompoundRunStore.getState().loadTheoryRun(run);
    useTheoryCompoundRunStore.getState().selectTheoryRunRow(targetRow!.id);

    expect(useTheoryCompoundRunStore.getState().selectedTheoryRunRowId).toBe(targetRow!.id);
    expect(selectActiveTheoryRunRow(useTheoryCompoundRunStore.getState())?.id).toBe(targetRow!.id);
  });

  it("updates a row without changing row identity or index", () => {
    const run = buildScalarRun();
    const row = run.rows[0];

    useTheoryCompoundRunStore.getState().loadTheoryRun(run);
    useTheoryCompoundRunStore.getState().updateTheoryRunRow(row.id, {
      status: "solved",
      warnings: ["solved by test fixture"],
    });

    const updated = useTheoryCompoundRunStore.getState().activeTheoryRun?.rows[0];
    expect(updated).toEqual(
      expect.objectContaining({
        id: row.id,
        index: row.index,
        status: "solved",
        warnings: ["solved by test fixture"],
      }),
    );
  });

  it("tracks active runtime traces from selected tensor rows", () => {
    const run = buildMixedRun();
    const tensorRow = run.rows.find((row) => row.kind === "tensor" && row.runtimeMathTraceV1);
    expect(tensorRow).toBeDefined();

    useTheoryCompoundRunStore.getState().loadTheoryRun(run);
    useTheoryCompoundRunStore.getState().selectTheoryRunRow(tensorRow!.id);

    expect(selectRuntimeTheoryRunRows(useTheoryCompoundRunStore.getState()).length).toBeGreaterThanOrEqual(1);
    expect(useTheoryCompoundRunStore.getState().activeRuntimeTrace?.traceId).toBe(
      tensorRow!.runtimeMathTraceV1?.traceId,
    );

    useTheoryCompoundRunStore.getState().setActiveRuntimeTrace(null);
    expect(useTheoryCompoundRunStore.getState().activeRuntimeTrace).toBeNull();
  });

  it("does not mutate scalar calculator state when loading a theory run", async () => {
    const { useScientificCalculatorStore } = await import("../useScientificCalculatorStore");
    useScientificCalculatorStore.getState().clear({ source: "panel" });
    useScientificCalculatorStore.getState().ingestLatex("x = 1", { source: "panel" });
    const beforeLatex = useScientificCalculatorStore.getState().currentLatex;
    const beforeHistoryLength = useScientificCalculatorStore.getState().history.length;

    useTheoryCompoundRunStore.getState().loadTheoryRun(buildScalarRun());

    expect(useScientificCalculatorStore.getState().currentLatex).toBe(beforeLatex);
    expect(useScientificCalculatorStore.getState().history).toHaveLength(beforeHistoryLength);
  });
});
