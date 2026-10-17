import { afterEach, describe, expect, it } from "vitest";
import { useVisualSourceCaptureStore, type VisualSourceCaptureFrameHistoryItem } from "./useVisualSourceCaptureStore";

const initialState = useVisualSourceCaptureStore.getState();

afterEach(() => {
  useVisualSourceCaptureStore.setState(initialState, true);
});

const baseProducer = {
  source_id: "visual_source:test",
  thread_id: "thread:test",
  stream_active: true,
  track_ready_state: "live" as const,
  capture_mode: "interval" as const,
  cadence_ms: 5000,
};

const historyItem: VisualSourceCaptureFrameHistoryItem = {
  history_id: "history:test",
  source_id: "visual_source:test",
  frame_id: "visual_frame:test",
  evidence_id: "visual_evidence:test",
  captured_at: "2026-06-11T12:00:00.000Z",
  preview_data_url: "data:image/jpeg;base64,test",
  preview_hash: "hash:test",
  summary: "Captured test frame.",
  visual_observer_profile_id: "shade:test",
  visual_observer_profile_title: "Test shade",
  visual_prompt_hash: "prompt:test",
  expires_at: "2026-06-11T12:10:00.000Z",
};

describe("visual source capture store", () => {
  it("preserves local frame review state across producer metadata upserts", () => {
    useVisualSourceCaptureStore.getState().upsertProducer({
      ...baseProducer,
      last_frame_hash: "hash:test",
      last_frame_preview_data_url: "data:image/jpeg;base64,test",
      frame_history: [historyItem],
    });

    useVisualSourceCaptureStore.getState().upsertProducer({
      ...baseProducer,
      producer_id: "producer:test",
      last_heartbeat_at: "2026-06-11T12:00:05.000Z",
      next_capture_due_at: "2026-06-11T12:00:10.000Z",
    });

    const producer = useVisualSourceCaptureStore.getState().producers["visual_source:test"];
    expect(producer.last_frame_hash).toBe("hash:test");
    expect(producer.last_frame_preview_data_url).toBe("data:image/jpeg;base64,test");
    expect(producer.frame_history).toEqual([historyItem]);
    expect(producer.producer_id).toBe("producer:test");
  });

  it("allows explicit frame review clears", () => {
    useVisualSourceCaptureStore.getState().upsertProducer({
      ...baseProducer,
      last_frame_hash: "hash:test",
      last_frame_preview_data_url: "data:image/jpeg;base64,test",
      frame_history: [historyItem],
    });

    useVisualSourceCaptureStore.getState().upsertProducer({
      ...baseProducer,
      last_frame_hash: null,
      last_frame_preview_data_url: null,
      frame_history: [],
    });

    const producer = useVisualSourceCaptureStore.getState().producers["visual_source:test"];
    expect(producer.last_frame_hash).toBeNull();
    expect(producer.last_frame_preview_data_url).toBeNull();
    expect(producer.frame_history).toEqual([]);
  });

  it("appends visual frame history without replacing existing frames", () => {
    useVisualSourceCaptureStore.getState().upsertProducer({
      ...baseProducer,
      frame_history: [historyItem],
      post_count: 1,
    });

    const nextItem: VisualSourceCaptureFrameHistoryItem = {
      ...historyItem,
      history_id: "history:next",
      frame_id: "visual_frame:next",
      evidence_id: "visual_evidence:next",
      captured_at: "2026-06-11T12:01:00.000Z",
      preview_data_url: "data:image/jpeg;base64,next",
      preview_hash: "hash:next",
      summary: "Captured next frame.",
      expires_at: "2026-06-11T12:11:00.000Z",
    };

    useVisualSourceCaptureStore.getState().appendFrameHistory("visual_source:test", nextItem, {
      last_chunk_id: "chunk:next",
    });

    const producer = useVisualSourceCaptureStore.getState().producers["visual_source:test"];
    expect(producer.frame_history?.map((item) => item.history_id)).toEqual(["history:test", "history:next"]);
    expect(producer.last_frame_hash).toBe("hash:next");
    expect(producer.last_frame_preview_data_url).toBe("data:image/jpeg;base64,next");
    expect(producer.last_chunk_id).toBe("chunk:next");
    expect(producer.post_count).toBe(2);
  });

  it("keeps appended visual frame history bounded to recent frames", () => {
    useVisualSourceCaptureStore.getState().upsertProducer(baseProducer);

    for (let index = 0; index < 25; index += 1) {
      useVisualSourceCaptureStore.getState().appendFrameHistory("visual_source:test", {
        ...historyItem,
        history_id: `history:${index}`,
        captured_at: `2026-06-11T12:${String(index).padStart(2, "0")}:00.000Z`,
        expires_at: "2026-06-11T13:00:00.000Z",
      });
    }

    const producer = useVisualSourceCaptureStore.getState().producers["visual_source:test"];
    expect(producer.frame_history).toHaveLength(20);
    expect(producer.frame_history?.[0]?.history_id).toBe("history:5");
    expect(producer.frame_history?.at(-1)?.history_id).toBe("history:24");
  });
});
