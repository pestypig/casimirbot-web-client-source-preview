import { describe, expect, it } from "vitest";
import { buildNhm2TheoryBadgeGraphV1 } from "@shared/theory/nhm2-theory-badges";
import { resolveTheoryBadgeConnectionTrace } from "../theoryBadgeConnectionTrace";

describe("resolveTheoryBadgeConnectionTrace", () => {
  it("connects selected badges through shared upstream theory", () => {
    const graph = buildNhm2TheoryBadgeGraphV1();
    const trace = resolveTheoryBadgeConnectionTrace({
      graph,
      badgeIds: ["physics.relativity.rest_energy", "nhm2.qei.sampling_window"],
    });

    expect(trace.selectedBadgeIds).toEqual([
      "physics.relativity.rest_energy",
      "nhm2.qei.sampling_window",
    ]);
    expect(trace.connectingBadgeIds).toContain("physics.energy.energy_density");
    expect(trace.connectingBadgeIds).toContain("nhm2.qei.sampling_window");
    expect(trace.connectingEdgeIds.length).toBeGreaterThan(0);
    expect(trace.calculatorPayloadIds).toEqual(expect.arrayContaining(["energy_density_payload"]));
  });
});
