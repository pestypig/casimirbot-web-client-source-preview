import { clipText } from "@/lib/helix/ask-value-normalization";
import {
  normalizeConversationRouteReasonCode,
  normalizeVoiceFailureReasonText,
} from "@/lib/helix/ask-voice-copy-display";
import { sanitizeConversationBriefTextForVoice } from "@/lib/helix/ask-voice-text-display";

export function normalizeBriefComparableText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isBriefEchoingTranscript(briefText: string, transcript: string): boolean {
  const brief = normalizeBriefComparableText(briefText);
  const source = normalizeBriefComparableText(transcript);
  if (!brief || !source) return false;
  if (brief === source) return true;
  if (brief.startsWith(source) && brief.length <= source.length + 24) return true;
  return false;
}

export function isReasoningTimeoutReason(reason?: string | null): boolean {
  const trimmed = reason?.trim();
  if (!trimmed) return false;
  return /\breasoning_timeout\b|\bhelix_ask_timeout\b|\brequest timed out\b|\btimed out\b/i.test(
    trimmed,
  );
}

export function isVoiceTurnSupersededReason(reason?: string | null): boolean {
  const trimmed = reason?.trim();
  if (!trimmed) return false;
  if (normalizeVoiceFailureReasonText(trimmed) === "the run was interrupted by a newer turn") {
    return true;
  }
  return /\bvoice_turn_(continuation_merged|response_stale|superseded_by_newer_attempt|superseded_by_newer_intent_revision)\b/i.test(
    trimmed,
  );
}

export function shouldSuppressVoiceForTerminalState(args: {
  dispatchPolicy?: string | null;
  routeReasonCode?: string | null;
  terminalKind?: string | null;
  finalAnswerSource?: string | null;
  hasPendingRequest?: boolean;
}): boolean {
  if (args.hasPendingRequest) return true;
  if (args.dispatchPolicy === "needs_user_input") return true;
  if (args.routeReasonCode?.startsWith("clarify:")) return true;
  if (args.terminalKind === "final_failure" || args.terminalKind === "typed_failure") return true;
  if (args.finalAnswerSource === "typed_failure") return true;
  return false;
}

export function isGenericQueuedVoiceAcknowledgement(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized === "got it. i am thinking through this in the background." ||
    normalized === "got it. thinking in the background." ||
    normalized === "i am thinking through this in the background." ||
    normalized === "reasoning is running in the background." ||
    /^reasoning is running in [a-z ]+ mode\.$/.test(normalized) ||
    normalized ===
      "got it. i will run a short observe reasoning pass in the background so we can keep talking while it loads."
  );
}

export function isGenericRunningVoiceStatus(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "reasoning is running in the background.") return true;
  return /^reasoning is running in [a-z ]+ mode\.$/.test(normalized);
}

export function isPinnedVoiceBriefCandidate(text: string): boolean {
  const normalized = sanitizeConversationBriefTextForVoice(text, 560);
  if (!normalized) return false;
  if (isGenericQueuedVoiceAcknowledgement(normalized)) return false;
  if (/^i heard:\s*"/i.test(normalized)) return false;
  return normalized.split(/\s+/).filter(Boolean).length >= 9;
}

export function normalizeConversationBriefSource(value: unknown): "llm" | "none" {
  return value === "llm" ? "llm" : "none";
}

export function buildSuppressedVoiceSpeechText(args: {
  entryText: string;
  decisionSentence: string;
  routeReasonCode?: string | null;
  failReasonRaw?: string | null;
}): string {
  const combinedReason = `${args.routeReasonCode ?? ""} ${args.failReasonRaw ?? ""}`.trim();
  if (isVoiceTurnSupersededReason(combinedReason)) {
    return sanitizeConversationBriefTextForVoice(args.decisionSentence || "Switched to your newer request.", 240);
  }
  const normalized = sanitizeConversationBriefTextForVoice(args.entryText, 560);
  if (!normalized) {
    return "";
  }
  const reasonCode = normalizeConversationRouteReasonCode(args.routeReasonCode);
  const sentenceBudget = reasonCode === "suppressed:filler" || reasonCode === "suppressed:low_salience" ? 2 : 1;
  const sentences = normalized
    .split(/(?<=[.!])\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const selected = sentences.slice(0, sentenceBudget);
  const selectedLower = selected.map((entry) => entry.toLowerCase());
  const decision = sanitizeConversationBriefTextForVoice(args.decisionSentence, 220);
  if (decision && !selectedLower.includes(decision.toLowerCase())) {
    selected.push(decision);
  }
  return clipText(sanitizeConversationBriefTextForVoice(selected.join(" "), 360), 360);
}
