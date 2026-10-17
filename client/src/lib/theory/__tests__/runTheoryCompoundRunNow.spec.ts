import { describe, expect, it } from "vitest";
import { isScientificCalculatorStepTraceArtifactV1 } from "@shared/contracts/scientific-calculator-step-schema.v1";
import {
  buildTheoryCompoundRunV1,
  type TheoryCompoundRunRowV1,
  type TheoryCompoundRunV1,
} from "@shared/contracts/theory-compound-run.v1";
import { buildStaticSolarRuntimeTraceV1 } from "@shared/theory/runtime-traces";
import { runTheoryScalarSweep } from "@shared/theory/theory-scalar-sweep-runner";
import { runTheoryCompoundRunNow } from "../runTheoryCompoundRunNow";

const FORBIDDEN_CLAIM_PATTERNS = [
  /validated propulsion/i,
  /working warp drive/i,
  /certified transport solution/i,
  /closed-loop solved transport result/i,
  /physical mechanism confirmed/i,
  /\bQEI passed\b/i,
];

function expectNoForbiddenClaimText(value: unknown): void {
  const serialized = JSON.stringify(value);
  for (const pattern of FORBIDDEN_CLAIM_PATTERNS) {
    expect(serialized).not.toMatch(pattern);
  }
}

function row(overrides: Partial<TheoryCompoundRunRowV1>): TheoryCompoundRunRowV1 {
  const hasDisplayLatex = Object.prototype.hasOwnProperty.call(overrides, "displayLatex");
  const hasExpression = Object.prototype.hasOwnProperty.call(overrides, "expression");
  return {
    id: overrides.id ?? "row:test",
    index: overrides.index ?? 1,
    badgeId: overrides.badgeId ?? "test.badge",
    badgeTitle: overrides.badgeTitle ?? "Test Badge",
    title: overrides.title ?? "Test Row",
    kind: overrides.kind ?? "scalar",
    displayLatex: hasDisplayLatex ? (overrides.displayLatex ?? null) : null,
    expression: hasExpression ? (overrides.expression ?? null) : "2+2",
    status: overrides.status ?? "pending",
    solver: overrides.solver ?? "scientific_calculator",
    sourcePath: overrides.sourcePath ?? "theory://test/row",
    dependsOn: overrides.dependsOn ?? [],
    calculatorArtifactV1: overrides.calculatorArtifactV1 ?? null,
    runtimeMathTraceV1: overrides.runtimeMathTraceV1 ?? null,
    runtimeReceiptV1: overrides.runtimeReceiptV1 ?? null,
    runtimeRunRequestV1: overrides.runtimeRunRequestV1 ?? null,
    sweepRunV1: overrides.sweepRunV1 ?? null,
    evidenceRefs: overrides.evidenceRefs ?? [],
    claimBoundaryNotes: overrides.claimBoundaryNotes ?? [],
    warnings: overrides.warnings ?? [],
  };
}

function runWithRows(rows: TheoryCompoundRunRowV1[]): TheoryCompoundRunV1 {
  return buildTheoryCompoundRunV1({
    runId: "theory-compound:test",
    graphId: "test-graph",
    targetBadgeIds: ["test.badge"],
    source: { kind: "manual", label: "test" },
    rows: rows.map((candidate, index) => ({ ...candidate, index: index + 1 })),
    generatedAt: "2026-05-29T00:00:00.000Z",
  });
}

describe("runTheoryCompoundRunNow", () => {
  it("solves scalar rows with scientific calculator artifacts", () => {
    const solved = runTheoryCompoundRunNow({
      run: runWithRows([row({ id: "row:scalar", expression: "2+2" })]),
      scope: "scalar_only",
    });

    expect(solved.rows[0].status).toBe("solved");
    expect(isScientificCalculatorStepTraceArtifactV1(solved.rows[0].calculatorArtifactV1)).toBe(true);
    expect(solved.summary.solvedCount).toBe(1);
  });

  it("blocks scalar rows that do not have an expression", () => {
    const solved = runTheoryCompoundRunNow({
      run: runWithRows([row({ id: "row:missing", expression: null, displayLatex: null })]),
      scope: "scalar_only",
    });

    expect(solved.rows[0].status).toBe("blocked");
    expect(solved.rows[0].calculatorArtifactV1).toBeNull();
    expect(solved.rows[0].warnings.join(" ")).toMatch(/no expression/i);
    expect(solved.summary.blockedCount).toBe(1);
  });

  it("computes static runtime traces without claiming backend execution", () => {
    const trace = buildStaticSolarRuntimeTraceV1({
      graphId: "test-graph",
      badgeIds: ["solar.spectrum.photon_energy"],
      traceId: "static-solar:test",
      generatedAt: "2026-05-29T00:00:00.000Z",
    });
    const solved = runTheoryCompoundRunNow({
      run: runWithRows([
        row({
          id: "row:runtime",
          kind: "reference",
          solver: "tensor_runtime",
          expression: null,
          runtimeMathTraceV1: trace,
        }),
      ]),
      scope: "runtime_trace_only",
    });

    expect(solved.rows[0].status).toBe("computed");
    expect(solved.rows[0].warnings.join(" ")).toMatch(/no backend runtime executed/i);
    expect(solved.rows[0].warnings.join(" ")).toMatch(/static reference trace only/i);
    expect(solved.summary.computedCount).toBe(1);
    expectNoForbiddenClaimText(solved);
  });

  it("keeps gate rows blocked and boundary rows visible with notes", () => {
    const solved = runTheoryCompoundRunNow({
      run: runWithRows([
        row({
          id: "row:gate",
          kind: "gate",
          solver: "gate_evaluator",
          expression: null,
          claimBoundaryNotes: ["Gate needs evidence."],
        }),
        row({
          id: "row:boundary",
          kind: "boundary",
          solver: "none",
          expression: null,
          claimBoundaryNotes: ["Diagnostic-only. No validation claim."],
        }),
      ]),
      scope: "all_available",
    });

    expect(solved.rows[0].status).toBe("blocked");
    expect(solved.rows[1].status).toBe("skipped");
    expect(solved.rows[1].claimBoundaryNotes).toContain("Diagnostic-only. No validation claim.");
    expect(solved.summary.blockedCount).toBe(1);
    expect(solved.summary.claimBoundaryNoteCount).toBe(2);
  });

  it("fails closed for evidence rows until artifact resolver output is attached", () => {
    const solved = runTheoryCompoundRunNow({
      run: runWithRows([
        row({
          id: "row:evidence",
          kind: "evidence",
          solver: "artifact_resolver",
          expression: null,
          evidenceRefs: [{ kind: "artifact", path: "artifacts/research/full-solve/run.json" }],
        }),
      ]),
      scope: "all_available",
    });

    expect(solved.rows[0].status).toBe("blocked");
    expect(solved.rows[0].runtimeReceiptV1?.status).toBe("not_run");
    expect(solved.rows[0].runtimeReceiptV1?.claimBoundary.promotionAllowed).toBe(false);
    expect(solved.rows[0].warnings.join(" ")).toMatch(/fail-closed/);
  });

  it("marks valid sweep rows computed without backend runtime execution", () => {
    const sweep = runTheoryScalarSweep({
      expression: "y = x*2",
      graphId: "test-graph",
      targetBadgeIds: ["test.badge"],
      samplePolicy: { kind: "grid" },
      variables: [{ symbol: "x", unit: null, distribution: { kind: "fixed", value: 2 } }],
      generatedAt: "2026-05-29T00:00:00.000Z",
    });
    const solved = runTheoryCompoundRunNow({
      run: runWithRows([
        row({
          id: "row:sweep",
          kind: "sweep",
          solver: "sweep_runner",
          expression: "y = x*2",
          sweepRunV1: sweep,
        }),
      ]),
      scope: "all_available",
    });

    expect(solved.rows[0].status).toBe("computed");
    expect(solved.rows[0].sweepRunV1?.aggregate.mean).toBe(4);
    expect(solved.summary.sweepCount).toBe(1);
    expect(solved.summary.computedCount).toBe(1);
  });

  it("does not turn scalar solve success into gate or runtime success", () => {
    const solved = runTheoryCompoundRunNow({
      run: runWithRows([
        row({
          id: "row:scalar",
          kind: "scalar",
          solver: "scientific_calculator",
          expression: "margin = 2 - 1",
        }),
        row({
          id: "row:gate",
          kind: "gate",
          solver: "gate_evaluator",
          expression: null,
          claimBoundaryNotes: ["Gate requires explicit evidence receipt before any pass language."],
        }),
        row({
          id: "row:runtime",
          kind: "runtime",
          solver: "backend_runtime",
          expression: null,
          claimBoundaryNotes: ["Runtime not executed in scalar solve scope."],
        }),
      ]),
      scope: "scalar_only",
    });

    expect(solved.rows.find((candidate) => candidate.id === "row:scalar")?.status).toBe("solved");
    expect(solved.rows.find((candidate) => candidate.id === "row:gate")?.status).toBe("blocked");
    expect(solved.rows.find((candidate) => candidate.id === "row:runtime")?.status).toBe("pending");
    expect(solved.rows.find((candidate) => candidate.id === "row:gate")?.runtimeReceiptV1).toBeNull();
    expect(solved.rows.find((candidate) => candidate.id === "row:runtime")?.runtimeReceiptV1).toBeNull();
    expect(solved.summary.solvedCount).toBe(1);
    expect(solved.summary.blockedCount).toBe(1);
    expectNoForbiddenClaimText(solved);
  });
});
