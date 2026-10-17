export type HelixSituationSource =
  | "mic"
  | "display_tab_audio"
  | "display_window_audio"
  | "display_screen_audio"
  | "system_loopback"
  | "minecraft_server"
  | "discord_browser"
  | "screen_share"
  | "helix_ask";

export type HelixSituationEventType =
  | "voice_transcript"
  | "source_started"
  | "source_stopped"
  | "source_error"
  | "game_event"
  | "player_state"
  | "screen_observation"
  | "chat_message"
  | "objective_update"
  | "tool_result"
  | "approval_request";

export type HelixSituationClassification = "info" | "warn" | "critical" | "action";

export type HelixSituationEvent = {
  id: string;
  room_id: string;
  mission_id?: string;
  thread_id?: string;
  source: HelixSituationSource;
  event_type: HelixSituationEventType;
  actor?: string;
  text?: string;
  classification?: HelixSituationClassification;
  evidence_refs: string[];
  chunk_index?: number;
  capture_session_id?: string;
  ts: string;
  meta?: Record<string, unknown>;
};

export type SituationSourceState = {
  id: string;
  source: HelixSituationSource;
  label: string;
  status: "active" | "idle" | "error";
  lastEventTs?: string;
  lastError?: string;
  capture_session_id?: string;
  chunk_count: number;
};

export type TranscriptSegment = {
  id: string;
  room_id: string;
  source: HelixSituationSource;
  text: string;
  ts: string;
  chunk_index?: number;
  capture_session_id?: string;
  confidence?: number | null;
  language?: string | null;
};

export type SituationRoomState = {
  room_id: string;
  sources: Record<string, SituationSourceState>;
  recentTranscript: TranscriptSegment[];
  recentEvents: HelixSituationEvent[];
};

export const createSituationRoomState = (roomId: string): SituationRoomState => ({
  room_id: roomId,
  sources: {},
  recentTranscript: [],
  recentEvents: [],
});

export const sourceLabelForSituationSource = (source: HelixSituationSource): string => {
  switch (source) {
    case "display_tab_audio":
      return "Browser tab audio";
    case "display_window_audio":
      return "Window audio";
    case "display_screen_audio":
      return "Screen audio";
    case "system_loopback":
      return "System audio";
    case "minecraft_server":
      return "Minecraft server";
    case "discord_browser":
      return "Discord browser";
    case "screen_share":
      return "Screen share";
    case "helix_ask":
      return "Helix Ask";
    case "mic":
    default:
      return "Mic";
  }
};

const sourceStateKey = (event: HelixSituationEvent): string =>
  event.capture_session_id?.trim() || `${event.room_id}:${event.source}`;

const numberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export function reduceSituationRoomEvent(
  state: SituationRoomState,
  event: HelixSituationEvent,
  limits: { maxEvents?: number; maxTranscript?: number } = {},
): SituationRoomState {
  const maxEvents = limits.maxEvents ?? 80;
  const maxTranscript = limits.maxTranscript ?? 80;
  const key = sourceStateKey(event);
  const previousSource = state.sources[key];
  const nextSource: SituationSourceState = {
    id: key,
    source: event.source,
    label: sourceLabelForSituationSource(event.source),
    status: "active",
    lastEventTs: event.ts,
    capture_session_id: event.capture_session_id ?? previousSource?.capture_session_id,
    chunk_count:
      event.event_type === "voice_transcript"
        ? (previousSource?.chunk_count ?? 0) + 1
        : previousSource?.chunk_count ?? 0,
  };

  const transcriptText = event.event_type === "voice_transcript" ? event.text?.trim() ?? "" : "";
  const transcriptSegment: TranscriptSegment | null = transcriptText
    ? {
        id: event.id,
        room_id: event.room_id,
        source: event.source,
        text: transcriptText,
        ts: event.ts,
        chunk_index: event.chunk_index,
        capture_session_id: event.capture_session_id,
        confidence: numberOrNull(event.meta?.confidence),
        language: stringOrNull(event.meta?.language),
      }
    : null;

  return {
    room_id: state.room_id || event.room_id,
    sources: {
      ...state.sources,
      [key]: nextSource,
    },
    recentEvents: [...state.recentEvents, event].slice(-maxEvents),
    recentTranscript: transcriptSegment
      ? [...state.recentTranscript, transcriptSegment].slice(-maxTranscript)
      : state.recentTranscript,
  };
}
