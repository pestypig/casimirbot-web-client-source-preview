import { describe, expect, it, vi } from "vitest";
import { createSharedLiveRoomTranscriptDataChannel } from
  "../RoomTranscriptDataChannel";
import type { SharedLiveRoomTranscriptProjection } from
  "../RoomMediaBridgeContracts";

const channel = (readyState: RTCDataChannelState = "connecting") => ({
  readyState,
  send: vi.fn(),
  close: vi.fn(),
  onopen: null,
  onmessage: null,
}) as unknown as RTCDataChannel;

describe("Shared Live Room transcript data channel", () => {
  it("queues only the latest transcript until the channel opens", () => {
    const observed: Array<SharedLiveRoomTranscriptProjection | null> = [];
    const peer = channel();
    const fanout = createSharedLiveRoomTranscriptDataChannel({
      role: "owner",
      isAuthorized: () => true,
      onTranscript: (transcript) => observed.push(transcript),
    });
    fanout.attach(peer);
    fanout.publish({
      speaker_kind: "gpt",
      speaker_label: "GPT",
      transcript: "first",
      observed_at_ms: 1,
    });
    fanout.publish({
      speaker_kind: "gpt",
      speaker_label: "GPT",
      transcript: "latest",
      observed_at_ms: 2,
    });
    expect(peer.send).not.toHaveBeenCalled();
    peer.onopen?.(new Event("open"));
    expect(peer.send).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(peer.send).mock.calls[0]?.[0])).toContain("latest");
    expect(observed.map((entry) => entry?.transcript)).toEqual(["first", "latest"]);
  });

  it("drops queued and visible transcript state as soon as consent is revoked", () => {
    let authorized = true;
    const observed: Array<SharedLiveRoomTranscriptProjection | null> = [];
    const peer = channel();
    const fanout = createSharedLiveRoomTranscriptDataChannel({
      role: "owner",
      isAuthorized: () => authorized,
      onTranscript: (transcript) => observed.push(transcript),
    });
    fanout.attach(peer);
    fanout.publish({
      speaker_kind: "participant",
      speaker_label: "Owner",
      transcript: "private after revoke",
      observed_at_ms: 3,
    });
    authorized = false;
    fanout.syncConsent();
    peer.onopen?.(new Event("open"));
    expect(peer.send).not.toHaveBeenCalled();
    expect(observed.at(-1)).toBeNull();
  });

  it("clears visible transcript state when the media channel closes", () => {
    const observed: Array<SharedLiveRoomTranscriptProjection | null> = [];
    const fanout = createSharedLiveRoomTranscriptDataChannel({
      role: "owner",
      isAuthorized: () => true,
      onTranscript: (transcript) => observed.push(transcript),
    });
    fanout.publish({ speaker_kind: "participant", speaker_label: "Dan", transcript: "Room line", observed_at_ms: 5 });
    fanout.close();
    expect(observed.map((entry) => entry?.transcript)).toEqual(["Room line", undefined]);
  });

  it("admits bounded GPT transcript messages for an authorized participant", () => {
    const observed: Array<SharedLiveRoomTranscriptProjection | null> = [];
    const peer = channel("open");
    const fanout = createSharedLiveRoomTranscriptDataChannel({
      role: "participant",
      isAuthorized: () => true,
      onTranscript: (transcript) => observed.push(transcript),
    });
    fanout.attach(peer);
    peer.onmessage?.({
      data: JSON.stringify({
        type: "room_transcript",
        speaker_kind: "participant",
        speaker_label: "Alex",
        transcript: "x".repeat(4_500),
        observed_at_ms: 4,
      }),
    } as MessageEvent);
    expect(observed[0]?.transcript).toHaveLength(4_000);
    expect(observed[0]?.speaker_label).toBe("Alex");
  });
});
