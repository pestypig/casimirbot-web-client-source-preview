import {
  buildTheoryBadgePlaybackArtifactV1,
  type TheoryBadgePlaybackArtifactV1,
  type TheoryBadgePlaybackStepV1,
} from "@shared/contracts/theory-badge-playback.v1";
import type {
  TheoryBadgeCalculatorPayloadV1,
  TheoryBadgeGraphV1,
  TheoryBadgeV1,
} from "@shared/contracts/theory-badge-graph.v1";
import { runScientificSolve } from "@/lib/scientific-calculator/solver";
import { useScientificCalculatorStore } from "@/store/useScientificCalculatorStore";
import { resolveTheoryBadgePlaybackPlan } from "./theoryBadgePlaybackPlan";

type PlaybackSource = "panel" | "workstation_action";

function makeRunId() {
  return `theory-playback:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 9)}`;
}

function makeStepId(runId: string, index: number, badgeId: string, payloadId: string | null) {
  const payloadSegment = payloadId ?? "skip";
  return `${runId}:step:${index}:${badgeId}:${payloadSegment}`;
}

function skippedStep(args: {
  runId: string;
  index: number;
  graphId: string;
  badge: TheoryBadgeV1;
  payloadId?: string | null;
  expression?: string | null;
  displayLatex?: string | null;
  skipReason: TheoryBadgePlaybackStepV1["skipReason"];
  warnings?: string[];
}): TheoryBadgePlaybackStepV1 {
  const now = new Date().toISOString();
  const payloadId = args.payloadId ?? null;
  return {
    id: makeStepId(args.runId, args.index, args.badge.id, payloadId),
    index: args.index,
    badgeId: args.badge.id,
    badgeTitle: args.badge.title,
    payloadId,
    expression: args.expression ?? null,
    displayLatex: args.displayLatex ?? null,
    sourcePath: `theory://${args.graphId}/${args.badge.id}/${payloadId ?? "badge"}`,
    status: "skipped",
    skipReason: args.skipReason,
    startedAt: now,
    completedAt: now,
    resultText: null,
    resultLatex: null,
    resultKind: null,
    confidence: null,
    fallbackReason: null,
    calculatorArtifactV1: null,
    warnings: args.warnings ?? [],
  };
}

function runPayloadStep(args: {
  runId: string;
  index: number;
  graphId: string;
  badge: TheoryBadgeV1;
  payload: TheoryBadgeCalculatorPayloadV1;
  source: PlaybackSource;
}): TheoryBadgePlaybackStepV1 {
  const { runId, index, graphId, badge, payload, source } = args;
  const expression = payload.expression?.trim() || payload.displayLatex?.trim() || "";
  const displayLatex = payload.displayLatex?.trim() || expression;
  const sourcePath = `theory://${graphId}/${badge.id}/${payload.id}`;

  if (!expression) {
    return skippedStep({
      runId,
      index,
      graphId,
      badge,
      payloadId: payload.id,
      expression: null,
      displayLatex,
      skipReason: "empty_expression",
      warnings: ["Calculator payload did not include an expression."],
    });
  }

  if (payload.preferredAction === "ingest_latex") {
    useScientificCalculatorStore.getState().ingestLatex(displayLatex, {
      sourcePath,
      anchor: payload.id,
      source,
      calculatorSetup: payload.setupContext ?? null,
    });
    return skippedStep({
      runId,
      index,
      graphId,
      badge,
      payloadId: payload.id,
      expression,
      displayLatex,
      skipReason: "unsupported_payload",
      warnings: ["Payload is configured for ingest only; playback requires a solve action."],
    });
  }

  const startedAt = new Date().toISOString();
  useScientificCalculatorStore.getState().ingestLatex(displayLatex, {
    sourcePath,
    anchor: payload.id,
    source,
    calculatorSetup: payload.setupContext ?? null,
  });

  const solveResult = runScientificSolve(expression, true);
  useScientificCalculatorStore.getState().setSolveResult(solveResult, {
    actionId: payload.preferredAction === "solve_expression" ? "solve_expression" : "solve_with_steps",
    source,
    calculatorSetup: payload.setupContext ?? null,
  });

  const completedAt = new Date().toISOString();
  const warnings = [
    ...solveResult.trace.warnings,
    ...(solveResult.error ? [solveResult.error] : []),
    ...(solveResult.artifact_v1?.normalization.issues ?? []),
  ].filter(Boolean);
  const status: TheoryBadgePlaybackStepV1["status"] =
    solveResult.ok && solveResult.artifact_v1 ? "solved" : "failed";

  return {
    id: makeStepId(runId, index, badge.id, payload.id),
    index,
    badgeId: badge.id,
    badgeTitle: badge.title,
    payloadId: payload.id,
    expression,
    displayLatex,
    sourcePath,
    status,
    skipReason: null,
    startedAt,
    completedAt,
    resultText: solveResult.result_text,
    resultLatex: solveResult.result_latex ?? null,
    resultKind: solveResult.artifact_v1?.result.kind ?? null,
    confidence: solveResult.artifact_v1?.quality.confidence ?? null,
    fallbackReason: solveResult.artifact_v1?.quality.fallbackReason ?? null,
    calculatorArtifactV1: solveResult.artifact_v1 ?? null,
    warnings: status === "failed" && warnings.length === 0 ? ["Calculator solve failed."] : warnings,
  };
}

export function runTheoryBadgePlaybackNow(args: {
  graph: TheoryBadgeGraphV1;
  targetBadgeId: string;
  source?: PlaybackSource;
  onStep?: (step: TheoryBadgePlaybackStepV1) => void;
}): TheoryBadgePlaybackArtifactV1 {
  const { graph, targetBadgeId, onStep } = args;
  const source = args.source ?? "panel";
  const badgesById = new Map<string, TheoryBadgeV1>(
    graph.badges.map((badge: TheoryBadgeV1) => [badge.id, badge]),
  );
  const targetBadge = badgesById.get(targetBadgeId);
  if (!targetBadge) {
    throw new Error(`Theory badge not found: ${targetBadgeId}`);
  }

  const plan = resolveTheoryBadgePlaybackPlan({ graph, targetBadgeId });
  const runId = makeRunId();
  const steps: TheoryBadgePlaybackStepV1[] = [];
  let index = 1;

  for (const badgeId of plan.orderedBadgeIds) {
    const badge = badgesById.get(badgeId);
    if (!badge) continue;
    const payloads = badge.calculatorPayloads ?? [];
    if (payloads.length === 0) {
      const step = skippedStep({
        runId,
        index,
        graphId: graph.graphId,
        badge,
        skipReason: "no_calculator_payload",
      });
      steps.push(step);
      onStep?.(step);
      index += 1;
      continue;
    }

    for (const payload of payloads) {
      const step = runPayloadStep({
        runId,
        index,
        graphId: graph.graphId,
        badge,
        payload,
        source,
      });
      steps.push(step);
      onStep?.(step);
      index += 1;
    }
  }

  return buildTheoryBadgePlaybackArtifactV1({
    runId,
    graphId: graph.graphId,
    targetBadgeId,
    targetBadgeTitle: targetBadge.title,
    plan: {
      mode: "dependency_closure",
      orderedBadgeIds: plan.orderedBadgeIds,
      executableRelationTypes: plan.executableRelationTypes,
      skippedRelationTypes: plan.skippedRelationTypes,
    },
    steps,
  });
}

export function formatTheoryBadgePlaybackMarkdown(run: TheoryBadgePlaybackArtifactV1): string {
  const lines = [
    "# Theory Badge Playback",
    "",
    `Target: ${run.targetBadgeTitle}`,
    `Run: ${run.runId}`,
    "",
    "## Summary",
    "",
    `- Badges: ${run.summary.badgeCount}`,
    `- Payloads: ${run.summary.payloadCount}`,
    `- Solved: ${run.summary.solvedCount}`,
    `- Skipped: ${run.summary.skippedCount}`,
    `- Failed: ${run.summary.failedCount}`,
    "",
    "## Steps",
    "",
  ];

  for (const step of run.steps) {
    lines.push(`${step.index}. ${step.badgeTitle}`);
    if (step.status === "skipped") {
      lines.push(`   - skipped: ${step.skipReason ?? "unknown"}`);
    } else {
      lines.push(`   - status: ${step.status}`);
      if (step.expression) lines.push(`   - expression: ${step.expression}`);
      if (step.resultKind) lines.push(`   - result kind: ${step.resultKind}`);
      if (step.confidence !== null) lines.push(`   - confidence: ${step.confidence}`);
      if (step.fallbackReason) lines.push(`   - fallback reason: ${step.fallbackReason}`);
      if (step.resultText) lines.push(`   - result: ${step.resultText}`);
    }
    if (step.warnings.length > 0) {
      lines.push(`   - warnings: ${step.warnings.join("; ")}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}
