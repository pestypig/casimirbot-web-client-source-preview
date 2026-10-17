import {
  hasDanglingTurnTail,
  isLowInformationTailTranscript,
  shouldMergeVoiceContinuationTurn,
  VOICE_CONTINUATION_MERGE_WINDOW_MS,
} from "@/lib/helix/ask-voice-continuation-lexical";
import { shouldDispatchReasoningAttempt } from "@/lib/helix/ask-voice-dispatch-suppression";
import {
  scoreVoiceTurnComplete,
  type TurnCompleteScore,
} from "@/lib/helix/ask-voice-turn-scoring";

export const VOICE_TURN_CLOSE_SILENCE_MS = 3200;
export const VOICE_HELD_TRANSCRIPT_FLUSH_MS = 1800;
export const VOICE_HELD_TRANSCRIPT_MAX_AGE_MS = 30_000;

export type HeldTranscriptReason = "continuation_hold" | "low_info_tail";

export function shouldRecoverHeldTranscriptAfterNoTranscript(args: {
  heldTranscript: string;
  turnCompleteBand: TurnCompleteScore["band"];
  transcribeQueueLength: number;
  speechActive: boolean;
  sinceLastSpeechMs: number;
}): boolean {
  const held = args.heldTranscript.trim();
  if (!held) return false;
  if (isLowInformationTailTranscript(held)) return false;
  if (args.transcribeQueueLength > 0) return false;
  if (args.speechActive) return false;
  if (args.turnCompleteBand === "high" && args.sinceLastSpeechMs >= VOICE_TURN_CLOSE_SILENCE_MS) {
    return true;
  }
  if (
    args.turnCompleteBand === "medium" &&
    !hasDanglingTurnTail(held) &&
    args.sinceLastSpeechMs >= VOICE_TURN_CLOSE_SILENCE_MS
  ) {
    return true;
  }
  return false;
}

export function shouldFlushHeldTranscriptFromWatchdog(args: {
  heldTranscript: string;
  holdReason: HeldTranscriptReason;
  transcribeQueueLength: number;
  speechActive: boolean;
  transcribeBusy: boolean;
  pendingConfirmation: boolean;
  sinceLastSpeechMs: number;
  ageMs: number;
}): boolean {
  const held = args.heldTranscript.trim();
  if (!held) return false;
  if (args.holdReason !== "continuation_hold") return false;
  if (args.ageMs < VOICE_HELD_TRANSCRIPT_FLUSH_MS) return false;
  if (args.ageMs > VOICE_HELD_TRANSCRIPT_MAX_AGE_MS) return false;
  if (args.transcribeQueueLength > 0) return false;
  if (args.speechActive || args.transcribeBusy || args.pendingConfirmation) return false;
  const turnComplete = scoreVoiceTurnComplete({
    transcript: held,
    pauseMs: Math.max(args.sinceLastSpeechMs, VOICE_TURN_CLOSE_SILENCE_MS),
    stability: 0.92,
  });
  return shouldRecoverHeldTranscriptAfterNoTranscript({
    heldTranscript: held,
    turnCompleteBand: turnComplete.band,
    transcribeQueueLength: args.transcribeQueueLength,
    speechActive: args.speechActive,
    sinceLastSpeechMs: args.sinceLastSpeechMs,
  });
}

export function shouldMergePendingConfirmationTranscript(args: {
  pendingTranscript: string;
  nextTranscript: string;
  pendingAgeMs: number;
  windowMs?: number;
}): boolean {
  const pending = args.pendingTranscript.trim();
  const next = args.nextTranscript.trim();
  if (!pending || !next) return false;
  const windowMs = args.windowMs ?? VOICE_CONTINUATION_MERGE_WINDOW_MS;
  const safeGapMs = Number.isFinite(args.pendingAgeMs) ? Math.max(0, args.pendingAgeMs) : Number.POSITIVE_INFINITY;
  if (
    shouldMergeVoiceContinuationTurn({
      previousPrompt: pending,
      nextTranscript: next,
      gapMs: safeGapMs,
      windowMs,
    })
  ) {
    return true;
  }
  if (isLowInformationTailTranscript(next)) return true;
  if (!shouldDispatchReasoningAttempt(next)) return true;
  return false;
}
