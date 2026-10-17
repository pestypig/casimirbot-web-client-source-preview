import { describe, expect, it } from "vitest";
import { divergeThetaColor, resolveSpacetimeGridThetaNorm } from "./spacetime-grid";

describe("resolveSpacetimeGridThetaNorm", () => {
  it("uses manual unity normalization", () => {
    const norm = resolveSpacetimeGridThetaNorm({
      warpStrengthMode: "manual",
      thetaFloorGR: 0.2,
      thetaFloorDrive: 0.8,
    });
    expect(norm).toBe(1);
  });

  it("uses the larger theta floor for auto modes", () => {
    const thetaFloorGR = 0.18;
    const thetaFloorDrive = 0.52;
    const autoPk = resolveSpacetimeGridThetaNorm({
      warpStrengthMode: "autoThetaPk",
      thetaFloorGR,
      thetaFloorDrive,
    });
    const autoExpected = resolveSpacetimeGridThetaNorm({
      warpStrengthMode: "autoThetaScaleExpected",
      thetaFloorGR,
      thetaFloorDrive,
    });
    expect(autoPk).toBe(thetaFloorDrive);
    expect(autoExpected).toBe(thetaFloorDrive);
  });

  it("falls back to GR theta floor when mode is missing", () => {
    const norm = resolveSpacetimeGridThetaNorm({
      warpStrengthMode: undefined,
      thetaFloorGR: 0.31,
      thetaFloorDrive: 0.12,
    });
    expect(norm).toBe(0.31);
  });
});

describe("divergeThetaColor", () => {
  it("maps negative, zero, and positive inputs to the cold-mid-warm ramp", () => {
    const cold = divergeThetaColor(-1);
    const mid = divergeThetaColor(0);
    const warm = divergeThetaColor(1);

    expect(cold[0]).toBeCloseTo(0.2, 4);
    expect(cold[1]).toBeCloseTo(0.42, 4);
    expect(cold[2]).toBeCloseTo(0.85, 4);

    expect(mid[0]).toBeCloseTo(0.92, 4);
    expect(mid[1]).toBeCloseTo(0.95, 4);
    expect(mid[2]).toBeCloseTo(0.96, 4);

    expect(warm[0]).toBeCloseTo(0.95, 4);
    expect(warm[1]).toBeCloseTo(0.52, 4);
    expect(warm[2]).toBeCloseTo(0.18, 4);
  });
});
