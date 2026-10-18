import { describe, expect, it } from "vitest";

import { createHelixAskRealtimeProviderEventHandler } from "../HelixAskRealtimeProviderEventHandler";

describe("Helix Ask Realtime provider event relay correlation", () => {
  it("projects the terminal relay id into response and playback transport receipts", async () => {
    const receipts: Array<Record<string, unknown>> = [];
    const handler = createHelixAskRealtimeProviderEventHandler({
      realtimeSessionId: "realtime:test",
      runtimeAgentAuthority: "codex",
      nowMs: () => 100,
      postEvent: async (_path, body) => {
        receipts.push(body);
        return { ok: true };
      },
    });

    await handler.handle({
      event_id: "event:response-created",
      type: "response.created",
      response: {
        id: "response:terminal-relay",
        status: "in_progress",
        metadata: {
          helix_purpose: "terminal_answer_relay",
          helix_relay_id: "realtime-grounded-relay:test",
          helix_handoff_id: "handoff:test",
        },
      },
    });
    await handler.handle({
      event_id: "event:audio-started",
      type: "response.output_audio.delta",
      response_id: "response:terminal-relay",
      delta: "omitted",
    });
    await handler.handle({
      event_id: "event:response-done",
      type: "response.done",
      response: {
        id: "response:terminal-relay",
        status: "completed",
      },
    });

    expect(receipts).toEqual([
      expect.objectContaining({
        receipt_kind: "response_started",
        relay_id: "realtime-grounded-relay:test",
        provider_response_ref: "response:terminal-relay",
        answer_authority: false,
      }),
      expect.objectContaining({
        receipt_kind: "playback_started",
        relay_id: "realtime-grounded-relay:test",
        provider_response_ref: "response:terminal-relay",
        answer_authority: false,
      }),
      expect.objectContaining({
        receipt_kind: "response_completed",
        relay_id: "realtime-grounded-relay:test",
        provider_response_ref: "response:terminal-relay",
        answer_authority: false,
      }),
    ]);
  });

  it("correlates id-less WebRTC buffer receipts to the active terminal response", async () => {
    const receipts: Array<Record<string, unknown>> = [];
    const handler = createHelixAskRealtimeProviderEventHandler({
      realtimeSessionId: "realtime:test",
      runtimeAgentAuthority: "codex",
      nowMs: () => 200,
      postEvent: async (_path, body) => {
        receipts.push(body);
        return { ok: true };
      },
    });

    await handler.handle({
      event_id: "event:response-created",
      type: "response.created",
      response: {
        id: "response:terminal-buffer",
        metadata: {
          helix_purpose: "terminal_answer_relay",
          helix_relay_id: "realtime-grounded-relay:buffer",
        },
      },
    });
    await handler.handle({
      event_id: "event:buffer-started",
      type: "output_audio_buffer.started",
    });
    await handler.handle({
      event_id: "event:response-done",
      type: "response.done",
      response: {
        id: "response:terminal-buffer",
        status: "completed",
      },
    });
    await handler.handle({
      event_id: "event:buffer-stopped",
      type: "output_audio_buffer.stopped",
    });

    expect(receipts).toEqual([
      expect.objectContaining({
        receipt_kind: "response_started",
        relay_id: "realtime-grounded-relay:buffer",
        provider_response_ref: "response:terminal-buffer",
      }),
      expect.objectContaining({
        receipt_kind: "playback_started",
        relay_id: "realtime-grounded-relay:buffer",
        provider_response_ref: "response:terminal-buffer",
      }),
      expect.objectContaining({
        receipt_kind: "response_completed",
        relay_id: "realtime-grounded-relay:buffer",
        provider_response_ref: "response:terminal-buffer",
      }),
      expect.objectContaining({
        receipt_kind: "playback_ended",
        relay_id: "realtime-grounded-relay:buffer",
        provider_response_ref: "response:terminal-buffer",
      }),
    ]);
  });
});
