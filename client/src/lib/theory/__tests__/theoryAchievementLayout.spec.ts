import { describe, expect, it } from "vitest";
import { buildNhm2TheoryBadgeGraphV1 } from "@shared/theory/nhm2-theory-badges";
import { layoutTheoryAchievementMap } from "../theoryAchievementLayout";
import type { TheoryAchievementLayoutNode } from "../theoryAchievementLayout";

describe("layoutTheoryAchievementMap", () => {
  it("projects graph badges into deterministic achievement-map coordinates", () => {
    const graph = buildNhm2TheoryBadgeGraphV1();
    const layout = layoutTheoryAchievementMap(graph);
    const node = (badgeId: string) =>
      layout.nodes.find((entry: TheoryAchievementLayoutNode) => entry.badgeId === badgeId);

    expect(layout.nodes.length).toBe(graph.badges.length);
    expect(node("physics.units.dimension_consistency")?.x).toBeLessThan(
      node("physics.energy.energy_density")?.x ?? 0,
    );
    expect(node("physics.relativity.rest_energy")?.x).toBeLessThan(
      node("nhm2.qei.sampling_window")?.x ?? 0,
    );
    expect(node("solar.spectrum.photon_energy")?.lane).toBeGreaterThanOrEqual(2);
    expect(node("solar.spectrum.photon_energy")?.lane).toBeLessThan(10);
    expect(node("solar.claim_boundary.observational_proxy")?.lane).toBeGreaterThanOrEqual(10);
  });
});
