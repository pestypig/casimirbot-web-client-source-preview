import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  startDisplayAudioSituationSession,
  type DisplayAudioTranscriptChunk,
  type DisplayAudioSituationSession,
} from "@/lib/helix/display-audio-capture";
import {
  startMicAudioSituationSession,
  type MicAudioSituationSession,
} from "@/lib/helix/mic-audio-situation-capture";
import {
  type HelixSituationClassification,
  type HelixSituationEvent,
  type HelixSituationSource,
  sourceLabelForSituationSource,
} from "@/lib/helix/situation-room";
import { emitHelixAskLiveEvent } from "@/lib/helix/liveEventsBus";
import { HELIX_ASK_CONTEXT_ID } from "@/lib/helix/voice-surface-contract";
import { pushWorkstationDebugEvent } from "@/lib/helix/workstation-debug";
import {
  useWorkstationNotesStore,
  type WorkstationNote,
  type WorkstationNoteCitation,
  type WorkstationNoteSnippet,
} from "@/store/useWorkstationNotesStore";

const SITUATION_ROOM_STORAGE_KEY = "situation-room-sources:v1";

export type SituationSourceStatus =
  | "idle"
  | "requesting"
  | "active"
  | "transcribing"
  | "paused"
  | "stopping"
  | "stopped"
  | "error";

export type SituationRoomStatus = "live" | "paused" | "closed" | "saved";

export type DisplayAudioCaptureSource = Extract<
  HelixSituationSource,
  "display_tab_audio" | "display_window_audio" | "display_screen_audio"
>;

export type SituationRoom = {
  room_id: string;
  title: string;
  status: SituationRoomStatus;
  source_ids: string[];
  event_ids: string[];
  created_at: string;
  updated_at: string;
  saved_note_id?: string;
};

export type SituationRoomSource = {
  source_id: string;
  room_id: string;
  label: string;
  capture_source:
    | "mic"
    | "display_tab_audio"
    | "display_window_audio"
    | "display_screen_audio"
    | "system_loopback";
  capture_session_id: string;
  status: SituationSourceStatus;
  chunk_index: number;
  last_error?: string;
  started_at?: string;
  stopped_at?: string;
  transcript_preview?: string;
};

type AttachDisplayAudioSourceOptions = {
  stream?: MediaStream | null;
  stopStreamOnStop?: boolean;
  chunkMs?: number;
  onTranscriptChunk?: (chunk: DisplayAudioTranscriptChunk) => void | Promise<void>;
};

export type SituationRoomStoredEvent = HelixSituationEvent & {
  event_id: string;
  source_id?: string;
};

export type SituationRoomStoreState = {
  rooms: Record<string, SituationRoom>;
  room_order: string[];
  active_room_id?: string;
  sources: Record<string, SituationRoomSource>;
  events: Record<string, SituationRoomStoredEvent>;
  createRoom: (title?: string) => SituationRoom;
  renameRoom: (roomId: string, title: string) => void;
  setActiveRoom: (roomId: string) => void;
  attachDisplayAudioSource: (roomId: string, label?: string, options?: AttachDisplayAudioSourceOptions) => Promise<SituationRoomSource | null>;
  attachMicAudioSource: (roomId: string, label?: string) => Promise<SituationRoomSource | null>;
  stopSource: (sourceId: string) => void;
  stopRoom: (roomId: string) => void;
  appendSituationEvent: (event: HelixSituationEvent, sourceId?: string) => SituationRoomStoredEvent;
  saveRoomAsNote: (roomId: string) => WorkstationNote | null;
  attachRoomToHelixAsk: (roomId: string, sourceId?: string) => void;
  reset: () => void;
};

const activeDisplaySessions = new Map<string, DisplayAudioSituationSession>();
const activeMicSessions = new Map<string, MicAudioSituationSession>();

const createId = (prefix: string): string => {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}:${Date.now()}:${random}`;
};

const nowIso = (): string => new Date().toISOString();

const normalizeTitle = (title: string | undefined, fallback: string): string => {
  const trimmed = title?.trim();
  return trimmed || fallback;
};

const eventSourceId = (event: HelixSituationEvent, explicitSourceId?: string): string | undefined =>
  explicitSourceId?.trim() || undefined;

const toStoredEvent = (
  event: HelixSituationEvent,
  sourceId?: string,
): SituationRoomStoredEvent => ({
  ...event,
  event_id: event.id,
  source_id: eventSourceId(event, sourceId),
});

const compareStoredEvents = (a: SituationRoomStoredEvent, b: SituationRoomStoredEvent): number => {
  if (
    a.capture_session_id &&
    a.capture_session_id === b.capture_session_id &&
    typeof a.chunk_index === "number" &&
    typeof b.chunk_index === "number"
  ) {
    return a.chunk_index - b.chunk_index;
  }
  const aTs = Date.parse(a.ts);
  const bTs = Date.parse(b.ts);
  return (Number.isFinite(aTs) ? aTs : 0) - (Number.isFinite(bTs) ? bTs : 0);
};

export function selectSituationRoomEvents(state: Pick<SituationRoomStoreState, "rooms" | "events">, roomId: string) {
  const room = state.rooms[roomId];
  if (!room) return [];
  return room.event_ids
    .map((eventId: string) => state.events[eventId])
    .filter((event): event is SituationRoomStoredEvent => Boolean(event))
    .sort(compareStoredEvents);
}

export function selectSituationRoomTranscript(
  state: Pick<SituationRoomStoreState, "rooms" | "events">,
  roomId: string,
) {
  return selectSituationRoomEvents(state, roomId).filter(
    (event: SituationRoomStoredEvent) => event.event_type === "voice_transcript" && Boolean(event.text?.trim()),
  );
}

const makeLifecycleEvent = (args: {
  roomId: string;
  source: SituationRoomSource;
  eventType: "source_started" | "source_stopped" | "source_error";
  text: string;
  classification?: HelixSituationClassification;
  meta?: Record<string, unknown>;
}): HelixSituationEvent => ({
  id: `situation:${args.roomId}:${args.source.source_id}:${args.eventType}:${Date.now()}`,
  room_id: args.roomId,
  source: args.source.capture_source,
  event_type: args.eventType,
  text: args.text,
  classification: args.classification ?? (args.eventType === "source_error" ? "warn" : "info"),
  evidence_refs: [`situation-room:${args.roomId}:${args.source.source_id}:${args.eventType}`],
  capture_session_id: args.source.capture_session_id,
  ts: nowIso(),
  meta: {
    source_id: args.source.source_id,
    label: args.source.label,
    ...args.meta,
  },
});

const upsertRoomEventId = (room: SituationRoom, eventId: string, timestamp: string): SituationRoom => ({
  ...room,
  event_ids: [...room.event_ids.filter((id: string) => id !== eventId), eventId],
  updated_at: timestamp,
});

function buildRoomNote(args: {
  room: SituationRoom;
  sources: SituationRoomSource[];
  events: SituationRoomStoredEvent[];
}): {
  body: string;
  citations: WorkstationNoteCitation[];
  snippets: WorkstationNoteSnippet[];
} {
  const citations: WorkstationNoteCitation[] = [];
  const snippets: WorkstationNoteSnippet[] = [];
  const lines: string[] = [];
  let offset = 0;

  const appendLine = (line = ""): { start: number; end: number } => {
    const start = offset;
    lines.push(line);
    offset += line.length + 1;
    return { start, end: start + line.length };
  };

  appendLine(`# ${args.room.title}`);
  appendLine();
  appendLine("## Sources");
  if (args.sources.length === 0) {
    appendLine("- No sources attached.");
  } else {
    for (const source of args.sources) {
      appendLine(
        `- ${source.label} (${source.capture_source}), ${source.status}, chunks: ${source.chunk_index}`,
      );
    }
  }
  appendLine();
  appendLine("## Transcript");

  const transcriptEvents = args.events.filter(
    (event: SituationRoomStoredEvent) => event.event_type === "voice_transcript" && Boolean(event.text?.trim()),
  );
  if (transcriptEvents.length === 0) {
    appendLine("- No transcript chunks captured.");
  } else {
    for (const event of transcriptEvents) {
      const source = args.sources.find((entry: SituationRoomSource) => entry.source_id === event.source_id);
      const label = source?.label ?? sourceLabelForSituationSource(event.source);
      const chunkIndex = typeof event.chunk_index === "number" ? event.chunk_index : 0;
      const chunkLabel = chunkIndex.toString().padStart(4, "0");
      const citationId = `cite_${event.source_id ?? "source"}_${chunkLabel}`;
      const text = event.text?.trim() ?? "";
      const position = appendLine(`[${label}, chunk ${chunkIndex}] ${text}`);
      const path = `situation-room://${encodeURIComponent(args.room.room_id)}/source/${encodeURIComponent(
        event.source_id ?? event.capture_session_id ?? event.source,
      )}/chunk/${chunkLabel}`;
      citations.push({
        id: citationId,
        path,
        heading: `${label} transcript chunk ${chunkIndex}`,
        start_offset: position.start,
        end_offset: position.end,
      });
      snippets.push({
        id: `snippet_${event.source_id ?? "source"}_${chunkLabel}`,
        citation_id: citationId,
        excerpt: text,
      });
    }
  }

  appendLine();
  appendLine("## Room Events");
  for (const event of args.events) {
    const source = args.sources.find((entry: SituationRoomSource) => entry.source_id === event.source_id);
    const label = source?.label ?? sourceLabelForSituationSource(event.source);
    appendLine(`- ${event.ts} ${label}: ${event.event_type}${event.text ? ` - ${event.text}` : ""}`);
  }

  return {
    body: lines.join("\n"),
    citations,
    snippets,
  };
}

export const useSituationRoomStore = create<SituationRoomStoreState>()(
  persist(
    (set, get) => ({
      rooms: {},
      room_order: [],
      active_room_id: undefined,
      sources: {},
      events: {},
      createRoom: (title) => {
        const createdAt = nowIso();
        const room: SituationRoom = {
          room_id: createId("room"),
          title: normalizeTitle(title, "Untitled Situation Room"),
          status: "live",
          source_ids: [],
          event_ids: [],
          created_at: createdAt,
          updated_at: createdAt,
        };
        set((state: SituationRoomStoreState) => ({
          rooms: { ...state.rooms, [room.room_id]: room },
          room_order: [room.room_id, ...state.room_order.filter((entry: string) => entry !== room.room_id)],
          active_room_id: room.room_id,
        }));
        return room;
      },
      renameRoom: (roomId, title) =>
        set((state: SituationRoomStoreState) => {
          const room = state.rooms[roomId];
          if (!room) return state;
          return {
            rooms: {
              ...state.rooms,
              [roomId]: {
                ...room,
                title: normalizeTitle(title, room.title),
                updated_at: nowIso(),
              },
            },
          };
        }),
      setActiveRoom: (roomId) =>
        set((state: SituationRoomStoreState) => ({
          active_room_id: state.rooms[roomId] ? roomId : state.active_room_id,
        })),
      attachDisplayAudioSource: async (roomId, label, options) => {
        const room = get().rooms[roomId];
        if (!room) return null;

        const timestamp = nowIso();
        const sourceId = createId("src");
        const captureSessionId = createId("cap");
        const source: SituationRoomSource = {
          source_id: sourceId,
          room_id: roomId,
          label: normalizeTitle(label, "Display audio source"),
          capture_source: "display_tab_audio",
          capture_session_id: captureSessionId,
          status: "requesting",
          chunk_index: 0,
          started_at: timestamp,
        };

        set((state: SituationRoomStoreState) => ({
          sources: { ...state.sources, [sourceId]: source },
          rooms: {
            ...state.rooms,
            [roomId]: {
              ...room,
              status: "live",
              source_ids: [...room.source_ids.filter((entry: string) => entry !== sourceId), sourceId],
              updated_at: timestamp,
            },
          },
          active_room_id: roomId,
        }));

        try {
          const session = await startDisplayAudioSituationSession({
            roomId,
            captureSessionId,
            stream: options?.stream ?? null,
            stopStreamOnStop: options?.stopStreamOnStop,
            chunkMs: options?.chunkMs,
            onEvent: (event: HelixSituationEvent) => {
              get().appendSituationEvent(event, sourceId);
            },
            onTranscriptChunk: options?.onTranscriptChunk,
            onError: (error: Error) => {
              const message = error.message || String(error);
              set((state: SituationRoomStoreState) => {
                const current = state.sources[sourceId];
                if (!current) return state;
                return {
                  sources: {
                    ...state.sources,
                    [sourceId]: {
                      ...current,
                      status: "error",
                      last_error: message,
                    },
                  },
                };
              });
              const current = get().sources[sourceId];
              if (current) {
                get().appendSituationEvent(
                  makeLifecycleEvent({
                    roomId,
                    source: current,
                    eventType: "source_error",
                    text: message,
                    meta: { reason: "transcription_error" },
                  }),
                  sourceId,
                );
              }
            },
            onStop: (reason: "manual" | "track_ended") => {
              activeDisplaySessions.delete(sourceId);
              const stoppedAt = nowIso();
              set((state: SituationRoomStoreState) => {
                const current = state.sources[sourceId];
                if (!current) return state;
                return {
                  sources: {
                    ...state.sources,
                    [sourceId]: {
                      ...current,
                      status: "stopped",
                      stopped_at: stoppedAt,
                    },
                  },
                };
              });
              const current = get().sources[sourceId];
              if (current) {
                get().appendSituationEvent(
                  makeLifecycleEvent({
                    roomId,
                    source: current,
                    eventType: "source_stopped",
                    text: `${current.label} stopped.`,
                    meta: { reason },
                  }),
                  sourceId,
                );
              }
            },
          });

          activeDisplaySessions.set(sourceId, session);
          const activeSource: SituationRoomSource = {
            ...source,
            label: normalizeTitle(label, sourceLabelForSituationSource(session.source)),
            capture_source: session.source as DisplayAudioCaptureSource,
            capture_session_id: session.captureSessionId,
            status: "active",
          };
          set((state: SituationRoomStoreState) => ({
            sources: {
              ...state.sources,
              [sourceId]: activeSource,
            },
          }));
          get().appendSituationEvent(
            makeLifecycleEvent({
              roomId,
              source: activeSource,
              eventType: "source_started",
              text: `${activeSource.label} attached.`,
            }),
            sourceId,
          );
          return activeSource;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const failedAt = nowIso();
          set((state: SituationRoomStoreState) => {
            const current = state.sources[sourceId];
            if (!current) return state;
            return {
              sources: {
                ...state.sources,
                [sourceId]: {
                  ...current,
                  status: "error",
                  stopped_at: failedAt,
                  last_error: message,
                },
              },
            };
          });
          const current = get().sources[sourceId];
          if (current) {
            get().appendSituationEvent(
              makeLifecycleEvent({
                roomId,
                source: current,
                eventType: "source_error",
                text: message,
                meta: { reason: "capture_start_failed" },
              }),
              sourceId,
            );
          }
          return get().sources[sourceId] ?? null;
        }
      },
      attachMicAudioSource: async (roomId, label) => {
        const room = get().rooms[roomId];
        if (!room) return null;

        const timestamp = nowIso();
        const sourceId = createId("src");
        const captureSessionId = createId("cap");
        const source: SituationRoomSource = {
          source_id: sourceId,
          room_id: roomId,
          label: normalizeTitle(label, "Microphone source"),
          capture_source: "mic",
          capture_session_id: captureSessionId,
          status: "requesting",
          chunk_index: 0,
          started_at: timestamp,
        };

        set((state: SituationRoomStoreState) => ({
          sources: { ...state.sources, [sourceId]: source },
          rooms: {
            ...state.rooms,
            [roomId]: {
              ...room,
              status: "live",
              source_ids: [...room.source_ids.filter((entry: string) => entry !== sourceId), sourceId],
              updated_at: timestamp,
            },
          },
          active_room_id: roomId,
        }));

        try {
          const session = await startMicAudioSituationSession({
            roomId,
            captureSessionId,
            onEvent: (event: HelixSituationEvent) => get().appendSituationEvent(event, sourceId),
            onError: (error: Error) => {
              const message = error.message || String(error);
              set((state: SituationRoomStoreState) => {
                const current = state.sources[sourceId];
                if (!current) return state;
                return {
                  sources: {
                    ...state.sources,
                    [sourceId]: {
                      ...current,
                      status: "error",
                      last_error: message,
                    },
                  },
                };
              });
            },
            onStop: (reason: "manual" | "track_ended") => {
              activeMicSessions.delete(sourceId);
              const stoppedAt = nowIso();
              set((state: SituationRoomStoreState) => {
                const current = state.sources[sourceId];
                if (!current) return state;
                return {
                  sources: {
                    ...state.sources,
                    [sourceId]: {
                      ...current,
                      status: "stopped",
                      stopped_at: stoppedAt,
                    },
                  },
                };
              });
              const current = get().sources[sourceId];
              if (current) {
                get().appendSituationEvent(
                  makeLifecycleEvent({
                    roomId,
                    source: current,
                    eventType: "source_stopped",
                    text: `${current.label} stopped.`,
                    meta: { reason },
                  }),
                  sourceId,
                );
              }
            },
          });
          if (!session || typeof session.stop !== "function") {
            throw new Error("Microphone capture session did not start.");
          }
          activeMicSessions.set(sourceId, session);
          const activeSource: SituationRoomSource = {
            ...source,
            capture_session_id: session.captureSessionId,
            status: "active",
          };
          set((state: SituationRoomStoreState) => ({
            sources: { ...state.sources, [sourceId]: activeSource },
          }));
          get().appendSituationEvent(
            makeLifecycleEvent({
              roomId,
              source: activeSource,
              eventType: "source_started",
              text: `${activeSource.label} attached.`,
            }),
            sourceId,
          );
          return activeSource;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const failedAt = nowIso();
          set((state: SituationRoomStoreState) => {
            const current = state.sources[sourceId];
            if (!current) return state;
            return {
              sources: {
                ...state.sources,
                [sourceId]: {
                  ...current,
                  status: "error",
                  stopped_at: failedAt,
                  last_error: message,
                },
              },
            };
          });
          const current = get().sources[sourceId];
          if (current) {
            get().appendSituationEvent(
              makeLifecycleEvent({
                roomId,
                source: current,
                eventType: "source_error",
                text: message,
                meta: { reason: "mic_capture_start_failed" },
              }),
              sourceId,
            );
          }
          return get().sources[sourceId] ?? null;
        }
      },
      stopSource: (sourceId) => {
        const session = activeDisplaySessions.get(sourceId) ?? activeMicSessions.get(sourceId);
        set((state: SituationRoomStoreState) => {
          const current = state.sources[sourceId];
          if (!current) return state;
          return {
            sources: {
              ...state.sources,
              [sourceId]: {
                ...current,
                status: "stopping",
              },
            },
          };
        });
        if (session) {
          activeDisplaySessions.delete(sourceId);
          activeMicSessions.delete(sourceId);
          session.stop();
          return;
        }
        const current = get().sources[sourceId];
        if (!current) return;
        const stoppedAt = nowIso();
        set((state: SituationRoomStoreState) => ({
          sources: {
            ...state.sources,
            [sourceId]: {
              ...current,
              status: "stopped",
              stopped_at: current.stopped_at ?? stoppedAt,
            },
          },
        }));
        get().appendSituationEvent(
          makeLifecycleEvent({
            roomId: current.room_id,
            source: current,
            eventType: "source_stopped",
            text: `${current.label} stopped.`,
            meta: { reason: "manual" },
          }),
          sourceId,
        );
      },
      stopRoom: (roomId) => {
        const room = get().rooms[roomId];
        if (!room) return;
        for (const sourceId of room.source_ids) {
          get().stopSource(sourceId);
        }
        set((state: SituationRoomStoreState) => {
          const current = state.rooms[roomId];
          if (!current) return state;
          return {
            rooms: {
              ...state.rooms,
              [roomId]: {
                ...current,
                status: "closed",
                updated_at: nowIso(),
              },
            },
          };
        });
      },
      appendSituationEvent: (event: HelixSituationEvent, sourceId?: string) => {
        const stored = toStoredEvent(event, sourceId);
        const timestamp = nowIso();
        set((state: SituationRoomStoreState) => {
          const room = state.rooms[event.room_id];
          const currentSource = sourceId ? state.sources[sourceId] : undefined;
          const nextSource =
            currentSource && event.event_type === "voice_transcript"
              ? {
                  ...currentSource,
                  status: "active" as SituationSourceStatus,
                  chunk_index:
                    typeof event.chunk_index === "number"
                      ? Math.max(currentSource.chunk_index, event.chunk_index + 1)
                      : currentSource.chunk_index + 1,
                  transcript_preview: event.text?.trim() || currentSource.transcript_preview,
                  last_error: undefined,
                }
              : currentSource;

          return {
            events: {
              ...state.events,
              [stored.event_id]: stored,
            },
            rooms: room
              ? {
                  ...state.rooms,
                  [event.room_id]: upsertRoomEventId(room, stored.event_id, timestamp),
                }
              : state.rooms,
            sources: nextSource
              ? {
                  ...state.sources,
                  [nextSource.source_id]: nextSource,
                }
              : state.sources,
          };
        });

        if (event.event_type === "voice_transcript" && event.text?.trim()) {
          pushWorkstationDebugEvent({
            channel: "situation_room",
            action: "voice_transcript",
            room_id: event.room_id,
            source_id: sourceId,
            detail: {
              event_id: stored.event_id,
              capture_session_id: event.capture_session_id,
              chunk_index: event.chunk_index,
              capture_source: event.source,
              source_language: event.meta?.source_language,
              translated: event.meta?.translated === true,
              text_chars: event.text.trim().length,
            },
          });
          emitHelixAskLiveEvent({
            contextId: HELIX_ASK_CONTEXT_ID.desktop,
            traceId: event.thread_id ?? event.room_id,
            entry: {
              id: `situation-room:${event.room_id}:${sourceId ?? event.capture_session_id ?? "source"}:${
                event.chunk_index ?? "event"
              }`,
              text: event.text.trim(),
              tool: "situation-room.audio",
              ts: event.ts,
              meta: {
                kind: "situation_room_voice_transcript",
                room_id: event.room_id,
                source_id: sourceId,
                capture_session_id: event.capture_session_id,
                chunk_index: event.chunk_index,
                capture_source: event.source,
                source_language: event.meta?.source_language,
                source_text: event.meta?.source_text,
                translated: event.meta?.translated === true,
                possible_tts_echo: event.meta?.possible_tts_echo === true,
              },
            },
          });
        }

        return stored;
      },
      saveRoomAsNote: (roomId) => {
        const state = get();
        const room = state.rooms[roomId];
        if (!room) return null;
        const sources = room.source_ids
          .map((sourceId: string) => state.sources[sourceId])
          .filter((source): source is SituationRoomSource => Boolean(source));
        const events = selectSituationRoomEvents(state, roomId);
        const noteParts = buildRoomNote({ room, sources, events });
        const noteId = `note:situation-room:${roomId}`;
        const note = useWorkstationNotesStore.getState().upsertWorkflowNote({
          id: noteId,
          title: room.title,
          topic: "situation-room",
          body: noteParts.body,
          citations: noteParts.citations,
          snippets: noteParts.snippets,
          trace_id: roomId,
        });
        set((currentState: SituationRoomStoreState) => {
          const current = currentState.rooms[roomId];
          if (!current) return currentState;
          return {
            rooms: {
              ...currentState.rooms,
              [roomId]: {
                ...current,
                status: "saved",
                saved_note_id: note.id,
                updated_at: nowIso(),
              },
            },
          };
        });
        return note;
      },
      attachRoomToHelixAsk: (roomId, sourceId) => {
        const state = get();
        const room = state.rooms[roomId];
        if (!room) return;
        const source = sourceId ? state.sources[sourceId] : undefined;
        const events = selectSituationRoomEvents(state, roomId);
        const transcript = selectSituationRoomTranscript(state, roomId);
        const title = source ? `${room.title} / ${source.label}` : room.title;
        emitHelixAskLiveEvent({
          contextId: HELIX_ASK_CONTEXT_ID.desktop,
          traceId: roomId,
          entry: {
            id: `situation-room-attached:${roomId}:${sourceId ?? "room"}:${Date.now()}`,
            text: `attached situation room "${title}" with ${transcript.length} transcript chunk(s)`,
            tool: "situation-room.attach",
            ts: nowIso(),
            meta: {
              kind: source ? "situation_source_attachment" : "situation_room_attachment",
              room_id: roomId,
              title: room.title,
              source_id: sourceId,
              included_sources: sourceId ? [sourceId] : room.source_ids,
              recent_event_count: events.length,
              recent_transcript_count: transcript.length,
              latest_transcript: transcript.slice(-5).map((event: SituationRoomStoredEvent) => ({
                source_id: event.source_id,
                chunk_index: event.chunk_index,
                text: event.text,
                ts: event.ts,
              })),
            },
          },
        });
      },
      reset: () => {
        for (const session of activeDisplaySessions.values()) {
          session.stop();
        }
        for (const session of activeMicSessions.values()) {
          session.stop();
        }
        activeDisplaySessions.clear();
        activeMicSessions.clear();
        set({
          rooms: {},
          room_order: [],
          active_room_id: undefined,
          sources: {},
          events: {},
        });
      },
    }),
    {
      name: SITUATION_ROOM_STORAGE_KEY,
      partialize: (state) => ({
        rooms: state.rooms,
        room_order: state.room_order,
        active_room_id: state.active_room_id,
        sources: state.sources,
        events: state.events,
      }),
    },
  ),
);
