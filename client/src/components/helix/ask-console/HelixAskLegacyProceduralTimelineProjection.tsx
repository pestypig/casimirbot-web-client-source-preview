import React, { type ReactNode } from "react";

import { readAgentLoopAuditArray, readAgentLoopAuditRecord } from "@/lib/helix/ask-runtime-authority-readers";
import {
  buildVisibleResolvedTurn,
  readHelixTopLevelPendingServerRequest,
  type HelixAskTerminalProjectionReply,
} from "@/lib/helix/ask-terminal-projection";
import { clipText } from "@/lib/helix/ask-value-normalization";
import { readProceduralActionLabel } from "@/lib/helix/ask-procedural-display";
import { shouldShowHelixRuntimeStopReason } from "@/lib/helix/resolveHelixVisibleTerminal";

import { type HelixAskProceduralTimelineRow } from "./HelixAskProceduralTimeline";
import { HelixAskLegacyProceduralTimelineSlot } from "./HelixAskLegacyProceduralTimelineSlot";

export type HelixAskLegacyProceduralTimelineReply = HelixAskTerminalProjectionReply & {
  content?: string;
  debug?: Record<string, unknown> | null;
};

export type HelixAskLegacyProceduralTimelineProjectionOptions = {
  resolveVisibleTerminalKind: (args: {
    reply?: HelixAskLegacyProceduralTimelineReply | null;
    terminal?: Record<string, unknown> | null;
    fallback?: string;
    extraSources?: unknown[];
  }) => string;
};

const buildRuntimeBudgetSummary = (limits: Record<string, unknown> | null): string | null => {
  if (!limits) return null;
  const fields: Array<[string, unknown]> = [
    ["status", limits.budget_status],
    ["turn_timeout_ms", limits.turn_timeout_ms],
    ["process_timeout_ms", limits.process_timeout_ms],
    ["output_max_bytes", limits.process_output_max_bytes],
    ["protocol_max_bytes", limits.protocol_max_bytes],
    ["continuation_steps", limits.continuation_step_limit],
    ["max_iterations", limits.max_iterations],
    ["max_tool_calls", limits.max_tool_calls],
    ["max_model_decisions", limits.max_llm_decisions],
    ["hard_max_iterations", limits.hard_max_iterations],
    ["hard_max_tool_calls", limits.hard_max_tool_calls],
    ["hard_max_model_decisions", limits.hard_max_llm_decisions],
    ["exhaustion", limits.exhaustion_reason],
  ];
  const parts = fields
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([label, value]) => `${label}=${String(value)}`);
  if (limits.continuation_step_limit === null && limits.continuation_step_limit_applies === false) {
    parts.push("continuation_steps=no Helix-imposed step cap");
  }
  if (limits.runtime_started === false) parts.push("runtime_started=false");
  if (limits.model_loop_started === false) parts.push("model_loop_started=false");
  return parts.length > 0 ? parts.join(" | ") : null;
};

const buildModelPolicySummary = (policy: Record<string, unknown> | null): string | null => {
  if (!policy) return null;
  const parts = [
    typeof policy.effective_model === "string" && policy.effective_model
      ? `model=${policy.effective_model}`
      : null,
    typeof policy.effective_reasoning_effort === "string" && policy.effective_reasoning_effort
      ? `reasoning=${policy.effective_reasoning_effort}`
      : null,
    typeof policy.source === "string" && policy.source ? `source=${policy.source}` : null,
  ].filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(" | ") : null;
};

export function renderHelixAskLegacyProceduralTimeline(
  reply: HelixAskLegacyProceduralTimelineReply,
  options: HelixAskLegacyProceduralTimelineProjectionOptions,
): ReactNode {
  const replyRecord = readAgentLoopAuditRecord(reply);
  const truthTable = readAgentLoopAuditRecord(reply.debug?.turn_truth_table);
  const plannerContract = readAgentLoopAuditRecord(reply.debug?.planner_contract);
  const runtimeSummary = readAgentLoopAuditRecord(reply.debug?.turn_runtime);
  const agentLoopAudit = readAgentLoopAuditRecord(reply.debug?.agent_loop_audit);
  const uiDebugParityHarness = readAgentLoopAuditRecord(
    replyRecord?.ui_debug_parity_harness ?? reply.debug?.ui_debug_parity_harness,
  );
  const agentRuntimeLoop = readAgentLoopAuditRecord(
    replyRecord?.agent_runtime_loop ?? reply.debug?.agent_runtime_loop,
  );
  const runtimeIterations = readAgentLoopAuditArray(agentRuntimeLoop?.iterations);
  const planItems = readAgentLoopAuditArray(truthTable?.plan_items ?? plannerContract?.plan_items);
  const observations = readAgentLoopAuditArray(truthTable?.runtime_observations ?? runtimeSummary?.observations);
  const appendedSteps = readAgentLoopAuditArray(runtimeSummary?.appended_steps);
  const terminal = readAgentLoopAuditRecord(truthTable?.terminal ?? runtimeSummary?.terminal);
  const selectedTool = readAgentLoopAuditRecord(truthTable?.selected_tool ?? agentLoopAudit?.selected_action);
  const visibleResolvedTurn = buildVisibleResolvedTurn(reply);
  const route = visibleResolvedTurn.primary_route_label;
  const solverController = readAgentLoopAuditRecord(
    replyRecord?.solver_controller_decision ?? reply.debug?.solver_controller_decision,
  );
  const runtimeStopReason =
    typeof agentRuntimeLoop?.stop_reason === "string" ? agentRuntimeLoop.stop_reason.trim() : "";
  const runtimePathIdentity = readAgentLoopAuditRecord(
    replyRecord?.runtime_path_identity ?? reply.debug?.runtime_path_identity,
  );
  const publicLifecycleProjection = readAgentLoopAuditRecord(
    replyRecord?.public_lifecycle_projection ?? reply.debug?.public_lifecycle_projection,
  );
  const publicLifecyclePresentation = readAgentLoopAuditRecord(publicLifecycleProjection?.presentation);
  const turnTranscriptEvents = readAgentLoopAuditArray(
    replyRecord?.turn_transcript_events ?? reply.debug?.turn_transcript_events,
  );
  const runtimeDowngrade = readAgentLoopAuditRecord(runtimePathIdentity?.downgrade);
  const runtimeLimits = readAgentLoopAuditRecord(runtimePathIdentity?.runtime_limits);
  const runtimeModelPolicy = readAgentLoopAuditRecord(runtimePathIdentity?.model_policy);
  const visibleAnswer =
    typeof truthTable?.visible_answer_text === "string"
      ? truthTable.visible_answer_text
      : typeof reply.content === "string"
        ? reply.content
        : "";
  const terminalText = typeof terminal?.text === "string" ? terminal.text : "";
  const parityMatchesVisible =
    typeof uiDebugParityHarness?.ui_answer_equals_terminal_authority_text === "boolean"
      ? uiDebugParityHarness.ui_answer_equals_terminal_authority_text
      : typeof uiDebugParityHarness?.ui_answer_equals_selected_final_answer === "boolean"
        ? uiDebugParityHarness.ui_answer_equals_selected_final_answer
        : null;
  const truthMatchesVisible =
    parityMatchesVisible ??
    Boolean(terminalText && visibleAnswer && terminalText.trim() === visibleAnswer.trim());
  const pendingInput =
    visibleResolvedTurn.primary_terminal_label === "pending_input" && visibleResolvedTurn.pending_server_request_present
      ? readHelixTopLevelPendingServerRequest(reply)
      : null;
  const visibleTerminalKind = options.resolveVisibleTerminalKind({
    reply,
    terminal,
    fallback: "final_answer",
    extraSources: [truthTable, runtimeSummary, agentLoopAudit],
  });
  const showRuntimeStopReason = shouldShowHelixRuntimeStopReason({
    stopReason: runtimeStopReason,
    finalStatus: replyRecord?.final_status ?? reply.debug?.final_status,
    terminalErrorCode: visibleResolvedTurn.terminal_error_code,
    solverDecision: solverController?.decision,
    terminalKind: visibleTerminalKind,
  });

  if (
    turnTranscriptEvents.length === 0 &&
    !truthTable &&
    runtimeIterations.length === 0 &&
    planItems.length === 0 &&
    observations.length === 0 &&
    !terminal
  ) {
    return null;
  }

  const rows: HelixAskProceduralTimelineRow[] = [];
  const runtimeActionLabels: string[] = [];

  turnTranscriptEvents.forEach((item, index) => {
    const event = readAgentLoopAuditRecord(item);
    const label = String(event?.text ?? event?.type ?? event?.source_event_type ?? "Lifecycle event");
    rows.push({
      key: typeof event?.id === "string" && event.id.trim() ? event.id : `transcript-${index}`,
      label: `${String(event?.type ?? event?.source_event_type ?? "event")}: ${clipText(label, 120)}`,
      detail: clipText(String(event?.detail ?? event?.lane ?? event?.event_source ?? "public lifecycle"), 180),
      status: String(event?.status ?? "completed"),
    });
  });

  (turnTranscriptEvents.length === 0 ? runtimeIterations : []).forEach((item, index) => {
    const record = readAgentLoopAuditRecord(item);
    const chosenCapability = typeof record?.chosen_capability === "string" ? record.chosen_capability.trim() : "";
    const executedAction = typeof record?.executed_action_key === "string" ? record.executed_action_key.trim() : "";
    const actionLabel = executedAction || chosenCapability || String(record?.next_step ?? "model step");
    const authority = String(record?.decision_authority ?? record?.decision_source ?? "unknown");
    const producedArtifacts = Array.isArray(record?.produced_artifacts)
      ? (record.produced_artifacts as unknown[]).map((entry) => String(entry)).filter(Boolean).join(", ")
      : "";
    if (executedAction || chosenCapability) runtimeActionLabels.push(executedAction || chosenCapability);
    rows.push({
      key: `runtime-${index}`,
      label: `Runtime ${String(record?.iteration ?? index + 1)}: ${String(record?.next_step ?? "step")}`,
      detail: `${authority}: ${actionLabel}${producedArtifacts ? ` -> ${producedArtifacts}` : ""}`,
      status:
        record?.observation_role === "tool_error" || record?.status === "failed"
          ? "failed"
          : record?.next_step === "ask_user"
            ? "pending_input"
            : "completed",
    });
  });

  if (turnTranscriptEvents.length === 0 && runtimeIterations.length === 0) {
    planItems.forEach((item, index) => {
      const record = readAgentLoopAuditRecord(item);
      const actionLabel = readProceduralActionLabel(record?.action);
      const lane = String(record?.lane ?? "step");
      rows.push({
        key: `plan-${index}`,
        label: `Plan ${index + 1}: ${lane}`,
        detail: actionLabel !== "model step" ? actionLabel : clipText(String(record?.title ?? record?.id ?? "planned step"), 140),
        status: String(record?.status ?? "planned"),
      });
    });
  }

  (turnTranscriptEvents.length === 0 ? appendedSteps : []).forEach((item, index) => {
    const record = readAgentLoopAuditRecord(item);
    rows.push({
      key: `append-${index}`,
      label: `Appended step: ${String(record?.step_id ?? "next_step")}`,
      detail: `because ${String(record?.reason ?? "the previous observation needed another tool")}`,
      status: "running",
    });
  });

  (turnTranscriptEvents.length === 0 ? observations : []).forEach((item, index) => {
    const record = readAgentLoopAuditRecord(item);
    const artifact = readAgentLoopAuditRecord(record?.artifact);
    const actionLabel = readProceduralActionLabel(artifact);
    const actualArtifacts = Array.isArray(record?.actual_artifacts)
      ? (record?.actual_artifacts as unknown[]).map((entry) => String(entry)).filter(Boolean).join(", ")
      : "";
    const blockedArtifacts = Array.isArray(record?.blocked_missing_artifacts)
      ? (record?.blocked_missing_artifacts as unknown[]).map((entry) => String(entry)).filter(Boolean).join(", ")
      : "";
    const detail =
      blockedArtifacts
        ? `blocked: missing ${blockedArtifacts}`
        : actualArtifacts
          ? `observed: ${actualArtifacts}`
          : actionLabel !== "model step"
            ? actionLabel
            : String(record?.step_id ?? "observation");
    rows.push({
      key: `observe-${index}`,
      label: `Observed: ${String(record?.step_id ?? "step")}`,
      detail,
      status: String(record?.status ?? "completed"),
    });
  });

  if (turnTranscriptEvents.length === 0 && terminal) {
    rows.push({
      key: "terminal",
      label: `Terminal: ${visibleTerminalKind}`,
      detail: clipText(
        String(
          pendingInput?.prompt ??
            pendingInput?.text ??
            terminal.text ??
            visibleAnswer ??
            "turn completed",
        ),
        160,
      ),
      status:
        visibleTerminalKind === "pending_input"
          ? "pending_input"
          : visibleTerminalKind === "canceled"
            ? "canceled"
            : "completed",
    });
  }

  return (
    <HelixAskLegacyProceduralTimelineSlot
      rows={rows}
      truthMatchesVisible={truthMatchesVisible}
      route={route}
      toolLabel={runtimeActionLabels[0] ?? (selectedTool ? readProceduralActionLabel(selectedTool) : null)}
      runtimeStopReason={showRuntimeStopReason ? runtimeStopReason : null}
      runtimePath={typeof runtimePathIdentity?.actual_path === "string" ? runtimePathIdentity.actual_path : null}
      apiTransport={
        typeof runtimePathIdentity?.api_transport === "string" ? runtimePathIdentity.api_transport : null
      }
      defaultVisibleLimit={
        typeof publicLifecyclePresentation?.default_visible_limit === "number"
          ? publicLifecyclePresentation.default_visible_limit
          : null
      }
      runtimeBudgetSummary={buildRuntimeBudgetSummary(runtimeLimits)}
      modelPolicySummary={buildModelPolicySummary(runtimeModelPolicy)}
      runtimeDowngradeReason={
        runtimeDowngrade?.occurred === true && typeof runtimeDowngrade.reason_code === "string"
          ? runtimeDowngrade.reason_code
          : null
      }
    />
  );
}
