import { asObjectRecord, coerceText } from "@/lib/helix/ask-value-normalization";

export type ReasoningTheaterHardFailureSignals = {
  failed: boolean;
  reasons: string[];
};

function pushReasoningTheaterHardFailureReason(reasons: string[], reason: string | null | undefined): void {
  const normalized = (reason ?? "").trim();
  if (!normalized || reasons.includes(normalized)) return;
  reasons.push(normalized);
}

function collectReasoningTheaterAuditFailureReasons(
  record: Record<string, unknown>,
  key: string,
  reasons: string[],
): void {
  const audit = asObjectRecord(record[key]);
  if (!audit) return;
  if (audit.ok === false) {
    pushReasoningTheaterHardFailureReason(reasons, `${key}.ok_false`);
  }
  const violations = Array.isArray(audit.violations) ? audit.violations : [];
  for (const violation of violations) {
    const violationRecord = asObjectRecord(violation);
    if (!violationRecord) continue;
    const kind = coerceText(violationRecord.kind).trim();
    const summary = coerceText(violationRecord.summary).trim();
    pushReasoningTheaterHardFailureReason(reasons, kind || summary || `${key}.violation`);
  }
}

function collectReasoningTheaterHardFailureReasonsFromRecord(
  record: Record<string, unknown>,
  reasons: string[],
): void {
  collectReasoningTheaterAuditFailureReasons(record, "poison_audit", reasons);
  collectReasoningTheaterAuditFailureReasons(record, "prompt_poison_audit", reasons);

  const visibleProjectionInvariant = asObjectRecord(record.visible_projection_invariant);
  const visibleProjectionViolations = Array.isArray(visibleProjectionInvariant?.violations)
    ? visibleProjectionInvariant.violations
    : [];
  for (const violation of visibleProjectionViolations) {
    const text = coerceText(violation).trim();
    pushReasoningTheaterHardFailureReason(reasons, text || "visible_projection_invariant.violation");
  }

  const resolvedTurnSummary = asObjectRecord(record.resolved_turn_summary);
  const terminalErrorCode = coerceText(resolvedTurnSummary?.terminal_error_code ?? record.terminal_error_code).trim();
  if (terminalErrorCode) {
    pushReasoningTheaterHardFailureReason(reasons, terminalErrorCode);
  }
  const resolvedFinalStatus = coerceText(resolvedTurnSummary?.final_status).trim();
  if (/^(failed|error|fail_closed)$/i.test(resolvedFinalStatus)) {
    pushReasoningTheaterHardFailureReason(reasons, `resolved_turn_summary.${resolvedFinalStatus}`);
  }

  const observationReview = asObjectRecord(record.observation_review);
  const reviewNextAction = coerceText(observationReview?.runtime_next_action ?? observationReview?.next_action).trim();
  if (/^fail_closed$/i.test(reviewNextAction)) {
    pushReasoningTheaterHardFailureReason(reasons, "observation_review.fail_closed");
  }
  const reviewReason = [
    observationReview?.reason,
    observationReview?.missing_piece,
    observationReview?.observed_artifact_kind,
  ]
    .map((value) => coerceText(value).trim())
    .filter(Boolean)
    .join(" ");
  if (/\b(direct_answer_unavailable|terminal_error|contract|forbidden|poison|fail_closed)\b/i.test(reviewReason)) {
    pushReasoningTheaterHardFailureReason(reasons, reviewReason);
  }

  const routeHistoryDebug = asObjectRecord(record.route_history_debug);
  const terminalRoute = coerceText(routeHistoryDebug?.terminal_route).trim();
  if (/\b(typed_failure|direct_answer_unavailable|forbidden|fail_closed)\b/i.test(terminalRoute)) {
    pushReasoningTheaterHardFailureReason(reasons, terminalRoute);
  }

  const currentTurnEvents = Array.isArray(record.current_turn_events) ? record.current_turn_events : [];
  for (const event of currentTurnEvents) {
    const eventRecord = asObjectRecord(event);
    if (!eventRecord) continue;
    const type = coerceText(eventRecord.type).trim();
    const status = coerceText(eventRecord.status).trim();
    const errorCode = coerceText(eventRecord.error_code).trim();
    const reason = coerceText(eventRecord.reason).trim();
    if (
      /^(failed|error|fail_closed|blocked)$/i.test(status) &&
      /\b(turn_completed|terminal|final|authority|audit)\b/i.test(type)
    ) {
      pushReasoningTheaterHardFailureReason(reasons, `event.${type || "unknown"}.${status}`);
    }
    if (/\b(direct_answer_unavailable|terminal_error|contract|forbidden|poison|fail_closed)\b/i.test(`${errorCode} ${reason}`)) {
      pushReasoningTheaterHardFailureReason(reasons, `${type || "event"} ${errorCode || reason}`.trim());
    }
  }
}

export function readReasoningTheaterHardFailureSignals(
  debug: unknown,
  askLiveEvents: readonly unknown[] = [],
): ReasoningTheaterHardFailureSignals {
  const reasons: string[] = [];
  const debugRecord = asObjectRecord(debug);
  if (debugRecord) {
    collectReasoningTheaterHardFailureReasonsFromRecord(debugRecord, reasons);
  }
  for (const event of askLiveEvents) {
    const eventRecord = asObjectRecord(event);
    if (!eventRecord) continue;
    const eventText = [
      eventRecord.type,
      eventRecord.status,
      eventRecord.text,
      eventRecord.reason,
      eventRecord.error_code,
    ]
      .map((value) => coerceText(value).trim())
      .filter(Boolean)
      .join(" ");
    if (/\b(terminal_artifact_forbidden_by_route_contract|direct_answer_unavailable|fail_closed|poison_audit|turn_completed failed)\b/i.test(eventText)) {
      pushReasoningTheaterHardFailureReason(reasons, eventText);
    }
    const eventMeta = asObjectRecord(eventRecord.meta);
    if (eventMeta) {
      collectReasoningTheaterHardFailureReasonsFromRecord(eventMeta, reasons);
    }
  }
  return {
    failed: reasons.length > 0,
    reasons: reasons.slice(0, 8),
  };
}
