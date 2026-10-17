import { describe, expect, it, vi } from "vitest";
import {
  continueHelixAskTurnAfterAdmission,
  parseHelixAskQueuedTurnAdmission,
  sanitizeHelixAskTurnAdmissionContinuationDebug,
  waitForHelixAskTurnAdmissionRetry,
} from "../helixAskTurnAdmissionContinuation";

const queuedPayload = (overrides: Record<string, unknown> = {}) => ({
  ok: false,
  response_type: "queued",
  final_status: "pending_input",
  terminal_artifact_kind: "ask_turn_admission",
  final_answer_source: "ask_turn_admission",
  turn_id: "ask:test-turn",
  text: "Ask turn queued: instance_capacity.",
  assistant_answer: false,
  terminal_eligible: false,
  raw_content_included: false,
  ask_turn_admission: {
    schema: "helix.ask_turn_admission.v1",
    status: "queued",
    turn_id: "ask:test-turn",
    reason: "instance_capacity",
    queue_position: 2,
    retry_after_ms: 3000,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
  },
  ...overrides,
});

describe("Helix Ask turn admission continuation", () => {
  it("parses only the complete typed queue contract", () => {
    expect(parseHelixAskQueuedTurnAdmission({
      payload: queuedPayload(),
      expectedTurnId: "ask:test-turn",
    })).toEqual({
      turnId: "ask:test-turn",
      reason: "instance_capacity",
      queuePosition: 2,
      retryAfterMs: 3000,
    });

    expect(parseHelixAskQueuedTurnAdmission({
      payload: { ok: true, text: "A completed answer." },
    })).toBeNull();

    expect(parseHelixAskQueuedTurnAdmission({
      payload: {
        ...queuedPayload(),
        response_type: "capacity_rejected",
        final_status: "final_failure",
        ask_turn_admission: {
          ...(queuedPayload().ask_turn_admission as Record<string, unknown>),
          status: "rejected",
          reason: "memory_hard_pressure",
        },
      },
    })).toBeNull();
  });

  it("fails closed when a queue-like payload is malformed or changes turn identity", () => {
    expect(() => parseHelixAskQueuedTurnAdmission({
      payload: queuedPayload({ terminal_eligible: true }),
    })).toThrow("ask_turn_admission_contract_invalid:typed_queue_fields_missing");

    expect(() => parseHelixAskQueuedTurnAdmission({
      payload: queuedPayload(),
      expectedTurnId: "ask:other-turn",
    })).toThrow("ask_turn_admission_contract_invalid:turn_identity_mismatch");
  });

  it("sanitizes only non-authoritative continuation diagnostics", () => {
    const diagnostic = {
      schema: "helix.ask_turn_admission.client_continuation.v1",
      attempt_count: 3,
      queued_attempt_count: 2,
      resumed_after_queue: true,
      queue_reasons: ["instance_capacity", "instance_capacity", "not_a_reason"],
      first_queue_position: 2,
      last_queue_position: 1,
      total_wait_ms: 4500,
      bound_turn_id: "ask:test-turn",
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
      raw_prompt: "must not survive",
    };

    expect(sanitizeHelixAskTurnAdmissionContinuationDebug(diagnostic)).toEqual({
      schema: "helix.ask_turn_admission.client_continuation.v1",
      attempt_count: 3,
      queued_attempt_count: 2,
      resumed_after_queue: true,
      queue_reasons: ["instance_capacity"],
      first_queue_position: 2,
      last_queue_position: 1,
      total_wait_ms: 4500,
      bound_turn_id: "ask:test-turn",
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    });
    expect(sanitizeHelixAskTurnAdmissionContinuationDebug({
      ...diagnostic,
      terminal_eligible: true,
    })).toBeNull();
  });

  it("retries the same turn and records non-authoritative continuation provenance", async () => {
    const sleep = vi.fn(async () => undefined);
    const attempts = [
      queuedPayload(),
      queuedPayload({
        ask_turn_admission: {
          ...(queuedPayload().ask_turn_admission as Record<string, unknown>),
          reason: "session_busy",
          queue_position: 1,
          retry_after_ms: 1500,
        },
      }),
      {
        ok: true,
        turn_id: "ask:test-turn",
        selected_final_answer: "Verified result.",
        text: "Verified result.",
        debug: { terminal_authority_ok: true },
      },
    ];
    let now = 1000;
    const onQueued = vi.fn(() => {
      now += 1500;
    });

    const result = await continueHelixAskTurnAfterAdmission({
      expectedTurnId: "ask:test-turn",
      attempt: async () => attempts.shift(),
      sleep,
      nowMs: () => now,
      onQueued,
    });

    expect(sleep).toHaveBeenNthCalledWith(1, 3000, undefined);
    expect(sleep).toHaveBeenNthCalledWith(2, 1500, undefined);
    expect(onQueued).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      text: "Verified result.",
      debug: {
        terminal_authority_ok: true,
        ask_turn_admission_continuation: {
          schema: "helix.ask_turn_admission.client_continuation.v1",
          attempt_count: 3,
          queued_attempt_count: 2,
          resumed_after_queue: true,
          queue_reasons: ["instance_capacity", "session_busy"],
          first_queue_position: 2,
          last_queue_position: 1,
          total_wait_ms: 3000,
          bound_turn_id: "ask:test-turn",
          assistant_answer: false,
          terminal_eligible: false,
          raw_content_included: false,
        },
      },
    });
  });

  it("cancels an admission wait without issuing another attempt", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const waiting = waitForHelixAskTurnAdmissionRetry(3000, controller.signal);
    controller.abort();

    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
