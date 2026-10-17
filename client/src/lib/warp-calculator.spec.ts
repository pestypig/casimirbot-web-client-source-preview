import { describe, expect, it } from "vitest";

import { buildWarpCalculatorInputPayload } from "@/lib/warp-calculator";

describe("buildWarpCalculatorInputPayload", () => {
  it("maps supported pipeline fields and aliases into calculator payload", () => {
    const payload = buildWarpCalculatorInputPayload({
      pipeline: {
        warpFieldType: "natario",
        gammaGeo: 26,
        dutyCycle: 0.12,
        dutyShip: 0.02,
        dutyEffectiveFR: 0.005,
        sectorCount: 400,
        sectorsConcurrent: 2,
        qSpoilingFactor: 0.45,
        qCavity: 1e9,
        gammaVdB: 1500,
        qi: {
          sampler: "gaussian",
          fieldType: "em",
          tau_s_ms: 30,
        },
      },
      observerCondition: "nec",
      observerFrame: "Eulerian",
      observerRapidityCap: 3.5,
      observerTypeITolerance: 1e-9,
      label: "mk2-figure-snapshot",
    });

    expect(payload.label).toBe("mk2-figure-snapshot");
    expect(payload.params).toMatchObject({
      warpFieldType: "natario",
      gammaGeo: 26,
      dutyCycle: 0.12,
      dutyShip: 0.02,
      dutyEffective_FR: 0.005,
      sectorCount: 400,
      concurrentSectors: 2,
      qSpoilingFactor: 0.45,
      qCavity: 1e9,
      gammaVanDenBroeck: 1500,
    });
    expect(payload.qi).toEqual({
      sampler: "gaussian",
      fieldType: "em",
      tau_s_ms: 30,
    });
  });

  it("drops non-finite values and still builds a stable default label", () => {
    const payload = buildWarpCalculatorInputPayload({
      pipeline: {
        gammaGeo: "bad",
        qSpoilingFactor: Number.NaN,
        qi: {
          tau_s_ms: "oops",
        },
      },
      observerCondition: "dec",
      observerFrame: "Missed",
      observerRapidityCap: null,
      observerTypeITolerance: null,
    });

    expect(payload.params).toBeUndefined();
    expect(payload.qi).toBeUndefined();
    expect(payload.label).toContain("needle-hull-mk2-dec-Missed");
  });
});
