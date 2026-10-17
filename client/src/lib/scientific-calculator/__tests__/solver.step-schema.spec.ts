import { describe, expect, it } from "vitest";

import { isScientificCalculatorStepTraceArtifactV1 } from "@shared/contracts/scientific-calculator-step-schema.v1";
import { runScientificSolve } from "../solver";

describe("scientific calculator step schema artifact", () => {
  it("emits a validating step-trace artifact for equation solves", () => {
    const result = runScientificSolve("x + 2 = 5", true);
    const artifact = result.artifact_v1;

    expect(artifact).toBeTruthy();
    expect(isScientificCalculatorStepTraceArtifactV1(artifact)).toBe(true);
    if (!artifact) throw new Error("artifact_v1 missing");
    expect(artifact.steps.map((step) => step.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(artifact.result.kind).toMatch(/exact|approximate|symbolic_relation/);
    expect(artifact.request.mode).toBe("solve_equation");
    expect(artifact.normalization.canonicalText).toContain("x");
  });

  it("emits a validating artifact for symbolic fallback without leaking engine exceptions", () => {
    const result = runScientificSolve("2 = 3", true);
    const artifact = result.artifact_v1;

    expect(isScientificCalculatorStepTraceArtifactV1(artifact)).toBe(true);
    if (!artifact) throw new Error("artifact_v1 missing");
    expect(artifact.result.kind).toBe("symbolic_relation");
    expect(artifact.quality.fallbackReason).toBeTruthy();
    expect(result.result_text).not.toContain("Error:");
    expect(result.result_text).not.toContain("eqn.split");
  });

  it("emits a validating unsolved artifact for backend-only GR requests", () => {
    const result = runScientificSolve(
      "Compute the Einstein tensor and QI guardrail for the Natario warp.metric T00 route.",
      true,
    );
    const artifact = result.artifact_v1;

    expect(result.ok).toBe(false);
    expect(isScientificCalculatorStepTraceArtifactV1(artifact)).toBe(true);
    if (!artifact) throw new Error("artifact_v1 missing");
    expect(artifact.result.kind).toBe("unsolved");
    expect(artifact.quality.fallbackReason).toBe("engine_not_implemented");
  });
});
