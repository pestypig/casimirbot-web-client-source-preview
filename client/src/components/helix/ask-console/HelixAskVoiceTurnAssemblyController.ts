import type { HelixInterpreterArtifact } from "@/lib/agi/api";
import type { MicArmState } from "@/lib/helix/ask-read-aloud-display";
import { hashVoiceUtteranceKey } from "@/lib/helix/ask-read-aloud-display";
import {
  HELIX_VOICE_AUTO_DISPATCH_MAX_PER_MINUTE,
  evaluateVoiceAutoDispatchGovernance,
  type VoiceAutoDispatchGovernance,
  type VoiceDispatchState,
} from "@/lib/helix/ask-voice-auto-dispatch-governance";
import { shouldMergeVoiceContinuationTurn } from "@/lib/helix/ask-voice-continuation-lexical";
import {
  shouldFlushHeldTranscriptFromWatchdog,
  shouldMergePendingConfirmationTranscript,
  shouldRecoverHeldTranscriptAfterNoTranscript,
  type HeldTranscriptReason,
} from "@/lib/helix/ask-voice-held-transcript-policy";
import {
  scoreConversationCompletion,
  scoreVoiceTurnComplete,
  type CompletionScore,
  type TurnCompleteScore,
} from "@/lib/helix/ask-voice-turn-scoring";
import { isHighRiskTranslationContext } from "@/lib/helix/ask-voice-language-policy";
import {
  deriveTranscriptConfidence,
  resolveTranscriptConfirmPolicy,
  shouldAutoConfirmTranscriptPrompt,
  shouldRequireTranscriptConfirmation,
  type TranscriptConfirmPolicyDecision,
} from "@/lib/helix/ask-voice-transcript-confidence";
import { evaluateVoiceTurnSealGate } from "@/lib/helix/voice/voice-turn-authority";
import { mergeVoiceTranscriptDraft } from "@/lib/helix/voice/voice-transcript";

export type HelixAskVoiceTurnAssemblerPhase = "draft" | "sealed";

export type HelixAskVoiceSteeringReservation = {
  reservationId: string;
  activeTurnId: string;
  expectedTurnId: string;
  timing: "during_reasoning" | "during_tool_call";
  capturedAtMs: number;
  activeAtCapture: boolean;
};

export type HelixAskVoiceInterpreterStatus =
  | "ok"
  | "timeout"
  | "parse_error"
  | "provider_error"
  | "disabled"
  | "skipped";

export type HelixAskVoiceDispatchState = "auto" | "confirm" | "blocked";

export type HelixAskVoiceTurnAssemblerState = {
  turnKey: string;
  phase: HelixAskVoiceTurnAssemblerPhase;
  hlcMs: number;
  eventSeq: number;
  transcriptRevision: number;
  sealedRevision: number;
  sealToken: string | null;
  sealedAtMs: number | null;
  draftTranscript: string;
  draftRecordedText: string;
  lastSpeechAtMs: number;
  hashStableSinceMs: number;
  currentTranscriptHash: string;
  sttQueueDepth: number;
  sttInFlight: boolean;
  heldPending: boolean;
  briefSpokenRevision: number;
  artifactRetryCountByRevision: Record<number, number>;
  sourceLanguage: string | null;
  languageDetected: string | null;
  languageConfidence: number | null;
  codeMixed: boolean;
  pivotConfidence: number | null;
  dispatchState: HelixAskVoiceDispatchState;
  langSchemaVersion: string;
  interpreter: HelixInterpreterArtifact | null;
  interpreterSchemaVersion: string | null;
  interpreterStatus: HelixAskVoiceInterpreterStatus | null;
  interpreterConfidence: number | null;
  interpreterDispatchState: HelixAskVoiceDispatchState | null;
  interpreterConfirmPrompt: string | null;
  interpreterTermIds: string[];
  interpreterConceptIds: string[];
  translated: boolean;
  sttEngine: string | null;
  confidence: number;
  confidenceReason: string | null;
  completion: CompletionScore;
  turnComplete: TurnCompleteScore;
  segmentId: string | null;
  steeringReservation: HelixAskVoiceSteeringReservation | null;
  updatedAtMs: number;
};

export type HelixAskVoiceTurnAssemblerMap = Record<string, HelixAskVoiceTurnAssemblerState>;

export const HELIX_ASK_VOICE_TURN_ASSEMBLER_MAX_ENTRIES = 64;

export type HelixAskVoiceTurnSealEvaluation = {
  sinceLastSpeechMs: number;
  hashStableDwellMs: number;
  sttQueueDepth: number;
  sttInFlight: boolean;
  heldPending: boolean;
  gateOpen: boolean;
  canSeal: boolean;
  reason:
    | "ready"
    | "already_sealed"
    | "silence_window"
    | "stt_queue"
    | "stt_busy"
    | "held_pending"
    | "hash_unstable"
    | "empty_transcript";
};

export type HelixAskVoiceAssemblerTurnKeyDecision = {
  turnKey: string;
  action: "reuse_current" | "start_new";
  reason: "no_active_turn" | "missing_state" | "sealed_without_active_attempt" | "current_turn_open";
};

export type HelixAskVoiceHeldTranscriptRecoveryEvaluation = {
  heldTranscript: string;
  sinceLastSpeechMs: number;
  turnComplete: TurnCompleteScore | null;
  recover: boolean;
};

export type HelixAskVoiceHeldTranscriptRecoveryScoringProjection = {
  heldTranscript: string;
  confidence: number;
  confidenceReason: "held_transcript_recovery";
  derivedConfidenceReason: string;
  completion: CompletionScore;
  turnComplete: TurnCompleteScore;
};

export type HelixAskVoiceTranscriptConfirmationProjection = {
  confidence: number;
  confidenceReason: string;
  translationUncertain: boolean;
  highRiskTranslationContext: boolean;
  hardMultilangBlock: boolean;
  needsConfirmation: boolean;
  effectiveConfirmDispatchState: HelixAskVoiceDispatchState;
  legacyAutoConfirmEligible: boolean;
  confirmPolicy: TranscriptConfirmPolicyDecision;
  confirmPolicyWithoutLiveActivity: TranscriptConfirmPolicyDecision;
};

export type HelixAskVoiceTranscriptScoringProjection = {
  transcript: string;
  completion: CompletionScore;
  turnComplete: TurnCompleteScore;
};

export type HelixAskVoiceHeldTranscriptWatchdogEvaluation = {
  heldTranscript: string;
  ageMs: number;
  sinceLastSpeechMs: number;
  turnComplete: TurnCompleteScore;
  shouldFlushHeld: boolean;
  shouldForceFlushExpired: boolean;
  action: "dispatch" | "reschedule" | "clear";
};

export type HelixAskVoicePendingConfirmationMergeProjection = {
  shouldMerge: boolean;
  pendingAgeMs: number;
  mergedTranscript: string;
  mergedSourceText: string;
  completion: CompletionScore;
  turnComplete: TurnCompleteScore;
};

export type HelixAskVoicePendingConfirmationPolicyProjection = {
  confidence: number;
  confidenceReason: string;
  translationUncertain: boolean;
  lowAudioQuality: boolean;
  dispatchState: HelixAskVoiceDispatchState;
  pivotConfidence: number | null;
  confirmPolicy: TranscriptConfirmPolicyDecision;
  confirmPolicyWithoutLiveActivity: TranscriptConfirmPolicyDecision;
};

export type HelixAskVoiceTranscriptConfirmAutoPolicyProjection = {
  lowAudioQuality: boolean;
  confirmPolicy: TranscriptConfirmPolicyDecision;
  confirmPolicyWithoutLiveActivity: TranscriptConfirmPolicyDecision;
  shouldAutoConfirm: boolean;
};

export type HelixAskVoiceAutoDispatchWindowProjection = {
  nowMs: number;
  prunedWindow: number[];
  nextWindow: number[];
  governance: VoiceAutoDispatchGovernance;
};

export type HelixAskVoiceHeldPrefixMergeProjection = {
  heldTranscriptPrefix: string;
  heldAgeMs: number;
  canApplyHeldPrefix: boolean;
  mergedTranscript: string;
  shouldClearHeldPrefix: boolean;
};

export function buildInitialHelixAskVoiceTurnAssemblerState(
  turnKey: string,
  nowMs = Date.now(),
): HelixAskVoiceTurnAssemblerState {
  return {
    turnKey,
    phase: "draft",
    hlcMs: nowMs,
    eventSeq: 0,
    transcriptRevision: 0,
    sealedRevision: 0,
    sealToken: null,
    sealedAtMs: null,
    draftTranscript: "",
    draftRecordedText: "",
    lastSpeechAtMs: nowMs,
    hashStableSinceMs: nowMs,
    currentTranscriptHash: "",
    sttQueueDepth: 0,
    sttInFlight: false,
    heldPending: false,
    briefSpokenRevision: 0,
    artifactRetryCountByRevision: {},
    sourceLanguage: null,
    languageDetected: null,
    languageConfidence: null,
    codeMixed: false,
    pivotConfidence: null,
    dispatchState: "auto",
    langSchemaVersion: "helix.lang.v1",
    interpreter: null,
    interpreterSchemaVersion: null,
    interpreterStatus: null,
    interpreterConfidence: null,
    interpreterDispatchState: null,
    interpreterConfirmPrompt: null,
    interpreterTermIds: [],
    interpreterConceptIds: [],
    translated: false,
    sttEngine: null,
    confidence: 0,
    confidenceReason: null,
    completion: { score: 0, route: "ask_more" },
    turnComplete: { score: 0, band: "low", reason: "insufficient_pause" },
    segmentId: null,
    steeringReservation: null,
    updatedAtMs: nowMs,
  };
}

export function buildHelixAskVoiceHeldPrefixMergeProjection(input: {
  heldTranscriptPrefix?: string | null;
  heldUpdatedAtMs?: number | null;
  nextTranscript: string;
  nowMs?: number;
  breathWindowMs: number;
  gameplayLoopMaxMs: number;
}): HelixAskVoiceHeldPrefixMergeProjection {
  const nowMs = input.nowMs ?? Date.now();
  const heldTranscriptPrefix = input.heldTranscriptPrefix?.trim() ?? "";
  const nextTranscript = input.nextTranscript.trim();
  const heldAgeMs =
    input.heldUpdatedAtMs !== null && input.heldUpdatedAtMs !== undefined
      ? Math.max(0, nowMs - input.heldUpdatedAtMs)
      : Number.POSITIVE_INFINITY;
  const canApplyHeldPrefix =
    heldTranscriptPrefix.length > 0 &&
    (heldAgeMs <= Math.max(0, input.breathWindowMs) * 2 ||
      heldAgeMs <= Math.max(0, input.gameplayLoopMaxMs) ||
      shouldMergeVoiceContinuationTurn({
        previousPrompt: heldTranscriptPrefix,
        nextTranscript,
        gapMs: heldAgeMs,
      }));
  return {
    heldTranscriptPrefix,
    heldAgeMs,
    canApplyHeldPrefix,
    mergedTranscript: canApplyHeldPrefix
      ? mergeVoiceTranscriptDraft(heldTranscriptPrefix, nextTranscript)
      : nextTranscript,
    shouldClearHeldPrefix: !canApplyHeldPrefix && heldTranscriptPrefix.length > 0,
  };
}

export function buildHelixAskVoiceAutoDispatchWindowProjection(input: {
  transcript: string;
  micArmState: MicArmState;
  confidence?: number | null;
  dispatchState?: VoiceDispatchState;
  interpreterDispatchState?: VoiceDispatchState;
  possibleTtsEcho?: boolean;
  forceReasoningAfterWorkstation?: boolean;
  queueDepth: number;
  currentWindow: readonly number[];
  nowMs?: number;
  windowMs: number;
  maxQueueDepth: number;
  maxAutoDispatchPerWindow?: number;
  isSimpleConversationTurnCandidate?: (transcript: string) => boolean;
}): HelixAskVoiceAutoDispatchWindowProjection {
  const nowMs = input.nowMs ?? Date.now();
  const windowMs = Math.max(0, input.windowMs);
  const prunedWindow = input.currentWindow
    .filter((entryMs) => Number.isFinite(entryMs) && nowMs - entryMs < windowMs)
    .map((entryMs) => Math.max(0, entryMs));
  const maxAutoDispatchPerWindow = Math.max(
    1,
    Math.floor(input.maxAutoDispatchPerWindow ?? HELIX_VOICE_AUTO_DISPATCH_MAX_PER_MINUTE),
  );
  const governance = evaluateVoiceAutoDispatchGovernance({
    transcript: input.transcript,
    micArmState: input.micArmState,
    confidence: input.confidence,
    dispatchState: input.dispatchState,
    interpreterDispatchState: input.interpreterDispatchState,
    possibleTtsEcho: input.possibleTtsEcho,
    forceReasoningAfterWorkstation: input.forceReasoningAfterWorkstation,
    queueDepth: input.queueDepth,
    activeDispatchCount: prunedWindow.length,
    maxAutoDispatchPerWindow,
    maxQueueDepth: input.maxQueueDepth,
    isSimpleConversationTurnCandidate: input.isSimpleConversationTurnCandidate,
  });
  return {
    nowMs,
    prunedWindow,
    nextWindow: governance.admitted
      ? [...prunedWindow, nowMs].slice(-maxAutoDispatchPerWindow)
      : prunedWindow,
    governance,
  };
}

export function buildHelixAskVoicePendingConfirmationMergeProjection(input: {
  pendingTranscript: string;
  pendingSourceText?: string | null;
  pendingCreatedAtMs?: number | null;
  nextTranscript: string;
  nextSourceText?: string | null;
  nowMs?: number;
  pauseMs: number;
  stability?: number;
}): HelixAskVoicePendingConfirmationMergeProjection {
  const nowMs = input.nowMs ?? Date.now();
  const pendingAgeMs = Math.max(0, nowMs - (input.pendingCreatedAtMs ?? nowMs));
  const shouldMerge = shouldMergePendingConfirmationTranscript({
    pendingTranscript: input.pendingTranscript,
    nextTranscript: input.nextTranscript,
    pendingAgeMs,
  });
  const mergedTranscript = shouldMerge
    ? mergeVoiceTranscriptDraft(input.pendingTranscript, input.nextTranscript)
    : input.pendingTranscript.trim();
  const mergedSourceText = shouldMerge
    ? mergeVoiceTranscriptDraft(
        input.pendingSourceText?.trim() || input.pendingTranscript,
        input.nextSourceText?.trim() || input.nextTranscript,
      )
    : input.pendingSourceText?.trim() || input.pendingTranscript.trim();
  const stability = input.stability ?? 1;
  return {
    shouldMerge,
    pendingAgeMs,
    mergedTranscript,
    mergedSourceText,
    completion: scoreConversationCompletion({
      transcript: mergedTranscript,
      pauseMs: input.pauseMs,
      stability,
    }),
    turnComplete: scoreVoiceTurnComplete({
      transcript: mergedTranscript,
      pauseMs: input.pauseMs,
      stability,
    }),
  };
}

function resolveHelixAskVoiceLowAudioQuality(input: {
  segmentLowAudioQuality?: boolean | null;
  speechProbability?: number | null;
  snrDb?: number | null;
  lowQualitySpeechProbability: number;
  lowQualitySnrDb: number;
}): boolean {
  if (input.segmentLowAudioQuality === true) return true;
  const speechProbability = input.speechProbability;
  const snrDb = input.snrDb;
  return (
    (typeof speechProbability === "number" && speechProbability < input.lowQualitySpeechProbability) ||
    (typeof snrDb === "number" && snrDb < input.lowQualitySnrDb)
  );
}

export function buildHelixAskVoicePendingConfirmationPolicyProjection(input: {
  transcript: string;
  providerConfidence?: number | null;
  segments?: Array<{ confidence?: number }>;
  translated: boolean;
  previousTranslationUncertain?: boolean | null;
  providerTranslationUncertain?: boolean | null;
  translationConfirmThreshold: number;
  sourceLanguage?: string | null;
  sourceText?: string | null;
  dispatchState?: HelixAskVoiceDispatchState | null;
  pivotConfidence?: number | null;
  segmentLowAudioQuality?: boolean | null;
  speechProbability?: number | null;
  snrDb?: number | null;
  lowQualitySpeechProbability: number;
  lowQualitySnrDb: number;
  speechActive: boolean;
  queuedSegmentCount: number;
}): HelixAskVoicePendingConfirmationPolicyProjection {
  const confidenceMeta = deriveTranscriptConfidence({
    transcript: input.transcript,
    providerConfidence: input.providerConfidence ?? null,
    segments: input.segments,
  });
  const translationUncertain =
    input.previousTranslationUncertain === true ||
    input.providerTranslationUncertain === true ||
    (input.translated && confidenceMeta.confidence < input.translationConfirmThreshold);
  const lowAudioQuality = resolveHelixAskVoiceLowAudioQuality({
    segmentLowAudioQuality: input.segmentLowAudioQuality,
    speechProbability: input.speechProbability,
    snrDb: input.snrDb,
    lowQualitySpeechProbability: input.lowQualitySpeechProbability,
    lowQualitySnrDb: input.lowQualitySnrDb,
  });
  const dispatchState = input.dispatchState ?? "confirm";
  const policyInput = {
    dispatchState,
    confidence: confidenceMeta.confidence,
    pivotConfidence: typeof input.pivotConfidence === "number" ? input.pivotConfidence : null,
    translationUncertain,
    sourceLanguage: input.sourceLanguage ?? null,
    sourceText: input.sourceText ?? null,
    translated: input.translated,
    lowAudioQuality,
  };
  return {
    confidence: confidenceMeta.confidence,
    confidenceReason: confidenceMeta.reason,
    translationUncertain,
    lowAudioQuality,
    dispatchState,
    pivotConfidence: policyInput.pivotConfidence,
    confirmPolicy: resolveTranscriptConfirmPolicy({
      ...policyInput,
      speechActive: input.speechActive,
      queuedSegmentCount: input.queuedSegmentCount,
    }),
    confirmPolicyWithoutLiveActivity: resolveTranscriptConfirmPolicy({
      ...policyInput,
      speechActive: false,
      queuedSegmentCount: 0,
    }),
  };
}

export function resolveHelixAskVoiceAssemblerTurnKeyForIncomingSegment(input: {
  currentTurnKey?: string | null;
  currentState?: HelixAskVoiceTurnAssemblerState | null;
  hasActiveAttemptForCurrentTurn: boolean;
  nextTurnKey: string;
}): HelixAskVoiceAssemblerTurnKeyDecision {
  const currentTurnKey = input.currentTurnKey?.trim() || null;
  const nextTurnKey = input.nextTurnKey.trim();
  if (!nextTurnKey) {
    throw new Error("nextTurnKey is required for voice assembler turn selection");
  }
  if (!currentTurnKey) {
    return {
      turnKey: nextTurnKey,
      action: "start_new",
      reason: "no_active_turn",
    };
  }
  if (!input.currentState) {
    return {
      turnKey: nextTurnKey,
      action: "start_new",
      reason: "missing_state",
    };
  }
  if (input.currentState.phase === "sealed" && !input.hasActiveAttemptForCurrentTurn) {
    return {
      turnKey: nextTurnKey,
      action: "start_new",
      reason: "sealed_without_active_attempt",
    };
  }
  return {
    turnKey: currentTurnKey,
    action: "reuse_current",
    reason: "current_turn_open",
  };
}

export function evaluateHelixAskVoiceHeldTranscriptRecovery(input: {
  heldTranscript: string;
  nowMs?: number;
  lastSpeechAtMs?: number | null;
  transcribeQueueLength: number;
  speechActive: boolean;
  pauseMs: number;
  stability?: number;
}): HelixAskVoiceHeldTranscriptRecoveryEvaluation {
  const heldTranscript = input.heldTranscript.trim();
  const nowMs = input.nowMs ?? Date.now();
  const sinceLastSpeechMs =
    input.lastSpeechAtMs !== null && input.lastSpeechAtMs !== undefined
      ? Math.max(0, nowMs - input.lastSpeechAtMs)
      : Number.POSITIVE_INFINITY;
  const turnComplete = heldTranscript
    ? scoreVoiceTurnComplete({
        transcript: heldTranscript,
        pauseMs: input.pauseMs,
        stability: input.stability ?? 0.92,
      })
    : null;
  const recover =
    turnComplete !== null &&
    shouldRecoverHeldTranscriptAfterNoTranscript({
      heldTranscript,
      turnCompleteBand: turnComplete.band,
      transcribeQueueLength: input.transcribeQueueLength,
      speechActive: input.speechActive,
      sinceLastSpeechMs,
    });
  return {
    heldTranscript,
    sinceLastSpeechMs,
    turnComplete,
    recover,
  };
}

export function buildHelixAskVoiceTranscriptScoringProjection(input: {
  transcript: string;
  pauseMs: number;
  stability?: number;
}): HelixAskVoiceTranscriptScoringProjection {
  const transcript = input.transcript.trim();
  const stability = input.stability ?? 1;
  return {
    transcript,
    completion: scoreConversationCompletion({
      transcript,
      pauseMs: input.pauseMs,
      stability,
    }),
    turnComplete: scoreVoiceTurnComplete({
      transcript,
      pauseMs: input.pauseMs,
      stability,
    }),
  };
}

export function buildHelixAskVoiceTranscriptConfirmationProjection(input: {
  transcript: string;
  providerConfidence?: number | null;
  segments?: Array<{ confidence?: number }>;
  translated: boolean;
  providerTranslationUncertain?: boolean;
  translationConfirmThreshold: number;
  sourceLanguage?: string | null;
  sourceText?: string | null;
  dispatchState?: HelixAskVoiceDispatchState | null;
  providerNeedsConfirmation?: boolean;
  confirmThreshold: number;
  languageConfidence?: number | null;
  pivotConfidence?: number | null;
  lowAudioQuality: boolean;
  speechActive: boolean;
  queuedSegmentCount: number;
}): HelixAskVoiceTranscriptConfirmationProjection {
  const confidenceMeta = deriveTranscriptConfidence({
    transcript: input.transcript,
    providerConfidence: input.providerConfidence ?? null,
    segments: input.segments,
  });
  const translationUncertain =
    input.providerTranslationUncertain === true ||
    (input.translated && confidenceMeta.confidence < input.translationConfirmThreshold);
  const highRiskTranslationContext = isHighRiskTranslationContext({
    translationUncertain,
    translated: input.translated,
    sourceLanguage: input.sourceLanguage ?? null,
    sourceText: input.sourceText ?? null,
  });
  const providerDispatchBlocked = input.dispatchState === "blocked";
  const honorProviderDispatchBlock = providerDispatchBlocked && highRiskTranslationContext;
  const hardMultilangBlock =
    honorProviderDispatchBlock ||
    (highRiskTranslationContext &&
      typeof input.pivotConfidence === "number" &&
      input.pivotConfidence < 0.68);
  const needsConfirmation =
    hardMultilangBlock ||
    shouldRequireTranscriptConfirmation({
      confidence: confidenceMeta.confidence,
      translationUncertain,
      providerNeedsConfirmation: input.providerNeedsConfirmation === true,
      minConfidence: input.confirmThreshold,
    });
  const effectiveConfirmDispatchState: HelixAskVoiceDispatchState = hardMultilangBlock
    ? "blocked"
    : needsConfirmation
      ? "confirm"
      : input.dispatchState ?? "auto";
  const policyInput = {
    dispatchState: effectiveConfirmDispatchState,
    confidence: confidenceMeta.confidence,
    pivotConfidence: typeof input.pivotConfidence === "number" ? input.pivotConfidence : null,
    translationUncertain,
    sourceLanguage: input.sourceLanguage ?? null,
    sourceText: input.sourceText ?? null,
    translated: input.translated,
    lowAudioQuality: input.lowAudioQuality,
  };
  return {
    confidence: confidenceMeta.confidence,
    confidenceReason: confidenceMeta.reason,
    translationUncertain,
    highRiskTranslationContext,
    hardMultilangBlock,
    needsConfirmation,
    effectiveConfirmDispatchState,
    legacyAutoConfirmEligible: shouldAutoConfirmTranscriptPrompt({
      dispatchState: effectiveConfirmDispatchState,
      confidence: confidenceMeta.confidence,
      languageConfidence: input.languageConfidence,
      pivotConfidence: input.pivotConfidence,
      translationUncertain,
      sourceLanguage: input.sourceLanguage ?? null,
      sourceText: input.sourceText ?? null,
      translated: input.translated,
    }),
    confirmPolicy: resolveTranscriptConfirmPolicy({
      ...policyInput,
      speechActive: input.speechActive,
      queuedSegmentCount: input.queuedSegmentCount,
    }),
    confirmPolicyWithoutLiveActivity: resolveTranscriptConfirmPolicy({
      ...policyInput,
      speechActive: false,
      queuedSegmentCount: 0,
    }),
  };
}

export function buildHelixAskVoiceTranscriptConfirmAutoPolicyProjection(input: {
  dispatchState: HelixAskVoiceDispatchState;
  confidence: number;
  languageConfidence?: number | null;
  pivotConfidence?: number | null;
  translationUncertain: boolean;
  sourceLanguage?: string | null;
  sourceText?: string | null;
  translated: boolean;
  speechProbability?: number | null;
  snrDb?: number | null;
  lowQualitySpeechProbability: number;
  lowQualitySnrDb: number;
  speechActive: boolean;
  queuedSegmentCount: number;
  confirmV2Active: boolean;
}): HelixAskVoiceTranscriptConfirmAutoPolicyProjection {
  const lowAudioQuality = resolveHelixAskVoiceLowAudioQuality({
    speechProbability: input.speechProbability,
    snrDb: input.snrDb,
    lowQualitySpeechProbability: input.lowQualitySpeechProbability,
    lowQualitySnrDb: input.lowQualitySnrDb,
  });
  const policyInput = {
    dispatchState: input.dispatchState,
    confidence: input.confidence,
    pivotConfidence: typeof input.pivotConfidence === "number" ? input.pivotConfidence : null,
    translationUncertain: input.translationUncertain,
    sourceLanguage: input.sourceLanguage ?? null,
    sourceText: input.sourceText ?? null,
    translated: input.translated,
    lowAudioQuality,
  };
  const confirmPolicy = resolveTranscriptConfirmPolicy({
    ...policyInput,
    speechActive: input.speechActive,
    queuedSegmentCount: input.queuedSegmentCount,
  });
  const confirmPolicyWithoutLiveActivity = resolveTranscriptConfirmPolicy({
    ...policyInput,
    speechActive: false,
    queuedSegmentCount: 0,
  });
  return {
    lowAudioQuality,
    confirmPolicy,
    confirmPolicyWithoutLiveActivity,
    shouldAutoConfirm: input.confirmV2Active
      ? confirmPolicyWithoutLiveActivity.confirmAutoEligible
      : shouldAutoConfirmTranscriptPrompt({
          dispatchState: input.dispatchState,
          confidence: input.confidence,
          languageConfidence: input.languageConfidence,
          pivotConfidence: input.pivotConfidence,
          translationUncertain: input.translationUncertain,
          sourceLanguage: input.sourceLanguage ?? null,
          sourceText: input.sourceText ?? null,
          translated: input.translated,
        }),
  };
}

export function buildHelixAskVoiceHeldTranscriptRecoveryScoringProjection(input: {
  heldTranscript: string;
  turnComplete: TurnCompleteScore;
  minConfidence: number;
  pauseMs: number;
  stability?: number;
}): HelixAskVoiceHeldTranscriptRecoveryScoringProjection {
  const heldTranscript = input.heldTranscript.trim();
  const derivedConfidence = deriveTranscriptConfidence({ transcript: heldTranscript });
  const stability = input.stability ?? 0.92;
  return {
    heldTranscript,
    confidence: Math.max(input.minConfidence, derivedConfidence.confidence),
    confidenceReason: "held_transcript_recovery",
    derivedConfidenceReason: derivedConfidence.reason,
    completion: scoreConversationCompletion({
      transcript: heldTranscript,
      pauseMs: input.pauseMs,
      stability,
    }),
    turnComplete: input.turnComplete,
  };
}

export function evaluateHelixAskVoiceHeldTranscriptWatchdog(input: {
  heldTranscript: string;
  holdReason: HeldTranscriptReason;
  updatedAtMs: number;
  nowMs?: number;
  lastSpeechAtMs?: number | null;
  transcribeQueueLength: number;
  speechActive: boolean;
  transcribeBusy: boolean;
  pendingConfirmation: boolean;
  micArmed: boolean;
  maxAgeMs: number;
  recoveryPauseMs: number;
  stability?: number;
}): HelixAskVoiceHeldTranscriptWatchdogEvaluation {
  const heldTranscript = input.heldTranscript.trim();
  const nowMs = input.nowMs ?? Date.now();
  const ageMs = Math.max(0, nowMs - input.updatedAtMs);
  const sinceLastSpeechMs =
    input.lastSpeechAtMs !== null && input.lastSpeechAtMs !== undefined
      ? Math.max(0, nowMs - input.lastSpeechAtMs)
      : Number.POSITIVE_INFINITY;
  const shouldFlushHeld = shouldFlushHeldTranscriptFromWatchdog({
    heldTranscript,
    holdReason: input.holdReason,
    transcribeQueueLength: input.transcribeQueueLength,
    speechActive: input.speechActive,
    transcribeBusy: input.transcribeBusy,
    pendingConfirmation: input.pendingConfirmation,
    sinceLastSpeechMs,
    ageMs,
  });
  const turnComplete = scoreVoiceTurnComplete({
    transcript: heldTranscript,
    pauseMs: Math.max(sinceLastSpeechMs, input.recoveryPauseMs),
    stability: input.stability ?? 0.92,
  });
  const shouldForceFlushExpired =
    input.holdReason === "continuation_hold" &&
    ageMs >= input.maxAgeMs &&
    input.transcribeQueueLength === 0 &&
    !input.speechActive &&
    !input.transcribeBusy &&
    !input.pendingConfirmation &&
    shouldRecoverHeldTranscriptAfterNoTranscript({
      heldTranscript,
      turnCompleteBand: turnComplete.band,
      transcribeQueueLength: input.transcribeQueueLength,
      speechActive: input.speechActive,
      sinceLastSpeechMs,
    });
  return {
    heldTranscript,
    ageMs,
    sinceLastSpeechMs,
    turnComplete,
    shouldFlushHeld,
    shouldForceFlushExpired,
    action: shouldFlushHeld || shouldForceFlushExpired
      ? "dispatch"
      : !input.micArmed || ageMs >= input.maxAgeMs
        ? "clear"
        : "reschedule",
  };
}

export function updateHelixAskVoiceTurnAssemblerState(
  map: HelixAskVoiceTurnAssemblerMap,
  turnKey: string,
  updater: (current: HelixAskVoiceTurnAssemblerState) => HelixAskVoiceTurnAssemblerState,
  options: {
    nowMs?: number;
    maxEntries?: number;
  } = {},
): HelixAskVoiceTurnAssemblerState {
  const current = map[turnKey] ?? buildInitialHelixAskVoiceTurnAssemblerState(turnKey, options.nowMs);
  const nowMs = options.nowMs ?? Date.now();
  const nextHlcMs = Math.max(nowMs, current.hlcMs + 1);
  const nextEventSeq = current.eventSeq + 1;
  const next = {
    ...updater(current),
    turnKey,
    hlcMs: nextHlcMs,
    eventSeq: nextEventSeq,
    updatedAtMs: nowMs,
  };
  map[turnKey] = next;

  const maxEntries = options.maxEntries ?? HELIX_ASK_VOICE_TURN_ASSEMBLER_MAX_ENTRIES;
  const keys = Object.keys(map);
  if (keys.length > maxEntries) {
    const dropKeys = keys
      .sort((a, b) => (map[a]?.updatedAtMs ?? 0) - (map[b]?.updatedAtMs ?? 0))
      .slice(0, keys.length - maxEntries);
    for (const dropKey of dropKeys) {
      delete map[dropKey];
    }
  }

  return next;
}

export function buildHelixAskVoiceTurnDraftUpdate(input: {
  current: HelixAskVoiceTurnAssemblerState;
  transcript: string;
  recordedText?: string | null;
  segmentId: string;
  sourceLanguage: string | null;
  languageDetected?: string | null;
  languageConfidence?: number | null;
  codeMixed?: boolean;
  pivotConfidence?: number | null;
  dispatchState?: HelixAskVoiceDispatchState | null;
  langSchemaVersion?: string | null;
  interpreter?: HelixInterpreterArtifact | null;
  interpreterSchemaVersion?: string | null;
  interpreterStatus?: HelixAskVoiceInterpreterStatus | null;
  interpreterConfidence?: number | null;
  interpreterDispatchState?: HelixAskVoiceDispatchState | null;
  interpreterConfirmPrompt?: string | null;
  interpreterTermIds?: string[];
  interpreterConceptIds?: string[];
  translated: boolean;
  sttEngine: string | null;
  confidence: number;
  confidenceReason: string | null;
  completion: CompletionScore;
  turnComplete: TurnCompleteScore;
  steeringReservation?: HelixAskVoiceSteeringReservation | null;
  nowMs?: number;
  lastSpeechAtMs?: number | null;
  sttQueueDepth: number;
  sttInFlight: boolean;
  heldPending: boolean;
}): HelixAskVoiceTurnAssemblerState {
  const nowMs = input.nowMs ?? Date.now();
  const transcript = input.transcript.trim();
  const mergedTranscript = mergeVoiceTranscriptDraft(input.current.draftTranscript, transcript);
  const mergedRecordedText = mergeVoiceTranscriptDraft(
    input.current.draftRecordedText || input.current.draftTranscript,
    input.recordedText || transcript,
  );
  const nextHash = hashVoiceUtteranceKey(mergedTranscript);
  const hashStableSinceMs =
    nextHash === input.current.currentTranscriptHash ? input.current.hashStableSinceMs : nowMs;

  return {
    ...input.current,
    phase: "draft",
    transcriptRevision: input.current.transcriptRevision + 1,
    sealToken: null,
    sealedAtMs: null,
    draftTranscript: mergedTranscript,
    draftRecordedText: mergedRecordedText,
    lastSpeechAtMs: input.lastSpeechAtMs ?? nowMs,
    hashStableSinceMs,
    currentTranscriptHash: nextHash,
    sttQueueDepth: input.sttQueueDepth,
    sttInFlight: input.sttInFlight,
    heldPending: input.heldPending,
    sourceLanguage: input.sourceLanguage,
    languageDetected: input.languageDetected ?? input.current.languageDetected ?? input.sourceLanguage,
    languageConfidence: input.languageConfidence ?? input.current.languageConfidence ?? null,
    codeMixed: input.codeMixed ?? input.current.codeMixed,
    pivotConfidence: input.pivotConfidence ?? input.current.pivotConfidence ?? null,
    dispatchState: input.dispatchState ?? input.current.dispatchState,
    langSchemaVersion: input.langSchemaVersion ?? input.current.langSchemaVersion ?? "helix.lang.v1",
    interpreter: input.interpreter ?? input.current.interpreter,
    interpreterSchemaVersion: input.interpreterSchemaVersion ?? input.current.interpreterSchemaVersion,
    interpreterStatus: input.interpreterStatus ?? input.current.interpreterStatus,
    interpreterConfidence: input.interpreterConfidence ?? input.current.interpreterConfidence ?? null,
    interpreterDispatchState: input.interpreterDispatchState ?? input.current.interpreterDispatchState,
    interpreterConfirmPrompt: input.interpreterConfirmPrompt ?? input.current.interpreterConfirmPrompt,
    interpreterTermIds: input.interpreterTermIds ?? input.current.interpreterTermIds ?? [],
    interpreterConceptIds: input.interpreterConceptIds ?? input.current.interpreterConceptIds ?? [],
    translated: input.translated,
    sttEngine: input.sttEngine,
    confidence: input.confidence,
    confidenceReason: input.confidenceReason,
    completion: input.completion,
    turnComplete: input.turnComplete,
    segmentId: input.segmentId,
    steeringReservation: input.steeringReservation ?? input.current.steeringReservation ?? null,
  };
}

export function evaluateHelixAskVoiceTurnSeal(input: {
  state: HelixAskVoiceTurnAssemblerState;
  nowMs?: number;
  lastSpeechAtMs?: number | null;
  sttQueueDepth: number;
  sttInFlight: boolean;
  heldPending: boolean;
  closeSilenceMs?: number;
  hashStableMs?: number;
}): HelixAskVoiceTurnSealEvaluation {
  const nowMs = input.nowMs ?? Date.now();
  const sinceLastSpeechMs =
    input.lastSpeechAtMs !== null && input.lastSpeechAtMs !== undefined
      ? Math.max(0, nowMs - input.lastSpeechAtMs)
      : Number.POSITIVE_INFINITY;
  const hashStableDwellMs = Math.max(0, nowMs - input.state.hashStableSinceMs);
  const gateOpen = evaluateVoiceTurnSealGate({
    sinceLastSpeechMs,
    sttQueueDepth: input.sttQueueDepth,
    sttInFlight: input.sttInFlight,
    heldPending: input.heldPending,
    hashStableDwellMs,
    closeSilenceMs: input.closeSilenceMs,
    hashStableMs: input.hashStableMs,
  });

  let reason: HelixAskVoiceTurnSealEvaluation["reason"] = "ready";
  if (input.state.phase === "sealed") {
    reason = "already_sealed";
  } else if (sinceLastSpeechMs < (input.closeSilenceMs ?? 3200)) {
    reason = "silence_window";
  } else if (input.sttQueueDepth > 0) {
    reason = "stt_queue";
  } else if (input.sttInFlight) {
    reason = "stt_busy";
  } else if (input.heldPending) {
    reason = "held_pending";
  } else if (hashStableDwellMs < (input.hashStableMs ?? 900)) {
    reason = "hash_unstable";
  } else if (input.state.transcriptRevision <= 0 || !input.state.draftTranscript.trim()) {
    reason = "empty_transcript";
  }

  return {
    sinceLastSpeechMs,
    hashStableDwellMs,
    sttQueueDepth: input.sttQueueDepth,
    sttInFlight: input.sttInFlight,
    heldPending: input.heldPending,
    gateOpen,
    canSeal: input.state.phase === "draft" && gateOpen && reason === "ready",
    reason,
  };
}

export function buildHelixAskVoiceTurnRuntimeStateRefresh(input: {
  current: HelixAskVoiceTurnAssemblerState;
  sttQueueDepth: number;
  sttInFlight: boolean;
  heldPending: boolean;
  lastSpeechAtMs?: number | null;
}): HelixAskVoiceTurnAssemblerState {
  return {
    ...input.current,
    sttQueueDepth: input.sttQueueDepth,
    sttInFlight: input.sttInFlight,
    heldPending: input.heldPending,
    lastSpeechAtMs: input.lastSpeechAtMs ?? input.current.lastSpeechAtMs,
  };
}

export function buildHelixAskVoiceTurnSealUpdate(input: {
  current: HelixAskVoiceTurnAssemblerState;
  sealToken: string;
  nowMs?: number;
  sttQueueDepth: number;
  sttInFlight: boolean;
  heldPending: boolean;
  sealedRevision?: number | null;
}): HelixAskVoiceTurnAssemblerState {
  return {
    ...input.current,
    phase: "sealed",
    sealedRevision: input.sealedRevision ?? input.current.transcriptRevision,
    sealToken: input.sealToken,
    sealedAtMs: input.nowMs ?? Date.now(),
    sttQueueDepth: input.sttQueueDepth,
    sttInFlight: input.sttInFlight,
    heldPending: input.heldPending,
  };
}
