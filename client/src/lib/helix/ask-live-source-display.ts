import type {
  HelixContinuousTurnStreamRow,
  HelixContinuousTurnStreamTone,
} from "@/lib/helix/ask-active-turn-stream";

export type HelixMailLoopTranscriptRowKind =
  | "mail_received"
  | "mail_wake_requested"
  | "mail_wake_deferred"
  | "mail_read_tool_call"
  | "mail_read_receipt"
  | "task_queued"
  | "task_deferred"
  | "task_running"
  | "task_completed"
  | "budget_state"
  | "processed_mail_read"
  | "processed_mail_packet"
  | "processed_mail_goal_satisfied"
  | "decision_recorded"
  | "voice_candidate"
  | "voice_requested"
  | "voice_blocked"
  | "checkpoint_summary"
  | "continuation_scheduled"
  | "continuation_deferred"
  | "tool_budget_no_progress"
  | "micro_reasoner_run"
  | "prediction_check"
  | "narrative_projection"
  | "agent_decision"
  | "interpretation"
  | "prediction"
  | "watch_next"
  | "narrative_state"
  | "interpretation_state"
  | "interpreter_profile"
  | "profile_comparison"
  | "profile_note_link"
  | "profile_compiled"
  | "text_answer"
  | "voice_callout_request"
  | "voice_tool_call"
  | "voice_receipt"
  | "voice_steering_received"
  | "voice_steering_queued"
  | "voice_steering_applied"
  | "voice_steering_deferred"
  | "voice_steering_rejected"
  | "voice_steering_cancel_requested"
  | "steering_ack_receipt"
  | "goal_context_snapshot"
  | "wait_for_next_summary"
  | "requested_tool"
  | "loop_state"
  | "blocked";

export const HELIX_MAIL_LOOP_TRANSCRIPT_ROW_KINDS = new Set<HelixMailLoopTranscriptRowKind>([
  "mail_received",
  "mail_wake_requested",
  "mail_wake_deferred",
  "mail_read_tool_call",
  "mail_read_receipt",
  "task_queued",
  "task_deferred",
  "task_running",
  "task_completed",
  "budget_state",
  "processed_mail_read",
  "processed_mail_packet",
  "processed_mail_goal_satisfied",
  "decision_recorded",
  "voice_candidate",
  "voice_requested",
  "voice_blocked",
  "checkpoint_summary",
  "continuation_scheduled",
  "continuation_deferred",
  "tool_budget_no_progress",
  "micro_reasoner_run",
  "prediction_check",
  "narrative_projection",
  "agent_decision",
  "interpretation",
  "prediction",
  "watch_next",
  "narrative_state",
  "interpretation_state",
  "interpreter_profile",
  "profile_comparison",
  "profile_note_link",
  "profile_compiled",
  "text_answer",
  "voice_callout_request",
  "voice_tool_call",
  "voice_receipt",
  "voice_steering_received",
  "voice_steering_queued",
  "voice_steering_applied",
  "voice_steering_deferred",
  "voice_steering_rejected",
  "voice_steering_cancel_requested",
  "steering_ack_receipt",
  "goal_context_snapshot",
  "wait_for_next_summary",
  "requested_tool",
  "loop_state",
  "blocked",
]);

export type HelixMailLoopTranscriptRow = {
  rowId: string;
  rowKind: HelixMailLoopTranscriptRowKind;
  title: string;
  body: string;
  evidenceRefs: string[];
  authority: string;
  terminalEligible: boolean;
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

function clipText(value: string | undefined, limit: number): string {
  if (!value) return "";
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}...`;
}

function readAgentLoopAuditRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readAgentLoopAuditArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readHelixMailLoopTranscriptRow(value: unknown): HelixMailLoopTranscriptRow | null {
  const record = readAgentLoopAuditRecord(value);
  const rowKind = coerceText(record?.rowKind).trim() as HelixMailLoopTranscriptRowKind;
  if (!record || !HELIX_MAIL_LOOP_TRANSCRIPT_ROW_KINDS.has(rowKind)) return null;
  const rowId = coerceText(record.rowId).trim() || `mail-loop-row:${rowKind}:${clipText(coerceText(record.body), 48)}`;
  const evidenceRefs = Array.isArray(record.evidenceRefs)
    ? record.evidenceRefs.map((entry) => coerceText(entry).trim()).filter(Boolean)
    : [];
  return {
    rowId,
    rowKind,
    title: coerceText(record.title).trim(),
    body: coerceText(record.body).trim(),
    evidenceRefs: Array.from(new Set(evidenceRefs)),
    authority: coerceText(record.authority).trim(),
    terminalEligible: record.terminalEligible === true,
  };
}

function collectHelixMailLoopTranscriptRowsFromCandidate(value: unknown): HelixMailLoopTranscriptRow[] {
  const record = readAgentLoopAuditRecord(value);
  if (!record) return [];
  const rows = Array.isArray(record.transcriptRows)
    ? record.transcriptRows.map(readHelixMailLoopTranscriptRow).filter((row): row is HelixMailLoopTranscriptRow => Boolean(row))
    : [];
  const payload = readAgentLoopAuditRecord(record.payload);
  if (payload) rows.push(...collectHelixMailLoopTranscriptRowsFromCandidate(payload));
  const observation = readAgentLoopAuditRecord(record.observation);
  if (observation) rows.push(...collectHelixMailLoopTranscriptRowsFromCandidate(observation));
  return rows;
}

export function collectHelixMailLoopTranscriptRows(reply: unknown): HelixMailLoopTranscriptRow[] {
  const replyRecord = readAgentLoopAuditRecord(reply);
  const debugRecord = readAgentLoopAuditRecord(replyRecord?.debug);
  const candidates: unknown[] = [
    replyRecord,
    debugRecord,
    replyRecord?.latest_result_artifact,
    debugRecord?.latest_result_artifact,
    replyRecord?.stage_play_live_source_mail,
    debugRecord?.stage_play_live_source_mail,
    replyRecord?.live_source_mail_read_result,
    debugRecord?.live_source_mail_read_result,
    replyRecord?.live_source_mail_decision,
    debugRecord?.live_source_mail_decision,
    ...readAgentLoopAuditArray(replyRecord?.current_turn_artifact_ledger),
    ...readAgentLoopAuditArray(debugRecord?.current_turn_artifact_ledger),
    ...readAgentLoopAuditArray(replyRecord?.artifact_ledger),
    ...readAgentLoopAuditArray(debugRecord?.artifact_ledger),
  ];
  const rows = candidates.flatMap(collectHelixMailLoopTranscriptRowsFromCandidate);
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.rowId}:${row.rowKind}:${row.body}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatHelixMailLoopTranscriptBody(row: HelixMailLoopTranscriptRow): string {
  if (row.rowKind === "mail_received") {
    const preview = row.body.match(/\bPreview:\s*([\s\S]+)/i)?.[1]?.trim();
    return preview ?? (row.body || "Visual summary received.");
  }
  if (row.rowKind === "prediction_check") return row.body || "No prior prediction.";
  if (row.rowKind === "narrative_projection") return row.body || "Narrative projection recorded.";
  if (row.rowKind === "budget_state") return row.body || "Mail-loop budget state recorded.";
  if (row.rowKind === "processed_mail_read") return row.body || "Processed live-source mail packet read.";
  if (row.rowKind === "processed_mail_packet") return row.body || "Processed mail packet available.";
  if (row.rowKind === "processed_mail_goal_satisfied") return row.body || "Goal satisfied by processed mail.";
  if (row.rowKind === "decision_recorded") return row.body || "Decision recorded.";
  if (row.rowKind === "voice_candidate") return row.body || "Voice candidate prepared.";
  if (row.rowKind === "voice_requested") return row.body || "Voice callout requested.";
  if (row.rowKind === "voice_blocked") return row.body || "Voice callout blocked or held by policy.";
  if (row.rowKind === "checkpoint_summary") return row.body || "Checkpoint summary recorded.";
  if (row.rowKind === "continuation_scheduled") return row.body || "Continuation scheduled; backend wake loop remains armed.";
  if (row.rowKind === "continuation_deferred") return row.body || "Continuation deferred for pressure; unread mail retained.";
  if (row.rowKind === "tool_budget_no_progress") return row.body || "Tool budget stopped because the latest tool call made no progress.";
  if (row.rowKind === "micro_reasoner_run") return row.body || "Micro-reasoner run recorded.";
  if (row.rowKind === "task_queued" || row.rowKind === "task_deferred" || row.rowKind === "task_running" || row.rowKind === "task_completed") return row.body;
  if (row.rowKind === "mail_read_tool_call") return "live_env.read_live_source_mail";
  if (row.rowKind === "mail_read_receipt") {
    if (/^\s*Read\s+\d+\s+/i.test(row.body)) return row.body;
    const count = row.body.match(/\b(\d+)\s+unread\b/i)?.[1] ?? "1";
    return `Read ${count} unread live-source mail item${count === "1" ? "" : "s"}.`;
  }
  if (row.rowKind === "agent_decision") {
    const match = row.body.match(/^([^:]+):\s*([\s\S]+)$/);
    if (match) return `${match[1].trim()}\nReason: ${match[2].trim()}`;
    return row.body;
  }
  if (row.rowKind === "interpretation") return row.body || "Interpretation recorded.";
  if (row.rowKind === "watch_next") return row.body || "Watch the next compact source summary.";
  if (row.rowKind === "prediction") return row.body || "Prediction recorded.";
  if (row.rowKind === "narrative_state") return row.body || "Narrative state recorded.";
  if (row.rowKind === "interpretation_state") return row.body || "Interpretation state recorded.";
  if (row.rowKind === "interpreter_profile") return row.body || "Interpreter profile applied.";
  if (row.rowKind === "profile_comparison") return row.body || "Profile comparison recorded.";
  if (row.rowKind === "profile_note_link") return row.body || "Interpreter profile note linked.";
  if (row.rowKind === "profile_compiled") return row.body || "Interpreter profile compiled from note.";
  if (row.rowKind === "wait_for_next_summary") return "No unread live-source updates.\nStanding by for the next source update.";
  if (row.rowKind === "mail_wake_requested") return row.body || "Wake requested for live-source mail.";
  if (row.rowKind === "mail_wake_deferred") return row.body || "Wake deferred; mailbox remains armed for the next summary.";
  if (row.rowKind === "blocked") return row.body || "Wake blocked; mailbox remains available for a later check.";
  if (row.rowKind === "voice_tool_call" && !row.body) return "voice_delivery";
  if (row.rowKind === "voice_receipt" && !row.body) return "Voice delivery receipt recorded.";
  if (row.rowKind === "voice_steering_received") return row.body || "Voice steering received.";
  if (row.rowKind === "voice_steering_queued") return row.body || "Voice steering queued for a safe boundary.";
  if (row.rowKind === "voice_steering_applied") return row.body || "Voice steering applied at a safe boundary.";
  if (row.rowKind === "voice_steering_deferred") return row.body || "Voice steering deferred.";
  if (row.rowKind === "voice_steering_rejected") return row.body || "Voice steering rejected.";
  if (row.rowKind === "voice_steering_cancel_requested") return row.body || "Voice steering cancel requested.";
  if (row.rowKind === "steering_ack_receipt") return row.body || "Steering acknowledgement receipt recorded.";
  if (row.rowKind === "goal_context_snapshot") return row.body || "Goal context snapshot recorded as non-terminal evidence.";
  return row.body;
}

function labelForHelixMailLoopTranscriptRow(row: HelixMailLoopTranscriptRow): string {
  if (row.rowKind === "mail_received") return "Observation mail";
  if (row.rowKind === "prediction_check") return "Prediction check";
  if (row.rowKind === "narrative_projection") return "Narrative projection";
  if (row.rowKind === "budget_state") return row.title || "Budget state";
  if (row.rowKind === "processed_mail_read") return row.title || "Processed mail read";
  if (row.rowKind === "processed_mail_packet") return row.title || "Processed packet";
  if (row.rowKind === "processed_mail_goal_satisfied") return row.title || "Goal satisfied";
  if (row.rowKind === "decision_recorded") return row.title || "Decision recorded";
  if (row.rowKind === "voice_candidate") return row.title || "Voice candidate";
  if (row.rowKind === "voice_requested") return row.title || "Voice requested";
  if (row.rowKind === "voice_blocked") return row.title || "Voice blocked";
  if (row.rowKind === "checkpoint_summary") return row.title || "Checkpoint summary";
  if (row.rowKind === "continuation_scheduled") return row.title || "Continuation scheduled";
  if (row.rowKind === "continuation_deferred") return row.title || "Continuation deferred";
  if (row.rowKind === "tool_budget_no_progress") return row.title || "Tool budget stopped";
  if (row.rowKind === "micro_reasoner_run") return row.title || "Micro-reasoner run";
  if (row.rowKind === "task_queued") return "Task queued";
  if (row.rowKind === "task_deferred") return "Task deferred";
  if (row.rowKind === "task_running") return "Task running";
  if (row.rowKind === "task_completed") return "Task completed";
  if (row.rowKind === "mail_read_tool_call") return "Tool call";
  if (row.rowKind === "mail_read_receipt" || row.rowKind === "wait_for_next_summary") return "Tool receipt";
  if (row.rowKind === "agent_decision") return "Agent decision";
  if (row.rowKind === "interpretation") return "Interpretation";
  if (row.rowKind === "watch_next") return "Watch next";
  if (row.rowKind === "prediction") return "Prediction";
  if (row.rowKind === "narrative_state") return "Narrative state";
  if (row.rowKind === "interpretation_state") return row.title || "Interpretation";
  if (row.rowKind === "interpreter_profile") return row.title || "Interpreter profile";
  if (row.rowKind === "profile_comparison") return row.title || "Profile comparison";
  if (row.rowKind === "profile_note_link") return row.title || "Profile note";
  if (row.rowKind === "profile_compiled") return row.title || "Profile compiled";
  if (row.rowKind === "text_answer") return "Text draft";
  if (row.rowKind === "voice_callout_request") return "Voice callout request";
  if (row.rowKind === "voice_tool_call") return "Voice tool call";
  if (row.rowKind === "voice_receipt") return "Voice receipt";
  if (row.rowKind === "voice_steering_received") return "Voice steering received";
  if (row.rowKind === "voice_steering_queued") return "Voice steering queued";
  if (row.rowKind === "voice_steering_applied") return "Voice steering applied";
  if (row.rowKind === "voice_steering_deferred") return "Voice steering deferred";
  if (row.rowKind === "voice_steering_rejected") return "Voice steering rejected";
  if (row.rowKind === "voice_steering_cancel_requested") return "Voice steering cancel";
  if (row.rowKind === "steering_ack_receipt") return "Steering ack receipt";
  if (row.rowKind === "goal_context_snapshot") return row.title || "Goal context snapshot";
  if (row.rowKind === "mail_wake_requested") return "Wake requested";
  if (row.rowKind === "mail_wake_deferred") return "Wake deferred";
  if (row.rowKind === "requested_tool") return "Requested tool";
  if (row.rowKind === "loop_state") return row.title || "Loop state";
  if (row.rowKind === "blocked") return "Wake blocked";
  return row.title || "Live source mail";
}

function toneForHelixMailLoopTranscriptRow(row: HelixMailLoopTranscriptRow): HelixContinuousTurnStreamTone {
  if (row.rowKind === "mail_received" || row.rowKind === "mail_read_receipt") return "observation";
  if (row.rowKind === "prediction_check") return "observation";
  if (row.rowKind === "processed_mail_read" || row.rowKind === "processed_mail_packet" || row.rowKind === "micro_reasoner_run") return "observation";
  if (row.rowKind === "processed_mail_goal_satisfied" || row.rowKind === "decision_recorded" || row.rowKind === "checkpoint_summary" || row.rowKind === "continuation_scheduled") return "checkpoint";
  if (row.rowKind === "voice_candidate" || row.rowKind === "voice_requested") return "checkpoint";
  if (row.rowKind === "voice_blocked" || row.rowKind === "continuation_deferred" || row.rowKind === "tool_budget_no_progress") return "warning";
  if (row.rowKind === "budget_state") return /\b(?:deferred|pressure|exhausted|no progress|stopped)\b/i.test(row.body) ? "warning" : "checkpoint";
  if (row.rowKind === "interpretation" || row.rowKind === "watch_next" || row.rowKind === "prediction" || row.rowKind === "narrative_state" || row.rowKind === "interpretation_state" || row.rowKind === "interpreter_profile" || row.rowKind === "profile_comparison" || row.rowKind === "profile_note_link" || row.rowKind === "profile_compiled" || row.rowKind === "narrative_projection") return "checkpoint";
  if (row.rowKind === "agent_decision" || row.rowKind === "voice_callout_request" || row.rowKind === "wait_for_next_summary" || row.rowKind === "loop_state") return "checkpoint";
  if (row.rowKind === "task_queued" || row.rowKind === "task_running") return "working";
  if (row.rowKind === "task_deferred") return "warning";
  if (row.rowKind === "task_completed") return "checkpoint";
  if (row.rowKind === "mail_wake_requested") return "working";
  if (row.rowKind === "mail_wake_deferred") return "warning";
  if (row.rowKind === "blocked") return "warning";
  if (row.rowKind === "text_answer") return row.terminalEligible ? "final" : "checkpoint";
  if (row.rowKind === "voice_tool_call") return "working";
  if (row.rowKind === "voice_receipt") return "observation";
  if (row.rowKind === "voice_steering_received" || row.rowKind === "steering_ack_receipt") return "observation";
  if (row.rowKind === "goal_context_snapshot") return "observation";
  if (row.rowKind === "voice_steering_rejected" || row.rowKind === "voice_steering_cancel_requested") return "warning";
  if (row.rowKind === "voice_steering_queued" || row.rowKind === "voice_steering_applied" || row.rowKind === "voice_steering_deferred") return "checkpoint";
  return "working";
}

export function buildHelixMailLoopTurnStreamRows(replyId: string, mailRows: HelixMailLoopTranscriptRow[]): HelixContinuousTurnStreamRow[] {
  return mailRows.map((row) => ({
    key: `${replyId}-mail-loop-${row.rowId}-${row.rowKind}`,
    source: row.rowKind === "voice_tool_call" ||
      row.rowKind === "voice_receipt" ||
      row.rowKind === "voice_candidate" ||
      row.rowKind === "voice_requested" ||
      row.rowKind === "voice_blocked" ||
      row.rowKind.startsWith("voice_steering_") ||
      row.rowKind === "steering_ack_receipt"
      ? "voice"
      : row.rowKind === "goal_context_snapshot"
        ? "live_answer"
        : "live_source_mail",
    label: labelForHelixMailLoopTranscriptRow(row),
    text: formatHelixMailLoopTranscriptBody(row),
    meta: row.authority || "tool_evidence",
    status: row.rowKind,
    tone: toneForHelixMailLoopTranscriptRow(row),
    evidenceRefs: row.evidenceRefs,
    detailLimit: row.rowKind === "mail_received" ? 520 : 420,
  }));
}
