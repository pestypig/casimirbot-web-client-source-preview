import type { ChatMessage, ChatSession } from "@shared/agi-chat";

import type { HelixAskMinimalRuntimeReply } from "./HelixAskMinimalRuntimeLifecycle";

function parseTimeMs(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildHelixAskMinimalRuntimeRepliesFromChatSession(
  session: ChatSession | null | undefined,
): HelixAskMinimalRuntimeReply[] {
  const messages = [...(session?.messages ?? [])].sort((left, right) => {
    const leftMs = parseTimeMs(left.at);
    const rightMs = parseTimeMs(right.at);
    if (leftMs !== null && rightMs !== null && leftMs !== rightMs) return leftMs - rightMs;
    if (leftMs !== null && rightMs === null) return -1;
    if (leftMs === null && rightMs !== null) return 1;
    return left.id.localeCompare(right.id);
  });
  const replies: HelixAskMinimalRuntimeReply[] = [];
  let pendingUser: ChatMessage | null = null;
  for (const message of messages) {
    if (message.role === "user") {
      pendingUser = message;
      continue;
    }
    if (message.role !== "assistant") continue;
    const answer = message.content.trim();
    if (!answer) {
      pendingUser = null;
      continue;
    }
    const turnId = message.traceId?.trim() || pendingUser?.traceId?.trim() || message.id;
    const createdAtMs =
      parseTimeMs(message.at) ??
      parseTimeMs(pendingUser?.at) ??
      0;
    replies.push({
      id: `helix-chat-turn:${session?.id ?? "session"}:${turnId}`,
      turn_id: turnId,
      createdAtMs,
      content: answer,
      question: pendingUser?.content ?? "",
      mode: "observe",
      debug: {
        durable_chat_projection: true,
        ask_entrypoint_observed: message.helixAsk?.backend_ask_entrypoint_observed === true,
        backend_ask_call_attempted: message.helixAsk?.backend_ask_call_attempted === true,
        use_backend_ask_turn_entrypoint: message.helixAsk?.use_backend_ask_turn_entrypoint === true,
        session_id: session?.id ?? null,
        user_message_id: pendingUser?.id ?? null,
        assistant_message_id: message.id,
        turn_id: turnId,
      },
      result: {
        selected_final_answer: answer,
        turn_id: turnId,
        final_answer_source:
          typeof message.helixAsk?.final_answer_source === "string"
            ? message.helixAsk.final_answer_source
            : "durable_chat_session",
        terminal_artifact_kind:
          typeof message.helixAsk?.terminal_artifact_kind === "string"
            ? message.helixAsk.terminal_artifact_kind
            : "chat_final_answer",
        terminal_error_code:
          typeof message.helixAsk?.terminal_error_code === "string"
            ? message.helixAsk.terminal_error_code
            : null,
        debug: {
          durable_chat_projection: true,
          ask_entrypoint_observed: message.helixAsk?.backend_ask_entrypoint_observed === true,
          backend_ask_call_attempted: message.helixAsk?.backend_ask_call_attempted === true,
          use_backend_ask_turn_entrypoint: message.helixAsk?.use_backend_ask_turn_entrypoint === true,
          session_id: session?.id ?? null,
        },
      },
      liveEvents: [],
    });
    pendingUser = null;
  }
  return replies;
}
