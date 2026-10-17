import type { HelixSharedRealtimeRoom } from
  "@shared/helix-shared-realtime-room";
import type { SharedLiveRoomTranscriptDataChannel } from
  "./RoomTranscriptDataChannel";
import {
  subscribeSharedLiveRoomInputSpeechStarted,
  subscribeSharedLiveRoomInputTranscripts,
  subscribeSharedLiveRoomOutputTranscripts,
} from "./RoomTranscriptRelay";
import { createSharedLiveRoomTranscriptSpeakerBindings } from
  "./RoomTranscriptSpeakerBindings";

export type SharedLiveRoomTranscriptFanout = {
  start(): void;
  close(): void;
};

export const createSharedLiveRoomTranscriptFanout = (input: {
  role: "owner" | "participant";
  realtimeSessionId: string | null;
  getRoom(): HelixSharedRealtimeRoom;
  channel: SharedLiveRoomTranscriptDataChannel;
}): SharedLiveRoomTranscriptFanout => {
  const speakerBindings = createSharedLiveRoomTranscriptSpeakerBindings();
  const unsubscribers: Array<() => void> = [];
  let started = false;

  return {
    start() {
      if (
        started ||
        input.role !== "owner" ||
        !input.realtimeSessionId
      ) return;
      started = true;
      unsubscribers.push(
        subscribeSharedLiveRoomOutputTranscripts(
          input.realtimeSessionId,
          (transcript) => {
            const text = transcript.sanitized_transcript_text;
            if (!text) return;
            input.channel.publish({
              speaker_kind: "gpt",
              speaker_label: "GPT",
              transcript: text,
              observed_at_ms: transcript.observed_at_ms,
            });
          },
        ),
        subscribeSharedLiveRoomInputSpeechStarted(
          input.realtimeSessionId,
          (speech) => {
            const room = input.getRoom();
            const activeSpeakerId =
              room.runtime.active_speaker_participant_id;
            const activeSpeaker = room.participants.find(
              (participant) =>
                participant.participant_id === activeSpeakerId,
            );
            if (!activeSpeaker?.consent.microphone_to_model) return;
            speakerBindings.bind(speech.itemId, {
              participant_id: activeSpeaker.participant_id,
              display_name: activeSpeaker.display_name,
            });
          },
        ),
        subscribeSharedLiveRoomInputTranscripts(
          input.realtimeSessionId,
          (transcript) => {
            const boundSpeaker = speakerBindings.consume(transcript.itemId);
            if (!boundSpeaker) return;
            const currentSpeaker = input.getRoom().participants.find(
              (participant) =>
                participant.participant_id === boundSpeaker.participant_id,
            );
            if (!currentSpeaker?.consent.transcript_to_room) return;
            input.channel.publish({
              speaker_kind: "participant",
              speaker_label: boundSpeaker.display_name,
              transcript: transcript.transcript,
              observed_at_ms: transcript.observedAtMs,
            });
          },
        ),
      );
    },
    close() {
      while (unsubscribers.length > 0) unsubscribers.pop()?.();
      speakerBindings.clear();
      started = false;
    },
  };
};
