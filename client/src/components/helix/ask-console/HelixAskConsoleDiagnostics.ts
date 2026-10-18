import type {
  HelixAskConsoleStreamIngressDebug,
  HelixContinuousTurnStreamRow,
} from "@/lib/helix/ask-active-turn-stream";
import {
  HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_UNKNOWN,
  normalizeHelixLiveTranslationProjectionTarget,
} from "@shared/helix-live-translation-projection-target";

export type HelixAskConsoleDiagnosticsReply = {
  id: string;
  canonicalKey: string;
  createdAtMs: number;
};

export type HelixAskConsoleDiagnosticsActiveDom = Record<string, unknown> | null;

export type HelixAskConsoleCapabilityLaneRowStage =
  | "visible"
  | "requested"
  | "backend_selected"
  | "observed"
  | "receipt"
  | "reentered"
  | "session"
  | "mail_loop"
  | "goal_binding"
  | "goal_dispatch_plan"
  | "goal_dispatch_admission"
  | "goal_dispatch_readiness"
  | "terminal_selected"
  | "terminal_rejected";

export type HelixAskConsoleCapabilityLaneExecutionState =
  | "available_only"
  | "requested_not_executed"
  | "backend_selected"
  | "executed_pending_reentry"
  | "receipt_pending_reentry"
  | "reentered"
  | "session_active"
  | "mail_loop_active"
  | "goal_bound"
  | "goal_dispatch"
  | "terminal_selected"
  | "terminal_rejected";

const helixAskConsoleCapabilityLaneExecutionStates = new Set<string>([
  "available_only",
  "requested_not_executed",
  "backend_selected",
  "executed_pending_reentry",
  "receipt_pending_reentry",
  "reentered",
  "session_active",
  "mail_loop_active",
  "goal_bound",
  "goal_dispatch",
  "terminal_selected",
  "terminal_rejected",
]);

export type HelixAskConsoleCapabilityLaneSummary = {
  lifecycleStatus:
    | "none"
    | "visible_only"
    | "requested"
    | "backend_selected"
    | "executed"
    | "reentered"
    | "session_active"
    | "mail_loop_active"
    | "goal_bound"
    | "terminal_selected"
    | "terminal_rejected";
  visibleCount: number;
  requestedCount: number;
  executedCount: number;
  backendSelectedCount: number;
  observedCount: number;
  receiptCount: number;
  reenteredCount: number;
  sessionCount: number;
  observedSessionCount: number;
  mailLoopCount: number;
  observedMailLoopCount: number;
  mailboxWakeExpectedCount: number;
  decisionWakeExpectedCount: number;
  goalBindingCount: number;
  observedGoalBindingCount: number;
  observedLaneActivityCount: number;
  goalDispatchPlanCount: number;
  goalDispatchAdmissionCount: number;
  goalDispatchReadinessCount: number;
  terminalSelectedCount: number;
  terminalRejectedCount: number;
  terminalAuthorityRejectedCount: number;
  visibleReceiptRefCount: number;
  evidenceReceiptRefCount: number;
  runtimeAgentProviders: string[];
  laneIds: string[];
  backendProviders: string[];
  stageSequence: HelixAskConsoleCapabilityLaneRowStage[];
  stageSequenceText: string;
  visibleLaneDoesNotMeanExecuted: true;
};

export type HelixAskConsoleCapabilityLaneRowDetail = {
  executionState: HelixAskConsoleCapabilityLaneExecutionState;
  normalizedStage: string | null;
  stateLabel: string | null;
  selectedRuntimeAgentProvider: string | null;
  adapterBoundary: string | null;
  laneId: string | null;
  capabilityId: string | null;
  requestedBackendProvider: string | null;
  selectedBackendProvider: string | null;
  fallbackBackendProvider: string | null;
  backendSelectionReason: string | null;
  backendCostClass: string | null;
  backendLatencyClass: string | null;
  backendPrivacyClass: string | null;
  observationRef: string | null;
  receiptRef: string | null;
  latestVisibleObservationRef: string | null;
  latestVisibleReceiptRef: string | null;
  latestEvidenceObservationRef: string | null;
  latestEvidenceReceiptRef: string | null;
  reentryStatus: string | null;
  sourceId: string | null;
  sourceHash: string | null;
  sourceKind: string | null;
  sourceTextHash: string | null;
  sourceTextCharCount: string | null;
  projectionKey: string | null;
  projectionTarget: string | null;
  accountLocale: string | null;
  targetLanguage: string | null;
  chunkId: string | null;
  chunkIndex: string | null;
  dedupeKey: string | null;
  sourceEventId: string | null;
  sourceEventMs: string | null;
  observedAtMs: string | null;
  freshnessStatus: string | null;
  cancelRequested: string | null;
  goalId: string | null;
  goalBindingId: string | null;
  goalBindingKey: string | null;
  bindingStatus: string | null;
  activationPolicy: string | null;
  attentionPolicy: string | null;
  stopCondition: string | null;
  reportPolicy: string | null;
  quietBehavior: string | null;
  reportAction: string | null;
  reportReason: string | null;
  quietBehaviorApplied: string | null;
  wakeExpected: string | null;
  mailboxWakeExpected: string | null;
  decisionWakeExpected: string | null;
  surfaceBadgeExpected: string | null;
  terminalReportRequested: string | null;
  terminalReportAuthorized: string | null;
  laneSessionId: string | null;
  sessionStatus: string | null;
  sessionHealth: string | null;
  sessionDebugPhase: string | null;
  sessionObservationStatus: string | null;
  sessionLifecycleAction: string | null;
  blockedReason: string | null;
  sessionControlKey: string | null;
  sourceBindingKey: string | null;
  latestSourceBindingKey: string | null;
  laneSessionSourceBindingKey: string | null;
  laneSessionSourceIdentityKey: string | null;
  sourceIdentityKey: string | null;
  latestSourceIdentityKey: string | null;
  latestObservationKey: string | null;
  latestMailLoopObservationKey: string | null;
  evidenceRefs: string[];
  latestEventId: string | null;
  stagePlayMailId: string | null;
  stagePlayMailDeliveryStatus: string | null;
  previousStagePlayMailId: string | null;
  mailboxThreadId: string | null;
  mailStatus: string | null;
  wakeKind: string | null;
  materializedMailLoopEvidence: string | null;
  hasObservation: string | null;
  liveMailLoopRequiredCount: string | null;
  terminalAuthorityRequiredCount: string | null;
  anyLiveMailLoopRequired: string | null;
  anyTerminalAuthorityRequired: string | null;
  observationLaneSessionId: string | null;
  reportSummaryText: string | null;
  laneVisible: string | null;
  laneRequested: string | null;
  laneExecuted: string | null;
  observationReentered: string | null;
  contextRole: string | null;
  answerAuthority: string | null;
  terminalEligible: string | null;
  assistantAnswer: string | null;
  rawContentIncluded: string | null;
  terminalAuthorityStatus: string | null;
};

export type HelixAskConsoleAssemblyDebugSnapshot = {
  schema: "helix.ask.console_assembly_debug.v1";
  askBusy: boolean;
  activeTurnId: string | null;
  activeTraceId: string | null;
  activeStartedAtMs: number | null;
  activeQuestion: string;
  totalLiveEventCount: number;
  retainedLiveEventCount: number;
  activeLiveEventCount: number;
  activeRowCount: number;
  replyCount: number;
  latestReplyId: string | null;
  streamIngress: HelixAskConsoleStreamIngressDebug;
  activeStreamDom: HelixAskConsoleDiagnosticsActiveDom;
  renderOrder: Array<
    | {
        kind: "active_turn_stream";
        key: string;
        rowCount: number;
        renderPlacement: "inline_active_turn";
      }
    | {
        kind: "completed_reply";
        index: number;
        replyId: string;
        canonicalKey: string;
        createdAtMs: number;
        isLatest: boolean;
      }
  >;
  filteredLiveEvents: number;
  activeRows: Array<{
    index: number;
    key: string;
    source: HelixContinuousTurnStreamRow["source"];
    label: string;
    status: string;
    text: string;
    meta: string;
  }>;
  capabilityLaneSummary: HelixAskConsoleCapabilityLaneSummary;
  capabilityLaneRows: Array<{
    index: number;
    key: string;
    stage: HelixAskConsoleCapabilityLaneRowStage;
    label: string;
    status: string;
    text: string;
    meta: string;
    detail: HelixAskConsoleCapabilityLaneRowDetail;
    detailText: string | null;
  }>;
};

function clipDiagnosticText(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 3))}...`;
}

export function resolveHelixAskConsoleCapabilityLaneRowStage(
  row: HelixContinuousTurnStreamRow,
): HelixAskConsoleCapabilityLaneRowStage | null {
  const label = row.label.toLowerCase();
  const haystack = `${row.label} ${row.status} ${row.meta} ${row.text}`.toLowerCase();
  const hasStage = (stage: string): boolean =>
    haystack.includes(`source_event_type":"${stage}`) ||
    haystack.includes(`"stage":"${stage}`) ||
    haystack.includes(`stage ${stage}`);
  if (label === "lane state" || hasStage("lane_console_state")) {
    if (
      haystack.includes("state terminal_rejected") ||
      haystack.includes("normalized stage terminal_rejected") ||
      haystack.includes("terminal authority missing")
    ) {
      return "terminal_rejected";
    }
    if (haystack.includes("state terminal_selected") || haystack.includes("normalized stage terminal_selected")) {
      return "terminal_selected";
    }
    if (haystack.includes("normalized stage reentered") || haystack.includes("state reentered")) {
      return "reentered";
    }
    if (haystack.includes("normalized stage receipt") || haystack.includes("state receipt")) {
      return "receipt";
    }
    if (
      haystack.includes("normalized stage observed") ||
      haystack.includes("state observed") ||
      haystack.includes("observed_pending_reentry")
    ) {
      return "observed";
    }
    if (haystack.includes("normalized stage backend") || haystack.includes("state backend")) {
      return "backend_selected";
    }
    if (haystack.includes("normalized stage requested") || haystack.includes("state requested")) {
      return "requested";
    }
    if (haystack.includes("normalized stage visible") || haystack.includes("visible_only")) {
      return "visible";
    }
  }
  if (label === "lane visible" || hasStage("lane_visible")) {
    return "visible";
  }
  if (label === "lane request" || hasStage("lane_requested")) {
    return "requested";
  }
  if (label === "lane backend" || hasStage("lane_backend_selected")) {
    return "backend_selected";
  }
  if (label === "lane observation" || hasStage("lane_observation")) {
    return "observed";
  }
  if (label === "lane receipt" || hasStage("lane_projection_receipt")) {
    return "receipt";
  }
  if (label === "lane re-entry" || hasStage("lane_reentered")) {
    return "reentered";
  }
  if (label === "lane session" || hasStage("lane_session")) {
    return "session";
  }
  if (label === "lane mail" || hasStage("lane_mail_loop")) {
    return "mail_loop";
  }
  if (label === "goal lane" || hasStage("lane_goal_binding")) {
    return "goal_binding";
  }
  if (label === "goal dispatch" || hasStage("lane_goal_dispatch_plan")) {
    return "goal_dispatch_plan";
  }
  if (label === "goal admission" || hasStage("lane_goal_dispatch_admission")) {
    return "goal_dispatch_admission";
  }
  if (label === "goal readiness" || hasStage("lane_goal_dispatch_readiness")) {
    return "goal_dispatch_readiness";
  }
  if (
    label === "terminal" &&
    (haystack.includes("terminal_rejected") ||
      haystack.includes("terminal rejected") ||
      haystack.includes("terminal_authority_missing") ||
      haystack.includes("terminal authority missing")) &&
    (haystack.includes("capability_lane") || haystack.includes("lane"))
  ) {
    return "terminal_rejected";
  }
  if (
    label === "terminal" &&
    (haystack.includes("capability_lane") || haystack.includes("terminal_selected"))
  ) {
    return "terminal_selected";
  }
  return null;
}

const laneStageTokens = new Set<string>([
  "lane_visible",
  "lane_requested",
  "lane_backend_selected",
  "lane_observation",
  "lane_projection_receipt",
  "lane_reentered",
  "lane_session",
  "lane_mail_loop",
  "lane_goal_binding",
  "lane_goal_dispatch_plan",
  "lane_goal_dispatch_admission",
  "lane_goal_dispatch_readiness",
  "terminal_selected",
  "terminal_rejected",
]);

const readMetaTokenValue = (tokens: string[], prefix: string): string | null => {
  const token = tokens.find((entry) => {
    const normalized = entry.toLowerCase();
    if (prefix === "observation " && normalized.startsWith("observation session ")) return false;
    if (prefix === "source event " && normalized.startsWith("source event ms ")) return false;
    return normalized.startsWith(prefix);
  });
  return token ? token.slice(prefix.length).trim() || null : null;
};

const readSourceIdMetaToken = (tokens: string[]): string | null => {
  const explicit = readMetaTokenValue(tokens, "source id ");
  if (explicit) return explicit;
  const genericSources = tokens
    .map((entry) => entry.trim())
    .filter((entry) => {
      const normalized = entry.toLowerCase();
      return (
        normalized.startsWith("source ") &&
        !normalized.startsWith("source hash ") &&
        !normalized.startsWith("source kind ") &&
        !normalized.startsWith("source payload ") &&
        !normalized.startsWith("source text ") &&
        !normalized.startsWith("source projection ") &&
        !normalized.startsWith("source identity ") &&
        !normalized.startsWith("source binding ") &&
        !normalized.startsWith("source event ")
      );
    })
    .map((entry) => entry.slice("source ".length).trim())
    .filter((entry) => entry.includes(":") || entry.includes("/") || entry.includes("\\"));
  return genericSources.length > 0 ? genericSources[genericSources.length - 1] : null;
};

const readProjectionTargetMetaToken = (tokens: string[]): string | null =>
  readMetaTokenValue(tokens, "projection target ") ||
  readMetaTokenValue(tokens, "source projection ") ||
  readMetaTokenValue(tokens, "latest projection ") ||
  readMetaTokenValue(tokens, "projection ");

const normalizeConsoleProjectionTarget = (value: string | null): string | null => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;
  const normalized = normalizeHelixLiveTranslationProjectionTarget(
    trimmed,
    HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_UNKNOWN,
  );
  return normalized === HELIX_LIVE_TRANSLATION_PROJECTION_TARGET_UNKNOWN && trimmed !== normalized
    ? trimmed
    : normalized;
};

function resolveHelixAskConsoleCapabilityLaneExecutionState(input: {
  stage: string | null;
  laneVisible?: string | null;
  laneRequested?: string | null;
  laneExecuted?: string | null;
  observationReentered?: string | null;
}): HelixAskConsoleCapabilityLaneExecutionState {
  if (input.stage === "terminal_rejected") return "terminal_rejected";
  if (input.stage === "terminal_selected") return "terminal_selected";
  if (input.stage === "lane_reentered" || input.stage === "reentered" || input.observationReentered === "true") {
    return "reentered";
  }
  if (input.stage === "lane_goal_dispatch_plan" ||
    input.stage === "lane_goal_dispatch_admission" ||
    input.stage === "lane_goal_dispatch_readiness") {
    return "goal_dispatch";
  }
  if (input.stage === "lane_goal_binding") return "goal_bound";
  if (input.stage === "lane_mail_loop") return "mail_loop_active";
  if (input.stage === "lane_session") return "session_active";
  if (input.stage === "lane_projection_receipt" || input.stage === "receipt") return "receipt_pending_reentry";
  if (input.stage === "lane_backend_selected" || input.stage === "backend_selected" || input.stage === "backend") {
    return "backend_selected";
  }
  if (input.stage === "lane_observation" || input.stage === "observed" || input.laneExecuted === "true") {
    return "executed_pending_reentry";
  }
  if (input.stage === "lane_requested" || input.laneRequested === "true") return "requested_not_executed";
  if (input.stage === "lane_visible" || input.laneVisible === "true") return "available_only";
  return "available_only";
}

function readHelixAskConsoleCapabilityLaneExecutionState(
  value: string | null,
): HelixAskConsoleCapabilityLaneExecutionState | null {
  if (!value) return null;
  return helixAskConsoleCapabilityLaneExecutionStates.has(value)
    ? value as HelixAskConsoleCapabilityLaneExecutionState
    : null;
}

const readStructuredMetaRecord = (value: string): Record<string, unknown> | null => {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
};

const readStructuredString = (
  record: Record<string, unknown>,
  ...keys: string[]
): string | null => {
  for (const key of keys) {
    const aliases = new Set<string>([
      key,
      key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()),
      key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
    ]);
    for (const alias of aliases) {
      const value = record[alias];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
      if (typeof value === "boolean") return String(value);
    }
  }
  return null;
};

const readStructuredStringArray = (
  record: Record<string, unknown>,
  ...keys: string[]
): string[] => {
  for (const key of keys) {
    const aliases = new Set<string>([
      key,
      key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase()),
      key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
    ]);
    for (const alias of aliases) {
      const value = record[alias];
      if (!Array.isArray(value)) continue;
      return Array.from(new Set(
        value
          .map((entry) => typeof entry === "string" ? entry.trim() : "")
          .filter(Boolean),
      ));
    }
  }
  return [];
};

const readStructuredRecord = (
  record: Record<string, unknown>,
  ...keys: string[]
): Record<string, unknown> | null => {
  for (const key of keys) {
    const value = record[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
};

export function resolveHelixAskConsoleCapabilityLaneRowDetail(
  row: HelixContinuousTurnStreamRow,
): HelixAskConsoleCapabilityLaneRowDetail {
  const structured = readStructuredMetaRecord(row.meta);
  if (
    structured?.schema === "helix.capability_lane.provider_timeline_event.v1" ||
    structured?.schema === "helix.capability_lane.console_state_row.v1"
  ) {
    const reportDecision = readStructuredRecord(structured, "report_decision", "reportDecision");
    const stage = readStructuredString(structured, "stage");
    const normalizedStage = readStructuredString(structured, "normalized_stage") || stage;
    const laneVisible =
      readStructuredString(structured, "lane_visible") ||
      (stage === "lane_visible" ? "true" : null);
    const laneRequested =
      readStructuredString(structured, "lane_requested") ||
      (stage === "lane_requested" ? "true" : null);
    const laneExecuted =
      readStructuredString(structured, "lane_executed") ||
      (stage === "lane_observation" ||
      stage === "lane_projection_receipt" ||
      stage === "lane_reentered" ||
      stage === "observed" ||
      stage === "receipt" ||
      stage === "reentered"
        ? "true"
        : null);
    const observationReentered =
      readStructuredString(structured, "observation_reentered") ||
      (stage === "lane_reentered" ? "true" : null);
    const derivedExecutionState = resolveHelixAskConsoleCapabilityLaneExecutionState({
      stage,
      laneVisible,
      laneRequested,
      laneExecuted,
      observationReentered,
    });
    return {
      executionState:
        readHelixAskConsoleCapabilityLaneExecutionState(
          readStructuredString(structured, "execution_state", "executionState"),
        ) ?? derivedExecutionState,
      normalizedStage,
      stateLabel: readStructuredString(structured, "state_label", "status"),
      selectedRuntimeAgentProvider: readStructuredString(structured, "selected_runtime_agent_provider"),
      adapterBoundary: readStructuredString(structured, "adapter_boundary"),
      laneId: readStructuredString(structured, "lane_id"),
      capabilityId: readStructuredString(structured, "capability_id", "capability"),
      requestedBackendProvider: readStructuredString(structured, "requested_backend_provider"),
      selectedBackendProvider: readStructuredString(structured, "selected_backend_provider"),
      fallbackBackendProvider: readStructuredString(structured, "fallback_backend_provider"),
      backendSelectionReason: readStructuredString(structured, "selection_reason", "backend_selection_reason"),
      backendCostClass: readStructuredString(structured, "cost_class", "backend_cost_class"),
      backendLatencyClass: readStructuredString(structured, "latency_class", "backend_latency_class"),
      backendPrivacyClass: readStructuredString(structured, "privacy_class", "backend_privacy_class"),
      observationRef: readStructuredString(structured, "observation_ref"),
      receiptRef: readStructuredString(
        structured,
        "receipt_ref",
        "latest_receipt_ref",
        "last_receipt_ref",
      ),
      latestVisibleObservationRef: readStructuredString(
        structured,
        "latest_visible_observation_ref",
        "latestVisibleObservationRef",
        "visible_observation_ref",
        "visibleObservationRef",
      ),
      latestVisibleReceiptRef: readStructuredString(
        structured,
        "latest_visible_receipt_ref",
        "latestVisibleReceiptRef",
        "visible_receipt_ref",
        "visibleReceiptRef",
      ),
      latestEvidenceObservationRef: readStructuredString(
        structured,
        "latest_evidence_observation_ref",
        "latestEvidenceObservationRef",
        "evidence_observation_ref",
        "evidenceObservationRef",
      ),
      latestEvidenceReceiptRef: readStructuredString(
        structured,
        "latest_evidence_receipt_ref",
        "latestEvidenceReceiptRef",
        "evidence_receipt_ref",
        "evidenceReceiptRef",
      ),
      reentryStatus: readStructuredString(
        structured,
        "reentry_status",
        "capability_lane_reentry_status",
      ),
      sourceId: readStructuredString(structured, "source_id", "latest_source_id"),
      sourceHash: readStructuredString(structured, "source_hash", "latest_source_hash"),
      sourceKind: readStructuredString(structured, "source_kind", "latest_source_kind"),
      sourceTextHash: readStructuredString(structured, "source_text_hash"),
      sourceTextCharCount: readStructuredString(structured, "source_text_char_count"),
      projectionKey: readStructuredString(structured, "projection_key"),
      projectionTarget: normalizeConsoleProjectionTarget(readStructuredString(
        structured,
        "projection_target",
        "latest_projection_target",
        "source_projection_target",
      )),
      accountLocale: readStructuredString(structured, "account_locale", "latest_account_locale"),
      targetLanguage: readStructuredString(structured, "target_language", "latest_target_language"),
      chunkId: readStructuredString(structured, "chunk_id", "latest_chunk_id"),
      chunkIndex: readStructuredString(structured, "chunk_index", "latest_chunk_index"),
      dedupeKey: readStructuredString(structured, "dedupe_key", "latest_dedupe_key"),
      sourceEventId: readStructuredString(structured, "source_event_id", "latest_source_event_id"),
      sourceEventMs: readStructuredString(structured, "source_event_ms", "latest_source_event_ms"),
      observedAtMs: readStructuredString(structured, "observed_at_ms", "latest_observed_at_ms"),
      freshnessStatus: readStructuredString(structured, "freshness_status", "latest_freshness_status"),
      cancelRequested: readStructuredString(structured, "cancel_requested", "latest_cancel_requested"),
      goalId: readStructuredString(structured, "goal_id"),
      goalBindingId: readStructuredString(structured, "goal_binding_id"),
      goalBindingKey: readStructuredString(structured, "goal_binding_key"),
      bindingStatus: readStructuredString(structured, "binding_status"),
      activationPolicy: readStructuredString(structured, "activation_policy"),
      attentionPolicy: readStructuredString(structured, "attention_policy"),
      stopCondition: readStructuredString(structured, "stop_condition"),
      reportPolicy: readStructuredString(structured, "report_policy"),
      quietBehavior: readStructuredString(structured, "quiet_behavior"),
      reportAction: readStructuredString(structured, "report_action"),
      reportReason: readStructuredString(structured, "report_reason"),
      quietBehaviorApplied:
        readStructuredString(structured, "quiet_behavior_applied") ||
        (reportDecision ? readStructuredString(reportDecision, "quiet_behavior_applied") : null),
      wakeExpected:
        readStructuredString(structured, "wake_expected") ||
        (reportDecision ? readStructuredString(reportDecision, "wake_expected") : null),
      mailboxWakeExpected:
        readStructuredString(structured, "mailbox_wake_expected") ||
        (reportDecision ? readStructuredString(reportDecision, "mailbox_wake_expected") : null),
      decisionWakeExpected:
        readStructuredString(structured, "decision_wake_expected") ||
        (reportDecision ? readStructuredString(reportDecision, "decision_wake_expected") : null),
      surfaceBadgeExpected:
        readStructuredString(structured, "surface_badge_expected") ||
        (reportDecision ? readStructuredString(reportDecision, "surface_badge_expected") : null),
      terminalReportRequested:
        readStructuredString(structured, "terminal_report_requested") ||
        (reportDecision ? readStructuredString(reportDecision, "terminal_report_requested") : null),
      terminalReportAuthorized:
        readStructuredString(structured, "terminal_report_authorized") ||
        (reportDecision ? readStructuredString(reportDecision, "terminal_report_authorized") : null),
      laneSessionId: readStructuredString(structured, "lane_session_id"),
      sessionStatus: readStructuredString(structured, "session_status", "status"),
      sessionHealth: readStructuredString(structured, "session_health", "health"),
      sessionDebugPhase: readStructuredString(structured, "session_debug_phase"),
      sessionObservationStatus: readStructuredString(structured, "session_observation_status"),
      sessionLifecycleAction: readStructuredString(
        structured,
        "session_lifecycle_action",
        "lifecycle_action",
        "session_action",
      ),
      blockedReason: readStructuredString(structured, "blocked_reason"),
      sessionControlKey: readStructuredString(structured, "session_control_key"),
      sourceBindingKey: readStructuredString(structured, "source_binding_key"),
      latestSourceBindingKey: readStructuredString(structured, "latest_source_binding_key"),
      laneSessionSourceBindingKey: readStructuredString(structured, "lane_session_source_binding_key"),
      laneSessionSourceIdentityKey: readStructuredString(structured, "lane_session_source_identity_key"),
      sourceIdentityKey: readStructuredString(structured, "source_identity_key"),
      latestSourceIdentityKey: readStructuredString(structured, "latest_source_identity_key"),
      latestObservationKey: readStructuredString(structured, "latest_observation_key"),
      latestMailLoopObservationKey: readStructuredString(structured, "latest_mail_loop_observation_key"),
      evidenceRefs: readStructuredStringArray(structured, "evidence_refs", "evidenceRefs"),
      latestEventId: readStructuredString(structured, "latest_event_id"),
      stagePlayMailId: readStructuredString(structured, "stage_play_mail_id", "mail_loop_ref"),
      stagePlayMailDeliveryStatus: readStructuredString(structured, "stage_play_mail_delivery_status"),
      previousStagePlayMailId: readStructuredString(structured, "previous_stage_play_mail_id"),
      mailboxThreadId: readStructuredString(structured, "mailbox_thread_id"),
      mailStatus: readStructuredString(structured, "mail_status"),
      wakeKind: readStructuredString(structured, "wake_kind", "latest_mail_loop_wake_kind"),
      materializedMailLoopEvidence: readStructuredString(structured, "materialized_mail_loop_evidence"),
      hasObservation: readStructuredString(structured, "has_observation"),
      liveMailLoopRequiredCount: readStructuredString(structured, "live_mail_loop_required_count"),
      terminalAuthorityRequiredCount: readStructuredString(structured, "terminal_authority_required_count"),
      anyLiveMailLoopRequired: readStructuredString(structured, "any_live_mail_loop_required"),
      anyTerminalAuthorityRequired: readStructuredString(structured, "any_terminal_authority_required"),
      observationLaneSessionId: readStructuredString(structured, "observation_lane_session_id"),
      reportSummaryText: readStructuredString(structured, "report_summary_text"),
      laneVisible,
      laneRequested,
      laneExecuted,
      observationReentered,
      contextRole: readStructuredString(structured, "context_role"),
      answerAuthority: readStructuredString(structured, "answer_authority"),
      terminalEligible: readStructuredString(structured, "terminal_eligible"),
      assistantAnswer: readStructuredString(structured, "assistant_answer"),
      rawContentIncluded: readStructuredString(structured, "raw_content_included"),
      terminalAuthorityStatus: readStructuredString(structured, "terminal_authority_status"),
    };
  }

  const tokens = row.meta
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const explicitContextRole =
    readMetaTokenValue(tokens, "context role ") ||
    readMetaTokenValue(tokens, "context ") ||
    readMetaTokenValue(tokens, "role ");
  const answerAuthority = readMetaTokenValue(tokens, "answer authority ");
  const terminalEligible = readMetaTokenValue(tokens, "terminal eligible ");
  const assistantAnswer = readMetaTokenValue(tokens, "assistant answer ");
  const rawContentIncluded = readMetaTokenValue(tokens, "raw content included ");
  const hasEvidenceRef =
    Boolean(
      readMetaTokenValue(tokens, "observation ") ||
        readMetaTokenValue(tokens, "receipt ") ||
        readMetaTokenValue(tokens, "observation key ") ||
        readMetaTokenValue(tokens, "mail observation key ") ||
        readMetaTokenValue(tokens, "mail loop observation key "),
    ) ||
    row.evidenceRefs.length > 0;
  const laneId = tokens.find((entry) => {
    const normalized = entry.toLowerCase();
    if (normalized.startsWith("source ")) return false;
    if (laneStageTokens.has(normalized)) return false;
    if (normalized.includes(" ")) return false;
    return /^[a-z][a-z0-9_-]*$/.test(normalized);
  }) ?? null;
  const normalizedStage = readMetaTokenValue(tokens, "normalized stage ");
  const tokenStage = tokens
    .map((entry) => entry.toLowerCase())
    .find((entry) => laneStageTokens.has(entry)) ?? null;
  const laneVisible = readMetaTokenValue(tokens, "lane visible ") ||
    (tokens.some((entry) => entry.toLowerCase() === "lane_visible") ? "true" : null);
  const laneRequested = readMetaTokenValue(tokens, "lane requested ") ||
    (tokens.some((entry) => entry.toLowerCase() === "lane_requested") ? "true" : null);
  const laneExecuted = readMetaTokenValue(tokens, "lane executed ") ||
    (tokens.some((entry) => {
      const normalized = entry.toLowerCase();
      return normalized === "lane_observation" ||
        normalized === "lane_projection_receipt" ||
        normalized === "lane_reentered" ||
        normalized === "normalized stage observed";
    }) ? "true" : null);
  const observationReentered = readMetaTokenValue(tokens, "observation re-entered ") ||
    (tokens.some((entry) => entry.toLowerCase() === "lane_reentered") ? "true" : null);
  return {
    executionState: resolveHelixAskConsoleCapabilityLaneExecutionState({
      stage: normalizedStage || tokenStage,
      laneVisible,
      laneRequested,
      laneExecuted,
      observationReentered,
    }),
    normalizedStage,
    stateLabel: readMetaTokenValue(tokens, "state "),
    selectedRuntimeAgentProvider:
      readMetaTokenValue(tokens, "runtime provider ") ||
      readMetaTokenValue(tokens, "selected runtime ") ||
      readMetaTokenValue(tokens, "agent provider "),
    adapterBoundary:
      readMetaTokenValue(tokens, "adapter boundary ") ||
      readMetaTokenValue(tokens, "adapter "),
    laneId,
    capabilityId: readMetaTokenValue(tokens, "capability "),
    requestedBackendProvider: readMetaTokenValue(tokens, "requested backend "),
    selectedBackendProvider: readMetaTokenValue(tokens, "backend "),
    fallbackBackendProvider: readMetaTokenValue(tokens, "fallback backend "),
    backendSelectionReason:
      readMetaTokenValue(tokens, "selection reason ") ||
      readMetaTokenValue(tokens, "backend selection reason "),
    backendCostClass:
      readMetaTokenValue(tokens, "cost class ") ||
      readMetaTokenValue(tokens, "cost "),
    backendLatencyClass:
      readMetaTokenValue(tokens, "latency class ") ||
      readMetaTokenValue(tokens, "latency "),
    backendPrivacyClass:
      readMetaTokenValue(tokens, "privacy class ") ||
      readMetaTokenValue(tokens, "privacy "),
    observationRef: readMetaTokenValue(tokens, "observation "),
    receiptRef:
      readMetaTokenValue(tokens, "receipt ") ||
      readMetaTokenValue(tokens, "latest receipt ") ||
      readMetaTokenValue(tokens, "last receipt "),
    latestVisibleObservationRef:
      readMetaTokenValue(tokens, "latest visible observation ") ||
      readMetaTokenValue(tokens, "visible observation "),
    latestVisibleReceiptRef:
      readMetaTokenValue(tokens, "latest visible receipt ") ||
      readMetaTokenValue(tokens, "visible receipt "),
    latestEvidenceObservationRef:
      readMetaTokenValue(tokens, "latest evidence observation ") ||
      readMetaTokenValue(tokens, "evidence observation "),
    latestEvidenceReceiptRef:
      readMetaTokenValue(tokens, "latest evidence receipt ") ||
      readMetaTokenValue(tokens, "evidence receipt "),
    reentryStatus:
      readMetaTokenValue(tokens, "reentry status ") ||
      readMetaTokenValue(tokens, "capability lane reentry status "),
    sourceId: readSourceIdMetaToken(tokens),
    sourceHash: readMetaTokenValue(tokens, "source hash "),
    sourceKind: readMetaTokenValue(tokens, "source kind "),
    sourceTextHash:
      readMetaTokenValue(tokens, "source text hash ") ||
      readMetaTokenValue(tokens, "source payload hash "),
    sourceTextCharCount:
      readMetaTokenValue(tokens, "source text char count ") ||
      readMetaTokenValue(tokens, "source payload chars "),
    projectionKey: readMetaTokenValue(tokens, "projection key "),
    projectionTarget: normalizeConsoleProjectionTarget(readProjectionTargetMetaToken(tokens)),
    accountLocale:
      readMetaTokenValue(tokens, "account locale ") ||
      readMetaTokenValue(tokens, "latest account locale "),
    targetLanguage:
      readMetaTokenValue(tokens, "target ") ||
      readMetaTokenValue(tokens, "language "),
    chunkId: readMetaTokenValue(tokens, "chunk "),
    chunkIndex: readMetaTokenValue(tokens, "chunk index "),
    dedupeKey: readMetaTokenValue(tokens, "dedupe "),
    sourceEventId: readMetaTokenValue(tokens, "source event "),
    sourceEventMs: readMetaTokenValue(tokens, "source event ms "),
    observedAtMs: readMetaTokenValue(tokens, "observed "),
    freshnessStatus: readMetaTokenValue(tokens, "freshness "),
    cancelRequested: tokens.some((entry) => entry.toLowerCase() === "cancelled") ? "true" : null,
    goalId: readMetaTokenValue(tokens, "goal "),
    goalBindingId: readMetaTokenValue(tokens, "goal binding "),
    goalBindingKey: readMetaTokenValue(tokens, "goal binding key "),
    bindingStatus:
      readMetaTokenValue(tokens, "binding status ") ||
      readMetaTokenValue(tokens, "binding "),
    activationPolicy: readMetaTokenValue(tokens, "activation policy "),
    attentionPolicy: readMetaTokenValue(tokens, "attention policy "),
    stopCondition: readMetaTokenValue(tokens, "stop condition "),
    reportPolicy: readMetaTokenValue(tokens, "report policy "),
    quietBehavior: readMetaTokenValue(tokens, "quiet behavior "),
    reportAction: readMetaTokenValue(tokens, "report action "),
    reportReason: readMetaTokenValue(tokens, "report reason "),
    quietBehaviorApplied: readMetaTokenValue(tokens, "quiet behavior applied "),
    wakeExpected: readMetaTokenValue(tokens, "wake expected "),
    mailboxWakeExpected: readMetaTokenValue(tokens, "mailbox wake expected "),
    decisionWakeExpected: readMetaTokenValue(tokens, "decision wake expected "),
    surfaceBadgeExpected: readMetaTokenValue(tokens, "surface badge expected "),
    terminalReportRequested: readMetaTokenValue(tokens, "terminal report requested "),
    terminalReportAuthorized: readMetaTokenValue(tokens, "terminal report authorized "),
    laneSessionId: readMetaTokenValue(tokens, "lane session "),
    sessionStatus: readMetaTokenValue(tokens, "session status "),
    sessionHealth: readMetaTokenValue(tokens, "session health "),
    sessionDebugPhase: readMetaTokenValue(tokens, "session phase "),
    sessionObservationStatus: readMetaTokenValue(tokens, "observation status "),
    sessionLifecycleAction:
      readMetaTokenValue(tokens, "session lifecycle action ") ||
      readMetaTokenValue(tokens, "lifecycle action ") ||
      readMetaTokenValue(tokens, "session action ") ||
      readMetaTokenValue(tokens, "action "),
    blockedReason:
      readMetaTokenValue(tokens, "blocked reason ") ||
      readMetaTokenValue(tokens, "blocked "),
    sessionControlKey: readMetaTokenValue(tokens, "session control key "),
    sourceBindingKey: readMetaTokenValue(tokens, "source binding key "),
    latestSourceBindingKey: readMetaTokenValue(tokens, "latest source binding key "),
    laneSessionSourceBindingKey: readMetaTokenValue(tokens, "lane session source binding key "),
    laneSessionSourceIdentityKey: readMetaTokenValue(tokens, "lane session source identity key "),
    sourceIdentityKey: readMetaTokenValue(tokens, "source identity key "),
    latestSourceIdentityKey: readMetaTokenValue(tokens, "latest source identity key "),
    latestObservationKey: readMetaTokenValue(tokens, "observation key "),
    latestMailLoopObservationKey:
      readMetaTokenValue(tokens, "mail observation key ") ||
      readMetaTokenValue(tokens, "mail loop observation key "),
    evidenceRefs: row.evidenceRefs,
    latestEventId: readMetaTokenValue(tokens, "latest event "),
    stagePlayMailId:
      readMetaTokenValue(tokens, "stage play mail ") ||
      readMetaTokenValue(tokens, "stage play mail id ") ||
      readMetaTokenValue(tokens, "mail id "),
    stagePlayMailDeliveryStatus:
      readMetaTokenValue(tokens, "delivery status ") ||
      readMetaTokenValue(tokens, "mail delivery status ") ||
      readMetaTokenValue(tokens, "stage play mail delivery status "),
    previousStagePlayMailId:
      readMetaTokenValue(tokens, "previous stage play mail ") ||
      readMetaTokenValue(tokens, "previous mail "),
    mailboxThreadId:
      readMetaTokenValue(tokens, "mailbox thread ") ||
      readMetaTokenValue(tokens, "mailbox thread id "),
    mailStatus: readMetaTokenValue(tokens, "mail status "),
    wakeKind: readMetaTokenValue(tokens, "wake kind "),
    materializedMailLoopEvidence: readMetaTokenValue(tokens, "materialized mail evidence "),
    hasObservation: readMetaTokenValue(tokens, "has observation "),
    liveMailLoopRequiredCount: readMetaTokenValue(tokens, "live mail loop required "),
    terminalAuthorityRequiredCount: readMetaTokenValue(tokens, "terminal authority required "),
    anyLiveMailLoopRequired: readMetaTokenValue(tokens, "any live mail loop required "),
    anyTerminalAuthorityRequired: readMetaTokenValue(tokens, "any terminal authority required "),
    observationLaneSessionId: readMetaTokenValue(tokens, "observation session "),
    reportSummaryText: readMetaTokenValue(tokens, "report summary "),
    laneVisible,
    laneRequested,
    laneExecuted,
    observationReentered,
    contextRole: explicitContextRole || (hasEvidenceRef ? "tool_evidence" : null),
    answerAuthority,
    terminalEligible,
    assistantAnswer,
    rawContentIncluded,
    terminalAuthorityStatus: readMetaTokenValue(tokens, "terminal authority "),
  };
}

export function formatHelixAskConsoleCapabilityLaneStageDisplayText(
  stage: HelixAskConsoleCapabilityLaneRowStage,
): string {
  switch (stage) {
    case "visible":
      return "available only";
    case "requested":
      return "requested by runtime";
    case "backend_selected":
      return "backend selected";
    case "observed":
      return "observation produced";
    case "receipt":
      return "receipt produced";
    case "reentered":
      return "observation re-entered";
    case "session":
      return "session active";
    case "mail_loop":
      return "mail loop active";
    case "goal_binding":
      return "goal bound";
    case "goal_dispatch_plan":
      return "dispatch planned";
    case "goal_dispatch_admission":
      return "dispatch admitted";
    case "goal_dispatch_readiness":
      return "dispatch readiness";
    case "terminal_selected":
      return "terminal selected";
    case "terminal_rejected":
      return "terminal rejected";
  }
}

export function formatHelixAskConsoleCapabilityLaneRowDetailText(
  stage: HelixAskConsoleCapabilityLaneRowStage,
  detail: HelixAskConsoleCapabilityLaneRowDetail,
): string | null {
  const parts = [
    `Execution ${detail.executionState.replace(/_/g, " ")}`,
    detail.stateLabel ? `State ${detail.stateLabel}` : "",
    detail.normalizedStage ? `Normalized ${detail.normalizedStage}` : "",
    detail.selectedRuntimeAgentProvider ? `Provider ${detail.selectedRuntimeAgentProvider}` : "",
    detail.adapterBoundary ? `Adapter ${detail.adapterBoundary}` : "",
    detail.laneId ? `Lane ${detail.laneId}` : "",
    detail.capabilityId ? `Capability ${detail.capabilityId}` : "",
    detail.requestedBackendProvider ? `Requested backend ${detail.requestedBackendProvider}` : "",
    detail.selectedBackendProvider ? `Backend ${detail.selectedBackendProvider}` : "",
    detail.fallbackBackendProvider ? `Fallback backend ${detail.fallbackBackendProvider}` : "",
    detail.backendSelectionReason ? `Selection reason ${detail.backendSelectionReason}` : "",
    detail.backendCostClass ? `Cost ${detail.backendCostClass}` : "",
    detail.backendLatencyClass ? `Latency ${detail.backendLatencyClass}` : "",
    detail.backendPrivacyClass ? `Privacy ${detail.backendPrivacyClass}` : "",
    detail.observationRef ? `Observation ${detail.observationRef}` : "",
    detail.receiptRef ? `Receipt ${detail.receiptRef}` : "",
    detail.latestVisibleObservationRef ? `Visible observation ${detail.latestVisibleObservationRef}` : "",
    detail.latestVisibleReceiptRef ? `Visible receipt ${detail.latestVisibleReceiptRef}` : "",
    detail.latestEvidenceObservationRef ? `Evidence observation ${detail.latestEvidenceObservationRef}` : "",
    detail.latestEvidenceReceiptRef ? `Evidence receipt ${detail.latestEvidenceReceiptRef}` : "",
    detail.reentryStatus ? `Re-entry ${detail.reentryStatus}` : "",
    detail.sourceId ? `Source ${detail.sourceId}` : "",
    detail.sourceHash ? `Source hash ${detail.sourceHash}` : "",
    detail.sourceKind ? `Source kind ${detail.sourceKind}` : "",
    detail.sourceTextHash ? `Source text ${detail.sourceTextHash}` : "",
    detail.sourceTextCharCount ? `Source chars ${detail.sourceTextCharCount}` : "",
    detail.projectionKey ? `Projection key ${detail.projectionKey}` : "",
    detail.projectionTarget ? `Projection ${detail.projectionTarget}` : "",
    detail.accountLocale ? `Account locale ${detail.accountLocale}` : "",
    detail.targetLanguage ? `Target ${detail.targetLanguage}` : "",
    detail.chunkId ? `Chunk ${detail.chunkId}` : "",
    detail.chunkIndex ? `Chunk index ${detail.chunkIndex}` : "",
    detail.dedupeKey ? `Dedupe ${detail.dedupeKey}` : "",
    detail.sourceEventId ? `Source event ${detail.sourceEventId}` : "",
    detail.sourceEventMs ? `Source event ms ${detail.sourceEventMs}` : "",
    detail.observedAtMs ? `Observed ${detail.observedAtMs}` : "",
    detail.freshnessStatus ? `Freshness ${detail.freshnessStatus}` : "",
    detail.cancelRequested === "true" ? "Cancelled" : "",
    detail.goalId ? `Goal ${detail.goalId}` : "",
    detail.goalBindingId ? `Goal binding ${detail.goalBindingId}` : "",
    detail.goalBindingKey ? `Goal binding key ${detail.goalBindingKey}` : "",
    detail.bindingStatus ? `Binding ${detail.bindingStatus}` : "",
    detail.activationPolicy ? `Activation ${detail.activationPolicy}` : "",
    detail.attentionPolicy ? `Attention ${detail.attentionPolicy}` : "",
    detail.stopCondition ? `Stop ${detail.stopCondition}` : "",
    detail.reportPolicy ? `Report policy ${detail.reportPolicy}` : "",
    detail.quietBehavior ? `Quiet ${detail.quietBehavior}` : "",
    detail.reportAction ? `Report action ${detail.reportAction}` : "",
    detail.reportReason ? `Report reason ${detail.reportReason}` : "",
    detail.quietBehaviorApplied ? `Quiet applied ${detail.quietBehaviorApplied}` : "",
    detail.wakeExpected ? `Wake expected ${detail.wakeExpected}` : "",
    detail.mailboxWakeExpected ? `Mailbox wake expected ${detail.mailboxWakeExpected}` : "",
    detail.decisionWakeExpected ? `Decision wake expected ${detail.decisionWakeExpected}` : "",
    detail.surfaceBadgeExpected ? `Surface badge expected ${detail.surfaceBadgeExpected}` : "",
    detail.terminalReportRequested ? `Terminal report requested ${detail.terminalReportRequested}` : "",
    detail.terminalReportAuthorized ? `Terminal report authorized ${detail.terminalReportAuthorized}` : "",
    detail.laneSessionId ? `Session ${detail.laneSessionId}` : "",
    detail.sessionStatus ? `Session status ${detail.sessionStatus}` : "",
    detail.sessionHealth ? `Session health ${detail.sessionHealth}` : "",
    detail.sessionDebugPhase ? `Session phase ${detail.sessionDebugPhase}` : "",
    detail.sessionObservationStatus ? `Observation status ${detail.sessionObservationStatus}` : "",
    detail.sessionLifecycleAction ? `Action ${detail.sessionLifecycleAction}` : "",
    detail.blockedReason ? `Blocked ${detail.blockedReason}` : "",
    detail.sessionControlKey ? `Session control ${detail.sessionControlKey}` : "",
    detail.sourceBindingKey ? `Source binding key ${detail.sourceBindingKey}` : "",
    detail.latestSourceBindingKey ? `Latest source binding key ${detail.latestSourceBindingKey}` : "",
    detail.laneSessionSourceBindingKey
      ? `Session source binding key ${detail.laneSessionSourceBindingKey}`
      : "",
    detail.laneSessionSourceIdentityKey
      ? `Session source identity key ${detail.laneSessionSourceIdentityKey}`
      : "",
    detail.sourceIdentityKey ? `Source identity key ${detail.sourceIdentityKey}` : "",
    detail.latestSourceIdentityKey ? `Latest source identity key ${detail.latestSourceIdentityKey}` : "",
    detail.latestObservationKey ? `Observation key ${detail.latestObservationKey}` : "",
    detail.latestMailLoopObservationKey ? `Mail observation key ${detail.latestMailLoopObservationKey}` : "",
    detail.evidenceRefs.length > 0 ? `Evidence refs ${detail.evidenceRefs.length}` : "",
    detail.latestEventId ? `Latest event ${detail.latestEventId}` : "",
    detail.stagePlayMailId ? `Mail ${detail.stagePlayMailId}` : "",
    detail.stagePlayMailDeliveryStatus ? `Delivery ${detail.stagePlayMailDeliveryStatus}` : "",
    detail.previousStagePlayMailId ? `Previous mail ${detail.previousStagePlayMailId}` : "",
    detail.mailboxThreadId ? `Mailbox ${detail.mailboxThreadId}` : "",
    detail.mailStatus ? `Mail status ${detail.mailStatus}` : "",
    detail.wakeKind ? `Wake ${detail.wakeKind}` : "",
    detail.materializedMailLoopEvidence ? `Materialized mail ${detail.materializedMailLoopEvidence}` : "",
    detail.hasObservation ? `Has observation ${detail.hasObservation}` : "",
    detail.liveMailLoopRequiredCount ? `Live mail loop required ${detail.liveMailLoopRequiredCount}` : "",
    detail.terminalAuthorityRequiredCount
      ? `Terminal authority required ${detail.terminalAuthorityRequiredCount}`
      : "",
    detail.anyLiveMailLoopRequired ? `Any live mail loop required ${detail.anyLiveMailLoopRequired}` : "",
    detail.anyTerminalAuthorityRequired
      ? `Any terminal authority required ${detail.anyTerminalAuthorityRequired}`
      : "",
    detail.observationLaneSessionId ? `Observation session ${detail.observationLaneSessionId}` : "",
    detail.reportSummaryText ? `Report ${detail.reportSummaryText}` : "",
    detail.laneVisible ? `Lane visible ${detail.laneVisible}` : "",
    detail.laneRequested ? `Lane requested ${detail.laneRequested}` : "",
    detail.laneExecuted ? `Lane executed ${detail.laneExecuted}` : "",
    detail.observationReentered ? `Observation re-entered ${detail.observationReentered}` : "",
    detail.contextRole ? `Context role ${detail.contextRole}` : "",
    detail.answerAuthority ? `Answer authority ${detail.answerAuthority}` : "",
    detail.terminalEligible ? `Terminal eligible ${detail.terminalEligible}` : "",
    detail.assistantAnswer ? `Assistant answer ${detail.assistantAnswer}` : "",
    detail.rawContentIncluded ? `Raw content included ${detail.rawContentIncluded}` : "",
    detail.terminalAuthorityStatus ? `Authority ${detail.terminalAuthorityStatus}` : "",
  ].filter(Boolean);
  if (stage === "visible") {
    parts.push("Visible only, not executed");
  }
  return parts.length > 0 ? `Lane detail: ${parts.join(" | ")}.` : null;
}

export function formatHelixAskConsoleCapabilityLaneRowChips(
  detail: HelixAskConsoleCapabilityLaneRowDetail,
): string[] {
  return [
    `Execution ${detail.executionState.replace(/_/g, " ")}`,
    detail.selectedRuntimeAgentProvider ? `Provider ${detail.selectedRuntimeAgentProvider}` : "",
    detail.laneId ? `Lane ${detail.laneId}` : "",
    detail.capabilityId ? `Capability ${detail.capabilityId}` : "",
    detail.selectedBackendProvider ? `Backend ${detail.selectedBackendProvider}` : "",
    detail.observationRef ? `Observation ${detail.observationRef}` : "",
    detail.receiptRef ? `Receipt ${detail.receiptRef}` : "",
    detail.latestVisibleReceiptRef ? `Visible receipt ${detail.latestVisibleReceiptRef}` : "",
    detail.latestEvidenceReceiptRef ? `Evidence receipt ${detail.latestEvidenceReceiptRef}` : "",
    detail.terminalAuthorityStatus ? `Authority ${detail.terminalAuthorityStatus}` : "",
  ].filter((entry): entry is string => Boolean(entry));
}

export function formatHelixAskConsoleCapabilityLaneStageToken(
  stage: HelixAskConsoleCapabilityLaneRowStage,
): string {
  switch (stage) {
    case "backend_selected":
      return "backend";
    case "goal_dispatch_admission":
      return "goal_admission";
    case "goal_dispatch_plan":
      return "goal_plan";
    case "goal_dispatch_readiness":
      return "goal_readiness";
    case "mail_loop":
      return "mail";
    case "terminal_rejected":
      return "terminal_rejected";
    case "terminal_selected":
      return "terminal_selected";
    case "goal_binding":
      return "goal";
    default:
      return stage;
  }
}

export function buildHelixAskConsoleCapabilityLaneSummary(
  rows: Array<{
    stage: HelixAskConsoleCapabilityLaneRowStage;
    detail?: HelixAskConsoleCapabilityLaneRowDetail | null;
  }>,
): HelixAskConsoleCapabilityLaneSummary {
  const rowHasObservation = (row: {
    detail?: HelixAskConsoleCapabilityLaneRowDetail | null;
  }): boolean =>
    row.detail?.hasObservation === "true" ||
    (row.detail?.hasObservation !== "false" &&
      (Boolean(row.detail?.observationRef) ||
        Boolean(row.detail?.receiptRef) ||
        Boolean(row.detail?.latestVisibleObservationRef) ||
        Boolean(row.detail?.latestVisibleReceiptRef) ||
        Boolean(row.detail?.latestEvidenceObservationRef) ||
        Boolean(row.detail?.latestEvidenceReceiptRef) ||
        Boolean(row.detail?.latestObservationKey) ||
        Boolean(row.detail?.latestMailLoopObservationKey)));
  const visibleCount = rows.filter((row) => row.stage === "visible").length;
  const requestedCount = rows.filter((row) => row.stage === "requested").length;
  const backendSelectedCount = rows.filter((row) => row.stage === "backend_selected").length;
  const observedCount = rows.filter((row) => row.stage === "observed").length;
  const receiptCount = rows.filter((row) => row.stage === "receipt").length;
  const reenteredCount = rows.filter((row) => row.stage === "reentered").length;
  const executedCount = observedCount + receiptCount + reenteredCount;
  const sessionCount = rows.filter((row) => row.stage === "session").length;
  const observedSessionCount = rows.filter((row) => row.stage === "session" && rowHasObservation(row)).length;
  const mailLoopCount = rows.filter((row) => row.stage === "mail_loop").length;
  const observedMailLoopCount = rows.filter((row) => row.stage === "mail_loop" && rowHasObservation(row)).length;
  const mailboxWakeExpectedCount = rows.filter((row) => row.detail?.mailboxWakeExpected === "true").length;
  const decisionWakeExpectedCount = rows.filter((row) => row.detail?.decisionWakeExpected === "true").length;
  const goalBindingCount = rows.filter((row) => row.stage === "goal_binding").length;
  const observedGoalBindingCount = rows.filter((row) =>
    row.stage === "goal_binding" && rowHasObservation(row),
  ).length;
  const observedLaneActivityCount = observedSessionCount + observedMailLoopCount + observedGoalBindingCount;
  const goalDispatchPlanCount = rows.filter((row) => row.stage === "goal_dispatch_plan").length;
  const goalDispatchAdmissionCount = rows.filter((row) => row.stage === "goal_dispatch_admission").length;
  const goalDispatchReadinessCount = rows.filter((row) => row.stage === "goal_dispatch_readiness").length;
  const terminalSelectedCount = rows.filter((row) => row.stage === "terminal_selected").length;
  const terminalRejectedCount = rows.filter((row) => row.stage === "terminal_rejected").length;
  const terminalAuthorityRejectedCount = rows.filter((row) =>
    row.detail?.terminalAuthorityStatus === "terminal_authority_rejected",
  ).length;
  const visibleReceiptRefCount = rows.filter((row) =>
    Boolean(row.detail?.latestVisibleReceiptRef),
  ).length;
  const evidenceReceiptRefCount = rows.filter((row) =>
    Boolean(row.detail?.latestEvidenceReceiptRef),
  ).length;
  const readUniqueDetailValues = (
    readValue: (detail: HelixAskConsoleCapabilityLaneRowDetail) => string | null,
  ): string[] =>
    Array.from(new Set(
      rows
        .map((row) => row.detail)
        .filter((detail): detail is HelixAskConsoleCapabilityLaneRowDetail => Boolean(detail))
        .map(readValue)
        .filter((value): value is string => Boolean(value)),
    ));
  const runtimeAgentProviders = readUniqueDetailValues((detail) => detail.selectedRuntimeAgentProvider);
  const laneIds = readUniqueDetailValues((detail) =>
    detail.laneId === "helix_terminal_authority" ? null : detail.laneId
  );
  const backendProviders = readUniqueDetailValues((detail) => detail.selectedBackendProvider);
  const stageSequence = rows.map((row) => row.stage);
  const stageSequenceText = stageSequence.map(formatHelixAskConsoleCapabilityLaneStageToken).join(" > ");
  const hasGoalActivity =
    goalBindingCount > 0 ||
    goalDispatchPlanCount > 0 ||
    goalDispatchAdmissionCount > 0 ||
    goalDispatchReadinessCount > 0;
  const lifecycleStatus =
    terminalSelectedCount > 0
      ? "terminal_selected"
      : terminalRejectedCount > 0
        ? "terminal_rejected"
      : reenteredCount > 0
        ? "reentered"
        : executedCount > 0
          ? "executed"
          : backendSelectedCount > 0
            ? "backend_selected"
            : requestedCount > 0
              ? "requested"
              : hasGoalActivity
                ? "goal_bound"
                : mailLoopCount > 0
                  ? "mail_loop_active"
                  : sessionCount > 0
                    ? "session_active"
                    : visibleCount > 0
                      ? "visible_only"
                      : "none";
  return {
    lifecycleStatus,
    visibleCount,
    requestedCount,
    executedCount,
    backendSelectedCount,
    observedCount,
    receiptCount,
    reenteredCount,
    sessionCount,
    observedSessionCount,
    mailLoopCount,
    observedMailLoopCount,
    mailboxWakeExpectedCount,
    decisionWakeExpectedCount,
    goalBindingCount,
    observedGoalBindingCount,
    observedLaneActivityCount,
    goalDispatchPlanCount,
    goalDispatchAdmissionCount,
    goalDispatchReadinessCount,
    terminalSelectedCount,
    terminalRejectedCount,
    terminalAuthorityRejectedCount,
    visibleReceiptRefCount,
    evidenceReceiptRefCount,
    runtimeAgentProviders,
    laneIds,
    backendProviders,
    stageSequence,
    stageSequenceText,
    visibleLaneDoesNotMeanExecuted: true,
  };
}

export function formatHelixAskConsoleCapabilityLaneSummaryText(
  summary: HelixAskConsoleCapabilityLaneSummary,
): string | null {
  if (summary.lifecycleStatus === "none") return null;
  const counts = [
    summary.visibleCount > 0 ? `visible ${summary.visibleCount}` : "",
    summary.requestedCount > 0 ? `requested ${summary.requestedCount}` : "",
    summary.executedCount > 0 ? `executed ${summary.executedCount}` : "",
    summary.backendSelectedCount > 0 ? `backend ${summary.backendSelectedCount}` : "",
    summary.observedCount > 0 ? `observed ${summary.observedCount}` : "",
    summary.receiptCount > 0 ? `receipt ${summary.receiptCount}` : "",
    summary.reenteredCount > 0 ? `re-entered ${summary.reenteredCount}` : "",
    summary.sessionCount > 0 ? `session ${summary.sessionCount}` : "",
    summary.observedSessionCount > 0 ? `observed session ${summary.observedSessionCount}` : "",
    summary.mailLoopCount > 0 ? `mail ${summary.mailLoopCount}` : "",
    summary.observedMailLoopCount > 0 ? `observed mail ${summary.observedMailLoopCount}` : "",
    summary.mailboxWakeExpectedCount > 0 ? `mailbox wake ${summary.mailboxWakeExpectedCount}` : "",
    summary.decisionWakeExpectedCount > 0 ? `decision wake ${summary.decisionWakeExpectedCount}` : "",
    summary.goalBindingCount > 0 ? `goal ${summary.goalBindingCount}` : "",
    summary.observedGoalBindingCount > 0 ? `observed goal ${summary.observedGoalBindingCount}` : "",
    summary.observedLaneActivityCount > 0 ? `observed lane activity ${summary.observedLaneActivityCount}` : "",
    summary.goalDispatchPlanCount > 0 ? `dispatch plan ${summary.goalDispatchPlanCount}` : "",
    summary.goalDispatchAdmissionCount > 0 ? `dispatch admission ${summary.goalDispatchAdmissionCount}` : "",
    summary.goalDispatchReadinessCount > 0 ? `dispatch readiness ${summary.goalDispatchReadinessCount}` : "",
    summary.terminalSelectedCount > 0 ? `terminal selected ${summary.terminalSelectedCount}` : "",
    summary.terminalRejectedCount > 0 ? `terminal rejected ${summary.terminalRejectedCount}` : "",
    summary.terminalAuthorityRejectedCount > 0
      ? `authority rejected ${summary.terminalAuthorityRejectedCount}`
      : "",
    summary.visibleReceiptRefCount > 0 ? `visible receipt refs ${summary.visibleReceiptRefCount}` : "",
    summary.evidenceReceiptRefCount > 0 ? `evidence receipt refs ${summary.evidenceReceiptRefCount}` : "",
  ].filter(Boolean);
  const detail = counts.length ? counts.join(" / ") : summary.lifecycleStatus.replace(/_/g, " ");
  const lifecycle = ` Status: ${summary.lifecycleStatus.replace(/_/g, " ")}.`;
  const providerSummary = [
    summary.runtimeAgentProviders.length > 0
      ? `Runtime ${summary.runtimeAgentProviders.join(", ")}`
      : "",
    summary.laneIds.length > 0
      ? `Lane ${summary.laneIds.join(", ")}`
      : "",
    summary.backendProviders.length > 0
      ? `Backend ${summary.backendProviders.join(", ")}`
      : "",
  ].filter(Boolean);
  const providerText = providerSummary.length > 0 ? ` ${providerSummary.join(". ")}.` : "";
  const sequence = summary.stageSequenceText ? ` Path: ${summary.stageSequenceText}.` : "";
  const visibleOnlyNote = summary.visibleCount > 0
    ? " Visible lanes are available, not executed."
    : "";
  return `Lane timeline: ${detail}.${lifecycle}${providerText}${sequence}${visibleOnlyNote}`;
}

export function buildHelixAskConsoleAssemblyDebugSnapshot(input: {
  askBusy: boolean;
  activeTurnId: string | null;
  activeTraceId: string | null;
  activeStartedAtMs: number | null;
  activeQuestion: string;
  totalLiveEventCount: number;
  retainedLiveEventCount: number;
  activeLiveEventCount: number;
  visibleActiveTurnStreamRows: HelixContinuousTurnStreamRow[];
  replies: HelixAskConsoleDiagnosticsReply[];
  latestReplyId: string | null;
  streamIngress: HelixAskConsoleStreamIngressDebug;
  activeStreamDom: HelixAskConsoleDiagnosticsActiveDom;
}): HelixAskConsoleAssemblyDebugSnapshot {
  const activeRows = input.askBusy && input.activeTurnId ? input.visibleActiveTurnStreamRows : [];
  const capabilityLaneRows = activeRows
    .map((row, index) => {
      const stage = resolveHelixAskConsoleCapabilityLaneRowStage(row);
      if (!stage) return null;
      const detail = resolveHelixAskConsoleCapabilityLaneRowDetail(row);
      return {
        index,
        key: row.key,
        stage,
        label: row.label,
        status: row.status,
        text: clipDiagnosticText(row.text, 180),
        meta: clipDiagnosticText(row.meta, 240),
        detail,
        detailText: formatHelixAskConsoleCapabilityLaneRowDetailText(stage, detail),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  return {
    schema: "helix.ask.console_assembly_debug.v1",
    askBusy: input.askBusy,
    activeTurnId: input.activeTurnId,
    activeTraceId: input.activeTraceId,
    activeStartedAtMs: input.activeStartedAtMs,
    activeQuestion: input.activeQuestion,
    totalLiveEventCount: input.totalLiveEventCount,
    retainedLiveEventCount: input.retainedLiveEventCount,
    activeLiveEventCount: input.askBusy && input.activeTurnId ? input.activeLiveEventCount : 0,
    activeRowCount: activeRows.length,
    replyCount: input.replies.length,
    latestReplyId: input.latestReplyId,
    streamIngress: input.streamIngress,
    activeStreamDom: input.activeStreamDom,
    renderOrder: [
      ...(input.askBusy && input.visibleActiveTurnStreamRows.length > 0
        ? [
            {
              kind: "active_turn_stream" as const,
              key: input.activeTurnId ?? input.activeTraceId ?? "active",
              rowCount: input.visibleActiveTurnStreamRows.length,
              renderPlacement: "inline_active_turn" as const,
            },
          ]
        : []),
      ...input.replies.map((reply, index) => ({
        kind: "completed_reply" as const,
        index,
        replyId: reply.id,
        canonicalKey: reply.canonicalKey,
        createdAtMs: reply.createdAtMs,
        isLatest: reply.id === input.latestReplyId,
      })),
    ],
    filteredLiveEvents: Math.max(0, input.totalLiveEventCount - input.retainedLiveEventCount),
    activeRows: activeRows.map((row, index) => ({
      index,
      key: row.key,
      source: row.source,
      label: row.label,
      status: row.status,
      text: clipDiagnosticText(row.text, 180),
      meta: clipDiagnosticText(row.meta, 240),
    })),
    capabilityLaneSummary: buildHelixAskConsoleCapabilityLaneSummary(capabilityLaneRows),
    capabilityLaneRows,
  };
}
