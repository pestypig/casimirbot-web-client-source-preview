import { describe, expect, it } from "vitest";
import type { HelixSharedRealtimeRoom } from "@shared/helix-shared-realtime-room";
import { INITIAL_SHARED_LIVE_ROOM_MEDIA_BRIDGE_PROJECTION } from
  "../media-bridge/RoomMediaBridgeContracts";
import { buildSharedLiveRoomGuideProjection } from "../SharedLiveRoomGuideProjection";

const room = {
  room_id: "room:must-not-leak",
  title: "Projection proof room",
  status: "active",
  max_participants: 2,
  self_participant_id: "participant:self-secret",
  participants: [
    {
      participant_id: "participant:self-secret",
      display_name: "Dan",
      role: "owner",
      presence: "present",
      consent: {
        microphone_to_room: true,
        microphone_to_model: false,
      },
    },
    {
      participant_id: "participant:peer-secret",
      display_name: "Friend",
      role: "participant",
      presence: "away",
      consent: {
        microphone_to_room: true,
        microphone_to_model: true,
      },
    },
  ],
  participant_context_cards: [{
    participant_id: "participant:self-secret",
    latest_observed_at: "2026-08-31T20:00:00.000Z",
    visual_sources: [{
      source_id: "source:must-not-leak",
      source_label: "Minecraft",
      freshness: "fresh",
    }],
  }],
  public_terminal_results: [{
    result_ref: "result:must-not-leak",
    published_at: "2026-08-31T20:01:00.000Z",
    terminal_artifact_kind: "model_synthesized_answer",
    text: "private result text must not leak",
    evidence_refs: ["evidence:must-not-leak"],
  }],
  readiness: {
    participant_count: 2,
    required_participant_count: 2,
    ready: true,
  },
  runtime: {
    state: "bridge_active",
    model: "gpt-realtime",
    active_speaker_participant_id: "participant:self-secret",
    realtime_session_ref_hash: "sha256:must-not-leak",
    updated_at: "2026-08-31T20:00:00.000Z",
  },
  updated_at: "2026-08-31T20:00:00.000Z",
} as unknown as HelixSharedRealtimeRoom;

describe("Shared Live Room Guide projection", () => {
  it("reduces authoritative room state to safe metadata without mutation or secret-bearing fields", () => {
    const projection = buildSharedLiveRoomGuideProjection({
      room,
      loading: false,
      failed: false,
      mediaBridge: {
        ...INITIAL_SHARED_LIVE_ROOM_MEDIA_BRIDGE_PROJECTION,
        state: "active",
        peer_audio_connected: true,
      },
    });

    expect(projection).toMatchObject({
      controller_available: true,
      state: "ready",
      room: {
        title: "Projection proof room",
        participant_count: 2,
        present_count: 1,
      },
      floor: { active: true, holder_display_name: "Dan" },
      microphone: {
        state: "active",
        to_room_consented: true,
        to_model_consented: false,
      },
      gpt: { attached: true, runtime_state: "bridge_active" },
      sources: { count: 1, fresh_count: 1, stale_count: 0 },
      public_results: { count: 1, latest_artifact_kind: "model_synthesized_answer" },
    });

    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain("room:must-not-leak");
    expect(serialized).not.toContain("participant:self-secret");
    expect(serialized).not.toContain("source:must-not-leak");
    expect(serialized).not.toContain("sha256:must-not-leak");
    expect(serialized).not.toContain("private result text must not leak");
    expect(serialized).not.toContain("evidence:must-not-leak");
    expect(serialized).not.toContain("takeFloor");
  });

  it("preserves loading, failure, and no-room states without inventing a room", () => {
    expect(buildSharedLiveRoomGuideProjection({
      room: null,
      mediaBridge: INITIAL_SHARED_LIVE_ROOM_MEDIA_BRIDGE_PROJECTION,
      loading: true,
      failed: false,
    }).state).toBe("loading");
    expect(buildSharedLiveRoomGuideProjection({
      room: null,
      mediaBridge: INITIAL_SHARED_LIVE_ROOM_MEDIA_BRIDGE_PROJECTION,
      loading: false,
      failed: true,
    })).toMatchObject({ state: "failed", room: null });
  });
});
