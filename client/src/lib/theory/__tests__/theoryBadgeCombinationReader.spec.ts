import { describe, expect, it } from "vitest";
import { buildNhm2TheoryBadgeGraphV1 } from "@shared/theory/nhm2-theory-badges";
import { buildTheoryBadgeCombinationReaderPayload } from "../theoryBadgeCombinationReader";
import { resolveTheoryBadgeConnectionTrace } from "../theoryBadgeConnectionTrace";

describe("theory badge combination reader", () => {
  it("builds an empty exploration payload before badge selection", () => {
    const graph = buildNhm2TheoryBadgeGraphV1();
    const payload = buildTheoryBadgeCombinationReaderPayload({
      graph,
      selectedBadgeIds: [],
      trace: null,
      availableNextBadgeIds: [],
    });

    expect(payload.schema).toBe("theory_badge_graph_combination_reader/v1");
    expect(payload.selectedBadges).toEqual([]);
    expect(payload.traceEdges).toEqual([]);
    expect(payload.implicationSummary[0]).toMatch(/whole graph is still available/i);
  });

  it("summarizes selected, trace, intermediate, next, boundary, and edge relation state", () => {
    const graph = buildNhm2TheoryBadgeGraphV1();
    const selectedBadgeIds = ["physics.relativity.rest_energy", "nhm2.qei.sampling_window"];
    const trace = resolveTheoryBadgeConnectionTrace({ graph, badgeIds: selectedBadgeIds });
    const selected = new Set(selectedBadgeIds);
    const availableNextBadgeIds = graph.badges
      .filter((badge) => !selected.has(badge.id))
      .filter((badge) => {
        const nextTrace = resolveTheoryBadgeConnectionTrace({ graph, badgeIds: [...selectedBadgeIds, badge.id] });
        return nextTrace.connectingEdgeIds.length > 0 && nextTrace.connectingBadgeIds.includes(badge.id);
      })
      .map((badge) => badge.id);

    const payload = buildTheoryBadgeCombinationReaderPayload({
      graph,
      selectedBadgeIds,
      trace,
      availableNextBadgeIds,
    });

    expect(payload.selectedBadges.map((badge) => badge.id)).toEqual(selectedBadgeIds);
    expect(payload.tracePathBadges.length).toBeGreaterThanOrEqual(selectedBadgeIds.length);
    expect(payload.intermediateBadges.length).toBeGreaterThan(0);
    expect(payload.availableNextBadges.length).toBeGreaterThan(0);
    expect(payload.unavailableBadgeCount).toBeGreaterThan(0);
    expect(payload.traceEdges.length).toBeGreaterThan(0);
    expect(payload.traceEdges.every((edge) => edge.lineStyle === "solid" || edge.lineStyle === "dotted")).toBe(true);
    expect(payload.implicationSummary.join(" ")).toMatch(/Solid edges|dotted edges/i);
    expect(payload.suggestedNextBadgeIds.length).toBeGreaterThan(0);
  });

  it("marks disconnected selected badges as outside the computed trace", () => {
    const graph = buildNhm2TheoryBadgeGraphV1();
    const selectedBadgeIds = ["physics.units.dimension_consistency", "physics.constants.speed_of_light"];
    const trace = resolveTheoryBadgeConnectionTrace({ graph, badgeIds: selectedBadgeIds });

    const payload = buildTheoryBadgeCombinationReaderPayload({
      graph,
      selectedBadgeIds,
      trace,
      availableNextBadgeIds: [],
    });

    expect(payload.disconnectedSelectedBadges.map((badge) => badge.id)).toContain("physics.constants.speed_of_light");
    expect(payload.implicationSummary.join(" ")).toMatch(/outside the computed trace/i);
  });
});
