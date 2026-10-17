import { describe, expect, it } from "vitest";
import { appendRoomTranscriptHistory } from "../RoomTranscriptHistory";

describe("live room transcript history", () => {
  it("keeps a bounded attributed window and does not duplicate a retransmitted line", () => {
    let history: ReturnType<typeof appendRoomTranscriptHistory> = [];
    for (let index = 0; index < 35; index += 1) {
      history = appendRoomTranscriptHistory(history, {
        speaker_kind: index % 2 ? "gpt" : "participant",
        speaker_label: index % 2 ? "GPT" : "Sam",
        transcript: `Line ${index}`,
        observed_at_ms: index,
      });
    }
    expect(history).toHaveLength(32);
    expect(history[0]?.transcript).toBe("Line 3");
    const repeated = appendRoomTranscriptHistory(history, history[31]!);
    expect(repeated).toEqual(history);
    expect(repeated).not.toBe(history);
  });
});
