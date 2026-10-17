export type VoiceCaptureCheckpointKey =
  | "track_live"
  | "signal_detected"
  | "segment_cut"
  | "stt_request_started"
  | "stt_response_ok"
  | "stt_response_error"
  | "confirm_auto_started"
  | "confirm_auto_fired"
  | "confirm_auto_cancelled"
  | "confirm_blocked_reason"
  | "command_detected"
  | "command_suppressed"
  | "command_confirm_started"
  | "command_confirm_fired"
  | "command_executed"
  | "command_cancelled"
  | "translated"
  | "draft_appended"
  | "dispatch_queued"
  | "dispatch_suppressed"
  | "dispatch_completed";

export type VoiceCaptureCheckpointStatus = "idle" | "ok" | "warn" | "error";

export type VoiceCaptureCheckpoint = {
  key: VoiceCaptureCheckpointKey;
  status: VoiceCaptureCheckpointStatus;
  message: string | null;
  lastAtMs: number | null;
  latencyMs: number | null;
};

export const VOICE_CAPTURE_CHECKPOINT_ORDER: VoiceCaptureCheckpointKey[] = [
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
];

export const VOICE_CAPTURE_CHECKPOINT_LABEL: Record<VoiceCaptureCheckpointKey, string> = {
  track_live: "track live",
  signal_detected: "signal",
  segment_cut: "segment",
  stt_request_started: "stt request",
  stt_response_ok: "stt ok",
  stt_response_error: "stt error",
  confirm_auto_started: "confirm auto start",
  confirm_auto_fired: "confirm auto fire",
  confirm_auto_cancelled: "confirm auto cancel",
  confirm_blocked_reason: "confirm block reason",
  command_detected: "command detected",
  command_suppressed: "command suppressed",
  command_confirm_started: "command confirm start",
  command_confirm_fired: "command confirm fire",
  command_executed: "command executed",
  command_cancelled: "command cancelled",
  translated: "translated",
  draft_appended: "draft append",
  dispatch_queued: "dispatch queued",
  dispatch_suppressed: "dispatch suppressed",
  dispatch_completed: "dispatch completed",
};

export function createVoiceCaptureCheckpointMap(): Record<VoiceCaptureCheckpointKey, VoiceCaptureCheckpoint> {
  return VOICE_CAPTURE_CHECKPOINT_ORDER.reduce(
    (acc, key) => {
      acc[key] = {
        key,
        status: "idle",
        message: null,
        lastAtMs: null,
        latencyMs: null,
      };
      return acc;
    },
    {} as Record<VoiceCaptureCheckpointKey, VoiceCaptureCheckpoint>,
  );
}
