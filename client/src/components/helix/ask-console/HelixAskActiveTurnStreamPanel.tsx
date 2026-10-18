import React, { type ReactNode, type RefObject } from "react";

import type {
  HelixContinuousTurnStreamRow,
  HelixContinuousTurnStreamTone,
} from "@/lib/helix/ask-active-turn-stream";
import {
  buildHelixAskConsoleCapabilityLaneSummary,
  formatHelixAskConsoleCapabilityLaneRowChips,
  formatHelixAskConsoleCapabilityLaneRowDetailText,
  formatHelixAskConsoleCapabilityLaneStageDisplayText,
  formatHelixAskConsoleCapabilityLaneSummaryText,
  resolveHelixAskConsoleCapabilityLaneRowDetail,
  resolveHelixAskConsoleCapabilityLaneRowStage,
} from "./HelixAskConsoleDiagnostics";

export type HelixAskActiveTurnStreamPanelProps = {
  rows: HelixContinuousTurnStreamRow[];
  activeTurnId?: string | null;
  activeTraceId?: string | null;
  renderPlacement?: "inline_active_turn" | "pinned_active_lane" | "after_completed_replies";
  showDebugLabel?: boolean;
  panelRef?: RefObject<HTMLDivElement>;
  clipText: (text: string, limit: number) => string;
  renderFinalAnswerContent: (text: string) => ReactNode;
  readRowClass: (tone: HelixContinuousTurnStreamTone) => string;
  readDotClass: (tone: HelixContinuousTurnStreamTone) => string;
};

export function HelixAskActiveTurnStreamPanel({
  rows,
  activeTurnId,
  activeTraceId,
  renderPlacement = "inline_active_turn",
  showDebugLabel = false,
  panelRef,
  clipText,
  renderFinalAnswerContent,
  readRowClass,
  readDotClass,
}: HelixAskActiveTurnStreamPanelProps) {
  if (rows.length === 0) return null;
  const capabilityLaneSummary = buildHelixAskConsoleCapabilityLaneSummary(
    rows
      .map((row) => {
        const stage = resolveHelixAskConsoleCapabilityLaneRowStage(row);
        return stage
          ? { stage, detail: resolveHelixAskConsoleCapabilityLaneRowDetail(row) }
          : null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)),
  );
  const capabilityLaneSummaryText = formatHelixAskConsoleCapabilityLaneSummaryText(capabilityLaneSummary);

  return (
    <div
      ref={panelRef}
      className="relative px-1 py-1 text-xs text-slate-100"
      aria-label="Active turn stream"
      data-testid="helix-ask-active-turn-stream"
      data-turn-stream-lines={rows.length}
      data-active-row-count={rows.length}
      data-active-turn-id={activeTurnId ?? undefined}
      data-active-trace-id={activeTraceId ?? undefined}
      data-render-placement={renderPlacement}
      data-capability-lane-lifecycle={capabilityLaneSummary.lifecycleStatus}
      data-capability-lane-visible-count={capabilityLaneSummary.visibleCount}
      data-capability-lane-requested-count={capabilityLaneSummary.requestedCount}
      data-capability-lane-executed-count={capabilityLaneSummary.executedCount}
      data-capability-lane-backend-selected-count={capabilityLaneSummary.backendSelectedCount}
      data-capability-lane-observed-count={capabilityLaneSummary.observedCount}
      data-capability-lane-receipt-count={capabilityLaneSummary.receiptCount}
      data-capability-lane-reentered-count={capabilityLaneSummary.reenteredCount}
      data-capability-lane-session-count={capabilityLaneSummary.sessionCount}
      data-capability-lane-observed-session-count={capabilityLaneSummary.observedSessionCount}
      data-capability-lane-mail-loop-count={capabilityLaneSummary.mailLoopCount}
      data-capability-lane-observed-mail-loop-count={capabilityLaneSummary.observedMailLoopCount}
      data-capability-lane-mailbox-wake-expected-count={capabilityLaneSummary.mailboxWakeExpectedCount}
      data-capability-lane-decision-wake-expected-count={capabilityLaneSummary.decisionWakeExpectedCount}
      data-capability-lane-goal-binding-count={capabilityLaneSummary.goalBindingCount}
      data-capability-lane-observed-goal-binding-count={capabilityLaneSummary.observedGoalBindingCount}
      data-capability-lane-observed-activity-count={capabilityLaneSummary.observedLaneActivityCount}
      data-capability-lane-goal-dispatch-plan-count={capabilityLaneSummary.goalDispatchPlanCount}
      data-capability-lane-goal-dispatch-admission-count={capabilityLaneSummary.goalDispatchAdmissionCount}
      data-capability-lane-goal-dispatch-readiness-count={capabilityLaneSummary.goalDispatchReadinessCount}
      data-capability-lane-terminal-selected-count={capabilityLaneSummary.terminalSelectedCount}
      data-capability-lane-terminal-rejected-count={capabilityLaneSummary.terminalRejectedCount}
      data-capability-lane-terminal-authority-rejected-count={capabilityLaneSummary.terminalAuthorityRejectedCount}
      data-capability-lane-runtime-providers={
        capabilityLaneSummary.runtimeAgentProviders.length > 0
          ? capabilityLaneSummary.runtimeAgentProviders.join(",")
          : undefined
      }
      data-capability-lane-ids={
        capabilityLaneSummary.laneIds.length > 0 ? capabilityLaneSummary.laneIds.join(",") : undefined
      }
      data-capability-lane-backend-providers={
        capabilityLaneSummary.backendProviders.length > 0
          ? capabilityLaneSummary.backendProviders.join(",")
          : undefined
      }
      data-capability-lane-stage-sequence={capabilityLaneSummary.stageSequenceText || undefined}
      data-capability-lane-visible-does-not-mean-executed="true"
    >
      {showDebugLabel ? (
        <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-cyan-200">Active turn stream</p>
      ) : null}
      {capabilityLaneSummaryText ? (
        <div
          className="mb-2 rounded border border-cyan-300/20 bg-cyan-950/20 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-cyan-100"
          aria-label="Capability lane timeline summary"
          data-testid="helix-ask-capability-lane-summary"
        >
          {capabilityLaneSummaryText}
        </div>
      ) : null}
      <div className="relative space-y-3 before:absolute before:left-[0.72rem] before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-slate-600/45">
        {rows.map((row, index) => {
          const isQuestionRow = row.source === "question";
          const isFinalRow = row.source === "final";
          const capabilityLaneStage = resolveHelixAskConsoleCapabilityLaneRowStage(row);
          const capabilityLaneDetail = capabilityLaneStage
            ? resolveHelixAskConsoleCapabilityLaneRowDetail(row)
            : null;
          const capabilityLaneStageDisplay = capabilityLaneStage
            ? formatHelixAskConsoleCapabilityLaneStageDisplayText(capabilityLaneStage)
            : null;
          const capabilityLaneDetailText = capabilityLaneStage && capabilityLaneDetail
            ? formatHelixAskConsoleCapabilityLaneRowDetailText(capabilityLaneStage, capabilityLaneDetail)
            : null;
          const capabilityLaneChips = capabilityLaneDetail
            ? formatHelixAskConsoleCapabilityLaneRowChips(capabilityLaneDetail)
            : [];
          const rowClass = readRowClass(row.tone);
          const dotClass = readDotClass(row.tone);
          const visibleText = isFinalRow ? row.text : clipText(row.text, row.detailLimit ?? 360);
          const isLatestActiveRow = index === rows.length - 1;
          const sourceBadge = capabilityLaneStage
            ? `lane ${capabilityLaneStage.replace(/_/g, " ")}`
            : isQuestionRow
              ? "user prompt"
              : row.source.replace(/_/g, " ");
          return (
            <div
              key={row.key}
              className={`relative flex items-start gap-3 border-l pl-7 ${rowClass} ${
                isLatestActiveRow ? "helix-ask-turn-line-enter" : ""
              }`}
              data-testid="helix-ask-active-turn-stream-row"
              data-active-latest-line={isLatestActiveRow ? "true" : undefined}
              data-stream-row-source={row.source}
              data-capability-lane-stage={capabilityLaneStage ?? undefined}
              data-capability-lane-stage-display={capabilityLaneStageDisplay ?? undefined}
              data-capability-lane-execution-state={capabilityLaneDetail?.executionState ?? undefined}
              data-capability-lane-normalized-stage={capabilityLaneDetail?.normalizedStage ?? undefined}
              data-capability-lane-state-label={capabilityLaneDetail?.stateLabel ?? undefined}
              data-capability-lane-runtime-provider={capabilityLaneDetail?.selectedRuntimeAgentProvider ?? undefined}
              data-capability-lane-adapter-boundary={capabilityLaneDetail?.adapterBoundary ?? undefined}
              data-capability-lane-id={capabilityLaneDetail?.laneId ?? undefined}
              data-capability-lane-capability-id={capabilityLaneDetail?.capabilityId ?? undefined}
              data-capability-lane-requested-backend-provider={capabilityLaneDetail?.requestedBackendProvider ?? undefined}
              data-capability-lane-backend-provider={capabilityLaneDetail?.selectedBackendProvider ?? undefined}
              data-capability-lane-fallback-backend-provider={capabilityLaneDetail?.fallbackBackendProvider ?? undefined}
              data-capability-lane-backend-selection-reason={capabilityLaneDetail?.backendSelectionReason ?? undefined}
              data-capability-lane-backend-cost-class={capabilityLaneDetail?.backendCostClass ?? undefined}
              data-capability-lane-backend-latency-class={
                capabilityLaneDetail?.backendLatencyClass ?? undefined
              }
              data-capability-lane-backend-privacy-class={
                capabilityLaneDetail?.backendPrivacyClass ?? undefined
              }
              data-capability-lane-observation-ref={capabilityLaneDetail?.observationRef ?? undefined}
              data-capability-lane-receipt-ref={capabilityLaneDetail?.receiptRef ?? undefined}
              data-capability-lane-reentry-status={capabilityLaneDetail?.reentryStatus ?? undefined}
              data-capability-lane-source-id={capabilityLaneDetail?.sourceId ?? undefined}
              data-capability-lane-source-hash={capabilityLaneDetail?.sourceHash ?? undefined}
              data-capability-lane-source-kind={capabilityLaneDetail?.sourceKind ?? undefined}
              data-capability-lane-source-text-hash={capabilityLaneDetail?.sourceTextHash ?? undefined}
              data-capability-lane-source-text-char-count={
                capabilityLaneDetail?.sourceTextCharCount ?? undefined
              }
              data-capability-lane-projection-key={capabilityLaneDetail?.projectionKey ?? undefined}
              data-capability-lane-projection-target={capabilityLaneDetail?.projectionTarget ?? undefined}
              data-capability-lane-account-locale={capabilityLaneDetail?.accountLocale ?? undefined}
              data-capability-lane-target-language={capabilityLaneDetail?.targetLanguage ?? undefined}
              data-capability-lane-chunk-id={capabilityLaneDetail?.chunkId ?? undefined}
              data-capability-lane-chunk-index={capabilityLaneDetail?.chunkIndex ?? undefined}
              data-capability-lane-dedupe-key={capabilityLaneDetail?.dedupeKey ?? undefined}
              data-capability-lane-latest-event-id={capabilityLaneDetail?.latestEventId ?? undefined}
              data-capability-lane-source-event-id={capabilityLaneDetail?.sourceEventId ?? undefined}
              data-capability-lane-source-event-ms={capabilityLaneDetail?.sourceEventMs ?? undefined}
              data-capability-lane-observed-at-ms={capabilityLaneDetail?.observedAtMs ?? undefined}
              data-capability-lane-freshness-status={capabilityLaneDetail?.freshnessStatus ?? undefined}
              data-capability-lane-cancel-requested={capabilityLaneDetail?.cancelRequested ?? undefined}
              data-capability-lane-goal-id={capabilityLaneDetail?.goalId ?? undefined}
              data-capability-lane-goal-binding-id={capabilityLaneDetail?.goalBindingId ?? undefined}
              data-capability-lane-goal-binding-status={capabilityLaneDetail?.bindingStatus ?? undefined}
              data-capability-lane-goal-activation-policy={capabilityLaneDetail?.activationPolicy ?? undefined}
              data-capability-lane-goal-attention-policy={capabilityLaneDetail?.attentionPolicy ?? undefined}
              data-capability-lane-goal-stop-condition={capabilityLaneDetail?.stopCondition ?? undefined}
              data-capability-lane-goal-report-policy={capabilityLaneDetail?.reportPolicy ?? undefined}
              data-capability-lane-goal-quiet-behavior={capabilityLaneDetail?.quietBehavior ?? undefined}
              data-capability-lane-goal-report-action={capabilityLaneDetail?.reportAction ?? undefined}
              data-capability-lane-goal-report-reason={capabilityLaneDetail?.reportReason ?? undefined}
              data-capability-lane-goal-quiet-behavior-applied={
                capabilityLaneDetail?.quietBehaviorApplied ?? undefined
              }
              data-capability-lane-goal-wake-expected={capabilityLaneDetail?.wakeExpected ?? undefined}
              data-capability-lane-goal-mailbox-wake-expected={
                capabilityLaneDetail?.mailboxWakeExpected ?? undefined
              }
              data-capability-lane-goal-decision-wake-expected={
                capabilityLaneDetail?.decisionWakeExpected ?? undefined
              }
              data-capability-lane-goal-surface-badge-expected={
                capabilityLaneDetail?.surfaceBadgeExpected ?? undefined
              }
              data-capability-lane-goal-terminal-report-requested={
                capabilityLaneDetail?.terminalReportRequested ?? undefined
              }
              data-capability-lane-goal-terminal-report-authorized={
                capabilityLaneDetail?.terminalReportAuthorized ?? undefined
              }
              data-capability-lane-session-id={capabilityLaneDetail?.laneSessionId ?? undefined}
              data-capability-lane-session-status={capabilityLaneDetail?.sessionStatus ?? undefined}
              data-capability-lane-session-health={capabilityLaneDetail?.sessionHealth ?? undefined}
              data-capability-lane-session-lifecycle-action={
                capabilityLaneDetail?.sessionLifecycleAction ?? undefined
              }
              data-capability-lane-blocked-reason={capabilityLaneDetail?.blockedReason ?? undefined}
              data-capability-lane-session-control-key={capabilityLaneDetail?.sessionControlKey ?? undefined}
              data-capability-lane-source-binding-key={capabilityLaneDetail?.sourceBindingKey ?? undefined}
              data-capability-lane-latest-source-binding-key={
                capabilityLaneDetail?.latestSourceBindingKey ?? undefined
              }
              data-capability-lane-session-source-binding-key={
                capabilityLaneDetail?.laneSessionSourceBindingKey ?? undefined
              }
              data-capability-lane-session-source-identity-key={
                capabilityLaneDetail?.laneSessionSourceIdentityKey ?? undefined
              }
              data-capability-lane-source-identity-key={capabilityLaneDetail?.sourceIdentityKey ?? undefined}
              data-capability-lane-latest-source-identity-key={
                capabilityLaneDetail?.latestSourceIdentityKey ?? undefined
              }
              data-capability-lane-latest-observation-key={
                capabilityLaneDetail?.latestObservationKey ?? undefined
              }
              data-capability-lane-latest-mail-loop-observation-key={
                capabilityLaneDetail?.latestMailLoopObservationKey ?? undefined
              }
              data-capability-lane-evidence-ref-count={
                capabilityLaneDetail ? String(capabilityLaneDetail.evidenceRefs.length) : undefined
              }
              data-capability-lane-first-evidence-ref={capabilityLaneDetail?.evidenceRefs[0] ?? undefined}
              data-capability-lane-goal-binding-key={capabilityLaneDetail?.goalBindingKey ?? undefined}
              data-capability-lane-stage-play-mail-id={capabilityLaneDetail?.stagePlayMailId ?? undefined}
              data-capability-lane-stage-play-mail-delivery-status={
                capabilityLaneDetail?.stagePlayMailDeliveryStatus ?? undefined
              }
              data-capability-lane-previous-stage-play-mail-id={
                capabilityLaneDetail?.previousStagePlayMailId ?? undefined
              }
              data-capability-lane-mailbox-thread-id={capabilityLaneDetail?.mailboxThreadId ?? undefined}
              data-capability-lane-mail-status={capabilityLaneDetail?.mailStatus ?? undefined}
              data-capability-lane-wake-kind={capabilityLaneDetail?.wakeKind ?? undefined}
              data-capability-lane-materialized-mail-loop-evidence={
                capabilityLaneDetail?.materializedMailLoopEvidence ?? undefined
              }
              data-capability-lane-has-observation={capabilityLaneDetail?.hasObservation ?? undefined}
              data-capability-lane-live-mail-loop-required-count={
                capabilityLaneDetail?.liveMailLoopRequiredCount ?? undefined
              }
              data-capability-lane-terminal-authority-required-count={
                capabilityLaneDetail?.terminalAuthorityRequiredCount ?? undefined
              }
              data-capability-lane-any-live-mail-loop-required={
                capabilityLaneDetail?.anyLiveMailLoopRequired ?? undefined
              }
              data-capability-lane-any-terminal-authority-required={
                capabilityLaneDetail?.anyTerminalAuthorityRequired ?? undefined
              }
              data-capability-lane-visible={capabilityLaneDetail?.laneVisible ?? undefined}
              data-capability-lane-requested={capabilityLaneDetail?.laneRequested ?? undefined}
              data-capability-lane-executed={capabilityLaneDetail?.laneExecuted ?? undefined}
              data-capability-lane-observation-reentered={
                capabilityLaneDetail?.observationReentered ?? undefined
              }
              data-capability-lane-observation-session-id={
                capabilityLaneDetail?.observationLaneSessionId ?? undefined
              }
              data-capability-lane-observation-lane-session-id={
                capabilityLaneDetail?.observationLaneSessionId ?? undefined
              }
              data-capability-lane-report-summary={capabilityLaneDetail?.reportSummaryText ?? undefined}
              data-capability-lane-context-role={capabilityLaneDetail?.contextRole ?? undefined}
              data-capability-lane-answer-authority={capabilityLaneDetail?.answerAuthority ?? undefined}
              data-capability-lane-terminal-eligible={capabilityLaneDetail?.terminalEligible ?? undefined}
              data-capability-lane-assistant-answer={capabilityLaneDetail?.assistantAnswer ?? undefined}
              data-capability-lane-raw-content-included={capabilityLaneDetail?.rawContentIncluded ?? undefined}
              data-capability-lane-terminal-authority-status={
                capabilityLaneDetail?.terminalAuthorityStatus ?? undefined
              }
            >
              {isLatestActiveRow ? (
                <span className="sr-only" data-testid="helix-ask-active-turn-latest-line">
                  Latest active turn line
                </span>
              ) : null}
              <span
                className={`absolute left-0 top-1.5 h-3 w-3 rounded-full border-2 shadow-[0_0_0_3px_rgba(2,6,23,0.9)] ${dotClass}`}
                aria-hidden
              />
              <span className="mt-0.5 min-w-6 text-right text-[10px] tabular-nums text-slate-400">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="break-words font-semibold">{row.label}</p>
                  <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-slate-300">
                    {sourceBadge}
                  </span>
                  {capabilityLaneStageDisplay ? (
                    <span
                      className="rounded border border-cyan-300/20 bg-cyan-950/25 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-cyan-100"
                      title={
                        capabilityLaneStage === "visible"
                          ? "This lane is visible to the runtime; it has not been requested or executed."
                          : undefined
                      }
                    >
                      {capabilityLaneStageDisplay}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 whitespace-pre-wrap break-words leading-relaxed">
                  {isFinalRow ? renderFinalAnswerContent(visibleText) : visibleText}
                </div>
                {capabilityLaneChips.length > 0 ? (
                  <div
                    className="mt-1 flex flex-wrap gap-1"
                    aria-label="Capability lane quick facts"
                    data-testid="helix-ask-capability-lane-row-chips"
                  >
                    {capabilityLaneChips.map((chip) => (
                      <span
                        key={chip}
                        className="rounded border border-cyan-300/20 bg-cyan-950/20 px-1.5 py-0.5 text-[10px] text-cyan-50/85"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                ) : null}
                {capabilityLaneDetailText ? (
                  <p
                    className="mt-1 break-words text-[10px] uppercase tracking-[0.12em] text-cyan-100/80"
                    aria-label="Capability lane row detail"
                    data-testid="helix-ask-capability-lane-row-detail"
                  >
                    {capabilityLaneDetailText}
                  </p>
                ) : null}
                <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-slate-400/80">
                  {row.meta || row.status}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
