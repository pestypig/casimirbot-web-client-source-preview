import { beforeEach, describe, expect, it } from "vitest";
import { buildTheoryBadgeLocatorArtifactV1 } from "@shared/contracts/theory-badge-locator.v1";
import { buildTheoryContextReflectionV1 } from "@shared/contracts/theory-context-reflection.v1";
import { useTheoryMapOverlayStore } from "../useTheoryMapOverlayStore";

function reflectionFixture() {
  return buildTheoryContextReflectionV1({
    generatedAt: "2026-05-31T00:00:00.000Z",
    reflectionId: "reflection:test",
    graphId: "nhm2-theory-badge-graph",
    input: {
      prompt: "Discuss source residual and QEI margin.",
      conversationContext: null,
      mentionedEquations: ["qei_margin = qei_bound - qei_sample"],
      mentionedSymbols: ["qei_margin", "R_source"],
      mentionedDomains: ["warp_gr_nhm2"],
      source: "helix_ask",
      confidenceMode: "soft_locator",
    },
    exactMatches: [],
    likelyMatches: [],
    inferredDomains: [],
    overlay: {
      centerBadgeIds: ["nhm2.qei.sampling_window"],
      highlightedBadgeIds: ["nhm2.qei.sampling_window", "nhm2.closure.source_residual"],
      highlightedEdgeIds: ["energy_density_to_qei_sampling"],
      heatByBadgeId: {
        "nhm2.qei.sampling_window": 1,
        "nhm2.closure.source_residual": 0.7,
      },
      exactBadgeIds: ["nhm2.qei.sampling_window"],
      likelyBadgeIds: ["nhm2.closure.source_residual"],
      softRegion: {
        id: "discussion-zone:test",
        label: "Current discussion zone",
        badgeIds: ["nhm2.qei.sampling_window", "nhm2.closure.source_residual"],
        confidence: 0.8,
        tone: "green",
        meaning: "discussion_context_not_proof",
      },
    },
    evidenceForAsk: {
      summary: "The discussion appears near QEI and source residual.",
      claimBoundaries: ["Diagnostic-only context."],
      recommendedNextActions: [
        {
          actionId: "theory-badge-graph.build_compound_theory_run",
          label: "Build compound theory run",
          panelId: "theory-badge-graph",
          args: { badge_ids: ["nhm2.qei.sampling_window"] },
          mutatesCalculator: false,
          solves: false,
        },
      ],
    },
  });
}

function locatorFixture() {
  return buildTheoryBadgeLocatorArtifactV1({
    graphId: "nhm2-theory-badge-graph",
    input: {
      query: "QEI margin",
      expression: null,
      subjects: [],
      symbols: ["qei_margin"],
      unitSignatures: [],
      repoPaths: [],
      equationFamilies: [],
      simulationOwners: [],
      source: "helix_ask",
    },
    matches: [],
    overlay: {
      centerBadgeIds: ["nhm2.qei.sampling_window"],
      highlightedBadgeIds: ["nhm2.qei.sampling_window"],
      highlightedEdgeIds: [],
      rippleBadgeIds: ["nhm2.qei.sampling_window"],
      heatByBadgeId: { "nhm2.qei.sampling_window": 1 },
      suggestedViewport: {
        centerBadgeId: "nhm2.qei.sampling_window",
        zoom: 1,
      },
    },
    recommendedActions: [
      {
        actionId: "theory-badge-graph.load_payloads_to_calculator",
        label: "Load payload",
        badgeId: "nhm2.qei.sampling_window",
      },
    ],
    claimBoundaryNotes: ["Diagnostic-only badge."],
  });
}

describe("useTheoryMapOverlayStore", () => {
  beforeEach(() => {
    useTheoryMapOverlayStore.getState().clearOverlay();
    useTheoryMapOverlayStore.getState().clearLiveAnswerContext();
  });

  it("sets discussion reflection overlay fields", () => {
    const artifact = reflectionFixture();

    useTheoryMapOverlayStore.getState().setReflectionOverlay(artifact);
    const state = useTheoryMapOverlayStore.getState();

    expect(state.source).toBe("discussion_reflection");
    expect(state.query).toBe("Discuss source residual and QEI margin.");
    expect(state.centerBadgeIds).toEqual(["nhm2.qei.sampling_window"]);
    expect(state.highlightedBadgeIds).toContain("nhm2.closure.source_residual");
    expect(state.highlightedEdgeIds).toEqual(["energy_density_to_qei_sampling"]);
    expect(state.selectedBadgeIds).toEqual(["nhm2.qei.sampling_window"]);
    expect(state.exactBadgeIds).toEqual(["nhm2.qei.sampling_window"]);
    expect(state.likelyBadgeIds).toEqual(["nhm2.closure.source_residual"]);
    expect(state.softRegions).toEqual([artifact.overlay.softRegion]);
    expect(state.claimBoundaryNotes).toEqual(["Diagnostic-only context."]);
    expect(state.recommendedActions).toEqual([
      {
        actionId: "theory-badge-graph.build_compound_theory_run",
        label: "Build compound theory run",
      },
    ]);
    expect(state.lastReflectionArtifact).toBe(artifact);
    expect(state.reflectionOverlay).toBe(artifact);
    expect(state.liveAnswerContextReflection).toBe(artifact);
  });

  it("clearOverlay clears visible reflection state but keeps live answer memory", () => {
    const reflection = reflectionFixture();
    useTheoryMapOverlayStore.getState().setLiveAnswerContextReflection(reflection);
    useTheoryMapOverlayStore.getState().restoreLiveAnswerContextOverlay();
    useTheoryMapOverlayStore.getState().clearOverlay();
    const state = useTheoryMapOverlayStore.getState();

    expect(state.source).toBe("none");
    expect(state.exactBadgeIds).toEqual([]);
    expect(state.likelyBadgeIds).toEqual([]);
    expect(state.softRegions).toEqual([]);
    expect(state.reflectionOverlay).toBeNull();
    expect(state.liveAnswerContextReflection).toBe(reflection);
    expect(state.lastReflectionArtifact).toBe(reflection);
  });

  it("stores live answer context reflection without showing a discussion overlay", () => {
    const reflection = reflectionFixture();

    useTheoryMapOverlayStore.getState().setLiveAnswerContextReflection(reflection);
    const state = useTheoryMapOverlayStore.getState();

    expect(state.source).toBe("none");
    expect(state.softRegions).toEqual([]);
    expect(state.liveAnswerContextReflection).toBe(reflection);
    expect(state.lastReflectionArtifact).toBe(reflection);
  });

  it("restores live answer context into the visible discussion overlay", () => {
    const reflection = reflectionFixture();
    useTheoryMapOverlayStore.getState().setLiveAnswerContextReflection(reflection);

    useTheoryMapOverlayStore.getState().restoreLiveAnswerContextOverlay();
    const state = useTheoryMapOverlayStore.getState();

    expect(state.source).toBe("discussion_reflection");
    expect(state.softRegions).toEqual([reflection.overlay.softRegion]);
    expect(state.reflectionOverlay).toBe(reflection);
    expect(state.liveAnswerContextReflection).toBe(reflection);
  });

  it("existing setLocatorOverlay still works and keeps the last reflection artifact available", () => {
    const reflection = reflectionFixture();
    useTheoryMapOverlayStore.getState().setLiveAnswerContextReflection(reflection);
    const locator = locatorFixture();

    useTheoryMapOverlayStore.getState().setLocatorOverlay(locator);
    const state = useTheoryMapOverlayStore.getState();

    expect(state.source).toBe("helix_ask");
    expect(state.query).toBe("QEI margin");
    expect(state.rippleBadgeIds).toEqual(["nhm2.qei.sampling_window"]);
    expect(state.lastLocatorArtifact).toBe(locator);
    expect(state.exactBadgeIds).toEqual([]);
    expect(state.likelyBadgeIds).toEqual([]);
    expect(state.softRegions).toEqual([]);
    expect(state.lastReflectionArtifact).toBe(reflection);
    expect(state.liveAnswerContextReflection).toBe(reflection);
  });

  it("existing setSelectionOverlay still works and keeps the last reflection artifact available", () => {
    const reflection = reflectionFixture();
    useTheoryMapOverlayStore.getState().setLiveAnswerContextReflection(reflection);

    useTheoryMapOverlayStore.getState().setSelectionOverlay({
      selectedBadgeIds: ["nhm2.closure.source_residual"],
      highlightedBadgeIds: ["nhm2.closure.source_residual"],
      highlightedEdgeIds: [],
      claimBoundaryNotes: ["Selection boundary note."],
    });
    const state = useTheoryMapOverlayStore.getState();

    expect(state.source).toBe("multi_select");
    expect(state.selectedBadgeIds).toEqual(["nhm2.closure.source_residual"]);
    expect(state.rippleBadgeIds).toEqual(["nhm2.closure.source_residual"]);
    expect(state.claimBoundaryNotes).toEqual(["Selection boundary note."]);
    expect(state.exactBadgeIds).toEqual([]);
    expect(state.likelyBadgeIds).toEqual([]);
    expect(state.softRegions).toEqual([]);
    expect(state.lastReflectionArtifact).toBe(reflection);
    expect(state.liveAnswerContextReflection).toBe(reflection);
  });
});
