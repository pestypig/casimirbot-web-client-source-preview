import type { MicArmState } from "@/lib/helix/ask-read-aloud-display";
import {
  normalizeConversationRouteReasonCode,
  type VoiceDecisionLifecycle,
} from "@/lib/helix/ask-voice-copy-display";
import type { ReasoningAttemptSource } from "@/lib/helix/voice/voice-turn-authority";
import type { VoicePlaybackIntentAuthority } from "@/lib/helix/voice-playback";

export const shouldAutoSpeakVoiceDecisionLifecycle = (
  lifecycle: VoiceDecisionLifecycle | undefined,
  options?: {
    routeReasonCode?: string | null;
    failReasonRaw?: string | null;
  },
): boolean => {
  if (lifecycle === "queued") return true;
  if (lifecycle === "running") return true;
  if (lifecycle === "suppressed") {
    const reasonCode = normalizeConversationRouteReasonCode(options?.routeReasonCode);
    return (
      reasonCode === "suppressed:clarify_after_attempt1" ||
      reasonCode === "suppressed:clarify_after_artifact_retry_exhausted"
    );
  }
  if (lifecycle === "failed") return false;
  return false;
};

export type VoiceAutoSpeakAnswerToolIntent =
  | "none"
  | "tool_only"
  | "explicit_voice_tool"
  | "workspace_terminal_summary";

export const shouldAutoSpeakAnswerForTurn = (args: {
  micArmState: MicArmState;
  inputSource?: ReasoningAttemptSource | null;
  voiceMode?: string | null;
  userMuted?: boolean;
  answerAuthority?: VoicePlaybackIntentAuthority | "sealed_final" | "provisional" | null;
  toolIntent?: VoiceAutoSpeakAnswerToolIntent | null;
  finalTimelineType?: "reasoning_final" | "action_receipt" | "workspace_terminal_summary" | string | null;
}): boolean => {
  const voiceOriginTurn = args.inputSource === "voice_auto";
  if (args.micArmState !== "on" && !voiceOriginTurn) return false;
  if (args.userMuted) return false;
  if (args.toolIntent === "tool_only" || args.toolIntent === "explicit_voice_tool") return false;
  if (
    args.finalTimelineType &&
    args.finalTimelineType !== "reasoning_final" &&
    args.finalTimelineType !== "workspace_terminal_summary"
  ) {
    return false;
  }
  if (args.answerAuthority !== "final" && args.answerAuthority !== "sealed_final") return false;
  return voiceOriginTurn || args.inputSource === "manual";
};

export const shouldPreserveAuthoritativeTerminalOverEvidenceGate = (args: {
  evidenceGateBlocked: boolean;
  dispatchPolicy?: string | null;
  routeReasonCode?: string | null;
  finalAnswerSource?: string | null;
  terminalArtifactKind?: string | null;
  hasCompletedWorkspaceTool?: boolean;
  hasTerminalText?: boolean;
  hasPendingRequest?: boolean;
  serverAuthoritativeTerminal?: boolean;
}): boolean => {
  if (!args.evidenceGateBlocked) return false;
  if (!args.hasTerminalText) return false;
  if (args.serverAuthoritativeTerminal) return true;
  if (
    args.finalAnswerSource &&
    !["unknown", "typed_failure", "legacy_fallback"].includes(args.finalAnswerSource) &&
    args.terminalArtifactKind &&
    !["unknown", "typed_failure"].includes(args.terminalArtifactKind)
  ) {
    return true;
  }
  if (args.finalAnswerSource === "artifact_synthesis" && args.terminalArtifactKind === "situation_context_pack") {
    return true;
  }
  if (args.finalAnswerSource === "artifact_synthesis" && args.routeReasonCode === "situation_context_pack") {
    return true;
  }
  if (args.finalAnswerSource === "artifact_synthesis" && args.terminalArtifactKind === "doc_summary") {
    return true;
  }
  if (args.finalAnswerSource === "artifact_synthesis" && args.routeReasonCode?.includes("active_doc_summary")) {
    return true;
  }
  if (args.finalAnswerSource === "workstation_reasoning_trace" && args.routeReasonCode === "proof_recall") {
    return true;
  }
  if (args.finalAnswerSource === "workstation_tool_evaluation" && args.terminalArtifactKind === "workstation_tool_evaluation") {
    return true;
  }
  if (args.hasPendingRequest) return true;
  if (
    (args.dispatchPolicy === "workspace_only" || args.dispatchPolicy === "workspace_context_reasoning") &&
    args.routeReasonCode === "dispatch:act" &&
    args.hasCompletedWorkspaceTool
  ) {
    return true;
  }
  return args.dispatchPolicy === "direct_answer_only" && args.routeReasonCode === "conversation:simple";
};

export type HelixAskVoiceAutoSpeakEligibilityInput = {
  turnId: string;
  replyId: string | null;
  inputSource: string | null;
  briefOnlyReply: boolean;
  micArmedAtTurnStart: boolean;
  eligible: boolean;
  enqueued: boolean;
  hasResponseText: boolean;
  manualAttempt: boolean;
  evidenceGateBlocked: boolean;
  preserveAuthoritativeTerminal: boolean;
  terminalStateSuppressed: boolean;
};

export const resolveHelixAskVoiceAutoSpeakSuppressionReason = (
  input: HelixAskVoiceAutoSpeakEligibilityInput,
): string | null =>
  input.eligible
    ? input.enqueued
      ? null
      : "enqueue_rejected"
    : !input.replyId
      ? "missing_reply_id"
      : !input.hasResponseText
        ? "empty_response_text"
        : input.manualAttempt
          ? "manual_attempt_path"
          : input.evidenceGateBlocked && !input.preserveAuthoritativeTerminal
            ? "evidence_gate_blocked"
            : input.terminalStateSuppressed
              ? "terminal_state_suppressed"
              : "policy_not_eligible";

export const buildHelixAskVoiceAutoSpeakEligibilityDebug = (
  input: HelixAskVoiceAutoSpeakEligibilityInput,
): Record<string, unknown> => ({
  schema: "helix.ask.voice_auto_speak_eligibility.v1",
  turn_id: input.turnId,
  reply_id: input.replyId,
  input_source: input.inputSource,
  brief_only_reply: input.briefOnlyReply,
  mic_armed_at_turn_start: input.micArmedAtTurnStart,
  allow_mic_off_playback: input.inputSource === "voice_auto",
  eligible: input.eligible,
  enqueued: input.enqueued,
  suppression_reason: resolveHelixAskVoiceAutoSpeakSuppressionReason(input),
});
