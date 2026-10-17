import {
  buildTheoryCompoundRunV1,
  type TheoryCompoundRunRowV1,
  type TheoryCompoundRunV1,
} from "@shared/contracts/theory-compound-run.v1";
import {
  buildTheoryRuntimeReceiptV1,
  type TheoryRuntimeGateStatus,
  type TheoryRuntimeReceiptV1,
} from "@shared/contracts/theory-runtime-receipt.v1";
import { isTheoryRuntimeMathTraceV1 } from "@shared/contracts/theory-runtime-math-trace.v1";
import { isTheorySweepRunV1 } from "@shared/contracts/theory-sweep-run.v1";
import { runScientificSolve } from "@/lib/scientific-calculator/solver";

export type TheoryCompoundRunSolveScope =
  | "scalar_only"
  | "runtime_trace_only"
  | "scalar_and_runtime"
  | "all_available";

export type RunTheoryCompoundRunNowArgs = {
  run: TheoryCompoundRunV1;
  scope: TheoryCompoundRunSolveScope;
  onRow?: (row: TheoryCompoundRunRowV1, run: TheoryCompoundRunV1) => void;
};

const SCALAR_MISSING_EXPRESSION_WARNING = "Scalar row has no expression; calculator solve skipped.";
const RUNTIME_TRACE_MISSING_WARNING = "Runtime trace missing; no backend runtime executed.";
const RUNTIME_TRACE_INVALID_WARNING = "Runtime trace failed validation; no backend runtime executed.";
const STATIC_REFERENCE_TRACE_WARNING = "Static reference trace only; no backend runtime executed.";
const ARTIFACT_BACKED_TRACE_WARNING = "Artifact-backed runtime context; no backend runtime executed during this load.";
const GATE_BLOCKED_WARNING = "Gate row remains blocked until explicit evidence provides a recognized gate status.";
const BOUNDARY_VISIBLE_WARNING = "Boundary row preserved for claim limits; no validation claim is promoted.";
const EVIDENCE_RESOLVER_NOT_RUN_WARNING = "Evidence artifact resolver has not run; evidence status is fail-closed.";
const SWEEP_MISSING_WARNING = "Sweep row has no sweep artifact; scalar sweep not run.";
const SWEEP_INVALID_WARNING = "Sweep artifact failed validation; sweep row remains failed closed.";
const NON_BLOCKING_GATE_STATUSES = new Set<TheoryRuntimeGateStatus>(["pass", "not_applicable"]);

function uniqueWarnings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function includesRuntime(scope: TheoryCompoundRunSolveScope): boolean {
  return scope === "runtime_trace_only" || scope === "scalar_and_runtime" || scope === "all_available";
}

function includesScalar(scope: TheoryCompoundRunSolveScope): boolean {
  return scope === "scalar_only" || scope === "scalar_and_runtime" || scope === "all_available";
}

function rebuildRun(run: TheoryCompoundRunV1, rows: TheoryCompoundRunRowV1[]): TheoryCompoundRunV1 {
  return buildTheoryCompoundRunV1({
    runId: run.runId,
    graphId: run.graphId,
    targetBadgeIds: run.targetBadgeIds,
    source: run.source,
    rows,
    generatedAt: run.generatedAt,
  });
}

function hasBlockingGate(receipt: TheoryRuntimeReceiptV1): boolean {
  return Object.entries(receipt.outputs.gates).some(([key, status]) => {
    if (/claim[_-]?boundary/i.test(key)) return false;
    return !NON_BLOCKING_GATE_STATUSES.has(status);
  });
}

function statusFromRuntimeReceipt(receipt: TheoryRuntimeReceiptV1): TheoryCompoundRunRowV1["status"] {
  if (receipt.status === "failed" || receipt.status === "timeout") return "failed";
  if (receipt.status === "completed" && !hasBlockingGate(receipt)) return "computed";
  return "blocked";
}

function solveScalarRow(row: TheoryCompoundRunRowV1): TheoryCompoundRunRowV1 {
  if (!row.expression?.trim()) {
    return {
      ...row,
      status: "blocked",
      calculatorArtifactV1: null,
      warnings: uniqueWarnings([...row.warnings, SCALAR_MISSING_EXPRESSION_WARNING]),
    };
  }

  const solve = runScientificSolve(row.expression, true);
  const artifactIssues = solve.artifact_v1?.normalization.issues ?? [];
  const solverWarnings = uniqueWarnings([...solve.trace.warnings, ...artifactIssues]);
  return {
    ...row,
    status: solve.ok ? "solved" : "failed",
    calculatorArtifactV1: solve.artifact_v1 ?? null,
    warnings: solve.ok
      ? uniqueWarnings([...row.warnings, ...solverWarnings])
      : uniqueWarnings([...row.warnings, ...solverWarnings, solve.error ?? "calculator solve failed"]),
  };
}

function computeRuntimeTraceRow(row: TheoryCompoundRunRowV1): TheoryCompoundRunRowV1 {
  if (row.runtimeReceiptV1) {
    return {
      ...row,
      status: statusFromRuntimeReceipt(row.runtimeReceiptV1),
      warnings: uniqueWarnings([
        ...row.warnings.filter((warning) => warning !== STATIC_REFERENCE_TRACE_WARNING),
        ...row.runtimeReceiptV1.outputs.warnings,
        row.runtimeReceiptV1.outputs.artifacts.length > 0 ? ARTIFACT_BACKED_TRACE_WARNING : "",
      ]),
    };
  }
  if (!row.runtimeMathTraceV1) {
    return {
      ...row,
      status: "blocked",
      warnings: uniqueWarnings([...row.warnings, RUNTIME_TRACE_MISSING_WARNING]),
    };
  }
  if (!isTheoryRuntimeMathTraceV1(row.runtimeMathTraceV1)) {
    return {
      ...row,
      status: "failed",
      warnings: uniqueWarnings([...row.warnings, RUNTIME_TRACE_INVALID_WARNING]),
    };
  }
  return {
    ...row,
    status: "computed",
    warnings: uniqueWarnings([...row.warnings, STATIC_REFERENCE_TRACE_WARNING]),
  };
}

function updateContextRow(row: TheoryCompoundRunRowV1): TheoryCompoundRunRowV1 {
  if (row.kind === "sweep") {
    if (!row.sweepRunV1) {
      return {
        ...row,
        status: "blocked",
        warnings: uniqueWarnings([...row.warnings, SWEEP_MISSING_WARNING]),
      };
    }
    if (!isTheorySweepRunV1(row.sweepRunV1)) {
      return {
        ...row,
        status: "failed",
        warnings: uniqueWarnings([...row.warnings, SWEEP_INVALID_WARNING]),
      };
    }
    return {
      ...row,
      status: row.sweepRunV1.aggregate.failedCount > 0 ? "blocked" : "computed",
      warnings: uniqueWarnings([
        ...row.warnings,
        ...row.sweepRunV1.samples.flatMap((sample) => sample.warnings),
      ]),
    };
  }
  if (row.kind === "gate") {
    return {
      ...row,
      status: "blocked",
      warnings: uniqueWarnings([...row.warnings, GATE_BLOCKED_WARNING]),
    };
  }
  if (row.kind === "boundary") {
    return {
      ...row,
      status: "skipped",
      warnings: uniqueWarnings([...row.warnings, BOUNDARY_VISIBLE_WARNING]),
    };
  }
  if (row.kind === "evidence") {
    return {
      ...row,
      status: row.runtimeReceiptV1 ? row.status : "blocked",
      runtimeReceiptV1:
        row.runtimeReceiptV1 ??
        buildTheoryRuntimeReceiptV1({
          receiptId: `${row.id}:evidence:not-run`,
          runtimeId: "evidence.artifact_resolver",
          graphId: row.sourcePath.split("/")[2] ?? "unknown-theory-graph",
          badgeIds: [row.badgeId],
          command: null,
          args: {
            sourcePath: row.sourcePath,
            evidenceRefs: row.evidenceRefs ?? [],
          },
          status: "not_run",
          outputs: {
            artifacts: [],
            scalars: {
              evidence_ref_count: row.evidenceRefs?.length ?? 0,
            },
            units: {},
            gates: {},
            missingSignals: ["evidence_artifact_resolver_not_run"],
            warnings: [EVIDENCE_RESOLVER_NOT_RUN_WARNING],
          },
          provenance: {
            gitSha: null,
            startedAt: null,
            completedAt: null,
            durationMs: null,
          },
          claimBoundary: {
            currentTier: "diagnostic",
            maximumTier: "diagnostic",
            promotionAllowed: false,
            promotionBlockedBy: ["evidence_artifact_resolver_not_run"],
          },
        }),
      warnings: uniqueWarnings([...row.warnings, EVIDENCE_RESOLVER_NOT_RUN_WARNING]),
    };
  }
  return row;
}

export function runTheoryCompoundRunNow(args: RunTheoryCompoundRunNowArgs): TheoryCompoundRunV1 {
  let currentRun = args.run;
  const rows = args.run.rows.map((row) => ({ ...row }));

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    let nextRow = row;

    if (row.kind === "scalar" && includesScalar(args.scope)) {
      nextRow = solveScalarRow(row);
    } else if (
      (row.kind === "tensor" || row.kind === "runtime" || row.kind === "reference") &&
      includesRuntime(args.scope)
    ) {
      nextRow = computeRuntimeTraceRow(row);
    } else if (row.kind === "sweep" || row.kind === "gate" || row.kind === "boundary" || row.kind === "evidence") {
      nextRow = updateContextRow(row);
    }

    rows[index] = nextRow;
    currentRun = rebuildRun(currentRun, rows);
    args.onRow?.(nextRow, currentRun);
  }

  return currentRun;
}
