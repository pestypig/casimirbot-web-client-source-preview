import { clipText } from "@/lib/helix/ask-value-normalization";

export const VOICE_CONTINUATION_MERGE_WINDOW_MS = 9000;
export const VOICE_CONTINUATION_ACTIVE_CHAIN_WINDOW_MS = 18_000;
export const VOICE_CONTINUATION_SHORT_WORD_LIMIT = 14;
export const VOICE_CONTINUATION_ADDENDUM_WORD_LIMIT = 20;

export function extractIntentTerms(text: string, maxTerms = 8): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4)
    .slice(0, maxTerms);
}

export function hasDanglingTurnTail(transcript: string): boolean {
  const normalized = transcript.trim().toLowerCase().replace(/[.!?]+$/g, "").trim();
  if (!normalized) return false;
  return /\b(and|or|but|so|because|that|which|who|when|where|why|what|how|if|to|of|for|with|in|on|at|from|is|are|was|were|be|been|being|the|a|an|it|this|these|those|my|your|our|their|does|do|did|can|could|would|will)\s*$/.test(
    normalized,
  );
}

export function isLowInformationTailTranscript(transcript: string): boolean {
  const normalized = transcript.trim().toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
  if (!normalized) return true;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length > 3) return false;
  if (/\b(verify|check|prove|fix|implement|change|update|explain|define|what|why|how)\b/.test(normalized)) {
    return false;
  }
  const compact = words.join("");
  return compact.length <= 18;
}

export function extractLatestContinuationQuestionFocus(transcript: string): string | null {
  const normalized = transcript.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (sentences.length < 2) return null;
  const last = sentences[sentences.length - 1] ?? "";
  if (!last) return null;
  const lowered = last.toLowerCase();
  const looksQuestionPivot =
    /^(?:so|and|right|okay|ok|well)[,\s]+/.test(lowered) ||
    /^(?:what about|how about|can you|could you|would you|please)\b/.test(lowered) ||
    /\?$/.test(last);
  if (!looksQuestionPivot) return null;
  const hasIntentVerb = /\b(?:what about|how about|explain|define|relate|compare|tell|walk me through|can you)\b/.test(
    lowered,
  );
  if (!hasIntentVerb && !/\?$/.test(last)) return null;
  if (last.length < 12) return null;
  return clipText(last, 360);
}

export function hasSufficientLexicalCarryover(nextTranscript: string, priorUserTurn: string): boolean {
  const nextTerms = new Set(extractIntentTerms(nextTranscript, 12));
  const priorTerms = new Set(extractIntentTerms(priorUserTurn, 14));
  if (nextTerms.size === 0 || priorTerms.size === 0) return false;
  let overlap = 0;
  for (const term of nextTerms) {
    if (!priorTerms.has(term)) continue;
    overlap += 1;
    if (overlap >= 2) return true;
  }
  return false;
}

export function isLikelyNearTurnContinuation(args: {
  transcript: string;
  priorUserTurn: string | null;
}): boolean {
  const normalized = args.transcript.trim().toLowerCase();
  const prior = args.priorUserTurn?.trim();
  if (!normalized || !prior) return false;
  if (
    /^(where|why|how|what)\s+(is|are|was|were|does|did)\s+(that|this|it|they|those|these)\b/.test(
      normalized,
    )
  ) {
    return true;
  }
  if (/^(and|so|then|also|but|because|which|that|right|yeah|yes|well)\b/.test(normalized)) return true;
  if (/^(it|this|that|they|those|these)\b/.test(normalized)) return true;
  return hasSufficientLexicalCarryover(normalized, prior.toLowerCase());
}

export function shouldMergeVoiceContinuationTurn(args: {
  previousPrompt: string;
  nextTranscript: string;
  gapMs: number;
  windowMs?: number;
}): boolean {
  const windowMs = args.windowMs ?? VOICE_CONTINUATION_MERGE_WINDOW_MS;
  if (args.gapMs < 0 || args.gapMs > windowMs) return false;
  const previous = args.previousPrompt.trim();
  const next = args.nextTranscript.trim();
  if (!previous || !next) return false;
  const nextWords = next.split(/\s+/).filter(Boolean);
  const nextStartsContinuation =
    /^[a-z]/.test(next) ||
    /^(and|but|so|then|because|which|that|who|where|when|while|if|with|for|to|used|using)\b/i.test(
      next,
    );
  if (nextStartsContinuation) return true;
  const previousLooksIncomplete = !/[.!?]["')\]]?\s*$/.test(previous);
  return previousLooksIncomplete && nextWords.length <= VOICE_CONTINUATION_SHORT_WORD_LIMIT;
}

export function shouldMergeVoiceContinuationInFlight(args: {
  gapMs: number;
  lexicalContinuation: boolean;
  activeWindowMs?: number;
}): boolean {
  const activeWindowMs = args.activeWindowMs ?? VOICE_CONTINUATION_ACTIVE_CHAIN_WINDOW_MS;
  if (args.gapMs < 0) return false;
  if (args.gapMs <= activeWindowMs) return true;
  return args.lexicalContinuation;
}

export function shouldRestartExplorationLadderOnSupersede(args: {
  hasContinuityCandidate: boolean;
  forceTailContinuationMerge: boolean;
  shortContinuationAddendum: boolean;
  canMergeContinuation: boolean;
  intentShiftBand: "continuation" | "shift";
}): boolean {
  if (!args.hasContinuityCandidate) return false;
  if (args.forceTailContinuationMerge || args.shortContinuationAddendum) return false;
  if (args.canMergeContinuation && args.intentShiftBand === "continuation") return false;
  return true;
}

export function isLikelyContinuationAddendum(transcript: string): boolean {
  const normalized = transcript.trim().toLowerCase();
  if (!normalized) return false;
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length > VOICE_CONTINUATION_ADDENDUM_WORD_LIMIT) return false;
  return /^(and|so|but|then|because|which|that|also|plus|right|yeah|yes|well)\b/.test(normalized);
}

export function isLikelyContinuationTailFragment(transcript: string): boolean {
  const trimmed = transcript.trim();
  if (!trimmed) return false;
  const normalized = trimmed.toLowerCase();
  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 14) return false;
  if (/[?]$/.test(trimmed)) return false;
  if (
    /^(what|why|how|when|where|who|which|can|could|would|should|do|does|did|is|are|was|were|explain|define|describe)\b/.test(
      normalized,
    )
  ) {
    return false;
  }
  const startsLower = /^[a-z]/.test(trimmed);
  if (!startsLower) return false;
  return /\b(this|that|it|they|them|those|these|happens?|effect|result|probability|because|within)\b/.test(
    normalized,
  );
}
