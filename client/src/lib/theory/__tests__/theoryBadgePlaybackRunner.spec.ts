import { describe, expect, it } from "vitest";
import { isScientificCalculatorStepTraceArtifactV1 } from "@shared/contracts/scientific-calculator-step-schema.v1";
import {
  isTheoryBadgePlaybackArtifactV1,
  type TheoryBadgePlaybackStepV1,
} from "@shared/contracts/theory-badge-playback.v1";
import { buildNhm2TheoryBadgeGraphV1 } from "@shared/theory/nhm2-theory-badges";
import { runTheoryBadgePlaybackNow } from "../theoryBadgePlaybackRunner";

describe("runTheoryBadgePlaybackNow", () => {
  it("solves calculator payloads and keeps skipped badges in the path", () => {
    const graph = buildNhm2TheoryBadgeGraphV1();
    const run = runTheoryBadgePlaybackNow({
      graph,
      targetBadgeId: "nhm2.qei.sampling_window",
    });

    expect(isTheoryBadgePlaybackArtifactV1(run)).toBe(true);
    expect(run.summary.payloadCount).toBeGreaterThanOrEqual(1);
    expect(run.summary.calculatorArtifactCount).toBeGreaterThanOrEqual(1);
    expect(run.steps.some((step: TheoryBadgePlaybackStepV1) => step.calculatorArtifactV1)).toBe(true);
    expect(run.steps.some((step: TheoryBadgePlaybackStepV1) => step.status === "skipped")).toBe(true);

    for (const step of run.steps) {
      if (step.calculatorArtifactV1) {
        expect(isScientificCalculatorStepTraceArtifactV1(step.calculatorArtifactV1)).toBe(true);
      }
    }
  });
});
