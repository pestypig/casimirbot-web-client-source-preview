import { readAgentLoopAuditRecord } from "@/lib/helix/ask-runtime-authority-readers";
import { coerceText } from "@/lib/helix/ask-value-normalization";

export function readHelixPendingInputRecord(value: unknown): Record<string, unknown> | null {
  const record = readAgentLoopAuditRecord(value);
  if (!record) return null;
  const status = coerceText(record.status ?? record.state ?? record.resolution_status).trim().toLowerCase();
  if (status === "resolved" || status === "cancelled" || status === "canceled" || status === "superseded") {
    return null;
  }
  const requestId = coerceText(record.request_id ?? record.requestId ?? record.id).trim();
  const prompt = coerceText(record.prompt ?? record.message ?? record.text ?? record.question).trim();
  const requiredFieldsCandidate = record.required_fields ?? record.requiredFields;
  const requiredFields = Array.isArray(requiredFieldsCandidate) ? requiredFieldsCandidate : [];
  if (requestId || prompt || requiredFields.length > 0 || record.kind === "request_user_input") return record;
  return null;
}

export function normalizeHelixPendingTransitionMarker(value: unknown): string {
  return coerceText(value).trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function readHelixPendingTransitionTrace(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeHelixPendingTransitionMarker(entry)).filter(Boolean);
  }
  const text = normalizeHelixPendingTransitionMarker(value);
  return text ? [text] : [];
}

export function hasHelixPendingCancellationMarker(record: Record<string, unknown>): boolean {
  const pendingStatusAfter = normalizeHelixPendingTransitionMarker(
    record.pending_status_after ?? record.pendingStatusAfter ?? record.status_after,
  );
  if (pendingStatusAfter === "canceled" || pendingStatusAfter === "cancelled") return true;

  const pendingContext =
    record.pending_intercepted_turn === true ||
    Boolean(record.pending_status_before ?? record.pending_status_after) ||
    Boolean(record.pending_request ?? record.pending_server_request ?? record.pendingRequest) ||
    readHelixPendingTransitionTrace(record.pending_transition_trace).length > 0;
  if (!pendingContext) return false;

  const markers = [
    record.pending_transition_reason,
    record.pendingTransitionReason,
    record.pending_interception_reason,
    record.pendingInterceptionReason,
    record.pending_resolution_reason,
    record.pendingResolutionReason,
    record.resolution_reason,
    record.reason,
    ...readHelixPendingTransitionTrace(record.pending_transition_trace),
  ].map((entry) => normalizeHelixPendingTransitionMarker(entry));
  return markers.some(
    (marker) =>
      marker === "pending_clarify_canceled" ||
      marker === "pending_request_canceled" ||
      marker === "request_user_input_canceled" ||
      marker === "cancel_pending" ||
      marker === "canceled_pending_request" ||
      marker.includes("pending_clarify_canceled"),
  );
}

export function isHelixCanceledPendingTurn(...sources: unknown[]): boolean {
  const stack = sources
    .map((source) => readAgentLoopAuditRecord(source))
    .filter((record): record is Record<string, unknown> => Boolean(record));
  const seen = new WeakSet<object>();
  while (stack.length > 0) {
    const record = stack.pop();
    if (!record || seen.has(record)) continue;
    seen.add(record);
    if (hasHelixPendingCancellationMarker(record)) return true;
    [
      record.debug,
      record.agent_loop_audit,
      record.turn_truth_table,
      record.turn_runtime,
      record.runtime_summary,
      record.terminal,
    ].forEach((candidate) => {
      const nested = readAgentLoopAuditRecord(candidate);
      if (nested && !seen.has(nested)) stack.push(nested);
    });
  }
  return false;
}

export function resolveHelixPendingInputRecord(...sources: unknown[]): Record<string, unknown> | null {
  if (isHelixCanceledPendingTurn(...sources)) return null;
  for (const source of sources) {
    const record = readAgentLoopAuditRecord(source);
    if (!record) continue;
    const direct = readHelixPendingInputRecord(record);
    if (direct && (record.prompt || record.request_id || record.requestId || record.required_fields || record.requiredFields)) {
      return direct;
    }
    const agentLoopAudit = readAgentLoopAuditRecord(record.agent_loop_audit);
    const turnTruthTable = readAgentLoopAuditRecord(record.turn_truth_table);
    const runtimeSummary = readAgentLoopAuditRecord(record.turn_runtime ?? agentLoopAudit?.runtime_summary);
    const pendingCandidates = [
      record.pending_request,
      record.pending_server_request,
      record.pendingRequest,
      record.server_request,
      record.request_user_input,
      agentLoopAudit?.pending_request,
      agentLoopAudit?.pending_server_request,
      turnTruthTable?.pending_request,
      turnTruthTable?.pending_transition,
      runtimeSummary?.pending_request,
    ];
    for (const candidate of pendingCandidates) {
      const pending = readHelixPendingInputRecord(candidate);
      if (pending) return pending;
    }
  }
  return null;
}
