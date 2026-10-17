import { stableHelixProjectionHash } from "@/lib/helix/ask-stable-hash";

export type HelixAskChatReferentReplyLike = {
  id?: string | null;
  turn_id?: string | null;
  selected_final_answer?: string | null;
  content?: string | null;
  text?: string | null;
  assistant_answer?: string | null;
  debug?: unknown;
};

export type HelixAskChatReferentContextSource = {
  source_name: string;
  replies: readonly HelixAskChatReferentReplyLike[];
};

export type HelixAskChatReferentContextBuildResult = {
  context: Record<string, unknown> | null;
  source_summary: {
    schema: "helix.ask.chat_referent_context_source_summary.v1";
    source_count: number;
    total_reply_count: number;
    readable_reply_count: number;
    retained_candidate_count: number;
    topic_retained_candidate_count: number;
    explicit_topic_term_count: number;
    selected_source_name: string | null;
    context_present: boolean;
    assistant_answer: false;
    terminal_eligible: false;
    raw_content_included: false;
  };
};

const HELIX_ASK_LAST_REFERENT_REPLY_STORAGE_KEY = "helix.ask.lastReferentReply.v1";
const HELIX_ASK_RECENT_REFERENT_CANDIDATE_LIMIT = 8;
const HELIX_ASK_TOPIC_REFERENT_CANDIDATE_LIMIT = 4;
const HELIX_ASK_RECENT_REFERENT_CANDIDATE_TEXT_LIMIT = 4000;

const HELIX_ASK_REFERENT_TOPIC_STOP_WORDS = new Set([
  "claim", "concept", "discussion", "evidence", "finding", "paper", "physic",
  "physical", "physics", "point", "previous", "prior", "reference", "research",
  "response", "scholarly", "science", "scientific", "source", "topic",
]);

const normalizeReferentTopicToken = (token: string): string => {
  const normalized = token.toLowerCase();
  if (normalized.endsWith("ies") && normalized.length > 4) return `${normalized.slice(0, -3)}y`;
  if (normalized.endsWith("s") && normalized.length > 4 && !normalized.endsWith("ss")) {
    return normalized.slice(0, -1);
  }
  return normalized;
};

const referentTopicTerms = (value: string): string[] =>
  [...new Set(value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map(normalizeReferentTopicToken)
    .filter((token) => token.length >= 3 && !HELIX_ASK_REFERENT_TOPIC_STOP_WORDS.has(token)))];

const explicitReferentTopicTerms = (promptText: string | null | undefined): string[] => {
  const prompt = String(promptText ?? "").replace(/\s+/g, " ").trim();
  if (!prompt) return [];
  const patterns = [
    /\b(?:supporting|for|about|on)\s+(?:the\s+)?([a-z0-9][a-z0-9\s-]{1,100}?)\s+(?:claims?|points?|topics?|concepts?)\s+(?:that\s+)?(?:we|you)\s+(?:just\s+)?(?:discussed|were\s+(?:just\s+)?discussing|have\s+been\s+discussing|talked\s+about|were\s+talking\s+about)\b/i,
    /\b(?:supporting|for|about|on)\s+(?:the\s+)?([a-z0-9][a-z0-9\s-]{1,100}?)\s+(?:claims?|points?|topics?|concepts?)\s+(?:from|in)\s+(?:(?:the|our|your)\s+)?(?:earlier|previous|prior|last)\s+(?:answer|response|discussion|conversation)\b/i,
  ];
  for (const pattern of patterns) {
    const phrase = prompt.match(pattern)?.[1]?.trim() ?? "";
    const terms = referentTopicTerms(phrase);
    if (terms.length > 0) return terms;
  }
  return [];
};

const readRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const readNestedString = (record: Record<string, unknown> | null, key: string): string | null => {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

export function readHelixAskReplyFinalAnswerText(
  reply: HelixAskChatReferentReplyLike | null | undefined,
): string | null {
  if (!reply) return null;
  const replyRecord = reply as unknown as Record<string, unknown>;
  const debugRecord = readRecord(reply.debug);
  const candidates = [
    reply.selected_final_answer,
    readNestedString(debugRecord, "selected_final_answer"),
    readNestedString(replyRecord, "finalAnswer"),
    reply.content,
    reply.text,
    reply.assistant_answer,
  ];
  for (const candidate of candidates) {
    const text = typeof candidate === "string" ? candidate.trim() : "";
    if (text) return text.slice(0, 8000);
  }
  return null;
}

export function readPersistedHelixAskReferentReply(): HelixAskChatReferentReplyLike | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HELIX_ASK_LAST_REFERENT_REPLY_STORAGE_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const text = typeof record.selected_final_answer === "string"
      ? record.selected_final_answer.trim()
      : typeof record.content === "string"
        ? record.content.trim()
        : "";
    if (!text) return null;
    return {
      id: typeof record.id === "string" ? record.id : "persisted-last-answer",
      turn_id: typeof record.turn_id === "string" ? record.turn_id : undefined,
      content: text,
      selected_final_answer: text,
    };
  } catch {
    return null;
  }
}

export function writePersistedHelixAskReferentReply(
  reply: HelixAskChatReferentReplyLike | null | undefined,
): void {
  if (typeof window === "undefined" || !reply) return;
  const text = readHelixAskReplyFinalAnswerText(reply);
  if (!text) return;
  try {
    window.localStorage.setItem(
      HELIX_ASK_LAST_REFERENT_REPLY_STORAGE_KEY,
      JSON.stringify({
        id: reply.id,
        turn_id: reply.turn_id,
        selected_final_answer: text,
        content: text,
      }),
    );
  } catch {
    // Referent persistence is best-effort; Ask must still work without local storage.
  }
}

export function buildHelixAskChatReferentContext(
  replies: readonly HelixAskChatReferentReplyLike[],
  promptText?: string | null,
): Record<string, unknown> | null {
  const readableReplies = [...replies]
    .reverse()
    .map((reply) => ({ reply, text: readHelixAskReplyFinalAnswerText(reply) }))
    .filter((entry): entry is { reply: HelixAskChatReferentReplyLike; text: string } => Boolean(entry.text));
  const previousEntry = readableReplies[0] ?? null;
  if (!previousEntry) return null;
  const previousReply = previousEntry.reply;
  const previousAnswer = previousEntry.text;
  const replyId = previousReply.turn_id || previousReply.id || `reply:${stableHelixProjectionHash(previousAnswer)}`;
  const sourceRef = `chat.final_answer.previous:${replyId}`;
  const seenTextHashes = new Set<string>();
  const uniqueReadableReplies = readableReplies.flatMap(({ reply, text }) => {
      const textHash = stableHelixProjectionHash(text);
      if (seenTextHashes.has(textHash)) return [];
      seenTextHashes.add(textHash);
      return [{ reply, text, textHash, recencyRank: seenTextHashes.size - 1 }];
    });
  const topicTerms = explicitReferentTopicTerms(promptText);
  const requiredTopicMatches = Math.max(1, Math.ceil(topicTerms.length * 0.6));
  const recentEntries = uniqueReadableReplies.slice(0, HELIX_ASK_RECENT_REFERENT_CANDIDATE_LIMIT);
  const topicalReserveEntries = topicTerms.length > 0
    ? uniqueReadableReplies
        .slice(HELIX_ASK_RECENT_REFERENT_CANDIDATE_LIMIT)
        .filter(({ text }) => {
          const candidateTerms = new Set(referentTopicTerms(text));
          return topicTerms.filter((term) => candidateTerms.has(term)).length >= requiredTopicMatches;
        })
        .slice(0, HELIX_ASK_TOPIC_REFERENT_CANDIDATE_LIMIT)
    : [];
  const recentAssistantFinalAnswers = [...recentEntries, ...topicalReserveEntries]
    .map(({ reply, text, textHash, recencyRank }) => {
      const candidateReplyId = reply.turn_id || reply.id || `reply:${textHash}`;
      const candidateText = text.slice(0, HELIX_ASK_RECENT_REFERENT_CANDIDATE_TEXT_LIMIT);
      return {
        role: "assistant",
        reply_id: candidateReplyId,
        source_ref: `chat.final_answer.recent:${candidateReplyId}`,
        text: candidateText,
        text_hash: stableHelixProjectionHash(candidateText),
        source_role: "recent_terminal_assistant_answer_candidate",
        recency_rank: recencyRank,
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      };
    });
  return {
    schema: "helix.ask.chat_referent_context.v1",
    previous_assistant_final_answer: {
      role: "assistant",
      reply_id: replyId,
      source_ref: sourceRef,
      text: previousAnswer,
      text_hash: stableHelixProjectionHash(previousAnswer),
      source_role: "previous_terminal_assistant_answer",
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    },
    previous_chat_message: {
      role: "assistant",
      message_id: replyId,
      source_ref: sourceRef,
      text: previousAnswer,
      text_hash: stableHelixProjectionHash(previousAnswer),
      source_role: "previous_terminal_assistant_answer",
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    },
    recent_assistant_final_answers: recentAssistantFinalAnswers,
    topic_retained_candidate_count: topicalReserveEntries.length,
    explicit_topic_terms: topicTerms,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
  };
}

export function buildHelixAskChatReferentContextFromSources(
  sources: readonly HelixAskChatReferentContextSource[],
  promptText?: string | null,
): HelixAskChatReferentContextBuildResult {
  const orderedEntries = sources.flatMap((source) =>
    source.replies.map((reply) => ({
      sourceName: source.source_name,
      reply,
      text: readHelixAskReplyFinalAnswerText(reply),
    })),
  );
  const selectedEntry = [...orderedEntries].reverse().find((entry) => Boolean(entry.text)) ?? null;
  const context = selectedEntry
    ? buildHelixAskChatReferentContext(orderedEntries.map((entry) => entry.reply), promptText)
    : null;
  const retainedCandidateCount = Array.isArray(context?.recent_assistant_final_answers)
    ? context.recent_assistant_final_answers.length
    : 0;
  return {
    context,
    source_summary: {
      schema: "helix.ask.chat_referent_context_source_summary.v1",
      source_count: sources.length,
      total_reply_count: orderedEntries.length,
      readable_reply_count: orderedEntries.filter((entry) => Boolean(entry.text)).length,
      retained_candidate_count: retainedCandidateCount,
      topic_retained_candidate_count:
        typeof context?.topic_retained_candidate_count === "number"
          ? context.topic_retained_candidate_count
          : 0,
      explicit_topic_term_count: Array.isArray(context?.explicit_topic_terms)
        ? context.explicit_topic_terms.length
        : 0,
      selected_source_name: selectedEntry?.sourceName ?? null,
      context_present: Boolean(context),
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    },
  };
}

export function buildHelixAskChatReferentContextForSubmit(input: {
  durableReplies: readonly HelixAskChatReferentReplyLike[];
  visibleReplies: readonly HelixAskChatReferentReplyLike[];
  includePersistedReply?: boolean;
  promptText?: string | null;
}): HelixAskChatReferentContextBuildResult {
  const persistedReply = input.includePersistedReply === false
    ? null
    : readPersistedHelixAskReferentReply();
  // Sources are ordered from fallback to preferred because the source combiner
  // selects the last readable entry. A persisted answer must never outrank the
  // current visible transcript or the durable session that owns the turn.
  return buildHelixAskChatReferentContextFromSources([
    {
      source_name: "persisted_last_terminal_answer",
      replies: persistedReply ? [persistedReply] : [],
    },
    {
      source_name: "durable_chat_session",
      replies: input.durableReplies,
    },
    {
      source_name: "visible_ask_transcript",
      replies: input.visibleReplies,
    },
  ], input.promptText);
}
