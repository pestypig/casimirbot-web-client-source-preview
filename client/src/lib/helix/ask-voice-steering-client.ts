export type VoiceSteeringClientClassification =
  | "on_topic_additive"
  | "constraint"
  | "correction"
  | "off_topic_new_goal"
  | "cancel_or_stop"
  | "ambient";

export type VoiceSteeringClientRequest = {
  thread_id: string;
  turn_id: string;
  expected_turn_id: string;
  transcript_text: string;
  source: "voice_capture";
  timing: "during_reasoning" | "during_tool_call";
  classification: VoiceSteeringClientClassification;
  queue_decision:
    | "queued_for_safe_boundary"
    | "deferred_to_new_turn"
    | "cancel_requested"
    | "ambient_ignored";
  evidence_refs: string[];
  reason_codes: string[];
};

export function classifyVoiceSteeringClientTranscript(transcript: string): {
  classification: VoiceSteeringClientClassification;
  queueDecision: VoiceSteeringClientRequest["queue_decision"];
  reasonCodes: string[];
} {
  const text = transcript.trim();
  if (!text || text.length < 3) {
    return {
      classification: "ambient",
      queueDecision: "ambient_ignored",
      reasonCodes: ["too_short_or_empty"],
    };
  }
  if (/\b(stop|cancel|abort|pause|never mind|nevermind)\b/i.test(text)) {
    return {
      classification: "cancel_or_stop",
      queueDecision: "cancel_requested",
      reasonCodes: ["explicit_cancel_phrase"],
    };
  }
  if (/\b(actually|correction|i meant|not that|use .* instead)\b/i.test(text)) {
    return {
      classification: "correction",
      queueDecision: "queued_for_safe_boundary",
      reasonCodes: ["correction_phrase"],
    };
  }
  if (/\b(do not|don't|dont|only|never|make sure|must|instead)\b/i.test(text)) {
    return {
      classification: "constraint",
      queueDecision: "queued_for_safe_boundary",
      reasonCodes: ["constraint_phrase"],
    };
  }
  if (/\b(also|while you|check|look at|remember|include)\b/i.test(text)) {
    return {
      classification: "on_topic_additive",
      queueDecision: "queued_for_safe_boundary",
      reasonCodes: ["additive_phrase"],
    };
  }
  return {
    classification: "off_topic_new_goal",
    queueDecision: "deferred_to_new_turn",
    reasonCodes: ["default_active_turn_new_goal"],
  };
}

export function buildVoiceSteeringClientRequest(args: {
  threadId: string;
  turnId: string;
  expectedTurnId?: string | null;
  transcriptText: string;
  timing: "during_reasoning" | "during_tool_call";
  evidenceRefs?: string[];
}): VoiceSteeringClientRequest {
  const classified = classifyVoiceSteeringClientTranscript(args.transcriptText);
  return {
    thread_id: args.threadId,
    turn_id: args.turnId,
    expected_turn_id: args.expectedTurnId?.trim() || args.turnId,
    transcript_text: args.transcriptText.trim(),
    source: "voice_capture",
    timing: args.timing,
    classification: classified.classification,
    queue_decision: classified.queueDecision,
    evidence_refs: Array.from(new Set(args.evidenceRefs ?? [])),
    reason_codes: classified.reasonCodes,
  };
}

export function isVoiceSteeringDuringToolCall(
  events: Array<{ tool?: unknown; status?: unknown; type?: unknown }>,
): boolean {
  return events.some((event) => {
    const status = String(event.status ?? "").toLowerCase();
    const type = String(event.type ?? "").toLowerCase();
    const tool = String(event.tool ?? "").trim();
    return Boolean(tool) && (
      status === "running" ||
      status === "queued" ||
      type.includes("tool") ||
      type.includes("action")
    );
  });
}
