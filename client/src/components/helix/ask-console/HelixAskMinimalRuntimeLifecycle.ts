import { HELIX_ASK_PROGRESS_PLACEHOLDER_TEXT } from "@/lib/helix/ask-debug-event-display";
import { chooseVisibleFinalText } from "@/lib/helix/ask-terminal-projection";

import { appendHelixAskConsoleReplyChronologically } from "./HelixAskReplyLifecycle";
import type { HelixAskMinimalRuntimeSubmitPlan } from "./HelixAskMinimalRuntimeSubmitPlan";
import type { HelixAskMinimalRuntimeTransportResult } from "./HelixAskMinimalRuntimeTransport";

export const HELIX_ASK_MINIMAL_RUNTIME_REPLY_LIMIT = 80;

export type HelixAskMinimalRuntimeReply = {
  id: string;
  turn_id: string;
  createdAtMs: number;
  content: string;
  question: string;
  mode: "observe";
  result?: HelixAskMinimalRuntimeTransportResult;
  debug?: unknown;
  liveEvents: Array<{
    id: string;
    text: string;
    tool: "helix.ask.client";
    ts: string;
    tsMs: number;
    meta: {
      kind:
        | "client_optimistic_turn_start"
        | "client_transport_stream_event"
        | "client_transport_turn_final"
        | "client_transport_turn_error";
      turn_id: string;
      assistant_answer: false;
      stream_event?: string;
    };
  }>;
};

export type HelixAskMinimalRuntimeState = {
  askBusy: boolean;
  askStatus: string | null;
  activeTurnId: string | null;
  activeStartedAtMs: number | null;
  replies: HelixAskMinimalRuntimeReply[];
};

export function createHelixAskMinimalRuntimeInitialState(): HelixAskMinimalRuntimeState {
  return {
    askBusy: false,
    askStatus: null,
    activeTurnId: null,
    activeStartedAtMs: null,
    replies: [],
  };
}

export function startHelixAskMinimalRuntimeTurn(args: {
  state: HelixAskMinimalRuntimeState;
  submitPlan: HelixAskMinimalRuntimeSubmitPlan;
  turnId: string;
  startedAtMs: number;
}): HelixAskMinimalRuntimeState {
  const question = args.submitPlan.envelope?.question?.trim();
  if (!question) return args.state;
  const startedAtIso = new Date(args.startedAtMs).toISOString();
  return {
    ...args.state,
    askBusy: true,
    askStatus: "Interpreting prompt...",
    activeTurnId: args.turnId,
    activeStartedAtMs: args.startedAtMs,
    replies: appendHelixAskConsoleReplyChronologically(
      args.state.replies,
      {
        id: args.turnId,
        turn_id: args.turnId,
        createdAtMs: args.startedAtMs,
        content: HELIX_ASK_PROGRESS_PLACEHOLDER_TEXT,
        question,
        mode: "observe",
        liveEvents: [
          {
            id: `turn-start:${args.turnId}`,
            text: "Turn started.",
            tool: "helix.ask.client",
            ts: startedAtIso,
            tsMs: args.startedAtMs,
            meta: {
              kind: "client_optimistic_turn_start",
              turn_id: args.turnId,
              assistant_answer: false,
            },
          },
        ],
      },
      HELIX_ASK_MINIMAL_RUNTIME_REPLY_LIMIT,
    ),
  };
}

export function coerceHelixAskMinimalRuntimeText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return String(value);
  } catch {
    return "";
  }
}

export function resolveHelixAskMinimalRuntimeAnswerText(
  result: HelixAskMinimalRuntimeTransportResult,
): string {
  const visibleTerminalText = chooseVisibleFinalText({
    ...(result as Record<string, unknown>),
    id: coerceHelixAskMinimalRuntimeText(result.turn_id).trim() || "minimal-runtime-result",
    debug: result.debug,
  });
  if (visibleTerminalText.trim()) {
    return visibleTerminalText.trim();
  }
  return (
    coerceHelixAskMinimalRuntimeText(result.selected_final_answer).trim() ||
    coerceHelixAskMinimalRuntimeText(result.assistant_answer).trim() ||
    coerceHelixAskMinimalRuntimeText(result.text).trim() ||
    "No answer text returned."
  );
}

export function completeHelixAskMinimalRuntimeTurn(args: {
  state: HelixAskMinimalRuntimeState;
  turnId: string;
  result: HelixAskMinimalRuntimeTransportResult;
  completedAtMs: number;
}): HelixAskMinimalRuntimeState {
  const answerText = resolveHelixAskMinimalRuntimeAnswerText(args.result);
  const completedAtIso = new Date(args.completedAtMs).toISOString();
  return {
    ...args.state,
    askBusy: false,
    askStatus: "Final answer ready.",
    activeTurnId: args.state.activeTurnId === args.turnId ? null : args.state.activeTurnId,
    activeStartedAtMs: args.state.activeTurnId === args.turnId ? null : args.state.activeStartedAtMs,
    replies: args.state.replies.map((reply) => {
      if (reply.turn_id !== args.turnId) return reply;
      return {
        ...reply,
        content: answerText,
        result: args.result,
        debug: args.result.debug,
        liveEvents: [
          ...reply.liveEvents,
          {
            id: `turn-final:${args.turnId}`,
            text: "Final answer ready.",
            tool: "helix.ask.client",
            ts: completedAtIso,
            tsMs: args.completedAtMs,
            meta: {
              kind: "client_transport_turn_final",
              turn_id: args.turnId,
              assistant_answer: false,
            },
          },
        ],
      };
    }),
  };
}

export function recordHelixAskMinimalRuntimeStreamEvent(args: {
  state: HelixAskMinimalRuntimeState;
  turnId: string;
  eventName: string;
  receivedAtMs: number;
}): HelixAskMinimalRuntimeState {
  const eventName = coerceHelixAskMinimalRuntimeText(args.eventName).trim() || "stream_event";
  const receivedAtIso = new Date(args.receivedAtMs).toISOString();
  return {
    ...args.state,
    replies: args.state.replies.map((reply) => {
      if (reply.turn_id !== args.turnId) return reply;
      return {
        ...reply,
        liveEvents: [
          ...reply.liveEvents,
          {
            id: `turn-stream:${args.turnId}:${reply.liveEvents.length}`,
            text: `Stream event: ${eventName}`,
            tool: "helix.ask.client",
            ts: receivedAtIso,
            tsMs: args.receivedAtMs,
            meta: {
              kind: "client_transport_stream_event",
              turn_id: args.turnId,
              stream_event: eventName,
              assistant_answer: false,
            },
          },
        ],
      };
    }),
  };
}

export function failHelixAskMinimalRuntimeTurn(args: {
  state: HelixAskMinimalRuntimeState;
  turnId: string;
  error: unknown;
  failedAtMs: number;
}): HelixAskMinimalRuntimeState {
  const message =
    coerceHelixAskMinimalRuntimeText(args.error instanceof Error ? args.error.message : args.error).trim() ||
    "Ask turn failed.";
  const failedAtIso = new Date(args.failedAtMs).toISOString();
  return {
    ...args.state,
    askBusy: false,
    askStatus: "Ask turn failed.",
    activeTurnId: args.state.activeTurnId === args.turnId ? null : args.state.activeTurnId,
    activeStartedAtMs: args.state.activeTurnId === args.turnId ? null : args.state.activeStartedAtMs,
    replies: args.state.replies.map((reply) => {
      if (reply.turn_id !== args.turnId) return reply;
      return {
        ...reply,
        content: message,
        liveEvents: [
          ...reply.liveEvents,
          {
            id: `turn-error:${args.turnId}`,
            text: message,
            tool: "helix.ask.client",
            ts: failedAtIso,
            tsMs: args.failedAtMs,
            meta: {
              kind: "client_transport_turn_error",
              turn_id: args.turnId,
              assistant_answer: false,
            },
          },
        ],
      };
    }),
  };
}
