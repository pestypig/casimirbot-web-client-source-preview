import { describe, expect, it } from "vitest";

import {
  buildManualReadAloudVoiceIntent,
  mapVoicePlaybackIntentToTask,
  type VoicePlaybackUtteranceIntent,
} from "@/lib/helix/ask-voice-playback-intent";

describe("voice playback intent projection", () => {
  it("builds a final manual read-aloud intent with trimmed trace id and fallback turn key", () => {
    expect(buildManualReadAloudVoiceIntent({
      text: "Read this aloud.",
      replyId: "reply-1",
      traceId: " trace-1 ",
    })).toEqual({
      kind: "manual_read_aloud",
      authority: "final",
      turnKey: "manual:reply-1",
      revision: 1,
      text: "Read this aloud.",
      traceId: "trace-1",
      eventId: "reply-1",
      replyId: "reply-1",
      source: "manual",
    });
  });

  it("uses an explicit non-empty turn key for manual read-aloud", () => {
    expect(buildManualReadAloudVoiceIntent({
      text: "Again.",
      replyId: "reply-2",
      turnKey: " turn-2 ",
    }).turnKey).toBe("turn-2");
  });

  it("maps an intent into a deterministic queue task without scheduling playback", () => {
    const intent: VoicePlaybackUtteranceIntent = {
      kind: "tool_receipt",
      authority: "provisional",
      source: "agent_loop",
      turnKey: "turn-1",
      revision: 3,
      text: "Calculator returned 72.",
      traceId: "trace-1",
      eventId: "event-1",
      replyId: "reply-1",
      allowMicOffPlayback: true,
      interimVoiceRequestId: "request-1",
      interimVoiceReceiptId: "receipt-1",
      interimVoiceReceiptKey: "utterance-1",
      interimVoiceCalloutKind: "tool_result",
      briefSource: "llm",
      finalSource: "normal_reasoning",
    };

    const task = mapVoicePlaybackIntentToTask(intent);

    expect(task).toMatchObject({
      kind: "tool_receipt",
      turnKey: "turn-1",
      revision: 3,
      text: "Calculator returned 72.",
      traceId: "trace-1",
      eventId: "event-1",
      authority: "provisional",
      source: "agent_loop",
      replyId: "reply-1",
      allowMicOffPlayback: true,
      interimVoiceRequestId: "request-1",
      interimVoiceReceiptId: "receipt-1",
      interimVoiceReceiptKey: "utterance-1",
      interimVoiceCalloutKind: "tool_result",
      briefSource: "llm",
      finalSource: "normal_reasoning",
    });
    expect(task.key).toBe("tool_receipt:trace-1:event-1:reply-1");
    expect(task.key).toBe(mapVoicePlaybackIntentToTask(intent).key);
  });
});
