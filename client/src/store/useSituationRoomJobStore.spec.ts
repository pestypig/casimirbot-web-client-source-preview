import { beforeEach, describe, expect, it, vi } from "vitest";
import { HELIX_ASK_LIVE_EVENT_BUS_EVENT } from "@/lib/helix/liveEventsBus";
import type { HelixSituationEvent } from "@/lib/helix/situation-room";
import { useSituationRoomStore, type SituationRoomSource } from "@/store/useSituationRoomStore";
import { useWorkstationNotesStore } from "@/store/useWorkstationNotesStore";
import {
  selectSituationRoomMasterScroll,
  useSituationRoomJobStore,
} from "@/store/useSituationRoomJobStore";

vi.mock("@/lib/helix/display-audio-capture", () => ({
  startDisplayAudioSituationSession: vi.fn(),
}));

function seedRoom() {
  const room = useSituationRoomStore.getState().createRoom("Pipeline Room");
  const source: SituationRoomSource = {
    source_id: "src_discord",
    room_id: room.room_id,
    label: "Discord tab",
    capture_source: "display_tab_audio",
    capture_session_id: "cap_discord",
    status: "active",
    chunk_index: 0,
    started_at: "2026-05-01T12:00:00.000Z",
  };
  useSituationRoomStore.setState((state) => ({
    sources: { ...state.sources, [source.source_id]: source },
    rooms: {
      ...state.rooms,
      [room.room_id]: {
        ...room,
        source_ids: [source.source_id],
      },
    },
  }));
  const first = makeTranscriptEvent(room.room_id, source.source_id, 0, "we should wait for fire resistance");
  const second = makeTranscriptEvent(room.room_id, source.source_id, 1, "bring extra bread before pushing");
  useSituationRoomStore.getState().appendSituationEvent(first, source.source_id);
  useSituationRoomStore.getState().appendSituationEvent(second, source.source_id);
  return { room, source, events: [first, second] };
}

function makeTranscriptEvent(
  roomId: string,
  sourceId: string,
  chunkIndex: number,
  text: string,
  meta?: Record<string, unknown>,
): HelixSituationEvent {
  return {
    id: `room:${roomId}:source:${sourceId}:chunk:${chunkIndex}`,
    room_id: roomId,
    source: "display_tab_audio",
    event_type: "voice_transcript",
    text,
    classification: "info",
    evidence_refs: [`voice:transcribe:${sourceId}:${chunkIndex}`],
    capture_session_id: "cap_discord",
    chunk_index: chunkIndex,
    ts: `2026-01-01T12:00:0${chunkIndex}.000Z`,
    meta: {
      possible_tts_echo: true,
      ...meta,
    },
  };
}

function installWindowStub(received: unknown[]) {
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
      received.push((event as CustomEvent).detail);
      for (const listener of listeners.get(event.type) ?? []) {
        listener(event);
      }
      return true;
    },
  });
}

describe("useSituationRoomJobStore", () => {
  beforeEach(() => {
    useSituationRoomJobStore.getState().reset();
    useSituationRoomStore.getState().reset();
    useWorkstationNotesStore.setState({ notes: {}, order: [], active_note_id: undefined });
    vi.unstubAllGlobals();
  });

  it("creates a translation job from one source", () => {
    const { room, source } = seedRoom();
    const job = useSituationRoomJobStore
      .getState()
      .createJobFromSource(room.room_id, source.source_id, "translate", { target_language: "es" });

    expect(job.kind).toBe("translate");
    expect(job.source_ids).toEqual([source.source_id]);
    expect(job.target_language).toBe("es");
    expect(job.native_language).toBe("en");
    expect(job.input_text_policy).toBe("source_text_preferred");
    expect(job.output_render_policy).toBe("target_language");
    expect(job.attachment_policy).toBe("manual_only");
    expect(job.context_injection).toBe("explicit_attachment_only");
    expect(job.command_lane_enabled).toBe(false);
    expect(job.job_spec_hash).toMatch(/^job-spec:/);
  });

  it("creates a job from a whole room", () => {
    const { room } = seedRoom();
    const job = useSituationRoomJobStore.getState().createJobFromRoom(room.room_id, "rolling_summary");

    expect(job.room_id).toBe(room.room_id);
    expect(job.source_ids).toEqual([]);
  });

  it("derived output preserves raw transcript events and references derived_from_event_ids", () => {
    const { room, source, events } = seedRoom();
    const job = useSituationRoomJobStore
      .getState()
      .createJobFromSource(room.room_id, source.source_id, "translate", { target_language: "es" });

    const outputs = useSituationRoomJobStore.getState().processJobNow(job.job_id);
    const rawEvents = Object.values(useSituationRoomStore.getState().events);

    expect(rawEvents.map((event) => event.event_id)).toContain(events[0].id);
    expect(outputs[0]?.artifact_kind).toBe("translation_chunk");
    expect(outputs[0]?.derived).toBe(true);
    expect(outputs[0]?.derived_from_event_ids).toContain(events[0].id);
    expect(useSituationRoomStore.getState().events[events[0].id]?.text).toBe(events[0].text);
  });

  it("translation jobs can prefer original source text over normalized native transcript", () => {
    const room = useSituationRoomStore.getState().createRoom("Language Room");
    const source: SituationRoomSource = {
      source_id: "src_spanish",
      room_id: room.room_id,
      label: "Spanish tab",
      capture_source: "display_tab_audio",
      capture_session_id: "cap_spanish",
      status: "active",
      chunk_index: 0,
      started_at: "2026-05-01T12:00:00.000Z",
    };
    useSituationRoomStore.setState((state) => ({
      sources: { ...state.sources, [source.source_id]: source },
      rooms: {
        ...state.rooms,
        [room.room_id]: {
          ...room,
          source_ids: [source.source_id],
        },
      },
    }));
    const event = makeTranscriptEvent(room.room_id, source.source_id, 0, "we should wait", {
      source_text: "debemos esperar",
      source_language: "es",
      language: "en",
      translated: true,
    });
    useSituationRoomStore.getState().appendSituationEvent(event, source.source_id);
    const job = useSituationRoomJobStore.getState().createJobFromSource(
      room.room_id,
      source.source_id,
      "translate",
      {
        target_language: "es",
        input_text_policy: "source_text_preferred",
        output_render_policy: "target_language",
      },
    );

    const outputs = useSituationRoomJobStore.getState().processJobNow(job.job_id);

    expect(outputs[0]?.text).toContain("Target (es): debemos esperar");
    expect(outputs[0]?.text).not.toContain("we should wait");
    expect(outputs[0]?.meta.input_language).toBe("es");
    expect(outputs[0]?.meta.output_language).toBe("es");
    expect(outputs[0]?.meta.transcript_was_translated).toBe(true);
  });

  it("async translation jobs update target output through Helix Ask", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          text: "deberiamos esperar para tener resistencia al fuego",
          selected_final_answer: "deberiamos esperar para tener resistencia al fuego",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const { room, source } = seedRoom();
    const job = useSituationRoomJobStore.getState().createJobFromSource(
      room.room_id,
      source.source_id,
      "translate",
      {
        target_language: "es",
        input_text_policy: "transcript_text",
        output_render_policy: "target_language",
      },
    );

    const outputs = await useSituationRoomJobStore.getState().processJobNowAsync(job.job_id);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agi/ask/turn",
      expect.objectContaining({ method: "POST" }),
    );
    expect(outputs[0]?.text).toContain("Target (es): deberiamos esperar");
    expect(outputs[0]?.meta.model).toBe("helix-ask-translation");
    expect(outputs[0]?.meta.translation_status).toBe("translated");
    expect(useSituationRoomJobStore.getState().jobs[job.job_id]?.output_ids).toHaveLength(2);
  });

  it("does not duplicate output when the same chunk is processed repeatedly for the same job", () => {
    const { room, source } = seedRoom();
    const job = useSituationRoomJobStore
      .getState()
      .createJobFromSource(room.room_id, source.source_id, "translate", { target_language: "es" });

    useSituationRoomJobStore.getState().processJobNow(job.job_id);
    useSituationRoomJobStore.getState().processJobNow(job.job_id);

    const currentJob = useSituationRoomJobStore.getState().jobs[job.job_id];
    expect(currentJob?.output_ids).toHaveLength(2);
    expect(Object.values(useSituationRoomJobStore.getState().outputs)).toHaveLength(2);
  });

  it("stopping a job does not stop source capture", () => {
    const { room, source } = seedRoom();
    const job = useSituationRoomJobStore.getState().createJobFromRoom(room.room_id, "action_items");

    useSituationRoomJobStore.getState().stopJob(job.job_id);

    expect(useSituationRoomJobStore.getState().jobs[job.job_id]?.status).toBe("cancelled");
    expect(useSituationRoomStore.getState().sources[source.source_id]?.status).toBe("active");
  });

  it("saves job output as a note with source and job citations", () => {
    const { room, source } = seedRoom();
    const job = useSituationRoomJobStore
      .getState()
      .createJobFromSource(room.room_id, source.source_id, "translate", { target_language: "es" });
    useSituationRoomJobStore.getState().processJobNow(job.job_id);

    const note = useSituationRoomJobStore.getState().saveJobAsNote(job.job_id);

    expect(note?.body).toContain("Target (es):");
    expect(note?.citations.some((citation) => citation.path.includes("/job/"))).toBe(true);
    expect(note?.citations.some((citation) => citation.path.includes("/source/"))).toBe(true);
    expect(note?.citations.every((citation) => citation.path.startsWith("situation-room://"))).toBe(true);
  });

  it("attaches job output to Helix Ask with explicit job metadata", () => {
    const received: unknown[] = [];
    const { room, source } = seedRoom();
    const job = useSituationRoomJobStore
      .getState()
      .createJobFromSource(room.room_id, source.source_id, "translate", { target_language: "es" });
    useSituationRoomJobStore.getState().processJobNow(job.job_id);
    installWindowStub(received);

    useSituationRoomJobStore.getState().attachJobToHelixAsk(job.job_id);

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      contextId: "helix-ask-desktop",
      entry: {
        tool: "situation-room.jobs",
        meta: {
          kind: "situation_room_job_attachment",
          job_id: job.job_id,
          attachment_policy: "manual_only",
          context_injection: "explicit_attachment_only",
          context_excerpt: expect.stringContaining("Recent source transcript"),
          source_transcripts: expect.arrayContaining([
            expect.objectContaining({
              text: expect.stringContaining("fire resistance"),
              citation_path: expect.stringContaining("situation-room://"),
            }),
          ]),
          evidence_refs: expect.arrayContaining([expect.stringContaining("situation-room://")]),
        },
      },
    });
    expect(useSituationRoomJobStore.getState().last_attached_job_id).toBe(job.job_id);
  });

  it("master scroll orders raw and derived events deterministically", () => {
    const { room, source } = seedRoom();
    const job = useSituationRoomJobStore
      .getState()
      .createJobFromSource(room.room_id, source.source_id, "translate", { target_language: "es" });
    useSituationRoomJobStore.getState().processJobNow(job.job_id);

    const rows = selectSituationRoomMasterScroll(
      useSituationRoomStore.getState(),
      useSituationRoomJobStore.getState(),
      room.room_id,
    );

    expect(rows[0]?.kind).toBe("raw");
    expect(rows.map((row) => row.id)).toEqual([...rows.map((row) => row.id)]);
    expect(rows.some((row) => row.kind === "derived")).toBe(true);
  });

  it("turn context snapshot excludes unattached job output", () => {
    const { room, source } = seedRoom();
    const job = useSituationRoomJobStore
      .getState()
      .createJobFromSource(room.room_id, source.source_id, "translate", { target_language: "es" });
    useSituationRoomJobStore.getState().processJobNow(job.job_id);

    const withoutJob = useSituationRoomJobStore.getState().createTurnContextSnapshot({ room_id: room.room_id });
    const withJob = useSituationRoomJobStore
      .getState()
      .createTurnContextSnapshot({ room_id: room.room_id, job_ids: [job.job_id] });

    expect(withoutJob.job_outputs).toEqual([]);
    expect(withJob.job_outputs[0]?.job_id).toBe(job.job_id);
    expect(withJob.job_outputs[0]?.output_ids.length).toBeGreaterThan(0);
  });
});
