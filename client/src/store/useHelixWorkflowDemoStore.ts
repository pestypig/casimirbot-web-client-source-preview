import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import {
  HELIX_WORKFLOW_DEMO_SESSION_SCHEMA,
  HELIX_WORKFLOW_QTE_DISPATCH_SCHEMA,
  RESEARCH_PAPER_TO_PROPOSAL_DEMO_ID,
  createEmptyHelixWorkflowDemoEvidence,
  type HelixWorkflowDemoContextBindingV1,
  type HelixWorkflowDemoDebugEventV1,
  type HelixWorkflowDemoEvidenceV1,
  type HelixWorkflowDemoSessionV1,
  type HelixWorkflowDemoStepRetryV1,
  type HelixWorkflowQteDispatchV1,
  type ResearchPaperToProposalStepId,
} from "@shared/contracts/helix-workflow-demo.v1";
import {
  extractHelixWorkflowDemoEvidenceFromPayload,
  extractHelixWorkflowDemoRetrySignalFromPayload,
  isHelixWorkflowDemoTypedFailurePayload,
  mergeHelixWorkflowDemoEvidence,
  projectResearchPaperToProposalSession,
} from "@/lib/helix/workflow-demos/research-paper-to-proposal";
import {
  appendHelixWorkflowDemoDebugEvent,
  createHelixWorkflowDemoDebugEvent,
  diffHelixWorkflowDemoEvidenceRefs,
  findLatestHelixWorkflowDemoDebugSource,
  flattenHelixWorkflowDemoEvidenceRefs,
  hashHelixWorkflowDemoDebugText,
  readHelixWorkflowDemoDebugSource,
} from "@/lib/helix/workflow-demos/workflow-demo-debug";

const HELIX_WORKFLOW_DEMO_STORAGE_KEY = "helix:workflow-demo-session:v1";

export type HelixWorkflowDemoState = {
  session: HelixWorkflowDemoSessionV1 | null;
  debugEvents: HelixWorkflowDemoDebugEventV1[];
  startResearchPaperToProposalDemo: (
    contextBinding?: HelixWorkflowDemoContextBindingV1 | null,
    originSessionId?: string | null,
  ) => HelixWorkflowDemoSessionV1;
  bindContext: (contextBinding: HelixWorkflowDemoContextBindingV1) => boolean;
  pinDemoToChat: (sourceSessionId: string) => boolean;
  pauseDemo: () => void;
  resumeDemo: () => void;
  resetDemo: () => void;
  clearDebugHistory: () => void;
  observePayload: (payload: unknown, sourceSessionId?: string | null) => void;
  dismissSuggestion: (stepId: ResearchPaperToProposalStepId) => void;
  restoreSuggestion: () => void;
  recordSuggestionShown: (stepId: ResearchPaperToProposalStepId, prompt: string, reason: string) => void;
  recordPromptInserted: (input: {
    stepId: ResearchPaperToProposalStepId;
    prompt: string;
    templatePrompt: string;
    sourceSessionId: string;
  }) => void;
  markPromptSubmitted: (input: {
    runId: string;
    stepId: ResearchPaperToProposalStepId;
    sourceSessionId: string;
    turnId: string;
    prompt: string;
  }) => void;
};

type HelixWorkflowDemoSet = (
  next:
    | Partial<HelixWorkflowDemoState>
    | ((state: HelixWorkflowDemoState) => Partial<HelixWorkflowDemoState> | HelixWorkflowDemoState),
) => void;

const nowIso = (): string => new Date().toISOString();

const newRunId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `workflow-demo:${crypto.randomUUID()}`;
  }
  return `workflow-demo:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
};

const normalizeId = (value: unknown): string => typeof value === "string" ? value.trim() : "";

const createSession = (
  contextBinding: HelixWorkflowDemoContextBindingV1 | null,
  originSessionId: string | null,
): HelixWorkflowDemoSessionV1 => {
  const now = nowIso();
  return {
    schema: HELIX_WORKFLOW_DEMO_SESSION_SCHEMA,
    runId: newRunId(),
    demoId: RESEARCH_PAPER_TO_PROPOSAL_DEMO_ID,
    status: "active",
    startedAt: now,
    updatedAt: now,
    evidence: createEmptyHelixWorkflowDemoEvidence(),
    dismissedStepId: null,
    contextBinding,
    originSessionId: normalizeId(originSessionId) || contextBinding?.sourceSessionId || null,
    pendingQteDispatch: null,
  };
};

const readPayloadQuestion = (payload: unknown): string => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  return normalizeId((payload as Record<string, unknown>).question);
};

const resolveSessionOriginId = (session: HelixWorkflowDemoSessionV1): string =>
  normalizeId(session.originSessionId) || normalizeId(session.contextBinding?.sourceSessionId);

const dispatchMatchesCurrentStep = (
  dispatch: HelixWorkflowQteDispatchV1 | null | undefined,
  session: HelixWorkflowDemoSessionV1,
  stepId: ResearchPaperToProposalStepId | null,
): dispatch is HelixWorkflowQteDispatchV1 => Boolean(
  dispatch &&
  stepId &&
  dispatch.runId === session.runId &&
  dispatch.stepId === stepId
);

const admitEvidenceForCurrentStep = (
  stepId: ResearchPaperToProposalStepId | null,
  incoming: HelixWorkflowDemoEvidenceV1,
): HelixWorkflowDemoEvidenceV1 => {
  const admitted = createEmptyHelixWorkflowDemoEvidence();
  if (!stepId) return admitted;
  switch (stepId) {
    case "paper_lookup":
      admitted.paperRefs = incoming.paperRefs;
      break;
    case "pdf_page_render":
      admitted.renderedPageRefs = incoming.renderedPageRefs;
      break;
    case "ocr_math_candidate":
      admitted.ocrMathCandidateRefs = incoming.ocrMathCandidateRefs;
      break;
    case "exact_row_promotion":
      admitted.promotedEquationRefs = incoming.promotedEquationRefs;
      break;
    case "graph_reflection":
      admitted.graphReflectionRefs = incoming.graphReflectionRefs;
      break;
    case "provenance_audit":
      admitted.provenanceAuditRefs = incoming.provenanceAuditRefs;
      break;
    case "proposal_handoff":
      admitted.proposalReceiptRefs = incoming.proposalReceiptRefs;
      break;
  }
  return admitted;
};

const uniqueRetryRefs = (...groups: Array<readonly (string | null | undefined)[]>): string[] =>
  Array.from(new Set(groups.flatMap((group) => group)
    .map((value) => typeof value === "string" ? value.trim() : "")
    .filter(Boolean))).slice(0, 48);

const mergeStepRetry = (args: {
  current: HelixWorkflowDemoStepRetryV1 | null | undefined;
  signal: ReturnType<typeof extractHelixWorkflowDemoRetrySignalFromPayload>;
  sourceTurnId: string | null;
  observedAt: string;
}): HelixWorkflowDemoStepRetryV1 | null => {
  if (!args.signal) return args.current ?? null;
  const current = args.current?.stepId === args.signal.stepId ? args.current : null;
  const sameTurn = Boolean(args.sourceTurnId && current?.sourceTurnId === args.sourceTurnId);
  return {
    schema: "helix.workflow_demo_step_retry.v1",
    stepId: "ocr_math_candidate",
    reason: args.signal.reason,
    attemptCount: Math.max(1, (current?.attemptCount ?? 0) + (sameTurn ? 0 : 1)),
    triedPageNumbers: Array.from(new Set([
      ...(current?.triedPageNumbers ?? []),
      ...(args.signal.pageNumber ? [args.signal.pageNumber] : []),
    ])).sort((left, right) => left - right).slice(0, 8),
    latestPageNumber: args.signal.pageNumber,
    pageCount: args.signal.pageCount ?? current?.pageCount ?? null,
    sourceId: args.signal.sourceId ?? current?.sourceId ?? null,
    artifactRefs: uniqueRetryRefs(current?.artifactRefs ?? [], args.signal.artifactRefs),
    sourceTurnId: args.sourceTurnId ?? current?.sourceTurnId ?? null,
    observedAt: args.observedAt,
  };
};

const debugSourceFromContextBinding = (binding: HelixWorkflowDemoContextBindingV1 | null) => {
  const sourceMessageAtMs = binding?.sourceMessageAt ? Date.parse(binding.sourceMessageAt) : Number.NaN;
  return binding
  ? {
      source_observation_key: `workflow-context:${binding.bindingId}`,
      source_payload_schema: binding.schema,
      source_client_reply_id: null,
      source_turn_id: binding.sourceTraceId,
      source_trace_id: binding.sourceTraceId,
      source_reply_created_at_ms: Number.isFinite(sourceMessageAtMs) ? sourceMessageAtMs : null,
      amends_debug_for_turn_id: binding.sourceTraceId ?? binding.sourceMessageId,
    }
  : null;
};

const quotaSafeLocalStorage: StateStorage = {
  getItem: (name) => window.localStorage.getItem(name),
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      try {
        window.localStorage.removeItem(name);
        window.localStorage.setItem(name, value);
      } catch {
        // The in-memory demo session remains authoritative for the open tab.
      }
    }
  },
  removeItem: (name) => window.localStorage.removeItem(name),
};

export const useHelixWorkflowDemoStore = create<HelixWorkflowDemoState>()(
  persist(
    (set: HelixWorkflowDemoSet, get: () => HelixWorkflowDemoState) => ({
      session: null,
      debugEvents: [],
      startResearchPaperToProposalDemo: (contextBinding = null, originSessionId = null) => {
        const session = createSession(contextBinding, originSessionId);
        const projection = projectResearchPaperToProposalSession(session);
        set((state: HelixWorkflowDemoState) => {
          let debugEvents = appendHelixWorkflowDemoDebugEvent(
            state.debugEvents,
            createHelixWorkflowDemoDebugEvent({
              kind: "session_started",
              session,
              source: debugSourceFromContextBinding(contextBinding),
              afterStepId: projection.currentStepId,
              completedStepCountAfter: projection.completedStepCount,
              qteStepId: projection.qte?.stepId ?? null,
              reason: contextBinding
                ? "developer_enabled_context_bound_procedural_demo"
                : "developer_enabled_unbound_procedural_demo",
            }),
          );
          if (contextBinding) {
            debugEvents = appendHelixWorkflowDemoDebugEvent(
              debugEvents,
              createHelixWorkflowDemoDebugEvent({
                kind: "workflow_context_bound",
                session,
                source: debugSourceFromContextBinding(contextBinding),
                afterStepId: projection.currentStepId,
                completedStepCountAfter: projection.completedStepCount,
                qteStepId: projection.qte?.stepId ?? null,
                reason: "operator_confirmed_workflow_context_at_demo_start",
              }),
            );
          }
          return { session, debugEvents };
        });
        return session;
      },
      bindContext: (contextBinding) => {
        const state = get();
        if (!state.session) return false;
        const beforeProjection = projectResearchPaperToProposalSession(state.session);
        if (beforeProjection.completedStepCount > 0) return false;
        const session: HelixWorkflowDemoSessionV1 = {
          ...state.session,
          contextBinding,
          originSessionId: resolveSessionOriginId(state.session) || contextBinding.sourceSessionId || null,
          dismissedStepId: null,
          pendingQteDispatch: null,
          updatedAt: nowIso(),
        };
        const afterProjection = projectResearchPaperToProposalSession(session);
        set({
          session,
          debugEvents: appendHelixWorkflowDemoDebugEvent(
            state.debugEvents,
            createHelixWorkflowDemoDebugEvent({
              kind: "workflow_context_bound",
              session,
              source: debugSourceFromContextBinding(contextBinding),
              beforeStepId: beforeProjection.currentStepId,
              afterStepId: afterProjection.currentStepId,
              completedStepCountBefore: beforeProjection.completedStepCount,
              completedStepCountAfter: afterProjection.completedStepCount,
              qteStepId: afterProjection.qte?.stepId ?? null,
              reason: state.session.contextBinding
                ? "operator_rebased_unstarted_workflow_context"
                : "operator_bound_context_to_unstarted_workflow",
            }),
          ),
        });
        return true;
      },
      pinDemoToChat: (sourceSessionId) => {
        const normalizedSessionId = normalizeId(sourceSessionId);
        const state = get();
        if (!state.session || !normalizedSessionId) return false;
        const projection = projectResearchPaperToProposalSession(state.session);
        const session: HelixWorkflowDemoSessionV1 = {
          ...state.session,
          originSessionId: normalizedSessionId,
          pendingQteDispatch: null,
          dismissedStepId: null,
          updatedAt: nowIso(),
        };
        set({
          session,
          debugEvents: appendHelixWorkflowDemoDebugEvent(
            state.debugEvents,
            createHelixWorkflowDemoDebugEvent({
              kind: "workflow_chat_pinned",
              session,
              beforeStepId: projection.currentStepId,
              afterStepId: projection.currentStepId,
              completedStepCountBefore: projection.completedStepCount,
              completedStepCountAfter: projection.completedStepCount,
              qteStepId: projection.qte?.stepId ?? null,
              reason: "operator_explicitly_continued_workflow_in_active_chat",
            }),
          ),
        });
        return true;
      },
      pauseDemo: () => set((state: HelixWorkflowDemoState) => {
        if (!state.session) return state;
        const session = { ...state.session, status: "paused" as const, updatedAt: nowIso() };
        const projection = projectResearchPaperToProposalSession(session);
        return {
          session,
          debugEvents: appendHelixWorkflowDemoDebugEvent(
            state.debugEvents,
            createHelixWorkflowDemoDebugEvent({
              kind: "session_paused",
              session,
              beforeStepId: projection.currentStepId,
              afterStepId: projection.currentStepId,
              completedStepCountBefore: projection.completedStepCount,
              completedStepCountAfter: projection.completedStepCount,
              reason: "operator_paused_demo",
            }),
          ),
        };
      }),
      resumeDemo: () => set((state: HelixWorkflowDemoState) => {
        if (!state.session || state.session.status === "completed") return state;
        const session = { ...state.session, status: "active" as const, updatedAt: nowIso() };
        const projection = projectResearchPaperToProposalSession(session);
        return {
          session,
          debugEvents: appendHelixWorkflowDemoDebugEvent(
            state.debugEvents,
            createHelixWorkflowDemoDebugEvent({
              kind: "session_resumed",
              session,
              beforeStepId: projection.currentStepId,
              afterStepId: projection.currentStepId,
              completedStepCountBefore: projection.completedStepCount,
              completedStepCountAfter: projection.completedStepCount,
              qteStepId: projection.qte?.stepId ?? null,
              reason: "operator_resumed_demo",
            }),
          ),
        };
      }),
      resetDemo: () => set((state: HelixWorkflowDemoState) => {
        if (!state.session) return { session: null };
        const projection = projectResearchPaperToProposalSession(state.session);
        return {
          session: null,
          debugEvents: appendHelixWorkflowDemoDebugEvent(
            state.debugEvents,
            createHelixWorkflowDemoDebugEvent({
              kind: "session_reset",
              session: state.session,
              beforeStepId: projection.currentStepId,
              completedStepCountBefore: projection.completedStepCount,
              reason: "operator_reset_demo",
            }),
          ),
        };
      }),
      clearDebugHistory: () => set({ debugEvents: [] }),
      observePayload: (payload: unknown, sourceSessionId = null) => {
        const { session, debugEvents } = get();
        if (!session || session.status !== "active") return;
        const beforeProjection = projectResearchPaperToProposalSession(session);
        const source = readHelixWorkflowDemoDebugSource(payload);
        const normalizedSourceSessionId = normalizeId(sourceSessionId);
        const originSessionId = resolveSessionOriginId(session);
        const dispatch = session.pendingQteDispatch;
        const submittedTurnId = normalizeId(dispatch?.submittedTurnId);
        const payloadQuestion = readPayloadQuestion(payload);
        const payloadQuestionHash = payloadQuestion
          ? hashHelixWorkflowDemoDebugText(payloadQuestion)
          : "";
        const sourceMatchesSubmittedTurn = Boolean(
          submittedTurnId &&
          (source.source_turn_id === submittedTurnId || source.source_trace_id === submittedTurnId)
        );
        const rejectionReason = !normalizedSourceSessionId
          ? "missing_active_chat_identity"
          : !originSessionId
            ? "workflow_run_not_pinned_to_chat"
            : originSessionId !== normalizedSourceSessionId
              ? "payload_from_non_origin_chat"
              : !dispatchMatchesCurrentStep(dispatch, session, beforeProjection.currentStepId)
                ? "no_pending_qte_dispatch_for_current_step"
                : dispatch.sourceSessionId !== normalizedSourceSessionId
                  ? "qte_dispatch_belongs_to_different_chat"
                  : !submittedTurnId || !dispatch.submittedPromptHash
                    ? "qte_prompt_not_submitted"
                    : !sourceMatchesSubmittedTurn
                      ? "payload_turn_not_linked_to_qte_submission"
                      : !payloadQuestion
                        ? "payload_missing_submitted_question"
                        : payloadQuestionHash !== dispatch.submittedPromptHash
                          ? "payload_question_not_linked_to_qte_submission"
                          : null;
        if (rejectionReason) {
          const rejectionKey = `${source.source_observation_key ?? "anonymous"}:workflow-rejected:${rejectionReason}`;
          if (debugEvents.some((event) =>
            event.run_id === session.runId &&
            event.event_kind === "workflow_evidence_rejected" &&
            event.source_observation_key === rejectionKey
          )) return;
          set({
            debugEvents: appendHelixWorkflowDemoDebugEvent(
              debugEvents,
              createHelixWorkflowDemoDebugEvent({
                kind: "workflow_evidence_rejected",
                session,
                source: { ...source, source_observation_key: rejectionKey },
                beforeStepId: beforeProjection.currentStepId,
                afterStepId: beforeProjection.currentStepId,
                completedStepCountBefore: beforeProjection.completedStepCount,
                completedStepCountAfter: beforeProjection.completedStepCount,
                qteStepId: beforeProjection.qte?.stepId ?? null,
                reason: rejectionReason,
              }),
            ),
          });
          return;
        }
        const incoming = admitEvidenceForCurrentStep(
          beforeProjection.currentStepId,
          extractHelixWorkflowDemoEvidenceFromPayload(payload),
        );
        const evidence = mergeHelixWorkflowDemoEvidence(session.evidence, incoming);
        const typedFailure = isHelixWorkflowDemoTypedFailurePayload(payload);
        const retrySignal = beforeProjection.currentStepId === "ocr_math_candidate"
          ? extractHelixWorkflowDemoRetrySignalFromPayload(payload)
          : null;
        const observedRefs = uniqueRetryRefs(
          flattenHelixWorkflowDemoEvidenceRefs(incoming),
          retrySignal?.artifactRefs ?? [],
        );
        const observationFingerprint = hashHelixWorkflowDemoDebugText(JSON.stringify({
          typedFailure,
          observedRefs,
          retrySignal,
        }));
        const observationKey = `${source.source_observation_key ?? "anonymous"}:${observationFingerprint}`;
        if (debugEvents.some((event) =>
          event.run_id === session.runId &&
          event.source_observation_key === observationKey &&
          (event.event_kind === "workflow_evidence_observed" ||
            event.event_kind === "workflow_step_advanced" ||
            event.event_kind === "workflow_completed")
        )) return;
        const observedAt = nowIso();
        const stepRetry = typedFailure
          ? session.stepRetry ?? null
          : mergeStepRetry({
              current: session.stepRetry,
              signal: retrySignal,
              sourceTurnId: source.source_turn_id ?? source.source_trace_id,
              observedAt,
            });
        const nextSession: HelixWorkflowDemoSessionV1 = {
          ...session,
          evidence,
          stepRetry,
          dismissedStepId: observedRefs.length > 0 || retrySignal ? null : session.dismissedStepId,
          pendingQteDispatch: typedFailure ? null : session.pendingQteDispatch,
          updatedAt: observedAt,
        };
        const afterProjection = projectResearchPaperToProposalSession(nextSession);
        const newArtifactRefs = uniqueRetryRefs(
          diffHelixWorkflowDemoEvidenceRefs(session.evidence, evidence),
          retrySignal?.artifactRefs.filter((ref) => !(session.stepRetry?.artifactRefs ?? []).includes(ref)) ?? [],
        );
        const eventKind = afterProjection.completed && !beforeProjection.completed
          ? "workflow_completed"
          : afterProjection.currentStepId !== beforeProjection.currentStepId
            ? "workflow_step_advanced"
            : "workflow_evidence_observed";
        const reason = typedFailure
          ? "typed_failure_not_admitted_as_workflow_evidence"
          : retrySignal && afterProjection.currentStepId === beforeProjection.currentStepId
            ? "typed_partial_observation_selected_bounded_step_retry"
          : newArtifactRefs.length === 0
            ? "no_new_typed_workflow_evidence"
            : eventKind === "workflow_completed"
              ? "typed_evidence_completed_workflow"
              : eventKind === "workflow_step_advanced"
                ? "typed_evidence_advanced_next_unmet_step"
                : "typed_evidence_observed_without_step_transition";
        const event = createHelixWorkflowDemoDebugEvent({
          kind: eventKind,
          session,
          source: { ...source, source_observation_key: observationKey },
          beforeStepId: beforeProjection.currentStepId,
          afterStepId: afterProjection.currentStepId,
          completedStepCountBefore: beforeProjection.completedStepCount,
          completedStepCountAfter: afterProjection.completedStepCount,
          observedArtifactRefs: observedRefs,
          newArtifactRefs,
          qteStepId: afterProjection.qte?.stepId ?? null,
          prompt: afterProjection.qte?.prompt ?? null,
          reason,
        });
        set({
          session: afterProjection.completed
            ? { ...nextSession, status: "completed", pendingQteDispatch: null, stepRetry: null }
            : afterProjection.currentStepId !== beforeProjection.currentStepId
              ? { ...nextSession, pendingQteDispatch: null, stepRetry: null }
              : nextSession,
          debugEvents: appendHelixWorkflowDemoDebugEvent(debugEvents, event),
        });
      },
      dismissSuggestion: (stepId: ResearchPaperToProposalStepId) => set((state: HelixWorkflowDemoState) => {
        if (!state.session) return state;
        const source = findLatestHelixWorkflowDemoDebugSource(state.debugEvents, state.session.runId);
        return {
          session: { ...state.session, dismissedStepId: stepId, updatedAt: nowIso() },
          debugEvents: appendHelixWorkflowDemoDebugEvent(
            state.debugEvents,
            createHelixWorkflowDemoDebugEvent({
              kind: "qte_dismissed",
              session: state.session,
              source,
              qteStepId: stepId,
              reason: "operator_dismissed_suggestion",
            }),
          ),
        };
      }),
      restoreSuggestion: () => set((state: HelixWorkflowDemoState) => {
        if (!state.session) return state;
        const stepId = state.session.dismissedStepId;
        const source = findLatestHelixWorkflowDemoDebugSource(state.debugEvents, state.session.runId);
        return {
          session: { ...state.session, dismissedStepId: null, updatedAt: nowIso() },
          debugEvents: appendHelixWorkflowDemoDebugEvent(
            state.debugEvents,
            createHelixWorkflowDemoDebugEvent({
              kind: "qte_restored",
              session: state.session,
              source,
              qteStepId: stepId,
              reason: "operator_restored_suggestion",
            }),
          ),
        };
      }),
      recordSuggestionShown: (stepId: ResearchPaperToProposalStepId, prompt: string, reason: string) => set((state: HelixWorkflowDemoState) => {
        if (!state.session) return state;
        const promptHash = hashHelixWorkflowDemoDebugText(prompt);
        const alreadyRecorded = state.debugEvents.some((event) =>
          event.run_id === state.session?.runId &&
          event.event_kind === "qte_suggested" &&
          event.qte_step_id === stepId &&
          event.prompt_hash === promptHash
        );
        if (alreadyRecorded) return state;
        const source = findLatestHelixWorkflowDemoDebugSource(state.debugEvents, state.session.runId);
        return {
          debugEvents: appendHelixWorkflowDemoDebugEvent(
            state.debugEvents,
            createHelixWorkflowDemoDebugEvent({
              kind: "qte_suggested",
              session: state.session,
              source,
              qteStepId: stepId,
              prompt,
              reason: reason || "deterministic_projection_selected_next_unmet_step",
            }),
          ),
        };
      }),
      recordPromptInserted: ({ stepId, prompt, templatePrompt, sourceSessionId }) => set((state: HelixWorkflowDemoState) => {
        if (!state.session) return state;
        const normalizedSourceSessionId = normalizeId(sourceSessionId);
        const projection = projectResearchPaperToProposalSession(state.session);
        const originSessionId = resolveSessionOriginId(state.session);
        if (
          !normalizedSourceSessionId ||
          projection.currentStepId !== stepId ||
          (originSessionId && originSessionId !== normalizedSourceSessionId)
        ) return state;
        const insertedAt = nowIso();
        const pendingQteDispatch: HelixWorkflowQteDispatchV1 = {
          schema: HELIX_WORKFLOW_QTE_DISPATCH_SCHEMA,
          runId: state.session.runId,
          stepId,
          sourceSessionId: normalizedSourceSessionId,
          insertedPromptHash: hashHelixWorkflowDemoDebugText(prompt),
          submittedPromptHash: null,
          submittedTurnId: null,
          insertedAt,
          submittedAt: null,
        };
        const session: HelixWorkflowDemoSessionV1 = {
          ...state.session,
          originSessionId: originSessionId || normalizedSourceSessionId,
          pendingQteDispatch,
          updatedAt: insertedAt,
        };
        const source = findLatestHelixWorkflowDemoDebugSource(state.debugEvents, state.session.runId);
        return {
          session,
          debugEvents: appendHelixWorkflowDemoDebugEvent(
            state.debugEvents,
            createHelixWorkflowDemoDebugEvent({
              kind: "qte_prompt_inserted",
              session,
              source,
              qteStepId: stepId,
              prompt,
              templatePrompt,
              reason: "operator_inserted_editable_prompt_without_auto_submit",
            }),
          ),
        };
      }),
      markPromptSubmitted: ({ runId, stepId, sourceSessionId, turnId, prompt }) => set((state: HelixWorkflowDemoState) => {
        if (!state.session) return state;
        const normalizedSourceSessionId = normalizeId(sourceSessionId);
        const normalizedTurnId = normalizeId(turnId);
        const projection = projectResearchPaperToProposalSession(state.session);
        const dispatch = state.session.pendingQteDispatch;
        if (
          !normalizedSourceSessionId ||
          !normalizedTurnId ||
          !prompt.trim() ||
          runId !== state.session.runId ||
          projection.currentStepId !== stepId ||
          resolveSessionOriginId(state.session) !== normalizedSourceSessionId ||
          !dispatchMatchesCurrentStep(dispatch, state.session, stepId) ||
          dispatch.sourceSessionId !== normalizedSourceSessionId
        ) return state;
        const submittedAt = nowIso();
        const session: HelixWorkflowDemoSessionV1 = {
          ...state.session,
          pendingQteDispatch: {
            ...dispatch,
            submittedPromptHash: hashHelixWorkflowDemoDebugText(prompt.trim()),
            submittedTurnId: normalizedTurnId,
            submittedAt,
          },
          updatedAt: submittedAt,
        };
        const source = {
          source_observation_key: `qte-submit:${normalizedTurnId}`,
          source_payload_schema: "helix.workflow_qte_submission.v1",
          source_client_reply_id: null,
          source_turn_id: normalizedTurnId,
          source_trace_id: normalizedTurnId,
          source_reply_created_at_ms: Date.parse(submittedAt),
          amends_debug_for_turn_id: normalizedTurnId,
        };
        return {
          session,
          debugEvents: appendHelixWorkflowDemoDebugEvent(
            state.debugEvents,
            createHelixWorkflowDemoDebugEvent({
              kind: "qte_prompt_submitted",
              session,
              source,
              beforeStepId: projection.currentStepId,
              afterStepId: projection.currentStepId,
              completedStepCountBefore: projection.completedStepCount,
              completedStepCountAfter: projection.completedStepCount,
              qteStepId: stepId,
              prompt: prompt.trim(),
              reason: "operator_submitted_editable_qte_prompt_on_linked_ask_turn",
            }),
          ),
        };
      }),
    }),
    {
      name: HELIX_WORKFLOW_DEMO_STORAGE_KEY,
      storage: createJSONStorage(() => quotaSafeLocalStorage),
      partialize: (state: HelixWorkflowDemoState) => ({
        session: state.session,
        debugEvents: state.debugEvents,
      }),
    },
  ),
);

export const observeHelixWorkflowDemoPayload = (
  payload: unknown,
  sourceSessionId?: string | null,
): void => {
  useHelixWorkflowDemoStore.getState().observePayload(payload, sourceSessionId);
};
