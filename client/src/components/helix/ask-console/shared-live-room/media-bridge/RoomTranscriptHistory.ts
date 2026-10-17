import type { SharedLiveRoomTranscriptProjection } from "./RoomMediaBridgeContracts";

const MAX_VISIBLE_ROOM_TRANSCRIPTS = 32;

/** Ephemeral display history for one live bridge, never model or mission context. */
export function appendRoomTranscriptHistory(
  history: readonly SharedLiveRoomTranscriptProjection[],
  transcript: SharedLiveRoomTranscriptProjection,
): SharedLiveRoomTranscriptProjection[] {
  const prior = history.at(-1);
  if (prior && prior.speaker_kind === transcript.speaker_kind &&
      prior.speaker_label === transcript.speaker_label &&
      prior.transcript === transcript.transcript &&
      prior.observed_at_ms === transcript.observed_at_ms) return [...history];
  return [...history, transcript].slice(-MAX_VISIBLE_ROOM_TRANSCRIPTS);
}
