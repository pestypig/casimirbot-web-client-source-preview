import { describe, expect, it } from "vitest";
import {
  createSituationRoomState,
  reduceSituationRoomEvent,
  type HelixSituationEvent,
} from "@/lib/helix/situation-room";

describe("situation room reducer", () => {
  it("adds transcript chunks to room sources, transcript buffer, and event rail", () => {
    const base = createSituationRoomState("room-1");
    const event: HelixSituationEvent = {
      id: "event-1",
      room_id: "room-1",
      source: "display_tab_audio",
      event_type: "voice_transcript",
      text: "Need food before the next push.",
      classification: "info",
      evidence_refs: ["voice:transcribe:capture-1:0"],
      capture_session_id: "capture-1",
      chunk_index: 0,
      ts: "2026-05-01T00:00:00.000Z",
      meta: {
        confidence: 0.87,
        language: "en",
      },
    };

    const next = reduceSituationRoomEvent(base, event);

    expect(next.recentEvents).toHaveLength(1);
    expect(next.recentTranscript).toEqual([
      expect.objectContaining({
        id: "event-1",
        source: "display_tab_audio",
        text: "Need food before the next push.",
        capture_session_id: "capture-1",
        chunk_index: 0,
        confidence: 0.87,
        language: "en",
      }),
    ]);
    expect(next.sources["capture-1"]).toMatchObject({
      source: "display_tab_audio",
      status: "active",
      chunk_count: 1,
    });
  });
});

