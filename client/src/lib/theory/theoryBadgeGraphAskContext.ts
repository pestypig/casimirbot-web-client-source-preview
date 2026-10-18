import { buildNhm2TheoryBadgeGraphV1 } from "@shared/theory/nhm2-theory-badges";
import { useTheoryBadgeGraphPanelStore } from "@/store/useTheoryBadgeGraphPanelStore";
import {
  buildTheoryBadgeCombinationReaderPayloadForSelection,
  type TheoryBadgeCombinationReaderPayload,
} from "./theoryBadgeCombinationReader";

export const THEORY_BADGE_GRAPH_CURRENT_CONTEXT_SCHEMA =
  "helix.theory_badge_graph_current_context.v1" as const;

export type TheoryBadgeGraphSemanticSelection = {
  domain: string;
  selection_kind: string;
  selection_id: string | null;
  object_binding_id: string | null;
};

export type TheoryBadgeGraphAskContextSnapshot = {
  schema: typeof THEORY_BADGE_GRAPH_CURRENT_CONTEXT_SCHEMA;
  panel_id: "theory-badge-graph";
  graph_id: string;
  active_badge_id: string | null;
  selected_badge_ids: string[];
  active_atlas_lens_id: string | null;
  semantic_selections: TheoryBadgeGraphSemanticSelection[];
  combination_reader: TheoryBadgeCombinationReaderPayload;
  captured_at_ms: number;
  observation_required: true;
  answer_authority: false;
  terminal_eligible: false;
  assistant_answer: false;
  raw_content_included: false;
};

type TheoryBadgeGraphStateSnapshot = Pick<
  ReturnType<typeof useTheoryBadgeGraphPanelStore.getState>,
  | "selectedBadgeId"
  | "selectedBadgeIds"
  | "activeAtlasLensId"
  | "selectedStarSimStageId"
  | "selectedStarSimObjectBindingId"
  | "selectedCosmicDistanceRungId"
  | "selectedCosmicDistanceObjectBindingId"
  | "selectedSolarSpectrumGroupId"
  | "selectedSolarSpectrumObjectBindingId"
  | "selectedCasimirCavityGroupId"
  | "selectedCasimirCavityObjectBindingId"
  | "selectedWarpGrNhm2GroupId"
  | "selectedWarpGrNhm2ObjectBindingId"
  | "selectedQeiStressEnergyGroupId"
  | "selectedQeiStressEnergyObjectBindingId"
  | "selectedTokamakPlasmaGroupId"
  | "selectedTokamakPlasmaObjectBindingId"
  | "selectedGalacticDynamicsGroupId"
  | "selectedGalacticDynamicsObjectBindingId"
  | "selectedCurvatureCollapseGroupId"
  | "selectedCurvatureCollapseObjectBindingId"
>;

const semanticSelectionsFromState = (
  state: TheoryBadgeGraphStateSnapshot,
): TheoryBadgeGraphSemanticSelection[] => {
  const selections: Array<[string, string, string | null, string | null]> = [
  ["stellar_evolution", "stage", state.selectedStarSimStageId, state.selectedStarSimObjectBindingId],
  ["cosmic_distance_ladder", "rung", state.selectedCosmicDistanceRungId, state.selectedCosmicDistanceObjectBindingId],
  ["solar_surface_spectrum", "observation_group", state.selectedSolarSpectrumGroupId, state.selectedSolarSpectrumObjectBindingId],
  ["casimir_cavity_modes", "cavity_group", state.selectedCasimirCavityGroupId, state.selectedCasimirCavityObjectBindingId],
  ["warp_gr_nhm2", "warp_group", state.selectedWarpGrNhm2GroupId, state.selectedWarpGrNhm2ObjectBindingId],
  ["qei_stress_energy", "qei_group", state.selectedQeiStressEnergyGroupId, state.selectedQeiStressEnergyObjectBindingId],
  ["tokamak_plasma", "plasma_group", state.selectedTokamakPlasmaGroupId, state.selectedTokamakPlasmaObjectBindingId],
  ["galactic_dynamics", "dynamics_group", state.selectedGalacticDynamicsGroupId, state.selectedGalacticDynamicsObjectBindingId],
  ["curvature_collapse", "collapse_group", state.selectedCurvatureCollapseGroupId, state.selectedCurvatureCollapseObjectBindingId],
  ];
  return selections.flatMap(([domain, selectionKind, selectionId, objectBindingId]) =>
    selectionId || objectBindingId
      ? [{
        domain,
        selection_kind: selectionKind,
        selection_id: selectionId,
        object_binding_id: objectBindingId,
      }]
      : [],
  );
};

export function buildTheoryBadgeGraphAskContextSnapshot(
  state: TheoryBadgeGraphStateSnapshot,
  capturedAtMs: number,
): TheoryBadgeGraphAskContextSnapshot {
  const graph = buildNhm2TheoryBadgeGraphV1();
  const selectedBadgeIds = state.selectedBadgeIds.length > 0
    ? state.selectedBadgeIds
    : state.selectedBadgeId
      ? [state.selectedBadgeId]
      : [];
  const combinationReader = buildTheoryBadgeCombinationReaderPayloadForSelection({
    graph,
    selectedBadgeIds,
  });

  return {
    schema: THEORY_BADGE_GRAPH_CURRENT_CONTEXT_SCHEMA,
    panel_id: "theory-badge-graph",
    graph_id: graph.graphId,
    active_badge_id: state.selectedBadgeId,
    selected_badge_ids: combinationReader.selectedBadges.map((badge) => badge.id),
    active_atlas_lens_id: state.activeAtlasLensId,
    semantic_selections: semanticSelectionsFromState(state),
    combination_reader: combinationReader,
    captured_at_ms: capturedAtMs,
    observation_required: true,
    answer_authority: false,
    terminal_eligible: false,
    assistant_answer: false,
    raw_content_included: false,
  };
}

export function readTheoryBadgeGraphAskContextSnapshot(
  capturedAtMs: number,
): TheoryBadgeGraphAskContextSnapshot {
  return buildTheoryBadgeGraphAskContextSnapshot(
    useTheoryBadgeGraphPanelStore.getState(),
    capturedAtMs,
  );
}
