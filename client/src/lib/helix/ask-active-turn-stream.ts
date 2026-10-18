import type { AskLiveEventEntry } from "@/lib/helix/ask-observer-events";
import { readAskLiveEventIdentity } from "@/lib/helix/ask-debug-event-display";
import { humanizeAskLiveEventToken } from "@/lib/helix/ask-display-text";
import {
  buildHelixTurnTranscriptRows,
  type HelixTurnTranscriptRow,
} from "@/lib/helix/ask-turn-transcript";

export type HelixAskConsoleStreamIngressDebug = {
  schema: "helix.ask.console_stream_ingress_debug.v1";
  turnId: string | null;
  traceId: string | null;
  startedAtMs: number | null;
  rawStreamPacketCount: number;
  transcriptPacketCount: number;
  acceptedLiveEventCount: number;
  replayedTranscriptEventCount: number;
  droppedEventCount: number;
  droppedReasons: Record<string, number>;
  runtimeHeartbeatPacketCount: number;
  terminalTranscriptEventCount: number;
  nonTranscriptPacketCount: number;
  lastEventName: string | null;
  lastTranscriptType: string | null;
  lastAcceptedEventId: string | null;
  lastAcceptedText: string | null;
  lastDropReason: string | null;
  lastUpdatedAtMs: number | null;
};

export type HelixContinuousTurnStreamTone =
  | "question"
  | "working"
  | "observation"
  | "checkpoint"
  | "bridge"
  | "final"
  | "warning";

export type HelixContinuousTurnStreamRow = {
  key: string;
  source: "question" | "agent_work" | "stage_play" | "live_bridge" | "live_source_mail" | "live_answer" | "voice" | "final";
  label: string;
  text: string;
  meta: string;
  status: string;
  tone: HelixContinuousTurnStreamTone;
  evidenceRefs: string[];
  actions?: Array<"Run" | "Skip" | "Pause job">;
  bridgePills?: Array<{ label: string; tone: "cyan" | "amber" | "emerald" | "slate" }>;
  detailLimit?: number;
};

export type AskLiveAgenticEventRow = {
  key: string;
  label: "Thinking" | "Working" | "Observation" | "Decision" | "Final" | "Notice";
  text: string;
  meta: string;
  tone: "default" | "thinking" | "observation" | "decision" | "warning" | "final";
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

function asObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function safeJsonStringify(value: unknown, fallback = "Unable to render debug payload."): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return fallback;
  }
}

function summarizeVoiceDebugText(source: string, maxChars = 220): string {
  const normalized = source.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(1, maxChars - 1)).trimEnd()}...`;
}

function parseTimestampMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function createHelixAskConsoleStreamIngressDebug(input?: {
  turnId?: string | null;
  traceId?: string | null;
  startedAtMs?: number | null;
}): HelixAskConsoleStreamIngressDebug {
  return {
    schema: "helix.ask.console_stream_ingress_debug.v1",
    turnId: coerceText(input?.turnId).trim() || null,
    traceId: coerceText(input?.traceId).trim() || null,
    startedAtMs:
      typeof input?.startedAtMs === "number" && Number.isFinite(input.startedAtMs)
        ? Math.trunc(input.startedAtMs)
        : null,
    rawStreamPacketCount: 0,
    transcriptPacketCount: 0,
    acceptedLiveEventCount: 0,
    replayedTranscriptEventCount: 0,
    droppedEventCount: 0,
    droppedReasons: {},
    runtimeHeartbeatPacketCount: 0,
    terminalTranscriptEventCount: 0,
    nonTranscriptPacketCount: 0,
    lastEventName: null,
    lastTranscriptType: null,
    lastAcceptedEventId: null,
    lastAcceptedText: null,
    lastDropReason: null,
    lastUpdatedAtMs: null,
  };
}

export function incrementHelixAskConsoleDropReason(
  droppedReasons: Record<string, number>,
  reason: string,
): Record<string, number> {
  const key = reason.trim() || "unknown";
  return {
    ...droppedReasons,
    [key]: (droppedReasons[key] ?? 0) + 1,
  };
}

export function attachHelixAskClientTraceToLiveEvent(
  event: AskLiveEventEntry,
  input: {
    traceId?: string | null;
    turnId?: string | null;
  },
): AskLiveEventEntry {
  const meta = asObjectRecord(event.meta) ?? {};
  const clientTraceId = coerceText(input.traceId).trim();
  const clientTurnId = coerceText(input.turnId ?? input.traceId).trim();
  const backendTurnId = coerceText(meta.turn_id ?? meta.turnId ?? meta.active_turn_id ?? meta.activeTurnId).trim();
  const nextMeta: Record<string, unknown> = {
    ...meta,
  };
  if (clientTraceId) {
    nextMeta.trace_id = clientTraceId;
    nextMeta.ask_trace_id = clientTraceId;
  }
  if (clientTurnId) {
    nextMeta.active_turn_id = clientTurnId;
    nextMeta.client_active_turn_id = clientTurnId;
  }
  if (backendTurnId && clientTurnId && backendTurnId !== clientTurnId) {
    nextMeta.backend_turn_id = backendTurnId;
  }
  return {
    ...event,
    meta: nextMeta,
  };
}

function resolveAskLiveEventTimestampMs(event: AskLiveEventEntry): number | null {
  if (typeof event.tsMs === "number" && Number.isFinite(event.tsMs)) {
    return event.tsMs;
  }
  return parseTimestampMs(event.ts);
}

function readFirstNonEmptyText(...values: unknown[]): string {
  for (const value of values) {
    const text = coerceText(value).trim();
    if (text) return text;
  }
  return "";
}

function buildTurnTranscriptRecordFromAskLiveEvent(
  event: AskLiveEventEntry,
  index: number,
  input: {
    activeTurnId?: string | null;
    activeTraceId?: string | null;
  },
): Record<string, unknown> {
  const meta = asObjectRecord(event.meta) ?? {};
  const sourceEventType = readFirstNonEmptyText(meta.source_event_type, meta.sourceEventType, meta.stage, "event");
  const turnId = readFirstNonEmptyText(
    meta.turn_id,
    meta.turnId,
    meta.active_turn_id,
    meta.activeTurnId,
    meta.ask_turn_id,
    meta.askTurnId,
    input.activeTurnId,
  );
  const traceId = readFirstNonEmptyText(
    meta.trace_id,
    meta.traceId,
    meta.ask_trace_id,
    meta.askTraceId,
    meta.turn_key,
    meta.turnKey,
    input.activeTraceId,
  );
  const timestampMs = resolveAskLiveEventTimestampMs(event);
  const status = readFirstNonEmptyText(meta.status, "running");

  return {
    ...meta,
    id: readFirstNonEmptyText(meta.id, event.id, `live-event-${index}`),
    type: readFirstNonEmptyText(meta.type, sourceEventType),
    source_event_type: sourceEventType,
    event_source: readFirstNonEmptyText(meta.event_source, meta.eventSource, "live"),
    role: readFirstNonEmptyText(meta.role, event.tool, "assistant"),
    text: coerceText(event.text).trim(),
    status,
    selected_runtime_agent_provider: readFirstNonEmptyText(
      meta.selected_runtime_agent_provider,
      meta.selectedRuntimeAgentProvider,
      meta.runtime_agent_provider,
      meta.runtimeAgentProvider,
    ),
    adapter_boundary: readFirstNonEmptyText(meta.adapter_boundary, meta.adapterBoundary),
    lane: readFirstNonEmptyText(meta.lane, event.tool),
    step_id: readFirstNonEmptyText(meta.step_id, meta.stepId),
    tool: readFirstNonEmptyText(meta.tool, meta.tool_name, meta.toolName, event.tool),
    capability: readFirstNonEmptyText(meta.capability, meta.capability_id, meta.capabilityId, event.tool),
    source_id: readFirstNonEmptyText(meta.source_id, meta.sourceId),
    source_hash: readFirstNonEmptyText(meta.source_hash, meta.sourceHash),
    source_kind: readFirstNonEmptyText(meta.source_kind, meta.sourceKind),
    source_text_hash: readFirstNonEmptyText(meta.source_text_hash, meta.sourceTextHash),
    source_text_char_count: readFirstNonEmptyText(meta.source_text_char_count, meta.sourceTextCharCount),
    source_identity_key: readFirstNonEmptyText(meta.source_identity_key, meta.sourceIdentityKey),
    latest_source_identity_key: readFirstNonEmptyText(meta.latest_source_identity_key, meta.latestSourceIdentityKey),
    source_projection_target: readFirstNonEmptyText(meta.source_projection_target, meta.sourceProjectionTarget),
    account_locale: readFirstNonEmptyText(meta.account_locale, meta.accountLocale),
    latest_chunk_id: readFirstNonEmptyText(meta.latest_chunk_id, meta.latestChunkId),
    latest_chunk_index: readFirstNonEmptyText(meta.latest_chunk_index, meta.latestChunkIndex),
    latest_dedupe_key: readFirstNonEmptyText(meta.latest_dedupe_key, meta.latestDedupeKey),
    latest_source_event_id: readFirstNonEmptyText(meta.latest_source_event_id, meta.latestSourceEventId),
    latest_source_event_ms: readFirstNonEmptyText(meta.latest_source_event_ms, meta.latestSourceEventMs),
    latest_observed_at_ms: readFirstNonEmptyText(meta.latest_observed_at_ms, meta.latestObservedAtMs),
    latest_freshness_status: readFirstNonEmptyText(meta.latest_freshness_status, meta.latestFreshnessStatus),
    latest_projection_target: readFirstNonEmptyText(meta.latest_projection_target, meta.latestProjectionTarget),
    target_language: readFirstNonEmptyText(meta.target_language, meta.targetLanguage),
    materialized_mail_loop_evidence:
      typeof meta.materialized_mail_loop_evidence === "boolean"
        ? meta.materialized_mail_loop_evidence
        : typeof meta.materializedMailLoopEvidence === "boolean"
          ? meta.materializedMailLoopEvidence
          : null,
    latest_cancel_requested:
      typeof meta.latest_cancel_requested === "boolean"
        ? meta.latest_cancel_requested
        : typeof meta.latestCancelRequested === "boolean"
          ? meta.latestCancelRequested
          : null,
    turn_id: turnId || null,
    trace_id: traceId || null,
    ts_ms: timestampMs,
    at_ms: timestampMs,
    seq: typeof event.seq === "number" && Number.isFinite(event.seq) ? event.seq : index,
    durationMs: typeof event.durationMs === "number" && Number.isFinite(event.durationMs) ? event.durationMs : null,
    stream_event: "turn_transcript_event",
  };
}

export function buildHelixActiveTurnTranscriptRows(input: {
  replyId: string;
  events: AskLiveEventEntry[];
  activeTurnId?: string | null;
  activeTraceId?: string | null;
}): HelixTurnTranscriptRow[] {
  const turnTranscriptEvents = input.events
    .filter((event) => !isAskLiveEventSuperseded(event))
    .map((event, index) =>
      buildTurnTranscriptRecordFromAskLiveEvent(event, index, {
        activeTurnId: input.activeTurnId,
        activeTraceId: input.activeTraceId,
      }),
    );

  return buildHelixTurnTranscriptRows({
    id: input.replyId,
    content: "",
    debug: {
      turn_transcript_events: turnTranscriptEvents,
    },
  });
}

function resolveAskLiveEventStageParts(event: AskLiveEventEntry): {
  stage: string;
  detail: string;
  body: string;
} {
  const meta = asObjectRecord(event.meta);
  const rawText = (event.text ?? "").trim();
  const [rawHeader = "", ...bodyLines] = rawText.split(/\n+/);
  const header = rawHeader.replace(/^Helix Ask:\s*/i, "").trim();
  const [headerStage = "", ...headerDetailParts] = header.split(/\s+-\s+/);
  const stage =
    humanizeAskLiveEventToken(
      typeof meta?.stage === "string" && meta.stage.trim() ? meta.stage : headerStage,
    ) || "Agent step";
  const detail =
    humanizeAskLiveEventToken(
      typeof meta?.detail === "string" && meta.detail.trim()
        ? meta.detail
        : headerDetailParts.join(" - "),
    );
  const body = summarizeVoiceDebugText(bodyLines.join(" "), 180);
  return { stage, detail, body };
}

function isAskLiveMissingArtifactProgressText(value: string): boolean {
  return /\b(?:missing_artifacts|missing_required_artifacts|blocked_missing_artifacts|required artifacts were satisfied|required artifacts are satisfied)\b/i.test(
    value,
  );
}

function isAskLiveTerminalFailureText(value: string): boolean {
  return /\b(?:final_failure|typed_failure|fail_closed|terminal_error|terminal failure|Cause:)\b/i.test(value);
}

function normalizeAskLiveProgressNotice(value: string): string {
  return isAskLiveMissingArtifactProgressText(value) && !isAskLiveTerminalFailureText(value)
    ? "Waiting for required tool receipt..."
    : value;
}

function isAskLiveEventWarning(event: AskLiveEventEntry): boolean {
  const metaRecord = asObjectRecord(event.meta);
  const metaOk = typeof metaRecord?.ok === "boolean" ? metaRecord.ok : null;
  if (metaOk === false) return true;
  const haystackParts = [event.text ?? "", event.tool ?? ""];
  if (metaRecord) {
    haystackParts.push(safeJsonStringify(metaRecord));
  }
  const haystack = haystackParts.join(" ");
  if (isAskLiveMissingArtifactProgressText(haystack) && !isAskLiveTerminalFailureText(haystack)) {
    return false;
  }
  return /\b(error|fail|failed|blocked|fallback|suppressed|unknown_terminal|no_context|unresolved)\b/i.test(
    haystack,
  );
}

function classifyAskLiveAgenticEventRow(event: AskLiveEventEntry): Pick<
  AskLiveAgenticEventRow,
  "label" | "tone"
> {
  const meta = asObjectRecord(event.meta);
  const { stage, detail } = resolveAskLiveEventStageParts(event);
  const haystack = `${event.tool ?? ""} ${stage} ${detail} ${event.text ?? ""} ${safeJsonStringify(meta ?? {})}`;
  if (isAskLiveEventWarning(event)) return { label: "Notice", tone: "warning" };
  if (/\b(final|terminal|complete|completed|answer)\b/i.test(haystack)) {
    return { label: "Final", tone: "final" };
  }
  if (/\b(decision|choose|chosen|selected|route|dispatch|handoff)\b/i.test(haystack)) {
    return { label: "Decision", tone: "decision" };
  }
  if (/\b(done|observed|observation|result|receipt|retrieved|evidence)\b/i.test(haystack)) {
    return { label: "Observation", tone: "observation" };
  }
  if (/\b(llm|model|draft|synthes|reason|think|commentary)\b/i.test(haystack)) {
    return { label: "Thinking", tone: "thinking" };
  }
  return { label: "Working", tone: "default" };
}

function buildAskLiveAgenticEventText(event: AskLiveEventEntry): string {
  const meta = asObjectRecord(event.meta);
  if (
    String(meta?.stage ?? "").trim() === "public_commentary" ||
    String(meta?.source_event_type ?? "").trim() === "public_commentary"
  ) {
    return clipText(event.text ?? "", 220);
  }
  const { stage, detail, body } = resolveAskLiveEventStageParts(event);
  const combined = `${body} ${stage} ${detail} ${event.text ?? ""}`;
  const progressNotice = normalizeAskLiveProgressNotice(combined);
  if (progressNotice !== combined) return progressNotice;
  const detailLower = detail.toLowerCase();
  if (body && !/^start$|^done$|^error$/i.test(detail)) {
    return clipText(body, 180);
  }
  if (detailLower === "start") return `${stage} started.`;
  if (detailLower === "done") return `${stage} finished.`;
  if (detailLower === "error") return `${stage} hit a problem.`;
  if (detail) return `${stage}: ${detail}.`;
  return `${stage}.`;
}

const LOW_SIGNAL_ASK_LIVE_TRANSCRIPT_PATTERNS: RegExp[] = [
  /^answer cleaned preview:\s*final\.?$/i,
  /^citations:\s*optional\.?$/i,
  /^clipboard copy:\s*live question\b.*$/i,
  /^clipboard copy:\s*live turn completed\.?$/i,
  /^finalization finished\.?$/i,
  /^live turn completed\.?$/i,
  /^model decision:\s*.+\.?$/i,
  /^mode gate consistency:\s*ok\.?$/i,
  /^objective gate consistency:\s*ok\.?$/i,
  /^rattling gate:\s*pass\.?$/i,
  /^step started\.?$/i,
  /^stream visible\.?$/i,
  /^tool result:\s*artifact contract satisfied\.?$/i,
  /^turn completed\.?$/i,
  /^work delta:\s*stream visible\.?$/i,
];

function shouldShowAskLiveAgenticEventRow(row: AskLiveAgenticEventRow): boolean {
  if (row.tone === "warning") return true;
  const normalizedText = row.text.replace(/\s+/g, " ").replace(/\.+$/g, ".").trim();
  if (!normalizedText) return false;
  return !LOW_SIGNAL_ASK_LIVE_TRANSCRIPT_PATTERNS.some((pattern) => pattern.test(normalizedText));
}

export function buildAskLiveAgenticEventRows(
  events: AskLiveEventEntry[],
  options?: {
    includeLowSignalRows?: boolean;
  },
): AskLiveAgenticEventRow[] {
  return events
    .filter((event) => !isAskLiveEventSuperseded(event))
    .map((event, index) => {
      const tsMs = resolveAskLiveEventTimestampMs(event);
      const timestamp =
        tsMs === null
          ? ""
          : new Date(tsMs).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });
      const duration =
        typeof event.durationMs === "number" && Number.isFinite(event.durationMs)
          ? `${Math.max(0, Math.round(event.durationMs))}ms`
          : "";
      const classified = classifyAskLiveAgenticEventRow(event);
      return {
        key: `${event.id}:agentic:${index}`,
        ...classified,
        text: classified.tone === "final" ? coerceText(event.text).trim() : buildAskLiveAgenticEventText(event),
        meta: [timestamp, duration].filter(Boolean).join(" / "),
      };
    })
    .filter((row) => options?.includeLowSignalRows || shouldShowAskLiveAgenticEventRow(row))
    .slice(-18);
}

function isAskLiveEventSuperseded(event: AskLiveEventEntry): boolean {
  return Boolean(event.meta && String(event.meta.status ?? "").trim() === "superseded");
}

function toneForAskLiveAgenticEventRow(row: AskLiveAgenticEventRow): HelixContinuousTurnStreamTone {
  if (row.tone === "observation") return "observation";
  if (row.tone === "decision") return "checkpoint";
  if (row.tone === "warning") return "warning";
  if (row.tone === "final") return "final";
  return "working";
}

export function buildHelixActiveTurnStreamRows(args: {
  question?: string | null;
  eventRows: AskLiveAgenticEventRow[];
  draftText?: string | null;
}): HelixContinuousTurnStreamRow[] {
  const rows: HelixContinuousTurnStreamRow[] = [];
  const question = (args.question ?? "").trim();
  if (question) {
    rows.push({
      key: "active-stream-question",
      source: "question",
      label: "Question",
      text: question,
      meta: "current prompt",
      status: "submitted",
      tone: "question",
      evidenceRefs: [],
    });
  }
  args.eventRows.forEach((row) => {
    const tone = toneForAskLiveAgenticEventRow(row);
    rows.push({
      key: `${row.key}-active-stream`,
      source: tone === "final" ? "final" : "agent_work",
      label: row.label,
      text: row.text,
      meta: row.meta,
      status: row.tone,
      tone,
      evidenceRefs: [],
    });
  });
  const draftText = (args.draftText ?? "").trim();
  if (draftText && !rows.some((row) => row.text.trim() === draftText)) {
    rows.push({
      key: "active-stream-draft",
      source: "agent_work",
      label: "Working",
      text: draftText,
      meta: "streaming draft",
      status: "running",
      tone: "working",
      evidenceRefs: [],
      detailLimit: 420,
    });
  }
  return rows;
}

function collectHelixAskExternalLiveEventIdentityKeys(input: {
  eventTraceId?: string | null;
  eventMeta?: Record<string, unknown> | null;
}): string[] {
  const meta = input.eventMeta ?? null;
  return Array.from(new Set([
    coerceText(input.eventTraceId).trim(),
    coerceText(meta?.traceId).trim(),
    coerceText(meta?.trace_id).trim(),
    coerceText(meta?.turnKey).trim(),
    coerceText(meta?.turn_key).trim(),
    coerceText(meta?.turnId).trim(),
    coerceText(meta?.turn_id).trim(),
    coerceText(meta?.askTurnId).trim(),
    coerceText(meta?.ask_turn_id).trim(),
    coerceText(meta?.activeTurnId).trim(),
    coerceText(meta?.active_turn_id).trim(),
  ].filter(Boolean)));
}

export function shouldAdmitHelixAskExternalLiveEventToActiveStream(input: {
  askBusy: boolean;
  activeTurnId?: string | null;
  activeTraceId?: string | null;
  eventTraceId?: string | null;
  eventMeta?: Record<string, unknown> | null;
}): boolean {
  if (!input.askBusy) return false;
  const activeKeys = new Set([
    coerceText(input.activeTurnId).trim(),
    coerceText(input.activeTraceId).trim(),
  ].filter(Boolean));
  if (activeKeys.size === 0) return false;
  return collectHelixAskExternalLiveEventIdentityKeys({
    eventTraceId: input.eventTraceId,
    eventMeta: input.eventMeta,
  }).some((key) => activeKeys.has(key));
}

export function askLiveEventBelongsToActiveTurn(args: {
  event: AskLiveEventEntry;
  activeTurnId?: string | null;
  activeTraceId?: string | null;
  activeStartedAtMs?: number | null;
}): boolean {
  const activeIds = new Set(
    [args.activeTurnId, args.activeTraceId]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean),
  );
  const identity = readAskLiveEventIdentity(args.event);
  const eventIds = [identity.turnId, identity.traceId].filter((value): value is string => Boolean(value));
  if (eventIds.length > 0) return eventIds.some((value) => activeIds.has(value));
  const eventTs = resolveAskLiveEventTimestampMs(args.event);
  if (
    typeof eventTs === "number" &&
    Number.isFinite(eventTs) &&
    typeof args.activeStartedAtMs === "number" &&
    Number.isFinite(args.activeStartedAtMs)
  ) {
    return eventTs >= args.activeStartedAtMs - 500;
  }
  return true;
}

export function filterHelixAskActiveTurnStreamRows(
  rows: HelixContinuousTurnStreamRow[],
  options?: {
    includeTerminalRows?: boolean;
  },
): HelixContinuousTurnStreamRow[] {
  if (!rows.length) return rows;
  if (options?.includeTerminalRows) return rows;
  const hasTerminalRow = rows.some((row) => row.tone === "final" || row.source === "final" || row.status === "final");
  return hasTerminalRow ? [] : rows;
}
