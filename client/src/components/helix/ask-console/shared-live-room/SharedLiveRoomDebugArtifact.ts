import type {
  HelixSharedRealtimeRoom,
  HelixSharedRealtimeRoomDebug,
  HelixSharedRealtimeRoomVisualFrame,
} from "@shared/helix-shared-realtime-room";
import { readHelixAskLiveRuntimeClientDebugSnapshot } from
  "../HelixAskLiveRuntimeDebugState";
import type { HelixAskLiveVisionProof } from "../HelixAskLiveVisionProof";
import {
  buildSharedLiveRoomAcceptanceProjection,
  type SharedLiveRoomAcceptanceProjection,
} from "./SharedLiveRoomAcceptanceProjection";
import type { SharedLiveRoomMediaBridgeProjection } from
  "./media-bridge/RoomMediaBridgeContracts";

export type SharedLiveRoomDebugArtifact = {
  schema: "helix.shared_realtime_room.debug_artifact.v1";
  generated_at: string;
  room_id: string;
  runtime: {
    state: HelixSharedRealtimeRoom["runtime"]["state"];
    topology: "single_shared_model";
    transport_owner: HelixSharedRealtimeRoom["runtime"]["transport_owner"];
    realtime_session_ref_hash: string | null;
    active_speaker_participant_id: string | null;
  };
  acceptance: SharedLiveRoomAcceptanceProjection;
  participants: Array<{
    participant_id: string;
    role: HelixSharedRealtimeRoom["participants"][number]["role"];
    presence: HelixSharedRealtimeRoom["participants"][number]["presence"];
    context_status:
      HelixSharedRealtimeRoom["participant_context_cards"][number]["context_status"] | null;
  }>;
  visual_frames: Array<{
    frame_ref: string;
    participant_id: string;
    source_id: string;
    source_surface: HelixSharedRealtimeRoomVisualFrame["source_surface"];
    captured_at: string;
    sequence: number;
    provider_delivery: HelixSharedRealtimeRoomVisualFrame["provider_delivery"];
  }>;
  media_bridge: Omit<
    SharedLiveRoomMediaBridgeProjection,
    "latest_shared_transcript"
  > & {
    latest_shared_transcript_observed_at_ms: number | null;
  };
  server_debug_observed: boolean;
  single_user_vision_proof: HelixAskLiveVisionProof | null;
  selected_answer_turn_id: string | null;
  selected_answer_binding:
    "ambient_room_evidence_not_bound_to_selected_answer";
  answer_authority: false;
  assistant_answer: false;
  terminal_eligible: false;
  raw_content_included: false;
};

let currentArtifact: SharedLiveRoomDebugArtifact | null = null;

export const buildSharedLiveRoomDebugArtifact = (input: {
  room: HelixSharedRealtimeRoom;
  frames: readonly HelixSharedRealtimeRoomVisualFrame[];
  mediaBridge: SharedLiveRoomMediaBridgeProjection;
  debug: HelixSharedRealtimeRoomDebug | null;
  nowMs?: number;
}): SharedLiveRoomDebugArtifact => {
  const nowMs = input.nowMs ?? Date.now();
  const {
    latest_shared_transcript: latestTranscript,
    ...mediaBridge
  } = input.mediaBridge;
  return {
    schema: "helix.shared_realtime_room.debug_artifact.v1",
    generated_at: new Date(nowMs).toISOString(),
    room_id: input.room.room_id,
    runtime: {
      state: input.room.runtime.state,
      topology: input.room.runtime.topology,
      transport_owner: input.room.runtime.transport_owner,
      realtime_session_ref_hash:
        input.room.runtime.realtime_session_ref_hash,
      active_speaker_participant_id:
        input.room.runtime.active_speaker_participant_id,
    },
    acceptance: buildSharedLiveRoomAcceptanceProjection({
      room: input.room,
      frames: input.frames,
      mediaBridge: input.mediaBridge,
      nowMs,
    }),
    participants: input.room.participants.map((participant) => ({
      participant_id: participant.participant_id,
      role: participant.role,
      presence: participant.presence,
      context_status: input.room.participant_context_cards.find(
        (card) => card.participant_id === participant.participant_id,
      )?.context_status ?? null,
    })),
    visual_frames: input.frames.slice(-24).map((frame) => ({
      frame_ref: frame.frame_ref,
      participant_id: frame.participant_id,
      source_id: frame.source_id,
      source_surface: frame.source_surface,
      captured_at: frame.captured_at,
      sequence: frame.sequence,
      provider_delivery: frame.provider_delivery,
    })),
    media_bridge: {
      ...mediaBridge,
      latest_shared_transcript_observed_at_ms:
        latestTranscript?.observed_at_ms ?? null,
    },
    server_debug_observed: input.debug !== null,
    single_user_vision_proof:
      readHelixAskLiveRuntimeClientDebugSnapshot()?.visual_input_proof ?? null,
    selected_answer_turn_id: null,
    selected_answer_binding:
      "ambient_room_evidence_not_bound_to_selected_answer",
    answer_authority: false,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
  };
};

export const recordSharedLiveRoomDebugArtifact = (
  artifact: SharedLiveRoomDebugArtifact | null,
): void => {
  currentArtifact = artifact;
};

export const readSharedLiveRoomDebugArtifact =
  (): SharedLiveRoomDebugArtifact | null =>
    currentArtifact ? structuredClone(currentArtifact) : null;

export const mergeSharedLiveRoomDebugIntoExport = (
  payload: string,
): string => {
  const artifact = readSharedLiveRoomDebugArtifact();
  if (!artifact) return payload;
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    const selectedAnswerTurnId =
      typeof parsed.active_turn_id === "string"
        ? parsed.active_turn_id
        : null;
    return JSON.stringify({
      ...parsed,
      shared_live_room_debug: {
        ...artifact,
        single_user_vision_proof:
          readHelixAskLiveRuntimeClientDebugSnapshot()?.visual_input_proof ??
          artifact.single_user_vision_proof,
        selected_answer_turn_id: selectedAnswerTurnId,
      },
    }, null, 2);
  } catch {
    return payload;
  }
};
