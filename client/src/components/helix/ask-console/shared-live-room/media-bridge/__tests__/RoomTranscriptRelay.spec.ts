import { describe, expect, it, vi } from "vitest";
import {
  publishSharedLiveRoomInputSpeechStarted,
  publishSharedLiveRoomInputTranscript,
  subscribeSharedLiveRoomInputSpeechStarted,
  subscribeSharedLiveRoomInputTranscripts,
} from "../RoomTranscriptRelay";

describe("Shared Live Room input transcript relay", () => {
  it("fans out each provider transcript event once per live session", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSharedLiveRoomInputTranscripts(
      "realtime:input-transcript",
      listener,
    );
    const transcript = {
      eventRef: "event:input:1",
      itemId: "item:input:1",
      transcript: "participant said this",
      observedAtMs: 10,
    };
    publishSharedLiveRoomInputTranscript("realtime:input-transcript", transcript);
    publishSharedLiveRoomInputTranscript("realtime:input-transcript", transcript);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(transcript);
    unsubscribe();
  });

  it("fans out provider speech-start identity before transcript completion", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeSharedLiveRoomInputSpeechStarted(
      "realtime:speech-start",
      listener,
    );
    const speech = {
      itemId: "item:speech:1",
      observedAtMs: 9,
    };
    publishSharedLiveRoomInputSpeechStarted("realtime:speech-start", speech);
    expect(listener).toHaveBeenCalledWith(speech);
    unsubscribe();
  });
});
