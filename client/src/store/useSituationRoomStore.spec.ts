import { beforeEach, describe, expect, it, vi } from "vitest";
import { HELIX_ASK_LIVE_EVENT_BUS_EVENT } from "@/lib/helix/liveEventsBus";
import type { DisplayAudioSituationSessionOptions } from "@/lib/helix/display-audio-capture";
import type { HelixSituationEvent } from "@/lib/helix/situation-room";
import { useWorkstationNotesStore } from "@/store/useWorkstationNotesStore";

(globalThis as Record<string, unknown>).__HELIX_ASK_JOB_TIMEOUT_MS__ = "1200000";

const displayAudioMock = vi.hoisted(() => ({
  startDisplayAudioSituationSession: vi.fn(),
  options: [] as DisplayAudioSituationSessionOptions[],
  stops: [] as Array<() => void>,
}));

const micAudioMock = vi.hoisted(() => ({
  startMicAudioSituationSession: vi.fn(),
}));

vi.mock("@/lib/helix/display-audio-capture", () => ({
  startDisplayAudioSituationSession: displayAudioMock.startDisplayAudioSituationSession,
}));

vi.mock("@/lib/helix/mic-audio-situation-capture", () => ({
  startMicAudioSituationSession: micAudioMock.startMicAudioSituationSession,
}));

import {
  selectSituationRoomTranscript,
  useSituationRoomStore,
} from "@/store/useSituationRoomStore";

function makeTranscriptEvent(input: {
  roomId: string;
  captureSessionId: string;
  chunkIndex: number;
  text: string;
  ts?: string;
}): HelixSituationEvent {
  return {
    id: `event:${input.captureSessionId}:${input.chunkIndex}`,
    room_id: input.roomId,
    source: "display_tab_audio",
    event_type: "voice_transcript",
    text: input.text,
    classification: "info",
    evidence_refs: [`voice:transcribe:${input.captureSessionId}:${input.chunkIndex}`],
    capture_session_id: input.captureSessionId,
    chunk_index: input.chunkIndex,
    ts: input.ts ?? "2026-05-01T12:00:00.000Z",
    meta: {
      possible_tts_echo: true,
    },
  };
}

describe("useSituationRoomStore", () => {
  beforeEach(() => {
    displayAudioMock.options = [];
    displayAudioMock.stops = [];
    displayAudioMock.startDisplayAudioSituationSession.mockReset();
    displayAudioMock.startDisplayAudioSituationSession.mockImplementation(
      async (options: DisplayAudioSituationSessionOptions) => {
        displayAudioMock.options.push(options);
        const stop = vi.fn(() => options.onStop?.("manual"));
        displayAudioMock.stops.push(stop);
        return {
          captureSessionId: options.captureSessionId ?? "cap:test",
          source: "display_tab_audio",
          stream: {} as MediaStream,
          recorder: {} as MediaRecorder,
          stop,
        };
      },
    );
    useSituationRoomStore.getState().reset();
    useWorkstationNotesStore.setState({ notes: {}, order: [], active_note_id: undefined });
  });

  it("creates and renames named rooms", () => {
    const room = useSituationRoomStore.getState().createRoom("Nether Run");
    expect(room.title).toBe("Nether Run");
    expect(useSituationRoomStore.getState().active_room_id).toBe(room.room_id);

    useSituationRoomStore.getState().renameRoom(room.room_id, "Discord Planning");
    expect(useSituationRoomStore.getState().rooms[room.room_id]?.title).toBe("Discord Planning");
  });

  it("tracks multiple selected display audio sources for one room", async () => {
    const room = useSituationRoomStore.getState().createRoom("Multi-source Room");
    const first = await useSituationRoomStore.getState().attachDisplayAudioSource(room.room_id, "Discord tab");
    const second = await useSituationRoomStore.getState().attachDisplayAudioSource(room.room_id, "YouTube tab");

    const state = useSituationRoomStore.getState();
    expect(displayAudioMock.startDisplayAudioSituationSession).toHaveBeenCalledTimes(2);
    expect(first?.capture_session_id).not.toBe(second?.capture_session_id);
    expect(state.rooms[room.room_id]?.source_ids).toHaveLength(2);
    expect(first ? state.sources[first.source_id]?.status : undefined).toBe("active");
    expect(second ? state.sources[second.source_id]?.status : undefined).toBe("active");
  });

  it("orders transcript chunks by capture session chunk index", async () => {
    const room = useSituationRoomStore.getState().createRoom("Transcript Room");
    const onTranscriptChunk = vi.fn();
    const source = await useSituationRoomStore.getState().attachDisplayAudioSource(room.room_id, "Discord tab", {
      chunkMs: 10_000,
      onTranscriptChunk,
    });
    expect(source).toBeTruthy();
    const options = displayAudioMock.options[0];
    expect(options.chunkMs).toBe(10_000);
    expect(options.onTranscriptChunk).toBe(onTranscriptChunk);

    options.onEvent(
      makeTranscriptEvent({
        roomId: room.room_id,
        captureSessionId: source!.capture_session_id,
        chunkIndex: 1,
        text: "second chunk",
        ts: "2026-05-01T12:00:01.000Z",
      }),
    );
    options.onEvent(
      makeTranscriptEvent({
        roomId: room.room_id,
        captureSessionId: source!.capture_session_id,
        chunkIndex: 0,
        text: "first chunk",
        ts: "2026-05-01T12:00:02.000Z",
      }),
    );

    const transcript = selectSituationRoomTranscript(useSituationRoomStore.getState(), room.room_id);
    expect(transcript.map((event: HelixSituationEvent) => event.text)).toEqual(["first chunk", "second chunk"]);
    expect(useSituationRoomStore.getState().sources[source!.source_id]?.chunk_index).toBe(2);
  });

  it("stops a source and records a source_stopped event", async () => {
    const room = useSituationRoomStore.getState().createRoom("Stop Room");
    const source = await useSituationRoomStore.getState().attachDisplayAudioSource(room.room_id, "Discord tab");
    expect(source).toBeTruthy();

    useSituationRoomStore.getState().stopSource(source!.source_id);

    const state = useSituationRoomStore.getState();
    expect(displayAudioMock.stops[0]).toHaveBeenCalled();
    expect(state.sources[source!.source_id]?.status).toBe("stopped");
    const events = Object.values(state.events).filter(
      (event: HelixSituationEvent & { source_id?: string }) => event.source_id === source!.source_id,
    );
    expect(events.some((event: HelixSituationEvent) => event.event_type === "source_stopped")).toBe(true);
  });

  it("saves a room transcript as a workstation note with situation-room citations", async () => {
    const room = useSituationRoomStore.getState().createRoom("Saved Room");
    const source = await useSituationRoomStore.getState().attachDisplayAudioSource(room.room_id, "YouTube tab");
    displayAudioMock.options[0].onEvent(
      makeTranscriptEvent({
        roomId: room.room_id,
        captureSessionId: source!.capture_session_id,
        chunkIndex: 42,
        text: "box the blaze spawner from the side",
      }),
    );

    const note = useSituationRoomStore.getState().saveRoomAsNote(room.room_id);

    expect(note?.body).toContain("box the blaze spawner");
    expect(note?.citations[0]?.path).toContain("situation-room://");
    expect(note?.citations[0]?.path).toContain("/chunk/0042");
    expect(useWorkstationNotesStore.getState().active_note_id).toBe(note?.id);
    expect(useSituationRoomStore.getState().rooms[room.room_id]?.saved_note_id).toBe(note?.id);
  });

  it("emits a Helix Ask live event when attaching room context", () => {
    const received: unknown[] = [];
    const listeners = new Map<string, Set<(event: Event) => void>>();
    vi.stubGlobal(
      "CustomEvent",
      class {
        type: string;
        detail: unknown;
        constructor(type: string, init?: { detail?: unknown }) {
          this.type = type;
          this.detail = init?.detail;
        }
      },
    );
    vi.stubGlobal("window", {
      addEventListener: (type: string, listener: (event: Event) => void) => {
        const current = listeners.get(type) ?? new Set();
        current.add(listener);
        listeners.set(type, current);
      },
      removeEventListener: (type: string, listener: (event: Event) => void) => {
        listeners.get(type)?.delete(listener);
      },
      dispatchEvent: (event: Event) => {
        for (const listener of listeners.get(event.type) ?? []) {
          listener(event);
        }
        return true;
      },
    });
    const handler = (event: Event) => received.push((event as CustomEvent).detail);
    window.addEventListener(HELIX_ASK_LIVE_EVENT_BUS_EVENT, handler);
    try {
      const room = useSituationRoomStore.getState().createRoom("Attach Room");
      useSituationRoomStore.getState().attachRoomToHelixAsk(room.room_id);
    } finally {
      window.removeEventListener(HELIX_ASK_LIVE_EVENT_BUS_EVENT, handler);
      vi.unstubAllGlobals();
    }

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      contextId: "helix-ask-desktop",
      entry: {
        tool: "situation-room.attach",
        meta: {
          kind: "situation_room_attachment",
        },
      },
    });
  });
});
