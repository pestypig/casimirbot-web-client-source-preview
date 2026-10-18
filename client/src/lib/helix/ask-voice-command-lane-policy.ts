import type { VoiceCommandLaneEnvelope } from "@/lib/agi/api";

import { VOICE_STT_CONFIRM_THRESHOLD } from "./ask-voice-transcript-confidence";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

const fallbackVoiceCommandUtteranceId = (): string => {
  const randomUuid = globalThis.crypto?.randomUUID;
  return `vcmd:${typeof randomUuid === "function" ? randomUuid.call(globalThis.crypto) : "unknown"}`;
};

export function shouldIgnoreLowQualityTranscriptBargeIn(args: {
  lowAudioQuality: boolean;
  confidence: number;
  speechProbability: number | null | undefined;
  snrDb: number | null | undefined;
  hasActiveVoiceReasoningAttempt: boolean;
  hasActiveVoicePlayback: boolean;
  needsConfirmation: boolean;
}): boolean {
  if (!args.lowAudioQuality) return false;
  if (args.needsConfirmation) return false;
  if (!(args.hasActiveVoiceReasoningAttempt || args.hasActiveVoicePlayback)) return false;
  const hasQualityTelemetry =
    typeof args.speechProbability === "number" || typeof args.snrDb === "number";
  const confidenceThreshold = hasQualityTelemetry
    ? Math.max(0.82, VOICE_STT_CONFIRM_THRESHOLD + 0.12)
    : Math.max(0.9, VOICE_STT_CONFIRM_THRESHOLD + 0.18);
  return args.confidence < confidenceThreshold;
}

export function normalizeVoiceCommandLaneEnvelope(
  payload: VoiceCommandLaneEnvelope | null | undefined,
  options?: {
    createUtteranceId?: () => string;
  },
): VoiceCommandLaneEnvelope | null {
  if (!payload || typeof payload !== "object") return null;
  const decision =
    payload.decision === "accepted" || payload.decision === "suppressed" || payload.decision === "none"
      ? payload.decision
      : null;
  if (!decision) return null;
  const action =
    payload.action === "send" || payload.action === "cancel" || payload.action === "retry"
      ? payload.action
      : null;
  const source =
    payload.source === "parser" || payload.source === "evaluator" || payload.source === "none"
      ? payload.source
      : "none";
  const suppressionReason =
    payload.suppression_reason === "disabled" ||
    payload.suppression_reason === "kill_switch" ||
    payload.suppression_reason === "rollout_inactive" ||
    payload.suppression_reason === "audio_quality_low" ||
    payload.suppression_reason === "strict_prefix_required" ||
    payload.suppression_reason === "log_only" ||
    payload.suppression_reason === "non_user_audio_source"
      ? payload.suppression_reason
      : null;
  const confidence =
    typeof payload.confidence === "number" && Number.isFinite(payload.confidence)
      ? clamp01(payload.confidence)
      : null;
  const utteranceId = typeof payload.utterance_id === "string" && payload.utterance_id.trim()
    ? payload.utterance_id.trim()
    : (options?.createUtteranceId ?? fallbackVoiceCommandUtteranceId)();
  return {
    version:
      typeof payload.version === "string" && payload.version.trim()
        ? payload.version.trim()
        : "helix.voice.command_lane.v1",
    decision,
    action,
    confidence,
    source,
    suppression_reason: suppressionReason,
    strict_prefix_applied: payload.strict_prefix_applied === true,
    confirm_required: payload.confirm_required === true,
    utterance_id: utteranceId,
  };
}
