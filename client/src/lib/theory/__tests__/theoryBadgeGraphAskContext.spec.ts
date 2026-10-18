import { describe, expect, it } from "vitest";

import { buildTheoryBadgeGraphAskContextSnapshot } from "../theoryBadgeGraphAskContext";

const emptySemanticSelections = {
  selectedStarSimStageId: null,
  selectedStarSimObjectBindingId: null,
  selectedCosmicDistanceRungId: null,
  selectedCosmicDistanceObjectBindingId: null,
  selectedSolarSpectrumGroupId: null,
  selectedSolarSpectrumObjectBindingId: null,
  selectedCasimirCavityGroupId: null,
  selectedCasimirCavityObjectBindingId: null,
  selectedWarpGrNhm2GroupId: null,
  selectedWarpGrNhm2ObjectBindingId: null,
  selectedQeiStressEnergyGroupId: null,
  selectedQeiStressEnergyObjectBindingId: null,
  selectedTokamakPlasmaGroupId: null,
  selectedTokamakPlasmaObjectBindingId: null,
  selectedGalacticDynamicsGroupId: null,
  selectedGalacticDynamicsObjectBindingId: null,
  selectedCurvatureCollapseGroupId: null,
  selectedCurvatureCollapseObjectBindingId: null,
};

describe("Theory Badge Graph Ask context", () => {
  it("projects the manual selection through the same combination reader used by the graph UI", () => {
    const snapshot = buildTheoryBadgeGraphAskContextSnapshot({
      selectedBadgeId: "physics.quantum.energy_frequency",
      selectedBadgeIds: ["element.h.origin", "physics.quantum.energy_frequency"],
      activeAtlasLensId: "atomic_radiation_state",
      ...emptySemanticSelections,
      selectedSolarSpectrumGroupId: "hydrogen_lines",
      selectedSolarSpectrumObjectBindingId: "solar-spectrum:hydrogen-lines",
    }, 1_750_000_000_000);

    expect(snapshot).toMatchObject({
      schema: "helix.theory_badge_graph_current_context.v1",
      panel_id: "theory-badge-graph",
      active_badge_id: "physics.quantum.energy_frequency",
      selected_badge_ids: ["element.h.origin", "physics.quantum.energy_frequency"],
      active_atlas_lens_id: "atomic_radiation_state",
      captured_at_ms: 1_750_000_000_000,
      observation_required: true,
      answer_authority: false,
      terminal_eligible: false,
      assistant_answer: false,
      raw_content_included: false,
    });
    expect(snapshot.semantic_selections).toEqual([{
      domain: "solar_surface_spectrum",
      selection_kind: "observation_group",
      selection_id: "hydrogen_lines",
      object_binding_id: "solar-spectrum:hydrogen-lines",
    }]);
    expect(snapshot.combination_reader.selectedBadges.map((badge) => badge.id)).toEqual([
      "element.h.origin",
      "physics.quantum.energy_frequency",
    ]);
    expect(snapshot.combination_reader.tracePathBadges.length).toBeGreaterThan(2);
    expect(snapshot.combination_reader.intermediateBadges.length).toBeGreaterThan(0);
    expect(snapshot.combination_reader.availableNextBadges.length).toBeGreaterThan(0);
    expect(snapshot.combination_reader.boundaryContext.notes.length).toBeGreaterThan(0);
  });

  it("falls back to the active badge when the multi-selection list is empty", () => {
    const snapshot = buildTheoryBadgeGraphAskContextSnapshot({
      selectedBadgeId: "physics.atomic.element_identity_context",
      selectedBadgeIds: [],
      activeAtlasLensId: null,
      ...emptySemanticSelections,
    }, 42);

    expect(snapshot.selected_badge_ids).toEqual(["physics.atomic.element_identity_context"]);
    expect(snapshot.combination_reader.selectedBadges).toHaveLength(1);
  });
});
