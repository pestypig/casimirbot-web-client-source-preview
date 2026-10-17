import type { SharedLiveRoomTranscriptProjection } from "./RoomMediaBridgeContracts";

export type SharedLiveRoomTranscriptDataChannel = {
  attach(channel: RTCDataChannel): void;
  publish(input: SharedLiveRoomTranscriptProjection): void;
  syncConsent(): void;
  close(): void;
};

export const createSharedLiveRoomTranscriptDataChannel = (input: {
  role: "owner" | "participant";
  isAuthorized(): boolean;
  onTranscript(transcript: SharedLiveRoomTranscriptProjection | null): void;
}): SharedLiveRoomTranscriptDataChannel => {
  let channel: RTCDataChannel | null = null;
  let pendingEvent: string | null = null;

  const clearUnauthorized = (): boolean => {
    if (input.isAuthorized()) return false;
    pendingEvent = null;
    input.onTranscript(null);
    return true;
  };

  return {
    attach(nextChannel) {
      channel = nextChannel;
      nextChannel.onopen = () => {
        if (
          input.role === "owner" &&
          pendingEvent &&
          !clearUnauthorized()
        ) {
          nextChannel.send(pendingEvent);
          pendingEvent = null;
        }
      };
      nextChannel.onmessage = (event) => {
        if (clearUnauthorized()) return;
        try {
          const message = JSON.parse(String(event.data)) as {
            type?: unknown;
            transcript?: unknown;
            speaker_kind?: unknown;
            speaker_label?: unknown;
            observed_at_ms?: unknown;
          };
          if (
            message.type === "room_transcript" &&
            typeof message.transcript === "string" &&
            (message.speaker_kind === "gpt" || message.speaker_kind === "participant") &&
            typeof message.speaker_label === "string" &&
            typeof message.observed_at_ms === "number"
          ) {
            input.onTranscript({
              speaker_kind: message.speaker_kind,
              speaker_label: message.speaker_label.trim().slice(0, 120),
              transcript: message.transcript.slice(0, 4_000),
              observed_at_ms: message.observed_at_ms,
            });
          }
        } catch {
          // Observational room events have no answer or control authority.
        }
      };
    },
    publish(event) {
      if (input.role !== "owner" || clearUnauthorized()) return;
      const projected: SharedLiveRoomTranscriptProjection = {
        speaker_kind: event.speaker_kind,
        speaker_label: event.speaker_label.trim().slice(0, 120),
        transcript: event.transcript.slice(0, 4_000),
        observed_at_ms: event.observed_at_ms,
      };
      input.onTranscript(projected);
      const serialized = JSON.stringify({
        type: "room_transcript",
        ...projected,
      });
      if (channel?.readyState === "open") {
        channel.send(serialized);
        pendingEvent = null;
      } else {
        pendingEvent = serialized;
      }
    },
    syncConsent() {
      clearUnauthorized();
    },
    close() {
      pendingEvent = null;
      channel?.close();
      channel = null;
      input.onTranscript(null);
    },
  };
};
