import { describe, expect, it } from "vitest";

import {
  VOICE_CAPTURE_CHECKPOINT_LABEL,
  VOICE_CAPTURE_CHECKPOINT_ORDER,
  createVoiceCaptureCheckpointMap,
} from "@/lib/helix/ask-voice-capture-checkpoints";

describe("voice capture checkpoints", () => {
  it("keeps a stable ordered checkpoint list with matching labels", () => {
    expect(VOICE_CAPTURE_CHECKPOINT_ORDER).toEqual([
      "track_live",
      "signal_detected",
      "segment_cut",
      "stt_request_started",
      "stt_response_ok",
      "stt_response_error",
      "confirm_auto_started",
      "confirm_auto_fired",
      "confirm_auto_cancelled",
      "confirm_blocked_reason",
      "command_detected",
      "command_suppressed",
      "command_confirm_started",
      "command_confirm_fired",
      "command_executed",
      "command_cancelled",
      "translated",
      "draft_appended",
      "dispatch_queued",
      "dispatch_suppressed",
      "dispatch_completed",
    ]);
    expect(Object.keys(VOICE_CAPTURE_CHECKPOINT_LABEL).sort()).toEqual(
      [...VOICE_CAPTURE_CHECKPOINT_ORDER].sort(),
    );
    expect(VOICE_CAPTURE_CHECKPOINT_LABEL.stt_request_started).toBe("stt request");
    expect(VOICE_CAPTURE_CHECKPOINT_LABEL.dispatch_completed).toBe("dispatch completed");
  });

  it("builds a fresh idle checkpoint map for every call", () => {
    const first = createVoiceCaptureCheckpointMap();
    const second = createVoiceCaptureCheckpointMap();

    expect(first.track_live).toEqual({
      key: "track_live",
      status: "idle",
      message: null,
      lastAtMs: null,
      latencyMs: null,
    });
    expect(first.dispatch_completed).toEqual({
      key: "dispatch_completed",
      status: "idle",
      message: null,
      lastAtMs: null,
      latencyMs: null,
    });
    expect(Object.keys(first)).toEqual(VOICE_CAPTURE_CHECKPOINT_ORDER);
    expect(first.track_live).not.toBe(second.track_live);
  });
});
