import { describe, expect, it } from "vitest";

import {
  hasHelixPendingCancellationMarker,
  isHelixCanceledPendingTurn,
  normalizeHelixPendingTransitionMarker,
  readHelixPendingInputRecord,
  readHelixPendingTransitionTrace,
  resolveHelixPendingInputRecord,
} from "../ask-pending-input-readers";

describe("ask pending input readers", () => {
  it("returns only active pending input records", () => {
    const byRequestId = { request_id: "req-1" };
    const byPrompt = { prompt: "Choose a document" };
    const byFields = { required_fields: ["doc_path"] };
    const byKind = { kind: "request_user_input" };

    expect(readHelixPendingInputRecord(byRequestId)).toBe(byRequestId);
    expect(readHelixPendingInputRecord(byPrompt)).toBe(byPrompt);
    expect(readHelixPendingInputRecord(byFields)).toBe(byFields);
    expect(readHelixPendingInputRecord(byKind)).toBe(byKind);
  });

  it("rejects non-records and resolved pending records", () => {
    expect(readHelixPendingInputRecord(null)).toBeNull();
    expect(readHelixPendingInputRecord(["req-1"])).toBeNull();
    expect(readHelixPendingInputRecord({ request_id: "req-1", status: "resolved" })).toBeNull();
    expect(readHelixPendingInputRecord({ request_id: "req-1", state: "cancelled" })).toBeNull();
    expect(readHelixPendingInputRecord({ request_id: "req-1", resolution_status: "superseded" })).toBeNull();
    expect(readHelixPendingInputRecord({ note: "not pending" })).toBeNull();
  });

  it("normalizes pending transition markers", () => {
    expect(normalizeHelixPendingTransitionMarker(" Pending Clarify-Canceled ")).toBe("pending_clarify_canceled");
    expect(normalizeHelixPendingTransitionMarker("request user input canceled")).toBe(
      "request_user_input_canceled",
    );
    expect(normalizeHelixPendingTransitionMarker(null)).toBe("");
  });

  it("normalizes pending transition traces from arrays or scalar values", () => {
    expect(readHelixPendingTransitionTrace([" Pending Clarify-Canceled ", "", null, "cancel pending"])).toEqual([
      "pending_clarify_canceled",
      "cancel_pending",
    ]);
    expect(readHelixPendingTransitionTrace("request user input canceled")).toEqual([
      "request_user_input_canceled",
    ]);
    expect(readHelixPendingTransitionTrace("   ")).toEqual([]);
  });

  it("detects pending cancellation markers only with pending context", () => {
    expect(
      hasHelixPendingCancellationMarker({
        pending_status_after: "Canceled",
      }),
    ).toBe(true);
    expect(
      hasHelixPendingCancellationMarker({
        pending_request: { request_id: "req-1" },
        pending_transition_reason: "request user input canceled",
      }),
    ).toBe(true);
    expect(
      hasHelixPendingCancellationMarker({
        reason: "request user input canceled",
      }),
    ).toBe(false);
  });

  it("walks nested debug/audit records to classify canceled pending turns", () => {
    const nested = {
      debug: {
        agent_loop_audit: {
          pending_transition_trace: ["pending clarify canceled"],
        },
      },
    };
    const cyclic: Record<string, unknown> = { debug: nested };
    cyclic.terminal = cyclic;

    expect(isHelixCanceledPendingTurn(cyclic)).toBe(true);
    expect(isHelixCanceledPendingTurn({ debug: { reason: "ordinary final" } })).toBe(false);
  });

  it("resolves direct and nested pending input records but masks canceled pending turns", () => {
    const direct = { prompt: "Pick a source" };
    expect(resolveHelixPendingInputRecord(direct)).toBe(direct);

    const nestedPending = { request_id: "req-2", prompt: "Choose panel" };
    expect(
      resolveHelixPendingInputRecord({
        agent_loop_audit: {
          pending_server_request: nestedPending,
        },
      }),
    ).toBe(nestedPending);

    expect(
      resolveHelixPendingInputRecord({
        pending_request: { request_id: "req-3", prompt: "Choose doc" },
        pending_transition_trace: ["pending clarify canceled"],
      }),
    ).toBeNull();
  });
});
