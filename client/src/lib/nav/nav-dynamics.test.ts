import { describe, expect, it } from "vitest";
import { computeNavDelta, createDeterministicNavTraceId } from "./nav-dynamics";

describe("nav dynamics trace helpers", () => {
  it("creates stable deterministic trace ids", () => {
    const input = {
      seed: "seed-1",
      viz: { planar: 0.3, rise: -0.2, yaw: 0.4 },
      waypoint: { position_m: [1, 2, 3] as [number, number, number] },
      frame: "heliocentric-ecliptic",
    };
    const a = createDeterministicNavTraceId(input);
    const b = createDeterministicNavTraceId(input);
    expect(a).toBe(b);
    expect(a.startsWith("nav:")).toBe(true);
  });

  it("computes predicted-vs-actual velocity magnitude delta", () => {
    const delta = computeNavDelta({
      predictedVelocity: [3, 4, 0],
      actualVelocity: [0, 0, 0],
    });
    expect(delta).toBeCloseTo(5, 8);
  });
});
