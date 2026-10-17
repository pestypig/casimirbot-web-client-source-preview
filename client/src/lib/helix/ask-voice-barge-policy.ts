import type {
  VoicePlaybackCancelReason,
  VoicePreemptPolicy,
} from "@/lib/helix/voice-playback";

export const VOICE_BARGE_HARD_CUT_PERSIST_MS = 700;

export type VoiceBargeHardCutReason =
  | "speech_persisted"
  | "stt_queue"
  | "stt_busy"
  | "pending_confirmation";

export function resolveVoiceBargeHardCutReason(args: {
  holdActive: boolean;
  holdStartedAtMs: number | null;
  nowMs: number;
  transcribeQueueLength: number;
  transcribeBusy: boolean;
  pendingConfirmation: boolean;
  speechActive: boolean;
  persistMs?: number;
}): VoiceBargeHardCutReason | null {
  if (!args.holdActive) return null;
  if (args.pendingConfirmation) return "pending_confirmation";
  if (args.transcribeQueueLength > 0 && args.speechActive) return "stt_queue";
  if (args.transcribeBusy) return "stt_busy";
  const persistMs = args.persistMs ?? VOICE_BARGE_HARD_CUT_PERSIST_MS;
  if (
    args.speechActive &&
    args.holdStartedAtMs !== null &&
    args.nowMs - args.holdStartedAtMs >= Math.max(0, persistMs)
  ) {
    return "speech_persisted";
  }
  return null;
}

export function shouldResumeBargeHeldPlayback(args: {
  holdActive: boolean;
  resumeNotBeforeMs: number | null;
  nowMs: number;
  transcribeQueueLength: number;
  transcribeBusy: boolean;
  pendingConfirmation: boolean;
  speechActive: boolean;
  micArmed: boolean;
  segmentFlushPending: boolean;
  trafficQuietUntilMs: number | null;
}): boolean {
  if (!args.holdActive) return false;
  if (args.resumeNotBeforeMs === null || args.nowMs < args.resumeNotBeforeMs) return false;
  if (args.transcribeBusy || args.transcribeQueueLength > 0 || args.pendingConfirmation) return false;
  if (args.speechActive || !args.micArmed || args.segmentFlushPending) return false;
  if (args.trafficQuietUntilMs !== null && args.nowMs < args.trafficQuietUntilMs) return false;
  return true;
}

export function shouldInterruptForSupersededReason(
  reason: VoicePlaybackCancelReason | null,
  hasActiveAudio: boolean,
): boolean {
  if (!reason) return false;
  if (reason === "superseded_same_turn") {
    return false;
  }
  if (reason === "preempted_by_final" && !hasActiveAudio) {
    return false;
  }
  return true;
}

export function mapVoicePreemptPolicyToCancelReason(
  policy: Exclude<VoicePreemptPolicy, "none">,
): VoicePlaybackCancelReason {
  return policy === "pending_final" ? "preempted_by_final" : "superseded_same_turn";
}
