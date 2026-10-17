import { readHelixEnvNumber } from "@/lib/helix/ask-env-config";
import type { MicArmState } from "@/lib/helix/ask-read-aloud-display";
import { shouldDispatchReasoningAttempt } from "@/lib/helix/ask-voice-dispatch-suppression";

export const HELIX_VOICE_AUTO_DISPATCH_MAX_PER_MINUTE = Math.max(
  1,
  Math.floor(readHelixEnvNumber((import.meta as any)?.env, "VITE_HELIX_VOICE_AUTO_DISPATCH_MAX_PER_MINUTE", 3)),
);
export const HELIX_VOICE_AUTO_DISPATCH_CONFIDENCE_FLOOR = 0.5;
const HELIX_VOICE_AUTO_DISPATCH_DEFAULT_QUEUE_MAX = Math.max(
  1,
  Math.floor(readHelixEnvNumber((import.meta as any)?.env, "VITE_HELIX_VOICE_TRANSCRIBE_QUEUE_MAX", 4)),
);

export type VoiceAutoDispatchGovernanceReason =
  | "admitted_explicit_user_turn"
  | "admitted_forced_reasoning"
  | "empty_transcript"
  | "mic_not_armed"
  | "possible_tts_echo"
  | "blocked_interpreter_dispatch"
  | "confidence_below_auto_dispatch_floor"
  | "auto_dispatch_budget_exceeded"
  | "queue_backpressure"
  | "observe_only_by_default";

export type VoiceAutoDispatchGovernance = {
  schema: "helix.voice_auto_dispatch_governance.v1";
  admitted: boolean;
  reason: VoiceAutoDispatchGovernanceReason;
  candidateDispatchHint: boolean;
  queueDepth: number;
  activeDispatchCount: number;
  confidence: number | null;
  assistant_answer: false;
  raw_content_included: false;
  output_authority: "admission_trace";
  instruction_authority: "none";
};

export type VoiceDispatchState = "auto" | "confirm" | "blocked" | null | undefined;

export function isExplicitVoiceAskTurnCandidate(
  transcript: string,
  isSimpleConversationTurnCandidate: (transcript: string) => boolean = () => false,
): boolean {
  const text = transcript.trim();
  if (!text) return false;
  if (shouldDispatchReasoningAttempt(text)) return true;
  if (isSimpleConversationTurnCandidate(text)) return true;
  return /\b(?:ask|question|tell me|explain|summari[sz]e|review|what|why|how|can you|could you|please|send|submit)\b/i.test(
    text,
  );
}

export function evaluateVoiceAutoDispatchGovernance(args: {
  transcript: string;
  micArmState: MicArmState;
  confidence?: number | null;
  dispatchState?: VoiceDispatchState;
  interpreterDispatchState?: VoiceDispatchState;
  possibleTtsEcho?: boolean;
  forceReasoningAfterWorkstation?: boolean;
  queueDepth?: number;
  activeDispatchCount?: number;
  maxAutoDispatchPerWindow?: number;
  maxQueueDepth?: number;
  isSimpleConversationTurnCandidate?: (transcript: string) => boolean;
}): VoiceAutoDispatchGovernance {
  const transcript = args.transcript.trim();
  const confidence = typeof args.confidence === "number" && Number.isFinite(args.confidence) ? args.confidence : null;
  const queueDepth = Math.max(0, Math.floor(args.queueDepth ?? 0));
  const activeDispatchCount = Math.max(0, Math.floor(args.activeDispatchCount ?? 0));
  const maxAutoDispatchPerWindow = Math.max(
    1,
    Math.floor(args.maxAutoDispatchPerWindow ?? HELIX_VOICE_AUTO_DISPATCH_MAX_PER_MINUTE),
  );
  const maxQueueDepth = Math.max(1, Math.floor(args.maxQueueDepth ?? HELIX_VOICE_AUTO_DISPATCH_DEFAULT_QUEUE_MAX));
  const candidateDispatchHint =
    args.forceReasoningAfterWorkstation === true ||
    isExplicitVoiceAskTurnCandidate(transcript, args.isSimpleConversationTurnCandidate);
  let reason: VoiceAutoDispatchGovernanceReason = "admitted_explicit_user_turn";
  let admitted = true;
  if (!transcript) {
    admitted = false;
    reason = "empty_transcript";
  } else if (args.micArmState !== "on") {
    admitted = false;
    reason = "mic_not_armed";
  } else if (args.possibleTtsEcho === true) {
    admitted = false;
    reason = "possible_tts_echo";
  } else if (args.dispatchState === "blocked" || args.interpreterDispatchState === "blocked") {
    admitted = false;
    reason = "blocked_interpreter_dispatch";
  } else if (confidence !== null && confidence < HELIX_VOICE_AUTO_DISPATCH_CONFIDENCE_FLOOR) {
    admitted = false;
    reason = "confidence_below_auto_dispatch_floor";
  } else if (queueDepth >= maxQueueDepth) {
    admitted = false;
    reason = "queue_backpressure";
  } else if (activeDispatchCount >= maxAutoDispatchPerWindow) {
    admitted = false;
    reason = "auto_dispatch_budget_exceeded";
  } else if (!candidateDispatchHint) {
    admitted = false;
    reason = "observe_only_by_default";
  } else if (args.forceReasoningAfterWorkstation === true) {
    reason = "admitted_forced_reasoning";
  }
  return {
    schema: "helix.voice_auto_dispatch_governance.v1",
    admitted,
    reason,
    candidateDispatchHint,
    queueDepth,
    activeDispatchCount,
    confidence,
    assistant_answer: false,
    raw_content_included: false,
    output_authority: "admission_trace",
    instruction_authority: "none",
  };
}
