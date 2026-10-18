import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  HELIX_REALTIME_GROUNDED_FEEDBACK_BINDING_SCHEMA,
  type HelixRealtimeGroundedFeedbackBindingV1,
} from "@shared/contracts/helix-realtime-stage-play.v1";

let runAskTurnStream: typeof import("@/lib/agi/api").runAskTurnStream;

beforeAll(async () => {
  ({ runAskTurnStream } = await import("@/lib/agi/api"));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Ask API Realtime grounded feedback binding", () => {
  it("serializes the server-issued route binding at the top-level Ask boundary", async () => {
    const binding: HelixRealtimeGroundedFeedbackBindingV1 = {
      schema: HELIX_REALTIME_GROUNDED_FEEDBACK_BINDING_SCHEMA,
      handoff_id: "realtime-stage-play-handoff:api-test",
      realtime_session_id: "realtime:api-test",
      thread_id: "helix-ask:desktop",
      transcript_observation_ref: "realtime-transcript-observation:api-test",
      worker_admission_id: "realtime-worker-admission:api-test",
      issued_at_ms: 1_000,
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    };
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode([
          "event: turn_final",
          'data: {"text":"Accepted."}',
          "",
          "",
        ].join("\n")));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await runAskTurnStream({
      question: "Which panel is active?",
      routeMetadata: {
        schema: "helix.ask.route_metadata.v1",
        source: "realtime_stage_play",
        invocationKind: "stage_play_realtime_transcript_handoff",
        realtime_grounded_feedback_binding: binding,
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/agi/ask/turn/stream");
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(requestInit.body ?? "{}")) as Record<string, unknown>;
    expect(body.realtime_grounded_feedback_binding).toEqual(binding);
    expect(body.route_metadata).toMatchObject({
      invocationKind: "stage_play_realtime_transcript_handoff",
      realtime_grounded_feedback_binding: binding,
    });
  });
});
