import type { ConversationExplorationPacket } from "@/lib/agi/api";
import type { ObserverDispatchPlan, ObserverIntentType } from "@/lib/helix/ask-observer-events";
import { shouldDispatchReasoningAttempt } from "@/lib/helix/ask-voice-dispatch-suppression";
import { isLikelyNearTurnContinuation } from "@/lib/helix/ask-voice-continuation-lexical";
import { clipText } from "@/lib/helix/ask-value-normalization";
import type { HelixWorkstationAction } from "@/lib/workstation/workstationActionContract";

export type VoiceConversationDispatchMode = "observe" | "act" | "verify" | "clarify";

export function normalizeConversationModeForDispatch(
  mode: VoiceConversationDispatchMode | undefined,
): Exclude<VoiceConversationDispatchMode, "clarify"> | undefined {
  if (!mode || mode === "clarify") return undefined;
  return mode;
}

export function deriveObserverDispatchPlan(args: {
  question: string;
  workstationAction: HelixWorkstationAction | null;
  forceReasoningDispatch?: boolean;
}): ObserverDispatchPlan {
  const trimmed = args.question.trim();
  const shouldDispatchWorkspace = Boolean(args.workstationAction);
  const shouldDispatchReasoning =
    args.forceReasoningDispatch === true || shouldDispatchReasoningAttempt(trimmed);
  const intentType: ObserverIntentType = shouldDispatchWorkspace
    ? shouldDispatchReasoning
      ? "chat_plus_workspace_plus_reasoning"
      : "chat_plus_workspace"
    : shouldDispatchReasoning
      ? "chat_plus_reasoning"
      : "chat_only";
  switch (intentType) {
    case "chat_plus_workspace_plus_reasoning":
      return {
        intent_type: intentType,
        should_dispatch_workspace: true,
        should_dispatch_reasoning: true,
        should_stay_conversational: true,
        dispatch_plan: "workspace+reasoning",
        observer_ack: "I will run the workspace action now and continue reasoning in the background.",
      };
    case "chat_plus_workspace":
      return {
        intent_type: intentType,
        should_dispatch_workspace: true,
        should_dispatch_reasoning: false,
        should_stay_conversational: true,
        dispatch_plan: "workspace",
        observer_ack: "I will run that workspace action now.",
      };
    case "chat_plus_reasoning":
      return {
        intent_type: intentType,
        should_dispatch_workspace: false,
        should_dispatch_reasoning: true,
        should_stay_conversational: true,
        dispatch_plan: "reasoning",
        observer_ack: "I will reason through this and keep you updated.",
      };
    default:
      return {
        intent_type: "chat_only",
        should_dispatch_workspace: false,
        should_dispatch_reasoning: false,
        should_stay_conversational: true,
        dispatch_plan: "chat_only",
        observer_ack: "I am here with you.",
      };
  }
}

export function isSimpleDirectPromptLaneCandidate(transcript: string): boolean {
  const text = String(transcript ?? "").trim().toLowerCase();
  if (!text) return false;
  if (text.length > 160) return false;
  const titleCue =
    /\b(?:title|name)\b/.test(text) &&
    /\b(?:paper|doc|document)\b/.test(text);
  const tinyDocCue =
    /\b(?:what(?:'s| is)?|show|give|tell)\b/.test(text) &&
    /\b(?:this|current)\s+(?:paper|doc|document)\b/.test(text) &&
    /\b(?:title|name|path)\b/.test(text);
  const quickDocExplainCue =
    /\b(?:what(?:'s| is)?|tell|give|explain|summar(?:y|ize))\b/.test(text) &&
    /\b(?:this|current)\s+(?:paper|doc|document)\b/.test(text) &&
    /\b(?:about|summary|summar(?:y|ize)|explain|mean|contains)\b/.test(text);
  const heavyReasoningCue =
    /\b(?:derive|proof|equation|compare|tradeoff|audit|review|call chain|implementation|refactor|design|architecture)\b/
      .test(text);
  if (heavyReasoningCue) return false;
  return titleCue || tinyDocCue || quickDocExplainCue;
}

export function isSimpleTitleOrPathOnlyPrompt(transcript: string): boolean {
  const text = String(transcript ?? "").trim().toLowerCase();
  if (!text) return false;
  const titleCue =
    /\b(?:title|name)\b/.test(text) &&
    /\b(?:paper|doc|document)\b/.test(text);
  const pathCue =
    /\b(?:what(?:'s| is)?|show|give|tell)\b/.test(text) &&
    /\b(?:this|current)\s+(?:paper|doc|document)\b/.test(text) &&
    /\b(?:path)\b/.test(text);
  const quickTitleCue =
    /\b(?:what(?:'s| is)?|show|give|tell)\b/.test(text) &&
    /\b(?:this|current)\s+(?:paper|doc|document)\b/.test(text) &&
    /\b(?:title|name)\b/.test(text);
  return titleCue || pathCue || quickTitleCue;
}

export function shouldQueueWorkspaceBackgroundReasoning(args: {
  transcript: string;
  docsViewerAnchorPath?: string | null;
}): boolean {
  const text = String(args.transcript ?? "").trim().toLowerCase();
  if (!text) return false;
  if (isSimpleTitleOrPathOnlyPrompt(text)) return false;
  if (/\b(?:background|in the background|while you continue)\b/.test(text)) return true;
  const workspaceCue =
    Boolean(args.docsViewerAnchorPath) ||
    /\b(?:docs?\s+viewer|workspace|repo|repository|codebase|source|file|path|paper|doc|document)\b/.test(
      text,
    );
  if (!workspaceCue) return false;
  const hardReasoningCue =
    /\b(?:verify|prove|proof|audit|compare|contrast|difference|tradeoff|synthesi[sz]e|integrity|evidence|claim|cross[-\s]?check)\b/.test(
      text,
    );
  return hardReasoningCue;
}

export function isLikelyContextDependentTurn(transcript: string): boolean {
  const normalized = transcript.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.length > 220) return false;
  if (
    /^(where|why|how|what)\s+(is|are|was|were|does|did)\s+(that|this|it|they|those|these)\b/.test(
      normalized,
    )
  ) {
    return true;
  }
  if (/^(and|so|then|also)\b/.test(normalized)) return true;
  if (/\b(that|this|it|they|those|these)\b/.test(normalized) && normalized.length <= 72) {
    return true;
  }
  return false;
}

export function extractPriorUserContext(recentTurns: string[], currentTranscript?: string): string | null {
  const currentNormalized = currentTranscript?.trim().toLowerCase() || null;
  for (let index = recentTurns.length - 1; index >= 0; index -= 1) {
    const line = recentTurns[index]?.trim() ?? "";
    if (!line) continue;
    if (!/^user:/i.test(line)) continue;
    const text = line.replace(/^user:\s*/i, "").trim();
    if (!text) continue;
    if (currentNormalized && text.toLowerCase() === currentNormalized) continue;
    return text;
  }
  return null;
}

export function buildVoiceReasoningDispatchPrompt(args: {
  transcript: string;
  recentTurns: string[];
  explorationPacket?: ConversationExplorationPacket | null;
}): string {
  const transcript = args.transcript.trim();
  if (!transcript) return "";
  if (!isLikelyContextDependentTurn(transcript)) {
    return transcript;
  }
  const priorUser = extractPriorUserContext(args.recentTurns, transcript);
  if (!isLikelyNearTurnContinuation({ transcript, priorUserTurn: priorUser })) {
    return transcript;
  }
  const topicHint = args.explorationPacket?.topic?.trim() || priorUser || transcript;
  return [
    `Follow-up turn: ${transcript}`,
    `Immediate anchor: ${clipText(topicHint, 220)}`,
    "Use only this immediate anchor for continuity before answering.",
    priorUser ? `Prior user turn: ${clipText(priorUser, 220)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
