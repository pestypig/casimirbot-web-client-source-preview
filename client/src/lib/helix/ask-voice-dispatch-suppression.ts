import {
  extractLatestContinuationQuestionFocus,
  isLowInformationTailTranscript,
} from "@/lib/helix/ask-voice-continuation-lexical";
import { clipText } from "@/lib/helix/ask-value-normalization";

export type VoiceTimelineSuppressionEntryType =
  | "conversation_recorded"
  | "conversation_brief"
  | "reasoning_attempt"
  | "reasoning_stream"
  | "reasoning_final"
  | "action_receipt"
  | "suppressed";

export type VoiceTimelineSuppressionStatus =
  | "queued"
  | "running"
  | "streaming"
  | "done"
  | "failed"
  | "suppressed";

export function shouldDispatchReasoningAttempt(transcript: string): boolean {
  const normalized = transcript.trim().toLowerCase();
  if (!normalized) return false;
  const text = normalized
    .replace(/^(?:(?:ok(?:ay)?)|yeah|yep|nope|thanks|thank you|cool|nice|right|well|so|um|uh)\b[,\s:-]*/g, "")
    .trim();
  const effective = text || normalized;
  if (effective.length < 14) return false;
  if (/^(ok|okay|yeah|yep|nope|thanks|thank you|cool|nice|right)\b$/.test(effective)) return false;
  const hasCodebaseCue =
    /\b(codebase|code base|repo|repository|source code|file|files|module|function|class|route|api)\b/.test(
      effective,
    );
  const hasTechnicalTopicCue = /\b(warp bubble|alcubierre|casimir|helix|retrieval)\b/.test(effective);
  const hasQuestionWordAnywhere = /\b(what|how|why|where|which|who|when)\b/.test(effective);
  const hasSolveOrDefinitionCue = /\b(full solve|solve|solved|definition|define|defined|explain)\b/.test(
    effective,
  );
  const hasVerificationCue = /\b(verify|prove|check|pass fail|certificate|integrity|evidence|risk|decision)\b/.test(
    effective,
  );
  const hasExecutionCue = /\b(implement|fix|change|update|remove|add|create|run|patch|deploy|execute)\b/.test(
    effective,
  );
  const hasMonitoringCue = /\b(what changed|status|monitor|state|watch)\b/.test(effective);
  const hasOperationalCue = hasVerificationCue || hasExecutionCue || hasMonitoringCue;
  if (
    (hasQuestionWordAnywhere || hasSolveOrDefinitionCue || effective.includes("?")) &&
    (hasCodebaseCue || hasTechnicalTopicCue)
  ) {
    return true;
  }
  if (hasOperationalCue) {
    return true;
  }
  const hasReasoningFramingCue = /\b(how|why|explain|define|walk me through|full solve|tell me about|break down|understand)\b/.test(
    effective,
  );
  if (hasReasoningFramingCue && (hasCodebaseCue || hasTechnicalTopicCue || hasSolveOrDefinitionCue)) {
    return true;
  }
  if (
    effective.includes("?") &&
    effective.length >= 16 &&
    (hasCodebaseCue || hasTechnicalTopicCue || hasSolveOrDefinitionCue || hasOperationalCue)
  ) {
    return true;
  }
  return false;
}

export function inferSuppressionCauseFromRouteReason(routeReasonCode?: string | null): string | null {
  const normalized = (routeReasonCode ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (!normalized.startsWith("suppressed:")) return null;
  const reason = normalized.slice("suppressed:".length).trim();
  if (!reason) return null;
  if (reason === "heuristic_low_salience") return "low_salience";
  if (reason === "clarify_after_attempt1") return "clarifier_requested";
  if (reason === "multilang_dispatch_blocked") return "multilang_dispatch_blocked";
  if (reason === "multilang_confirmation_required") return "multilang_confirmation_required";
  if (reason === "filler") return "filler";
  if (reason === "low_salience") return "low_salience";
  return `suppressed_${reason.replace(/[^a-z0-9_:-]+/g, "_")}`;
}

export function deriveVoiceTimelineSuppressionMeta(args: {
  status: VoiceTimelineSuppressionStatus;
  type: VoiceTimelineSuppressionEntryType;
  detail?: string | null;
  meta?: Record<string, unknown> | null;
}): {
  suppressionCause: string | null;
  authorityRejectStage: "preflight" | "stream" | "final" | null;
} {
  const meta = args.meta ?? {};
  const detailLower = `${args.detail ?? ""}`.trim().toLowerCase();
  const explicitSuppressionCause =
    typeof meta.suppressionCause === "string" && meta.suppressionCause.trim()
      ? meta.suppressionCause.trim()
      : null;
  const routeSuppressionCause = inferSuppressionCauseFromRouteReason(
    typeof meta.routeReasonCode === "string" ? meta.routeReasonCode : null,
  );
  let suppressionCause = explicitSuppressionCause ?? routeSuppressionCause;

  if (!suppressionCause) {
    if (
      detailLower.includes("phase_not_sealed") ||
      detailLower.includes("seal_token_mismatch") ||
      detailLower.includes("sealed_revision_mismatch") ||
      detailLower.includes("dispatch_hash_mismatch") ||
      detailLower.includes("inactive_attempt")
    ) {
      if (detailLower.includes("phase_not_sealed")) suppressionCause = "phase_not_sealed";
      else if (detailLower.includes("seal_token_mismatch")) suppressionCause = "seal_token_mismatch";
      else if (detailLower.includes("sealed_revision_mismatch")) suppressionCause = "sealed_revision_mismatch";
      else if (detailLower.includes("dispatch_hash_mismatch")) suppressionCause = "dispatch_hash_mismatch";
      else suppressionCause = "inactive_attempt";
    } else if (detailLower.includes("superseded by newer")) {
      suppressionCause = "inactive_attempt";
    } else if (detailLower.includes("artifact-dominated") || detailLower.includes("artifact guard")) {
      suppressionCause = "artifact_guard_restart";
    } else if (detailLower.includes("clarifier requested")) {
      suppressionCause = "clarifier_requested";
    } else if (detailLower.includes("escalat")) {
      suppressionCause = "escalation_restart";
    } else if (args.status === "suppressed") {
      suppressionCause = "suppressed_unspecified";
    }
  }

  const explicitAuthorityRejectStage =
    meta.authorityRejectStage === "preflight" ||
    meta.authorityRejectStage === "stream" ||
    meta.authorityRejectStage === "final"
      ? meta.authorityRejectStage
      : null;
  const authorityRejectStage =
    explicitAuthorityRejectStage ?? (suppressionCause ? (args.type === "reasoning_stream" ? "stream" : "final") : null);

  return {
    suppressionCause: suppressionCause ?? null,
    authorityRejectStage,
  };
}

export function isStrongQuestionDispatchCandidate(transcript: string): boolean {
  const normalized = transcript.trim().toLowerCase();
  if (!normalized || normalized.length < 18) return false;
  if (isLowInformationTailTranscript(normalized)) return false;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < 5) return false;
  const normalizedLeadStripped = normalized
    .replace(/^(?:(?:and|so|then|well|okay|ok)|you know|you found)\b[,\s:-]*/g, "")
    .trim();
  const startsWithQuestionWord =
    /^(what|how|why|where|which|who|when|can|could|would|should|is|are|do|does|did)\b/.test(
      normalizedLeadStripped || normalized,
    );
  const hasQuestionPunctuation = normalized.includes("?");
  const hasEmbeddedQuestionCue = /\b(what|how|why|where|which|who|when)\b/.test(normalized);
  const hasSolveOrDefinitionCue = /\b(full solve|solve|solved|definition|define|defined|explain)\b/.test(
    normalized,
  );
  if (!startsWithQuestionWord && !hasQuestionPunctuation && !hasEmbeddedQuestionCue && !hasSolveOrDefinitionCue) {
    return false;
  }
  const hasCodebaseCue =
    /\b(codebase|code base|repo|repository|source code|file|files|module|function|class|route|api)\b/.test(
      normalized,
    );
  const hasTechnicalTopicCue = /\b(warp bubble|alcubierre|casimir|helix|retrieval)\b/.test(normalized);
  return hasCodebaseCue || hasTechnicalTopicCue;
}

export function shouldForceObserveDispatchFromSuppression(args: {
  dispatchHint: boolean;
  routeReasonCode?: string | null;
  transcript: string;
}): boolean {
  if (args.dispatchHint) return false;
  const normalizedRoute = (args.routeReasonCode ?? "").trim().toLowerCase();
  const transcript = args.transcript.trim();
  if (transcript.length < 20) return false;
  if (isLowInformationTailTranscript(transcript)) return false;
  if (transcript.split(/\s+/).filter(Boolean).length < 4) return false;
  if (
    normalizedRoute === "suppressed:multilang_dispatch_blocked" ||
    normalizedRoute === "suppressed:multilang_confirmation_required"
  ) {
    const normalizedTranscript = transcript.toLowerCase();
    const genericSubstantiveQuestion =
      /^(?:what|how|why|where|which|who|when|can|could|would|should|is|are|do|does|did)\b/.test(
        normalizedTranscript,
      ) || normalizedTranscript.includes("?");
    return (
      shouldDispatchReasoningAttempt(transcript) ||
      isStrongQuestionDispatchCandidate(transcript) ||
      genericSubstantiveQuestion
    );
  }
  if (shouldDispatchReasoningAttempt(transcript)) return true;
  return isStrongQuestionDispatchCandidate(transcript);
}

export function resolveSuppressedDispatchRescueTranscript(args: {
  dispatchHint: boolean;
  routeReasonCode?: string | null;
  transcript: string;
  draftText: string;
}): string | null {
  if (args.dispatchHint) return null;
  const routeReason = (args.routeReasonCode ?? "").trim().toLowerCase();
  const multilangSuppressed =
    routeReason === "suppressed:multilang_dispatch_blocked" ||
    routeReason === "suppressed:multilang_confirmation_required";
  const transcript = args.transcript.trim();
  const draftText = args.draftText.trim();
  if (!transcript || !draftText) return null;
  const transcriptWords = transcript.split(/\s+/).filter(Boolean).length;
  if (!isLowInformationTailTranscript(transcript) && transcriptWords >= 4) return null;
  if (draftText.length <= transcript.length + 8) return null;
  const transcriptLower = transcript.toLowerCase();
  const draftLower = draftText.toLowerCase();
  if (!draftLower.includes(transcriptLower) && !transcriptLower.includes(draftLower)) return null;
  const focusedDraft = extractLatestContinuationQuestionFocus(draftText) ?? draftText;
  const normalizedFocusedDraft = focusedDraft.trim();
  if (!normalizedFocusedDraft || normalizedFocusedDraft.length <= transcript.length + 8) return null;
  if (multilangSuppressed) {
    if (
      shouldDispatchReasoningAttempt(normalizedFocusedDraft) ||
      isStrongQuestionDispatchCandidate(normalizedFocusedDraft)
    ) {
      return clipText(normalizedFocusedDraft, 720);
    }
    return null;
  }
  if (
    !shouldDispatchReasoningAttempt(normalizedFocusedDraft) &&
    !isStrongQuestionDispatchCandidate(normalizedFocusedDraft)
  ) {
    return null;
  }
  return clipText(normalizedFocusedDraft, 720);
}
