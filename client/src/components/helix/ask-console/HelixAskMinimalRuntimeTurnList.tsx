import React, { useState } from "react";
import type { HelixAgentRuntimeDescriptor } from "@shared/helix-agent-runtime";
import {
  DEFAULT_HELIX_AGENT_RUNTIME_PROVIDERS,
  resolveHelixAskActualAgentProviderLabel,
  resolveHelixAskModelUsageLabel,
} from "@/lib/helix/ask-agent-runtime-display";
import {
  buildHelixAskRuntimeTurnSummary,
  type HelixAskRuntimeTurnSummaryRow,
} from "@/lib/helix/ask-runtime-turn-summary";
import { buildHelixTurnTranscriptRows } from "@/lib/helix/ask-turn-transcript";

import { HelixAskFinalAnswer } from "./HelixAskFinalAnswer";
import {
  buildHelixAskMinimalRuntimeControlPayload,
  HELIX_ASK_MINIMAL_RUNTIME_BROWSER_CONTROL_ACTIONS,
  type HelixAskMinimalRuntimeControlActions,
} from "./HelixAskMinimalRuntimeControls";
import type { HelixAskMinimalRuntimeReply } from "./HelixAskMinimalRuntimeLifecycle";
import { HelixAskReplyCard } from "./HelixAskReplyCard";
import { mergeHelixAskRuntimeGoalDebugFields } from "./HelixAskRuntimeGoalDebugContext";
import { HelixAskTurnList } from "./HelixAskTurnList";
import { HelixAskTurnControls } from "./HelixAskTurnControls";
import {
  HELIX_ASK_DEFAULT_RENDERED_TURN_COUNT,
  HELIX_ASK_RENDERED_TURN_REVEAL_STEP,
  HelixAskTurnHistoryWindowControl,
  selectHelixAskTurnHistoryWindow,
} from "./HelixAskTurnHistoryWindow";
import { selectHelixAskConsoleWorkstationTraceRows } from "./HelixAskWorkstationTraceRows";

export type HelixAskMinimalRuntimeTurnView = {
  id: string;
  turnId: string;
  question: string;
  answerText: string;
  meta: string | null;
  isLatest: boolean;
  runtimeSummaryRows: HelixAskRuntimeTurnSummaryRow[];
  runtimeGoalDebugSummary: Record<string, unknown> | null;
  workstationTraceRows: Array<{
    key: string;
    label: string;
    text: string;
    meta: string;
    status: string;
  }>;
};

export type HelixAskMinimalRuntimeTurnListProps = {
  replies: HelixAskMinimalRuntimeReply[];
  className: string;
  providers?: HelixAgentRuntimeDescriptor[];
  controlActions?: HelixAskMinimalRuntimeControlActions;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function buildHelixAskMinimalRuntimeTurnViews(args: {
  replies: HelixAskMinimalRuntimeReply[];
  providers?: HelixAgentRuntimeDescriptor[];
}): HelixAskMinimalRuntimeTurnView[] {
  const providers = args.providers ?? DEFAULT_HELIX_AGENT_RUNTIME_PROVIDERS;
  const latestReply = args.replies[args.replies.length - 1] ?? null;
  return args.replies.map((reply) => {
    const projectionSource = reply.result ?? reply;
    const providerLabel = resolveHelixAskActualAgentProviderLabel(projectionSource, providers);
    const modelLabel = resolveHelixAskModelUsageLabel(projectionSource);
    const resultRecord = asRecord(reply.result);
    const resultDebugRecord = asRecord(resultRecord?.debug);
    const transcriptDebugSource = resultRecord
      ? { ...resultRecord, ...(resultDebugRecord ?? {}) }
      : reply.debug ?? null;
    const workstationTraceRows = selectHelixAskConsoleWorkstationTraceRows(
      buildHelixTurnTranscriptRows({
        id: reply.id,
        turn_id: reply.turn_id,
        content: reply.content,
        debug: transcriptDebugSource,
      }),
    ).map((row) => ({
      key: row.key,
      label: row.label,
      text: row.text,
      meta: row.meta,
      status: row.status,
    }));
    const runtimeSummary = buildHelixAskRuntimeTurnSummary(projectionSource, providers);
    const runtimeGoalDebugSummary = mergeHelixAskRuntimeGoalDebugFields(
      asRecord(resultRecord?.debug) ?? asRecord(reply.debug),
      resultRecord ?? asRecord(reply),
    ).runtime_goal_debug_summary;
    return {
      id: reply.id,
      turnId: reply.turn_id,
      question: reply.question,
      answerText: reply.content,
      meta: [providerLabel, modelLabel].filter(Boolean).join(" | ") || null,
      isLatest: latestReply?.turn_id === reply.turn_id,
      runtimeSummaryRows: runtimeSummary?.rows ?? [],
      runtimeGoalDebugSummary,
      workstationTraceRows,
    };
  });
}

export function HelixAskMinimalRuntimeTurnList({
  replies,
  className,
  providers = DEFAULT_HELIX_AGENT_RUNTIME_PROVIDERS,
  controlActions = HELIX_ASK_MINIMAL_RUNTIME_BROWSER_CONTROL_ACTIONS,
}: HelixAskMinimalRuntimeTurnListProps) {
  const [renderedTurnLimit, setRenderedTurnLimit] = useState(HELIX_ASK_DEFAULT_RENDERED_TURN_COUNT);
  const renderedTurnWindow = selectHelixAskTurnHistoryWindow({
    replies,
    requestedVisibleCount: renderedTurnLimit,
  });
  const views = buildHelixAskMinimalRuntimeTurnViews({
    replies: renderedTurnWindow.visibleReplies,
    providers,
  });
  if (views.length === 0) return null;
  const postulateEvidenceText = views
    .slice(-8)
    .map((view) => [`Turn ${view.turnId}:`, view.question, view.answerText].filter(Boolean).join("\n"))
    .join("\n\n");

  return (
    <HelixAskTurnList className={className}>
      <HelixAskTurnHistoryWindowControl
        hiddenCount={renderedTurnWindow.hiddenCount}
        visibleCount={renderedTurnWindow.visibleCount}
        totalCount={renderedTurnWindow.totalCount}
        onRevealOlder={() =>
          setRenderedTurnLimit((current) => current + HELIX_ASK_RENDERED_TURN_REVEAL_STEP)
        }
      />
      {views.map((view, index) => {
        const reply = renderedTurnWindow.visibleReplies[index];
        if (!reply) return null;
        const payload = buildHelixAskMinimalRuntimeControlPayload({ reply, view });
        return (
          <HelixAskReplyCard
            key={view.turnId}
            turnTestId={view.isLatest ? "helix-ask-minimal-runtime-latest-turn" : undefined}
            isLatestReply={view.isLatest}
            tintClassName="rounded-2xl bg-cyan-400/10"
            runtimeGoalDebugSummary={view.runtimeGoalDebugSummary}
            promptIngested
          >
            <article className="rounded-2xl border border-cyan-300/15 bg-black/20 px-3 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-200/80">
                Prompt
              </p>
              <p className="mt-1 break-words text-xs text-slate-300 [overflow-wrap:anywhere]">
                {view.question}
              </p>
              {view.runtimeSummaryRows.length > 0 ? (
                <div
                  className="mt-3 rounded-lg border border-cyan-300/15 bg-cyan-950/15 px-2.5 py-2 text-xs text-slate-200"
                  data-testid={view.isLatest ? "helix-ask-minimal-runtime-provider-summary" : undefined}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200">
                      Runtime trace
                    </p>
                    <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-slate-400">
                      provider/lane/terminal
                    </span>
                  </div>
                  <dl className="mt-2 space-y-1.5">
                    {view.runtimeSummaryRows.map((row) => (
                      <div key={row.key} className="grid gap-1 sm:grid-cols-[8rem_minmax(0,1fr)]">
                        <dt className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                          {row.label}
                        </dt>
                        <dd className="break-words text-slate-200 [overflow-wrap:anywhere]">
                          {row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}
              {view.workstationTraceRows.length > 0 ? (
                <div
                  className="mt-3 space-y-2"
                  data-testid={view.isLatest ? "helix-ask-minimal-runtime-workstation-trace" : undefined}
                >
                  {view.workstationTraceRows.map((row) => (
                    <div
                      key={row.key}
                      className="rounded-lg border border-cyan-300/10 bg-cyan-300/5 px-2 py-2 text-xs text-slate-200"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{row.label}</p>
                        <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-slate-400">
                          {row.status}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                        {row.text}
                      </p>
                      {row.meta ? (
                        <p className="mt-1 break-words text-[10px] uppercase tracking-[0.12em] text-slate-500">
                          {row.meta}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              <HelixAskFinalAnswer text={view.answerText} meta={view.meta} />
              {view.isLatest ? (
                <HelixAskTurnControls
                  onCopyFinal={() => void controlActions.copyFinal(payload)}
                  onDebugCopy={() => void controlActions.debugCopy(payload)}
                  onReadAloud={() => void controlActions.readAloud(payload)}
                  copyFinalTestId="helix-ask-latest-copy-final"
                  debugCopyTestId="helix-ask-latest-debug-copy"
                  readAloudTestId="helix-ask-latest-read-aloud"
                  postulateText={view.answerText}
                  postulateEvidenceText={postulateEvidenceText}
                  postulateTestId="helix-ask-postulate"
                  postulateOriginatingSessionId={view.turnId}
                  postulateOriginatingAnswerId={view.id}
                />
              ) : null}
            </article>
          </HelixAskReplyCard>
        );
      })}
    </HelixAskTurnList>
  );
}
