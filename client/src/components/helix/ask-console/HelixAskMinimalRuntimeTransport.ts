import type { HelixAgentRuntimeId } from "@shared/helix-agent-runtime";
import type {
  HelixLanguageModelProfileId,
  HelixLanguageModelSelectionRequest,
} from "@shared/helix-language-model-policy";
import type { HelixRealtimeGroundedFeedbackBindingV1 } from "@shared/contracts/helix-realtime-stage-play.v1";
import type { HelixAskRouteMetadata } from "@/lib/helix/ask-prompt-launch";

import {
  buildHelixAskConsoleBackendTurnPayloadCore,
  buildHelixAskConsoleContextFiles,
} from "./HelixAskRequestEnvelope";
import {
  buildHelixAskHardBackendEntrypointRouteMetadata,
  isConceptualToolExplanationWithoutExecution,
  requiresHelixAskBackendEntrypoint,
} from "./HelixAskBackendEntrypointPolicy";
import type { HelixAskMinimalRuntimeSubmitPlan } from "./HelixAskMinimalRuntimeSubmitPlan";

export type HelixAskMinimalRuntimeTurnPayload = {
  sessionId?: string;
  agentRuntime: HelixAgentRuntimeId;
  agent_runtime: HelixAgentRuntimeId;
  languageModelProfile?: HelixLanguageModelProfileId;
  language_model_profile?: HelixLanguageModelProfileId;
  languageModelSelection?: HelixLanguageModelSelectionRequest;
  language_model_selection?: HelixLanguageModelSelectionRequest;
  traceId: string;
  turnId: string;
  maxTokens: number;
  question: string;
  contextFiles?: string[];
  workspace_context_snapshot?: Record<string, unknown>;
  routeMetadata?: HelixAskRouteMetadata;
  route_metadata?: HelixAskRouteMetadata;
  realtimeGroundedFeedbackBinding?: HelixRealtimeGroundedFeedbackBindingV1;
  realtime_grounded_feedback_binding?: HelixRealtimeGroundedFeedbackBindingV1;
  bypassWorkstationDispatch?: boolean;
  bypass_workstation_dispatch?: boolean;
  forceReasoningDispatch?: boolean;
  force_reasoning_dispatch?: boolean;
  requiresBackendAskEntrypoint?: boolean;
  requires_backend_ask_entrypoint?: boolean;
  suppressWorkstationPayloadActions?: boolean;
  suppress_workstation_payload_actions?: boolean;
  backend_ask_entrypoint_runtime_fingerprint?: Record<string, unknown>;
  client_entrypoint_guard_version?: string;
  submit_handler_source?: string;
  runAsk_entered?: boolean;
  hard_backend_entrypoint_required?: boolean;
  use_backend_ask_turn_entrypoint?: boolean;
  backend_ask_call_attempted?: boolean;
  backend_ask_call_path?: "runAskTurnStream" | "runAskTurn" | "askLocal" | null;
  backend_ask_call_error?: string | null;
  route_metadata_source?: string | null;
  mandatory_next_tool_name?: string | null;
  legacy_ask_local_bypassed?: boolean;
};

export type HelixAskMinimalRuntimeStreamEvent = {
  event: string;
  data: unknown;
};

export type HelixAskMinimalRuntimeTransportResult = {
  text?: string;
  turn_id?: string | null;
  debug?: unknown;
  [key: string]: unknown;
};

export type HelixAskMinimalRuntimeTurnRunner = (
  payload: HelixAskMinimalRuntimeTurnPayload,
  onEvent?: (event: HelixAskMinimalRuntimeStreamEvent) => void,
) => Promise<HelixAskMinimalRuntimeTransportResult>;

export function buildHelixAskMinimalRuntimeTurnPayload(args: {
  submitPlan: HelixAskMinimalRuntimeSubmitPlan;
  sessionId?: string | null;
  traceId: string;
  turnId: string;
  maxTokens: number;
}): HelixAskMinimalRuntimeTurnPayload | null {
  const envelope = args.submitPlan.envelope;
  if (!envelope?.question.trim()) return null;
  const question = envelope.question.trim();
  const conceptualToolExplanationWithoutExecution =
    isConceptualToolExplanationWithoutExecution(question);
  const requiresBackendAskEntrypoint =
    !conceptualToolExplanationWithoutExecution &&
    (args.submitPlan.pendingPrompt?.requiresBackendAskEntrypoint === true ||
      requiresHelixAskBackendEntrypoint(question));
  const routeMetadata =
    conceptualToolExplanationWithoutExecution
      ? undefined
      : args.submitPlan.pendingPrompt?.routeMetadata ??
        (requiresBackendAskEntrypoint
          ? buildHelixAskHardBackendEntrypointRouteMetadata({
              question,
              turnId: args.turnId,
              threadId: args.sessionId ?? args.turnId,
            })
          : undefined);
  const payload = buildHelixAskConsoleBackendTurnPayloadCore({
    sessionId: args.sessionId,
    agentRuntime: envelope.agent_runtime,
    languageModelProfile: envelope.language_model_profile,
    languageModelSelection: envelope.language_model_selection,
    traceId: args.traceId,
    turnId: args.turnId,
    maxTokens: args.maxTokens,
    question,
    contextFiles: buildHelixAskConsoleContextFiles({
      docsViewerAnchorPath: args.submitPlan.context.activeDocPath,
      workspaceContextSnapshot: args.submitPlan.context as unknown as Record<string, unknown>,
    }),
    workspaceContextSnapshot: args.submitPlan.context as unknown as Record<string, unknown>,
    routeMetadata,
    bypassWorkstationDispatch: args.submitPlan.pendingPrompt?.bypassWorkstationDispatch,
    forceReasoningDispatch:
      (!conceptualToolExplanationWithoutExecution && args.submitPlan.pendingPrompt?.forceReasoningDispatch === true) ||
      requiresBackendAskEntrypoint,
    requiresBackendAskEntrypoint,
    suppressWorkstationPayloadActions: args.submitPlan.pendingPrompt?.suppressWorkstationPayloadActions,
  });
  if (!requiresBackendAskEntrypoint) return payload;
  const fingerprint = {
    schema: "helix.ask.backend_entrypoint_runtime_fingerprint.v1",
    client_entrypoint_guard_version: "minimal-runtime:E81",
    submit_handler_source: "HelixAskMinimalRuntimeShell.submitMinimalRuntimeQuestion",
    runAsk_entered: true,
    hard_backend_entrypoint_required: true,
    use_backend_ask_turn_entrypoint: true,
    backend_ask_call_attempted: true,
    backend_ask_call_path: "runAskTurnStream" as const,
    backend_ask_call_error: null,
    route_metadata_source:
      typeof routeMetadata?.source === "string" ? routeMetadata.source : null,
    mandatory_next_tool_name:
      typeof routeMetadata?.mandatory_next_tool?.tool_name === "string"
        ? routeMetadata.mandatory_next_tool.tool_name
        : null,
    legacy_ask_local_bypassed: true,
    assistant_answer: false,
    raw_content_included: false,
  };
  return {
    ...payload,
    backend_ask_entrypoint_runtime_fingerprint: fingerprint,
    client_entrypoint_guard_version: fingerprint.client_entrypoint_guard_version,
    submit_handler_source: fingerprint.submit_handler_source,
    runAsk_entered: fingerprint.runAsk_entered,
    hard_backend_entrypoint_required: fingerprint.hard_backend_entrypoint_required,
    use_backend_ask_turn_entrypoint: fingerprint.use_backend_ask_turn_entrypoint,
    backend_ask_call_attempted: fingerprint.backend_ask_call_attempted,
    backend_ask_call_path: fingerprint.backend_ask_call_path,
    backend_ask_call_error: fingerprint.backend_ask_call_error,
    route_metadata_source: fingerprint.route_metadata_source,
    mandatory_next_tool_name: fingerprint.mandatory_next_tool_name,
    legacy_ask_local_bypassed: fingerprint.legacy_ask_local_bypassed,
  };
}

export async function runHelixAskMinimalRuntimeInjectedTransport(args: {
  runner: HelixAskMinimalRuntimeTurnRunner;
  payload: HelixAskMinimalRuntimeTurnPayload;
  onEvent?: (event: HelixAskMinimalRuntimeStreamEvent) => void;
}): Promise<HelixAskMinimalRuntimeTransportResult> {
  return args.runner(args.payload, args.onEvent);
}
