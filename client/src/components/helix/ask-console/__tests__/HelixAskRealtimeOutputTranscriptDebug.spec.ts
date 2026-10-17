import { describe, expect, it } from "vitest";
import {
  createHelixAskRealtimeOutputTranscriptTracker,
  isHelixAskRealtimeOutputTranscriptEvent,
} from "../HelixAskRealtimeOutputTranscriptDebug";

describe("Helix Ask Realtime completed output transcript debug", () => {
  it("accumulates deltas but exports only one sanitized completed transcript", async () => {
    const tracker = createHelixAskRealtimeOutputTranscriptTracker();
    expect(isHelixAskRealtimeOutputTranscriptEvent(
      "response.output_audio_transcript.delta",
    )).toBe(true);

    expect(await tracker.observe({
      event: {
        response_id: "response:grounded",
        item_id: "item:audio",
        content_index: 0,
        delta: "The temporary token is ",
      },
      type: "response.output_audio_transcript.delta",
      eventRef: "event:delta:1",
      observedAtMs: 100,
    })).toBeNull();
    expect(await tracker.observe({
      event: {
        response_id: "response:grounded",
        item_id: "item:audio",
        content_index: 0,
        delta: "sk-abcdefghijklmnopqrst and the answer is 42.",
      },
      type: "response.output_audio_transcript.delta",
      eventRef: "event:delta:2",
      observedAtMs: 101,
    })).toBeNull();

    const completed = await tracker.observe({
      event: {
        response_id: "response:grounded",
        item_id: "item:audio",
        content_index: 0,
      },
      type: "response.output_audio_transcript.done",
      eventRef: "event:done",
      observedAtMs: 102,
    });

    expect(completed).toMatchObject({
      schema: "helix.ask.realtime.completed_output_transcript.v1",
      capture_status: "captured",
      provider_response_ref: "response:grounded",
      provider_item_ref: "item:audio",
      provider_content_index: 0,
      transcript_text_char_count: 68,
      sanitized_transcript_text:
        "The temporary token is [redacted credential] and the answer is 42.",
      transcript_redacted: true,
      transcript_truncated: false,
      transcript_delta_count: 2,
      provider_payload_included: false,
      output_audio_transcript_deltas_included: false,
      answer_authority: false,
      terminal_eligible: false,
      raw_content_included: false,
    });
    expect(completed?.transcript_text_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(JSON.stringify(completed)).not.toContain("sk-abcdefghijklmnopqrst");
    expect(JSON.stringify(completed)).not.toContain("event:delta:1");
  });

  it("uses the provider completed transcript when it is present", async () => {
    const tracker = createHelixAskRealtimeOutputTranscriptTracker();
    await tracker.observe({
      event: { response_id: "response:final", delta: "partial" },
      type: "response.audio_transcript.delta",
      eventRef: "event:partial",
      observedAtMs: 200,
    });

    const completed = await tracker.observe({
      event: {
        response_id: "response:final",
        transcript: "The completed provider transcript.",
      },
      type: "response.audio_transcript.done",
      eventRef: "event:final",
      observedAtMs: 201,
    });

    expect(completed).toMatchObject({
      capture_status: "captured",
      sanitized_transcript_text: "The completed provider transcript.",
      transcript_text_char_count: 34,
      transcript_delta_count: 1,
    });
  });

  it("records an explicit empty completion without inventing spoken text", async () => {
    const tracker = createHelixAskRealtimeOutputTranscriptTracker();
    const completed = await tracker.observe({
      event: { response_id: "response:empty", transcript: "" },
      type: "response.output_audio_transcript.done",
      eventRef: "event:empty",
      observedAtMs: 300,
    });

    expect(completed).toMatchObject({
      capture_status: "empty",
      provider_response_ref: "response:empty",
      transcript_text_hash: null,
      transcript_text_char_count: 0,
      sanitized_transcript_text: null,
      sanitized_transcript_included: false,
      raw_content_included: false,
    });
  });
});
