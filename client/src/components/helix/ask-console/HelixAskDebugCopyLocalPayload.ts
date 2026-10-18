import { safeJsonStringify } from "@/lib/helix/ask-debug-event-display";
import { readAgentLoopAuditRecord } from "@/lib/helix/ask-runtime-authority-readers";

export type HelixAskDebugCopyLocalReply = {
  question?: unknown;
  content?: unknown;
  debug?: unknown;
  [key: string]: unknown;
};

export type HelixAskDebugCopyVisibleTerminal = {
  text?: string | null;
};

export function normalizeHelixAskReplyMasterDebugPayload(args: {
  reply: HelixAskDebugCopyLocalReply;
  payload: string | null | undefined;
  buildReplyScopedDebugExportFromRenderedReply: (
    reply: HelixAskDebugCopyLocalReply,
    reason: string,
  ) => string;
  debugPayloadMatchesRenderedReply: (
    reply: HelixAskDebugCopyLocalReply,
    payload: Record<string, unknown>,
  ) => boolean;
  isCanceledPendingTurn: (
    reply: HelixAskDebugCopyLocalReply,
    replyDebug: unknown,
    parsed: Record<string, unknown>,
    parsedDebug: unknown,
    parsedAgentLoop: unknown,
  ) => boolean;
  resolveVisibleTerminal: (
    reply: HelixAskDebugCopyLocalReply,
    fallbackContent?: string | null,
  ) => HelixAskDebugCopyVisibleTerminal;
}): string {
  const trimmed = typeof args.payload === "string" ? args.payload.trim() : "";
  if (!trimmed) return args.buildReplyScopedDebugExportFromRenderedReply(args.reply, "empty_payload");
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") {
      if (!args.debugPayloadMatchesRenderedReply(args.reply, parsed)) {
        return args.buildReplyScopedDebugExportFromRenderedReply(args.reply, "payload_reply_mismatch");
      }
      const canceledPendingTurn = args.isCanceledPendingTurn(
        args.reply,
        args.reply.debug,
        parsed,
        parsed.debug,
        parsed.agentLoop,
      );
      if (canceledPendingTurn) {
        const parsedAgentLoop = readAgentLoopAuditRecord(parsed.agentLoop);
        const parsedDebugContext = readAgentLoopAuditRecord(parsed.debugContext);
        parsed.pendingCanceled = true;
        parsed.agentLoop = parsedAgentLoop
          ? {
              ...parsedAgentLoop,
              pending_request: null,
              pending_canceled: true,
            }
          : parsed.agentLoop;
        parsed.debugContext = parsedDebugContext
          ? {
              ...parsedDebugContext,
              pending_request: null,
              pending_server_request: null,
              pending_canceled: true,
            }
          : parsed.debugContext;
      }
      const hasVisibleAnswer =
        typeof parsed.selectedDebugFinalAnswer === "string" ||
        typeof parsed.finalAnswer === "string" ||
        Boolean(readAgentLoopAuditRecord(parsed.visibleAnswerState)?.finalAnswer);
      if (!hasVisibleAnswer) {
        const terminalText = args.resolveVisibleTerminal(
          args.reply,
          typeof args.reply.content === "string" ? args.reply.content : null,
        ).text || (typeof args.reply.content === "string" ? args.reply.content : "");
        return safeJsonStringify({
          ...parsed,
          schema: typeof parsed.schema === "string" ? parsed.schema : "helix.ask.master_event_clock.v2",
          visibleAnswerState: {
            question: args.reply.question ?? null,
            finalAnswer: terminalText,
          },
          finalAnswer: terminalText,
        });
      }
    }
    return trimmed;
  } catch {
    return args.buildReplyScopedDebugExportFromRenderedReply(args.reply, "invalid_json_payload");
  }
}
