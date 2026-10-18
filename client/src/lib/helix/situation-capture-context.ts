import {
  HELIX_SITUATION_CAPTURE_CONTEXT_SCHEMA,
  type SituationCaptureClassifiedContext,
  type SituationCaptureContextAppHint,
  type SituationCaptureContextSourceKind,
  type SituationCaptureSourceSnapshot,
  type SituationRoomCaptureContext,
} from "@shared/helix-situation-capture-context";
import type { SituationRoomStoreState, SituationRoomSource } from "@/store/useSituationRoomStore";

const hasPermissionError = (source: SituationRoomSource): boolean =>
  /\b(?:permission|denied|not\s+allowed|grant|capture\s+permission|microphone\s+permission)\b/i.test(
    `${source.status} ${source.last_error ?? ""}`,
  );

const normalizeCaptureStatus = (source: SituationRoomSource): SituationCaptureSourceSnapshot["status"] => {
  if (source.status === "active" || source.status === "transcribing") return "active";
  if (source.status === "requesting") return "requesting";
  if (source.status === "stopped" || source.status === "paused" || source.status === "stopping") return "stopped";
  if (source.status === "error" && hasPermissionError(source)) return "permission_denied";
  if (source.status === "error") return "error";
  return "stopped";
};

const classifyAppHint = (label: string): SituationCaptureContextAppHint => {
  if (/\bdiscord\b/i.test(label)) return "discord";
  if (/\bzoom\b/i.test(label)) return "zoom";
  if (/\bteams\b/i.test(label)) return "teams";
  if (/\b(?:google\s+meet|meet\.google)\b/i.test(label)) return "google_meet";
  if (/\b(?:browser|tab|chrome|edge|firefox)\b/i.test(label)) return "browser";
  return "unknown";
};

const classifySourceKind = (
  source: SituationRoomSource,
  appHint: SituationCaptureContextAppHint,
): SituationCaptureContextSourceKind => {
  const label = source.label ?? "";
  if (appHint === "discord") return "discord_call";
  if (source.capture_source === "mic") return "mic_room";
  if (source.capture_source === "display_tab_audio" && appHint === "browser") return "browser_call";
  if (source.capture_source.startsWith("display_")) return "display_audio";
  if (/\b(?:call|voice\s+chat|meeting)\b/i.test(label)) return "voice_chat";
  return "unknown";
};

const classifySource = (source: SituationRoomSource): SituationCaptureClassifiedContext => {
  const label = source.label ?? "";
  const appHint = classifyAppHint(label);
  const sourceKind = classifySourceKind(source, appHint);
  return {
    source_kind: sourceKind,
    app_hint: appHint,
    contains_remote_participant_audio:
      sourceKind === "discord_call" || sourceKind === "browser_call" || sourceKind === "meeting" || sourceKind === "voice_chat"
        ? "unknown"
        : source.capture_source === "mic"
          ? false
          : "unknown",
    contains_user_audio: source.capture_source === "mic" ? true : "unknown",
    transcript_available: Boolean(source.transcript_preview?.trim()),
    transcript_attached_to_helix: false,
  };
};

export const buildSituationRoomCaptureContext = (
  state: Pick<SituationRoomStoreState, "active_room_id" | "rooms" | "room_order" | "sources">,
): SituationRoomCaptureContext => {
  const roomId = state.active_room_id ?? state.room_order[0] ?? null;
  const room = roomId ? state.rooms[roomId] ?? null : null;
  const sourceIds: string[] = room ? room.source_ids : Object.keys(state.sources);
  const sources = sourceIds
    .map((sourceId: string) => state.sources[sourceId])
    .filter((source: SituationRoomSource | undefined): source is SituationRoomSource => Boolean(source))
    .map((source): SituationCaptureSourceSnapshot => {
      const status = normalizeCaptureStatus(source);
      return {
        source_id: source.source_id,
        capture_source: source.capture_source,
        label: source.label,
        status,
        capture_session_id: source.capture_session_id ?? null,
        classified_context: classifySource(source),
        permission_state: {
          capture_granted: status === "active",
          transcript_context_granted: false,
          voice_output_granted: false,
        },
      };
    });
  return {
    schema: HELIX_SITUATION_CAPTURE_CONTEXT_SCHEMA,
    room_id: roomId,
    source_ids: sources.map((source: SituationCaptureSourceSnapshot) => source.source_id),
    sources,
    context_policy: "explicit_attachment_only",
    command_lane_enabled: false,
  };
};
