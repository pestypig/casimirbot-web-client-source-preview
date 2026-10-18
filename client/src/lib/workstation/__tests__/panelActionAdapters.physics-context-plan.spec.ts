import { beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).__HELIX_ASK_JOB_TIMEOUT_MS__ = "1200000";

vi.mock("@/lib/docs/openDocPanel", () => ({
  openDocPanel: vi.fn(),
}));
vi.mock("@/lib/helix/ask-prompt-launch", () => ({
  launchHelixAskPrompt: vi.fn(),
}));
vi.mock("@/lib/helix/display-audio-capture", () => ({
  startDisplayAudioSituationSession: vi.fn(),
}));
vi.mock("@/lib/helix/mic-audio-situation-capture", () => ({
  startMicAudioSituationSession: vi.fn(),
}));

import { executeHelixPanelAction } from "@/lib/workstation/panelActionAdapters";
import { useTheoryMapOverlayStore } from "@/store/useTheoryMapOverlayStore";
import { useTheoryBadgeGraphPanelStore } from "@/store/useTheoryBadgeGraphPanelStore";

function actionContext() {
  return {
    openPanel: () => undefined,
    focusPanel: () => undefined,
    closePanel: () => undefined,
    openSettings: () => undefined,
  };
}

describe("panelActionAdapters physics context plan", () => {
  beforeEach(() => {
    useTheoryMapOverlayStore.getState().clearOverlay();
    useTheoryBadgeGraphPanelStore.getState().resetPanelMemory();
  });

  it("plans a locate-only theory context without calculator solve actions", () => {
    const result = executeHelixPanelAction(
      {
        panel_id: "theory-badge-graph",
        action_id: "plan_calculation_context",
        args: {
          query: "where does curvature proxy for density 1000 fit",
          atlas_block_id: "curvature_collapse",
          intent: "locate_only",
        },
      },
      actionContext(),
    );

    expect(result.ok).toBe(true);
    expect(result.artifact).toMatchObject({
      kind: "helix_physics_calculation_context_plan",
      graph_id: "nhm2-theory-badge-graph",
    });
    expect(JSON.stringify(result.artifact)).not.toContain("solve_calculator_loadout");
    expect(useTheoryMapOverlayStore.getState().highlightedBadgeIds.length).toBeGreaterThan(0);
  });

  it("returns the live manual badge combination through the read-only current_context action", () => {
    useTheoryBadgeGraphPanelStore.getState().setSelectedBadgeIds([
      "element.h.origin",
      "physics.quantum.energy_frequency",
    ]);
    useTheoryBadgeGraphPanelStore.getState().setSelectedBadgeId("physics.quantum.energy_frequency");

    const result = executeHelixPanelAction(
      {
        panel_id: "theory-badge-graph",
        action_id: "current_context",
      },
      actionContext(),
    );

    expect(result).toMatchObject({
      ok: true,
      panel_id: "theory-badge-graph",
      action_id: "current_context",
      artifact: {
        kind: "theory_badge_graph_current_context",
        selected_badge_ids: ["element.h.origin", "physics.quantum.energy_frequency"],
        observation_required: true,
        answer_authority: false,
        terminal_eligible: false,
        artifact_v1: {
          selected_badge_ids: ["element.h.origin", "physics.quantum.energy_frequency"],
          answer_authority: false,
          terminal_eligible: false,
        },
      },
    });
  });

  it("plans a solar scalar workflow with solve as an explicit next action", () => {
    const result = executeHelixPanelAction(
      {
        panel_id: "theory-badge-graph",
        action_id: "plan_calculation_context",
        args: {
          query: "Estimate photon energy for 656.28 nm H-alpha and Doppler shift",
          atlas_block_id: "solar_surface_spectrum",
          intent: "solve_scalar",
        },
      },
      actionContext(),
    );

    expect(result.ok).toBe(true);
    expect(result.artifact?.next_actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: "theory-badge-graph.solve_calculator_loadout",
        }),
      ]),
    );
  });
});
