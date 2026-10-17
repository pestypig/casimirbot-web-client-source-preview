import { extractIntentTerms } from "@/lib/helix/ask-voice-continuation-lexical";

const MIC_SOFT_PAUSE_MS = 450;
const MIC_END_TURN_MS = 1200;
const VOICE_TURN_COMPLETE_HIGH_THRESHOLD = 0.72;
const VOICE_TURN_COMPLETE_MEDIUM_THRESHOLD = 0.5;

export type CompletionRoute = "ask_more" | "mirror_clarify" | "answer";

export type CompletionScore = {
  score: number;
  route: CompletionRoute;
};

export type TurnCompleteBand = "low" | "medium" | "high";

export type TurnCompleteScore = {
  score: number;
  band: TurnCompleteBand;
  reason: string;
};

export type IntentShiftBand = "continuation" | "shift";

export type IntentShiftScore = {
  score: number;
  band: IntentShiftBand;
  reason: string;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function scoreConversationCompletion(input: {
  transcript: string;
  pauseMs: number;
  stability: number;
}): CompletionScore {
  const text = input.transcript.trim();
  const stability = Math.max(0, Math.min(1, input.stability));
  let score = 0.2 + stability * 0.45;
  if (/[.!?]$/.test(text)) score += 0.18;
  if (/\b(and|but|or|because|so)\s*$/i.test(text)) score -= 0.16;
  if (/\b(this|that|it|they|those|these)\b/i.test(text) && !/\b(is|are|means|does)\b/i.test(text)) {
    score -= 0.08;
  }
  if (input.pauseMs >= MIC_SOFT_PAUSE_MS) score += 0.06;
  if (input.pauseMs >= MIC_END_TURN_MS) score += 0.12;
  score = Math.max(0, Math.min(1, score));
  if (score < 0.45) return { score, route: "ask_more" };
  if (score < 0.75) return { score, route: "mirror_clarify" };
  return { score, route: "answer" };
}

export function scoreVoiceTurnComplete(input: {
  transcript: string;
  pauseMs: number;
  stability: number;
}): TurnCompleteScore {
  const text = input.transcript.trim();
  const completion = scoreConversationCompletion({
    transcript: text,
    pauseMs: input.pauseMs,
    stability: input.stability,
  });
  let score = completion.score;
  const hasTerminalPunctuation = /[.!?]["')\]]?$/.test(text);
  const trailingConnector = /\b(and|but|or|because|so|which|that|if|when|while|to)\s*$/i.test(text);
  const trailingQuestionStem =
    /\b(how|why|what|where|when|who)\s+(does|do|is|are|can|could|would|will|did)?\s*$/i.test(text);
  const unresolvedReferent =
    /\b(this|that|it|they|those|these)\b/i.test(text) && !/\b(is|are|was|were|means|refers|comes)\b/i.test(text);
  const shortTurn = text.split(/\s+/).filter(Boolean).length < 5;
  if (hasTerminalPunctuation) score += 0.05;
  if (trailingConnector) score -= 0.12;
  if (trailingQuestionStem) score -= 0.16;
  if (unresolvedReferent) score -= 0.08;
  if (shortTurn) score -= 0.08;
  score = clamp01(score);
  if (score >= VOICE_TURN_COMPLETE_HIGH_THRESHOLD) {
    return { score, band: "high", reason: "lexical_closure_high" };
  }
  if (score >= VOICE_TURN_COMPLETE_MEDIUM_THRESHOLD) {
    return { score, band: "medium", reason: "likely_continuation_hold" };
  }
  return { score, band: "low", reason: "incomplete_turn_hold" };
}

export function scoreIntentShift(args: {
  activePrompt: string;
  nextTranscript: string;
}): IntentShiftScore {
  const prevTerms = new Set(extractIntentTerms(args.activePrompt, 16));
  const nextTerms = new Set(extractIntentTerms(args.nextTranscript, 16));
  if (nextTerms.size === 0) {
    return { score: 0, band: "continuation", reason: "no_terms" };
  }
  let overlap = 0;
  for (const term of nextTerms) {
    if (prevTerms.has(term)) overlap += 1;
  }
  const union = new Set([...prevTerms, ...nextTerms]).size || 1;
  const jaccard = overlap / union;
  const explicitShift =
    /\b(new topic|different topic|switch|instead|unrelated|another question)\b/i.test(
      args.nextTranscript.trim().toLowerCase(),
    );
  const score = clamp01((1 - jaccard) * 0.82 + (explicitShift ? 0.26 : 0));
  if (score >= 0.56) {
    return { score, band: "shift", reason: explicitShift ? "explicit_topic_shift" : "semantic_shift" };
  }
  return { score, band: "continuation", reason: "semantic_continuation" };
}
