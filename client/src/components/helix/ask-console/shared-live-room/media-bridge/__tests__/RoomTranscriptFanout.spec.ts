import { describe, expect, it, vi } from "vitest";
import type { HelixSharedRealtimeRoom } from
  "@shared/helix-shared-realtime-room";
import { createSharedLiveRoomTranscriptFanout } from
  "../RoomTranscriptFanout";
import {
  publishSharedLiveRoomInputSpeechStarted,
  publishSharedLiveRoomInputTranscript,
} from "../RoomTranscriptRelay";
import type { SharedLiveRoomTranscriptDataChannel } from
  "../RoomTranscriptDataChannel";

const participant = (
  participantId: string,
  displayName: string,
) => ({
  participant_id: participantId,
  display_name: displayName,
  consent: {
    microphone_to_model: true,
    transcript_to_room: true,
  },
});

describe("Shared Live Room transcript fan-out", () => {
  it("retains the speech-start speaker when the floor changes before completion", () => {
    const owner = participant("participant:owner", "Dan");
    const guest = participant("participant:guest", "Alex");
    let room = {
      participants: [owner, guest],
      runtime: {
        active_speaker_participant_id: owner.participant_id,
      },
    } as HelixSharedRealtimeRoom;
    const publish = vi.fn();
    const fanout = createSharedLiveRoomTranscriptFanout({
      role: "owner",
      realtimeSessionId: "realtime:fanout",
      getRoom: () => room,
      channel: { publish } as unknown as SharedLiveRoomTranscriptDataChannel,
    });
    fanout.start();

    publishSharedLiveRoomInputSpeechStarted("realtime:fanout", {
      itemId: "item:owner-speech",
      observedAtMs: 10,
    });
    room = {
      ...room,
      runtime: {
        ...room.runtime,
        active_speaker_participant_id: guest.participant_id,
      },
    };
    publishSharedLiveRoomInputTranscript("realtime:fanout", {
      eventRef: "event:owner-transcript",
      itemId: "item:owner-speech",
      transcript: "Owner spoke before the floor changed.",
      observedAtMs: 20,
    });

    expect(publish).toHaveBeenCalledWith({
      speaker_kind: "participant",
      speaker_label: "Dan",
      transcript: "Owner spoke before the floor changed.",
      observed_at_ms: 20,
    });
    fanout.close();
  });
});
