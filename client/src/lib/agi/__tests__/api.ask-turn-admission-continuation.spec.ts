import { afterEach, describe, expect, it, vi } from "vitest";
import { runAskTurn, runAskTurnStream } from "../api";

const queuedPayload = (turnId: string) => ({
  ok: false,
  response_type: "queued",
  final_status: "pending_input",
  terminal_artifact_kind: "ask_turn_admission",
  final_answer_source: "ask_turn_admission",
  turn_id: turnId,
  text: "Ask turn queued: instance_capacity.",
  answer: "Ask turn queued: instance_capacity.",
  assistant_answer: false,
  terminal_eligible: false,
  raw_content_included: false,
  ask_turn_admission: {
    schema: "helix.ask_turn_admission.v1",
    status: "queued",
    turn_id: turnId,
    reason: "instance_capacity",
    queue_position: 1,
    retry_after_ms: 100,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
  },
});

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const streamResponse = (events: Array<{ event: string; data: unknown }>): Response =>
  new Response(events.map(({ event, data }) =>
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join(""), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Ask API admission continuation", () => {
  it("binds a server-created turn id and resumes a queued non-streamed turn", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(queuedPayload("ask:server-bound"), 202))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        turn_id: "ask:server-bound",
        selected_final_answer: "The active panel is Account & Sessions.",
        text: "The active panel is Account & Sessions.",
        debug: { terminal_authority_ok: true },
      }));

    const pending = runAskTurn({
      question: "Use the Workstation Agent to verify the active panel.",
      agentRuntime: "codex",
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);
    const result = await pending;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(firstBody.turnId).toBeUndefined();
    expect(secondBody).toMatchObject({
      turnId: "ask:server-bound",
      turn_id: "ask:server-bound",
    });
    expect(result.text).toBe("The active panel is Account & Sessions.");
    expect(result.debug?.ask_turn_admission_continuation).toMatchObject({
      attempt_count: 2,
      queued_attempt_count: 1,
      resumed_after_queue: true,
      bound_turn_id: "ask:server-bound",
      assistant_answer: false,
      terminal_eligible: false,
    });
  });

  it("resumes a streamed turn and emits a non-terminal admission wait event", async () => {
    vi.useFakeTimers();
    const turnId = "ask:stream-resume";
    const finalPayload = {
      ok: true,
      turn_id: turnId,
      selected_final_answer: "Verified result.",
      text: "Verified result.",
      debug: { terminal_authority_ok: true },
    };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(streamResponse([
        { event: "turn_admission", data: queuedPayload(turnId) },
        { event: "turn_final", data: queuedPayload(turnId) },
      ]))
      .mockResolvedValueOnce(streamResponse([
        { event: "turn_final", data: finalPayload },
      ]));
    const events: Array<{ event: string; data: unknown }> = [];

    const pending = runAskTurnStream({
      question: "Use the Workstation Agent to verify the active panel.",
      agentRuntime: "codex",
      turnId,
    }, (event) => events.push(event));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);
    const result = await pending;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.text).toBe("Verified result.");
    expect(events).toContainEqual({
      event: "turn_admission_wait",
      data: {
        schema: "helix.ask_turn_admission.client_continuation.v1",
        turn_id: turnId,
        reason: "instance_capacity",
        queue_position: 1,
        retry_after_ms: 100,
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      },
    });
    expect(result.debug?.ask_turn_admission_continuation).toMatchObject({
      attempt_count: 2,
      queued_attempt_count: 1,
      resumed_after_queue: true,
    });
  });

  it("preserves a stream error event as non-authoritative debug evidence when a terminal failure follows", async () => {
    const turnId = "ask:stream-error-observation";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(streamResponse([
      {
        event: "turn_error",
        data: {
          ok: false,
          error: "ask_turn_stream_failed",
          message: "native_initialize_timeout",
          error_name: "CodexAppServerProtocolError",
          stream_duration_ms: 45_012,
        },
      },
      {
        event: "turn_final",
        data: {
          ok: false,
          turn_id: turnId,
          selected_final_answer: "The stream failed closed.",
          text: "The stream failed closed.",
          response_type: "final_failure",
          final_status: "final_failure",
          terminal_artifact_kind: "typed_failure",
          final_answer_source: "typed_failure",
          terminal_error_code: "ask_turn_stream_failed",
          debug: { stream_error_terminalized: true },
        },
      },
    ]));

    const result = await runAskTurnStream({
      question: "Inspect the active environment.",
      agentRuntime: "codex",
      turnId,
    });

    expect(result.text).toBe("The stream failed closed.");
    expect(result.debug).toMatchObject({
      backend_ask_call_error: "native_initialize_timeout",
      first_broken_rail: "ask_turn_stream_runtime",
      repair_target: "server_stream_failure",
      stream_error_event: {
        schema: "helix.ask.turn_stream_error_observation.v1",
        error_code: "ask_turn_stream_failed",
        error_name: "CodexAppServerProtocolError",
        message: "native_initialize_timeout",
        stream_duration_ms: 45_012,
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      },
    });
  });
});
