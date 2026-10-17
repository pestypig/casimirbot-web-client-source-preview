export type HelixAskChatMessageLike = {
  id: string;
  role: string;
  content: string;
  at: string;
  traceId?: string | null;
  helixAsk?: Record<string, unknown> | null;
};

export type HelixAskChatSessionLike = {
  id: string;
  messages?: readonly HelixAskChatMessageLike[];
};

export type HelixAskChatProjectedReply = {
  id: string;
  content: string;
  createdAtMs?: number;
  question?: string;
  turn_id?: string | null;
  ok?: boolean;
  final_answer_source?: string | null;
  terminal_artifact_kind?: string | null;
  terminal_error_code?: string | null;
  debug?: Record<string, unknown>;
};

export type HelixAskChatProjectionPolicy = {
  backendEntrypointRequiredErrorCode: string;
  backendEntrypointRequiredText: string;
  isProgressPlaceholderText: (text: string) => boolean;
  requiresBackendEntrypoint: (question: string) => boolean;
  isInvalidTerminalAnswerText: (text: string) => boolean;
  renderTypedFailureFallback: (code: string) => string;
  nowMs?: () => number;
};

export function parseHelixAskChatMessageTimeMs(message: HelixAskChatMessageLike): number | null {
  const parsed = Date.parse(message.at);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildHelixAskChatProjectionId(
  session: HelixAskChatSessionLike,
  userMessage: HelixAskChatMessageLike | null,
  assistantMessage: HelixAskChatMessageLike,
): string {
  const traceId = assistantMessage.traceId?.trim() || userMessage?.traceId?.trim();
  if (traceId) return `helix-chat-turn:${session.id}:${traceId}`;
  return `helix-chat-turn:${session.id}:${userMessage?.id ?? "standalone"}:${assistantMessage.id}`;
}

const STAGE_PLAY_MAIL_WAKE_PROMPT_PATTERNS = [
  /\bstage_play_live_source_mail_wake:/i,
  /^\s*use\s+live_env\.(?:read_live_source_mail|read_processed_live_source_mail|record_live_source_mail_decision|request_interim_voice_callout)\b/i,
  /^\s*read the active stage play live-source mailbox and use the latest processed micro-reasoner finding\b/i,
  /^\s*review the latest stage play live-source mailbox finding\.\s*use the structured mailbox route metadata attached to this turn\b/i,
  /^\s*review the latest stage play live-source mailbox finding\.[\s\S]*?\bmicro-reasoner recommendation:\s*(?:record\s+interpretation|request\s+voice\s+callout|request\s+more\s+evidence|request\s+stage\s+play\s+checkpoint|draft\s+text\s+answer)\b[\s\S]*?\bstructured mailbox route metadata attached\b/i,
  /^\s*review the latest stage play live-source mailbox finding\.[\s\S]*?\bmicro-reasoner recommendation:\s*request\s+voice\s+callout\b[\s\S]*?\bstructured mailbox route metadata attached\b/i,
  /\bui bridge reason:\s*(?:backend wake admission deferred|micro-reasoner (?:wake|interrupt) candidate|operator opened queued (?:wake|interrupt))/i,
];

const STAGE_PLAY_MAIL_WAKE_ASSISTANT_PATTERNS = [
  /\bi could not complete this live-source turn\b/i,
  /\bthe live-source mailbox route completed\b/i,
  /\bthe interim voice callout\b/i,
  /\bsolver authority failed\b/i,
  /\bselected:\s*live_env\./i,
  /\bphase:\s*(?:terminal_checkpoint|record_decision|request_voice_after_decision)\b/i,
  /\bvoice callout request\b/i,
];

export function isGeneratedStagePlayMailWakePrompt(message: HelixAskChatMessageLike | null): boolean {
  if (!message || message.role !== "user") return false;
  const text = message.content.trim();
  if (!text) return false;
  return STAGE_PLAY_MAIL_WAKE_PROMPT_PATTERNS.some((pattern) => pattern.test(text));
}

export function isGeneratedStagePlayMailWakeAssistantProjection(message: HelixAskChatMessageLike | null): boolean {
  if (!message || message.role !== "assistant") return false;
  const text = message.content.trim();
  if (!text) return false;
  return STAGE_PLAY_MAIL_WAKE_ASSISTANT_PATTERNS.some((pattern) => pattern.test(text));
}

export function shouldSuppressGeneratedStagePlayMailWakeChatProjection(
  userMessage: HelixAskChatMessageLike | null,
  assistantMessage: HelixAskChatMessageLike,
): boolean {
  if (!isGeneratedStagePlayMailWakePrompt(userMessage)) return false;
  if (isGeneratedStagePlayMailWakeAssistantProjection(assistantMessage)) return true;
  return false;
}

function readBooleanFlag(record: Record<string, unknown> | null | undefined, ...keys: string[]): boolean {
  if (!record) return false;
  return keys.some((key) => record[key] === true);
}

function readStringValue(record: Record<string, unknown> | null | undefined, ...keys: string[]): string | null {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function buildHelixAskRepliesFromChatSessionProjection(args: {
  session: HelixAskChatSessionLike;
  policy: HelixAskChatProjectionPolicy;
}): HelixAskChatProjectedReply[] {
  const { session, policy } = args;
  const messages = [...(session.messages ?? [])].sort((left, right) => {
    const leftMs = parseHelixAskChatMessageTimeMs(left);
    const rightMs = parseHelixAskChatMessageTimeMs(right);
    if (leftMs !== null && rightMs !== null && leftMs !== rightMs) return leftMs - rightMs;
    if (leftMs !== null && rightMs === null) return -1;
    if (leftMs === null && rightMs !== null) return 1;
    return left.id.localeCompare(right.id);
  });
  const replies: HelixAskChatProjectedReply[] = [];
  let pendingUser: HelixAskChatMessageLike | null = null;
  for (const message of messages) {
    if (message.role === "user") {
      pendingUser = message;
      continue;
    }
    if (message.role !== "assistant") continue;
    const answer = message.content.trim();
    if (!answer) continue;
    if (policy.isProgressPlaceholderText(answer)) {
      pendingUser = null;
      continue;
    }
    if (shouldSuppressGeneratedStagePlayMailWakeChatProjection(pendingUser, message)) {
      pendingUser = null;
      continue;
    }
    const createdAtMs =
      parseHelixAskChatMessageTimeMs(message) ??
      parseHelixAskChatMessageTimeMs(pendingUser ?? message) ??
      (policy.nowMs?.() ?? Date.now());
    const turnId = message.traceId?.trim() || pendingUser?.traceId?.trim() || null;
    const question = pendingUser?.content ?? "";
    const askEntrypointRequired = policy.requiresBackendEntrypoint(question);
    const askEntrypointObserved = readBooleanFlag(
      message.helixAsk,
      "backend_ask_entrypoint_observed",
      "backendAskEntrypointObserved",
      "ask_entrypoint_observed",
    );
    const invalidDurableTerminalAnswer = policy.isInvalidTerminalAnswerText(answer);
    const observedFinalAnswerSource = readStringValue(message.helixAsk, "final_answer_source", "finalAnswerSource");
    const observedTerminalArtifactKind = readStringValue(message.helixAsk, "terminal_artifact_kind", "terminalArtifactKind");
    const observedTerminalErrorCode = readStringValue(message.helixAsk, "terminal_error_code", "terminalErrorCode");
    const baseDebug = {
      durable_chat_projection: true,
      ask_entrypoint_required: askEntrypointRequired,
      ask_entrypoint_observed: askEntrypointObserved,
      backend_ask_call_attempted: readBooleanFlag(
        message.helixAsk,
        "backend_ask_call_attempted",
        "backendAskCallAttempted",
      ),
      use_backend_ask_turn_entrypoint: readBooleanFlag(
        message.helixAsk,
        "use_backend_ask_turn_entrypoint",
        "useBackendAskTurnEntrypoint",
      ),
      session_id: session.id,
      user_message_id: pendingUser?.id ?? null,
      assistant_message_id: message.id,
      created_at_ms: createdAtMs,
      turn_id: turnId,
    };

    if (askEntrypointRequired && !askEntrypointObserved) {
      pendingUser = null;
      continue;
    }

    if (invalidDurableTerminalAnswer) {
      const failureText = policy.renderTypedFailureFallback("terminal_authority_missing");
      replies.push({
        id: buildHelixAskChatProjectionId(session, pendingUser, message),
        createdAtMs,
        content: failureText,
        question,
        turn_id: turnId,
        ok: false,
        final_answer_source: "typed_failure",
        terminal_artifact_kind: "typed_failure",
        terminal_error_code: "terminal_authority_missing",
        debug: {
          ...baseDebug,
          ask_entrypoint_failure_code: "terminal_authority_missing",
          blocked_projection_kind: "durable_chat_session",
          selected_final_answer: failureText,
          final_answer_source: "typed_failure",
          terminal_artifact_kind: "typed_failure",
          terminal_error_code: "terminal_authority_missing",
          typed_failure: {
            schema: "helix.ask.typed_failure.v1",
            code: "terminal_authority_missing",
            message: failureText,
          },
          resolved_turn_summary: {
            final_status: "final_failure",
            terminal_artifact_kind: "typed_failure",
            terminal_error_code: "terminal_authority_missing",
          },
        },
      });
      pendingUser = null;
      continue;
    }

    replies.push({
      id: buildHelixAskChatProjectionId(session, pendingUser, message),
      createdAtMs,
      content: answer,
      question,
      turn_id: turnId,
      ok: true,
      final_answer_source: observedFinalAnswerSource ?? "durable_chat_session",
      terminal_artifact_kind: observedTerminalArtifactKind ?? "chat_final_answer",
      terminal_error_code: observedTerminalErrorCode,
      debug: {
        ...baseDebug,
        ask_entrypoint_failure_code: null,
        blocked_projection_kind: null,
      },
    });
    pendingUser = null;
  }
  return replies;
}
