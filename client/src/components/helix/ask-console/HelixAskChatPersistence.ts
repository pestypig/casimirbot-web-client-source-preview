export type HelixAskConsoleChatRole = "user" | "assistant";

export type HelixAskConsoleChatMessagePayload = {
  role: HelixAskConsoleChatRole;
  content: string;
  traceId?: string;
  helixAsk?: Record<string, unknown>;
};

export function buildHelixAskConsoleChatMessagePayload(args: {
  role: HelixAskConsoleChatRole;
  content: string | null | undefined;
  traceId?: string | null;
  helixAsk?: Record<string, unknown> | null;
}): HelixAskConsoleChatMessagePayload | null {
  const content = typeof args.content === "string" ? args.content : "";
  if (!content) return null;
  const traceId = typeof args.traceId === "string" ? args.traceId.trim() : "";
  return {
    role: args.role,
    content,
    ...(traceId ? { traceId } : {}),
    ...(args.helixAsk && typeof args.helixAsk === "object" ? { helixAsk: args.helixAsk } : {}),
  };
}

export function buildHelixAskConsoleChatTurnPayloads(args: {
  userContent?: string | null;
  assistantContent?: string | null;
  traceId?: string | null;
  assistantHelixAsk?: Record<string, unknown> | null;
}): HelixAskConsoleChatMessagePayload[] {
  return [
    buildHelixAskConsoleChatMessagePayload({
      role: "user",
      content: args.userContent,
      traceId: args.traceId,
    }),
    buildHelixAskConsoleChatMessagePayload({
      role: "assistant",
      content: args.assistantContent,
      traceId: args.traceId,
      helixAsk: args.assistantHelixAsk,
    }),
  ].filter((message): message is HelixAskConsoleChatMessagePayload => message !== null);
}
