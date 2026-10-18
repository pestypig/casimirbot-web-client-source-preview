import { describe, expect, it } from "vitest";
import { buildNhm2TheoryBadgeGraphV1 } from "@shared/theory/nhm2-theory-badges";
import { resolveTheoryBadgePlaybackPlan } from "../theoryBadgePlaybackPlan";

describe("resolveTheoryBadgePlaybackPlan", () => {
  it("orders executable upstream badges before the target", () => {
    const graph = buildNhm2TheoryBadgeGraphV1();
    const plan = resolveTheoryBadgePlaybackPlan({
      graph,
      targetBadgeId: "nhm2.qei.sampling_window",
    });

    expect(plan.orderedBadgeIds.at(-1)).toBe("nhm2.qei.sampling_window");
    expect(plan.orderedBadgeIds).toContain("physics.gr.einstein_field_equation");
    expect(plan.orderedBadgeIds.indexOf("physics.gr.einstein_field_equation")).toBeLessThan(
      plan.orderedBadgeIds.indexOf("nhm2.qei.sampling_window"),
    );
    expect(plan.skippedRelationTypes).toContain("shares_units");
    expect(plan.warnings).toEqual([]);
  });

  it("returns a warning for a missing target", () => {
    const graph = buildNhm2TheoryBadgeGraphV1();
    const plan = resolveTheoryBadgePlaybackPlan({
      graph,
      targetBadgeId: "missing.badge",
    });

    expect(plan.orderedBadgeIds).toEqual([]);
    expect(plan.warnings).toContain("target badge not found: missing.badge");
  });
});
