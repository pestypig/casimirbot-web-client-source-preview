const VOICE_TURN_CLOSE_SILENCE_MS = 3200;
const VOICE_TURN_HASH_STABLE_DWELL_MS = 900;

export type ReasoningAttemptStatus =
  | "queued"
  | "running"
  | "streaming"
  | "done"
  | "failed"
  | "cancelled"
  | "suppressed";

export type ReasoningAttemptSource = "voice_auto" | "manual";

export type VoiceTurnAssemblerPhase = "draft" | "sealed";

export function evaluateVoiceTurnSealGate(args: {
  sinceLastSpeechMs: number;
  sttQueueDepth: number;
  sttInFlight: boolean;
  heldPending: boolean;
  hashStableDwellMs: number;
  closeSilenceMs?: number;
  hashStableMs?: number;
}): boolean {
  const closeSilenceMs = args.closeSilenceMs ?? VOICE_TURN_CLOSE_SILENCE_MS;
  const hashStableMs = args.hashStableMs ?? VOICE_TURN_HASH_STABLE_DWELL_MS;
  return (
    args.sinceLastSpeechMs >= closeSilenceMs &&
    args.sttQueueDepth <= 0 &&
    !args.sttInFlight &&
    !args.heldPending &&
    args.hashStableDwellMs >= hashStableMs
  );
}

export type VoiceReasoningResponseAuthorityDecision = {
  suppress: boolean;
  reason:
    | "ok"
    | "continuation_merged"
    | "stale_prompt"
    | "phase_not_sealed"
    | "seal_token_mismatch"
    | "sealed_revision_mismatch"
    | "dispatch_hash_mismatch"
    | "inactive_attempt";
  restart: boolean;
};

export type VoiceAuthoritySuppressionProjection = {
  suppressionReason: string;
  suppressionCause: string;
  restartDetail: string;
};

export function resolveVoiceAuthoritySuppression(
  reason: VoiceReasoningResponseAuthorityDecision["reason"],
): VoiceAuthoritySuppressionProjection {
  switch (reason) {
    case "ok":
      return {
        suppressionReason: "voice_turn_response_inactive_attempt",
        suppressionCause: "inactive_attempt",
        restartDetail: "inactive_attempt; restarting",
      };
    case "continuation_merged":
      return {
        suppressionReason: "voice_turn_continuation_merged",
        suppressionCause: "dispatch_hash_mismatch",
        restartDetail: "dispatch_hash_mismatch; restarting",
      };
    case "phase_not_sealed":
      return {
        suppressionReason: "voice_turn_response_phase_not_sealed",
        suppressionCause: "phase_not_sealed",
        restartDetail: "phase_not_sealed; restarting",
      };
    case "seal_token_mismatch":
      return {
        suppressionReason: "voice_turn_response_seal_token_mismatch",
        suppressionCause: "seal_token_mismatch",
        restartDetail: "seal_token_mismatch; restarting",
      };
    case "sealed_revision_mismatch":
      return {
        suppressionReason: "voice_turn_response_sealed_revision_mismatch",
        suppressionCause: "sealed_revision_mismatch",
        restartDetail: "sealed_revision_mismatch; restarting",
      };
    case "dispatch_hash_mismatch":
      return {
        suppressionReason: "voice_turn_response_dispatch_hash_mismatch",
        suppressionCause: "dispatch_hash_mismatch",
        restartDetail: "dispatch_hash_mismatch; restarting",
      };
    case "stale_prompt":
      return {
        suppressionReason: "voice_turn_response_stale_prompt",
        suppressionCause: "dispatch_hash_mismatch",
        restartDetail: "dispatch_hash_mismatch; restarting",
      };
    case "inactive_attempt":
      return {
        suppressionReason: "voice_turn_response_inactive_attempt",
        suppressionCause: "inactive_attempt",
        restartDetail: "inactive_attempt; restarting",
      };
    default:
      return {
        suppressionReason: "voice_turn_response_suppressed",
        suppressionCause: "inactive_attempt",
        restartDetail: "inactive_attempt; restarting",
      };
  }
}

export function evaluateVoiceReasoningResponseAuthority(args: {
  source: ReasoningAttemptSource;
  continuationRestartRequested: boolean;
  latestAskPromptForAttempt: string;
  askPromptForRequest: string;
  latestAttemptStatus?: ReasoningAttemptStatus;
  requestIntentRevision?: number;
  latestIntentRevision?: number;
  latestAttemptIntentRevision?: number;
  requestDispatchPromptHash?: string | null;
  latestDispatchPromptHash?: string | null;
  attemptTranscriptRevision?: number | null;
  latestSealedTranscriptRevision?: number | null;
  attemptSealToken?: string | null;
  latestSealToken?: string | null;
  assemblerPhase?: VoiceTurnAssemblerPhase | null;
}): VoiceReasoningResponseAuthorityDecision {
  if (args.continuationRestartRequested) {
    return { suppress: true, reason: "continuation_merged", restart: true };
  }
  if (
    args.latestAttemptStatus === "suppressed" ||
    args.latestAttemptStatus === "cancelled" ||
    args.latestAttemptStatus === "failed"
  ) {
    return { suppress: true, reason: "inactive_attempt", restart: false };
  }
  if (
    args.latestAskPromptForAttempt.length > 0 &&
    args.latestAskPromptForAttempt !== args.askPromptForRequest.trim()
  ) {
    return { suppress: true, reason: "stale_prompt", restart: true };
  }
  if (args.source !== "voice_auto") {
    return { suppress: false, reason: "ok", restart: false };
  }
  if (args.assemblerPhase && args.assemblerPhase !== "sealed") {
    return { suppress: true, reason: "phase_not_sealed", restart: false };
  }
  const attemptTranscriptRevision =
    typeof args.attemptTranscriptRevision === "number" && Number.isFinite(args.attemptTranscriptRevision)
      ? Math.max(0, Math.floor(args.attemptTranscriptRevision))
      : null;
  const latestSealedTranscriptRevision =
    typeof args.latestSealedTranscriptRevision === "number" &&
    Number.isFinite(args.latestSealedTranscriptRevision)
      ? Math.max(0, Math.floor(args.latestSealedTranscriptRevision))
      : null;
  if (
    attemptTranscriptRevision !== null &&
    latestSealedTranscriptRevision !== null &&
    attemptTranscriptRevision !== latestSealedTranscriptRevision
  ) {
    return { suppress: true, reason: "sealed_revision_mismatch", restart: false };
  }
  const attemptSealToken = args.attemptSealToken?.trim() || null;
  const latestSealToken = args.latestSealToken?.trim() || null;
  if (attemptSealToken && latestSealToken && attemptSealToken !== latestSealToken) {
    return { suppress: true, reason: "seal_token_mismatch", restart: false };
  }
  const requestIntentRevision =
    typeof args.requestIntentRevision === "number" && Number.isFinite(args.requestIntentRevision)
      ? args.requestIntentRevision
      : null;
  const latestIntentRevision =
    typeof args.latestIntentRevision === "number" && Number.isFinite(args.latestIntentRevision)
      ? args.latestIntentRevision
      : null;
  const latestAttemptIntentRevision =
    typeof args.latestAttemptIntentRevision === "number" &&
    Number.isFinite(args.latestAttemptIntentRevision)
      ? args.latestAttemptIntentRevision
      : null;
  if (
    requestIntentRevision !== null &&
    latestAttemptIntentRevision !== null &&
    requestIntentRevision !== latestAttemptIntentRevision
  ) {
    return { suppress: true, reason: "sealed_revision_mismatch", restart: true };
  }
  if (
    requestIntentRevision !== null &&
    latestIntentRevision !== null &&
    requestIntentRevision < latestIntentRevision
  ) {
    return { suppress: true, reason: "sealed_revision_mismatch", restart: true };
  }
  if (
    latestAttemptIntentRevision !== null &&
    latestIntentRevision !== null &&
    latestAttemptIntentRevision < latestIntentRevision
  ) {
    return { suppress: true, reason: "sealed_revision_mismatch", restart: true };
  }
  const requestDispatchPromptHash = args.requestDispatchPromptHash?.trim() || null;
  const latestDispatchPromptHash = args.latestDispatchPromptHash?.trim() || null;
  if (
    requestDispatchPromptHash !== null &&
    latestDispatchPromptHash !== null &&
    requestDispatchPromptHash !== latestDispatchPromptHash
  ) {
    return { suppress: true, reason: "dispatch_hash_mismatch", restart: true };
  }
  return { suppress: false, reason: "ok", restart: false };
}
