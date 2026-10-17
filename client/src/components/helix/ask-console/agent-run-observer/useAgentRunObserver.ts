import { useEffect, useMemo, useState } from "react";
import type { ChatMessage } from "@shared/agi-chat";
import {
  useAgiChatStore,
  type AppendAgiChatMessageOnceResult,
} from "@/store/useAgiChatStore";
import {
  agentRunObserverApi,
  AgentRunObserverApiError,
  type AgentRunObserverApi,
} from "./AgentRunObserverApi";
import {
  AGENT_RUN_OBSERVER_TERMINAL_PROJECTION_SCHEMA,
  type AgentRunObserverEvent,
  type AgentRunObserverTerminalMessage,
} from "./AgentRunObserverContracts";

export const AGENT_RUN_OBSERVER_POLL_INTERVAL_MS = 1_500;
export const AGENT_RUN_OBSERVER_EVENT_PAGE_SIZE = 100;

export type AgentRunObserverPhase =
  | "idle"
  | "observing"
  | "waiting"
  | "completed"
  | "completed_without_terminal"
  | "blocked"
  | "failed"
  | "cancelled"
  | "error";

export type AgentRunObserverTerminalReconciliation =
  | { status: "absent"; messageId: null }
  | { status: "inserted" | "already_present"; messageId: string }
  | { status: "conflict"; messageId: string };

export type AppendAgentRunObserverMessageOnce = (
  sessionId: string,
  message: ChatMessage,
) => AppendAgiChatMessageOnceResult;

const appendToAgiChat: AppendAgentRunObserverMessageOnce = (
  sessionId,
  message,
) => useAgiChatStore.getState().appendMessageOnce(sessionId, message);

const readProjectionMetadata = (
  message: ChatMessage | null,
): Record<string, unknown> | null => {
  if (!message?.helixAsk || typeof message.helixAsk !== "object") return null;
  return message.helixAsk;
};

export const reconcileAgentRunObserverTerminalMessage = (input: {
  chatSessionId: string;
  bindingRef: string;
  terminalMessage: AgentRunObserverTerminalMessage | null;
  appendMessageOnce: AppendAgentRunObserverMessageOnce;
}): AgentRunObserverTerminalReconciliation => {
  const projection = input.terminalMessage;
  if (!projection) return { status: "absent", messageId: null };
  if (
    !input.chatSessionId.trim() ||
    !input.bindingRef.trim() ||
    !projection.message_id.trim() ||
    projection.role !== "assistant" ||
    !projection.content.trim() ||
    !projection.at.trim() ||
    !projection.traceId.trim() ||
    projection.helixAsk.schema !==
      AGENT_RUN_OBSERVER_TERMINAL_PROJECTION_SCHEMA ||
    projection.helixAsk.binding_ref !== input.bindingRef ||
    !projection.helixAsk.authority_ref.trim() ||
    !projection.helixAsk.terminal_text_hash.trim()
  ) {
    return { status: "conflict", messageId: projection.message_id };
  }

  const completeMessage: ChatMessage = {
    id: projection.message_id,
    role: "assistant",
    content: projection.content,
    at: projection.at,
    traceId: projection.traceId,
    helixAsk: { ...projection.helixAsk },
  };
  const result = input.appendMessageOnce(input.chatSessionId, completeMessage);
  const metadata = readProjectionMetadata(result.message);
  const exactProjection =
    result.message?.id === completeMessage.id &&
    result.message.role === completeMessage.role &&
    result.message.content === completeMessage.content &&
    result.message.at === completeMessage.at &&
    result.message.traceId === completeMessage.traceId &&
    metadata?.schema === AGENT_RUN_OBSERVER_TERMINAL_PROJECTION_SCHEMA &&
    metadata.binding_ref === input.bindingRef &&
    metadata.authority_ref === projection.helixAsk.authority_ref &&
    metadata.terminal_text_hash === projection.helixAsk.terminal_text_hash;
  if (!exactProjection) {
    return { status: "conflict", messageId: projection.message_id };
  }
  return {
    status: result.inserted ? "inserted" : "already_present",
    messageId: projection.message_id,
  };
};

const mergeEvents = (
  current: readonly AgentRunObserverEvent[],
  incoming: readonly AgentRunObserverEvent[],
): AgentRunObserverEvent[] => {
  const byId = new Map(
    current.map((event) => [event.event_id, event] as const),
  );
  incoming.forEach((event) => byId.set(event.event_id, event));
  return [...byId.values()].sort((left, right) => left.seq - right.seq);
};

const derivePhase = (
  events: readonly AgentRunObserverEvent[],
  terminalStatus: AgentRunObserverTerminalReconciliation["status"],
): AgentRunObserverPhase => {
  const types = new Set(events.map((event) => event.event_type));
  if (types.has("run_cancelled")) return "cancelled";
  if (types.has("run_failed")) return "failed";
  if (types.has("run_blocked") || types.has("budget_exhausted")) {
    return "blocked";
  }
  if (types.has("run_completed")) {
    return terminalStatus === "inserted" || terminalStatus === "already_present"
      ? "completed"
      : "completed_without_terminal";
  }
  if (types.has("input_requested") || types.has("run_waiting")) {
    return "waiting";
  }
  return "observing";
};

const isTerminalPhase = (phase: AgentRunObserverPhase): boolean =>
  phase === "completed" ||
  phase === "completed_without_terminal" ||
  phase === "blocked" ||
  phase === "failed" ||
  phase === "cancelled";

export type AgentRunObserverController = {
  bindingRef: string | null;
  chatSessionId: string | null;
  phase: AgentRunObserverPhase;
  events: AgentRunObserverEvent[];
  afterSeq: number;
  terminalMessageId: string | null;
  error: AgentRunObserverApiError | null;
};

export const useAgentRunObserver = (input: {
  chatSessionId: string | null;
  bindingRef: string | null;
  enabled?: boolean;
  api?: AgentRunObserverApi;
  pollIntervalMs?: number;
  pageSize?: number;
  appendMessageOnce?: AppendAgentRunObserverMessageOnce;
}): AgentRunObserverController => {
  const api = input.api ?? agentRunObserverApi;
  const appendMessageOnce = input.appendMessageOnce ?? appendToAgiChat;
  const pollIntervalMs = Math.max(
    10,
    Math.floor(input.pollIntervalMs ?? AGENT_RUN_OBSERVER_POLL_INTERVAL_MS),
  );
  const pageSize = Math.max(
    1,
    Math.min(
      AGENT_RUN_OBSERVER_EVENT_PAGE_SIZE,
      Math.floor(input.pageSize ?? AGENT_RUN_OBSERVER_EVENT_PAGE_SIZE),
    ),
  );
  const enabled =
    input.enabled !== false &&
    Boolean(input.bindingRef?.trim()) &&
    Boolean(input.chatSessionId?.trim());

  const [controller, setController] = useState<AgentRunObserverController>({
    bindingRef: input.bindingRef,
    chatSessionId: input.chatSessionId,
    phase: enabled ? "observing" : "idle",
    events: [],
    afterSeq: 0,
    terminalMessageId: null,
    error: null,
  });

  useEffect(() => {
    const bindingRef = input.bindingRef?.trim() ?? "";
    const chatSessionId = input.chatSessionId?.trim() ?? "";
    if (!enabled || !bindingRef || !chatSessionId) {
      setController({
        bindingRef: input.bindingRef,
        chatSessionId: input.chatSessionId,
        phase: "idle",
        events: [],
        afterSeq: 0,
        terminalMessageId: null,
        error: null,
      });
      return;
    }

    let disposed = false;
    let afterSeq = 0;
    let events: AgentRunObserverEvent[] = [];
    let timer: number | null = null;
    const abortController = new AbortController();

    setController({
      bindingRef,
      chatSessionId,
      phase: "observing",
      events: [],
      afterSeq: 0,
      terminalMessageId: null,
      error: null,
    });

    const schedule = (delay: number): void => {
      if (disposed) return;
      timer = window.setTimeout(() => {
        void poll();
      }, delay);
    };

    const poll = async (): Promise<void> => {
      try {
        const page = await api.listEvents(bindingRef, {
          afterSeq,
          limit: pageSize,
          signal: abortController.signal,
        });
        if (disposed) return;
        if (page.next_after_seq < afterSeq) {
          throw new AgentRunObserverApiError({
            code: "observer_response_invalid",
            message: "The observer event cursor moved backwards.",
            status: 502,
          });
        }
        events = mergeEvents(events, page.events);
        afterSeq = page.next_after_seq;
        const terminal = reconcileAgentRunObserverTerminalMessage({
          chatSessionId,
          bindingRef,
          terminalMessage: page.terminal_message,
          appendMessageOnce,
        });
        if (terminal.status === "conflict") {
          throw new AgentRunObserverApiError({
            code: "observer_response_invalid",
            message:
              "The terminal projection conflicts with the selected chat.",
            status: 409,
          });
        }
        const phase = derivePhase(events, terminal.status);
        setController({
          bindingRef,
          chatSessionId,
          phase,
          events,
          afterSeq,
          terminalMessageId: terminal.messageId,
          error: null,
        });
        if (isTerminalPhase(phase)) return;
        schedule(page.has_more ? 0 : pollIntervalMs);
      } catch (error) {
        if (disposed || abortController.signal.aborted) return;
        const observerError =
          error instanceof AgentRunObserverApiError
            ? error
            : new AgentRunObserverApiError({
                message:
                  error instanceof Error
                    ? error.message
                    : "External agent observer polling failed.",
                status: 0,
              });
        setController({
          bindingRef,
          chatSessionId,
          phase: "error",
          events,
          afterSeq,
          terminalMessageId: null,
          error: observerError,
        });
      }
    };

    void poll();
    return () => {
      disposed = true;
      abortController.abort();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [
    api,
    appendMessageOnce,
    enabled,
    input.bindingRef,
    input.chatSessionId,
    pageSize,
    pollIntervalMs,
  ]);

  return useMemo(() => controller, [controller]);
};
