import type { VoiceLaneTimelineDebugEvent } from "@/lib/helix/voice-capture-diagnostics";

export type VoiceTimelineIssueCode =
  | "missing_prompt_recorded"
  | "missing_brief_before_final"
  | "missing_typed_suppression_cause"
  | "soft_lock_candidate";

export type VoiceTurnTimelineSummary = {
  turnKey: string;
  totalEvents: number;
  promptRecordedCount: number;
  briefCount: number;
  briefBeforeFinalCount: number;
  finalCount: number;
  suppressionCount: number;
  typedSuppressionCount: number;
  hasBriefBeforeFinal: boolean;
  hasSoftLockCandidate: boolean;
  firstPromptAtMs: number | null;
  firstBriefAtMs: number | null;
  firstFinalAtMs: number | null;
  lastReasoningAttemptAtMs: number | null;
  issues: VoiceTimelineIssueCode[];
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTimelineEvent(input: Record<string, unknown>): VoiceLaneTimelineDebugEvent | null {
  const id = typeof input.id === "string" ? input.id : null;
  const atMs = input.atMs;
  const source = typeof input.source === "string" ? input.source : null;
  const kind = typeof input.kind === "string" ? input.kind : null;
  if (!id || !isFiniteNumber(atMs) || !source || !kind) {
    return null;
  }
  return {
    id,
    atMs,
    source: source as VoiceLaneTimelineDebugEvent["source"],
    kind: kind as VoiceLaneTimelineDebugEvent["kind"],
    status: typeof input.status === "string" ? input.status : null,
    traceId: typeof input.traceId === "string" ? input.traceId : null,
    turnKey: typeof input.turnKey === "string" ? input.turnKey : null,
    attemptId: typeof input.attemptId === "string" ? input.attemptId : null,
    utteranceId: typeof input.utteranceId === "string" ? input.utteranceId : null,
    chunkIndex: isFiniteNumber(input.chunkIndex) ? input.chunkIndex : null,
    chunkCount: isFiniteNumber(input.chunkCount) ? input.chunkCount : null,
    text: typeof input.text === "string" ? input.text : null,
    detail: typeof input.detail === "string" ? input.detail : null,
    hlcMs: isFiniteNumber(input.hlcMs) ? input.hlcMs : null,
    seq: isFiniteNumber(input.seq) ? input.seq : null,
    revision: isFiniteNumber(input.revision) ? input.revision : null,
    sealToken: typeof input.sealToken === "string" ? input.sealToken : null,
    briefSource:
      input.briefSource === "llm" || input.briefSource === "none"
        ? input.briefSource
        : null,
    suppressionCause: typeof input.suppressionCause === "string" ? input.suppressionCause : null,
    authorityRejectStage:
      input.authorityRejectStage === "preflight" ||
      input.authorityRejectStage === "stream" ||
      input.authorityRejectStage === "final"
        ? input.authorityRejectStage
        : null,
    finalSource:
      input.finalSource === "normal_reasoning" || input.finalSource === "strict_gate_override"
        ? input.finalSource
        : null,
    causalRefId: typeof input.causalRefId === "string" ? input.causalRefId : null,
  };
}

function eventSortKey(event: VoiceLaneTimelineDebugEvent): string {
  const seq = isFiniteNumber(event.seq) ? event.seq.toString().padStart(10, "0") : "9999999999";
  return `${event.atMs.toString().padStart(16, "0")}:${seq}:${event.id}`;
}

export function parseVoiceLaneTimelineJsonLines(raw: string): VoiceLaneTimelineDebugEvent[] {
  const events: VoiceLaneTimelineDebugEvent[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (!isObjectRecord(parsed)) continue;
      const event = normalizeTimelineEvent(parsed);
      if (event) events.push(event);
    } catch {
      continue;
    }
  }
  return events;
}

function selectTurnEvents(
  events: VoiceLaneTimelineDebugEvent[],
  turnKey: string,
): VoiceLaneTimelineDebugEvent[] {
  return events
    .filter((event) => (event.turnKey ?? "") === turnKey)
    .slice()
    .sort((left, right) => (eventSortKey(left) < eventSortKey(right) ? -1 : 1));
}

function hasSoftLockCandidate(events: VoiceLaneTimelineDebugEvent[]): boolean {
  let lastReasoningStartIndex = -1;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (
      event.source === "reasoning" &&
      event.kind === "reasoning_attempt" &&
      (event.status === "running" || event.status === "queued")
    ) {
      lastReasoningStartIndex = index;
    }
  }
  if (lastReasoningStartIndex < 0) return false;
  let suppressed = 0;
  let hasFinalAfterStart = false;
  for (let index = lastReasoningStartIndex; index < events.length; index += 1) {
    const event = events[index];
    if (event.kind === "reasoning_final" && event.status === "done") {
      hasFinalAfterStart = true;
    }
    if (
      event.source === "reasoning" &&
      (event.kind === "suppressed" ||
        (event.kind === "reasoning_attempt" && event.status === "suppressed"))
    ) {
      suppressed += 1;
    }
  }
  return suppressed >= 3 && !hasFinalAfterStart;
}

export function summarizeVoiceLaneTurnTimeline(
  events: VoiceLaneTimelineDebugEvent[],
  turnKey: string,
): VoiceTurnTimelineSummary {
  const selected = selectTurnEvents(events, turnKey);
  const promptRecordedEvents = selected.filter(
    (event) => event.source === "conversation" && event.kind === "prompt_recorded",
  );
  const briefEvents = selected.filter((event) => event.source === "conversation" && event.kind === "brief");
  const finalEvents = selected.filter(
    (event) => event.source === "reasoning" && event.kind === "reasoning_final" && event.status === "done",
  );
  const suppressionEvents = selected.filter(
    (event) =>
      event.source === "reasoning" &&
      (event.kind === "suppressed" ||
        (event.kind === "reasoning_attempt" && event.status === "suppressed")),
  );
  const typedSuppressionCount = suppressionEvents.filter(
    (event) => typeof event.suppressionCause === "string" && event.suppressionCause.trim().length > 0,
  ).length;
  const firstPromptAtMs = promptRecordedEvents[0]?.atMs ?? null;
  const firstBriefAtMs = briefEvents[0]?.atMs ?? null;
  const firstFinalAtMs = finalEvents[0]?.atMs ?? null;
  const briefBeforeFinalCount =
    firstFinalAtMs === null ? briefEvents.length : briefEvents.filter((event) => event.atMs <= firstFinalAtMs).length;
  const hasBriefBeforeFinal = firstFinalAtMs === null ? briefEvents.length > 0 : briefBeforeFinalCount > 0;

  let lastReasoningAttemptAtMs: number | null = null;
  for (const event of selected) {
    if (event.source === "reasoning" && event.kind === "reasoning_attempt") {
      lastReasoningAttemptAtMs = event.atMs;
    }
  }
  const softLock = hasSoftLockCandidate(selected);
  const issues: VoiceTimelineIssueCode[] = [];
  if (promptRecordedEvents.length === 0) {
    issues.push("missing_prompt_recorded");
  }
  if (finalEvents.length > 0 && !hasBriefBeforeFinal) {
    issues.push("missing_brief_before_final");
  }
  if (suppressionEvents.length > 0 && typedSuppressionCount !== suppressionEvents.length) {
    issues.push("missing_typed_suppression_cause");
  }
  if (softLock) {
    issues.push("soft_lock_candidate");
  }
  return {
    turnKey,
    totalEvents: selected.length,
    promptRecordedCount: promptRecordedEvents.length,
    briefCount: briefEvents.length,
    briefBeforeFinalCount,
    finalCount: finalEvents.length,
    suppressionCount: suppressionEvents.length,
    typedSuppressionCount,
    hasBriefBeforeFinal,
    hasSoftLockCandidate: softLock,
    firstPromptAtMs,
    firstBriefAtMs,
    firstFinalAtMs,
    lastReasoningAttemptAtMs,
    issues,
  };
}
