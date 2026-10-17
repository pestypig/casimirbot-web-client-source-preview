import { describe, expect, it } from "vitest";
import type {
  HelixSharedRealtimeRoom,
  HelixSharedRealtimeRoomVisualFrame,
} from "@shared/helix-shared-realtime-room";
import { buildSharedLiveRoomAcceptanceProjection } from
  "../SharedLiveRoomAcceptanceProjection";
import type { SharedLiveRoomMediaBridgeProjection } from
  "../media-bridge/RoomMediaBridgeContracts";

const NOW_MS = 1780000000000;
const room = {
  participants: [
    { participant_id: "participant:owner", presence: "present" },
    { participant_id: "participant:guest", presence: "present" },
  ],
  runtime: {
    topology: "single_shared_model",
    state: "bridge_active",
    transport_owner: "room_media_bridge",
    realtime_session_ref_hash: "sha256:shared-session",
  },
} as HelixSharedRealtimeRoom;
const mediaBridge = {
  state: "active",
  peer_audio_connected: true,
  remote_audio_playback_ready: true,
  provider_input_mixed: true,
  provider_input_enabled: true,
  provider_audio_forwarded: true,
} as SharedLiveRoomMediaBridgeProjection;
const frame = (
  participantId: string,
  delivery: HelixSharedRealtimeRoomVisualFrame["provider_delivery"],
  capturedAtMs = NOW_MS - 1_000,
) => ({
  participant_id: participantId,
  provider_delivery: delivery,
  captured_at: new Date(capturedAtMs).toISOString(),
}) as HelixSharedRealtimeRoomVisualFrame;

describe("Shared Live Room acceptance projection", () => {
  it("requires fresh exact provider acknowledgement from both participants", () => {
    const pending = buildSharedLiveRoomAcceptanceProjection({
      room,
      frames: [
        frame("participant:owner", "sent_to_shared_model"),
        frame("participant:guest", "transport_sent"),
      ],
      mediaBridge,
      nowMs: NOW_MS,
    });
    expect(pending.both_participants_visual_provider_acknowledged).toBe(false);
    expect(pending.automated_transport_evidence_ready).toBe(false);

    const ready = buildSharedLiveRoomAcceptanceProjection({
      room,
      frames: [
        frame("participant:owner", "sent_to_shared_model"),
        frame("participant:guest", "sent_to_shared_model"),
      ],
      mediaBridge,
      nowMs: NOW_MS,
    });
    expect(ready.fresh_provider_acknowledged_participant_ids).toEqual([
      "participant:guest",
      "participant:owner",
    ]);
    expect(ready.automated_transport_evidence_ready).toBe(true);
    expect(ready.remote_audio_playback_ready).toBe(true);
    expect(ready.manual_checks_required).toContain("both_human_audio_directions");
  });

  it("does not report transport evidence ready when browser playback is blocked", () => {
    const projection = buildSharedLiveRoomAcceptanceProjection({
      room,
      frames: [
        frame("participant:owner", "sent_to_shared_model"),
        frame("participant:guest", "sent_to_shared_model"),
      ],
      mediaBridge: {
        ...mediaBridge,
        remote_audio_playback_ready: false,
        failure: "remote_audio_playback_blocked",
      },
      nowMs: NOW_MS,
    });

    expect(projection.peer_audio_transport_connected).toBe(true);
    expect(projection.remote_audio_playback_ready).toBe(false);
    expect(projection.automated_transport_evidence_ready).toBe(false);
  });

  it("rejects stale visual evidence even when its historic delivery was acknowledged", () => {
    const projection = buildSharedLiveRoomAcceptanceProjection({
      room,
      frames: [
        frame("participant:owner", "sent_to_shared_model"),
        frame("participant:guest", "sent_to_shared_model", NOW_MS - 31_000),
      ],
      mediaBridge,
      nowMs: NOW_MS,
    });
    expect(projection.both_participants_visual_provider_acknowledged).toBe(false);
  });
});
