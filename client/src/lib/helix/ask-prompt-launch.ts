import { navigate } from "wouter/use-browser-location";
import type { ResearchPaperToProposalStepId } from "@shared/contracts/helix-workflow-demo.v1";
import type { HelixRealtimeGroundedFeedbackBindingV1 } from "@shared/contracts/helix-realtime-stage-play.v1";
import {
  isHelixAgentRuntimeId,
  type HelixAgentRuntimeId,
} from "@shared/helix-agent-runtime";
import { isWorkstationShellPathname } from "@/lib/workstation/workstationEntryRoute";

export const HELIX_PENDING_ASK_KEY = "helix:pending-ask";
export const HELIX_ASK_PROMPT_EVENT = "helix-ask:prompt";

export type HelixAskAnswerContractSection = {
  id: string;
  heading: string;
  required?: boolean;
  synonyms?: string[];
};

export type HelixAskAnswerContract = {
  schema: "helix.ask.answer_contract.v1";
  source: "docs_viewer";
  mode: "summarize_doc" | "summarize_section" | "explain_paper" | "locate_in_doc";
  strict_sections?: boolean;
  sections?: HelixAskAnswerContractSection[];
  min_tokens?: number;
};

export type HelixAskMailboxWakeRequiredCanonicalGoal =
  | "processed_mail_interpretation"
  | "processed_mail_voice_decision"
  | "processed_mail_checkpoint";

export type HelixAskStagePlayMailboxWakeRouteMetadata = {
  schema?: "helix.ask.route_metadata.v1" | string;
  source?: "stage_play_mail_wake" | string;
  invocationKind: "stage_play_mail_wake";
  wakeRequestId: string;
  mailboxThreadId: string;
  sourceTarget: "live_source_mailbox";
  requiredCanonicalGoal: HelixAskMailboxWakeRequiredCanonicalGoal;
  requiredPhase?: string;
  allowedCapabilities: string[];
  forbiddenCapabilities: string[];
  evidenceRefs: string[];
  source_target_intent?: Record<string, unknown>;
  stage_play_live_source_mailbox_debug?: Record<string, unknown>;
  live_source_mailbox_authority_summary?: Record<string, unknown>;
  mandatory_next_tool?: Record<string, unknown>;
  requiredToolFamily?: string | null;
  requiredTerminalProductKind?: string | null;
  requiredTerminalArtifactKind?: string | null;
  allowedTerminalProductKinds?: string[];
  allowedTerminalArtifactKinds?: string[];
  compact_context?: Record<string, unknown>;
  context_resume_frame?: Record<string, unknown> | null;
  contextResumeFrame?: Record<string, unknown> | null;
  evidenceContext?: Record<string, unknown> | null;
  scientificEvidenceWorkflowStatus?: Record<string, unknown> | null;
  scientific_evidence_workflow_status?: Record<string, unknown> | null;
};

export type HelixAskGenericRouteMetadata = {
  schema?: "helix.ask.route_metadata.v1" | string;
  source?: "stage_play_mail_wake" | string;
  invocationKind?: "stage_play_mail_wake" | string;
  wakeRequestId?: string | null;
  mailboxThreadId?: string | null;
  sourceTarget?: "live_source_mailbox" | string;
  requiredCanonicalGoal?:
    | "processed_mail_interpretation"
    | "processed_mail_voice_decision"
    | "processed_mail_checkpoint"
    | string;
  requiredPhase?: string | null;
  allowedCapabilities?: string[];
  forbiddenCapabilities?: string[];
  evidenceRefs?: string[];
  source_target_intent?: Record<string, unknown>;
  stage_play_live_source_mailbox_debug?: Record<string, unknown>;
  live_source_mailbox_authority_summary?: Record<string, unknown>;
  mandatory_next_tool?: Record<string, unknown>;
  requiredToolFamily?: string | null;
  requiredTerminalProductKind?: string | null;
  requiredTerminalArtifactKind?: string | null;
  allowedTerminalProductKinds?: string[];
  allowedTerminalArtifactKinds?: string[];
  compact_context?: Record<string, unknown>;
  context_resume_frame?: Record<string, unknown> | null;
  contextResumeFrame?: Record<string, unknown> | null;
  selectedRuntimeAgentProvider?: string | null;
  selected_runtime_agent_provider?: string | null;
  realtimeGroundedFeedbackBinding?: HelixRealtimeGroundedFeedbackBindingV1;
  realtime_grounded_feedback_binding?: HelixRealtimeGroundedFeedbackBindingV1;
};

export type HelixAskRouteMetadata =
  | HelixAskStagePlayMailboxWakeRouteMetadata
  | HelixAskGenericRouteMetadata;

export type PendingHelixAskPrompt = {
  promptId: string;
  question: string;
  autoSubmit: boolean;
  blockId?: string | null;
  panelId?: string | null;
  bypassWorkstationDispatch?: boolean;
  forceReasoningDispatch?: boolean;
  requiresBackendAskEntrypoint?: boolean;
  requires_backend_ask_entrypoint?: boolean;
  suppressWorkstationPayloadActions?: boolean;
  serverAdmittedRuntimeAgentProvider?: HelixAgentRuntimeId;
  answerContract?: HelixAskAnswerContract;
  routeMetadata?: HelixAskRouteMetadata;
  route_metadata?: HelixAskRouteMetadata;
  workflowQte?: {
    schema: "helix.workflow_qte_launch.v1";
    runId: string;
    stepId: ResearchPaperToProposalStepId;
    sourceSessionId: string;
  };
  createdAt: number;
};

const routeMetadataRequiresBackendAskEntrypoint = (
  routeMetadata: HelixAskRouteMetadata | undefined,
): boolean => {
  if (!routeMetadata) return false;
  return (
    routeMetadata.sourceTarget === "postulate_board" ||
    routeMetadata.requiredCanonicalGoal === "postulate_runtime_review_then_gated_submit" ||
    routeMetadata.invocationKind === "postulate_final_answer_review" ||
    routeMetadata.source_target_intent?.must_enter_backend_ask === true
  );
};

const promptRequiresBackendAskEntrypoint = (
  question: string,
  routeMetadata: HelixAskRouteMetadata | undefined,
): boolean =>
  /^\s*\/postulate\b/i.test(question) || routeMetadataRequiresBackendAskEntrypoint(routeMetadata);

const isWorkstationAskConsumerRoute = () =>
  typeof window !== "undefined" &&
  isWorkstationShellPathname(window.location.pathname);

const defaultAskConsumerUrl = (): string => "/desktop";

export function clearPendingHelixAskPrompt() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(HELIX_PENDING_ASK_KEY);
  } catch {
    // ignore storage failures
  }
}

export function consumePendingHelixAskPrompt(): PendingHelixAskPrompt | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(HELIX_PENDING_ASK_KEY);
    if (!raw) return null;
    window.localStorage.removeItem(HELIX_PENDING_ASK_KEY);
    const parsed = JSON.parse(raw) as Partial<PendingHelixAskPrompt>;
    const question = typeof parsed.question === "string" ? parsed.question.trim() : "";
    if (!question) return null;
    const routeMetadata =
      parsed.routeMetadata &&
      typeof parsed.routeMetadata === "object" &&
      !Array.isArray(parsed.routeMetadata)
        ? (parsed.routeMetadata as HelixAskRouteMetadata)
        : parsed.route_metadata &&
            typeof parsed.route_metadata === "object" &&
            !Array.isArray(parsed.route_metadata)
          ? (parsed.route_metadata as HelixAskRouteMetadata)
          : undefined;
    return {
      promptId:
        typeof parsed.promptId === "string" && parsed.promptId.trim()
          ? parsed.promptId.trim()
          : crypto.randomUUID(),
      question,
      autoSubmit: parsed.autoSubmit !== false,
      blockId: typeof parsed.blockId === "string" && parsed.blockId.trim() ? parsed.blockId.trim() : null,
      panelId: typeof parsed.panelId === "string" && parsed.panelId.trim() ? parsed.panelId.trim() : null,
      bypassWorkstationDispatch: parsed.bypassWorkstationDispatch === true,
      forceReasoningDispatch: parsed.forceReasoningDispatch === true ? true : undefined,
      requiresBackendAskEntrypoint:
        parsed.requiresBackendAskEntrypoint === true ||
        parsed.requires_backend_ask_entrypoint === true ||
        promptRequiresBackendAskEntrypoint(question, routeMetadata)
          ? true
          : undefined,
      requires_backend_ask_entrypoint:
        parsed.requiresBackendAskEntrypoint === true ||
        parsed.requires_backend_ask_entrypoint === true ||
        promptRequiresBackendAskEntrypoint(question, routeMetadata)
          ? true
          : undefined,
      suppressWorkstationPayloadActions:
        parsed.suppressWorkstationPayloadActions === true ? true : undefined,
      serverAdmittedRuntimeAgentProvider: isHelixAgentRuntimeId(
        parsed.serverAdmittedRuntimeAgentProvider,
      )
        ? parsed.serverAdmittedRuntimeAgentProvider
        : undefined,
      answerContract:
        parsed.answerContract &&
        typeof parsed.answerContract === "object" &&
        !Array.isArray(parsed.answerContract)
          ? (parsed.answerContract as HelixAskAnswerContract)
          : undefined,
      routeMetadata,
      route_metadata: routeMetadata,
      workflowQte:
        parsed.workflowQte &&
        parsed.workflowQte.schema === "helix.workflow_qte_launch.v1" &&
        typeof parsed.workflowQte.runId === "string" &&
        typeof parsed.workflowQte.stepId === "string" &&
        typeof parsed.workflowQte.sourceSessionId === "string"
          ? parsed.workflowQte
          : undefined,
      createdAt:
        typeof parsed.createdAt === "number" && Number.isFinite(parsed.createdAt)
          ? parsed.createdAt
          : Date.now(),
    };
  } catch {
    clearPendingHelixAskPrompt();
    return null;
  }
}

export function launchHelixAskPrompt(args: {
  question: string;
  autoSubmit?: boolean;
  blockId?: string | null;
  panelId?: string | null;
  bypassWorkstationDispatch?: boolean;
  forceReasoningDispatch?: boolean;
  suppressWorkstationPayloadActions?: boolean;
  serverAdmittedRuntimeAgentProvider?: HelixAgentRuntimeId;
  requiresBackendAskEntrypoint?: boolean;
  requires_backend_ask_entrypoint?: boolean;
  answerContract?: HelixAskAnswerContract;
  routeMetadata?: HelixAskRouteMetadata;
  route_metadata?: HelixAskRouteMetadata;
  workflowQte?: PendingHelixAskPrompt["workflowQte"];
}) {
  if (typeof window === "undefined") return;
  const question = args.question.trim();
  if (!question) return;

  const routeMetadata = args.routeMetadata ?? args.route_metadata;
  const requiresBackendAskEntrypoint =
    args.requiresBackendAskEntrypoint === true ||
    args.requires_backend_ask_entrypoint === true ||
    promptRequiresBackendAskEntrypoint(question, routeMetadata);
  const payload: PendingHelixAskPrompt = {
    promptId: crypto.randomUUID(),
    question,
    autoSubmit: args.autoSubmit !== false,
    blockId: args.blockId?.trim() || null,
    panelId: args.panelId?.trim() || null,
    bypassWorkstationDispatch: args.bypassWorkstationDispatch === true,
    forceReasoningDispatch: args.forceReasoningDispatch === true || requiresBackendAskEntrypoint,
    requiresBackendAskEntrypoint,
    requires_backend_ask_entrypoint: requiresBackendAskEntrypoint,
    suppressWorkstationPayloadActions: args.suppressWorkstationPayloadActions === true,
    serverAdmittedRuntimeAgentProvider: args.serverAdmittedRuntimeAgentProvider,
    answerContract: args.answerContract,
    routeMetadata,
    route_metadata: routeMetadata,
    workflowQte: args.workflowQte,
    createdAt: Date.now(),
  };

  try {
    window.localStorage.setItem(HELIX_PENDING_ASK_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage failures; the in-page event can still deliver the prompt
  }

  window.dispatchEvent(new CustomEvent(HELIX_ASK_PROMPT_EVENT, { detail: payload }));

  if (!isWorkstationAskConsumerRoute()) {
    navigate(defaultAskConsumerUrl());
  }
}
