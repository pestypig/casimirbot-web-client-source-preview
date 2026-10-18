import type { HelixAgentRuntimeId } from "@shared/helix-agent-runtime";
import type {
  HelixLanguageModelProfileId,
  HelixLanguageModelSelectionRequest,
} from "@shared/helix-language-model-policy";
import type { HelixAskRouteMetadata } from "@/lib/helix/ask-prompt-launch";
import type { HelixAskContextBridgeSnapshot } from "./HelixAskContextBridge";
import { readHelixAskRealtimeGroundedFeedbackBinding } from "./HelixAskRealtimeGroundedFeedbackBinding";

export type HelixAskConsoleRequestEnvelope = {
  question: string;
  agentRuntime: HelixAgentRuntimeId;
  agent_runtime: HelixAgentRuntimeId;
  languageModelProfile?: HelixLanguageModelProfileId;
  language_model_profile?: HelixLanguageModelProfileId;
  languageModelSelection?: HelixLanguageModelSelectionRequest;
  language_model_selection?: HelixLanguageModelSelectionRequest;
  doc_path?: string;
};

function coerceText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return String(value);
  } catch {
    return "";
  }
}

function normalizeAskConsoleDocPath(value: unknown): string {
  const text = coerceText(value).trim();
  if (!text) return "";
  return text.replace(/\\/g, "/").replace(/^workspace:\/\//i, "").replace(/^\/+/, "");
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function buildHelixAskConsoleContextFiles(args: {
  docsViewerAnchorPath?: string | null;
  workspaceContextSnapshot?: Record<string, unknown> | null;
}): string[] | undefined {
  const candidates = [
    args.docsViewerAnchorPath,
    args.workspaceContextSnapshot?.activeDocPath,
    args.workspaceContextSnapshot?.active_doc_path,
    args.workspaceContextSnapshot?.docContextPath,
    args.workspaceContextSnapshot?.doc_context_path,
  ]
    .map(normalizeAskConsoleDocPath)
    .filter(Boolean);
  const unique = dedupeStrings(candidates);
  return unique.length > 0 ? unique : undefined;
}

export function buildHelixAskConsoleRequestEnvelope(args: {
  question: string;
  agentRuntime: HelixAgentRuntimeId;
  languageModelProfile?: HelixLanguageModelProfileId;
  languageModelSelection?: HelixLanguageModelSelectionRequest;
  context: HelixAskContextBridgeSnapshot;
}): HelixAskConsoleRequestEnvelope {
  const envelope: HelixAskConsoleRequestEnvelope = {
    question: args.question,
    agentRuntime: args.agentRuntime,
    agent_runtime: args.agentRuntime,
  };
  if (args.languageModelProfile) {
    envelope.languageModelProfile = args.languageModelProfile;
    envelope.language_model_profile = args.languageModelProfile;
  }
  if (args.languageModelSelection) {
    envelope.languageModelSelection = args.languageModelSelection;
    envelope.language_model_selection = args.languageModelSelection;
  }
  if (args.context.activeDocPath) envelope.doc_path = args.context.activeDocPath;
  return envelope;
}

export function buildHelixAskConsoleBackendTurnPayloadCore(args: {
  sessionId?: string | null;
  agentRuntime: HelixAgentRuntimeId;
  languageModelProfile?: HelixLanguageModelProfileId;
  languageModelSelection?: HelixLanguageModelSelectionRequest;
  traceId: string;
  turnId: string;
  maxTokens: number;
  question: string;
  contextFiles?: string[];
  docPath?: string | null;
  workspaceContextSnapshot?: Record<string, unknown> | null;
  routeMetadata?: HelixAskRouteMetadata | null;
  bypassWorkstationDispatch?: boolean;
  forceReasoningDispatch?: boolean;
  requiresBackendAskEntrypoint?: boolean;
  suppressWorkstationPayloadActions?: boolean;
}) {
  const activeDocPath =
    normalizeAskConsoleDocPath(args.docPath) ||
    normalizeAskConsoleDocPath(args.contextFiles?.[0]);
  const realtimeGroundedFeedbackBinding =
    readHelixAskRealtimeGroundedFeedbackBinding(args.routeMetadata);
  return {
    sessionId: args.sessionId ?? undefined,
    agentRuntime: args.agentRuntime,
    agent_runtime: args.agentRuntime,
    ...(args.languageModelProfile
      ? {
          languageModelProfile: args.languageModelProfile,
          language_model_profile: args.languageModelProfile,
        }
      : {}),
    ...(args.languageModelSelection
      ? {
          languageModelSelection: args.languageModelSelection,
          language_model_selection: args.languageModelSelection,
        }
      : {}),
    traceId: args.traceId,
    turnId: args.turnId,
    maxTokens: args.maxTokens,
    question: args.question,
    ...(args.workspaceContextSnapshot
      ? {
          workspace_context_snapshot: args.workspaceContextSnapshot,
        }
      : {}),
    ...(args.routeMetadata
      ? {
          routeMetadata: args.routeMetadata,
          route_metadata: args.routeMetadata,
        }
      : {}),
    ...(realtimeGroundedFeedbackBinding
      ? {
          realtimeGroundedFeedbackBinding,
          realtime_grounded_feedback_binding: realtimeGroundedFeedbackBinding,
        }
      : {}),
    ...(args.bypassWorkstationDispatch === true
      ? {
          bypassWorkstationDispatch: true,
          bypass_workstation_dispatch: true,
        }
      : {}),
    ...(args.forceReasoningDispatch === true
      ? {
          forceReasoningDispatch: true,
          force_reasoning_dispatch: true,
        }
      : {}),
    ...(args.requiresBackendAskEntrypoint === true
      ? {
          requiresBackendAskEntrypoint: true,
          requires_backend_ask_entrypoint: true,
          ask_entrypoint_required: true,
        }
      : {}),
    ...(args.suppressWorkstationPayloadActions === true
      ? {
          suppressWorkstationPayloadActions: true,
          suppress_workstation_payload_actions: true,
        }
      : {}),
    ...(activeDocPath
      ? {
          doc_path: activeDocPath,
          active_doc_path: activeDocPath,
        }
      : {}),
    contextFiles: args.contextFiles,
  };
}
