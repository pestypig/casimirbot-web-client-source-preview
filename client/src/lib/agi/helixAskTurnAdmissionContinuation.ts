export const HELIX_ASK_TURN_ADMISSION_CONTINUATION_SCHEMA =
  "helix.ask_turn_admission.client_continuation.v1" as const;

const QUEUE_REASONS = new Set([
  "session_busy",
  "instance_capacity",
  "memory_soft_pressure",
]);

type RecordLike = Record<string, unknown>;

export type HelixAskQueuedTurnAdmission = {
  turnId: string;
  reason: "session_busy" | "instance_capacity" | "memory_soft_pressure";
  queuePosition: number;
  retryAfterMs: number;
};

export type HelixAskTurnAdmissionContinuationDebug = {
  schema: typeof HELIX_ASK_TURN_ADMISSION_CONTINUATION_SCHEMA;
  attempt_count: number;
  queued_attempt_count: number;
  resumed_after_queue: true;
  queue_reasons: HelixAskQueuedTurnAdmission["reason"][];
  first_queue_position: number;
  last_queue_position: number;
  total_wait_ms: number;
  bound_turn_id: string;
  assistant_answer: false;
  terminal_eligible: false;
  raw_content_included: false;
};

const readRecord = (value: unknown): RecordLike | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as RecordLike
    : null;

const readString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const readPositiveInteger = (value: unknown): number | null => {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : null;
};

const readNonNegativeInteger = (value: unknown): number | null => {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : null;
};

export const sanitizeHelixAskTurnAdmissionContinuationDebug = (
  value: unknown,
): HelixAskTurnAdmissionContinuationDebug | null => {
  const record = readRecord(value);
  if (
    !record ||
    record.schema !== HELIX_ASK_TURN_ADMISSION_CONTINUATION_SCHEMA ||
    record.resumed_after_queue !== true ||
    record.assistant_answer !== false ||
    record.terminal_eligible !== false ||
    record.raw_content_included !== false
  ) {
    return null;
  }

  const attemptCount = readPositiveInteger(record.attempt_count);
  const queuedAttemptCount = readPositiveInteger(record.queued_attempt_count);
  const firstQueuePosition = readPositiveInteger(record.first_queue_position);
  const lastQueuePosition = readPositiveInteger(record.last_queue_position);
  const totalWaitMs = readNonNegativeInteger(record.total_wait_ms);
  const boundTurnId = readString(record.bound_turn_id);
  const queueReasons = Array.isArray(record.queue_reasons)
    ? record.queue_reasons
        .map(readString)
        .filter((reason): reason is HelixAskQueuedTurnAdmission["reason"] =>
          Boolean(reason && QUEUE_REASONS.has(reason)))
    : [];
  if (
    !attemptCount ||
    !queuedAttemptCount ||
    attemptCount <= queuedAttemptCount ||
    !firstQueuePosition ||
    !lastQueuePosition ||
    totalWaitMs === null ||
    !boundTurnId ||
    queueReasons.length === 0
  ) {
    return null;
  }

  return {
    schema: HELIX_ASK_TURN_ADMISSION_CONTINUATION_SCHEMA,
    attempt_count: attemptCount,
    queued_attempt_count: queuedAttemptCount,
    resumed_after_queue: true,
    queue_reasons: Array.from(new Set(queueReasons)),
    first_queue_position: firstQueuePosition,
    last_queue_position: lastQueuePosition,
    total_wait_ms: totalWaitMs,
    bound_turn_id: boundTurnId,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
  };
};

const isQueueLikePayload = (record: RecordLike, admission: RecordLike | null): boolean =>
  record.response_type === "queued" ||
  record.final_status === "pending_input" ||
  admission?.status === "queued";

const invalidAdmissionContract = (reason: string): Error => {
  const error = new Error(`ask_turn_admission_contract_invalid:${reason}`);
  error.name = "HelixAskTurnAdmissionContractError";
  return error;
};

const abortError = (): Error => {
  const error = new Error("ask_turn_admission_continuation_aborted");
  error.name = "AbortError";
  return error;
};

export const parseHelixAskQueuedTurnAdmission = (input: {
  payload: unknown;
  expectedTurnId?: string | null;
}): HelixAskQueuedTurnAdmission | null => {
  const record = readRecord(input.payload);
  if (!record) return null;
  const admission = readRecord(record.ask_turn_admission);
  if (!isQueueLikePayload(record, admission)) return null;
  if (
    record.ok !== false ||
    record.response_type !== "queued" ||
    record.final_status !== "pending_input" ||
    record.terminal_artifact_kind !== "ask_turn_admission" ||
    record.final_answer_source !== "ask_turn_admission" ||
    record.assistant_answer !== false ||
    record.terminal_eligible !== false ||
    record.raw_content_included !== false ||
    admission?.schema !== "helix.ask_turn_admission.v1" ||
    admission.status !== "queued" ||
    admission.assistant_answer !== false ||
    admission.terminal_eligible !== false ||
    admission.raw_content_included !== false
  ) {
    throw invalidAdmissionContract("typed_queue_fields_missing");
  }

  const turnId = readString(admission.turn_id ?? record.turn_id);
  const responseTurnId = readString(record.turn_id);
  const expectedTurnId = readString(input.expectedTurnId);
  if (!turnId || (responseTurnId && responseTurnId !== turnId)) {
    throw invalidAdmissionContract("turn_identity_missing_or_inconsistent");
  }
  if (expectedTurnId && expectedTurnId !== turnId) {
    throw invalidAdmissionContract("turn_identity_mismatch");
  }

  const reason = readString(admission.reason);
  const queuePosition = readPositiveInteger(admission.queue_position);
  const retryAfterMs = readPositiveInteger(admission.retry_after_ms);
  if (!reason || !QUEUE_REASONS.has(reason) || !queuePosition || !retryAfterMs) {
    throw invalidAdmissionContract("queue_metadata_missing_or_invalid");
  }

  return {
    turnId,
    reason: reason as HelixAskQueuedTurnAdmission["reason"],
    queuePosition,
    retryAfterMs: Math.min(10_000, Math.max(100, retryAfterMs)),
  };
};

export const waitForHelixAskTurnAdmissionRetry = (
  delayMs: number,
  signal?: AbortSignal,
): Promise<void> => {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise<void>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = (): void => {
      globalThis.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
};

const attachContinuationDebug = <T>(
  payload: T,
  debug: HelixAskTurnAdmissionContinuationDebug,
): T => {
  const record = readRecord(payload);
  if (!record) return payload;
  const existingDebug = readRecord(record.debug) ?? {};
  return {
    ...record,
    debug: {
      ...existingDebug,
      ask_turn_admission_continuation: debug,
    },
  } as T;
};

export async function continueHelixAskTurnAfterAdmission<T>(input: {
  attempt: () => Promise<T>;
  signal?: AbortSignal;
  expectedTurnId?: string | null;
  onQueued?: (admission: HelixAskQueuedTurnAdmission) => void;
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  nowMs?: () => number;
}): Promise<T> {
  const sleep = input.sleep ?? waitForHelixAskTurnAdmissionRetry;
  const nowMs = input.nowMs ?? Date.now;
  let boundTurnId = readString(input.expectedTurnId);
  let attemptCount = 0;
  let queuedAttemptCount = 0;
  let firstQueuedAtMs: number | null = null;
  let firstQueuePosition = 0;
  let lastQueuePosition = 0;
  const queueReasons: HelixAskQueuedTurnAdmission["reason"][] = [];

  while (true) {
    if (input.signal?.aborted) throw abortError();
    const result = await input.attempt();
    attemptCount += 1;
    const admission = parseHelixAskQueuedTurnAdmission({
      payload: result,
      expectedTurnId: boundTurnId,
    });
    if (!admission) {
      if (queuedAttemptCount === 0 || !boundTurnId || firstQueuedAtMs === null) {
        return result;
      }
      return attachContinuationDebug(result, {
        schema: HELIX_ASK_TURN_ADMISSION_CONTINUATION_SCHEMA,
        attempt_count: attemptCount,
        queued_attempt_count: queuedAttemptCount,
        resumed_after_queue: true,
        queue_reasons: queueReasons,
        first_queue_position: firstQueuePosition,
        last_queue_position: lastQueuePosition,
        total_wait_ms: Math.max(0, nowMs() - firstQueuedAtMs),
        bound_turn_id: boundTurnId,
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      });
    }

    boundTurnId = admission.turnId;
    queuedAttemptCount += 1;
    firstQueuedAtMs ??= nowMs();
    firstQueuePosition ||= admission.queuePosition;
    lastQueuePosition = admission.queuePosition;
    if (!queueReasons.includes(admission.reason)) queueReasons.push(admission.reason);
    input.onQueued?.(admission);
    await sleep(admission.retryAfterMs, input.signal);
  }
}
