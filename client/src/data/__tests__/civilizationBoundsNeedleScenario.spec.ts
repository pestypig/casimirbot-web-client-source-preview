import { describe, expect, it } from "vitest";
import { validateCivilizationBoundsRoadmapV1 } from "@shared/civilization-bounds-roadmap";
import {
  buildNeedleCivilizationBoundsScenario,
  exportCivilizationBoundsBridgeContext,
  NEEDLE_CIVILIZATION_BOUNDS_SCENARIO_ID,
} from "../civilizationBoundsNeedleScenario";

describe("Needle civilization bounds scenario", () => {
  it("builds a valid declared-scenario roadmap", () => {
    const roadmap = buildNeedleCivilizationBoundsScenario({
      generatedAt: "2026-06-08T00:00:00.000Z",
    });
    expect(validateCivilizationBoundsRoadmapV1(roadmap)).toEqual([]);
    expect(roadmap.scenarioId).toBe(NEEDLE_CIVILIZATION_BOUNDS_SCENARIO_ID);
    expect(roadmap.activeLayerModes).toEqual(["ideal_bounds"]);
    expect(roadmap.systems.length).toBeGreaterThan(0);
    expect(roadmap.badges.length).toBeGreaterThan(roadmap.systems.length);
    expect(roadmap.collaborationBounds.length).toBeGreaterThan(0);
  });

  it("keeps old role data as declared scenario evidence, not observed reality", () => {
    const roadmap = buildNeedleCivilizationBoundsScenario({
      generatedAt: "2026-06-08T00:00:00.000Z",
    });
    const allClaimTiers = [
      ...roadmap.phases.map((phase) => phase.claimTier),
      ...roadmap.systems.map((system) => system.claimTier),
      ...roadmap.badges.map((badge) => badge.claimTier),
      ...roadmap.edges.map((edge) => edge.claimTier),
      ...roadmap.collaborationBounds.map((bound) => bound.claimTier),
    ];
    expect(new Set(allClaimTiers)).toEqual(new Set(["declared_scenario"]));
    expect(roadmap.systems.every((system) => system.scopeBoundary === "research_program")).toBe(true);
    expect(JSON.stringify(roadmap)).not.toMatch(/historical_observation|source_backed_observation|model_projection/);
  });

  it("exports Theory and Moral bridge context from selected bounds badges", () => {
    const roadmap = buildNeedleCivilizationBoundsScenario({
      generatedAt: "2026-06-08T00:00:00.000Z",
    });
    const boundBadge = roadmap.badges.find(
      (badge) => (badge.theoryBadgeIds?.length ?? 0) > 0 && (badge.moralNodeIds?.length ?? 0) > 0,
    );
    expect(boundBadge).toBeTruthy();
    const context = exportCivilizationBoundsBridgeContext(
      roadmap,
      boundBadge ? [boundBadge.badgeId] : [],
    );
    expect(context.theoryBadgeIds.length).toBeGreaterThan(0);
    expect(context.moralNodeIds.length).toBeGreaterThan(0);
    expect(context.systemIds.length).toBeGreaterThan(0);
    expect(context.missingEvidence).toContain("source_backed_capacity_measurements");
  });
});
