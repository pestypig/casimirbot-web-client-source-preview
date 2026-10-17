import { isHighRiskTranslationContext } from "./ask-voice-language-policy";

export const VOICE_STT_CONFIRM_THRESHOLD = 0.58;
export const VOICE_TRANSCRIPT_AUTO_CONFIRM_BLOCK_PIVOT_CONFIDENCE = 0.68;

export type TranscriptConfirmPolicyReason =
  | "dispatch_blocked"
  | "pivot_low_confidence"
  | "translation_uncertain_without_pivot"
  | "dispatch_not_confirm"
  | "invalid_confidence"
  | "low_audio_quality"
  | "live_activity"
  | "eligible";

export type TranscriptConfirmPolicyDecision = {
  action: "auto_confirm" | "manual_confirm" | "blocked";
  reason: TranscriptConfirmPolicyReason;
  confirmAutoEligible: boolean;
  confirmBlockReason: TranscriptConfirmPolicyReason | null;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function deriveTranscriptConfidence(args: {
  transcript: string;
  providerConfidence?: number | null;
  segments?: Array<{ confidence?: number }>;
}): { confidence: number; reason: string } {
  const provider = typeof args.providerConfidence === "number" && Number.isFinite(args.providerConfidence)
    ? clamp01(args.providerConfidence)
    : null;
  if (provider !== null) {
    return { confidence: provider, reason: "provider_reported" };
  }
  const segmentConfidenceValues = (args.segments ?? [])
    .map((segment) =>
      typeof segment?.confidence === "number" && Number.isFinite(segment.confidence)
        ? clamp01(segment.confidence)
        : null,
    )
    .filter((value): value is number => value !== null);
  if (segmentConfidenceValues.length > 0) {
    const avg =
      segmentConfidenceValues.reduce((sum, value) => sum + value, 0) / segmentConfidenceValues.length;
    return { confidence: clamp01(avg), reason: "segment_average" };
  }
  const text = args.transcript.trim();
  if (!text) return { confidence: 0, reason: "empty_text" };
  let score = 0.5;
  if (text.length >= 20) score += 0.12;
  if (text.length >= 56) score += 0.12;
  if (/[.!?]["')\]]?$/.test(text)) score += 0.08;
  if (/\b(and|but|or|because|so)\s*$/i.test(text)) score -= 0.08;
  if (/[\u0000-\u001FÃ¯Â¿Â½]/.test(text)) score -= 0.24;
  const normalized = text.replace(/\s+/g, "");
  if (normalized.length > 0) {
    const alnum = (normalized.match(/[A-Za-z0-9]/g) ?? []).length;
    const ratio = alnum / normalized.length;
    if (ratio < 0.45) score -= 0.12;
    if (ratio > 0.85) score += 0.04;
  }
  return { confidence: clamp01(score), reason: "heuristic_text_quality" };
}

export function shouldRequireTranscriptConfirmation(args: {
  confidence: number;
  translationUncertain: boolean;
  providerNeedsConfirmation?: boolean;
  minConfidence?: number;
}): boolean {
  if (args.providerNeedsConfirmation === true) return true;
  if (args.translationUncertain) return true;
  const minConfidence =
    typeof args.minConfidence === "number" && Number.isFinite(args.minConfidence)
      ? clamp01(args.minConfidence)
      : VOICE_STT_CONFIRM_THRESHOLD;
  return args.confidence < minConfidence;
}

export function normalizeTranscriptConfirmPolicyReason(
  value: string | null | undefined,
): TranscriptConfirmPolicyReason | null {
  if (!value) return null;
  switch (value) {
    case "dispatch_blocked":
    case "pivot_low_confidence":
    case "translation_uncertain_without_pivot":
    case "dispatch_not_confirm":
    case "invalid_confidence":
    case "low_audio_quality":
    case "live_activity":
    case "eligible":
      return value;
    default:
      return null;
  }
}

export function normalizeVoiceConfirmDispatchState(
  dispatchState?: "auto" | "confirm" | "blocked" | null,
): "auto" | "confirm" | "blocked" {
  if (dispatchState === "auto" || dispatchState === "blocked" || dispatchState === "confirm") {
    return dispatchState;
  }
  return "confirm";
}

export function isLowPivotBlocked(
  pivotConfidence?: number | null,
  translationRiskHigh?: boolean,
): TranscriptConfirmPolicyReason | null {
  if (
    translationRiskHigh &&
    typeof pivotConfidence === "number" &&
    Number.isFinite(pivotConfidence) &&
    pivotConfidence < VOICE_TRANSCRIPT_AUTO_CONFIRM_BLOCK_PIVOT_CONFIDENCE
  ) {
    return "pivot_low_confidence";
  }
  if (
    translationRiskHigh &&
    (typeof pivotConfidence !== "number" ||
      !Number.isFinite(pivotConfidence) ||
      pivotConfidence < VOICE_TRANSCRIPT_AUTO_CONFIRM_BLOCK_PIVOT_CONFIDENCE)
  ) {
    return "translation_uncertain_without_pivot";
  }
  return null;
}

export function resolveTranscriptConfirmPolicy(args: {
  dispatchState?: "auto" | "confirm" | "blocked" | null;
  confidence: number;
  pivotConfidence?: number | null;
  translationUncertain: boolean;
  sourceLanguage?: string | null;
  sourceText?: string | null;
  translated?: boolean;
  lowAudioQuality?: boolean;
  speechActive?: boolean;
  queuedSegmentCount?: number;
}): TranscriptConfirmPolicyDecision {
  const dispatchState = normalizeVoiceConfirmDispatchState(args.dispatchState);
  if (dispatchState === "blocked") {
    return {
      action: "blocked",
      reason: "dispatch_blocked",
      confirmAutoEligible: false,
      confirmBlockReason: "dispatch_blocked",
    };
  }
  const translationRiskHigh = isHighRiskTranslationContext({
    translationUncertain: args.translationUncertain,
    sourceLanguage: args.sourceLanguage ?? null,
    sourceText: args.sourceText ?? null,
    translated: args.translated ?? false,
  });
  const pivotBlock = isLowPivotBlocked(args.pivotConfidence, translationRiskHigh);
  if (pivotBlock) {
    return {
      action: "blocked",
      reason: pivotBlock,
      confirmAutoEligible: false,
      confirmBlockReason: pivotBlock,
    };
  }
  if (dispatchState !== "confirm") {
    return {
      action: "manual_confirm",
      reason: "dispatch_not_confirm",
      confirmAutoEligible: false,
      confirmBlockReason: null,
    };
  }
  if (!(args.confidence > 0)) {
    return {
      action: "manual_confirm",
      reason: "invalid_confidence",
      confirmAutoEligible: false,
      confirmBlockReason: null,
    };
  }
  if (args.lowAudioQuality === true) {
    const strongConfidence = args.confidence >= Math.max(VOICE_STT_CONFIRM_THRESHOLD + 0.16, 0.74);
    if (translationRiskHigh || !strongConfidence) {
      return {
        action: "manual_confirm",
        reason: "low_audio_quality",
        confirmAutoEligible: false,
        confirmBlockReason: null,
      };
    }
  }
  if (args.speechActive === true || (args.queuedSegmentCount ?? 0) > 0) {
    return {
      action: "manual_confirm",
      reason: "live_activity",
      confirmAutoEligible: false,
      confirmBlockReason: null,
    };
  }
  return {
    action: "auto_confirm",
    reason: "eligible",
    confirmAutoEligible: true,
    confirmBlockReason: null,
  };
}

export function shouldAutoConfirmTranscriptPrompt(args: {
  dispatchState?: "auto" | "confirm" | "blocked" | null;
  confidence: number;
  languageConfidence?: number | null;
  pivotConfidence?: number | null;
  translationUncertain: boolean;
  sourceLanguage?: string | null;
  sourceText?: string | null;
  translated?: boolean;
  lowAudioQuality?: boolean;
  speechActive?: boolean;
  queuedSegmentCount?: number;
}): boolean {
  return resolveTranscriptConfirmPolicy({
    dispatchState: args.dispatchState,
    confidence: args.confidence,
    pivotConfidence: args.pivotConfidence,
    translationUncertain: args.translationUncertain,
    sourceLanguage: args.sourceLanguage,
    sourceText: args.sourceText,
    translated: args.translated,
    lowAudioQuality: args.lowAudioQuality,
    speechActive: args.speechActive,
    queuedSegmentCount: args.queuedSegmentCount,
  }).confirmAutoEligible;
}
