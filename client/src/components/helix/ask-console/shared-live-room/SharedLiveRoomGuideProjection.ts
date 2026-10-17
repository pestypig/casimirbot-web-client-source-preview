import { useSyncExternalStore } from "react";
import type {
  HelixSharedRealtimeRoom,
  HelixSharedRealtimeRoomRuntimeState,
  HelixSharedRealtimeRoomStatus,
} from "@shared/helix-shared-realtime-room";
import type { SharedLiveRoomMediaBridgeProjection } from
  "./media-bridge/RoomMediaBridgeContracts";

export const HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT =
  "helix-shared-live-room-open-dialog" as const;

export type SharedLiveRoomGuideMicrophoneState =
  | "unavailable"
  | "consent_required"
  | "ready"
  | "active"
  | "degraded"
  | "failed";

/**
 * Redacted, read-only metadata for the Casimir Guide. It deliberately omits
 * room/participant/source IDs, session hashes, result text, evidence refs,
 * credentials, endpoints, and every mutation callback.
 */
export type SharedLiveRoomGuideProjection = {
  controller_available: boolean;
  state: "loading" | "none" | "ready" | "stale" | "failed";
  room: null | {
    title: string;
    status: HelixSharedRealtimeRoomStatus;
    participant_count: number;
    present_count: number;
    required_participant_count: number;
    readiness_ready: boolean;
    updated_at: string;
  };
  floor: {
    active: boolean;
    holder_display_name: string | null;
  };
  microphone: {
    state: SharedLiveRoomGuideMicrophoneState;
    to_room_consented: boolean;
    to_model_consented: boolean;
  };
  gpt: {
    attached: boolean;
    runtime_state: HelixSharedRealtimeRoomRuntimeState | null;
    model: string | null;
  };
  sources: {
    count: number;
    fresh_count: number;
    stale_count: number;
    latest_observed_at: string | null;
  };
  public_results: {
    count: number;
    latest_published_at: string | null;
    latest_artifact_kind: string | null;
  };
};

export const EMPTY_SHARED_LIVE_ROOM_GUIDE_PROJECTION:
SharedLiveRoomGuideProjection = {
  controller_available: false,
  state: "none",
  room: null,
  floor: { active: false, holder_display_name: null },
  microphone: {
    state: "unavailable",
    to_room_consented: false,
    to_model_consented: false,
  },
  gpt: { attached: false, runtime_state: null, model: null },
  sources: {
    count: 0,
    fresh_count: 0,
    stale_count: 0,
    latest_observed_at: null,
  },
  public_results: {
    count: 0,
    latest_published_at: null,
    latest_artifact_kind: null,
  },
};

const latestIso = (values: Array<string | null | undefined>): string | null => {
  let latest: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed > latestMs) {
      latest = value;
      latestMs = parsed;
    }
  }
  return latest;
};

const resolveMicrophoneState = (input: {
  room: HelixSharedRealtimeRoom;
  mediaBridge: SharedLiveRoomMediaBridgeProjection;
}): SharedLiveRoomGuideMicrophoneState => {
  const self = input.room.participants.find((participant) =>
    participant.participant_id === input.room.self_participant_id);
  if (!self) return "unavailable";
  if (!self.consent.microphone_to_room) return "consent_required";
  if (input.mediaBridge.state === "error") return "failed";
  if (input.mediaBridge.state === "degraded") return "degraded";
  if (
    input.mediaBridge.peer_audio_connected ||
    input.mediaBridge.provider_input_enabled
  ) return "active";
  return "ready";
};

export const buildSharedLiveRoomGuideProjection = (input: {
  room: HelixSharedRealtimeRoom | null;
  mediaBridge: SharedLiveRoomMediaBridgeProjection;
  loading: boolean;
  failed: boolean;
}): SharedLiveRoomGuideProjection => {
  const room = input.room;
  if (!room) {
    return {
      ...EMPTY_SHARED_LIVE_ROOM_GUIDE_PROJECTION,
      controller_available: true,
      state: input.loading ? "loading" : input.failed ? "failed" : "none",
    };
  }

  const self = room.participants.find((participant) =>
    participant.participant_id === room.self_participant_id) ?? null;
  const floorHolder = room.participants.find((participant) =>
    participant.participant_id === room.runtime.active_speaker_participant_id) ?? null;
  const contextCards = room.participant_context_cards ?? [];
  const publicResults = room.public_terminal_results ?? [];
  const visualSources = contextCards.flatMap((card) => card.visual_sources ?? []);
  const latestResult = [...publicResults]
    .sort((left, right) => Date.parse(right.published_at) - Date.parse(left.published_at))[0] ?? null;

  return {
    controller_available: true,
    state: input.failed ? "stale" : "ready",
    room: {
      title: room.title,
      status: room.status,
      participant_count: room.participants.filter((participant) => participant.presence !== "left").length,
      present_count: room.participants.filter((participant) => participant.presence === "present").length,
      required_participant_count:
        room.readiness?.required_participant_count ?? room.max_participants ?? 2,
      readiness_ready: room.readiness?.ready === true,
      updated_at: room.updated_at ?? room.runtime.updated_at ?? "",
    },
    floor: {
      active: Boolean(room.runtime.active_speaker_participant_id),
      holder_display_name: floorHolder?.display_name ?? null,
    },
    microphone: {
      state: resolveMicrophoneState({ room, mediaBridge: input.mediaBridge }),
      to_room_consented: Boolean(self?.consent.microphone_to_room),
      to_model_consented: Boolean(self?.consent.microphone_to_model),
    },
    gpt: {
      attached: Boolean(
        room.runtime.realtime_session_ref_hash &&
        (room.runtime.state === "host_transport_active" || room.runtime.state === "bridge_active"),
      ),
      runtime_state: room.runtime.state,
      model: room.runtime.model,
    },
    sources: {
      count: visualSources.length,
      fresh_count: visualSources.filter((source) => source.freshness === "fresh").length,
      stale_count: visualSources.filter((source) => source.freshness === "stale").length,
      latest_observed_at: latestIso(contextCards.map((card) => card.latest_observed_at)),
    },
    public_results: {
      count: publicResults.length,
      latest_published_at: latestResult?.published_at ?? null,
      latest_artifact_kind: latestResult?.terminal_artifact_kind ?? null,
    },
  };
};

let currentProjection = EMPTY_SHARED_LIVE_ROOM_GUIDE_PROJECTION;
const listeners = new Set<() => void>();

export const readSharedLiveRoomGuideProjection = (): SharedLiveRoomGuideProjection =>
  currentProjection;

export const recordSharedLiveRoomGuideProjection = (
  projection: SharedLiveRoomGuideProjection,
): void => {
  currentProjection = projection;
  listeners.forEach((listener) => listener());
};

export const resetSharedLiveRoomGuideProjection = (): void =>
  recordSharedLiveRoomGuideProjection(EMPTY_SHARED_LIVE_ROOM_GUIDE_PROJECTION);

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const subscribeDisabled = (): (() => void) => () => undefined;

export const useSharedLiveRoomGuideProjection = (
  enabled = true,
): SharedLiveRoomGuideProjection =>
  useSyncExternalStore(
    enabled ? subscribe : subscribeDisabled,
    readSharedLiveRoomGuideProjection,
    () => EMPTY_SHARED_LIVE_ROOM_GUIDE_PROJECTION,
  );

export const requestOpenSharedLiveRoomDialog = (): void => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT));
};
