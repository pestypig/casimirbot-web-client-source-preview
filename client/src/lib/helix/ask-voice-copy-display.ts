export type VoiceDecisionLifecycle =
  | "queued"
  | "running"
  | "suppressed"
  | "escalated"
  | "done"
  | "failed";

export type VoiceReasoningAttemptTimelineInput = {
  source: string;
  prompt: string;
  recordedText?: string | null;
};

export type VoiceReasoningAttemptDetailInput = {
  mode?: string | null;
};

const clipText = (value: string | undefined, limit: number): string => {
  if (!value) return "";
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}...`;
};

export function describeVoiceCommandAction(action: "send" | "cancel" | "retry"): string {
  if (action === "send") return "Send current draft";
  if (action === "retry") return "Retry previous ask";
  return "Cancel pending flow";
}

export function laneLabelForConversationMode(mode?: "observe" | "act" | "verify" | "clarify"): string {
  if (mode === "verify") return "verification";
  if (mode === "act") return "action";
  if (mode === "observe") return "observe";
  if (mode === "clarify") return "clarify";
  return "reasoning";
}

export function normalizeConversationRouteReasonCode(reasonCode?: string | null): string | null {
  const trimmed = reasonCode?.trim().toLowerCase();
  return trimmed ? trimmed : null;
}

export function normalizeVoiceFailureReasonText(reason?: string | null): string | null {
  const trimmed = reason?.trim();
  if (!trimmed) return null;
  const normalized = trimmed.toUpperCase();
  const messageMap: Array<{ pattern: RegExp; text: string }> = [
    {
      pattern: /\bDESKTOP_JOINT_SCOPE_REQUIRED\b/,
      text: "desktop joint scope is required before this run can execute",
    },
    {
      pattern: /\bCALIBRATION_STATE_INCOMPLETE\b/,
      text: "calibration is incomplete for this run",
    },
    {
      pattern: /\bIMU_BASELINE_NOT_CONFIGURED\b/,
      text: "the IMU baseline is not configured for this run",
    },
    {
      pattern: /\bESTOP_NOT_READY\b/,
      text: "the emergency stop state is not ready for this run",
    },
    {
      pattern: /\bFORBIDDEN_CONTROL_PATH\b/,
      text: "the request targets restricted actuator-level controls",
    },
    {
      pattern: /\bEVIDENCE_CONTRACT_FIELD_MISSING\b/,
      text: "required evidence fields were missing",
    },
    {
      pattern: /\bTOOL_NOT_ALLOWED\b/,
      text: "the requested tool is not allowed in this lane",
    },
    {
      pattern: /\bGENERIC_COLLAPSE\b/,
      text: "the reasoning stack could not complete the run",
    },
    {
      pattern: /\bHELIX_ASK_FAILED_400\b/,
      text: "a request gate blocked this run",
    },
    {
      pattern: /\bHELIX_ASK_FAILED_403\b/,
      text: "access policy blocked this run",
    },
    {
      pattern: /\bREASONING_TIMEOUT\b|\bHELIX_ASK_TIMEOUT\b|\bREQUEST TIMED OUT\b/,
      text: "the run timed out before completion",
    },
  ];
  for (const entry of messageMap) {
    if (entry.pattern.test(normalized)) {
      return entry.text;
    }
  }
  if (/\bABORT|CANCEL|INTERRUPT|SUPERSEDE\b/i.test(trimmed)) {
    return "the run was interrupted by a newer turn";
  }
  return null;
}

function isExplorationArtifactRetryPrompt(promptText: string): boolean {
  const normalized = promptText.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.startsWith("topic:") &&
    normalized.includes("restart observe mode from the top of the reasoning chain.")
  );
}

function extractOriginalTurnFromExplorationArtifactRetryPrompt(promptText: string): string | null {
  const match =
    /(?:^|\n)\s*Original user turn:\s*\n([\s\S]*?)(?:\n\s*Previous artifact-dominated output|\n\s*$)/i.exec(
      promptText,
    );
  const extracted = match?.[1]?.trim() ?? "";
  return extracted || null;
}

export function resolveReasoningAttemptTimelineText(
  attempt: VoiceReasoningAttemptTimelineInput,
): string {
  const recordedText = typeof attempt.recordedText === "string" ? attempt.recordedText.trim() : "";
  if (recordedText) return recordedText;
  const prompt = attempt.prompt.trim();
  if (!prompt) return "";
  if (attempt.source !== "voice_auto") return prompt;
  if (!isExplorationArtifactRetryPrompt(prompt)) return prompt;
  return extractOriginalTurnFromExplorationArtifactRetryPrompt(prompt) ?? prompt;
}

export function formatReasoningAttemptDetail(
  attempt: VoiceReasoningAttemptDetailInput,
  fallback: string | null,
): string | null {
  const parts: string[] = [];
  if (attempt.mode) {
    parts.push(`mode:${attempt.mode}`);
  }
  if (parts.length > 0) return parts.join(" | ");
  return fallback;
}

export function formatVoiceDecisionSentence(args: {
  lifecycle: VoiceDecisionLifecycle;
  mode?: "observe" | "act" | "verify" | "clarify";
  routeReasonCode?: string | null;
  escalatedMode?: "verify" | "act";
  failureReasonRaw?: string | null;
}): string {
  const reasonCode = normalizeConversationRouteReasonCode(args.routeReasonCode);
  const normalizedFailureReason = normalizeVoiceFailureReasonText(args.failureReasonRaw ?? args.routeReasonCode);
  if (args.lifecycle === "queued") {
    if (reasonCode === "dispatch:verify") return "I am thinking through a verification pass in the background.";
    if (reasonCode === "dispatch:act") return "I am thinking through an action-oriented pass in the background.";
    if (reasonCode === "dispatch:observe_explore") return "I am thinking through this in the background.";
    if (reasonCode === "dispatch:observe") return "I am thinking through this in the background.";
    return "I am thinking through this in the background.";
  }
  if (args.lifecycle === "running") {
    return `Reasoning is running in ${laneLabelForConversationMode(args.mode)} mode.`;
  }
  if (args.lifecycle === "suppressed") {
    if (normalizedFailureReason === "the run was interrupted by a newer turn") {
      return "Switched to your newer request.";
    }
    if (reasonCode === "suppressed:filler") {
      return "Reasoning is suppressed for this filler turn.";
    }
    if (reasonCode === "suppressed:clarify_after_attempt1") {
      return "Reasoning is paused until you share one concrete detail.";
    }
    if (reasonCode === "suppressed:low_salience") {
      return "Reasoning is suppressed for now while we keep this conversational.";
    }
    if (normalizedFailureReason) {
      return `Reasoning is paused because ${normalizedFailureReason}.`;
    }
    return "Reasoning is suppressed for this turn.";
  }
  if (args.lifecycle === "escalated") {
    if (args.escalatedMode === "verify") return "Reasoning is escalated to verification mode.";
    if (args.escalatedMode === "act") return "Reasoning is escalated to action mode.";
    return "Reasoning is escalated to a deeper lane.";
  }
  if (args.lifecycle === "done") {
    if (args.mode === "act") return "Action reasoning is complete; see the receipt below.";
    return "Reasoning is complete; see the answer below.";
  }
  if (normalizedFailureReason === "the run was interrupted by a newer turn") {
    return "Switched to your newer request.";
  }
  if (normalizedFailureReason) {
    return `Reasoning failed for this turn because ${normalizedFailureReason}.`;
  }
  return "Reasoning failed for this turn; I can retry on your next prompt.";
}

export function composeVoiceBriefWithDecision(baseBrief: string, decisionSentence: string): string {
  const brief = baseBrief.trim();
  const decision = decisionSentence.trim();
  if (!brief) return clipText(decision, 640);
  if (!decision) return clipText(brief, 640);
  const separator = /[.!?]["')\]]?$/.test(brief) ? " " : ". ";
  return clipText(`${brief}${separator}${decision}`, 640);
}

export function describeVoiceInputError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.trim();
    if (/STT HTTP 401/i.test(msg)) {
      return "OpenAI STT unauthorized (401). Check OPENAI_API_KEY on server :5050.";
    }
    if (/STT HTTP 403/i.test(msg)) {
      return "OpenAI STT forbidden (403). Check key permissions and organization/project access.";
    }
    if (/STT HTTP 429/i.test(msg)) {
      return "OpenAI STT rate-limited (429). Retry shortly or adjust limits.";
    }
    if (/HULL|not allowed|ENOTFOUND|EAI_AGAIN|ECONN|network|fetch/i.test(msg)) {
      return "STT network/allowlist failure. Verify outbound host allowlist includes api.openai.com.";
    }
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      return "Microphone permission denied.";
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "No microphone available.";
    }
    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return "Microphone is busy.";
    }
    if (msg) {
      return msg;
    }
  }
  return "Voice input unavailable.";
}

export function buildVoiceInputStatusLabel(
  micArmState: "off" | "on",
  state: "listening" | "transcribing" | "cooldown" | "error",
  error: string | null,
): string | null {
  if (micArmState === "off") return null;
  if (state === "listening") return "Listening";
  if (state === "transcribing") return "Transcribing";
  if (state === "cooldown") return "Cooldown";
  if (state === "error") return error ?? "Voice input unavailable.";
  return null;
}
