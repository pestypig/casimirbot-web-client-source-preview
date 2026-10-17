import type { ChatMessage } from "@/store/useAgiChatStore";

import {
  buildHelixAskConsoleChatMessagePayload,
  buildHelixAskConsoleChatTurnPayloads,
} from "./HelixAskChatPersistence";

export type HelixAskLegacyChatAddMessage = (
  sessionId: string,
  msg: Omit<ChatMessage, "id" | "at" | "tokens"> & { tokens?: number },
) => ChatMessage;

export function addHelixAskLegacyChatMessage(
  addMessage: HelixAskLegacyChatAddMessage,
  sessionId: string | null | undefined,
  args: Parameters<typeof buildHelixAskConsoleChatMessagePayload>[0],
) {
  if (!sessionId) return null;
  const payload = buildHelixAskConsoleChatMessagePayload(args);
  return payload ? addMessage(sessionId, payload) : null;
}

export function addHelixAskLegacyChatTurnMessages(
  addMessage: HelixAskLegacyChatAddMessage,
  sessionId: string | null | undefined,
  args: Parameters<typeof buildHelixAskConsoleChatTurnPayloads>[0],
) {
  if (!sessionId) return [];
  return buildHelixAskConsoleChatTurnPayloads(args).map((payload) => addMessage(sessionId, payload));
}
