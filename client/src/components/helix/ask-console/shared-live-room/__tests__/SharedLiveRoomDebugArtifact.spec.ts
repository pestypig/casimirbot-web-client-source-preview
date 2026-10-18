import { afterEach, describe, expect, it } from "vitest";
import type {
  HelixSharedRealtimeRoom,
  HelixSharedRealtimeRoomVisualFrame,
} from "@shared/helix-shared-realtime-room";
import {
  buildSharedLiveRoomDebugArtifact,
  mergeSharedLiveRoomDebugIntoExport,
  recordSharedLiveRoomDebugArtifact,
} from "../SharedLiveRoomDebugArtifact";
import { finalizeHelixAskWorkflowDebugCopyExport } from
  "../../HelixAskWorkflowDebugProjection";
import type { SharedLiveRoomMediaBridgeProjection } from
  "../media-bridge/RoomMediaBridgeContracts";

const room = {
  room_id: "room:proof",
  runtime: {
    state: "bridge_active",
    topology: "single_shared_model",
    transport_owner: "room_media_bridge",
    realtime_session_ref_hash: "sha256:session",
    active_speaker_participant_id: "participant:owner",
  },
  participants: [{
    participant_id: "participant:owner",
    display_name: "Private Owner Name",
    role: "owner",
    presence: "present",
  }],
  participant_context_cards: [],
} as HelixSharedRealtimeRoom;
const frame = {
  frame_ref: "frame:proof",
  participant_id: "participant:owner",
  participant_display_name: "Private Owner Name",
  source_id: "source:screen",
  source_surface: "screen_share_window",
  captured_at: "2026-07-23T00:00:00.000Z",
  sequence: 3,
  provider_delivery: "sent_to_shared_model",
  preview_data_url: "data:image/jpeg;base64,raw-pixels",
} as HelixSharedRealtimeRoomVisualFrame;
const mediaBridge = {
  state: "active",
  role: "owner",
  peer_audio_connected: true,
  remote_audio_playback_ready: true,
  provider_input_mixed: true,
  provider_input_enabled: true,
  provider_audio_forwarded: true,
  active_model_speaker_participant_id: "participant:owner",
  latest_shared_transcript: {
    speaker_kind: "participant",
    speaker_label: "Private Owner Name",
    transcript: "private spoken text",
    observed_at_ms: 123,
  },
  ice_configuration: "default_stun",
  ice_configuration_error: null,
  failure: null,
} as SharedLiveRoomMediaBridgeProjection;

afterEach(() => recordSharedLiveRoomDebugArtifact(null));

describe("Shared Live Room debug artifact", () => {
  it("keeps pixels, display names, and transcript text out of the proof copy", () => {
    const artifact = buildSharedLiveRoomDebugArtifact({
      room,
      frames: [frame],
      mediaBridge,
      debug: null,
      nowMs: Date.parse("2026-07-23T00:00:01.000Z"),
    });
    const serialized = JSON.stringify(artifact);

    expect(serialized).not.toContain("raw-pixels");
    expect(serialized).not.toContain("Private Owner Name");
    expect(serialized).not.toContain("private spoken text");
    expect(artifact.visual_frames[0]).toMatchObject({
      frame_ref: "frame:proof",
      provider_delivery: "sent_to_shared_model",
    });
    expect(artifact.raw_content_included).toBe(false);
  });

  it("attaches the ambient room proof to a selected final-answer debug export without granting authority", () => {
    recordSharedLiveRoomDebugArtifact(buildSharedLiveRoomDebugArtifact({
      room,
      frames: [frame],
      mediaBridge,
      debug: null,
      nowMs: Date.parse("2026-07-23T00:00:01.000Z"),
    }));
    const merged = JSON.parse(mergeSharedLiveRoomDebugIntoExport(JSON.stringify({
      active_turn_id: "ask:turn:proof",
      answer: "Visible answer",
    })));

    expect(merged.shared_live_room_debug).toMatchObject({
      selected_answer_turn_id: "ask:turn:proof",
      selected_answer_binding:
        "ambient_room_evidence_not_bound_to_selected_answer",
      answer_authority: false,
      raw_content_included: false,
    });

    const finalized = JSON.parse(finalizeHelixAskWorkflowDebugCopyExport({
      payload: JSON.stringify({
        active_turn_id: "ask:turn:proof",
        answer: "Visible answer",
      }),
      clickedTurnScope: null,
      workflowDemoDebug: null,
    }));
    expect(finalized.shared_live_room_debug).toMatchObject({
      selected_answer_turn_id: "ask:turn:proof",
      answer_authority: false,
    });
  });
});
