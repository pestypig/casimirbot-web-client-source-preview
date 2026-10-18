// @vitest-environment jsdom

(globalThis as Record<string, unknown>).__HELIX_ASK_JOB_TIMEOUT_MS__ = "1200000";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeHelixPanelAction } from "@/lib/workstation/panelActionAdapters";
import { getWorkstationPanelCapabilities } from "@/lib/workstation/panelCapabilities";
import type { WorkstationPanelActionDefinition } from "@/lib/workstation/panelCapabilities";
import { useScientificCalculatorStore } from "@/store/useScientificCalculatorStore";
import { useTheoryCompoundRunStore } from "@/store/useTheoryCompoundRunStore";
import { isTheoryCompoundRunV1 } from "@shared/contracts/theory-compound-run.v1";
import type { TheoryCompoundRunRowV1 } from "@shared/contracts/theory-compound-run.v1";
import { isTheoryRuntimeMathTraceV1 } from "@shared/contracts/theory-runtime-math-trace.v1";

vi.mock("@/lib/helix/display-audio-capture", () => ({
  startDisplayAudioSituationSession: vi.fn(),
}));
vi.mock("@/lib/helix/mic-audio-situation-capture", () => ({
  startMicAudioSituationSession: vi.fn(),
}));

function actionContext() {
  return {
    openPanel: vi.fn(),
    focusPanel: vi.fn(),
    closePanel: vi.fn(),
    openSettings: vi.fn(),
  };
}

describe("theory badge graph compound theory run actions", () => {
  beforeEach(() => {
    useTheoryCompoundRunStore.getState().clearTheoryRun();
    useScientificCalculatorStore.getState().clear({ source: "panel" });
  });

  it("exposes compound theory run actions in capabilities", () => {
    const actionIds =
      getWorkstationPanelCapabilities("theory-badge-graph")?.actions.map(
        (action: WorkstationPanelActionDefinition) => action.id,
      ) ?? [];

    expect(actionIds).toEqual(
      expect.arrayContaining([
        "build_compound_theory_run",
        "load_compound_theory_run",
        "solve_compound_theory_run",
        "get_runtime_math_trace",
        "load_scalar_cut_to_calculator",
      ]),
    );
  });

  it("builds a valid compound theory run artifact without mutating the calculator", () => {
    const result = executeHelixPanelAction(
      {
        panel_id: "theory-badge-graph",
        action_id: "build_compound_theory_run",
        args: {
          badge_ids: ["nhm2.source.energy_density_proxy", "nhm2.claim_boundary.diagnostic_only"],
          mode: "selected_badges",
          include_scalar: true,
          include_runtime: true,
          include_evidence: true,
          include_boundaries: true,
        },
      },
      actionContext(),
    );

    expect(result.ok).toBe(true);
    expect(result.artifact?.kind).toBe("theory_compound_run");
    expect(result.artifact?.target_workbench).toBe("theory");
    expect(isTheoryCompoundRunV1(result.artifact?.artifact_v1)).toBe(true);
    expect(useScientificCalculatorStore.getState().lastSolve).toBeNull();
    expect(useTheoryCompoundRunStore.getState().activeTheoryRun).toBeNull();
  });

  it("loads and focuses a compound theory run", () => {
    const context = actionContext();
    const result = executeHelixPanelAction(
      {
        panel_id: "theory-badge-graph",
        action_id: "load_compound_theory_run",
        args: {
          badge_ids: ["physics.gr.einstein_field_equation"],
          mode: "dependency_path",
        },
      },
      context,
    );

    expect(result.ok).toBe(true);
    expect(result.artifact?.kind).toBe("theory_compound_run_loaded");
    expect(result.artifact?.target_workbench).toBe("theory");
    expect(isTheoryCompoundRunV1(result.artifact?.artifact_v1)).toBe(true);
    expect(useTheoryCompoundRunStore.getState().activeTheoryRun?.targetBadgeIds).toEqual([
      "physics.gr.einstein_field_equation",
    ]);
    expect(context.openPanel).toHaveBeenCalledWith("scientific-calculator", undefined);
    expect(context.focusPanel).toHaveBeenCalledWith("scientific-calculator", undefined);
  });

  it("solves available scalar rows and preserves claim boundaries", () => {
    const result = executeHelixPanelAction(
      {
        panel_id: "theory-badge-graph",
        action_id: "solve_compound_theory_run",
        args: {
          badge_ids: ["nhm2.source.energy_density_proxy", "nhm2.claim_boundary.diagnostic_only"],
          mode: "selected_badges",
          solve_scope: "all_available",
        },
      },
      actionContext(),
    );

    const run = result.artifact?.artifact_v1;
    expect(result.ok).toBe(true);
    expect(result.artifact?.kind).toBe("theory_compound_run_solved");
    expect(result.artifact?.target_workbench).toBe("theory");
    expect(isTheoryCompoundRunV1(run)).toBe(true);
    if (isTheoryCompoundRunV1(run)) {
      expect(run.summary.solvedCount).toBeGreaterThan(0);
      expect(run.rows.some((row: TheoryCompoundRunRowV1) => row.calculatorArtifactV1)).toBe(true);
      expect(run.rows.some((row: TheoryCompoundRunRowV1) => row.claimBoundaryNotes.length > 0)).toBe(true);
    }
  });

  it("returns static runtime math traces without invoking long backend execution", () => {
    const context = actionContext();
    const result = executeHelixPanelAction(
      {
        panel_id: "theory-badge-graph",
        action_id: "get_runtime_math_trace",
        args: {
          badge_id: "solar.spectrum.photon_energy",
          runtime_family: "solar_spectrum",
        },
      },
      context,
    );

    expect(result.ok).toBe(true);
    expect(result.artifact?.kind).toBe("theory_runtime_math_trace");
    expect(result.artifact?.target_workbench).toBe("runtime");
    expect(isTheoryRuntimeMathTraceV1(result.artifact?.artifact_v1)).toBe(true);
    expect(useTheoryCompoundRunStore.getState().activeRuntimeTrace?.runtimeId).toBe(result.artifact?.runtime_id);
    expect(context.openPanel).toHaveBeenCalledWith("scientific-calculator", undefined);
    expect(context.focusPanel).toHaveBeenCalledWith("scientific-calculator", undefined);
    expect(JSON.stringify(result.artifact)).toMatch(/Static reference trace only; no backend runtime executed/);
  });

  it("loads a scalar cut into the existing scientific calculator", () => {
    const result = executeHelixPanelAction(
      {
        panel_id: "theory-badge-graph",
        action_id: "load_scalar_cut_to_calculator",
        args: {
          scalar_cut: {
            id: "photon-energy-cut",
            expression: "E = h*c/lambda",
            displayLatex: "E=\\frac{hc}{\\lambda}",
          },
          source_path: "theory-runtime://test/photon-energy-cut",
        },
      },
      actionContext(),
    );

    expect(result.ok).toBe(true);
    expect(result.artifact?.kind).toBe("theory_scalar_cut_loaded");
    expect(result.artifact?.target_workbench).toBe("scalar");
    expect(useScientificCalculatorStore.getState().currentLatex).toBe("E = h*c/lambda");
    expect(useScientificCalculatorStore.getState().debugEvents[0]?.target_workbench).toBe("scalar");
  });
});
