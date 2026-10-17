import type { ChatSession } from "@shared/agi-chat";

export function isHelixAskChatSession(session: ChatSession): boolean {
  return Boolean(session.contextId?.startsWith("helix-ask"));
}

function timestampScore(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function listHelixAskChatSessions(sessions: Record<string, ChatSession>): ChatSession[] {
  return Object.values(sessions)
    .filter(isHelixAskChatSession)
    .sort((a, b) => timestampScore(b.updatedAt) - timestampScore(a.updatedAt));
}

export function resolveActiveHelixAskSession(
  sessions: Record<string, ChatSession>,
  activeChatId?: string,
): ChatSession | undefined {
  const activeSessionCandidate = activeChatId ? sessions[activeChatId] : undefined;
  if (activeSessionCandidate && isHelixAskChatSession(activeSessionCandidate)) {
    return activeSessionCandidate;
  }
  return listHelixAskChatSessions(sessions)[0];
}
