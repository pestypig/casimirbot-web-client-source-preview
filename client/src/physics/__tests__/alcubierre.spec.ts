import { describe, expect, it } from "vitest";
import {
  AlcubierreParams,
  energyDensityEulerian,
  theta,
} from "@/physics/alcubierre";

const params: AlcubierreParams = {
  R: 1,
  sigma: 8,
  v: 0.3,
  center: [0, 0, 0],
};

describe("Alcubierre helpers", () => {
  it("produces the expected theta sign ahead and behind the bubble", () => {
    const ahead = theta(1.5, 0, 0, params);
    const aft = theta(-1.5, 0, 0, params);
    expect(ahead).toBeLessThan(0);
    expect(aft).toBeGreaterThan(0);
  });

  it("has a torus node for energy density on the axis", () => {
    const onAxis = energyDensityEulerian(0, 0, 0, params);
    expect(Math.abs(onAxis)).toBeLessThan(1e-12);
  });
});

