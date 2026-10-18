import type { HelixAskLiveRuntimeVisualFrameInput } from
  "../HelixAskLiveRuntimeTransportController";
import {
  VISUAL_SOURCE_FRAME_HISTORY_TTL_MS,
  useVisualSourceCaptureStore,
  type VisualSourceCaptureFrameHistoryItem,
} from "@/store/useVisualSourceCaptureStore";

const SHARED_ROOM_MANUAL_SOURCE_ID = "visual:shared-room-manual-promotion";
let manualFrameSequence = 0;

/**
 * Re-enters an explicit carousel selection through the room-owned visual lane
 * instead of sending it directly to the provider peer a second time.
 */
export const stageSharedLiveRoomManualVisualFrame = (
  input: HelixAskLiveRuntimeVisualFrameInput,
): VisualSourceCaptureFrameHistoryItem => {
  const capturedAtMs = Date.now();
  const capturedAt = new Date(capturedAtMs).toISOString();
  manualFrameSequence += 1;
  const historyId = `shared-room-manual:${capturedAtMs}:${manualFrameSequence}`;
  useVisualSourceCaptureStore.getState().upsertProducer({
    source_id: SHARED_ROOM_MANUAL_SOURCE_ID,
    thread_id: "helix-ask:desktop",
    stream_active: false,
    interval_active: false,
    track_ready_state: "ended",
    capture_mode: "manual",
    cadence_ms: null,
    last_heartbeat_at: capturedAt,
    last_error: null,
  });
  const frame: VisualSourceCaptureFrameHistoryItem = {
    history_id: historyId,
    source_id: SHARED_ROOM_MANUAL_SOURCE_ID,
    frame_id: null,
    evidence_id: null,
    captured_at: capturedAt,
    preview_data_url: input.imageDataUrl,
    preview_hash: null,
    source_surface: input.sourceKind === "camera" ? "camera" : "screen",
    source_kind: "full_frame",
    crop_only: false,
    summary: input.sourceLabel?.trim() || "Selected frame queued for Shared GPT Live.",
    expires_at: new Date(capturedAtMs + VISUAL_SOURCE_FRAME_HISTORY_TTL_MS).toISOString(),
  };
  useVisualSourceCaptureStore.getState().appendFrameHistory(
    SHARED_ROOM_MANUAL_SOURCE_ID,
    frame,
  );
  return frame;
};
