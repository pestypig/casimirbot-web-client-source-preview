import { describe, expect, it } from "vitest";
import { isScientificCalculatorStepTraceArtifactV1 } from "@shared/contracts/scientific-calculator-step-schema.v1";
import { isStarSimRuntimeReceiptV1 } from "@shared/contracts/starsim-runtime-receipt.v1";
import { buildNhm2TheoryBadgeGraphV1 } from "@shared/theory/nhm2-theory-badges";
import { buildStarSimObjectBindings } from "@shared/theory/starsim-object-bindings";
import { buildTheoryCalculatorLoadout } from "@shared/theory/theory-calculator-loadout";
import { solveTheoryCalculatorLoadoutNow } from "../theoryCalculatorLoadoutRunner";

describe("theory calculator loadout runner runtime rows", () => {
  it("solves scalar rows and attaches a StarSim runtime receipt", () => {
    const graph = buildNhm2TheoryBadgeGraphV1();
    const loadout = buildTheoryCalculatorLoadout({
      graph,
      badgeIds: ["starsim.runtime.evaluate_fusion_microphysics"],
      mode: "dependency_path",
      source: "helix_ask",
      objectContext: buildStarSimObjectBindings({
        objectClass: "main_sequence",
        spectralType: "G2V",
        mass_Msun: 1,
        radius_Rsun: 1,
        luminosity_Lsun: 1,
        r90_Rstar: 0.25,
      }),
      includeContextItems: true,
    });

    const solved = solveTheoryCalculatorLoadoutNow(loadout, {
      solveScope: "all_scalar_and_runtime",
      runRuntime: true,
    });

    expect(solved.items.some((item) => isScientificCalculatorStepTraceArtifactV1(item.calculatorArtifactV1))).toBe(true);
    expect(solved.items.some((item) => isStarSimRuntimeReceiptV1(item.runtimeReceiptV1))).toBe(true);
    expect(solved.summary.runtimeReceiptCount).toBeGreaterThanOrEqual(1);
  });
});
