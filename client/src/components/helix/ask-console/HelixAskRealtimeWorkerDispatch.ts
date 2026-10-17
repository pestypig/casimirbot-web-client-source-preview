import type { HelixAskRouteMetadata } from "@/lib/helix/ask-prompt-launch";
import type { HelixRealtimeWorkerAdmissionV2 } from "@shared/contracts/helix-realtime-worker-dispatch.v2";
import {
  isHelixAgentRuntimeId,
  type HelixAgentRuntimeId,
} from "@shared/helix-agent-runtime";

export const HELIX_ASK_REALTIME_GOAL_WAKE_REQUEST_EVENT =
  "helix-ask:realtime-goal-wake-request" as const;

export type HelixAskRealtimeGoalWakeRequest = {
  goalId: string;
  runtimeGoalSessionRef: string | null;
  runtimeAgentProvider: string | null;
  handoffId: string;
  realtimeSessionId: string;
  realtimeHandoffId: string;
  transcript: string;
  transcriptHash: string | null;
  observationRef: string;
  sourceBinding: Record<string, unknown> | null;
  observedAtMs: number;
};

export type HelixAskRealtimeGoalWakeRequestEventDetail = {
  request: HelixAskRealtimeGoalWakeRequest;
  accepted: boolean;
};

export type HelixAskRealtimeWorkerDispatchResult = {
  kind: HelixRealtimeWorkerAdmissionV2["dispatch"]["kind"];
  state: "skipped_local" | "ask_prompt_launched" | "goal_wake_requested";
  workerTurnDispatched: boolean;
  runtimeGoalWakeRequested: boolean;
};

type RecordLike = Record<string, unknown>;

const readRecord = (value: unknown): RecordLike | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as RecordLike
    : null;

const readString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const DISPATCH_KINDS = new Set([
  "none",
  "ask_runtime",
  "goal_wake",
  "ask_runtime_read_only",
]);

const INTERACTION_MODES = new Set([
  "conversation_local",
  "parallel_conversation",
  "worker_required",
]);

export const parseHelixRealtimeWorkerAdmissionV2 = (input: {
  value: unknown;
  handoffId: string;
  realtimeSessionId: string;
}): HelixRealtimeWorkerAdmissionV2 | null => {
  const admission = readRecord(input.value);
  const dispatch = readRecord(admission?.dispatch);
  const dispatchKind = readString(dispatch?.kind);
  const interactionMode = readString(admission?.interaction_mode);
  if (
    admission?.schema !== "helix.realtime_worker_admission.v2" ||
    admission.handoff_id !== input.handoffId ||
    admission.realtime_session_id !== input.realtimeSessionId ||
    admission.decision_phase !== "transcript_handoff" ||
    !interactionMode ||
    !INTERACTION_MODES.has(interactionMode) ||
    admission.worker_turn_dispatched !== false ||
    admission.workstation_action_execution_allowed !== false ||
    admission.realtime_provider_tool_execution_allowed !== false ||
    admission.answer_authority !== false ||
    admission.assistant_answer !== false ||
    admission.terminal_eligible !== false ||
    admission.raw_content_included !== false ||
    dispatch?.schema !== "helix.realtime_worker_dispatch.v2" ||
    !dispatchKind ||
    !DISPATCH_KINDS.has(dispatchKind) ||
    dispatch.read_only !== true ||
    dispatch.workstation_action_execution_allowed !== false ||
    dispatch.realtime_provider_tool_execution_allowed !== false ||
    dispatch.answer_authority !== false ||
    dispatch.assistant_answer !== false ||
    dispatch.terminal_eligible !== false ||
    dispatch.raw_content_included !== false
  ) {
    return null;
  }
  const targetRuntimeAgentProvider = dispatch?.target_runtime_agent_provider;
  const selectedRuntimeAgentProvider = admission?.selected_runtime_agent_provider;
  if (
    dispatchKind !== "none" &&
    (!isHelixAgentRuntimeId(targetRuntimeAgentProvider) ||
      selectedRuntimeAgentProvider !== targetRuntimeAgentProvider)
  ) {
    return null;
  }
  if (
    (dispatchKind === "none" && (dispatch.requested !== false || dispatch.state !== "not_required")) ||
    (dispatchKind !== "none" && (dispatch.requested !== true || dispatch.state !== "requested")) ||
    (interactionMode === "conversation_local" && dispatchKind !== "none") ||
    (interactionMode === "parallel_conversation" && dispatchKind !== "ask_runtime") ||
    (interactionMode === "worker_required" && dispatchKind === "none") ||
    (dispatchKind === "goal_wake" && !readString(dispatch.goal_id))
  ) {
    return null;
  }
  return admission as unknown as HelixRealtimeWorkerAdmissionV2;
};

export const requestHelixAskRealtimeGoalWake = (
  request: HelixAskRealtimeGoalWakeRequest,
): boolean => {
  if (typeof window === "undefined") return false;
  const detail: HelixAskRealtimeGoalWakeRequestEventDetail = {
    request,
    accepted: false,
  };
  window.dispatchEvent(new CustomEvent(HELIX_ASK_REALTIME_GOAL_WAKE_REQUEST_EVENT, {
    detail,
  }));
  return detail.accepted;
};

export const executeHelixAskRealtimeWorkerDispatch = (input: {
  admission: HelixRealtimeWorkerAdmissionV2;
  transcript: string;
  transcriptHash: string | null;
  observationRef: string;
  observedAtMs: number;
  sourceBinding: Record<string, unknown> | null;
  routeMetadata: HelixAskRouteMetadata;
  launchPrompt: (input: {
    question: string;
    autoSubmit: true;
    bypassWorkstationDispatch: true;
    forceReasoningDispatch: true;
    requiresBackendAskEntrypoint: true;
    suppressWorkstationPayloadActions: true;
    serverAdmittedRuntimeAgentProvider: HelixAgentRuntimeId;
    routeMetadata: HelixAskRouteMetadata;
  }) => void;
  requestGoalWake?: (request: HelixAskRealtimeGoalWakeRequest) => boolean;
}): HelixAskRealtimeWorkerDispatchResult => {
  const dispatch = input.admission.dispatch;
  if (dispatch.kind === "none") {
    return {
      kind: dispatch.kind,
      state: "skipped_local",
      workerTurnDispatched: false,
      runtimeGoalWakeRequested: false,
    };
  }
  if (dispatch.kind === "goal_wake") {
    const goalId = dispatch.goal_id;
    if (!goalId) throw new Error("realtime_goal_wake_binding_missing");
    const accepted = (input.requestGoalWake ?? requestHelixAskRealtimeGoalWake)({
      goalId,
      runtimeGoalSessionRef: dispatch.runtime_goal_session_ref,
      runtimeAgentProvider: dispatch.target_runtime_agent_provider,
      handoffId: input.admission.handoff_id,
      realtimeSessionId: input.admission.realtime_session_id,
      realtimeHandoffId: input.admission.handoff_id,
      transcript: input.transcript,
      transcriptHash: input.transcriptHash,
      observationRef: input.observationRef,
      sourceBinding: input.sourceBinding,
      observedAtMs: input.observedAtMs,
    });
    if (!accepted) throw new Error("realtime_goal_wake_consumer_unavailable");
    return {
      kind: dispatch.kind,
      state: "goal_wake_requested",
      workerTurnDispatched: true,
      runtimeGoalWakeRequested: true,
    };
  }

  const targetRuntimeAgentProvider = dispatch.target_runtime_agent_provider;
  if (!isHelixAgentRuntimeId(targetRuntimeAgentProvider)) {
    throw new Error("realtime_worker_runtime_binding_missing");
  }
  input.launchPrompt({
    question: input.transcript,
    autoSubmit: true,
    bypassWorkstationDispatch: true,
    forceReasoningDispatch: true,
    requiresBackendAskEntrypoint: true,
    suppressWorkstationPayloadActions: true,
    serverAdmittedRuntimeAgentProvider: targetRuntimeAgentProvider,
    routeMetadata: input.routeMetadata,
  });
  return {
    kind: dispatch.kind,
    state: "ask_prompt_launched",
    workerTurnDispatched: true,
    runtimeGoalWakeRequested: false,
  };
};
