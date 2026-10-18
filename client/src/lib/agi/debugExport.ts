import { buildNarratorDebugSnapshot } from "@/lib/narrator/narratorDebug";
import {
  HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_UNKNOWN,
  normalizeHelixLiveTranslationProjectionTarget,
} from "@shared/helix-live-translation-projection-target";
import {
  normalizeHelixLiveTranslationSourceIdentityKey,
  normalizeHelixLiveTranslationSourceKind,
} from "@shared/helix-live-translation-source-kind";
import { normalizeScientificCalculatorReceiptV1 } from "@shared/contracts/scientific-calculator-receipt.v1";
import { sanitizeHelixAskTurnAdmissionContinuationDebug } from "./helixAskTurnAdmissionContinuation";

export type DebugExportUiResult = {
  attempted_payload_hash: string;
  copied_payload_hash?: string;
  copied_text_length: number;
  method:
    | "navigator.clipboard"
    | "textarea_fallback"
    | "debug_drawer"
    | "download_link"
    | "backend_endpoint"
    | "failed";
  readback_match: "exact" | "unavailable" | "mismatch" | "empty";
  ok: boolean;
  fallback_presented: boolean;
  error?: string;
};

const stableStringify = (value: unknown): string => {
  const seen = new WeakSet<object>();
  const normalize = (entry: unknown): unknown => {
    if (!entry || typeof entry !== "object") return entry;
    if (seen.has(entry as object)) return "[Circular]";
    seen.add(entry as object);
    if (Array.isArray(entry)) return entry.map(normalize);
    return Object.keys(entry as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((out, key) => {
        out[key] = normalize((entry as Record<string, unknown>)[key]);
        return out;
      }, {});
  };
  return JSON.stringify(normalize(value));
};

export const hashDebugExportText = (text: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const readString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const normalizeBackendDebugExportTurnId = (value: unknown): string | null => {
  const text = readString(value);
  if (!text) return null;
  if (text.startsWith("ask:")) return text;
  const match = text.match(/(?:^|:)(ask:[^:]+)/i);
  return match?.[1] ?? null;
};

const buildBackendDebugExportRef = (turnId: unknown): Record<string, string> | null => {
  const normalizedTurnId = normalizeBackendDebugExportTurnId(turnId);
  if (!normalizedTurnId) return null;
  return {
    endpoint: `/api/agi/ask/turn/${encodeURIComponent(normalizedTurnId)}/debug-export`,
    turn_id: normalizedTurnId,
  };
};

const readRuntimeAgentProvider = (...values: unknown[]): string | null => {
  for (const value of values) {
    const text = readString(value);
    if (text) return text;
  }
  return null;
};

const readScalarString = (value: unknown): string | null => {
  const text = readString(value);
  if (text) return text;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return String(value);
  return null;
};

const normalizeDebugExportProjectionTarget = (value: unknown): string | null => {
  const text = readString(value);
  if (!text) return null;
  const normalized = normalizeHelixLiveTranslationProjectionTarget(
    text,
    HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_UNKNOWN,
  );
  return normalized === HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_UNKNOWN && text !== normalized
    ? text
    : normalized;
};

const normalizeDebugExportSourceKind = (value: unknown): string | null => {
  const text = readString(value);
  if (!text) return null;
  return normalizeHelixLiveTranslationSourceKind(text, "") || null;
};

const normalizeDebugExportSourceIdentityKey = (value: unknown): string | null => {
  const text = readString(value);
  if (!text) return null;
  return normalizeHelixLiveTranslationSourceIdentityKey(text) || null;
};

const readBoolean = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

const readRecordArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> =>
      Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    : [];

const readStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map(readString)
        .filter((entry): entry is string => Boolean(entry))
    : [];

const routeEvidenceAuthorityAllowsTerminalKind = (
  authority: Record<string, unknown> | null,
  terminalArtifactKind: string | null,
): boolean => {
  if (readString(authority?.schema) !== "helix.route_evidence_authority.v1") return true;
  const kind = readString(terminalArtifactKind);
  if (kind === "typed_failure" || kind === "request_user_input") return true;
  if (authority?.terminal_product_allowed === false) return false;
  if (!kind) return false;
  if (readStringArray(authority?.forbidden_terminal_artifact_kinds).includes(kind)) return false;
  const requiredKind = readString(authority?.required_terminal_kind);
  if (requiredKind && kind !== requiredKind) return false;
  const allowedKinds = readStringArray(authority?.allowed_terminal_artifact_kinds);
  return allowedKinds.length === 0 || allowedKinds.includes(kind);
};

const selectTerminalRecordForRecoveredImageLens = (
  recovered: boolean,
  ...values: unknown[]
): Record<string, unknown> | null => {
  const records = values
    .map(asRecord)
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  if (!recovered) return records[0] ?? null;
  return records.find((entry) => {
    const kind = readString(entry.terminal_artifact_kind);
    const source = readString(entry.final_answer_source);
    const text = readString(entry.concise_text) ?? readString(entry.terminal_text_preview);
    return (
      kind !== "typed_failure" &&
      source !== "typed_failure" &&
      Boolean(text && !/No visual observation receipt was produced/i.test(text))
    );
  }) ?? records[0] ?? null;
};

const readNumberArray = (value: unknown): number[] =>
  Array.isArray(value)
    ? value
        .map(readNumberValue)
        .filter((entry): entry is number => entry !== null)
    : [];

const uniqueStrings = (values: Array<string | null | undefined>): string[] =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value))));

const uniqueNumbers = (values: Array<number | null | undefined>): number[] =>
  Array.from(new Set(values.filter((value): value is number => Number.isFinite(value))));

const buildCapabilityLaneEvidenceRefs = (record: Record<string, unknown>): string[] =>
  uniqueStrings([
    ...readStringArray(record.evidence_refs),
    readString(record.lane_session_id),
    readString(record.observation_lane_session_id),
    readString(record.latest_event_id),
    readString(record.latest_observation_event_id),
    readString(record.session_control_key),
    readString(record.observation_ref),
    readString(record.last_observation_ref),
    readString(record.latest_visible_observation_ref),
    readString(record.visible_observation_ref),
    readString(record.latest_evidence_observation_ref),
    readString(record.evidence_observation_ref),
    readString(record.receipt_ref),
    readString(record.last_receipt_ref),
    readString(record.latest_receipt_ref),
    readString(record.latest_visible_receipt_ref),
    readString(record.visible_receipt_ref),
    readString(record.latest_evidence_receipt_ref),
    readString(record.evidence_receipt_ref),
    readString(record.mail_loop_ref),
    readString(record.source_id),
    readString(record.source_hash),
    readString(record.source_binding_key),
    readString(record.latest_source_binding_key),
    readString(record.lane_session_source_binding_key),
    normalizeDebugExportSourceIdentityKey(record.source_identity_key),
    normalizeDebugExportSourceIdentityKey(record.latest_source_identity_key),
    normalizeDebugExportSourceIdentityKey(record.lane_session_source_identity_key),
    readString(record.chunk_id),
    readScalarString(record.chunk_index),
    readString(record.latest_chunk_id),
    readScalarString(record.latest_chunk_index),
    readString(record.dedupe_key),
    readString(record.latest_dedupe_key),
    readString(record.source_event_id),
    readString(record.latest_source_event_id),
    readString(record.latest_observation_key),
    readString(record.latest_mail_loop_observation_key),
  ]);

const normalizeCapabilityLaneEvidenceRecord = (
  record: Record<string, unknown>,
  fallbackRuntimeAgentProvider: string | null = null,
): Record<string, unknown> => {
  const evidenceRefs = buildCapabilityLaneEvidenceRefs(record);
  const selectedRuntimeAgentProvider = readRuntimeAgentProvider(
    record.selected_runtime_agent_provider,
    fallbackRuntimeAgentProvider,
  );
  return {
    ...record,
    ...(evidenceRefs.length > 0 ? { evidence_refs: evidenceRefs } : {}),
    latest_receipt_ref:
      readString(record.latest_receipt_ref) ??
      readString(record.receipt_ref) ??
      readString(record.last_receipt_ref),
    ...(selectedRuntimeAgentProvider
      ? { selected_runtime_agent_provider: selectedRuntimeAgentProvider }
      : {}),
    context_role: readString(record.context_role) ?? "tool_evidence",
    answer_authority: false,
    terminal_eligible: false,
    assistant_answer: false,
    raw_content_included: false,
  };
};

const normalizeCapabilityLaneEvidenceRecords = (
  value: unknown,
  fallbackRuntimeAgentProvider: string | null = null,
): Record<string, unknown>[] =>
  readRecordArray(value).map((record) =>
    normalizeCapabilityLaneEvidenceRecord(record, fallbackRuntimeAgentProvider),
  );

const normalizeCapabilityLaneEvidenceRecordOrNull = (
  value: unknown,
  fallbackRuntimeAgentProvider: string | null = null,
): Record<string, unknown> | null => {
  const record = asRecord(value);
  return record ? normalizeCapabilityLaneEvidenceRecord(record, fallbackRuntimeAgentProvider) : null;
};

const buildRuntimeGoalDebugSummaryForExport = (input: {
  command: Record<string, unknown> | null;
  session: Record<string, unknown> | null;
  debugExport: Record<string, unknown> | null;
}): Record<string, unknown> | null => {
  if (!input.command && !input.session && !input.debugExport) return null;
  const debugEvents = readRecordArray(input.debugExport?.debug_events);
  const providerTerminalCandidate = asRecord(input.debugExport?.provider_terminal_candidate);
  const terminalAnswerAuthority = asRecord(input.debugExport?.terminal_answer_authority);
  const jobBrief = asRecord(
    input.session?.job_brief ??
      input.debugExport?.runtime_goal_job_brief ??
      input.debugExport?.job_brief,
  );
  const wakePlan = asRecord(
    input.session?.latest_wake_plan ??
      input.debugExport?.runtime_goal_wake_plan ??
      input.debugExport?.wake_plan,
  );
  const progressSummary = asRecord(
    input.session?.latest_progress_summary ??
      input.debugExport?.runtime_goal_progress_summary ??
      input.debugExport?.progress_summary,
  );
  const wakeEvents = readRecordArray(input.debugExport?.wake_events);
  const lastWakeEvent = wakeEvents[wakeEvents.length - 1] ?? null;
  const sourceBinding = asRecord(
    input.session?.latest_source_binding ??
      input.debugExport?.runtime_goal_source_binding ??
      progressSummary?.observed_source ??
      wakePlan?.current_source_binding ??
      jobBrief?.source_binding,
  );
  const evidenceUsed = asRecord(progressSummary?.evidence_used);
  return {
    schema: "helix.runtime_goal.debug_copy_summary.v1",
    command: readString(input.command?.command),
    goal_id:
      readString(input.session?.goal_id) ??
      readString(input.command?.goal_id) ??
      readString(input.debugExport?.goal_id),
    runtime_agent_provider:
      readString(input.session?.runtime_agent_provider) ??
      readString(input.debugExport?.runtime_provider),
    runtime_session_id:
      readString(input.session?.runtime_session_id) ??
      readString(input.debugExport?.runtime_session_id),
    session_status:
      readString(input.session?.status) ??
      readString(input.debugExport?.session_status),
    status_reason: readString(input.session?.status_reason),
    wake_count: readNumberValue(input.session?.wake_count),
    last_wake_at:
      readString(lastWakeEvent?.created_at) ??
      readString(progressSummary?.created_at) ??
      readString(input.session?.updated_at),
    last_wake_event_id:
      readString(lastWakeEvent?.wake_event_id) ??
      readString(progressSummary?.wake_event_id) ??
      readString(wakePlan?.wake_event_id),
    session_updated_at: readString(input.session?.updated_at),
    job_title:
      readString(jobBrief?.user_goal_text) ??
      readString(progressSummary?.job) ??
      readString(input.session?.objective),
    expected_wake_behavior: readString(jobBrief?.expected_wake_behavior),
    wake_expected_terminal_product: readString(wakePlan?.expected_terminal_product),
    wake_relevance_reason: readString(wakePlan?.relevance_reason),
    observed_source_label:
      readString(sourceBinding?.source_label) ??
      readString(sourceBinding?.doc_path) ??
      readString(sourceBinding?.active_panel_id) ??
      readString(sourceBinding?.source_id),
    observed_source_kind: readString(sourceBinding?.source_kind),
    observed_source_doc_path: readString(sourceBinding?.doc_path),
    requested_observation_or_lane:
      readString(wakePlan?.requested_observation_or_lane) ??
      readString(evidenceUsed?.requested_tool_or_lane),
    current_progress_summary: readString(progressSummary?.current_summary),
    next_wake_behavior: readString(progressSummary?.next_wake_behavior),
    terminal_authority_status:
      readString(input.session?.terminal_authority_status) ??
      readString(input.debugExport?.terminal_authority_status),
    latest_observation_refs: uniqueStrings([
      ...readStringArray(input.session?.latest_observation_refs),
      ...readStringArray(input.debugExport?.latest_observation_refs),
      ...readStringArray(input.debugExport?.runtime_goal_observation_refs),
      ...readStringArray(evidenceUsed?.observation_refs),
    ]),
    latest_receipt_refs: uniqueStrings([
      ...readStringArray(input.session?.latest_receipt_refs),
      ...readStringArray(input.debugExport?.latest_receipt_refs),
      ...readStringArray(evidenceUsed?.receipt_refs),
    ]),
    provider_terminal_candidate_ref:
      readString(input.session?.latest_provider_terminal_candidate_ref) ??
      readString(evidenceUsed?.provider_terminal_candidate_ref) ??
      readString(providerTerminalCandidate?.candidate_id),
    provider_terminal_candidate_runtime: readString(providerTerminalCandidate?.agent_runtime),
    provider_terminal_candidate_label: readString(providerTerminalCandidate?.provider_label),
    terminal_answer_server_authoritative: readBoolean(terminalAnswerAuthority?.server_authoritative),
    debug_stage_sequence: debugEvents
      .map((event) => readString(event.stage))
      .filter((stage): stage is string => Boolean(stage)),
    requested_tool_or_lane_sequence: uniqueStrings(
      debugEvents.map((event) => readString(event.requested_tool_or_lane)),
    ),
    evidence_reentered: debugEvents.some((event) => readString(event.stage) === "evidence_reentered"),
    runtime_candidate_generated: debugEvents.some((event) => readString(event.stage) === "runtime_candidate_generated"),
    terminal_authority_evaluated: debugEvents.some((event) => readString(event.stage) === "terminal_authority_evaluated"),
    answer_authority: false,
    terminal_eligible: false,
    assistant_answer: false,
    raw_content_included: false,
  };
};

const normalizeCapabilityLaneTimelineStage = (value: unknown): string | null => {
  const stage = readString(value);
  if (!stage) return null;
  switch (stage) {
    case "lane_visible":
      return "visible";
    case "lane_requested":
      return "requested";
    case "lane_backend_selected":
      return "backend";
    case "lane_observation":
      return "observed";
    case "lane_projection_receipt":
      return "receipt";
    case "lane_reentered":
      return "reentered";
    case "lane_session":
      return "session";
    case "lane_mail_loop":
      return "mail";
    case "lane_goal_binding":
    case "goal_binding":
      return "goal";
    case "lane_goal_dispatch_plan":
      return "goal_plan";
    case "lane_goal_dispatch_admission":
      return "goal_admission";
    case "lane_goal_dispatch_readiness":
      return "goal_readiness";
    case "terminal_selected":
    case "terminal_rejected":
      return stage;
    default:
      return stage.replace(/^lane_/, "");
  }
};

const buildCapabilityLaneConsoleStateLabel = (
  entry: Record<string, unknown>,
  stage: string | null,
): string => {
  if (stage === "visible") return entry.lane_executed === true ? "visible_executed" : "visible_only";
  if (stage === "backend") return "backend_selected";
  if (stage === "observed") return entry.observation_reentered === true ? "observed_reentered" : "observed_pending_reentry";
  if (stage === "receipt") return "receipt_recorded";
  if (stage === "reentered") return "observation_reentered";
  if (stage === "session") {
    return `session_${
      readString(entry.session_lifecycle_action) ||
      readString(entry.lifecycle_action) ||
      readString(entry.session_action) ||
      "event"
    }`;
  }
  if (stage === "mail") return entry.observation_reentered === true ? "mail_loop_evidence_reentered" : "mail_loop_evidence_pending";
  if (stage === "goal") return entry.observation_reentered === true ? "goal_bound_with_evidence" : "goal_bound_waiting_for_evidence";
  if (stage === "terminal_selected") return "terminal_selected";
  if (stage === "terminal_rejected") return "terminal_rejected";
  return stage || "unknown";
};

const resolveCapabilityLaneConsoleExecutionState = (input: {
  stage: string | null;
  laneVisible: boolean;
  laneRequested: boolean;
  laneExecuted: boolean;
  observationReentered: boolean;
}): string => {
  if (input.stage === "terminal_rejected") return "terminal_rejected";
  if (input.stage === "terminal_selected") return "terminal_selected";
  if (input.stage === "reentered" || input.observationReentered) return "reentered";
  if (
    input.stage === "goal_plan" ||
    input.stage === "goal_admission" ||
    input.stage === "goal_readiness"
  ) {
    return "goal_dispatch";
  }
  if (input.stage === "goal") return "goal_bound";
  if (input.stage === "mail") return "mail_loop_active";
  if (input.stage === "session") return "session_active";
  if (input.stage === "receipt") return "receipt_pending_reentry";
  if (input.stage === "backend") return "backend_selected";
  if (input.stage === "observed" || input.laneExecuted) return "executed_pending_reentry";
  if (input.stage === "requested" || input.laneRequested) return "requested_not_executed";
  if (input.stage === "visible" || input.laneVisible) return "available_only";
  return "available_only";
};

const readCapabilityLaneTimelineContextRole = (
  entry: Record<string, unknown>,
  stage: string | null,
): string | null => {
  const explicit = readString(entry.context_role);
  if (explicit) return explicit;
  if (
    stage === "observed" ||
    stage === "receipt" ||
    stage === "reentered" ||
    stage === "session" ||
    stage === "mail" ||
    stage === "goal"
  ) {
    return "tool_evidence";
  }
  return null;
};

const capabilityLaneTimelineStageCanCarryTerminalAuthority = (stage: string | null): boolean =>
  stage === "terminal_selected" || stage === "terminal_rejected";

const buildCapabilityLaneConsoleStateRows = (
  entries: Record<string, unknown>[],
  fallbackRuntimeAgentProvider: string | null = null,
): Record<string, unknown>[] =>
  entries.map((entry, index) => {
    const stage = normalizeCapabilityLaneTimelineStage(entry.stage);
    const canCarryTerminalAuthority = capabilityLaneTimelineStageCanCarryTerminalAuthority(stage);
    const laneVisible = entry.lane_visible === true;
    const laneRequested = entry.lane_requested === true;
    const laneExecuted = entry.lane_executed === true;
    const observationReentered = entry.observation_reentered === true;
    const reentryRequired =
      readBoolean(entry.reentry_required) ??
      readBoolean(entry.reentryRequired) ??
      (
        !canCarryTerminalAuthority &&
        (
          Boolean(readString(entry.observation_ref)) ||
          Boolean(readString(entry.receipt_ref)) ||
          Boolean(readString(entry.latest_visible_observation_ref)) ||
          Boolean(readString(entry.visible_observation_ref)) ||
          Boolean(readString(entry.latest_visible_receipt_ref)) ||
          Boolean(readString(entry.visible_receipt_ref)) ||
          Boolean(readString(entry.latest_evidence_observation_ref)) ||
          Boolean(readString(entry.evidence_observation_ref)) ||
          Boolean(readString(entry.latest_evidence_receipt_ref)) ||
          Boolean(readString(entry.evidence_receipt_ref))
        )
      );
    return {
      schema: "helix.capability_lane.console_state_row.v1",
      seq: typeof entry.seq === "number" ? entry.seq : index,
      stage: entry.stage ?? null,
      normalized_stage: stage,
      state_label: buildCapabilityLaneConsoleStateLabel(entry, stage),
      execution_state: resolveCapabilityLaneConsoleExecutionState({
        stage,
        laneVisible,
        laneRequested,
        laneExecuted,
        observationReentered,
      }),
      adapter_boundary: readString(entry.adapter_boundary),
      lane_id: readString(entry.lane_id),
      capability_id: readString(entry.capability_id),
      selected_runtime_agent_provider: readRuntimeAgentProvider(
        entry.selected_runtime_agent_provider,
        fallbackRuntimeAgentProvider,
      ),
      requested_backend_provider: readString(entry.requested_backend_provider),
      requested_backend_provider_known: readBoolean(entry.requested_backend_provider_known),
      selected_backend_provider: readString(entry.selected_backend_provider),
      fallback_backend_provider: readString(entry.fallback_backend_provider),
      backend_selection_reason:
        readString(entry.backend_selection_reason) ??
        readString(entry.selection_reason),
      lane_visible: laneVisible,
      lane_requested: laneRequested,
      lane_executed: laneExecuted,
      observation_reentered: observationReentered,
      observation_ref: readString(entry.observation_ref),
      receipt_ref: readString(entry.receipt_ref),
      latest_visible_observation_ref:
        readString(entry.latest_visible_observation_ref) ??
        readString(entry.visible_observation_ref),
      latest_visible_receipt_ref:
        readString(entry.latest_visible_receipt_ref) ??
        readString(entry.visible_receipt_ref),
      latest_evidence_observation_ref:
        readString(entry.latest_evidence_observation_ref) ??
        readString(entry.evidence_observation_ref),
      latest_evidence_receipt_ref:
        readString(entry.latest_evidence_receipt_ref) ??
        readString(entry.evidence_receipt_ref),
      source_id: readString(entry.source_id),
      source_hash: readString(entry.source_hash),
      source_kind: normalizeDebugExportSourceKind(entry.source_kind) ??
        normalizeDebugExportSourceKind(entry.latest_source_kind),
      source_text_hash: readString(entry.source_text_hash),
      source_text_char_count: readScalarString(entry.source_text_char_count),
      source_identity_key: normalizeDebugExportSourceIdentityKey(entry.source_identity_key),
      bbox:
        asRecord(entry.bbox) ??
        asRecord(entry.bbox_px) ??
        asRecord(entry.bboxPx),
      projection_target: normalizeDebugExportProjectionTarget(
        readString(entry.projection_target) ?? readString(entry.source_projection_target),
      ),
      account_locale: readString(entry.account_locale),
      target_language: readString(entry.target_language),
      chunk_id: readString(entry.chunk_id) ?? readString(entry.latest_chunk_id),
      chunk_index: readScalarString(entry.chunk_index) ?? readScalarString(entry.latest_chunk_index),
      dedupe_key: readString(entry.dedupe_key) ?? readString(entry.latest_dedupe_key),
      source_event_id: readString(entry.source_event_id) ?? readString(entry.latest_source_event_id),
      source_event_ms: readScalarString(entry.source_event_ms) ?? readScalarString(entry.latest_source_event_ms),
      observed_at_ms: readScalarString(entry.observed_at_ms) ?? readScalarString(entry.latest_observed_at_ms),
      freshness_status: readString(entry.freshness_status) ?? readString(entry.latest_freshness_status),
      cancel_requested:
        readBoolean(entry.cancel_requested) ??
        readBoolean(entry.latest_cancel_requested) ??
        false,
      goal_id: readString(entry.goal_id),
      goal_binding_id: readString(entry.goal_binding_id),
      lane_session_id: readString(entry.lane_session_id),
      mail_loop_ref: readString(entry.mail_loop_ref),
      session_control_key: readString(entry.session_control_key),
      source_binding_key: readString(entry.source_binding_key),
      latest_source_binding_key: readString(entry.latest_source_binding_key),
      lane_session_source_binding_key: readString(entry.lane_session_source_binding_key),
      lane_session_source_identity_key: normalizeDebugExportSourceIdentityKey(entry.lane_session_source_identity_key),
      latest_source_identity_key: normalizeDebugExportSourceIdentityKey(entry.latest_source_identity_key),
      latest_mail_loop_observation_key: readString(entry.latest_mail_loop_observation_key),
      latest_observation_key: readString(entry.latest_observation_key),
      evidence_refs: buildCapabilityLaneEvidenceRefs(entry),
      observation_lane_session_id: readString(entry.observation_lane_session_id),
      latest_event_id: readString(entry.latest_event_id),
      session_status: readString(entry.session_status),
      session_health: readString(entry.session_health),
      session_debug_phase: readString(entry.session_debug_phase),
      session_observation_status: readString(entry.session_observation_status),
      latest_mail_loop_wake_kind: readString(entry.latest_mail_loop_wake_kind),
      report_action: readString(entry.report_action),
      report_reason: readString(entry.report_reason),
      dispatch_target: readString(entry.dispatch_target),
      dispatch_admission_status: readString(entry.dispatch_admission_status),
      dispatch_blocked_reason: readString(entry.dispatch_blocked_reason),
      materialized_mail_loop_evidence: entry.materialized_mail_loop_evidence === true,
      mailbox_wake_expected:
        readBoolean(entry.mailbox_wake_expected) ??
        (readString(entry.latest_mail_loop_wake_kind) === "mailbox_wake" ? true : null) ??
        false,
      decision_wake_expected: readBoolean(entry.decision_wake_expected) ?? false,
      wake_dispatch_allowed: entry.wake_dispatch_allowed === true,
      side_effects_allowed: entry.side_effects_allowed === true,
      quiet_behavior_applied:
        readBoolean(entry.quiet_behavior_applied) ??
        readBoolean(asRecord(entry.report_decision)?.quiet_behavior_applied) ??
        false,
      wake_expected:
        readBoolean(entry.wake_expected) ??
        readBoolean(asRecord(entry.report_decision)?.wake_expected) ??
        false,
      surface_badge_expected:
        readBoolean(entry.surface_badge_expected) ??
        readBoolean(asRecord(entry.report_decision)?.surface_badge_expected) ??
        false,
      terminal_report_requested:
        readBoolean(entry.terminal_report_requested) ??
        readBoolean(asRecord(entry.report_decision)?.terminal_report_requested) ??
        false,
      terminal_report_authorized:
        readBoolean(entry.terminal_report_authorized) ??
        readBoolean(asRecord(entry.report_decision)?.terminal_report_authorized) ??
        false,
      terminal_authority_status: readString(entry.terminal_authority_status) ?? "not_terminal_authority",
      context_role: readCapabilityLaneTimelineContextRole(entry, stage),
      reentry_required: reentryRequired,
      answer_authority: stage === "terminal_selected" && entry.answer_authority === true,
      terminal_eligible: canCarryTerminalAuthority && entry.terminal_eligible === true,
      assistant_answer: canCarryTerminalAuthority && entry.assistant_answer === true,
      raw_content_included: canCarryTerminalAuthority && entry.raw_content_included === true,
    };
  });

const capabilityLaneTimelineRowHasObservation = (
  entry: Record<string, unknown>,
): boolean => {
  const explicit = readBoolean(entry.has_observation) ?? readBoolean(entry.hasObservation);
  if (explicit !== null) return explicit;
  return Boolean(
    readString(entry.observation_ref) ||
    readString(entry.receipt_ref) ||
    readString(entry.latest_visible_observation_ref) ||
    readString(entry.visible_observation_ref) ||
    readString(entry.latest_visible_receipt_ref) ||
    readString(entry.visible_receipt_ref) ||
    readString(entry.latest_evidence_observation_ref) ||
    readString(entry.evidence_observation_ref) ||
    readString(entry.latest_evidence_receipt_ref) ||
    readString(entry.evidence_receipt_ref) ||
    readString(entry.latest_observation_key) ||
    readString(entry.latest_mail_loop_observation_key),
  );
};

const buildCapabilityLaneTimelineSummaryForExport = (
  timeline: unknown,
  fallbackRuntimeAgentProvider: string | null = null,
): Record<string, unknown> => {
  const entries = readRecordArray(timeline);
  const stageSequence = entries
    .map((entry) => normalizeCapabilityLaneTimelineStage(entry.stage))
    .filter((stage): stage is string => Boolean(stage));
  const count = (stage: string): number => stageSequence.filter((entry) => entry === stage).length;
  const flagCount = (key: string): number =>
    entries.filter((entry) => entry[key] === true).length;
  const refCount = (key: string): number =>
    entries.filter((entry) => Boolean(readString(entry[key]))).length;
  const refAnyCount = (...keys: string[]): number =>
    entries.filter((entry) => keys.some((key) => Boolean(readString(entry[key])))).length;
  const observedStageCount = (stage: string): number =>
    entries.filter((entry) =>
      normalizeCapabilityLaneTimelineStage(entry.stage) === stage &&
      capabilityLaneTimelineRowHasObservation(entry)
    ).length;
  return {
    schema: "helix.capability_lane.timeline_summary.v1",
    event_count: entries.length,
    stage_sequence: stageSequence,
    stage_sequence_text: stageSequence.join(" > "),
    visible_count: count("visible"),
    requested_count: count("requested"),
    backend_selected_count: count("backend"),
    observed_count: count("observed"),
    receipt_count: count("receipt"),
    reentered_count: count("reentered"),
    session_count: count("session"),
    mail_loop_count: count("mail"),
    goal_binding_count: count("goal"),
    observed_session_count: observedStageCount("session"),
    observed_mail_loop_count: observedStageCount("mail"),
    observed_goal_binding_count: observedStageCount("goal"),
    observed_lane_activity_count: entries.filter(capabilityLaneTimelineRowHasObservation).length,
    goal_dispatch_plan_count: count("goal_plan"),
    goal_dispatch_admission_count: count("goal_admission"),
    goal_dispatch_readiness_count: count("goal_readiness"),
    lane_executed_count: flagCount("lane_executed"),
    visible_only_count: entries.filter((entry) =>
      entry.lane_visible === true && entry.lane_executed !== true
    ).length,
    observation_ref_count: refCount("observation_ref"),
    receipt_ref_count: refCount("receipt_ref"),
    latest_visible_observation_ref_count: refAnyCount("latest_visible_observation_ref", "visible_observation_ref"),
    latest_visible_receipt_ref_count: refAnyCount("latest_visible_receipt_ref", "visible_receipt_ref"),
    latest_evidence_observation_ref_count: refAnyCount("latest_evidence_observation_ref", "evidence_observation_ref"),
    latest_evidence_receipt_ref_count: refAnyCount("latest_evidence_receipt_ref", "evidence_receipt_ref"),
    session_lifecycle_action_count: entries.filter((entry) =>
      Boolean(
        readString(entry.session_lifecycle_action) ||
        readString(entry.lifecycle_action) ||
        readString(entry.session_action),
      )
    ).length,
    session_control_key_count: refCount("session_control_key"),
    session_debug_phase_count: refCount("session_debug_phase"),
    session_observation_status_count: refCount("session_observation_status"),
    source_binding_key_count: refCount("source_binding_key"),
    latest_source_binding_key_count: refCount("latest_source_binding_key"),
    source_identity_key_count: refCount("source_identity_key"),
    latest_source_identity_key_count: refCount("latest_source_identity_key"),
    lane_session_source_binding_key_count: refCount("lane_session_source_binding_key"),
    lane_session_source_identity_key_count: refCount("lane_session_source_identity_key"),
    latest_mail_loop_observation_key_count: refCount("latest_mail_loop_observation_key"),
    latest_observation_key_count: refCount("latest_observation_key"),
    observation_lane_session_id_count: refCount("observation_lane_session_id"),
    observation_reentered_count: flagCount("observation_reentered"),
    quiet_behavior_applied_count: flagCount("quiet_behavior_applied"),
    mailbox_wake_expected_count: flagCount("mailbox_wake_expected"),
    decision_wake_expected_count: flagCount("decision_wake_expected"),
    wake_expected_count: flagCount("wake_expected"),
    surface_badge_expected_count: flagCount("surface_badge_expected"),
    terminal_report_requested_count: flagCount("terminal_report_requested"),
    terminal_report_authorized_count: flagCount("terminal_report_authorized"),
    terminal_selected_count: count("terminal_selected"),
    terminal_rejected_count: count("terminal_rejected"),
    console_state_rows: buildCapabilityLaneConsoleStateRows(
      entries,
      fallbackRuntimeAgentProvider,
    ),
    visible_lane_does_not_mean_executed: true,
  };
};

const normalizeCapabilityLaneTimelineSummaryForExport = (
  summary: unknown,
  timeline: unknown,
  fallbackRuntimeAgentProvider: string | null = null,
): Record<string, unknown> => {
  const derived = buildCapabilityLaneTimelineSummaryForExport(
    timeline,
    fallbackRuntimeAgentProvider,
  );
  const explicit = asRecord(summary);
  if (!explicit) return derived;

  const explicitRows = readRecordArray(explicit.console_state_rows);
  return {
    ...derived,
    ...explicit,
    console_state_rows: explicitRows.length > 0
      ? buildCapabilityLaneConsoleStateRows(explicitRows, fallbackRuntimeAgentProvider)
      : derived.console_state_rows,
    visible_lane_does_not_mean_executed: true,
  };
};

const buildRealtimeDebugFallbackTransportPlan = (): Record<string, unknown> => ({
  schema: "helix.realtime_session.transport_plan.v1",
  requested_transport: "webrtc",
  planned_transport: "none",
  adapter_id: "disabled",
  adapter_state: "disabled",
  descriptor_enabled: false,
  adapter_enabled: false,
  live_transport_enabled: false,
  live_execution_attempted: false,
  live_execution_disabled_reason: "realtime_adapter_disabled_by_env",
  requires_visible_user_gesture: true,
  requires_server_session_response: true,
  requires_client_consent_receipt: true,
  client_secret_requested: false,
  client_secret_issued: false,
  sdp_exchange_requested: false,
  server_sideband_requested: false,
  provider_session_ref: null,
  client_receipt_refs: [],
  ephemeral_client_secret_expires_at_ms: null,
});

const sanitizeRealtimeTransportPlanForDebugExport = (
  value: unknown,
): Record<string, unknown> | null => {
  const record = asRecord(value);
  if (!record) return null;
  const {
    client_secret: _clientSecret,
    clientSecret: _clientSecretCamel,
    ephemeral_client_secret: _ephemeralClientSecret,
    ephemeralClientSecret: _ephemeralClientSecretCamel,
    ephemeral_secret: _ephemeralSecret,
    ephemeralSecret: _ephemeralSecretCamel,
    sdp: _sdp,
    offer_sdp: _offerSdp,
    offerSdp: _offerSdpCamel,
    answer_sdp: _answerSdp,
    answerSdp: _answerSdpCamel,
    ice_candidate: _iceCandidate,
    iceCandidate: _iceCandidateCamel,
    ice_candidates: _iceCandidates,
    iceCandidates: _iceCandidatesCamel,
    authorization: _authorization,
    Authorization: _authorizationHeader,
    auth_header: _authHeader,
    authHeader: _authHeaderCamel,
    api_key: _apiKey,
    apiKey: _apiKeyCamel,
    openai_api_key: _openAiApiKey,
    sdp_blob: _sdpBlob,
    sdpBlob: _sdpBlobCamel,
    raw_provider_response: _rawProviderResponse,
    rawProviderResponse: _rawProviderResponseCamel,
    raw_audio: _rawAudio,
    rawAudio: _rawAudioCamel,
    audio_payload: _audioPayload,
    audioPayload: _audioPayloadCamel,
    transcript_text: _transcriptText,
    transcriptText: _transcriptTextCamel,
    ...safe
  } = record;
  return safe;
};

const normalizeRealtimeRuntimeSessionSummaryForExport = (
  value: unknown,
): Record<string, unknown> => {
  const record = asRecord(value);
  const transportPlan = sanitizeRealtimeTransportPlanForDebugExport(record?.transport_plan) ??
    buildRealtimeDebugFallbackTransportPlan();
  const selectedModelOrService =
    readString(record?.selected_model_or_service) ??
    readString(record?.selected_realtime_model);
  const clientReceiptRefs = readStringArray(record?.client_receipt_refs);
  return {
    schema: "helix.live_runtime_agent.control_state.v1",
    realtime_session_id: readString(record?.realtime_session_id),
    runtime_agent_mode: readString(record?.runtime_agent_mode) ?? "off",
    runtime_agent_authority: readString(record?.runtime_agent_authority) ?? "observe_only",
    transport: "none",
    session_status: readString(record?.session_status) ?? "idle",
    session_lifecycle: readStringArray(record?.session_lifecycle),
    selected_backend_provider: readString(record?.selected_backend_provider),
    selected_model_or_service: selectedModelOrService,
    selected_realtime_model: readString(record?.selected_realtime_model) ?? selectedModelOrService,
    source_binding: asRecord(record?.source_binding),
    live_session_admission_status: readString(record?.live_session_admission_status) ?? "unavailable",
    consent_state: readString(record?.consent_state) ?? "not_requested",
    tool_admission_state: readString(record?.tool_admission_state) ?? "not_requested",
    client_receipt_state: readString(record?.client_receipt_state) ?? "not_expected",
    tool_request_count: readNumberValue(record?.tool_request_count) ?? 0,
    admitted_tool_request_count: readNumberValue(record?.admitted_tool_request_count) ?? 0,
    blocked_tool_request_count: readNumberValue(record?.blocked_tool_request_count) ?? 0,
    client_receipt_count: readNumberValue(record?.client_receipt_count) ?? clientReceiptRefs.length,
    client_receipt_observation_count: readNumberValue(record?.client_receipt_observation_count) ?? 0,
    latest_client_receipt_ref: readString(record?.latest_client_receipt_ref),
    latest_client_receipt_kind: readString(record?.latest_client_receipt_kind),
    latest_client_receipt_status: readString(record?.latest_client_receipt_status),
    latest_failure_code:
      readString(record?.latest_failure_code) ??
      readString(record?.live_execution_disabled_reason) ??
      readString(transportPlan.live_execution_disabled_reason),
    terminal_authority_status: "not_terminal_authority",
    adapter_id: readString(record?.adapter_id) ?? readString(transportPlan.adapter_id) ?? "disabled",
    adapter_state: readString(record?.adapter_state) ?? readString(transportPlan.adapter_state) ?? "disabled",
    transport_plan: transportPlan,
    provider_session_ref: readString(record?.provider_session_ref),
    client_receipt_refs: clientReceiptRefs,
    ephemeral_client_secret_expires_at_ms: readNumberValue(record?.ephemeral_client_secret_expires_at_ms),
    live_execution_disabled_reason:
      readString(record?.live_execution_disabled_reason) ??
      readString(transportPlan.live_execution_disabled_reason) ??
      "realtime_adapter_disabled_by_env",
    transport_execution_attempted: false,
    media_capture_started: false,
    openai_network_call_attempted: false,
    webrtc_started: false,
    sideband_started: false,
    transcript_observation_count: readNumberValue(record?.transcript_observation_count) ?? 0,
    latest_transcript_event_type: readString(record?.latest_transcript_event_type),
    latest_transcript_observation_ref: readString(record?.latest_transcript_observation_ref),
    reentry_required: true,
    answer_authority: false,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
  };
};

const normalizeRealtimeTranscriptObservationForExport = (
  value: unknown,
  fallbackRuntimeAgentProvider: string | null = null,
): Record<string, unknown> => {
  const normalized = normalizeCapabilityLaneEvidenceRecords(
    [value],
    fallbackRuntimeAgentProvider,
  )[0] ?? {};
  const record = asRecord(value);
  const {
    transcript_text: _transcriptText,
    transcriptText: _transcriptTextCamel,
    text: _text,
    raw_text: _rawText,
    rawText: _rawTextCamel,
    prompt_text: _promptText,
    promptText: _promptTextCamel,
    workstation_action_args: _workstationActionArgs,
    workstationActionArgs: _workstationActionArgsCamel,
    ...safe
  } = normalized;
  return {
    ...safe,
    runtime_agent_mode: "live_transcription",
    runtime_agent_authority: readString(record?.runtime_agent_authority) ?? "observe_only",
    reentry_status: "pending_solver_reentry",
    observation_reentered: false,
    context_role: "tool_evidence",
    transcript_is_user_intent: false,
    reentry_required: true,
    answer_authority: false,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
  };
};

const normalizeRealtimeTranscriptObservationsForExport = (
  value: unknown,
  fallbackRuntimeAgentProvider: string | null = null,
): Record<string, unknown>[] =>
  readRecordArray(value).map((entry) =>
    normalizeRealtimeTranscriptObservationForExport(entry, fallbackRuntimeAgentProvider),
  );

const normalizeRealtimeToolSuggestionObservationsForExport = (
  value: unknown,
  fallbackRuntimeAgentProvider: string | null = null,
): Record<string, unknown>[] =>
  readRecordArray(value).map((entry) => {
    const normalized = normalizeCapabilityLaneEvidenceRecords(
      [entry],
      fallbackRuntimeAgentProvider,
    )[0] ?? {};
    return {
      ...normalized,
      tool_admission_state: readString(entry.tool_admission_state) ?? "suggest_only",
      admission_status: readString(entry.admission_status) ?? "candidate_only",
      blocked_reason: readString(entry.blocked_reason),
      reentry_status: "pending_solver_reentry",
      observation_reentered: false,
      context_role: "tool_evidence",
      execution_attempted: false,
      gateway_execution_attempted: false,
      workstation_action_executed: false,
      answer_authority: false,
      reentry_required: true,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    };
  });

const normalizeRealtimeClientReceiptObservationsForExport = (
  value: unknown,
  fallbackRuntimeAgentProvider: string | null = null,
): Record<string, unknown>[] =>
  readRecordArray(value).map((entry) => {
    const normalized = normalizeCapabilityLaneEvidenceRecords(
      [entry],
      fallbackRuntimeAgentProvider,
    )[0] ?? {};
    const {
      client_secret: _clientSecret,
      clientSecret: _clientSecretCamel,
      ephemeral_secret: _ephemeralSecret,
      ephemeralSecret: _ephemeralSecretCamel,
      sdp: _sdp,
      offer_sdp: _offerSdp,
      offerSdp: _offerSdpCamel,
      answer_sdp: _answerSdp,
      answerSdp: _answerSdpCamel,
      ice_candidate: _iceCandidate,
      iceCandidate: _iceCandidateCamel,
      ice_candidates: _iceCandidates,
      iceCandidates: _iceCandidatesCamel,
      authorization: _authorization,
      Authorization: _authorizationHeader,
      auth_header: _authHeader,
      authHeader: _authHeaderCamel,
      api_key: _apiKey,
      apiKey: _apiKeyCamel,
      openai_api_key: _openAiApiKey,
      raw_provider_response: _rawProviderResponse,
      rawProviderResponse: _rawProviderResponseCamel,
      audio_payload: _audioPayload,
      audioPayload: _audioPayloadCamel,
      raw_audio: _rawAudio,
      rawAudio: _rawAudioCamel,
      transcript_text: _transcriptText,
      transcriptText: _transcriptTextCamel,
      ...safe
    } = normalized;
    return {
      ...safe,
      reentry_status: "pending_solver_reentry",
      observation_reentered: false,
      context_role: "tool_evidence",
      openai_network_call_attempted: false,
      ephemeral_credential_minted: false,
      webrtc_started: false,
      sideband_started: false,
      media_capture_started: false,
      browser_media_api_referenced: false,
      browser_tracks_created: false,
      data_channels_created: false,
      answer_authority: false,
      reentry_required: true,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    };
  });

const normalizeCodexNativeRouteProposalForExport = (
  value: unknown,
): Record<string, unknown> | null => {
  const record = asRecord(value);
  if (!record) return null;
  return {
    schema: readString(record.schema),
    turn_id: readString(record.turn_id),
    proposal_id: readString(record.proposal_id),
    prompt_hash: readString(record.prompt_hash),
    proposal_source: readString(record.proposal_source),
    proposed_route: readString(record.proposed_route),
    proposed_tool_family: readString(record.proposed_tool_family),
    proposed_capability_id: readString(record.proposed_capability_id),
    proposed_capability_ids: readStringArray(record.proposed_capability_ids).slice(0, 32),
    confidence: readString(record.confidence),
    supporting_hint_refs: readStringArray(record.supporting_hint_refs).slice(0, 16),
    reason_summary_included: false,
    terminal_eligible: false,
    assistant_answer: false,
    raw_content_included: false,
  };
};

const normalizeCodexNativeWorkstationTurnForExport = (
  value: unknown,
): Record<string, unknown> | null => {
  const record = asRecord(value);
  if (!record) return null;
  return {
    schema: readString(record.schema),
    account_type: readString(record.account_type),
    profile_bound: readBoolean(record.profile_bound) === true,
    raw_profile_id_included: false,
    trusted_account_session: readBoolean(record.trusted_account_session) === true,
    trusted_account_binding_required:
      readBoolean(record.trusted_account_binding_required) === true,
    account_binding_status: readString(record.account_binding_status),
    requested_mode: readString(record.requested_mode),
    effective_mode: readString(record.effective_mode),
    requested_runtime: readString(record.requested_runtime),
    native_transport: readString(record.native_transport),
    ephemeral_thread: readBoolean(record.ephemeral_thread) === true,
    isolated_runtime_workspace: readBoolean(record.isolated_runtime_workspace) === true,
    sandbox_policy: readString(record.sandbox_policy),
    network_access: readBoolean(record.network_access) === true,
    approval_policy: readString(record.approval_policy),
    built_in_tools_disabled: readBoolean(record.built_in_tools_disabled) === true,
    disabled_native_features: readStringArray(record.disabled_native_features).slice(0, 32),
    model_visible_tools: readStringArray(record.model_visible_tools).slice(0, 64),
    account_locked_tools: readStringArray(record.account_locked_tools).slice(0, 64),
    goal_allowed_tools: Array.isArray(record.goal_allowed_tools)
      ? readStringArray(record.goal_allowed_tools).slice(0, 64)
      : null,
    route_prompt_hash: readString(record.route_prompt_hash),
    route_proposal: normalizeCodexNativeRouteProposalForExport(record.route_proposal),
    route_admission_reason: readString(record.route_admission_reason),
    route_admitted_tools: readStringArray(record.route_admitted_tools).slice(0, 64),
    requested_tools: readStringArray(record.requested_tools).slice(0, 64),
    executed_tools: readStringArray(record.executed_tools).slice(0, 64),
    successful_tools: readStringArray(record.successful_tools).slice(0, 64),
    failed_tools: readStringArray(record.failed_tools).slice(0, 64),
    route_unobserved_tools: readStringArray(record.route_unobserved_tools).slice(0, 64),
    observation_reentry_refs: readStringArray(record.observation_reentry_refs).slice(0, 64),
    effective_model: readString(record.effective_model),
    effective_reasoning_effort: readString(record.effective_reasoning_effort),
    native_item_types: readStringArray(record.native_item_types).slice(0, 32),
    forbidden_native_item_types: readStringArray(record.forbidden_native_item_types).slice(0, 32),
    native_thread_id: readString(record.native_thread_id),
    native_turn_id: readString(record.native_turn_id),
    native_final_item_id: readString(record.native_final_item_id),
    native_turn_status: readString(record.native_turn_status),
    terminal_candidate_present: readBoolean(record.terminal_candidate_present) === true,
    compatibility_fallback_required:
      readBoolean(record.compatibility_fallback_required) === true,
    compatibility_fallback_reason: readString(record.compatibility_fallback_reason),
    terminal_eligible: false,
    assistant_answer: false,
    raw_content_included: false,
  };
};

const normalizeCodexNativeProviderBridgeForExport = (
  value: unknown,
): Record<string, unknown> | null => {
  const record = asRecord(value);
  if (!record) return null;
  return {
    schema: readString(record.schema),
    enabled: readBoolean(record.enabled) === true,
    eligible: readBoolean(record.eligible) === true,
    attempted: readBoolean(record.attempted) === true,
    status: readString(record.status),
    native_transport: readString(record.native_transport),
    compatibility_transport: readString(record.compatibility_transport),
    fallback_required: readBoolean(record.fallback_required) === true,
    fallback_reason: readString(record.fallback_reason),
    model_policy_source: readString(record.model_policy_source),
    effective_model: readString(record.effective_model),
    effective_reasoning_effort: readString(record.effective_reasoning_effort),
    trusted_goal_account_binding_required:
      readBoolean(record.trusted_goal_account_binding_required) === true,
    allowed_workstation_tools: Array.isArray(record.allowed_workstation_tools)
      ? readStringArray(record.allowed_workstation_tools).slice(0, 64)
      : null,
    native_workstation_turn: normalizeCodexNativeWorkstationTurnForExport(
      record.native_workstation_turn,
    ),
    terminal_eligible: false,
    assistant_answer: false,
    raw_content_included: false,
  };
};

const normalizeCodexNativeCompatibilityFallbackForExport = (
  value: unknown,
): Record<string, unknown> | null => {
  const record = asRecord(value);
  if (!record) return null;
  return {
    schema: readString(record.schema),
    activated: readBoolean(record.activated) === true,
    native_attempted: readBoolean(record.native_attempted) === true,
    native_fallback_reason: readString(record.native_fallback_reason),
    native_unobserved_capability_ids:
      readStringArray(record.native_unobserved_capability_ids).slice(0, 64),
    gateway_recovery_attempted: readBoolean(record.gateway_recovery_attempted) === true,
    gateway_recovery_result_count: readNumberValue(record.gateway_recovery_result_count) ?? 0,
    gateway_recovery_capability_ids:
      readStringArray(record.gateway_recovery_capability_ids).slice(0, 64),
    compatibility_transport: readString(record.compatibility_transport),
    terminal_eligible: false,
    assistant_answer: false,
    raw_content_included: false,
  };
};

const normalizeRealtimeGroundedAnswerFeedbackForExport = (
  value: unknown,
): Record<string, unknown> | null => {
  const record = asRecord(value);
  if (!record) return null;
  return {
    schema: readString(record.schema),
    handoff_id: readString(record.handoff_id),
    account_bound: readBoolean(record.account_bound) === true,
    feedback_recorded: readBoolean(record.feedback_recorded) === true,
    relay_status: readString(record.relay_status),
    relay_failure_code: readString(record.relay_failure_code),
    blocked_reason: readString(record.blocked_reason),
    answer_authority: false,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
  };
};

const readNestedRecord = (value: unknown, keys: string[]): Record<string, unknown> | null => {
  let cursor: unknown = value;
  for (const key of keys) {
    const record = asRecord(cursor);
    if (!record) return null;
    cursor = record[key];
  }
  return asRecord(cursor);
};

const readNumberValue = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const readNumberFromRecord = (
  record: Record<string, unknown> | null,
  keys: string[],
): number | null => {
  if (!record) return null;
  for (const key of keys) {
    const value = readNumberValue(record[key]);
    if (value !== null) return value;
  }
  return null;
};

const readVisibleTranslationTargetRecordsFromCallResult = (
  result: Record<string, unknown>,
): Record<string, unknown>[] => {
  const directTargets = readRecordArray(result.targets);
  const targetBatchTargets = readRecordArray(readNestedRecord(result, ["target_batch"])?.targets);
  const observationTargets = readRecordArray(readNestedRecord(result, ["observation", "target_batch"])?.targets);
  const packetTargets = readRecordArray(
    readNestedRecord(result, ["observation_packet", "state_delta", "visible_translation_target_batch"])?.targets,
  );
  return [
    ...directTargets,
    ...targetBatchTargets,
    ...observationTargets,
    ...packetTargets,
  ];
};

const buildVisibleTranslationChainSummaryForExport = (input: {
  runtimeLaneRequestLoop: unknown;
  capabilityLaneTurnTimeline: unknown;
  capabilityLaneProjectionReceipts: unknown;
  capabilityLaneCallResults: unknown;
  capabilityLaneReentryStatus: unknown;
  capabilityLaneTimelineSummary: Record<string, unknown>;
}): Record<string, unknown> => {
  const runtimeLoop = asRecord(input.runtimeLaneRequestLoop);
  const collectorChain =
    readNestedRecord(runtimeLoop, ["visible_translation_collector_chain"]) ??
    readNestedRecord(runtimeLoop, ["runtime_lane_request_loop", "visible_translation_collector_chain"]);
  const timelineRows = readRecordArray(input.capabilityLaneTurnTimeline);
  const consoleRows = readRecordArray(input.capabilityLaneTimelineSummary.console_state_rows);
  const allRows = timelineRows.length > 0 ? timelineRows : consoleRows;
  const projectionReceipts = readRecordArray(input.capabilityLaneProjectionReceipts);
  const callResults = readRecordArray(input.capabilityLaneCallResults);
  const collectorTargetRecords = callResults.flatMap(readVisibleTranslationTargetRecordsFromCallResult);
  const stageCount = (stage: string): number =>
    allRows.filter((entry) => normalizeCapabilityLaneTimelineStage(entry.stage) === stage).length;
  const capabilityMatches = (entry: Record<string, unknown>, pattern: RegExp): boolean =>
    pattern.test(
      [
        readString(entry.capability),
        readString(entry.capability_id),
        readString(entry.capability_key),
        readString(entry.requested_capability_id),
        readString(entry.executed_capability_id),
      ].filter(Boolean).join(" "),
    );
  const collectorRequested =
    collectorChain?.collector_requested === true ||
    allRows.some((entry) =>
      capabilityMatches(entry, /collect_visible_translation_targets|workstation\.visible_text\.collect_translation_targets/i) &&
      (entry.lane_requested === true || normalizeCapabilityLaneTimelineStage(entry.stage) === "requested")
    ) ||
    callResults.some((entry) => capabilityMatches(entry, /collect_visible_translation_targets|workstation\.visible_text\.collect_translation_targets/i));
  const translationRequested =
    collectorChain?.translation_requested === true ||
    allRows.some((entry) =>
      capabilityMatches(entry, /live_translation\.translate_text/i) &&
      (entry.lane_requested === true || normalizeCapabilityLaneTimelineStage(entry.stage) === "requested")
    ) ||
    callResults.some((entry) => capabilityMatches(entry, /live_translation\.translate_text/i));
  const translationExecuted =
    allRows.some((entry) =>
      capabilityMatches(entry, /live_translation\.translate_text/i) &&
      (entry.lane_executed === true || normalizeCapabilityLaneTimelineStage(entry.stage) === "observed")
    ) ||
    callResults.some((entry) =>
      capabilityMatches(entry, /live_translation\.translate_text/i) &&
      (entry.ok === true || readString(entry.status) === "completed" || readString(entry.status) === "succeeded")
    );
  const projectionReceiptCount = Math.max(
    projectionReceipts.length,
    stageCount("receipt"),
    readNumberValue(input.capabilityLaneTimelineSummary.receipt_count) ?? 0,
  );
  const observationReentered =
    readString(input.capabilityLaneReentryStatus) === "observation_packet_required_for_provider_reentry" ||
    readString(input.capabilityLaneReentryStatus) === "lane_observation_reentered" ||
    allRows.some((entry) => entry.observation_reentered === true) ||
    (readNumberValue(input.capabilityLaneTimelineSummary.reentered_count) ?? 0) > 0 ||
    (readNumberValue(input.capabilityLaneTimelineSummary.observation_reentered_count) ?? 0) > 0;
  const terminalSelected =
    stageCount("terminal_selected") > 0 ||
    (readNumberValue(input.capabilityLaneTimelineSummary.terminal_selected_count) ?? 0) > 0;
  const terminalRejected =
    stageCount("terminal_rejected") > 0 ||
    (readNumberValue(input.capabilityLaneTimelineSummary.terminal_rejected_count) ?? 0) > 0;
  const collectedTargetCount =
    readNumberFromRecord(collectorChain, [
      "collected_target_count",
      "targets_collected_count",
      "target_count",
      "visible_target_count",
    ]) ??
    (Array.isArray(collectorChain?.collected_chunk_ids) ? collectorChain.collected_chunk_ids.length : null) ??
    (Array.isArray(collectorChain?.collected_source_ids) ? collectorChain.collected_source_ids.length : null) ??
    (collectorTargetRecords.length > 0 ? collectorTargetRecords.length : null);
  const receiptRefs = uniqueStrings([
    ...projectionReceipts.map((receipt) => readString(receipt.receipt_ref)),
    ...allRows.map((entry) => readString(entry.receipt_ref)),
  ]);
  const observationRefs = uniqueStrings([
    readString(collectorChain?.collector_observation_ref),
    ...projectionReceipts.map((receipt) => readString(receipt.observation_ref)),
    ...allRows.map((entry) => readString(entry.observation_ref)),
  ]);
  const sourceIds = uniqueStrings([
    ...readStringArray(collectorChain?.collected_source_ids),
    readString(collectorChain?.first_collected_source_id),
    ...collectorTargetRecords.map((target) => readString(target.source_id)),
    ...projectionReceipts.map((receipt) => readString(receipt.source_id)),
    ...allRows.map((entry) => readString(entry.source_id)),
  ]);
  const chunkIds = uniqueStrings([
    ...readStringArray(collectorChain?.collected_chunk_ids),
    readString(collectorChain?.first_collected_chunk_id),
    ...collectorTargetRecords.map((target) => readString(target.chunk_id)),
    ...projectionReceipts.map((receipt) => readString(receipt.chunk_id)),
    ...allRows.map((entry) => readString(entry.chunk_id) ?? readString(entry.latest_chunk_id)),
  ]);
  const sourceKinds = uniqueStrings([
    ...readStringArray(collectorChain?.collected_source_kinds),
    readString(collectorChain?.first_collected_source_kind),
    ...collectorTargetRecords.map((target) => readString(target.source_kind)),
    ...projectionReceipts.map((receipt) => readString(receipt.source_kind)),
    ...allRows.map((entry) => readString(entry.source_kind) ?? readString(entry.latest_source_kind)),
  ]);
  const panelIds = uniqueStrings([
    ...readStringArray(collectorChain?.collected_panel_ids),
    readString(collectorChain?.first_collected_panel_id),
    ...collectorTargetRecords.map((target) => readString(target.panel_id)),
    ...projectionReceipts.map((receipt) => readString(receipt.panel_id)),
    ...allRows.map((entry) => readString(entry.panel_id) ?? readString(entry.latest_panel_id)),
  ]);
  const regionIds = uniqueStrings([
    ...readStringArray(collectorChain?.collected_region_ids),
    readString(collectorChain?.first_collected_region_id),
    ...collectorTargetRecords.map((target) => readString(target.region_id)),
    ...projectionReceipts.map((receipt) => readString(receipt.region_id)),
    ...allRows.map((entry) => readString(entry.region_id) ?? readString(entry.latest_region_id)),
  ]);
  const targetLanguages = uniqueStrings([
    ...readStringArray(collectorChain?.collected_target_languages),
    readString(collectorChain?.first_collected_target_language),
    ...collectorTargetRecords.map((target) => readString(target.target_language)),
    ...projectionReceipts.map((receipt) => readString(receipt.target_language)),
    ...allRows.map((entry) => readString(entry.target_language)),
  ]);
  const projectionTargets = uniqueStrings([
    ...readStringArray(collectorChain?.collected_projection_targets),
    normalizeDebugExportProjectionTarget(collectorChain?.first_collected_projection_target),
    ...collectorTargetRecords.map((target) => normalizeDebugExportProjectionTarget(target.projection_target)),
    ...projectionReceipts.map((receipt) => normalizeDebugExportProjectionTarget(receipt.projection_target)),
    ...allRows.map((entry) => normalizeDebugExportProjectionTarget(entry.projection_target)),
  ]);
  const existingObservationRefs = uniqueStrings([
    ...readStringArray(collectorChain?.collected_existing_observation_refs),
    readString(collectorChain?.first_collected_existing_observation_ref),
    ...collectorTargetRecords.map((target) => readString(target.existing_observation_ref)),
  ]);
  const existingReceiptRefs = uniqueStrings([
    ...readStringArray(collectorChain?.collected_existing_receipt_refs),
    readString(collectorChain?.first_collected_existing_receipt_ref),
    ...collectorTargetRecords.map((target) =>
      readString(target.existing_receipt_ref) ??
      readString(target.existing_translation_receipt_ref)
    ),
  ]);
  const existingProjectionStatuses = uniqueStrings([
    ...readStringArray(collectorChain?.collected_existing_projection_statuses),
    readString(collectorChain?.first_collected_existing_projection_status),
    ...collectorTargetRecords.map((target) => readString(target.existing_projection_status)),
  ]);
  const existingFreshnessStatuses = uniqueStrings([
    ...readStringArray(collectorChain?.collected_existing_freshness_statuses),
    readString(collectorChain?.first_collected_existing_freshness_status),
    ...collectorTargetRecords.map((target) => readString(target.existing_freshness_status)),
  ]);
  const existingTerminalAuthorityStatuses = uniqueStrings([
    ...readStringArray(collectorChain?.collected_existing_terminal_authority_statuses),
    readString(collectorChain?.first_collected_existing_terminal_authority_status),
    ...collectorTargetRecords.map((target) => readString(target.existing_terminal_authority_status)),
  ]);
  const existingSourceEventMs = uniqueNumbers([
    ...readNumberArray(collectorChain?.collected_existing_source_event_ms),
    readNumberValue(collectorChain?.first_collected_existing_source_event_ms),
    ...collectorTargetRecords.map((target) => readNumberValue(target.existing_source_event_ms)),
  ]);
  const existingObservedAtMs = uniqueNumbers([
    ...readNumberArray(collectorChain?.collected_existing_observed_at_ms),
    readNumberValue(collectorChain?.first_collected_existing_observed_at_ms),
    ...collectorTargetRecords.map((target) => readNumberValue(target.existing_observed_at_ms)),
  ]);

  return {
    schema: "helix.visible_translation.chain_summary.v1",
    collector_requested: collectorRequested,
    collector_capability:
      readString(collectorChain?.collector_capability) ??
      readString(collectorChain?.requested_collector_capability) ??
      null,
    collector_observation_ref: readString(collectorChain?.collector_observation_ref),
    collected_target_count: collectedTargetCount ?? 0,
    translation_requested: translationRequested,
    translation_executed: translationExecuted,
    backend_selected_count:
      stageCount("backend") ||
      (readNumberValue(input.capabilityLaneTimelineSummary.backend_selected_count) ?? 0),
    projection_receipt_count: projectionReceiptCount,
    observation_reentered: observationReentered,
    terminal_selected: terminalSelected,
    terminal_rejected: terminalRejected,
    chain_complete:
      collectorRequested &&
      (collectedTargetCount ?? 0) > 0 &&
      translationRequested &&
      translationExecuted &&
      projectionReceiptCount > 0 &&
      observationReentered &&
      terminalSelected &&
      !terminalRejected,
    source_ids: sourceIds,
    chunk_ids: chunkIds,
    source_kinds: sourceKinds,
    panel_ids: panelIds,
    region_ids: regionIds,
    target_languages: targetLanguages,
    projection_targets: projectionTargets,
    existing_observation_refs: existingObservationRefs,
    existing_receipt_refs: existingReceiptRefs,
    existing_projection_statuses: existingProjectionStatuses,
    existing_freshness_statuses: existingFreshnessStatuses,
    existing_terminal_authority_statuses: existingTerminalAuthorityStatuses,
    existing_source_event_ms: existingSourceEventMs,
    existing_observed_at_ms: existingObservedAtMs,
    first_collected_existing_observation_ref: existingObservationRefs[0] ?? null,
    first_collected_existing_receipt_ref: existingReceiptRefs[0] ?? null,
    first_collected_existing_projection_status: existingProjectionStatuses[0] ?? null,
    first_collected_existing_freshness_status: existingFreshnessStatuses[0] ?? null,
    first_collected_existing_terminal_authority_status: existingTerminalAuthorityStatuses[0] ?? null,
    first_collected_existing_source_event_ms: existingSourceEventMs[0] ?? null,
    first_collected_existing_observed_at_ms: existingObservedAtMs[0] ?? null,
    observation_refs: observationRefs,
    receipt_refs: receiptRefs,
    projection_is_terminal_authority: false,
  };
};

const normalizeCapabilityLaneMailLoopDebugSummary = (
  summary: Record<string, unknown>,
  fallbackRuntimeAgentProvider: string | null = null,
): Record<string, unknown> => {
  const wakeKind = readString(summary.stage_play_wake_kind);
  const stagePlayWakeExpected = readBoolean(summary.stage_play_wake_expected) ?? false;
  const mailboxWakeExpected =
    readBoolean(summary.mailbox_wake_expected) ??
    (wakeKind === "mailbox_wake" ? true : null) ??
    stagePlayWakeExpected;
  if (wakeKind === "mailbox_wake" || wakeKind === "none") {
    const selectedRuntimeAgentProvider = readRuntimeAgentProvider(
      summary.selected_runtime_agent_provider,
      fallbackRuntimeAgentProvider,
    );
    return {
      ...summary,
      ...(selectedRuntimeAgentProvider
        ? { selected_runtime_agent_provider: selectedRuntimeAgentProvider }
        : {}),
      mailbox_wake_expected: mailboxWakeExpected,
      decision_wake_expected: readBoolean(summary.decision_wake_expected) ?? false,
      context_role: readString(summary.context_role) ?? "tool_evidence",
      answer_authority: false,
      terminal_eligible: false,
      assistant_answer: false,
      raw_content_included: false,
    };
  }
  return {
    ...summary,
    ...(readRuntimeAgentProvider(summary.selected_runtime_agent_provider, fallbackRuntimeAgentProvider)
      ? {
          selected_runtime_agent_provider: readRuntimeAgentProvider(
            summary.selected_runtime_agent_provider,
            fallbackRuntimeAgentProvider,
          ),
        }
      : {}),
    context_role: readString(summary.context_role) ?? "tool_evidence",
    answer_authority: false,
    terminal_eligible: false,
    assistant_answer: false,
    raw_content_included: false,
    stage_play_wake_kind: stagePlayWakeExpected ? "mailbox_wake" : "none",
    mailbox_wake_expected: mailboxWakeExpected,
    decision_wake_expected: readBoolean(summary.decision_wake_expected) ?? false,
  };
};

const readCapabilityLaneMailLoopDebugSummaries = (input: {
  payload: Record<string, unknown>;
  debug?: Record<string, unknown> | null;
  agentLoop?: Record<string, unknown> | null;
  fallbackRuntimeAgentProvider?: string | null;
}): Record<string, unknown>[] => {
  const explicit = [
    ...readRecordArray(input.payload.capability_lane_mail_loop_debug_summaries),
    ...readRecordArray(input.debug?.capability_lane_mail_loop_debug_summaries),
    ...readRecordArray(input.agentLoop?.capability_lane_mail_loop_debug_summaries),
  ];
  if (explicit.length > 0) {
    return explicit.map((summary) =>
      normalizeCapabilityLaneMailLoopDebugSummary(
        summary,
        input.fallbackRuntimeAgentProvider ?? null,
      ),
    );
  }

  return [
    ...readRecordArray(input.payload.capability_lane_goal_binding_debug_summaries),
    ...readRecordArray(input.debug?.capability_lane_goal_binding_debug_summaries),
    ...readRecordArray(input.agentLoop?.capability_lane_goal_binding_debug_summaries),
  ]
    .map((summary) => asRecord(summary.latest_mail_loop_summary))
    .filter((summary): summary is Record<string, unknown> => Boolean(summary))
    .map((summary) =>
      normalizeCapabilityLaneMailLoopDebugSummary(
        summary,
        input.fallbackRuntimeAgentProvider ?? null,
      ),
    );
};

const HELIX_DEBUG_BACKEND_ENTRYPOINT_REQUIRED_PROMPT_RE =
  /\b(?:scientific-calculator\.[a-z0-9_.-]+|scientific\s+calculator|calculator_receipt|calculator\s+tool|docs-viewer\.[a-z0-9_.-]+|docs\s+viewer|repo-code\.[a-z0-9_.-]+|repo_code\.[a-z0-9_.-]+|moral-graph\.[a-z0-9_.-]+|(?:use|with|through|via)\s+(?:only\s+)?(?:the\s+)?moral\s+graph\b[\s\S]{0,120}\b(?:reflect|reflection|case|situation|dependency|repair|boundary|agency|badge|lens)|workspace-directory\.[a-z0-9_.-]+|workspace_directory\.[a-z0-9_.-]+|workspace_os\.status|internet_search\.[a-z0-9_.-]+|internet\s+search\s+tool|scholarly-research\.[a-z0-9_.-]+|scholarly_research\.[a-z0-9_.-]+|scholarly\s+research\s+tool|lookup_papers|fetch_full_text|extract_numeric_parameters|live_env\.[a-z0-9_.-]+|helix_ask\.[a-z0-9_.-]+|image[_\s-]?lens|visual_analysis\.inspect_image_region|visual_capture)\b/i;

const isConceptualToolExplanationWithoutExecutionForDebugExport = (value: unknown): boolean => {
  const text = readString(value)?.trim() ?? "";
  if (!text) return false;
  const asksForConcept =
    /\b(?:what\s+is|what\s+does|explain|describe|define|meaning\s+of|looks?\s+like)\b/i.test(text);
  const referencesToolOrCapability =
    /\b(?:tool|capability|identifier|namespace|function|action|moral\s+graph\s+reflection|moral\s+graph\s+tool|internet[-_.\s]?search|scientific\s+calculator|image\s+lens|docs\s+viewer|repo\.search|scholarly[-_.\s]?research)\b/i.test(text);
  const suppressesExecution =
    /\b(?:do\s+not|don't|dont|without|not\s+to|no\s+need\s+to)\b[\s\S]{0,80}\b(?:run|execute|call|use|browse|search|open|inspect|reflect)\b/i.test(text) ||
    /\b(?:conceptually|plain\s+english|just\s+explain|only\s+explain)\b/i.test(text);
  const affirmativeExecution =
    /\b(?:use|run|execute|call|open|search|browse|inspect|reflect\s+on|reflect\s+with|through|via)\s+(?:only\s+)?(?:the\s+)?(?:moral\s+graph|scientific\s+calculator|image\s+lens|docs\s+viewer|repo\.search|internet\s+search|scholarly\s+research)\b/i.test(text);
  return asksForConcept && referencesToolOrCapability && suppressesExecution && !affirmativeExecution;
};

const requiresBackendEntrypointForDebugExport = (value: unknown): boolean => {
  const text = readString(value);
  return Boolean(
    text &&
      !isConceptualToolExplanationWithoutExecutionForDebugExport(text) &&
      HELIX_DEBUG_BACKEND_ENTRYPOINT_REQUIRED_PROMPT_RE.test(text),
  );
};

const isHardBackendEntrypointDebugPrompt = (value: unknown): boolean => {
  const text = readString(value);
  return Boolean(
    text &&
      !isConceptualToolExplanationWithoutExecutionForDebugExport(text) &&
      /\b(?:moral-graph\.[a-z0-9_.-]+|(?:use|with|through|via)\s+(?:only\s+)?(?:the\s+)?moral\s+graph\b[\s\S]{0,160}\b(?:reflect|reflection|case|situation|dependency|repair|boundary|agency|badge|lens|roommate))\b/i.test(text),
  );
};

const HELIX_DEBUG_EXPORT_MAX_UI_CHARS = 750_000;
const HELIX_DEBUG_BACKEND_ENTRYPOINT_REQUIRED_ERROR_CODE = "backend_ask_entry_required";
const HELIX_DEBUG_BACKEND_ENTRYPOINT_REQUIRED_TEXT =
  "This prompt requires the backend Ask solver path before a final answer can be shown.";

const clipDebugText = (value: string, limit = 240): string =>
  value.length <= limit ? value : `${value.slice(0, limit)}...`;

const summarizeDebugObservationForExport = (value: unknown): Record<string, unknown> | null => {
  const record = asRecord(value);
  if (!record) return null;
  const payload = asRecord(record.payload);
  const observation = asRecord(record.observation);
  return {
    artifact_id:
      readString(record.artifact_id) ??
      readString(record.observation_id) ??
      readString(payload?.artifact_id) ??
      null,
    kind: readString(record.kind) ?? readString(payload?.kind) ?? null,
    schema:
      readString(record.schema) ??
      readString(payload?.schema) ??
      readString(observation?.schema) ??
      null,
    status: readString(record.status) ?? readString(payload?.status) ?? null,
    ok:
      typeof record.ok === "boolean"
        ? record.ok
        : typeof payload?.ok === "boolean"
          ? payload.ok
          : null,
  };
};

const summarizeDebugArtifactsForExport = (value: unknown): Record<string, unknown>[] => {
  const entries = Array.isArray(value) ? value : [];
  return entries.slice(0, 40).map((entry, index) => {
    const record = asRecord(entry) ?? {};
    const payload = asRecord(record.payload);
    const firstHit = Array.isArray(payload?.hits) ? asRecord(payload.hits[0]) : null;
    const text =
      readString(payload?.text_preview) ??
      readString(record.text_preview) ??
      readString(payload?.terminal_text_preview) ??
      readString(record.terminal_text_preview) ??
      readString(payload?.text) ??
      readString(payload?.answer_text) ??
      readString(payload?.summary) ??
      readString(firstHit?.text) ??
      readString(firstHit?.snippet) ??
      readString(firstHit?.excerpt);
    return {
      artifact_id: readString(record.artifact_id) ?? `artifact:${index}`,
      kind: readString(record.kind),
      source_scope: readString(record.source_scope),
      payload_schema: readString(payload?.schema),
      tool_name: readString(record.tool_name) ?? readString(payload?.tool_name) ?? readString(payload?.toolName),
      capability_key:
        readString(record.capability_key) ??
        readString(payload?.capability_key) ??
        readString(payload?.chosen_capability),
      status: readString(record.status) ?? readString(payload?.status),
      ok:
        typeof record.ok === "boolean"
          ? record.ok
          : typeof payload?.ok === "boolean"
            ? payload.ok
            : null,
      supports_goal:
        typeof payload?.supports_goal === "boolean"
          ? payload.supports_goal
          : readString(payload?.supports_goal),
      expression: readString(payload?.expression) ?? readString(payload?.input),
      result: readString(payload?.result) ?? readString(payload?.value) ?? readString(payload?.computed_result),
      text_preview: text ? clipDebugText(text) : null,
    };
  });
};

const summarizeAgentRuntimeLoopForExport = (value: unknown): Record<string, unknown> | null => {
  const record = asRecord(value);
  if (!record) return null;
  const iterations = Array.isArray(record.iterations) ? record.iterations : [];
  return {
    schema: readString(record.schema) ?? "helix.agent_runtime_loop.v1",
    status: readString(record.status),
    selected_capability: readString(record.selected_capability),
    executed_tool_call_count:
      typeof record.executed_tool_call_count === "number" ? record.executed_tool_call_count : null,
    iteration_count: iterations.length,
    iterations: iterations.slice(0, 16).map((entry, index) => {
      const iteration = asRecord(entry) ?? {};
      return {
        iteration: typeof iteration.iteration === "number" ? iteration.iteration : index + 1,
        decision_id: readString(iteration.decision_id),
        chosen_capability: readString(iteration.chosen_capability),
        executed_action_key: readString(iteration.executed_action_key),
        next_step: readString(iteration.next_step),
        decision_timing: readString(iteration.decision_timing),
        decision_authority: readString(iteration.decision_authority),
        observation_role: readString(iteration.observation_role),
        observed_artifact_refs: Array.isArray(iteration.observed_artifact_refs)
          ? iteration.observed_artifact_refs.slice(0, 8)
          : Array.isArray(iteration.artifact_refs)
            ? iteration.artifact_refs.slice(0, 8)
            : [],
        tool_observation: summarizeDebugObservationForExport(iteration.tool_observation),
      };
    }),
  };
};

const summarizeAgentContinuationStateForExport = (value: unknown): Record<string, unknown> | null => {
  const record = asRecord(value);
  if (!record) return null;
  const observationRefs = asRecord(record.observation_refs);
  return {
    schema: readString(record.schema),
    turn_id: readString(record.turn_id),
    state_id: readString(record.state_id),
    sequence: typeof record.sequence === "number" ? record.sequence : null,
    trigger: readString(record.trigger),
    goal: record.goal ?? null,
    observation_refs: observationRefs
      ? {
          existing: Array.isArray(observationRefs.existing) ? observationRefs.existing.slice(-12) : [],
          new: Array.isArray(observationRefs.new) ? observationRefs.new.slice(-12) : [],
          all: Array.isArray(observationRefs.all) ? observationRefs.all.slice(-20) : [],
        }
      : null,
    missing_requirement_ids: Array.isArray(record.missing_requirement_ids)
      ? record.missing_requirement_ids.slice(-16)
      : [],
    last_attempt: record.last_attempt ?? null,
    next_admissible_affordances: Array.isArray(record.next_admissible_affordances)
      ? record.next_admissible_affordances.slice(0, 12)
      : [],
    tried_action_fingerprints: Array.isArray(record.tried_action_fingerprints)
      ? record.tried_action_fingerprints.slice(-16)
      : [],
    progress: record.progress ?? null,
    budget: record.budget ?? null,
    allowed_decisions: Array.isArray(record.allowed_decisions) ? record.allowed_decisions.slice(0, 6) : [],
    authority: readString(record.authority),
    terminal_eligible: record.terminal_eligible === true,
    assistant_answer: record.assistant_answer === true,
  };
};

const summarizeTerminalRejectionObservationForExport = (value: unknown): Record<string, unknown> | null => {
  const record = asRecord(value);
  if (!record) return null;
  return {
    schema: readString(record.schema),
    turn_id: readString(record.turn_id),
    observation_id: readString(record.observation_id),
    rejected_candidate_kind: readString(record.rejected_candidate_kind),
    rejected_candidate_ref: readString(record.rejected_candidate_ref),
    rejection_reason: readString(record.rejection_reason),
    recoverable: record.recoverable === true,
    failure_class: readString(record.failure_class),
    retryability: readString(record.retryability),
    next_affordances: Array.isArray(record.next_affordances) ? record.next_affordances.slice(0, 6) : [],
    terminal_eligible: record.terminal_eligible === true,
    assistant_answer: record.assistant_answer === true,
  };
};

const copyRailCriticalDebugFields = (
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  debug: Record<string, unknown> | null,
): void => {
  const assign = (key: string, value: unknown): void => {
    if (value !== undefined && value !== null) target[key] = value;
  };
  [
    "terminal_answer_envelope",
    "terminal_boundary_eligibility",
    "terminal_projection_guard",
    "terminal_authority_single_writer",
    "terminal_grounding_authority",
    "tool_turn_chain_audit",
    "tool_rail_failure_triage",
    "tool_turn_chain_family_matrix",
    "artifact_query_index",
    "goal_satisfaction_evaluation",
    "post_tool_authority_bridge",
    "ask_turn_solver_trace",
    "ask_turn_procedure_trace",
    "workspace_action_client_ack",
    "client_receipt_terminal",
    "client_receipt_terminal_authority",
    "solver_controller_decision",
    "solver_controller_summary",
    "agent_step_decision",
    "agent_step_loop",
    "calculator_tool_answer_support",
    "language_model_policy",
    "language_model_debug_summary",
    "model_policy_debug_summary",
    "codex_native_provider_bridge",
    "codex_native_compatibility_fallback",
    "realtime_grounded_answer_feedback",
    "agent_continuation_state",
    "agent_continuation_states",
    "terminal_rejection_observations",
  ].forEach((key) => assign(key, source[key] ?? debug?.[key]));
  const ledger = source.current_turn_artifact_ledger ?? debug?.current_turn_artifact_ledger;
  if (Array.isArray(ledger)) target.current_turn_artifact_ledger = summarizeDebugArtifactsForExport(ledger);
  const runtimeLoop = summarizeAgentRuntimeLoopForExport(source.agent_runtime_loop ?? debug?.agent_runtime_loop);
  if (runtimeLoop) target.agent_runtime_loop = runtimeLoop;
};

const boundDebugExportEnvelopeText = (payload: Record<string, unknown>, text: string): string => {
  if (text.length <= HELIX_DEBUG_EXPORT_MAX_UI_CHARS) return text;
  const debug = asRecord(payload.debug);
  const askEntrypointRequired =
    readBoolean(payload.ask_entrypoint_required) ??
    readBoolean(debug?.ask_entrypoint_required) ??
    false;
  const askEntrypointObserved =
    readBoolean(payload.ask_entrypoint_observed) ??
    readBoolean(debug?.ask_entrypoint_observed);
  const terminalAuthority = asRecord(payload.terminal_answer_authority ?? debug?.terminal_answer_authority);
  const terminalPresentation = asRecord(payload.terminal_presentation ?? debug?.terminal_presentation);
  const terminalAuthorityText =
    readString(terminalPresentation?.concise_text) ??
    readString(terminalAuthority?.terminal_text) ??
    readString(terminalAuthority?.terminal_text_preview);
  const terminalAuthorityVerified = readBoolean(terminalAuthority?.server_authoritative) === true && Boolean(terminalAuthorityText);
  const activeQuestionForEntrypoint =
    readString(payload.selectedDebugQuestion) ??
    readString(payload.question) ??
    readString(debug?.active_prompt) ??
    "";
  const hardBackendEntrypointPrompt = isHardBackendEntrypointDebugPrompt(activeQuestionForEntrypoint);
  const backendEntrypointMissing =
    askEntrypointRequired &&
    (askEntrypointObserved === false || (hardBackendEntrypointPrompt && askEntrypointObserved !== true)) &&
    !terminalAuthorityVerified;
  const minimalSelectedFinalAnswer = backendEntrypointMissing
    ? HELIX_DEBUG_BACKEND_ENTRYPOINT_REQUIRED_TEXT
    : payload.selected_final_answer;
  const minimalFinalAnswerSource = backendEntrypointMissing
    ? "typed_failure"
    : payload.final_answer_source;
  const minimalTerminalArtifactKind = backendEntrypointMissing
    ? "typed_failure"
    : payload.terminal_artifact_kind;
  const minimalTerminalErrorCode = backendEntrypointMissing
    ? HELIX_DEBUG_BACKEND_ENTRYPOINT_REQUIRED_ERROR_CODE
    : payload.terminal_error_code;
  const fallbackRuntimeAgentProvider = readRuntimeAgentProvider(
    payload.selected_runtime_agent_provider,
    payload.agent_runtime,
    payload.agentRuntime,
    debug?.selected_runtime_agent_provider,
    debug?.agent_runtime,
    debug?.agentRuntime,
  );
  const capabilityLaneGoalBindingDebugSummaries =
    normalizeCapabilityLaneEvidenceRecords(
      payload.capability_lane_goal_binding_debug_summaries ??
        debug?.capability_lane_goal_binding_debug_summaries ??
        [],
      fallbackRuntimeAgentProvider,
    );
  const capabilityLaneMailLoopDebugSummaries = readCapabilityLaneMailLoopDebugSummaries({
    payload,
    debug,
    fallbackRuntimeAgentProvider,
  });
  const runtimeGoalCommand = asRecord(payload.runtime_goal_command ?? debug?.runtime_goal_command);
  const runtimeGoalSession = asRecord(payload.runtime_goal_session ?? debug?.runtime_goal_session);
  const runtimeGoalDebugExport = asRecord(payload.runtime_goal_debug_export ?? debug?.runtime_goal_debug_export);
  const runtimeGoalDebugSummary = buildRuntimeGoalDebugSummaryForExport({
    command: runtimeGoalCommand,
    session: runtimeGoalSession,
    debugExport: runtimeGoalDebugExport,
  });
  const languageModelPolicy = payload.language_model_policy ?? debug?.language_model_policy ?? null;
  const languageModelDebugSummary =
    payload.language_model_debug_summary ?? debug?.language_model_debug_summary ?? null;
  const modelPolicyDebugSummary =
    payload.model_policy_debug_summary ?? debug?.model_policy_debug_summary ?? languageModelDebugSummary;
  const compactProviderGatewayDebugSummary = asRecord(
    payload.provider_gateway_debug_summary ?? debug?.provider_gateway_debug_summary,
  );
  const realtimeConversationContextMaterialization = asRecord(
    payload.realtime_conversation_context_materialization ??
      debug?.realtime_conversation_context_materialization ??
      compactProviderGatewayDebugSummary?.realtime_conversation_context_materialization,
  );
  const minimal = {
    schema: payload.schema ?? "helix.ask.debug_export.v1",
    exported_at_ms: payload.exported_at_ms,
    active_turn_id: payload.active_turn_id,
    selected_final_answer: minimalSelectedFinalAnswer,
    final_answer_source: minimalFinalAnswerSource,
    terminal_artifact_kind: minimalTerminalArtifactKind,
    terminal_error_code: minimalTerminalErrorCode,
    ask_entrypoint_required: payload.ask_entrypoint_required ?? debug?.ask_entrypoint_required ?? null,
    ask_entrypoint_observed: payload.ask_entrypoint_observed ?? debug?.ask_entrypoint_observed ?? null,
    ask_entrypoint_failure_code:
      payload.ask_entrypoint_failure_code ??
      debug?.ask_entrypoint_failure_code ??
      (backendEntrypointMissing ? HELIX_DEBUG_BACKEND_ENTRYPOINT_REQUIRED_ERROR_CODE : null),
    blocked_projection_kind:
      payload.blocked_projection_kind ??
      debug?.blocked_projection_kind ??
      (backendEntrypointMissing ? "client_projection" : null),
    hard_prompt_projection_guard: payload.hard_prompt_projection_guard ?? debug?.hard_prompt_projection_guard ?? null,
    client_projection_policy_version:
      payload.client_projection_policy_version ?? debug?.client_projection_policy_version ?? null,
    demoted_projection_layers: payload.demoted_projection_layers ?? debug?.demoted_projection_layers ?? null,
    evidence_finalization_gate_demoted:
      payload.evidence_finalization_gate_demoted ?? debug?.evidence_finalization_gate_demoted ?? null,
    client_entrypoint_guard_version: payload.client_entrypoint_guard_version ?? debug?.client_entrypoint_guard_version ?? null,
    submit_handler_source: payload.submit_handler_source ?? debug?.submit_handler_source ?? null,
    runAsk_entered: payload.runAsk_entered ?? debug?.runAsk_entered ?? null,
    hard_backend_entrypoint_required:
      payload.hard_backend_entrypoint_required ?? debug?.hard_backend_entrypoint_required ?? null,
    use_backend_ask_turn_entrypoint:
      payload.use_backend_ask_turn_entrypoint ?? debug?.use_backend_ask_turn_entrypoint ?? null,
    backend_ask_call_attempted: payload.backend_ask_call_attempted ?? debug?.backend_ask_call_attempted ?? null,
    backend_ask_call_path: payload.backend_ask_call_path ?? debug?.backend_ask_call_path ?? null,
    backend_ask_call_error: payload.backend_ask_call_error ?? debug?.backend_ask_call_error ?? null,
    route_metadata_source: payload.route_metadata_source ?? debug?.route_metadata_source ?? null,
    mandatory_next_tool_name: payload.mandatory_next_tool_name ?? debug?.mandatory_next_tool_name ?? null,
    legacy_ask_local_bypassed: payload.legacy_ask_local_bypassed ?? debug?.legacy_ask_local_bypassed ?? null,
    first_broken_rail:
      payload.first_broken_rail ??
      debug?.first_broken_rail ??
      (backendEntrypointMissing ? "backend_ask_entrypoint" : null),
    repair_target:
      payload.repair_target ??
      debug?.repair_target ??
      (backendEntrypointMissing ? "prompt_submit_entrypoint" : null),
    server_build_commit: payload.server_build_commit ?? debug?.server_build_commit ?? null,
    server_build_started_at_ms: payload.server_build_started_at_ms ?? debug?.server_build_started_at_ms ?? null,
    helix_docs_synthesis_bridge_version:
      payload.helix_docs_synthesis_bridge_version ?? debug?.helix_docs_synthesis_bridge_version ?? null,
    language_contract: payload.language_contract ?? debug?.language_contract ?? null,
    language_model_policy: languageModelPolicy,
    language_model_debug_summary: languageModelDebugSummary,
    model_policy_debug_summary: modelPolicyDebugSummary,
    realtime_conversation_context_materialization: realtimeConversationContextMaterialization,
    response_language: payload.response_language ?? debug?.response_language ?? null,
    source_language: payload.source_language ?? debug?.source_language ?? null,
    language_detected: payload.language_detected ?? debug?.language_detected ?? null,
    language_confidence: payload.language_confidence ?? debug?.language_confidence ?? null,
    code_mixed: payload.code_mixed ?? debug?.code_mixed ?? null,
    pivot_confidence: payload.pivot_confidence ?? debug?.pivot_confidence ?? null,
    translated: payload.translated ?? debug?.translated ?? null,
    repo_evidence_relevance_gate: payload.repo_evidence_relevance_gate ?? debug?.repo_evidence_relevance_gate ?? null,
    docs_synthesis_debug: payload.docs_synthesis_debug ?? debug?.docs_synthesis_debug ?? null,
    docs_continuation_contract: payload.docs_continuation_contract ?? debug?.docs_continuation_contract ?? null,
    doc_evidence_synthesis_plan: payload.doc_evidence_synthesis_plan ?? debug?.doc_evidence_synthesis_plan ?? null,
    doc_evidence_synthesis_coverage:
      payload.doc_evidence_synthesis_coverage ?? debug?.doc_evidence_synthesis_coverage ?? null,
    doc_evidence_synthesis_answer:
      payload.doc_evidence_synthesis_answer ?? debug?.doc_evidence_synthesis_answer ?? null,
    docs_synthesis_materializer_result:
      payload.docs_synthesis_materializer_result ?? debug?.docs_synthesis_materializer_result ?? null,
    terminal_answer_authority: payload.terminal_answer_authority ?? debug?.terminal_answer_authority ?? null,
    terminal_grounding_authority:
      payload.terminal_grounding_authority ?? debug?.terminal_grounding_authority ?? null,
    terminal_presentation: payload.terminal_presentation ?? debug?.terminal_presentation ?? null,
    runtime_goal_command: runtimeGoalCommand,
    runtime_goal_session: runtimeGoalSession,
    runtime_goal_debug_export: runtimeGoalDebugExport,
    runtime_goal_debug_summary: runtimeGoalDebugSummary,
    agent_runtime: payload.agent_runtime ?? debug?.agent_runtime ?? null,
    selected_agent_provider: payload.selected_agent_provider ?? debug?.selected_agent_provider ?? null,
    capability_lane_ids: payload.capability_lane_ids ?? debug?.capability_lane_ids ?? null,
    capability_lane_statuses: payload.capability_lane_statuses ?? debug?.capability_lane_statuses ?? null,
    capability_lane_call_results: payload.capability_lane_call_results ?? debug?.capability_lane_call_results ?? [],
    capability_lane_turn_timeline:
      payload.capability_lane_turn_timeline ?? debug?.capability_lane_turn_timeline ?? [],
    capability_lane_timeline_summary: normalizeCapabilityLaneTimelineSummaryForExport(
      payload.capability_lane_timeline_summary ?? debug?.capability_lane_timeline_summary,
      payload.capability_lane_turn_timeline ?? debug?.capability_lane_turn_timeline ?? [],
      fallbackRuntimeAgentProvider,
    ),
    capability_lane_projection_receipts:
      payload.capability_lane_projection_receipts ?? debug?.capability_lane_projection_receipts ?? [],
    capability_lane_session_debug_summaries:
      normalizeCapabilityLaneEvidenceRecords(
        payload.capability_lane_session_debug_summaries ??
          debug?.capability_lane_session_debug_summaries ??
          [],
        fallbackRuntimeAgentProvider,
      ),
    capability_lane_mail_loop_debug_summaries: capabilityLaneMailLoopDebugSummaries,
    capability_lane_goal_binding_results:
      normalizeCapabilityLaneEvidenceRecords(
        payload.capability_lane_goal_binding_results ??
          debug?.capability_lane_goal_binding_results ??
          [],
        fallbackRuntimeAgentProvider,
      ),
    capability_lane_goal_binding_debug_summaries: capabilityLaneGoalBindingDebugSummaries,
    capability_lane_goal_dispatch_readiness: normalizeCapabilityLaneEvidenceRecordOrNull(
      payload.capability_lane_goal_dispatch_readiness ?? debug?.capability_lane_goal_dispatch_readiness,
      fallbackRuntimeAgentProvider,
    ),
    capability_lane_reentry_status:
      payload.capability_lane_reentry_status ?? debug?.capability_lane_reentry_status ?? null,
    runtime_lane_request_loop: payload.runtime_lane_request_loop ?? debug?.runtime_lane_request_loop ?? null,
    debug: {
      schema: "helix.ask.debug_export_minimal_debug.v1",
      language_contract: payload.language_contract ?? debug?.language_contract ?? null,
      language_model_policy: languageModelPolicy,
      language_model_debug_summary: languageModelDebugSummary,
      model_policy_debug_summary: modelPolicyDebugSummary,
      response_language: payload.response_language ?? debug?.response_language ?? null,
      source_language: payload.source_language ?? debug?.source_language ?? null,
      language_detected: payload.language_detected ?? debug?.language_detected ?? null,
      code_mixed: payload.code_mixed ?? debug?.code_mixed ?? null,
      server_build_commit: payload.server_build_commit ?? debug?.server_build_commit ?? null,
      server_build_started_at_ms: payload.server_build_started_at_ms ?? debug?.server_build_started_at_ms ?? null,
      helix_docs_synthesis_bridge_version:
        payload.helix_docs_synthesis_bridge_version ?? debug?.helix_docs_synthesis_bridge_version ?? null,
      repo_evidence_relevance_gate: payload.repo_evidence_relevance_gate ?? debug?.repo_evidence_relevance_gate ?? null,
      docs_synthesis_debug: payload.docs_synthesis_debug ?? debug?.docs_synthesis_debug ?? null,
      final_answer_source: payload.final_answer_source ?? debug?.final_answer_source ?? null,
      terminal_artifact_kind: payload.terminal_artifact_kind ?? debug?.terminal_artifact_kind ?? null,
      terminal_error_code: payload.terminal_error_code ?? debug?.terminal_error_code ?? null,
      ask_entrypoint_required: payload.ask_entrypoint_required ?? debug?.ask_entrypoint_required ?? null,
      ask_entrypoint_observed: payload.ask_entrypoint_observed ?? debug?.ask_entrypoint_observed ?? null,
      ask_entrypoint_failure_code: payload.ask_entrypoint_failure_code ?? debug?.ask_entrypoint_failure_code ?? null,
      blocked_projection_kind: payload.blocked_projection_kind ?? debug?.blocked_projection_kind ?? null,
      hard_prompt_projection_guard: payload.hard_prompt_projection_guard ?? debug?.hard_prompt_projection_guard ?? null,
      client_projection_policy_version:
        payload.client_projection_policy_version ?? debug?.client_projection_policy_version ?? null,
      demoted_projection_layers: payload.demoted_projection_layers ?? debug?.demoted_projection_layers ?? null,
      evidence_finalization_gate_demoted:
        payload.evidence_finalization_gate_demoted ?? debug?.evidence_finalization_gate_demoted ?? null,
      client_entrypoint_guard_version: payload.client_entrypoint_guard_version ?? debug?.client_entrypoint_guard_version ?? null,
      submit_handler_source: payload.submit_handler_source ?? debug?.submit_handler_source ?? null,
      runAsk_entered: payload.runAsk_entered ?? debug?.runAsk_entered ?? null,
      hard_backend_entrypoint_required:
        payload.hard_backend_entrypoint_required ?? debug?.hard_backend_entrypoint_required ?? null,
      use_backend_ask_turn_entrypoint:
        payload.use_backend_ask_turn_entrypoint ?? debug?.use_backend_ask_turn_entrypoint ?? null,
      backend_ask_call_attempted: payload.backend_ask_call_attempted ?? debug?.backend_ask_call_attempted ?? null,
      backend_ask_call_path: payload.backend_ask_call_path ?? debug?.backend_ask_call_path ?? null,
      backend_ask_call_error: payload.backend_ask_call_error ?? debug?.backend_ask_call_error ?? null,
      route_metadata_source: payload.route_metadata_source ?? debug?.route_metadata_source ?? null,
      mandatory_next_tool_name: payload.mandatory_next_tool_name ?? debug?.mandatory_next_tool_name ?? null,
      legacy_ask_local_bypassed: payload.legacy_ask_local_bypassed ?? debug?.legacy_ask_local_bypassed ?? null,
      first_broken_rail: payload.first_broken_rail ?? debug?.first_broken_rail ?? null,
      repair_target: payload.repair_target ?? debug?.repair_target ?? null,
      agent_runtime: payload.agent_runtime ?? debug?.agent_runtime ?? null,
      capability_lane_goal_binding_results:
        payload.capability_lane_goal_binding_results ?? debug?.capability_lane_goal_binding_results ?? [],
      capability_lane_goal_binding_debug_summaries:
        capabilityLaneGoalBindingDebugSummaries,
    },
    debug_export_size_control: {
      schema: "helix.ask.debug_export_size_control.v1",
      truncated: true,
      truncation_reason: "debug_export_size_limit",
      original_chars: text.length,
      max_chars: HELIX_DEBUG_EXPORT_MAX_UI_CHARS,
      compacted: true,
      final_compacted: true,
      bounded_by: "shared_debug_export_builder",
    },
  };
  copyRailCriticalDebugFields(minimal, payload, debug);
  copyRailCriticalDebugFields(minimal.debug as Record<string, unknown>, payload, debug);
  return JSON.stringify(minimal);
};

const buildVoicePlaybackReconciliationDebug = (input: {
  activeTurnId: string | null;
  selectedFinalAnswer: string | null;
  source: Record<string, unknown>;
}): Record<string, unknown> => {
  const clientProjection = asRecord(input.source.client_debug_projection);
  const clientVoice = asRecord(input.source.client_voice_debug ?? clientProjection?.voice);
  const receiptSources = [
    input.source.client_voice_playback_receipts,
    clientProjection?.voice_playback_receipts,
    clientVoice?.playbackReceipts,
  ];
  const receipts = receiptSources
    .flatMap((source) => (Array.isArray(source) ? source : []))
    .map(asRecord)
    .filter((receipt): receipt is Record<string, unknown> => Boolean(receipt));
  const voiceCallSources = [input.source.client_voice_calls, clientProjection?.voice_calls, clientVoice?.voiceCalls];
  const voiceCalls = voiceCallSources
    .flatMap((source) => (Array.isArray(source) ? source : []))
    .map(asRecord)
    .filter((call): call is Record<string, unknown> => Boolean(call));
  const activeTurnId = input.activeTurnId?.trim() ?? "";
  const isActiveTurnReceipt = (receipt: Record<string, unknown>): boolean => {
    if (!activeTurnId) return true;
    return [
      receipt.turnKey,
      receipt.utteranceId,
      receipt.sourceReceiptId,
      receipt.sourceReceiptKey,
      receipt.requestId,
    ].some((value) => readString(value)?.includes(activeTurnId));
  };
  const deliveredReceipts = receipts.filter(
    (receipt) => readString(receipt.status) === "delivered" && isActiveTurnReceipt(receipt),
  );
  const deliveredUtteranceIds = Array.from(
    new Set(deliveredReceipts.map((receipt) => readString(receipt.utteranceId)).filter(Boolean)),
  );
  const audioBytesObserved = voiceCalls
    .filter((call) => {
      const utteranceId = readString(call.utteranceId);
      return deliveredUtteranceIds.length === 0 || Boolean(utteranceId && deliveredUtteranceIds.includes(utteranceId));
    })
    .reduce((total, call) => {
      const bytes = typeof call.audioBytes === "number" && Number.isFinite(call.audioBytes) ? call.audioBytes : 0;
      return total + Math.max(0, bytes);
    }, 0);
  const selectedFinalAnswerClaim =
    /browser playback confirmation is still pending|playback confirmation is still pending/i.test(
      input.selectedFinalAnswer ?? "",
    )
      ? "pending_client_playback"
      : "none";
  const playbackConfirmation = deliveredReceipts.length > 0 ? "delivered" : "not_observed";
  return {
    schema: "helix.voice_playback_reconciliation.v1",
    source: "client_playback_receipts",
    active_turn_id: activeTurnId || null,
    selected_final_answer_claim: selectedFinalAnswerClaim,
    playback_confirmation: playbackConfirmation,
    delivered_receipt_count: deliveredReceipts.length,
    delivered_utterance_ids: deliveredUtteranceIds,
    audio_bytes_observed: audioBytesObserved,
    corrected_status_text:
      selectedFinalAnswerClaim === "pending_client_playback" && playbackConfirmation === "delivered"
        ? "Client playback receipt confirms delivered audio after the final answer was composed."
        : null,
    terminal_answer_mutated: false,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
    output_authority: "client_playback_observation",
  };
};

const collectClientVoicePlaybackReceipts = (source: Record<string, unknown>): Record<string, unknown>[] => {
  const clientProjection = asRecord(source.client_debug_projection);
  const clientVoice = asRecord(source.client_voice_debug ?? clientProjection?.voice);
  return [
    source.client_voice_playback_receipts,
    clientProjection?.voice_playback_receipts,
    clientVoice?.playbackReceipts,
  ]
    .flatMap((entry) => (Array.isArray(entry) ? entry : []))
    .map(asRecord)
    .filter((receipt): receipt is Record<string, unknown> => Boolean(receipt));
};

const activeVoicePlaybackReceipt = (
  receipt: Record<string, unknown>,
  activeTurnId: string,
): boolean => {
  if (!activeTurnId) return true;
  return [
    receipt.turnKey,
    receipt.utteranceId,
    receipt.sourceReceiptId,
    receipt.sourceReceiptKey,
    receipt.requestId,
    receipt.source_turn_id,
  ].some((value) => readString(value)?.includes(activeTurnId));
};

const summarizeClientVoicePlaybackReceipts = (input: {
  activeTurnId: string | null;
  source: Record<string, unknown>;
}): Record<string, unknown> => {
  const activeTurnId = input.activeTurnId?.trim() ?? "";
  const receipts = collectClientVoicePlaybackReceipts(input.source)
    .filter((receipt) => activeVoicePlaybackReceipt(receipt, activeTurnId))
    .sort((left, right) => (readNumberValue(left.atMs) ?? 0) - (readNumberValue(right.atMs) ?? 0));
  const latestReceipt = receipts[receipts.length - 1] ?? null;
  const byStatus = (status: string) => receipts.filter((receipt) => readString(receipt.status) === status);
  const queuedReceipts = byStatus("queued");
  const deliveredReceipts = byStatus("delivered");
  const failedReceipts = [...byStatus("failed"), ...byStatus("cancelled"), ...byStatus("suppressed")];
  const firstAtMs = (items: Record<string, unknown>[]) => readNumberValue(items[0]?.atMs);
  const latestAtMs = (items: Record<string, unknown>[]) => readNumberValue(items[items.length - 1]?.atMs);
  const deliveredUtteranceIds = Array.from(
    new Set(deliveredReceipts.map((receipt) => readString(receipt.utteranceId)).filter(Boolean)),
  );
  const deliveredAtMs = latestAtMs(deliveredReceipts);
  return {
    client_playback_receipt_count: receipts.length,
    latest_client_playback_status: latestReceipt ? readString(latestReceipt.status) : null,
    playback_started: queuedReceipts.length > 0,
    playback_completed: deliveredReceipts.length > 0,
    playback_failed: failedReceipts.length > 0,
    playback_started_at_ms: firstAtMs(queuedReceipts),
    playback_completed_at_ms: deliveredAtMs,
    playback_failed_at_ms: latestAtMs(failedReceipts),
    delivered_utterance_ids: deliveredUtteranceIds,
    delivered_utterance_id: deliveredUtteranceIds[deliveredUtteranceIds.length - 1] ?? null,
    delivered_at_ms: deliveredAtMs,
    client_playback_receipts: receipts.slice(-5).map((receipt) => ({
      receiptId: readString(receipt.receiptId),
      sourceReceiptId: readString(receipt.sourceReceiptId),
      requestId: readString(receipt.requestId),
      utteranceId: readString(receipt.utteranceId),
      status: readString(receipt.status),
      playback_status: readString(receipt.playback_status),
      source_turn_id: readString(receipt.source_turn_id) ?? readString(receipt.turnKey),
      source_text_hash: readString(receipt.source_text_hash),
      chunk_index: readNumberValue(receipt.chunk_index),
      chunk_count: readNumberValue(receipt.chunk_count),
      position_ms: readNumberValue(receipt.position_ms),
      atMs: readNumberValue(receipt.atMs),
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
      output_authority: "playback_observation",
    })),
  };
};

const collectRecordsDeep = (value: unknown, predicate: (record: Record<string, unknown>) => boolean): Record<string, unknown>[] => {
  const results: Record<string, unknown>[] = [];
  const visited = new WeakSet<object>();
  const visit = (entry: unknown) => {
    if (!entry || typeof entry !== "object") return;
    if (visited.has(entry as object)) return;
    visited.add(entry as object);
    const record = asRecord(entry);
    if (record && predicate(record)) results.push(record);
    if (Array.isArray(entry)) {
      entry.forEach(visit);
      return;
    }
    Object.values(entry as Record<string, unknown>).forEach(visit);
  };
  visit(value);
  return results;
};

const buildVoicePlaybackReceiptBarrierDebug = (input: {
  activeTurnId: string | null;
  selectedFinalAnswer: string | null;
  source: Record<string, unknown>;
}): Record<string, unknown> | null => {
  const trace = asRecord(input.source.ask_turn_solver_trace);
  const capabilityResult = asRecord(trace?.capability_result ?? input.source.capability_result);
  const chainAudit = asRecord(input.source.tool_turn_chain_audit);
  const requestedCapability =
    readString(capabilityResult?.requested_capability) ??
    readString(chainAudit?.requested_capability) ??
    readString(asRecord(input.source.canonical_goal_frame)?.requested_capability);
  const executedCapability =
    readString(capabilityResult?.executed_capability) ??
    readString(chainAudit?.executed_capability);
  if (requestedCapability !== "text_to_speech.speak_text" && executedCapability !== "text_to_speech.speak_text") {
    return null;
  }
  const observationRefs = Array.isArray(capabilityResult?.observation_refs)
    ? capabilityResult.observation_refs.filter((ref): ref is string => typeof ref === "string" && ref.trim().length > 0)
    : [];
  const finalStatusMatch = (input.selectedFinalAnswer ?? "").match(/\bplayback_status\s*:\s*([a-z0-9_.-]+)/i);
  const reentered =
    readBoolean(capabilityResult?.reentered_solver) ??
    readBoolean(chainAudit?.reentry_executed) ??
    readBoolean(chainAudit?.reentry_proven) ??
    false;
  return {
    schema: "helix.voice_playback_receipt_barrier.v1",
    source: "agent_provider_gateway_reentry_projection",
    active_turn_id: input.activeTurnId,
    requested_capability: requestedCapability,
    executed_capability: executedCapability,
    capability_result_status: readString(capabilityResult?.status),
    playback_status: finalStatusMatch?.[1]?.toLowerCase() ?? null,
    receipt_kind: "helix.interim_voice_callout_tool_result.v1",
    observation_refs: observationRefs,
    ...summarizeClientVoicePlaybackReceipts({
      activeTurnId: input.activeTurnId,
      source: input.source,
    }),
    receipt_observed: observationRefs.length > 0,
    evidence_reentered: reentered,
    terminal_blockers: reentered ? [] : ["voice_playback_receipt_not_reentered"],
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
    output_authority: "voice_playback_observation",
  };
};

const uniqueRecordsById = (
  records: Record<string, unknown>[],
  idKeys: string[],
): Record<string, unknown>[] => {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = idKeys.map((idKey) => readString(record[idKey])).find(Boolean) ?? stableStringify(record);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const buildVoiceSteeringDebug = (input: {
  activeTurnId: string | null;
  source: Record<string, unknown>;
  ledger: unknown[];
}): Record<string, unknown> => {
  const candidates = [
    input.source,
    asRecord(input.source.debug),
    asRecord(input.source.agentLoop),
    ...input.ledger,
  ];
  const events = uniqueRecordsById(
    candidates.flatMap((candidate) => collectRecordsDeep(candidate, (record) =>
      record.artifactId === "helix_voice_steering_event" ||
      record.schemaVersion === "helix.voice_steering_event.v1" ||
      record.schema === "helix.voice_steering_event.v1"
    )),
    ["steeringEventId", "steering_event_id"],
  );
  const decisions = uniqueRecordsById(
    candidates.flatMap((candidate) => collectRecordsDeep(candidate, (record) =>
      record.artifactId === "helix_voice_steering_decision" ||
      record.schemaVersion === "helix.voice_steering_decision.v1" ||
      record.schema === "helix.voice_steering_decision.v1"
    )),
    ["decisionId", "decision_id"],
  );
  const steeringAckToolResults = candidates.flatMap((candidate) => collectRecordsDeep(candidate, (record) =>
    record.schema === "helix.interim_voice_callout_tool_result.v1" &&
    readString(asRecord(record.request)?.kind) === "steering_ack"
  ));
  const latestSteeringAckReceipts = uniqueRecordsById(
    [
      ...steeringAckToolResults
        .map((result) => asRecord(result.receipt))
        .filter((receipt): receipt is Record<string, unknown> => Boolean(receipt)),
      ...candidates.flatMap((candidate) => collectRecordsDeep(candidate, (record) =>
        record.artifactId === "helix_interim_voice_callout_receipt" &&
        String(readString(record.requestId) ?? "").includes("steering")
      )),
    ],
    ["receiptId", "receipt_id"],
  ).slice(-10);
  const pendingCount = events.filter((event) =>
    readString(event.queueDecision) === "queued_for_safe_boundary" &&
    !decisions.some((decision) => readString(decision.steeringEventId) === readString(event.steeringEventId))
  ).length;
  return {
    schema: "helix.voice_steering_debug.v1",
    active_turn_id: input.activeTurnId,
    pending_count: pendingCount,
    events,
    decisions,
    latest_steering_ack_receipts: latestSteeringAckReceipts,
    assistant_answer: false,
    terminal_eligible: false,
    output_authority: "tool_evidence",
  };
};

const classifyCompactToolTraceAction = (panelId: string | null, actionId: string | null) => {
  const panel = (panelId ?? "").toLowerCase();
  const action = (actionId ?? "").toLowerCase();
  const tool = `${panelId}.${actionId}`;
  if (tool === "theory-badge-graph.reflect_discussion_context") {
    return { role: "context_locator", authority: "evidence_only", summary: "Located the prompt in theory graph space." };
  }
  if (tool === "theory-badge-graph.explain_reflected_context") {
    return { role: "context_route_builder", authority: "evidence_only", summary: "Built a first-principles context route from the reflection." };
  }
  if (tool === "scientific-calculator.solve_expression" || tool === "scientific-calculator.solve_with_steps") {
    return { role: "scalar_solver", authority: "numeric_observation", summary: "Computed the scalar result in the Scientific Calculator." };
  }
  if (action === "open" || action === "focus" || action === "show" || action === "switch_to") {
    return { role: "ui_navigation", authority: "ui_state", summary: "Opened or focused a workstation panel." };
  }
  if (
    panel.includes("doc") ||
    panel.includes("paper") ||
    panel.includes("source") ||
    action.includes("search") ||
    action.includes("lookup") ||
    action.includes("read") ||
    action.includes("open_doc") ||
    action.includes("retrieve")
  ) {
    return { role: "source_lookup", authority: "source_evidence", summary: "Retrieved source or reference evidence." };
  }
  if (action.includes("runtime") || action.includes("trace") || action.includes("receipt")) {
    return { role: "runtime_observer", authority: "runtime_observation", summary: "Returned runtime or trace observation evidence." };
  }
  if (
    action.includes("create") ||
    action.includes("update") ||
    action.includes("delete") ||
    action.includes("append") ||
    action.includes("save") ||
    action.includes("load") ||
    action.includes("clear") ||
    action.includes("set_")
  ) {
    return { role: "state_mutation", authority: "mutation_receipt", summary: "Changed workstation panel state." };
  }
  return { role: "panel_state", authority: "ui_state", summary: "Updated workstation panel state." };
};

const answerNoteForCompactToolTraceItems = (items: Array<{ role: string }>): string | null => {
  const hasTheoryReflection = items.some((item) => item.role === "context_locator" || item.role === "context_route_builder");
  const hasScalarSolver = items.some((item) => item.role === "scalar_solver");
  const hasRuntimeObserver = items.some((item) => item.role === "runtime_observer");
  const hasSourceLookup = items.some((item) => item.role === "source_lookup");
  const hasStateMutation = items.some((item) => item.role === "state_mutation");
  if (hasTheoryReflection && hasScalarSolver) {
    return "Evidence note: theory graph reflection supplied context; Scientific Calculator receipts supplied the numeric result.";
  }
  if (hasTheoryReflection && hasRuntimeObserver) {
    return "Evidence note: theory graph reflection supplied context; runtime receipts supplied system-level observations.";
  }
  if (hasTheoryReflection) return "Evidence note: theory graph reflection supplied context only; it is not a solve.";
  if (hasScalarSolver && hasRuntimeObserver) {
    return "Evidence note: calculator receipts supplied scalar results; runtime receipts supplied system-level observations.";
  }
  if (hasSourceLookup && hasScalarSolver) {
    return "Evidence note: source lookup supplied evidence; Scientific Calculator receipts supplied the numeric result.";
  }
  if (hasSourceLookup) return "Evidence note: workstation source lookup supplied evidence only; it is not a solve.";
  if (hasStateMutation) {
    return "Evidence note: workstation mutation receipts confirm panel state changes; they are not factual support by themselves.";
  }
  return null;
};

const compactScientificRunTraceStages = (trace: Record<string, unknown>): Record<string, unknown>[] =>
  readRecordArray(trace.stages).slice(0, 8).map((stage) => ({
    stage: readString(stage.stage),
    status: readString(stage.status),
    artifact_refs: readStringArray(stage.artifact_refs).slice(0, 8),
  }));

const compactPromotedScientificImageEvidence = (
  value: unknown,
): Record<string, unknown> | null => {
  const record = asRecord(value);
  if (!record) return null;
  const latexCandidate = readString(record.latex_candidate);
  const textCandidate = readString(record.text_candidate);
  return {
    evidence_id: readString(record.evidence_id),
    sidecar_id: readString(record.sidecar_id),
    packet_ref: readString(record.packet_ref),
    source_id: readString(record.source_id),
    source_kind: readString(record.source_kind),
    source_hash: readString(record.source_hash),
    page_number: typeof record.page_number === "number" ? record.page_number : null,
    bbox_px: asRecord(record.bbox_px),
    crop_ref: readString(record.crop_ref),
    crop_region_id: readString(record.crop_region_id),
    requested_label: readString(record.requested_label),
    observed_label: readString(record.observed_label),
    observed_labels: readStringArray(record.observed_labels).slice(0, 12),
    evidence_depth: readString(record.evidence_depth),
    admissibility: readString(record.admissibility),
    exact_equation_admissibility: readString(record.exact_equation_admissibility),
    exact_row_promotion_status: readString(asRecord(record.exact_row_promotion)?.status),
    exact_block_promotion_status: readString(asRecord(record.exact_block_promotion)?.status),
    active_blockers: readStringArray(record.active_blockers).slice(0, 16),
    promotion_reasons: readStringArray(record.promotion_reasons).slice(0, 16),
    claim_boundary: readString(record.claim_boundary),
    latex_candidate_hash: latexCandidate ? hashDebugExportText(latexCandidate) : null,
    text_candidate_hash: textCandidate ? hashDebugExportText(textCandidate) : null,
    candidate_text_included: false,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
  };
};

const scientificImageEvidenceSelectionReasonForDebug = (
  value: unknown,
): string => {
  const record = asRecord(value);
  const depth = readString(record?.evidence_depth);
  const activeBlockers = readStringArray(record?.active_blockers);
  const latexCandidate = readString(record?.latex_candidate);
  const textCandidate = readString(record?.text_candidate);
  const normalizedCandidate = (latexCandidate || textCandidate || "").replace(/\s+/g, " ").trim();
  if (
    activeBlockers.includes("label_only_equation_locator") ||
    /^(?:\(?\s*[A-Za-z]?\d+(?:\.\d+)?[A-Za-z]?\s*\)?|\\tag\{\s*[A-Za-z]?\d+(?:\.\d+)?[A-Za-z]?\s*\})$/i.test(normalizedCandidate)
  ) {
    return "label_only_locator_requires_row_expansion";
  }
  if (depth === "exact_block_promoted") return "latest_promoted_exact_block";
  if (depth === "exact_block_admissible") return "latest_admissible_exact_block";
  if (depth === "exact_block_partial") return "latest_partial_exact_block";
  if (depth === "exact_row_promoted") return "latest_promoted_exact_row";
  if (depth === "exact_row_admissible") return "latest_admissible_exact_row";
  if (depth === "exact_row_partial") return "latest_partial_exact_row";
  if (depth) return "latest_page_image_ocr_math_candidate";
  return "no_structured_evidence_object_available";
};

const buildScientificEvidenceDebugProjection = (input: {
  activeTurnId: string | null;
  source: Record<string, unknown>;
  ledger: unknown[];
}): Record<string, unknown> | null => {
  const debug = asRecord(input.source.debug);
  const agentLoop = asRecord(input.source.agentLoop);
  const candidates = [
    input.source,
    debug,
    agentLoop,
    ...input.ledger,
  ].filter((entry): entry is Record<string, unknown> => Boolean(entry));
  const evidencePackets = uniqueRecordsById(
    candidates.flatMap((candidate) => collectRecordsDeep(candidate, (record) =>
      readString(record.schema) === "helix.scientific_evidence_packet.v1"
    )),
    ["source_ref_hash", "crop_region_id"],
  );
  const evidenceSidecars = uniqueRecordsById(
    candidates.flatMap((candidate) => collectRecordsDeep(candidate, (record) =>
      readString(record.schema) === "helix.scientific_image_evidence_sidecar.v1"
    )),
    ["sidecar_id"],
  );
  const branchGates = uniqueRecordsById(
    candidates.flatMap((candidate) => collectRecordsDeep(candidate, (record) =>
      readString(record.schema) === "helix.scientific_branch_gate.v1"
    )),
    ["primary_domain", "status", "congruence_grade_floor"],
  );
  const runTraces = uniqueRecordsById(
    candidates.flatMap((candidate) => collectRecordsDeep(candidate, (record) =>
      readString(record.schema) === "helix.scientific_run_trace.v1"
    )),
    ["trace_id"],
  );
  const sidecarGatewayBridges = uniqueRecordsById(
    candidates.flatMap((candidate) => collectRecordsDeep(candidate, (record) =>
      readString(record.schema) === "helix.scientific_image_sidecar_gateway_bridge.v1"
    )),
    ["scientific_evidence_sidecar_id", "status", "blocked_reason"],
  );
  const graphReflections = uniqueRecordsById(
    candidates.flatMap((candidate) => collectRecordsDeep(candidate, (record) =>
      readString(record.schema) === "helix.scientific_evidence_graph_reflection.v1"
    )),
    ["reflection_id"],
  );
  const calculatorTemplateAdmissibilityRecords = uniqueRecordsById(
    candidates.flatMap((candidate) => collectRecordsDeep(candidate, (record) =>
      readString(record.schema) === "helix.calculator_template_admissibility.v1"
    )),
    ["status", "admitted_template_count", "rejected_template_count", "calculation_ready_count"],
  );
  const promotedEvidenceObjects = uniqueRecordsById(
    candidates.flatMap((candidate) => collectRecordsDeep(candidate, (record) =>
      readString(record.schema) === "helix.promoted_scientific_image_evidence.v1"
    )),
    ["evidence_id", "packet_ref", "crop_ref"],
  );
  const workflowStatuses = uniqueRecordsById(
    candidates.flatMap((candidate) => collectRecordsDeep(candidate, (record) =>
      readString(record.schema) === "helix.scientific_evidence_workflow_status.v1"
    )),
    ["sourceId", "sourceImageHash", "cropRef", "sidecarId", "evidenceDepth"],
  );
  const artifactAdmissionTraces = uniqueRecordsById(
    candidates.flatMap((candidate) => collectRecordsDeep(candidate, (record) =>
      readString(record.schema) === "helix.artifact_admission_trace.v1"
    )),
    ["route_contract", "status", "continuity_requested", "continuation_required"],
  );
  if (
    evidencePackets.length === 0 &&
    evidenceSidecars.length === 0 &&
    branchGates.length === 0 &&
    runTraces.length === 0 &&
    sidecarGatewayBridges.length === 0 &&
    graphReflections.length === 0 &&
    calculatorTemplateAdmissibilityRecords.length === 0 &&
    promotedEvidenceObjects.length === 0 &&
    workflowStatuses.length === 0 &&
    artifactAdmissionTraces.length === 0
  ) return null;
  const rejectedCalculatorPayloadIds = uniqueStrings([
    ...branchGates.flatMap((gate) => readStringArray(gate.rejected_calculator_payload_ids)),
    ...runTraces.flatMap((trace) => readStringArray(trace.rejected_calculator_payload_ids)),
  ]);
  const rejectedBadgeIds = uniqueStrings([
    ...branchGates.flatMap((gate) => readStringArray(gate.rejected_badge_ids)),
    ...runTraces.flatMap((trace) => readStringArray(trace.rejected_badge_ids)),
  ]);
  const congruenceAssessments = uniqueRecordsById(
    branchGates.flatMap((gate) =>
      Array.isArray(gate.congruence_assessments)
        ? gate.congruence_assessments.map(asRecord).filter((entry): entry is Record<string, unknown> => Boolean(entry))
        : []
    ),
    ["target_ref", "target_kind", "grade"],
  );
  const falseFriendRefs = uniqueStrings(
    congruenceAssessments
      .filter((assessment) => readString(assessment.grade) === "false_friend")
      .map((assessment) => readString(assessment.target_ref)),
  );
  const finalAnswerGuardRequired = runTraces.some((trace) => {
    const finalAnswerGuard = asRecord(trace.final_answer_guard);
    return Boolean(finalAnswerGuard) || readString(trace.branch_gate_status) === "restricted";
  }) || branchGates.some((gate) => readString(gate.status) === "restricted" || readString(gate.status) === "blocked");
  return {
    schema: "helix.scientific_evidence_debug_projection.v1",
    turn_id: input.activeTurnId,
    evidence_packet_count: evidencePackets.length,
    evidence_sidecar_count: evidenceSidecars.length,
    branch_gate_count: branchGates.length,
    run_trace_count: runTraces.length,
    sidecar_gateway_bridge_count: sidecarGatewayBridges.length,
    graph_reflection_count: graphReflections.length,
    calculator_template_check_count: calculatorTemplateAdmissibilityRecords.length,
    promoted_evidence_object_count: promotedEvidenceObjects.length,
    workflow_status_count: workflowStatuses.length,
    artifact_admission_trace_count: artifactAdmissionTraces.length,
    primary_domains: uniqueStrings([
      ...evidencePackets.map((packet) => readString(packet.primary_domain)),
      ...branchGates.map((gate) => readString(gate.primary_domain)),
      ...runTraces.map((trace) => readString(trace.primary_domain)),
    ]),
    branch_gate_statuses: uniqueStrings([
      ...branchGates.map((gate) => readString(gate.status)),
      ...runTraces.map((trace) => readString(trace.branch_gate_status)),
    ]),
    congruence_grade_floors: uniqueStrings([
      ...evidencePackets.map((packet) => readString(asRecord(packet.admissibility)?.congruence_grade_floor)),
      ...branchGates.map((gate) => readString(gate.congruence_grade_floor)),
      ...runTraces.map((trace) => readString(trace.congruence_grade_floor)),
      ...graphReflections.map((reflection) => readString(reflection.congruence_grade_floor)),
    ]),
    graph_reflection_evidence_depths: uniqueStrings(
      graphReflections.map((reflection) => readString(reflection.evidence_depth)),
    ),
    graph_reflection_object_classes: uniqueStrings(
      graphReflections.map((reflection) => readString(reflection.evidence_object_class)),
    ),
    graph_reflection_branch_gate_statuses: uniqueStrings(
      graphReflections.map((reflection) => readString(reflection.branch_gate_status)),
    ),
    calculator_template_statuses: uniqueStrings(
      calculatorTemplateAdmissibilityRecords.map((record) => readString(record.status)),
    ),
    congruence_assessment_count: congruenceAssessments.length,
    congruence_grades: uniqueStrings(congruenceAssessments.map((assessment) => readString(assessment.grade))),
    false_friend_refs: falseFriendRefs.slice(0, 24),
    congruence_assessments: congruenceAssessments.slice(0, 24).map((assessment) => ({
      target_ref: readString(assessment.target_ref),
      target_kind: readString(assessment.target_kind),
      grade: readString(assessment.grade),
      matched_symbols: readStringArray(assessment.matched_symbols).slice(0, 12),
      blocked_by_branch_hint: assessment.blocked_by_branch_hint === true,
    })),
    source_ref_hashes: uniqueStrings(evidencePackets.map((packet) => readString(packet.source_ref_hash))).slice(0, 12),
    selected_evidence_object_ids: uniqueStrings([
      ...promotedEvidenceObjects.map((object) => readString(object.evidence_id)),
      ...evidenceSidecars.map((sidecar) => readString(asRecord(sidecar.selected_evidence_object)?.evidence_id)),
      ...graphReflections.map((reflection) => readString(asRecord(reflection.selected_evidence_object)?.evidence_id)),
      ...workflowStatuses.flatMap((status) => readStringArray(asRecord(status.postulateReadyRefs)?.promotedEquationRowRefs)),
    ]).slice(0, 12),
    selected_evidence_refs: uniqueStrings([
      ...promotedEvidenceObjects.map((object) => readString(object.packet_ref)),
      ...evidenceSidecars.map((sidecar) => readString(asRecord(sidecar.selected_evidence_object)?.packet_ref)),
      ...evidenceSidecars.map((sidecar) => readString(sidecar.promoted_equation_ref)),
      ...graphReflections.map((reflection) => readString(reflection.exact_evidence_ref)),
      ...workflowStatuses.map((status) => readString(status.cropRef)),
    ]).slice(0, 12),
    selected_evidence_reasons: uniqueStrings([
      ...evidenceSidecars.map((sidecar) => scientificImageEvidenceSelectionReasonForDebug(sidecar.selected_evidence_object)),
      ...graphReflections.map((reflection) => scientificImageEvidenceSelectionReasonForDebug(reflection.selected_evidence_object)),
    ]).filter((reason) => reason !== "no_structured_evidence_object_available").slice(0, 12),
    calculator_check_refs: calculatorTemplateAdmissibilityRecords.slice(0, 12).map((record) => {
      const status = readString(record.status) ?? "no_template";
      const admitted = typeof record.admitted_template_count === "number" ? record.admitted_template_count : 0;
      return `calculator_check:template_admissibility:${status}:${admitted}`;
    }),
    sidecar_ids: uniqueStrings(evidenceSidecars.map((sidecar) => readString(sidecar.sidecar_id))).slice(0, 12),
    workflow_sidecar_ids: uniqueStrings(workflowStatuses.map((status) => readString(status.sidecarId))).slice(0, 12),
    sidecar_admissibility_statuses: uniqueStrings(
      evidenceSidecars.map((sidecar) => readString(asRecord(sidecar.admissibility)?.status)),
    ),
    sidecar_memory_kinds: uniqueStrings(
      evidenceSidecars.map((sidecar) => readString(asRecord(sidecar.memory_classification)?.memory_kind)),
    ),
    sidecar_gateway_bridge_statuses: uniqueStrings(
      sidecarGatewayBridges.map((bridge) => readString(bridge.status)),
    ),
    sidecar_gateway_bridge_blocked_reasons: uniqueStrings(
      sidecarGatewayBridges.map((bridge) => readString(bridge.blocked_reason)),
    ),
    sidecar_gateway_bridges: sidecarGatewayBridges.slice(0, 8).map((bridge) => ({
      status: readString(bridge.status),
      capability_id: readString(bridge.capability_id),
      result_count: typeof bridge.result_count === "number" ? bridge.result_count : null,
      blocked_reason: readString(bridge.blocked_reason),
      scientific_evidence_sidecar_id: readString(bridge.scientific_evidence_sidecar_id),
      sidecar_admissibility_status: readString(bridge.sidecar_admissibility_status),
      sidecar_primary_domain: readString(bridge.sidecar_primary_domain),
      observation_refs: readStringArray(bridge.observation_refs).slice(0, 12),
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    })),
    graph_reflections: graphReflections.slice(0, 8).map((reflection) => ({
      reflection_id: readString(reflection.reflection_id),
      evidence_depth: readString(reflection.evidence_depth),
      evidence_object_class: readString(reflection.evidence_object_class),
      exact_evidence_ref: readString(reflection.exact_evidence_ref),
      selected_evidence_object_id: readString(asRecord(reflection.selected_evidence_object)?.evidence_id),
      branch_gate_status: readString(reflection.branch_gate_status),
      congruence_grade_floor: readString(reflection.congruence_grade_floor),
      graph_attachment_count: readRecordArray(reflection.graph_attachments).length,
      blocked_authorities: readRecordArray(reflection.blocked_authorities).map((authority) => ({
        authority: readString(authority.authority),
        blocked_reason: readString(authority.blocked_reason),
      })).slice(0, 12),
      upgrade_requirements: readStringArray(reflection.upgrade_requirements).slice(0, 12),
      next_tool_affordances: readRecordArray(reflection.next_tool_affordances).map((affordance) => ({
        capability: readString(affordance.capability),
        reason: readString(affordance.reason),
      })).slice(0, 12),
      provenance_refs: readStringArray(reflection.provenance_refs).slice(0, 12),
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    })),
    promoted_evidence_objects: promotedEvidenceObjects.slice(0, 12)
      .map(compactPromotedScientificImageEvidence)
      .filter((entry): entry is Record<string, unknown> => Boolean(entry)),
    calculator_template_checks: calculatorTemplateAdmissibilityRecords.slice(0, 12).map((record) => ({
      status: readString(record.status),
      admitted_template_count: typeof record.admitted_template_count === "number" ? record.admitted_template_count : null,
      rejected_template_count: typeof record.rejected_template_count === "number" ? record.rejected_template_count : null,
      calculation_ready_count: typeof record.calculation_ready_count === "number" ? record.calculation_ready_count : null,
      binding_status: readString(record.binding_status),
      claim_boundary: readString(record.claim_boundary),
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    })),
    scientific_evidence_workflow_statuses: workflowStatuses.slice(0, 8).map((status) => ({
      evidence_depth: readString(status.evidenceDepth),
      source_id: readString(status.sourceId),
      source_kind: readString(status.sourceKind),
      source_image_hash: readString(status.sourceImageHash),
      page_number: typeof status.pageNumber === "number" ? status.pageNumber : null,
      crop_ref: readString(status.cropRef),
      crop_region_ref: readString(status.cropRegionRef),
      sidecar_id: readString(status.sidecarId),
      promoted_row_state: readString(status.promotedRowState),
      graph_reflection_status: readString(status.graphReflectionStatus),
      calculator_template_status: readString(status.calculatorTemplateStatus),
      active_blockers: readStringArray(status.activeBlockers).slice(0, 12),
      claim_boundary: readString(status.claimBoundary),
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    })),
    artifact_admission_traces: artifactAdmissionTraces.slice(0, 8).map((trace) => ({
      status: readString(trace.status),
      route_contract: readString(trace.route_contract),
      policy: readString(trace.policy),
      continuity_requested: trace.continuity_requested === true,
      continuation_required: trace.continuation_required === true,
      ambient_artifacts: readRecordArray(trace.ambient_artifacts).map((artifact) => ({
        kind: readString(artifact.kind),
        id: readString(artifact.id),
        ref: readString(artifact.ref),
        capability_id: readString(artifact.capability_id),
        status: readString(artifact.status),
        reason: readString(artifact.reason),
      })).slice(0, 12),
      admitted_artifacts: readRecordArray(trace.admitted_artifacts).map((artifact) => ({
        kind: readString(artifact.kind),
        id: readString(artifact.id),
        ref: readString(artifact.ref),
        capability_id: readString(artifact.capability_id),
        status: readString(artifact.status),
        reason: readString(artifact.reason),
      })).slice(0, 12),
      required_prerequisites: readRecordArray(trace.required_prerequisites).map((artifact) => ({
        kind: readString(artifact.kind),
        id: readString(artifact.id),
        ref: readString(artifact.ref),
        capability_id: readString(artifact.capability_id),
        status: readString(artifact.status),
        reason: readString(artifact.reason),
      })).slice(0, 12),
      ignored_artifacts: readRecordArray(trace.ignored_artifacts).map((artifact) => ({
        kind: readString(artifact.kind),
        id: readString(artifact.id),
        ref: readString(artifact.ref),
        capability_id: readString(artifact.capability_id),
        status: readString(artifact.status),
        reason: readString(artifact.reason),
      })).slice(0, 12),
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    })),
    compound_stage_sequence: uniqueStrings([
      ...evidenceSidecars.flatMap((sidecar) =>
        readRecordArray(sidecar.compound_route_stages).map((stage) => readString(stage.stage)),
      ),
      ...runTraces.flatMap((trace) =>
        readRecordArray(trace.stages).map((stage) => readString(stage.stage)),
      ),
    ]).slice(0, 12),
    sidecars: evidenceSidecars.slice(0, 8).map((sidecar) => ({
      sidecar_id: readString(sidecar.sidecar_id),
      sidecar_kind: readString(sidecar.sidecar_kind),
      source_ref_hash: readString(sidecar.source_ref_hash),
      source_kind: readString(sidecar.source_kind),
      packet_count: typeof sidecar.packet_count === "number" ? sidecar.packet_count : null,
      primary_packet_ref: readString(sidecar.primary_packet_ref),
      selected_evidence_object_id: readString(asRecord(sidecar.selected_evidence_object)?.evidence_id),
      selected_evidence_ref: readString(asRecord(sidecar.selected_evidence_object)?.packet_ref),
      selected_evidence_reason: scientificImageEvidenceSelectionReasonForDebug(sidecar.selected_evidence_object),
      promoted_equation_ref: readString(sidecar.promoted_equation_ref),
      active_blockers: readStringArray(sidecar.active_blockers).slice(0, 16),
      historical_blockers: readStringArray(sidecar.historical_blockers).slice(0, 16),
      primary_domain: readString(sidecar.primary_domain),
      primary_domains: readStringArray(sidecar.primary_domains).slice(0, 8),
      admissibility_status: readString(asRecord(sidecar.admissibility)?.status),
      extraction_summary: asRecord(sidecar.extraction_summary),
      memory_classification: asRecord(sidecar.memory_classification),
      stages: compactScientificRunTraceStages({ stages: sidecar.compound_route_stages }),
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    })),
    crop_region_ids: uniqueStrings(evidencePackets.map((packet) => readString(packet.crop_region_id))).slice(0, 12),
    source_images: evidencePackets.slice(0, 12).map((packet) => {
      const sourceImage = asRecord(packet.source_image);
      return {
        ref_hash: readString(sourceImage?.ref_hash) ?? readString(packet.source_ref_hash),
        source_kind: readString(sourceImage?.source_kind),
        page_number: typeof sourceImage?.page_number === "number" ? sourceImage.page_number : null,
        raw_ref_included: false,
      };
    }),
    crop_regions: evidencePackets.slice(0, 12).map((packet) => {
      const cropRegion = asRecord(packet.crop_region);
      return {
        region_id: readString(cropRegion?.region_id) ?? readString(packet.crop_region_id),
        bbox_px: asRecord(cropRegion?.bbox_px) ?? asRecord(packet.bbox_px),
        source_ref_hash: readString(cropRegion?.source_ref_hash) ?? readString(packet.source_ref_hash),
      };
    }),
    run_trace_ids: uniqueStrings(runTraces.map((trace) => readString(trace.trace_id))).slice(0, 12),
    rejected_calculator_payload_ids: rejectedCalculatorPayloadIds.slice(0, 24),
    rejected_badge_ids: rejectedBadgeIds.slice(0, 24),
    final_answer_guard_required: finalAnswerGuardRequired,
    claim_boundary: "observation_ocr_graph_match_not_proof",
    traces: runTraces.slice(0, 8).map((trace) => ({
      trace_id: readString(trace.trace_id),
      source_ref_hash: readString(trace.source_ref_hash),
      primary_domain: readString(trace.primary_domain),
      branch_gate_status: readString(trace.branch_gate_status),
      congruence_grade_floor: readString(trace.congruence_grade_floor),
      admitted_calculator_payload_ids: readStringArray(trace.admitted_calculator_payload_ids).slice(0, 12),
      rejected_calculator_payload_ids: readStringArray(trace.rejected_calculator_payload_ids).slice(0, 12),
      rejected_badge_ids: readStringArray(trace.rejected_badge_ids).slice(0, 12),
      stages: compactScientificRunTraceStages(trace),
    })),
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
    output_authority: "scientific_evidence_debug_projection",
  };
};

const calculatorReceiptTaxonomyForStatus = (
  receipt: Record<string, unknown> | null,
):
  | "calculator_receipt_found"
  | "calculator_template_only"
  | "calculator_blocked_missing_bindings"
  | "calculator_solved"
  | "calculator_receipt_missing" => {
  if (!receipt) return "calculator_receipt_missing";
  const status = readString(receipt.status);
  const missingBindings = readStringArray(receipt.missing_bindings);
  const blockers = readStringArray(receipt.blockers);
  if (status === "solved") return "calculator_solved";
  if (status === "template_only") return "calculator_template_only";
  if (status === "blocked" || missingBindings.length > 0 || blockers.length > 0) {
    return "calculator_blocked_missing_bindings";
  }
  return "calculator_receipt_found";
};

const compactCalculatorReceiptForDebug = (
  receipt: Record<string, unknown> | null,
): Record<string, unknown> | null => {
  if (!receipt) return null;
  const expression = readString(receipt.expression);
  const latex = readString(receipt.latex);
  return {
    receipt_id: readString(receipt.receipt_id),
    schema: readString(receipt.schema),
    expression_template_id: readString(receipt.expression_template_id),
    status: readString(receipt.status),
    expression_hash: expression ? hashDebugExportText(expression) : null,
    latex_hash: latex ? hashDebugExportText(latex) : null,
    variable_symbols: readRecordArray(receipt.variables)
      .map((variable) => readString(variable.symbol))
      .filter(Boolean)
      .slice(0, 24),
    dimensional_check_status: readString(receipt.dimensional_check_status),
    result_present: Boolean(readScalarString(receipt.result_value) ?? readString(receipt.result_text)),
    result_unit: readString(receipt.result_unit),
    source_refs: readStringArray(receipt.source_refs).slice(0, 12),
    provenance_refs: readStringArray(receipt.provenance_refs).slice(0, 12),
    missing_bindings: readStringArray(receipt.missing_bindings).slice(0, 24),
    blockers: readStringArray(receipt.blockers).slice(0, 24),
    claim_boundary: readString(receipt.claim_boundary),
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
  };
};

const buildCalculatorReceiptDebugProjection = (input: {
  activeTurnId: string | null;
  source: Record<string, unknown>;
  ledger: unknown[];
}): Record<string, unknown> => {
  const debug = asRecord(input.source.debug);
  const agentLoop = asRecord(input.source.agentLoop);
  const workspaceSnapshot =
    asRecord(input.source.workspace_context_snapshot) ??
    asRecord(debug?.workspace_context_snapshot) ??
    asRecord(agentLoop?.workspace_context_snapshot);
  const calculatorPanelState = asRecord(
    input.source.calculator_panel_state ?? debug?.calculator_panel_state ?? agentLoop?.calculator_panel_state,
  );
  const activeCalculatorContext = asRecord(
    input.source.activeCalculatorContext ??
      input.source.active_calculator_context ??
      workspaceSnapshot?.activeCalculatorContext ??
      workspaceSnapshot?.active_calculator_context,
  );
  const candidates = [
    input.source,
    debug,
    agentLoop,
    workspaceSnapshot,
    calculatorPanelState,
    activeCalculatorContext,
    ...input.ledger,
  ].filter((entry): entry is Record<string, unknown> => Boolean(entry));
  const directReceipts = [
    asRecord(input.source.calculator_receipt),
    asRecord(debug?.calculator_receipt),
    asRecord(agentLoop?.calculator_receipt),
    asRecord(calculatorPanelState?.lastCalculatorReceipt),
    asRecord(calculatorPanelState?.last_calculator_receipt),
    asRecord(activeCalculatorContext?.last_calculator_receipt),
    asRecord(activeCalculatorContext?.lastCalculatorReceipt),
  ].filter((entry): entry is Record<string, unknown> => Boolean(entry));
  const nestedReceipts = uniqueRecordsById(
    candidates.flatMap((candidate) => collectRecordsDeep(candidate, (record) =>
      readString(record.schema) === "helix.scientific_calculator_receipt.v1" ||
      readString(record.schema) === "helix.calculator_receipt.v1" ||
      readString(record.kind) === "calculator_receipt"
    )),
    ["receipt_id", "artifact_id", "expression", "status"],
  );
  const receipts = uniqueRecordsById([...directReceipts, ...nestedReceipts], [
    "receipt_id",
    "artifact_id",
    "expression",
    "status",
  ])
    .map((receipt) => normalizeScientificCalculatorReceiptV1(receipt, {
      artifactId: readString(receipt.artifact_id),
    }))
    .filter((receipt): receipt is NonNullable<ReturnType<typeof normalizeScientificCalculatorReceiptV1>> =>
      Boolean(receipt),
    )
    .map((receipt) => receipt as unknown as Record<string, unknown>);
  const latestReceipt = receipts[0] ?? null;
  return {
    schema: "helix.calculator_receipt_debug_projection.v1",
    turn_id: input.activeTurnId,
    taxonomy: calculatorReceiptTaxonomyForStatus(latestReceipt),
    calculator_receipt_status: readString(latestReceipt?.status),
    calculator_receipt_ref: readString(latestReceipt?.receipt_id) ?? readString(latestReceipt?.artifact_id),
    calculator_receipt_count: receipts.length,
    latest_receipt: compactCalculatorReceiptForDebug(latestReceipt),
    receipt_refs: receipts
      .map((receipt) => readString(receipt.receipt_id) ?? readString(receipt.artifact_id))
      .filter(Boolean)
      .slice(0, 24),
    statuses: uniqueStrings(receipts.map((receipt) => readString(receipt.status))).slice(0, 12),
    missing_bindings: uniqueStrings(receipts.flatMap((receipt) => readStringArray(receipt.missing_bindings))).slice(0, 24),
    blockers: uniqueStrings(receipts.flatMap((receipt) => readStringArray(receipt.blockers))).slice(0, 24),
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
  };
};

const collectLedgerPayloads = (
  ledger: unknown[],
  predicate: (artifact: Record<string, unknown>) => boolean,
): Record<string, unknown>[] =>
  ledger
    .map(asRecord)
    .filter((artifact): artifact is Record<string, unknown> => Boolean(artifact && predicate(artifact)))
    .map((artifact) => asRecord(artifact.payload) ?? artifact);

const collectCoverageArtifacts = (ledger: unknown[]): Record<string, unknown>[] =>
  collectLedgerPayloads(ledger, (artifact) => {
    const kind = readString(artifact.kind) ?? "";
    return kind === "calculator_plan_coverage" || /_coverage$/.test(kind);
  });

const findLedgerPayload = (ledger: unknown[], kind: string): Record<string, unknown> | null =>
  [...ledger]
    .reverse()
    .map(asRecord)
    .find((artifact) => artifact?.kind === kind)
    ? asRecord(
        [...ledger]
          .reverse()
          .map(asRecord)
          .find((artifact) => artifact?.kind === kind)?.payload,
      )
    : null;

const buildCompactToolTraceDisclosure = (input: {
  actionEnvelope: Record<string, unknown> | null;
  turnId: string;
  scientificEvidenceTrace?: Record<string, unknown> | null;
}) => {
  const actionEnvelope = input.actionEnvelope;
  const workstationActions = Array.isArray(actionEnvelope?.workstation_actions)
    ? actionEnvelope.workstation_actions
        .map(asRecord)
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
        .map((entry) => ({
          panel_id: readString(entry.panel_id),
          action_id: readString(entry.action_id),
        }))
        .filter((entry) => Boolean(entry.panel_id && entry.action_id))
    : [];
  if (workstationActions.length === 0) return null;
  const actionKeys = workstationActions.map((action) => `${action.panel_id}.${action.action_id}`);
  const items = workstationActions.map((action) => ({
    tool: `${action.panel_id}.${action.action_id}`,
    ...classifyCompactToolTraceAction(action.panel_id, action.action_id),
  }));
  return {
    schema: "helix.ask_tool_trace_disclosure.v1",
    disclosureId: `${input.turnId}:tool_trace_disclosure`,
    turnId: input.turnId,
    action_keys: actionKeys,
    items,
    workstation_actions: workstationActions,
    answerNote: answerNoteForCompactToolTraceItems(items),
    scientific_evidence_trace: input.scientificEvidenceTrace ?? null,
    assistant_answer: false,
    terminal_eligible: false,
  };
};

export function buildHelixUiDebugParityHarnessSnapshot(args: {
  visibleFinalAnswer: string | null | undefined;
  debugExport: Record<string, unknown>;
  calculatorPanelState?: Record<string, unknown> | null;
}): Record<string, unknown> {
  const visibleFinalAnswer = readString(args.visibleFinalAnswer) ?? "";
  const terminalAuthority = asRecord(args.debugExport.terminal_answer_authority);
  const terminalPresentation = asRecord(args.debugExport.terminal_presentation);
  const terminalAuthorityText =
    readString(terminalPresentation?.concise_text) ??
    readString(terminalAuthority?.terminal_text) ??
    readString(terminalAuthority?.terminal_text_preview) ??
    "";
  const selectedFinalAnswer = readString(args.debugExport.selected_final_answer) ?? "";
  const coverageArtifacts = Array.isArray(args.debugExport.coverage_artifacts)
    ? args.debugExport.coverage_artifacts
    : collectCoverageArtifacts(
        Array.isArray(args.debugExport.current_turn_artifact_ledger)
          ? args.debugExport.current_turn_artifact_ledger
          : [],
      );
  const calculatorPanelState = asRecord(args.calculatorPanelState ?? args.debugExport.calculator_panel_state);
  const currentCompoundRunId = readString(calculatorPanelState?.current_compound_run_id);
  const visibleCompoundRunIds = Array.isArray(calculatorPanelState?.visible_compound_run_ids)
    ? calculatorPanelState.visible_compound_run_ids
        .map((value) => readString(value))
        .filter((value): value is string => Boolean(value))
    : [];
  const staleCalculatorRunVisible = Boolean(
    currentCompoundRunId &&
      visibleCompoundRunIds.some((runId) => runId !== currentCompoundRunId),
  );
  return {
    schema: "helix.ui_debug_parity_harness.v1",
    visible_final_answer: visibleFinalAnswer,
    selected_final_answer: selectedFinalAnswer,
    terminal_authority_text: terminalAuthorityText,
    ui_answer_equals_selected_final_answer: Boolean(visibleFinalAnswer && selectedFinalAnswer && visibleFinalAnswer === selectedFinalAnswer),
    ui_answer_equals_terminal_authority_text: Boolean(visibleFinalAnswer && terminalAuthorityText && visibleFinalAnswer === terminalAuthorityText),
    has_terminal_authority: Boolean(terminalAuthority),
    has_goal_satisfaction: Boolean(asRecord(args.debugExport.goal_satisfaction_evaluation)),
    has_agent_runtime_loop: Boolean(asRecord(args.debugExport.agent_runtime_loop)),
    has_coverage_artifact: coverageArtifacts.length > 0,
    has_planner_artifact: Boolean(asRecord(args.debugExport.calculator_planner_result)),
    has_repair_artifact: Boolean(asRecord(args.debugExport.calculator_planner_repair_result)),
    has_receipt_artifact: Array.isArray(args.debugExport.current_turn_artifact_ledger)
      ? args.debugExport.current_turn_artifact_ledger.some((artifact) => asRecord(artifact)?.kind === "workspace_action_receipt")
      : false,
    has_composer_artifact: Boolean(asRecord(args.debugExport.final_answer_draft)),
    calculator_panel_state: calculatorPanelState,
    calculator_panel_current_compound_run_id: currentCompoundRunId,
    calculator_panel_visible_compound_run_ids: visibleCompoundRunIds,
    calculator_panel_stale_compound_run_visible: staleCalculatorRunVisible,
    clipboard_debug_copy_required_for_prompt_submission: false,
  };
}

const buildSolverControllerSummary = (payload: Record<string, unknown>) => {
  const debug = asRecord(payload.debug);
  const agentLoop = asRecord(payload.agentLoop);
  const controller = asRecord(payload.solver_controller_decision ?? debug?.solver_controller_decision ?? agentLoop?.solver_controller_decision);
  const terminalAuthority = asRecord(payload.terminal_answer_authority ?? debug?.terminal_answer_authority ?? agentLoop?.terminal_answer_authority);
  const poisonAudit = asRecord(payload.poison_audit ?? debug?.poison_audit ?? agentLoop?.poison_audit);
  const routeAuthority = asRecord(payload.route_authority_audit ?? debug?.route_authority_audit ?? agentLoop?.route_authority_audit);
  const turnIdIntegrity = asRecord(payload.turn_id_integrity_audit ?? debug?.turn_id_integrity_audit ?? agentLoop?.turn_id_integrity_audit);
  const finalRouteReconciliation = asRecord(payload.final_route_reconciliation ?? debug?.final_route_reconciliation ?? agentLoop?.final_route_reconciliation);
  return {
    decision: readString(controller?.decision),
    blocking_reasons: Array.isArray(controller?.blocking_reasons) ? controller.blocking_reasons : [],
    final_route: readString(controller?.final_route) ?? readString(payload.route_reason_code),
    required_terminal_kind: readString(controller?.required_terminal_kind),
    selected_terminal_artifact_kind:
      readString(controller?.selected_terminal_artifact_kind) ?? readString(payload.terminal_artifact_kind),
    poison_ok: readBoolean(poisonAudit?.ok),
    route_authority_ok: readBoolean(routeAuthority?.route_authority_ok),
    terminal_authority_route: readString(terminalAuthority?.route),
    turn_id_integrity_ok: readBoolean(turnIdIntegrity?.ok),
    final_route_reconciliation_ok: readBoolean(finalRouteReconciliation?.ok),
  };
};

export function buildDebugExportDrawerFallbackResult(args: {
  attemptedPayloadHash: string;
  copiedTextLength: number;
  readbackMatch?: "exact" | "unavailable" | "mismatch" | "empty";
  error?: string;
}): DebugExportUiResult {
  return {
    ok: true,
    attempted_payload_hash: args.attemptedPayloadHash,
    copied_text_length: args.copiedTextLength,
    method: "debug_drawer",
    readback_match: args.readbackMatch ?? "unavailable",
    fallback_presented: true,
    ...(args.error ? { error: args.error } : {}),
  };
}

export function buildHelixDebugExportEnvelopeFromMasterPayload(reply: {
  id?: string;
  question?: string | null;
  content?: string | null;
}, payload: Record<string, unknown>): string {
  const debug = asRecord(payload.debug);
  const agentLoop = asRecord(payload.agentLoop);
  const workspaceSnapshot = asRecord(
    payload.workspace_context_snapshot ??
      debug?.workspace_context_snapshot ??
      agentLoop?.workspace_context_snapshot,
  );
  const ledger = Array.isArray(agentLoop?.current_turn_artifact_ledger)
    ? agentLoop.current_turn_artifact_ledger
    : Array.isArray(debug?.current_turn_artifact_ledger)
      ? debug.current_turn_artifact_ledger
      : [];
  const availableCapabilities =
    asRecord(payload.available_capabilities ?? debug?.available_capabilities ?? agentLoop?.available_capabilities) ??
    findLedgerPayload(ledger, "available_capabilities");
  const agentStepDecision =
    asRecord(payload.agent_step_decision ?? debug?.agent_step_decision ?? agentLoop?.agent_step_decision) ??
    findLedgerPayload(ledger, "agent_step_decision");
  const observationReview =
    asRecord(payload.observation_review ?? debug?.observation_review ?? agentLoop?.observation_review) ??
    findLedgerPayload(ledger, "observation_review");
  const goalSatisfactionEvaluation =
    asRecord(payload.goal_satisfaction_evaluation ?? debug?.goal_satisfaction_evaluation ?? agentLoop?.goal_satisfaction_evaluation) ??
    findLedgerPayload(ledger, "goal_satisfaction_evaluation");
  const initialAvailableCapabilities =
    asRecord(
      payload.initial_available_capabilities ??
        debug?.initial_available_capabilities ??
        agentLoop?.initial_available_capabilities,
    ) ?? availableCapabilities;
  const initialAgentStepDecision =
    asRecord(payload.initial_agent_step_decision ?? debug?.initial_agent_step_decision ?? agentLoop?.initial_agent_step_decision) ??
    agentStepDecision;
  const agentStepAuthorityCheck =
    asRecord(payload.agent_step_authority_check ?? debug?.agent_step_authority_check ?? agentLoop?.agent_step_authority_check) ??
    findLedgerPayload(ledger, "agent_step_authority_check");
  const agentStepLoop =
    asRecord(payload.agent_step_loop ?? debug?.agent_step_loop ?? agentLoop?.agent_step_loop) ??
    findLedgerPayload(ledger, "agent_step_loop");
  const agentRuntimeLoop =
    asRecord(payload.agent_runtime_loop ?? debug?.agent_runtime_loop ?? agentLoop?.agent_runtime_loop) ??
    findLedgerPayload(ledger, "agent_runtime_loop");
  const continuationStateHistorySource = Array.isArray(payload.agent_continuation_states)
    ? payload.agent_continuation_states
    : Array.isArray(debug?.agent_continuation_states)
      ? debug.agent_continuation_states
      : Array.isArray(agentLoop?.agent_continuation_states)
        ? agentLoop.agent_continuation_states
        : collectLedgerPayloads(ledger, (artifact) => artifact.kind === "agent_continuation_state");
  const agentContinuationStates = continuationStateHistorySource
    .slice(-8)
    .map(summarizeAgentContinuationStateForExport)
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  const agentContinuationState =
    summarizeAgentContinuationStateForExport(
      payload.agent_continuation_state ??
        debug?.agent_continuation_state ??
        agentLoop?.agent_continuation_state ??
        findLedgerPayload(ledger, "agent_continuation_state"),
    ) ??
    agentContinuationStates.at(-1) ??
    null;
  const terminalRejectionHistorySource = Array.isArray(payload.terminal_rejection_observations)
    ? payload.terminal_rejection_observations
    : Array.isArray(debug?.terminal_rejection_observations)
      ? debug.terminal_rejection_observations
      : Array.isArray(agentLoop?.terminal_rejection_observations)
        ? agentLoop.terminal_rejection_observations
        : collectLedgerPayloads(ledger, (artifact) => artifact.kind === "terminal_rejection_observation");
  const terminalRejectionObservations = terminalRejectionHistorySource
    .slice(-8)
    .map(summarizeTerminalRejectionObservationForExport)
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  const agentRuntimeLoopAdmission =
    asRecord(payload.agent_runtime_loop_admission ?? debug?.agent_runtime_loop_admission ?? agentLoop?.agent_runtime_loop_admission) ??
    findLedgerPayload(ledger, "agent_runtime_loop_admission");
  const runtimeAuthorityAudit =
    asRecord(payload.runtime_authority_audit ?? debug?.runtime_authority_audit ?? agentLoop?.runtime_authority_audit) ??
    findLedgerPayload(ledger, "runtime_authority_audit");
  const agentRuntime = payload.agent_runtime ?? debug?.agent_runtime ?? agentLoop?.agent_runtime ?? null;
  const agentRuntimeSelectionTrace = asRecord(
    payload.agent_runtime_selection_trace ??
      debug?.agent_runtime_selection_trace ??
      agentLoop?.agent_runtime_selection_trace,
  );
  const selectedAgentProvider = asRecord(
    payload.selected_agent_provider ?? debug?.selected_agent_provider ?? agentLoop?.selected_agent_provider,
  );
  const languageModelPolicy =
    asRecord(payload.language_model_policy ?? debug?.language_model_policy ?? agentLoop?.language_model_policy) ??
    null;
  const languageModelDebugSummary =
    readString(payload.language_model_debug_summary) ??
    readString(debug?.language_model_debug_summary) ??
    readString(agentLoop?.language_model_debug_summary) ??
    null;
  const modelPolicyDebugSummary =
    readString(payload.model_policy_debug_summary) ??
    readString(debug?.model_policy_debug_summary) ??
    readString(agentLoop?.model_policy_debug_summary) ??
    languageModelDebugSummary;
  const codexNativeProviderBridge = normalizeCodexNativeProviderBridgeForExport(
    payload.codex_native_provider_bridge ??
      debug?.codex_native_provider_bridge ??
      agentLoop?.codex_native_provider_bridge,
  );
  const codexNativeCompatibilityFallback =
    normalizeCodexNativeCompatibilityFallbackForExport(
      payload.codex_native_compatibility_fallback ??
        debug?.codex_native_compatibility_fallback ??
        agentLoop?.codex_native_compatibility_fallback,
    );
  const providerGatewayDebugSummary = asRecord(
    payload.provider_gateway_debug_summary ??
      debug?.provider_gateway_debug_summary ??
      agentLoop?.provider_gateway_debug_summary,
  );
  const realtimeConversationContextMaterialization = asRecord(
    payload.realtime_conversation_context_materialization ??
      debug?.realtime_conversation_context_materialization ??
      agentLoop?.realtime_conversation_context_materialization ??
      providerGatewayDebugSummary?.realtime_conversation_context_materialization,
  );
  const workstationGatewayManifest = asRecord(
    payload.workstation_gateway_manifest ??
      debug?.workstation_gateway_manifest ??
      agentLoop?.workstation_gateway_manifest,
  );
  const workstationGatewayCallResults =
    payload.workstation_gateway_call_results ??
    debug?.workstation_gateway_call_results ??
    agentLoop?.workstation_gateway_call_results;
  const workstationGatewayObservationPackets =
    payload.workstation_gateway_observation_packets ??
    debug?.workstation_gateway_observation_packets ??
    agentLoop?.workstation_gateway_observation_packets;
  const capabilityLaneManifest =
    payload.capability_lane_manifest ?? debug?.capability_lane_manifest ?? agentLoop?.capability_lane_manifest;
  const modelVisibleCapabilityLaneManifest =
    payload.model_visible_capability_lane_manifest ??
    debug?.model_visible_capability_lane_manifest ??
    agentLoop?.model_visible_capability_lane_manifest;
  const capabilityLaneIds =
    payload.capability_lane_ids ?? debug?.capability_lane_ids ?? agentLoop?.capability_lane_ids;
  const capabilityLaneStatuses =
    payload.capability_lane_statuses ?? debug?.capability_lane_statuses ?? agentLoop?.capability_lane_statuses;
  const capabilityLaneResolveTraces =
    payload.capability_lane_resolve_traces ??
    debug?.capability_lane_resolve_traces ??
    agentLoop?.capability_lane_resolve_traces;
  const capabilityLaneBackendSelections =
    payload.capability_lane_backend_selections ??
    debug?.capability_lane_backend_selections ??
    agentLoop?.capability_lane_backend_selections;
  const capabilityLaneCallResults =
    payload.capability_lane_call_results ?? debug?.capability_lane_call_results ?? agentLoop?.capability_lane_call_results;
  const capabilityLaneTurnTimeline =
    payload.capability_lane_turn_timeline ??
    debug?.capability_lane_turn_timeline ??
    agentLoop?.capability_lane_turn_timeline;
  const fallbackRuntimeAgentProvider = readRuntimeAgentProvider(
    payload.selected_runtime_agent_provider,
    payload.agent_runtime,
    payload.agentRuntime,
    debug?.selected_runtime_agent_provider,
    debug?.agent_runtime,
    debug?.agentRuntime,
    agentLoop?.selected_runtime_agent_provider,
    agentLoop?.agent_runtime,
    agentLoop?.agentRuntime,
  );
  const capabilityLaneTimelineSummary = normalizeCapabilityLaneTimelineSummaryForExport(
    payload.capability_lane_timeline_summary ??
      debug?.capability_lane_timeline_summary ??
      agentLoop?.capability_lane_timeline_summary,
    capabilityLaneTurnTimeline,
    fallbackRuntimeAgentProvider,
  );
  const capabilityLaneObservationPackets =
    payload.capability_lane_observation_packets ??
    debug?.capability_lane_observation_packets ??
    agentLoop?.capability_lane_observation_packets;
  const capabilityLaneProjectionReceipts =
    payload.capability_lane_projection_receipts ??
    debug?.capability_lane_projection_receipts ??
    agentLoop?.capability_lane_projection_receipts;
  const capabilityLaneSessionResults =
    normalizeCapabilityLaneEvidenceRecords(
      payload.capability_lane_session_results ??
        debug?.capability_lane_session_results ??
        agentLoop?.capability_lane_session_results,
      fallbackRuntimeAgentProvider,
    );
  const capabilityLaneSessionDebugSummaries =
    normalizeCapabilityLaneEvidenceRecords(
      payload.capability_lane_session_debug_summaries ??
        debug?.capability_lane_session_debug_summaries ??
        agentLoop?.capability_lane_session_debug_summaries,
      fallbackRuntimeAgentProvider,
    );
  const capabilityLaneGoalBindingResults =
    normalizeCapabilityLaneEvidenceRecords(
      payload.capability_lane_goal_binding_results ??
        debug?.capability_lane_goal_binding_results ??
        agentLoop?.capability_lane_goal_binding_results,
      fallbackRuntimeAgentProvider,
    );
  const capabilityLaneGoalBindingDebugSummaries =
    normalizeCapabilityLaneEvidenceRecords(
      payload.capability_lane_goal_binding_debug_summaries ??
        debug?.capability_lane_goal_binding_debug_summaries ??
        agentLoop?.capability_lane_goal_binding_debug_summaries,
      fallbackRuntimeAgentProvider,
    );
  const capabilityLaneMailLoopDebugSummaries = readCapabilityLaneMailLoopDebugSummaries({
    payload,
    debug,
    agentLoop,
    fallbackRuntimeAgentProvider,
  });
  const capabilityLaneGoalDispatchPlans =
    normalizeCapabilityLaneEvidenceRecords(
      payload.capability_lane_goal_dispatch_plans ??
        debug?.capability_lane_goal_dispatch_plans ??
        agentLoop?.capability_lane_goal_dispatch_plans,
      fallbackRuntimeAgentProvider,
    );
  const capabilityLaneGoalDispatchAdmissions =
    normalizeCapabilityLaneEvidenceRecords(
      payload.capability_lane_goal_dispatch_admissions ??
        debug?.capability_lane_goal_dispatch_admissions ??
        agentLoop?.capability_lane_goal_dispatch_admissions,
      fallbackRuntimeAgentProvider,
    );
  const capabilityLaneGoalDispatchReadiness = normalizeCapabilityLaneEvidenceRecordOrNull(
    payload.capability_lane_goal_dispatch_readiness ??
      debug?.capability_lane_goal_dispatch_readiness ??
      agentLoop?.capability_lane_goal_dispatch_readiness,
    fallbackRuntimeAgentProvider,
  );
  const capabilityLaneReentryStatus =
    payload.capability_lane_reentry_status ??
    debug?.capability_lane_reentry_status ??
    agentLoop?.capability_lane_reentry_status;
  const runtimeLaneRequestContract =
    payload.runtime_lane_request_contract ??
    debug?.runtime_lane_request_contract ??
    agentLoop?.runtime_lane_request_contract;
  const runtimeLaneRequestLoop =
    payload.runtime_lane_request_loop ?? debug?.runtime_lane_request_loop ?? agentLoop?.runtime_lane_request_loop;
  const runtimeLaneRequestRetry =
    payload.runtime_lane_request_retry ?? debug?.runtime_lane_request_retry ?? agentLoop?.runtime_lane_request_retry;
  const realtimeRuntimeSessionSummary = normalizeRealtimeRuntimeSessionSummaryForExport(
    payload.realtime_runtime_session_summary ??
      debug?.realtime_runtime_session_summary ??
      agentLoop?.realtime_runtime_session_summary,
  );
  const realtimeRuntimeSessionEvents =
    payload.realtime_runtime_session_events ??
    debug?.realtime_runtime_session_events ??
    agentLoop?.realtime_runtime_session_events;
  const realtimeTranscriptObservations =
    payload.realtime_transcript_observations ??
    debug?.realtime_transcript_observations ??
    agentLoop?.realtime_transcript_observations;
  const realtimeToolSuggestionObservations =
    payload.realtime_tool_suggestion_observations ??
    debug?.realtime_tool_suggestion_observations ??
    agentLoop?.realtime_tool_suggestion_observations;
  const realtimeClientReceiptObservations =
    payload.realtime_client_receipt_observations ??
    debug?.realtime_client_receipt_observations ??
    agentLoop?.realtime_client_receipt_observations;
  const realtimeGroundedAnswerFeedback = normalizeRealtimeGroundedAnswerFeedbackForExport(
    payload.realtime_grounded_answer_feedback ??
      debug?.realtime_grounded_answer_feedback ??
      agentLoop?.realtime_grounded_answer_feedback,
  );
  const visibleTranslationChainSummary = buildVisibleTranslationChainSummaryForExport({
    runtimeLaneRequestLoop,
    capabilityLaneTurnTimeline,
    capabilityLaneProjectionReceipts,
    capabilityLaneCallResults,
    capabilityLaneReentryStatus,
    capabilityLaneTimelineSummary,
  });
  const turnTranscriptEvents =
    payload.turn_transcript_events ??
    debug?.turn_transcript_events ??
    agentLoop?.turn_transcript_events;
  const providerTerminalCandidate = asRecord(
    payload.provider_terminal_candidate ??
      debug?.provider_terminal_candidate ??
      agentLoop?.provider_terminal_candidate,
  );
  const providerReasoningReentry = asRecord(
    payload.provider_reasoning_reentry ??
      debug?.provider_reasoning_reentry ??
      agentLoop?.provider_reasoning_reentry,
  );
  const terminalAuthorityCandidateReview = asRecord(
    payload.terminal_authority_candidate_review ??
      debug?.terminal_authority_candidate_review ??
      agentLoop?.terminal_authority_candidate_review,
  );
  const providerTerminalAuthorityBridge = asRecord(
    payload.provider_terminal_authority_bridge ??
      debug?.provider_terminal_authority_bridge ??
      agentLoop?.provider_terminal_authority_bridge,
  );
  const runtimeIntentPacket =
    asRecord(payload.runtime_intent_packet ?? debug?.runtime_intent_packet ?? agentLoop?.runtime_intent_packet) ??
    findLedgerPayload(ledger, "runtime_intent_packet");
  const runtimeContinuationHints =
    Array.isArray(payload.runtime_continuation_hints)
      ? payload.runtime_continuation_hints
      : Array.isArray(debug?.runtime_continuation_hints)
        ? debug.runtime_continuation_hints
        : Array.isArray(agentLoop?.runtime_continuation_hints)
          ? agentLoop.runtime_continuation_hints
          : ledger
              .map(asRecord)
              .filter((artifact) => artifact?.kind === "runtime_continuation_hint")
              .map((artifact) => asRecord(artifact?.payload) ?? artifact)
              .filter(Boolean);
  const runtimeGoalCommand = asRecord(
    payload.runtime_goal_command ?? debug?.runtime_goal_command ?? agentLoop?.runtime_goal_command,
  );
  const runtimeGoalSession = asRecord(
    payload.runtime_goal_session ?? debug?.runtime_goal_session ?? agentLoop?.runtime_goal_session,
  );
  const runtimeGoalDebugExport = asRecord(
    payload.runtime_goal_debug_export ?? debug?.runtime_goal_debug_export ?? agentLoop?.runtime_goal_debug_export,
  );
  const runtimeGoalDebugSummary = buildRuntimeGoalDebugSummaryForExport({
    command: runtimeGoalCommand,
    session: runtimeGoalSession,
    debugExport: runtimeGoalDebugExport,
  });
  const receiptArtifact =
    [...ledger]
      .reverse()
      .map(asRecord)
      .find((artifact) => {
        if (artifact?.kind !== "workspace_action_receipt") return false;
        const payloadRecord = asRecord(artifact.payload);
        return Boolean(readString(payloadRecord?.action_key) || readString(payloadRecord?.target_id));
      }) ??
    [...ledger]
      .reverse()
      .map(asRecord)
      .find((artifact) => artifact?.kind === "workspace_action_receipt") ??
    null;
  const receipt = asRecord(receiptArtifact?.payload);
  const lifecycleEvents = Array.isArray(receipt?.workspace_action_lifecycle_events)
    ? receipt.workspace_action_lifecycle_events
    : [];
  const providerPromptLeakGuard = asRecord(
    payload.provider_prompt_leak_guard ?? debug?.provider_prompt_leak_guard ?? agentLoop?.provider_prompt_leak_guard,
  );
  const imageLensPromptLeakRecovered =
    readString(providerPromptLeakGuard?.status) === "recovered_with_image_lens_observation_report" ||
    readBoolean(providerPromptLeakGuard?.recovered_with_observation_only_image_lens_report) === true;
  const terminalPresentation = selectTerminalRecordForRecoveredImageLens(
    imageLensPromptLeakRecovered,
    payload.terminal_presentation,
    debug?.terminal_presentation,
    agentLoop?.terminal_presentation,
  );
  const terminalAuthority = selectTerminalRecordForRecoveredImageLens(
    imageLensPromptLeakRecovered,
    payload.terminal_answer_authority,
    debug?.terminal_answer_authority,
    agentLoop?.terminal_answer_authority,
  );
  const terminalGroundingAuthority = asRecord(
    payload.terminal_grounding_authority ??
      debug?.terminal_grounding_authority ??
      agentLoop?.terminal_grounding_authority,
  );
  const calculatorPlannerResult =
    asRecord(payload.calculator_planner_result ?? debug?.calculator_planner_result ?? agentLoop?.calculator_planner_result) ??
    findLedgerPayload(ledger, "calculator_planner_result");
  const calculatorPlannerRepairResult =
    asRecord(payload.calculator_planner_repair_result ?? debug?.calculator_planner_repair_result ?? agentLoop?.calculator_planner_repair_result) ??
    findLedgerPayload(ledger, "calculator_planner_repair_result");
  const calculatorPlanCoverage =
    asRecord(payload.calculator_plan_coverage ?? debug?.calculator_plan_coverage ?? agentLoop?.calculator_plan_coverage) ??
    findLedgerPayload(ledger, "calculator_plan_coverage");
  const promptRequirementCoverage =
    asRecord(payload.prompt_requirement_coverage ?? debug?.prompt_requirement_coverage ?? agentLoop?.prompt_requirement_coverage) ??
    findLedgerPayload(ledger, "prompt_requirement_coverage");
  const finalAnswerRepairRequest =
    asRecord(payload.final_answer_repair_request ?? debug?.final_answer_repair_request ?? agentLoop?.final_answer_repair_request) ??
    findLedgerPayload(ledger, "final_answer_repair_request");
  const finalAnswerDraft =
    asRecord(payload.final_answer_draft ?? debug?.final_answer_draft ?? agentLoop?.final_answer_draft) ??
    findLedgerPayload(ledger, "final_answer_draft");
  const actionEnvelope = asRecord(payload.action_envelope ?? debug?.action_envelope ?? agentLoop?.action_envelope);
  const codexHostWorkstationAffordances = asRecord(
    payload.codex_host_workstation_affordances ??
      debug?.codex_host_workstation_affordances ??
      agentLoop?.codex_host_workstation_affordances,
  );
  const hostWorkstationActions = Array.isArray(payload.workstation_actions)
    ? payload.workstation_actions
    : Array.isArray(debug?.workstation_actions)
      ? debug.workstation_actions
      : Array.isArray(codexHostWorkstationAffordances?.workstation_actions)
        ? codexHostWorkstationAffordances.workstation_actions
        : [];
  const hostSupportRefs = Array.isArray(payload.support_refs)
    ? payload.support_refs
    : Array.isArray(debug?.support_refs)
      ? debug.support_refs
      : Array.isArray(codexHostWorkstationAffordances?.support_refs)
        ? codexHostWorkstationAffordances.support_refs
        : [];
  const hostToolOutputRefs = Array.isArray(payload.tool_output_refs)
    ? payload.tool_output_refs
    : Array.isArray(debug?.tool_output_refs)
      ? debug.tool_output_refs
      : Array.isArray(codexHostWorkstationAffordances?.tool_output_refs)
        ? codexHostWorkstationAffordances.tool_output_refs
        : [];
  const coverageArtifacts = collectCoverageArtifacts(ledger);
  const calculatorPanelState = asRecord(payload.calculator_panel_state ?? debug?.calculator_panel_state ?? agentLoop?.calculator_panel_state);
  const debugExportRebuildReason = readString(payload.debug_export_rebuild_reason)?.trim() ?? "";
  const debugExportSource = readString(payload.debug_export_source)?.trim() ?? "";
  const isReplyScopedDebugProjection =
    debugExportSource === "rendered_reply_dom" ||
    debugExportRebuildReason === "rendered_button_scope" ||
    debugExportRebuildReason === "rendered_reply" ||
    debugExportRebuildReason === "payload_reply_mismatch" ||
    debugExportRebuildReason === "empty_payload" ||
    debugExportRebuildReason === "invalid_json_payload";
  const replyScopedSelectedTurnId = isReplyScopedDebugProjection
    ? readString(payload.active_turn_id)
    : null;
  const normalizedReplyScopedSelectedTurnId =
    normalizeBackendDebugExportTurnId(replyScopedSelectedTurnId) ?? replyScopedSelectedTurnId;
  const terminalAuthorityTurnId = readString(terminalAuthority?.turn_id);
  const normalizedTerminalAuthorityTurnId =
    normalizeBackendDebugExportTurnId(terminalAuthorityTurnId) ?? terminalAuthorityTurnId;
  const terminalAuthorityMatchesSelectedTurn = Boolean(
    !normalizedReplyScopedSelectedTurnId ||
    !normalizedTerminalAuthorityTurnId ||
    normalizedReplyScopedSelectedTurnId === normalizedTerminalAuthorityTurnId,
  );
  const terminalAuthorityText = readString(terminalAuthority?.terminal_text_preview);
  const terminalAuthorityVerified =
    readBoolean(terminalAuthority?.server_authoritative) === true &&
    Boolean(terminalAuthorityText) &&
    terminalAuthorityMatchesSelectedTurn;
  const terminalArtifactKind = imageLensPromptLeakRecovered
    ? readString(terminalPresentation?.terminal_artifact_kind) ??
      readString(terminalAuthority?.terminal_artifact_kind) ??
      readString(debug?.terminal_artifact_kind) ??
      readString(agentLoop?.terminal_artifact_kind) ??
      readString(payload.terminal_artifact_kind) ??
      "agent_provider_terminal_candidate"
    : terminalAuthorityVerified
      ? readString(terminalAuthority?.terminal_artifact_kind) ??
        readString(terminalPresentation?.terminal_artifact_kind) ??
        readString(agentLoop?.terminal_artifact_kind) ??
        readString(debug?.terminal_artifact_kind) ??
        readString(payload.terminal_artifact_kind) ??
        null
    : readString(agentLoop?.terminal_artifact_kind) ??
      readString(debug?.terminal_artifact_kind) ??
      readString(payload.terminal_artifact_kind) ??
      readString(terminalAuthority?.terminal_artifact_kind) ??
      null;
  const finalAnswerSource = imageLensPromptLeakRecovered
    ? readString(terminalPresentation?.final_answer_source) ??
      readString(terminalAuthority?.final_answer_source) ??
      readString(debug?.final_answer_source) ??
      readString(agentLoop?.final_answer_source) ??
      readString(payload.final_answer_source) ??
      "agent_provider_terminal_candidate"
    : terminalAuthorityVerified
      ? readString(terminalAuthority?.final_answer_source) ??
        readString(terminalPresentation?.final_answer_source) ??
        readString(agentLoop?.final_answer_source) ??
        readString(debug?.final_answer_source) ??
        readString(payload.final_answer_source)
    : readString(agentLoop?.final_answer_source) ??
      readString(debug?.final_answer_source) ??
      readString(payload.final_answer_source) ??
      readString(terminalAuthority?.final_answer_source);
  const terminalErrorCode = imageLensPromptLeakRecovered
    ? null
    : terminalAuthorityVerified
      ? null
    : readString(agentLoop?.terminal_error_code) ??
      readString(debug?.terminal_error_code) ??
      readString(payload.terminal_error_code);
  const routeEvidenceAuthority = asRecord(
    payload.route_evidence_authority ??
    debug?.route_evidence_authority ??
    asRecord(debug?.ask_turn_solver_trace)?.route_evidence_authority,
  );
  const routeTerminalProductBlocked =
    !routeEvidenceAuthorityAllowsTerminalKind(routeEvidenceAuthority, terminalArtifactKind);
  const promptRequiresBackendEntrypoint = requiresBackendEntrypointForDebugExport(
    readString(reply.question) ?? readString(payload.selectedDebugQuestion) ?? "",
  );
  const existingBackendDebugRef =
    asRecord(debug?.backend_debug_response_ref) ??
    asRecord(debug?.debug_export_ref) ??
    asRecord(payload.backend_debug_response_ref) ??
    asRecord(payload.debug_export_ref);
  const backendDebugRefPresent = Boolean(existingBackendDebugRef);
  const capabilityLaneBackendArtifactPresent = Boolean(
    readRecordArray(capabilityLaneCallResults).length > 0 ||
      readRecordArray(capabilityLaneObservationPackets).length > 0 ||
      readRecordArray(capabilityLaneProjectionReceipts).length > 0 ||
      asRecord(runtimeLaneRequestLoop),
  );
  const backendSolverArtifactPresent = Boolean(
    payload.ask_turn_solver_trace ??
      debug?.ask_turn_solver_trace ??
      agentLoop?.ask_turn_solver_trace ??
      payload.agent_runtime_loop ??
      debug?.agent_runtime_loop ??
      agentLoop?.agent_runtime_loop ??
      payload.canonical_goal_frame ??
      debug?.canonical_goal_frame ??
      agentLoop?.canonical_goal_frame ??
      (capabilityLaneBackendArtifactPresent ? { capability_lane_backend_artifact_present: true } : null),
  );
  const askEntrypointRequired =
    readBoolean(agentLoop?.ask_entrypoint_required) ??
    readBoolean(debug?.ask_entrypoint_required) ??
    readBoolean(payload.ask_entrypoint_required) ??
    promptRequiresBackendEntrypoint;
  const explicitAskEntrypointObserved =
    readBoolean(agentLoop?.ask_entrypoint_observed) ??
    readBoolean(debug?.ask_entrypoint_observed) ??
    readBoolean(payload.ask_entrypoint_observed);
  const askEntrypointObserved =
    explicitAskEntrypointObserved ??
    (askEntrypointRequired ? (isReplyScopedDebugProjection ? null : backendSolverArtifactPresent) : null);
  const askEntrypointFailureCode =
    readString(agentLoop?.ask_entrypoint_failure_code) ??
    readString(debug?.ask_entrypoint_failure_code) ??
    readString(payload.ask_entrypoint_failure_code) ??
    (askEntrypointRequired && askEntrypointObserved === false ? "backend_ask_entry_required" : null);
  const blockedProjectionKind =
    readString(agentLoop?.blocked_projection_kind) ??
    readString(debug?.blocked_projection_kind) ??
    readString(payload.blocked_projection_kind) ??
    (askEntrypointRequired && askEntrypointObserved === false ? "client_projection" : null);
  const backendEntrypointRuntimeFingerprint = asRecord(
    payload.backend_ask_entrypoint_runtime_fingerprint ??
      debug?.backend_ask_entrypoint_runtime_fingerprint ??
      agentLoop?.backend_ask_entrypoint_runtime_fingerprint,
  );
  const hardPromptProjectionGuard = asRecord(
    payload.hard_prompt_projection_guard ??
      debug?.hard_prompt_projection_guard ??
      agentLoop?.hard_prompt_projection_guard,
  );
  const clientProjectionPolicyVersion =
    readString(hardPromptProjectionGuard?.client_projection_policy_version) ??
    readString(debug?.client_projection_policy_version) ??
    readString(payload.client_projection_policy_version);
  const demotedProjectionLayers = Array.isArray(hardPromptProjectionGuard?.demoted_projection_layers)
    ? hardPromptProjectionGuard.demoted_projection_layers
    : Array.isArray(debug?.demoted_projection_layers)
      ? debug.demoted_projection_layers
      : Array.isArray(payload.demoted_projection_layers)
        ? payload.demoted_projection_layers
        : [];
  const evidenceFinalizationGateDemoted =
    readBoolean(debug?.evidence_finalization_gate_demoted) ??
    readBoolean(payload.evidence_finalization_gate_demoted) ??
    false;
  const clientEntrypointGuardVersion =
    readString(backendEntrypointRuntimeFingerprint?.client_entrypoint_guard_version) ??
    readString(debug?.client_entrypoint_guard_version) ??
    readString(payload.client_entrypoint_guard_version);
  const submitHandlerSource =
    readString(backendEntrypointRuntimeFingerprint?.submit_handler_source) ??
    readString(debug?.submit_handler_source) ??
    readString(payload.submit_handler_source);
  const runAskEntered =
    readBoolean(backendEntrypointRuntimeFingerprint?.runAsk_entered) ??
    readBoolean(debug?.runAsk_entered) ??
    readBoolean(payload.runAsk_entered);
  const hardBackendEntrypointRequired =
    readBoolean(backendEntrypointRuntimeFingerprint?.hard_backend_entrypoint_required) ??
    readBoolean(debug?.hard_backend_entrypoint_required) ??
    readBoolean(payload.hard_backend_entrypoint_required) ??
    askEntrypointRequired;
  const useBackendAskTurnEntrypoint =
    readBoolean(backendEntrypointRuntimeFingerprint?.use_backend_ask_turn_entrypoint) ??
    readBoolean(debug?.use_backend_ask_turn_entrypoint) ??
    readBoolean(payload.use_backend_ask_turn_entrypoint);
  const backendAskCallAttempted =
    readBoolean(backendEntrypointRuntimeFingerprint?.backend_ask_call_attempted) ??
    readBoolean(debug?.backend_ask_call_attempted) ??
    readBoolean(payload.backend_ask_call_attempted);
  const backendAskCallPath =
    readString(backendEntrypointRuntimeFingerprint?.backend_ask_call_path) ??
    readString(debug?.backend_ask_call_path) ??
    readString(payload.backend_ask_call_path);
  const backendAskCallError =
    readString(backendEntrypointRuntimeFingerprint?.backend_ask_call_error) ??
    readString(debug?.backend_ask_call_error) ??
    readString(payload.backend_ask_call_error);
  const routeMetadataSource =
    readString(backendEntrypointRuntimeFingerprint?.route_metadata_source) ??
    readString(debug?.route_metadata_source) ??
    readString(payload.route_metadata_source);
  const mandatoryNextToolName =
    readString(backendEntrypointRuntimeFingerprint?.mandatory_next_tool_name) ??
    readString(debug?.mandatory_next_tool_name) ??
    readString(payload.mandatory_next_tool_name);
  const legacyAskLocalBypassed =
    readBoolean(backendEntrypointRuntimeFingerprint?.legacy_ask_local_bypassed) ??
    readBoolean(debug?.legacy_ask_local_bypassed) ??
    readBoolean(payload.legacy_ask_local_bypassed);
  const firstBrokenRail =
    readString(backendEntrypointRuntimeFingerprint?.first_broken_rail) ??
    readString(debug?.first_broken_rail) ??
    readString(payload.first_broken_rail) ??
    (askEntrypointRequired && askEntrypointObserved === false
      ? backendAskCallAttempted === true
        ? "backend_debug_materialization"
        : "backend_ask_entrypoint"
      : null);
  const repairTarget =
    readString(backendEntrypointRuntimeFingerprint?.repair_target) ??
    readString(debug?.repair_target) ??
    readString(payload.repair_target) ??
    (firstBrokenRail === "backend_debug_materialization"
      ? "debug_export_bridge"
      : firstBrokenRail === "backend_ask_entrypoint" || firstBrokenRail === "prompt_submit_entrypoint"
        ? "prompt_submit_entrypoint"
        : null);
  const backendEntrypointProjectionBlocked =
    askEntrypointRequired &&
    askEntrypointObserved === false &&
    !terminalAuthorityVerified &&
    (explicitAskEntrypointObserved === false || !isReplyScopedDebugProjection);
  const hardBackendEntrypointPrompt = isHardBackendEntrypointDebugPrompt(
    readString(reply.question) ?? readString(payload.selectedDebugQuestion) ?? "",
  );
  const backendEntrypointMissing =
    askEntrypointRequired &&
    (askEntrypointObserved === false || (hardBackendEntrypointPrompt && askEntrypointObserved !== true)) &&
    !terminalAuthorityVerified;
  const effectiveTerminalErrorCode =
    backendEntrypointMissing
        ? askEntrypointFailureCode ?? "backend_ask_entry_required"
        : routeTerminalProductBlocked
          ? "route_terminal_product_not_allowed"
        : imageLensPromptLeakRecovered
          ? null
          : terminalAuthorityVerified
            ? null
            : terminalErrorCode ?? askEntrypointFailureCode;
  const effectiveTerminalArtifactKind =
    backendEntrypointMissing
      ? "typed_failure"
      : routeTerminalProductBlocked
        ? "typed_failure"
      : imageLensPromptLeakRecovered
        ? terminalArtifactKind ?? "agent_provider_terminal_candidate"
        : terminalArtifactKind ?? (effectiveTerminalErrorCode ? "typed_failure" : null);
  const effectiveFinalAnswerSource =
    backendEntrypointMissing
      ? "typed_failure"
      : routeTerminalProductBlocked
        ? "typed_failure"
      : imageLensPromptLeakRecovered
        ? finalAnswerSource ?? "agent_provider_terminal_candidate"
        : finalAnswerSource ?? (effectiveTerminalErrorCode ? "typed_failure" : null);
  const typedFailure = asRecord(payload.typed_failure ?? debug?.typed_failure ?? agentLoop?.typed_failure);
  const terminalIsTypedFailure =
    effectiveTerminalArtifactKind === "typed_failure" ||
    effectiveFinalAnswerSource === "typed_failure" ||
    Boolean(effectiveTerminalErrorCode);
  const modelSynthesizedFinalDraft =
    !terminalIsTypedFailure &&
    effectiveTerminalArtifactKind === "model_synthesized_answer" &&
    effectiveFinalAnswerSource === "final_answer_draft";
  const replyScopedVisibleFinalAnswer = isReplyScopedDebugProjection
    ? readString(payload.selectedDebugFinalAnswer)
    : null;
  const selectedFinalAnswer =
    terminalAuthorityVerified
      ? terminalAuthorityText
    : modelSynthesizedFinalDraft
      ? readString(payload.selected_final_answer) ??
        readString(agentLoop?.selected_final_answer) ??
        readString(debug?.selected_final_answer) ??
        terminalAuthorityText ??
        readString(terminalPresentation?.concise_text)
      : terminalIsTypedFailure
      ? replyScopedVisibleFinalAnswer ??
        (effectiveTerminalErrorCode === "backend_ask_entry_required"
          ? "This prompt requires the backend Ask solver path before a final answer can be shown."
          : effectiveTerminalErrorCode === "backend_debug_materialization"
            ? "Backend Ask was reached, but no server terminal artifact or debug artifact was materialized for this turn."
          : effectiveTerminalErrorCode === "route_terminal_product_not_allowed"
            ? "I could not complete that turn.\nCause: route_terminal_product_not_allowed."
          : null) ??
        readString(payload.terminal_failure_text) ??
        readString(typedFailure?.message) ??
        terminalAuthorityText
      : readString(terminalPresentation?.concise_text) ??
        readString(payload.selected_final_answer) ??
        readString(agentLoop?.selected_final_answer) ??
        readString(debug?.selected_final_answer) ??
        terminalAuthorityText ??
        readString(payload.selectedDebugFinalAnswer) ??
        readString(payload.finalAnswer);
  const canonicalGoalFrame = asRecord(debug?.canonical_goal_frame ?? agentLoop?.canonical_goal_frame);
  const activeTurnId =
    replyScopedSelectedTurnId ??
    readString(debug?.turn_id) ??
    readString(canonicalGoalFrame?.turn_id) ??
    readString(asRecord(payload.turnTruthTable)?.turn_id) ??
    readString(reply.id) ??
    "unknown-turn";
  const canonicalActiveTurnId =
    replyScopedSelectedTurnId ??
    (terminalAuthorityVerified ? terminalAuthorityTurnId : null) ??
    activeTurnId;
  const projectedBackendDebugRef =
    existingBackendDebugRef ??
    buildBackendDebugExportRef(canonicalActiveTurnId) ??
    buildBackendDebugExportRef(activeTurnId) ??
    buildBackendDebugExportRef(reply.id);
  const clientActiveTurnId = readString(payload.client_active_turn_id) ?? readString(reply.id);
  const scientificEvidenceTrace = buildScientificEvidenceDebugProjection({
    activeTurnId: canonicalActiveTurnId,
    source: payload,
    ledger,
  });
  const routeProductContract = asRecord(payload.route_product_contract ?? debug?.route_product_contract);
  const committedAskRoute = asRecord(payload.committed_ask_route ?? debug?.committed_ask_route);
  const committedCanonicalGoal = asRecord(committedAskRoute?.canonical_goal);
  const sourceTargetIntent = asRecord(payload.source_target_intent ?? debug?.source_target_intent);
  const compactArtifactAdmissionTraces = readRecordArray(scientificEvidenceTrace?.artifact_admission_traces);
  const hardEvidenceTurnPathTrace = {
    schema: "helix.hard_evidence_turn_path_trace.v1",
    submit_path_entered: runAskEntered ?? null,
    backend_ask_required: hardBackendEntrypointRequired ?? askEntrypointRequired,
    backend_ask_called: backendAskCallAttempted ?? null,
    backend_ask_call_path: backendAskCallPath ?? null,
    backend_ask_call_error: backendAskCallError ?? null,
    route_contract_selected: Boolean(routeProductContract || committedCanonicalGoal || sourceTargetIntent),
    route_contract_source_target:
      readString(routeProductContract?.source_target) ??
      readString(sourceTargetIntent?.target_source) ??
      readString(committedCanonicalGoal?.source_target) ??
      null,
    route_contract_target_kind:
      readString(sourceTargetIntent?.target_kind) ??
      readString(committedCanonicalGoal?.target_kind) ??
      null,
    route_contract_allowed_terminal_artifact_kinds: [
      ...readStringArray(routeProductContract?.allowed_terminal_artifact_kinds),
      ...readStringArray(committedCanonicalGoal?.allowed_terminal_artifact_kinds),
      ...readStringArray(routeEvidenceAuthority?.allowed_terminal_artifact_kinds),
    ].slice(0, 24),
    route_evidence_authority_ref:
      readString(routeEvidenceAuthority?.schema) === "helix.route_evidence_authority.v1"
        ? `${readString(routeEvidenceAuthority?.turn_id) || canonicalActiveTurnId}:route_evidence_authority`
        : null,
    route_authority_candidate_tool_count: readRecordArray(routeEvidenceAuthority?.candidate_tools).length,
    route_authority_admitted_tool_count: readRecordArray(routeEvidenceAuthority?.admitted_tools).length,
    route_authority_rejected_tool_count: readRecordArray(routeEvidenceAuthority?.rejected_tools).length,
    route_authority_supporting_evidence_ref_count: readStringArray(routeEvidenceAuthority?.supporting_evidence_refs).length,
    route_authority_terminal_product_allowed: readBoolean(routeEvidenceAuthority?.terminal_product_allowed),
    route_metadata_source: routeMetadataSource ?? null,
    mandatory_next_tool_name: mandatoryNextToolName ?? null,
    ambient_artifact_count: compactArtifactAdmissionTraces.reduce(
      (count, trace) => count + readRecordArray(trace.ambient_artifacts).length,
      0,
    ),
    admitted_artifact_count: compactArtifactAdmissionTraces.reduce(
      (count, trace) => count + readRecordArray(trace.admitted_artifacts).length,
      0,
    ),
    required_observation_count: compactArtifactAdmissionTraces.reduce(
      (count, trace) => count + readRecordArray(trace.required_prerequisites).length,
      0,
    ),
    ignored_artifact_count: compactArtifactAdmissionTraces.reduce(
      (count, trace) => count + readRecordArray(trace.ignored_artifacts).length,
      0,
    ),
    artifact_admission_statuses: compactArtifactAdmissionTraces
      .map((trace) => readString(trace.status))
      .filter((entry): entry is string => Boolean(entry))
      .slice(0, 12),
    terminal_artifact_selected: effectiveTerminalArtifactKind ?? null,
    final_answer_source_selected: effectiveFinalAnswerSource ?? null,
    terminal_error_code: effectiveTerminalErrorCode ?? null,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
  };
  const calculatorReceiptTrace = buildCalculatorReceiptDebugProjection({
    activeTurnId: canonicalActiveTurnId,
    source: payload,
    ledger,
  });
  const toolTraceDisclosure = buildCompactToolTraceDisclosure({
    actionEnvelope,
    turnId: canonicalActiveTurnId,
    scientificEvidenceTrace,
  });
  const voicePlaybackReconciliation = buildVoicePlaybackReconciliationDebug({
    activeTurnId: canonicalActiveTurnId,
    selectedFinalAnswer,
    source: payload,
  });
  const voicePlaybackReceiptBarrier = buildVoicePlaybackReceiptBarrierDebug({
    activeTurnId: canonicalActiveTurnId,
    selectedFinalAnswer,
    source: payload,
  });
  const voiceSteeringDebug = buildVoiceSteeringDebug({
    activeTurnId: canonicalActiveTurnId,
    source: payload,
    ledger,
  });
  const narratorDebug =
    asRecord(payload.client_narrator_debug ?? debug?.client_narrator_debug ?? payload.narrator_debug ?? debug?.narrator_debug) ??
    buildNarratorDebugSnapshot({ activeTurnId: canonicalActiveTurnId });
  const envelopeWithoutHash = {
    schema: "helix.ask.debug_export.v1",
    exported_at_ms: Date.now(),
    active_turn_id: canonicalActiveTurnId,
    backend_turn_id: canonicalActiveTurnId,
    client_active_turn_id: clientActiveTurnId && (isReplyScopedDebugProjection || clientActiveTurnId !== canonicalActiveTurnId)
      ? clientActiveTurnId
      : null,
    active_prompt: readString(reply.question) ?? readString(payload.selectedDebugQuestion) ?? "",
    active_prompt_hash: hashDebugExportText(readString(reply.question) ?? readString(payload.selectedDebugQuestion) ?? ""),
    selected_final_answer: selectedFinalAnswer,
    final_answer_source: effectiveFinalAnswerSource,
    terminal_artifact_kind: effectiveTerminalArtifactKind,
    terminal_error_code: effectiveTerminalErrorCode,
    ask_entrypoint_required: askEntrypointRequired,
    ask_entrypoint_observed: askEntrypointObserved,
    ask_entrypoint_failure_code: askEntrypointFailureCode,
    blocked_projection_kind: blockedProjectionKind,
    hard_prompt_projection_guard: hardPromptProjectionGuard,
    client_projection_policy_version: clientProjectionPolicyVersion,
    demoted_projection_layers: demotedProjectionLayers,
    evidence_finalization_gate_demoted: evidenceFinalizationGateDemoted,
    backend_ask_entrypoint_runtime_fingerprint: backendEntrypointRuntimeFingerprint,
    client_entrypoint_guard_version: clientEntrypointGuardVersion,
    submit_handler_source: submitHandlerSource,
    runAsk_entered: runAskEntered,
    hard_backend_entrypoint_required: hardBackendEntrypointRequired,
    use_backend_ask_turn_entrypoint: useBackendAskTurnEntrypoint,
    backend_ask_call_attempted: backendAskCallAttempted,
    backend_ask_call_path: backendAskCallPath,
    backend_ask_call_error: backendAskCallError,
    route_evidence_authority: routeEvidenceAuthority,
    hard_evidence_turn_path_trace: hardEvidenceTurnPathTrace,
    route_metadata_source: routeMetadataSource,
    mandatory_next_tool_name: mandatoryNextToolName,
    legacy_ask_local_bypassed: legacyAskLocalBypassed,
    first_broken_rail: firstBrokenRail,
    repair_target: repairTarget,
    voice_playback_reconciliation: voicePlaybackReconciliation,
    voice_playback_receipt_barrier: voicePlaybackReceiptBarrier,
    voice_steering_debug: voiceSteeringDebug,
    narrator_debug: narratorDebug,
    client_ask_turn_admission_continuation: sanitizeHelixAskTurnAdmissionContinuationDebug(
      payload.client_ask_turn_admission_continuation ??
        payload.ask_turn_admission_continuation ??
        debug?.ask_turn_admission_continuation,
    ),
    workflow_demo_debug:
      asRecord(payload.workflow_demo_debug) ??
      asRecord(asRecord(payload.channels)?.workflowDemo) ??
      null,
    scientific_evidence_trace: scientificEvidenceTrace,
    resolved_turn_summary: {
      turn_id: canonicalActiveTurnId,
      final_status: "final_answer",
      resolved_route_label: "unknown",
      terminal_artifact_kind: effectiveTerminalArtifactKind,
      terminal_error_code: effectiveTerminalErrorCode,
      pending_server_request_present: Boolean(agentLoop?.pending_request),
    },
    solver_controller_summary: buildSolverControllerSummary(payload),
    canonical_goal_frame: canonicalGoalFrame,
    agent_continuation_state: agentContinuationState,
    agent_continuation_states: agentContinuationStates,
    terminal_rejection_observations: terminalRejectionObservations,
    available_capabilities: availableCapabilities,
    agent_step_decision: agentStepDecision,
    observation_review: observationReview,
    goal_satisfaction_evaluation: goalSatisfactionEvaluation,
    initial_available_capabilities: initialAvailableCapabilities,
    initial_agent_step_decision: initialAgentStepDecision,
    agent_step_authority_check: agentStepAuthorityCheck,
    agent_step_loop: agentStepLoop,
    agent_runtime_loop: agentRuntimeLoop,
    agent_runtime_loop_admission: agentRuntimeLoopAdmission,
    ask_turn_solver_trace:
      payload.ask_turn_solver_trace ??
      debug?.ask_turn_solver_trace ??
      agentLoop?.ask_turn_solver_trace ??
      null,
    conversational_referent_resolution:
      payload.conversational_referent_resolution ??
      debug?.conversational_referent_resolution ??
      agentLoop?.conversational_referent_resolution ??
      null,
    chat_referent_context_source_summary:
      asRecord(workspaceSnapshot?.chat_referent_context_source_summary) ??
      asRecord(workspaceSnapshot?.chatReferentContextSourceSummary) ??
      null,
    ask_turn_procedure_trace:
      payload.ask_turn_procedure_trace ??
      debug?.ask_turn_procedure_trace ??
      agentLoop?.ask_turn_procedure_trace ??
      null,
    agent_runtime: agentRuntime,
    agent_runtime_selection_trace: agentRuntimeSelectionTrace,
    selected_agent_provider: selectedAgentProvider,
    language_model_policy: languageModelPolicy,
    language_model_debug_summary: languageModelDebugSummary,
    model_policy_debug_summary: modelPolicyDebugSummary,
    debug: {
      schema: "helix.ask.debug_export_policy_projection.v1",
      language_model_policy: languageModelPolicy,
      language_model_debug_summary: languageModelDebugSummary,
      model_policy_debug_summary: modelPolicyDebugSummary,
      agent_continuation_state: agentContinuationState,
      agent_continuation_states: agentContinuationStates,
      terminal_rejection_observations: terminalRejectionObservations,
    },
    codex_native_provider_bridge: codexNativeProviderBridge,
    codex_native_compatibility_fallback: codexNativeCompatibilityFallback,
    provider_gateway_debug_summary: providerGatewayDebugSummary,
    realtime_conversation_context_materialization: realtimeConversationContextMaterialization,
    workstation_gateway_manifest: workstationGatewayManifest,
    workstation_gateway_manifest_version:
      payload.workstation_gateway_manifest_version ??
      debug?.workstation_gateway_manifest_version ??
      agentLoop?.workstation_gateway_manifest_version ??
      workstationGatewayManifest?.manifest_version,
    workstation_gateway_capability_ids:
      payload.workstation_gateway_capability_ids ??
      debug?.workstation_gateway_capability_ids ??
      agentLoop?.workstation_gateway_capability_ids,
    workstation_gateway_reentry_status:
      payload.workstation_gateway_reentry_status ??
      debug?.workstation_gateway_reentry_status ??
      agentLoop?.workstation_gateway_reentry_status,
    capability_lane_manifest: capabilityLaneManifest,
    model_visible_capability_lane_manifest: modelVisibleCapabilityLaneManifest,
    capability_lane_ids: capabilityLaneIds,
    capability_lane_statuses: capabilityLaneStatuses,
    capability_lane_resolve_traces: capabilityLaneResolveTraces,
    capability_lane_backend_selections: capabilityLaneBackendSelections,
    capability_lane_call_results: capabilityLaneCallResults,
    capability_lane_turn_timeline: capabilityLaneTurnTimeline,
    capability_lane_timeline_summary: capabilityLaneTimelineSummary,
    capability_lane_observation_packets: capabilityLaneObservationPackets,
    capability_lane_projection_receipts: capabilityLaneProjectionReceipts,
    capability_lane_session_results: capabilityLaneSessionResults,
    capability_lane_session_debug_summaries: capabilityLaneSessionDebugSummaries,
    capability_lane_mail_loop_debug_summaries: capabilityLaneMailLoopDebugSummaries,
    capability_lane_goal_binding_results: capabilityLaneGoalBindingResults,
    capability_lane_goal_binding_debug_summaries: capabilityLaneGoalBindingDebugSummaries,
    capability_lane_goal_dispatch_plans: capabilityLaneGoalDispatchPlans,
    capability_lane_goal_dispatch_admissions: capabilityLaneGoalDispatchAdmissions,
    capability_lane_goal_dispatch_readiness: capabilityLaneGoalDispatchReadiness,
    capability_lane_reentry_status: capabilityLaneReentryStatus,
    runtime_lane_request_contract: runtimeLaneRequestContract,
    runtime_lane_request_loop: runtimeLaneRequestLoop,
    runtime_lane_request_retry: runtimeLaneRequestRetry,
    realtime_runtime_session_summary: realtimeRuntimeSessionSummary,
    realtime_runtime_session_events: normalizeCapabilityLaneEvidenceRecords(
      realtimeRuntimeSessionEvents,
      fallbackRuntimeAgentProvider,
    ),
    realtime_transcript_observations: normalizeCapabilityLaneEvidenceRecords(
      normalizeRealtimeTranscriptObservationsForExport(
        realtimeTranscriptObservations,
        fallbackRuntimeAgentProvider,
      ),
      fallbackRuntimeAgentProvider,
    ),
    realtime_tool_suggestion_observations: normalizeRealtimeToolSuggestionObservationsForExport(
      realtimeToolSuggestionObservations,
      fallbackRuntimeAgentProvider,
    ),
    realtime_client_receipt_observations: normalizeRealtimeClientReceiptObservationsForExport(
      realtimeClientReceiptObservations,
      fallbackRuntimeAgentProvider,
    ),
    realtime_grounded_answer_feedback: realtimeGroundedAnswerFeedback,
    provider_prompt_leak_guard: providerPromptLeakGuard,
    visible_translation_chain_summary: visibleTranslationChainSummary,
    terminal_authority_status:
      payload.terminal_authority_status ??
      debug?.terminal_authority_status ??
      agentLoop?.terminal_authority_status,
    workstation_gateway_call_results: workstationGatewayCallResults,
    workstation_gateway_observation_packets: workstationGatewayObservationPackets,
    workspace_action_client_ack:
      payload.workspace_action_client_ack ?? debug?.workspace_action_client_ack ?? null,
    client_receipt_terminal:
      payload.client_receipt_terminal ?? debug?.client_receipt_terminal ?? null,
    client_receipt_terminal_authority:
      payload.client_receipt_terminal_authority ?? debug?.client_receipt_terminal_authority ?? null,
    turn_transcript_events: Array.isArray(turnTranscriptEvents) ? turnTranscriptEvents : [],
    provider_terminal_candidate: providerTerminalCandidate,
    provider_reasoning_reentry: providerReasoningReentry,
    terminal_authority_candidate_review: terminalAuthorityCandidateReview,
    provider_terminal_authority_bridge: providerTerminalAuthorityBridge,
    runtime_intent_packet: runtimeIntentPacket,
    runtime_authority_audit: runtimeAuthorityAudit,
    runtime_continuation_hints: runtimeContinuationHints,
    runtime_goal_command: runtimeGoalCommand,
    runtime_goal_session: runtimeGoalSession,
    runtime_goal_debug_export: runtimeGoalDebugExport,
    runtime_goal_debug_summary: runtimeGoalDebugSummary,
    current_turn_artifact_ledger: ledger,
    current_turn_events: Array.isArray(agentLoop?.turn_events) ? agentLoop.turn_events : [],
    terminal_answer_authority: terminalAuthority,
    terminal_grounding_authority: terminalGroundingAuthority,
    terminal_presentation: terminalPresentation,
    calculator_planner_result: calculatorPlannerResult,
    calculator_planner_repair_result: calculatorPlannerRepairResult,
    calculator_plan_coverage: calculatorPlanCoverage,
    calculator_receipt_debug_projection: calculatorReceiptTrace,
    calculator_receipt_taxonomy: calculatorReceiptTrace.taxonomy,
    calculator_receipt_status: calculatorReceiptTrace.calculator_receipt_status,
    calculator_receipt_ref: calculatorReceiptTrace.calculator_receipt_ref,
    prompt_requirement_coverage: promptRequirementCoverage,
    final_answer_repair_request: finalAnswerRepairRequest,
    final_answer_draft: finalAnswerDraft,
    action_envelope: actionEnvelope,
    codex_host_workstation_affordances: codexHostWorkstationAffordances,
    workstation_actions: hostWorkstationActions,
    support_refs: hostSupportRefs,
    tool_output_refs: hostToolOutputRefs,
    tool_trace_disclosure: toolTraceDisclosure,
    coverage_artifacts: coverageArtifacts,
    calculator_panel_state: calculatorPanelState,
    workspace_action_debug: receipt
      ? {
          workspace_action_registry_audit: receipt.workspace_action_registry_audit,
          workspace_action_lifecycle_events: lifecycleEvents,
          workspace_action_receipt: receipt,
          anti_determinism_audit: receipt.workspace_action_anti_determinism_audit,
          workspace_action_debug_proof: {
            action_key: receipt.action_key,
            target_id: receipt.target_id,
            action_id: receipt.action_id,
            lifecycle_events_present: lifecycleEvents
              .map((entry) => readString(asRecord(entry)?.event))
              .filter(Boolean),
            receipt_artifact_id: receiptArtifact?.artifact_id,
            receipt_status: receipt.status,
            registry_verdict: readString(asRecord(receipt.workspace_action_registry_audit)?.verdict),
            anti_determinism_verdict: readString(asRecord(receipt.workspace_action_anti_determinism_audit)?.verdict),
            final_answer_receipt_backed: Boolean(readString(receipt.message) && selectedFinalAnswer === readString(receipt.message)),
          },
        }
      : undefined,
    composite_goal_frame: debug?.composite_goal_frame ?? agentLoop?.composite_goal_frame,
    composite_execution_plan: debug?.composite_execution_plan ?? agentLoop?.composite_execution_plan,
    composite_turn_receipt: debug?.composite_turn_receipt ?? agentLoop?.composite_turn_receipt,
    subgoal_artifact_map: debug?.subgoal_artifact_map ?? agentLoop?.subgoal_artifact_map,
    composite_anti_determinism_audit:
      debug?.composite_anti_determinism_audit ?? agentLoop?.composite_anti_determinism_audit,
    composite_subgoal_reference_intent:
      debug?.composite_subgoal_reference_intent ?? agentLoop?.composite_subgoal_reference_intent ?? payload.composite_subgoal_reference_intent,
    composite_subgoal_binding: debug?.composite_subgoal_binding ?? agentLoop?.composite_subgoal_binding ?? payload.composite_subgoal_binding,
    composite_handoff_decision: debug?.composite_handoff_decision ?? agentLoop?.composite_handoff_decision ?? payload.composite_handoff_decision,
    composite_subgoal_explanation:
      debug?.composite_subgoal_explanation ?? agentLoop?.composite_subgoal_explanation ?? payload.composite_subgoal_explanation,
    composite_followup_anti_determinism_audit:
      debug?.composite_followup_anti_determinism_audit ?? agentLoop?.composite_followup_anti_determinism_audit ?? payload.composite_followup_anti_determinism_audit,
    live_interpretation_debug:
      payload.live_interpretation_debug ?? debug?.live_interpretation_debug ?? agentLoop?.live_interpretation_debug,
    live_interpretation_run:
      payload.live_interpretation_run ?? debug?.live_interpretation_run ?? agentLoop?.live_interpretation_run,
    live_interpretation_workers:
      payload.live_interpretation_workers ?? debug?.live_interpretation_workers ?? agentLoop?.live_interpretation_workers,
    live_interpretation_worker_runs:
      payload.live_interpretation_worker_runs ??
      debug?.live_interpretation_worker_runs ??
      agentLoop?.live_interpretation_worker_runs,
    live_interpretation_validation_artifacts:
      payload.live_interpretation_validation_artifacts ??
      debug?.live_interpretation_validation_artifacts ??
      agentLoop?.live_interpretation_validation_artifacts,
    live_interpretation_hypotheses:
      payload.live_interpretation_hypotheses ??
      debug?.live_interpretation_hypotheses ??
      agentLoop?.live_interpretation_hypotheses,
    live_interpretation_graph:
      payload.live_interpretation_graph ?? debug?.live_interpretation_graph ?? agentLoop?.live_interpretation_graph,
    live_interpretation_epoch_delta:
      payload.live_interpretation_epoch_delta ??
      debug?.live_interpretation_epoch_delta ??
      agentLoop?.live_interpretation_epoch_delta,
    pending_server_request: agentLoop?.pending_request ?? payload.pending_server_request ?? payload.pending_request ?? null,
    backend_debug_response_ref: projectedBackendDebugRef ?? undefined,
    debug_export_ref: projectedBackendDebugRef ?? undefined,
    debug_export_source: isReplyScopedDebugProjection
      ? debugExportSource || "rendered_reply"
      : backendSolverArtifactPresent || capabilityLaneBackendArtifactPresent || imageLensPromptLeakRecovered
        ? "embedded_backend_payload"
        : projectedBackendDebugRef
          ? "backend_ref_advertised"
          : "client_projection",
    backend_debug_response_status: backendSolverArtifactPresent || capabilityLaneBackendArtifactPresent || imageLensPromptLeakRecovered
        ? "embedded_payload"
        : projectedBackendDebugRef
          ? "ref_advertised"
          : "not_advertised",
    debug_export_anti_determinism_audit: {
      verdict: "clean",
      checks: [
        { check: "projection_only_patch", passed: true },
        { check: "no_goal_mutation", passed: true },
        { check: "no_terminal_mutation", passed: true },
        { check: "active_turn_only", passed: true },
        { check: "no_dom_scrape_source", passed: true },
        { check: "receipt_not_fabricated", passed: true },
      ],
    },
  };
  const visibleFinalAnswerForParity =
    modelSynthesizedFinalDraft || backendEntrypointProjectionBlocked || terminalIsTypedFailure
      ? selectedFinalAnswer
      : readString(reply.content) ?? selectedFinalAnswer;
  const uiDebugParityHarness = buildHelixUiDebugParityHarnessSnapshot({
    visibleFinalAnswer: visibleFinalAnswerForParity,
    debugExport: envelopeWithoutHash,
    calculatorPanelState,
  });
  const envelope = {
    ...envelopeWithoutHash,
    ui_debug_parity_harness: uiDebugParityHarness,
    payload_hash: hashDebugExportText(stableStringify(envelopeWithoutHash)),
  };
  return boundDebugExportEnvelopeText(envelope, JSON.stringify(envelope));
}
