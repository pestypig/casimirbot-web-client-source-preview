import {
  HELIX_WORKFLOW_DEMO_DEBUG_EVENT_SCHEMA,
  HELIX_WORKFLOW_DEMO_DEBUG_SCHEMA,
  type HelixWorkflowDemoDebugEventKind,
  type HelixWorkflowDemoDebugEventV1,
  type HelixWorkflowDemoDebugExportV1,
  type HelixWorkflowDemoDebugTargetV1,
  type HelixWorkflowDemoEvidenceV1,
  type HelixWorkflowDemoSessionV1,
  type ResearchPaperToProposalStepId,
} from "@shared/contracts/helix-workflow-demo.v1";

type RecordLike = Record<string, unknown>;

const DEBUG_EVENT_LIMIT = 240;
const DEBUG_RUN_TAIL_LIMIT = 120;

const asRecord = (value: unknown): RecordLike | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as RecordLike
    : null;

const readString = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

const readFiniteNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
};

const uniqueStrings = (values: readonly (string | null | undefined)[]): string[] =>
  [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];

export const hashHelixWorkflowDemoDebugText = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

export const flattenHelixWorkflowDemoEvidenceRefs = (
  evidence: HelixWorkflowDemoEvidenceV1,
): string[] => uniqueStrings([
  ...evidence.paperRefs,
  ...evidence.renderedPageRefs,
  ...evidence.ocrMathCandidateRefs,
  ...evidence.promotedEquationRefs,
  ...evidence.graphReflectionRefs,
  ...evidence.provenanceAuditRefs,
  ...evidence.proposalReceiptRefs,
]);

export const diffHelixWorkflowDemoEvidenceRefs = (
  before: HelixWorkflowDemoEvidenceV1,
  after: HelixWorkflowDemoEvidenceV1,
): string[] => {
  const existing = new Set(flattenHelixWorkflowDemoEvidenceRefs(before));
  return flattenHelixWorkflowDemoEvidenceRefs(after).filter((ref) => !existing.has(ref));
};

export type HelixWorkflowDemoDebugSource = {
  source_observation_key: string | null;
  source_payload_schema: string | null;
  source_client_reply_id: string | null;
  source_turn_id: string | null;
  source_trace_id: string | null;
  source_reply_created_at_ms: number | null;
  amends_debug_for_turn_id: string | null;
};

export const readHelixWorkflowDemoDebugSource = (payload: unknown): HelixWorkflowDemoDebugSource => {
  const record = asRecord(payload);
  const debug = asRecord(record?.debug);
  const turnTruthTable = asRecord(debug?.turn_truth_table);
  const sourceClientReplyId = readString(record?.id, record?.client_reply_id, record?.clientReplyId);
  const sourceTurnId = readString(
    record?.turn_id,
    record?.turnId,
    record?.active_turn_id,
    record?.activeTurnId,
    debug?.turn_id,
    debug?.turnId,
    debug?.active_turn_id,
    turnTruthTable?.turn_id,
    turnTruthTable?.turnId,
  );
  const sourceTraceId = readString(
    record?.trace_id,
    record?.traceId,
    debug?.trace_id,
    debug?.traceId,
    turnTruthTable?.trace_id,
    turnTruthTable?.traceId,
  );
  const sourcePayloadSchema = readString(record?.schema, debug?.schema);
  const sourceReplyCreatedAtMs = readFiniteNumber(
    record?.createdAtMs,
    record?.created_at_ms,
    record?.createdAt,
  );
  const fallbackFingerprint = hashHelixWorkflowDemoDebugText(JSON.stringify({
    schema: sourcePayloadSchema,
    turn: sourceTurnId,
    trace: sourceTraceId,
  }));
  const identity = sourceClientReplyId ?? sourceTurnId ?? sourceTraceId ?? fallbackFingerprint;
  return {
    source_observation_key: identity,
    source_payload_schema: sourcePayloadSchema,
    source_client_reply_id: sourceClientReplyId,
    source_turn_id: sourceTurnId,
    source_trace_id: sourceTraceId,
    source_reply_created_at_ms: sourceReplyCreatedAtMs,
    amends_debug_for_turn_id: sourceTurnId ?? sourceClientReplyId,
  };
};

export type CreateHelixWorkflowDemoDebugEventInput = {
  kind: HelixWorkflowDemoDebugEventKind;
  session: HelixWorkflowDemoSessionV1;
  source?: Partial<HelixWorkflowDemoDebugSource> | null;
  beforeStepId?: ResearchPaperToProposalStepId | null;
  afterStepId?: ResearchPaperToProposalStepId | null;
  completedStepCountBefore?: number | null;
  completedStepCountAfter?: number | null;
  observedArtifactRefs?: string[];
  newArtifactRefs?: string[];
  qteStepId?: ResearchPaperToProposalStepId | null;
  prompt?: string | null;
  templatePrompt?: string | null;
  reason?: string | null;
  at?: string;
  eventId?: string;
  sourceObservationKeySuffix?: string | null;
};

export const createHelixWorkflowDemoDebugEvent = (
  input: CreateHelixWorkflowDemoDebugEventInput,
): HelixWorkflowDemoDebugEventV1 => {
  const at = input.at ?? new Date().toISOString();
  const prompt = input.prompt ?? null;
  const templatePrompt = input.templatePrompt ?? null;
  const sourceObservationKey = input.source?.source_observation_key ?? null;
  return {
    schema: HELIX_WORKFLOW_DEMO_DEBUG_EVENT_SCHEMA,
    event_id: input.eventId ?? `workflow-debug:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
    event_kind: input.kind,
    at,
    demo_id: input.session.demoId,
    run_id: input.session.runId,
    source_observation_key: sourceObservationKey
      ? `${sourceObservationKey}${input.sourceObservationKeySuffix ?? ""}`
      : null,
    source_payload_schema: input.source?.source_payload_schema ?? null,
    source_client_reply_id: input.source?.source_client_reply_id ?? null,
    source_turn_id: input.source?.source_turn_id ?? null,
    source_trace_id: input.source?.source_trace_id ?? null,
    source_reply_created_at_ms: input.source?.source_reply_created_at_ms ?? null,
    amends_debug_for_turn_id: input.source?.amends_debug_for_turn_id ?? null,
    before_step_id: input.beforeStepId ?? null,
    after_step_id: input.afterStepId ?? null,
    completed_step_count_before: input.completedStepCountBefore ?? null,
    completed_step_count_after: input.completedStepCountAfter ?? null,
    observed_artifact_refs: uniqueStrings(input.observedArtifactRefs ?? []),
    new_artifact_refs: uniqueStrings(input.newArtifactRefs ?? []),
    qte_step_id: input.qteStepId ?? null,
    prompt_hash: prompt === null ? null : hashHelixWorkflowDemoDebugText(prompt),
    prompt_length: prompt === null ? null : prompt.length,
    prompt_edited: prompt === null || templatePrompt === null ? null : prompt !== templatePrompt,
    reason: input.reason ?? null,
    context_binding_id: input.session.contextBinding?.bindingId ?? null,
    context_source_kind: input.session.contextBinding?.sourceKind ?? null,
    context_source_session_id: input.session.contextBinding?.sourceSessionId ?? null,
    context_source_message_id: input.session.contextBinding?.sourceMessageId ?? null,
    context_source_trace_id: input.session.contextBinding?.sourceTraceId ?? null,
    context_objective_hash: input.session.contextBinding?.objectiveHash ?? null,
    context_confidence: input.session.contextBinding?.confidence ?? null,
    answer_authority: false,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
  };
};

export const appendHelixWorkflowDemoDebugEvent = (
  events: readonly HelixWorkflowDemoDebugEventV1[],
  event: HelixWorkflowDemoDebugEventV1,
): HelixWorkflowDemoDebugEventV1[] => [...events, event].slice(-DEBUG_EVENT_LIMIT);

export const findLatestHelixWorkflowDemoDebugSource = (
  events: readonly HelixWorkflowDemoDebugEventV1[],
  runId: string,
): HelixWorkflowDemoDebugSource | null => {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.run_id !== runId) continue;
    if (!event.source_client_reply_id && !event.source_turn_id && !event.source_trace_id) continue;
    return {
      source_observation_key: event.source_observation_key,
      source_payload_schema: event.source_payload_schema,
      source_client_reply_id: event.source_client_reply_id,
      source_turn_id: event.source_turn_id,
      source_trace_id: event.source_trace_id,
      source_reply_created_at_ms: event.source_reply_created_at_ms,
      amends_debug_for_turn_id: event.amends_debug_for_turn_id,
    };
  }
  return null;
};

const eventMatchesTarget = (
  event: HelixWorkflowDemoDebugEventV1,
  target: HelixWorkflowDemoDebugTargetV1,
): boolean => Boolean(
  (target.client_reply_id && event.source_client_reply_id === target.client_reply_id) ||
  (target.turn_id && event.source_turn_id === target.turn_id) ||
  (target.trace_id && event.source_trace_id === target.trace_id)
);

const sanitizeHelixWorkflowDemoSessionForDebug = (
  session: HelixWorkflowDemoSessionV1 | null,
): HelixWorkflowDemoDebugExportV1["session"] => {
  if (!session) return null;
  const binding = session.contextBinding ?? null;
  return {
    ...session,
    contextBinding: binding
      ? {
          schema: binding.schema,
          bindingId: binding.bindingId,
          sourceKind: binding.sourceKind,
          objectiveHash: binding.objectiveHash,
          sourceSessionId: binding.sourceSessionId,
          sourceMessageId: binding.sourceMessageId,
          sourceTraceId: binding.sourceTraceId,
          sourceMessageAt: binding.sourceMessageAt,
          confidence: binding.confidence,
          confirmedByOperator: binding.confirmedByOperator,
          boundAt: binding.boundAt,
          objective_included: false,
        }
      : null,
  };
};

export const buildHelixWorkflowDemoDebugExport = (input: {
  session: HelixWorkflowDemoSessionV1 | null;
  events: readonly HelixWorkflowDemoDebugEventV1[];
  target: HelixWorkflowDemoDebugTargetV1;
  exportedAt?: string;
}): HelixWorkflowDemoDebugExportV1 => {
  const currentTurnEvents = input.events.filter((event) => eventMatchesTarget(event, input.target));
  const replyCreatedAtMs = input.target.reply_created_at_ms;
  const postFinalAmendments = currentTurnEvents.filter((event) => {
    if (replyCreatedAtMs === null) return event.amends_debug_for_turn_id !== null;
    const eventAtMs = Date.parse(event.at);
    return Number.isFinite(eventAtMs) && eventAtMs >= replyCreatedAtMs;
  });
  const activeRunId = currentTurnEvents.at(-1)?.run_id ?? input.session?.runId ?? null;
  const runEventTail = input.events
    .filter((event) => activeRunId !== null && event.run_id === activeRunId)
    .slice(-DEBUG_RUN_TAIL_LIMIT);
  return {
    schema: HELIX_WORKFLOW_DEMO_DEBUG_SCHEMA,
    exported_at: input.exportedAt ?? new Date().toISOString(),
    target_reply: input.target,
    session: sanitizeHelixWorkflowDemoSessionForDebug(input.session),
    current_turn_events: currentTurnEvents,
    post_final_amendments: postFinalAmendments,
    run_event_tail: runEventTail,
    observed_artifact_refs: uniqueStrings(currentTurnEvents.flatMap((event) => event.observed_artifact_refs)),
    current_turn_event_count: currentTurnEvents.length,
    run_event_count: runEventTail.length,
    runtime_goal_lane_attached: false,
    answer_authority: false,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
  };
};
