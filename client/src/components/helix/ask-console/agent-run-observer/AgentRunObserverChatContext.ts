import type { ChatSession } from "@shared/agi-chat";

export const AGENT_RUN_OBSERVER_CONTEXT_MAX_MESSAGES = 12;
export const AGENT_RUN_OBSERVER_CONTEXT_MAX_CHARS_PER_MESSAGE = 2_000;
export const AGENT_RUN_OBSERVER_CONTEXT_MAX_TOTAL_CHARS = 12_000;

export type AgentRunObserverChatContextMessage = {
  role: "user" | "assistant";
  content: string;
  at?: string;
};

/**
 * This is conversation context only. It is never evidence, a tool receipt, or
 * answer authority. The selected chat id travels separately in the binding
 * request, so the snapshot contains only the bounded text the user opted in to.
 */
export type AgentRunObserverChatContext = {
  messages: AgentRunObserverChatContextMessage[];
};

export type AgentRunObserverChatContextLimits = {
  maxMessages?: number;
  maxCharsPerMessage?: number;
  maxTotalChars?: number;
};

const boundedPositiveInteger = (
  value: number | undefined,
  fallback: number,
  hardMaximum: number,
): number => {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) return fallback;
  return Math.min(Math.floor(value as number), hardMaximum);
};

export const buildSelectedChatContextSnapshot = (input: {
  session: Pick<ChatSession, "messages"> | null | undefined;
  includeContext: boolean;
  limits?: AgentRunObserverChatContextLimits;
}): AgentRunObserverChatContext | undefined => {
  if (!input.includeContext || !input.session) return undefined;

  const maxMessages = boundedPositiveInteger(
    input.limits?.maxMessages,
    AGENT_RUN_OBSERVER_CONTEXT_MAX_MESSAGES,
    AGENT_RUN_OBSERVER_CONTEXT_MAX_MESSAGES,
  );
  const maxCharsPerMessage = boundedPositiveInteger(
    input.limits?.maxCharsPerMessage,
    AGENT_RUN_OBSERVER_CONTEXT_MAX_CHARS_PER_MESSAGE,
    AGENT_RUN_OBSERVER_CONTEXT_MAX_CHARS_PER_MESSAGE,
  );
  let remainingChars = boundedPositiveInteger(
    input.limits?.maxTotalChars,
    AGENT_RUN_OBSERVER_CONTEXT_MAX_TOTAL_CHARS,
    AGENT_RUN_OBSERVER_CONTEXT_MAX_TOTAL_CHARS,
  );

  const messages: AgentRunObserverChatContextMessage[] = [];
  for (
    let index = input.session.messages.length - 1;
    index >= 0 && messages.length < maxMessages && remainingChars > 0;
    index -= 1
  ) {
    const source = input.session.messages[index];
    if (!source || (source.role !== "user" && source.role !== "assistant")) {
      continue;
    }
    const content = source.content.trim();
    if (!content) continue;
    const allowedChars = Math.min(maxCharsPerMessage, remainingChars);
    const message: AgentRunObserverChatContextMessage = {
      role: source.role,
      content: content.slice(0, allowedChars),
    };
    if (source.at.trim()) message.at = source.at;
    messages.unshift(message);
    remainingChars -= message.content.length;
  }

  return messages.length > 0 ? { messages } : undefined;
};
