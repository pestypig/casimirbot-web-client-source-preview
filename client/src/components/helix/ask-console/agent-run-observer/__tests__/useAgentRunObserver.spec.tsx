/** @vitest-environment jsdom */

import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRunObserverApi } from "../AgentRunObserverApi";
import type {
  AgentRunObserverEvent,
  AgentRunObserverEventsPage,
  AgentRunObserverTerminalMessage,
} from "../AgentRunObserverContracts";
import {
  reconcileAgentRunObserverTerminalMessage,
  useAgentRunObserver,
} from "../useAgentRunObserver";
import { AGI_CHAT_STORAGE_KEY, useAgiChatStore } from "@/store/useAgiChatStore";
import { useWorkspaceMemoryRegistryStore } from "@/store/useWorkspaceMemoryRegistryStore";

const falseAuthority = {
  answer_authority: false,
  assistant_answer: false,
  terminal_eligible: false,
  raw_content_included: false,
} as const;

const event = (
  seq: number,
  eventType: AgentRunObserverEvent["event_type"],
  payload: Record<string, unknown> = {},
): AgentRunObserverEvent => ({
  schema: "helix.agent_run.event.v1",
  event_id: `event-${seq}`,
  run_id: "run-a",
  seq,
  event_type: eventType,
  payload,
  created_at: `2026-07-26T15:0${seq}:00.000Z`,
  ...falseAuthority,
});

const terminalMessage: AgentRunObserverTerminalMessage = {
  message_id: "agent-terminal:binding-a:authority-a",
  role: "assistant",
  content: "The verified external-agent answer.",
  at: "2026-07-26T15:03:00.000Z",
  traceId: "run-a",
  helixAsk: {
    schema: "helix.agent_run_observer.terminal_projection.v1",
    binding_ref: "binding-a",
    authority_ref: "authority-a",
    terminal_text_hash: "sha256:terminal-a",
  },
};

const page = (input: {
  events: AgentRunObserverEvent[];
  nextAfterSeq: number;
  hasMore?: boolean;
  terminal?: AgentRunObserverTerminalMessage | null;
}): AgentRunObserverEventsPage => ({
  schema: "helix.agent_run_observer.events_page.v1",
  binding_ref: "binding-a",
  events: input.events,
  next_after_seq: input.nextAfterSeq,
  has_more: input.hasMore ?? false,
  terminal_message: input.terminal ?? null,
  ...falseAuthority,
});

function Harness(input: { api: AgentRunObserverApi; chatSessionId: string }) {
  const controller = useAgentRunObserver({
    api: input.api,
    chatSessionId: input.chatSessionId,
    bindingRef: "binding-a",
    pollIntervalMs: 25,
  });
  return (
    <div>
      <span data-testid="phase">{controller.phase}</span>
      <span data-testid="after-seq">{controller.afterSeq}</span>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useAgiChatStore.setState({
    sessions: {},
    activeId: undefined,
    hydrated: true,
  });
  useWorkspaceMemoryRegistryStore.setState({ artifacts: {} });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useAgentRunObserver", () => {
  it("polls after_seq and appends only the stable authorized terminal projection", async () => {
    vi.useFakeTimers();
    const chatSessionId = useAgiChatStore.getState().newSession("Observed");
    const pages = [
      page({ events: [event(1, "run_started")], nextAfterSeq: 1 }),
      page({
        events: [
          event(2, "evidence_reentered", {
            receipt_text: "This receipt is not an answer.",
          }),
          event(3, "run_completed"),
        ],
        nextAfterSeq: 3,
        terminal: terminalMessage,
      }),
    ];
    const listEvents = vi.fn(async () => pages.shift() ?? pages[0]!);
    const api = { listEvents } as unknown as AgentRunObserverApi;

    const rendered = render(
      <Harness api={api} chatSessionId={chatSessionId} />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(listEvents).toHaveBeenCalledWith(
      "binding-a",
      expect.objectContaining({ afterSeq: 0 }),
    );
    expect(
      useAgiChatStore.getState().sessions[chatSessionId]?.messages,
    ).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(25);
    });

    expect(listEvents).toHaveBeenLastCalledWith(
      "binding-a",
      expect.objectContaining({ afterSeq: 1 }),
    );
    expect(screen.getByTestId("phase")).toHaveTextContent("completed");
    expect(screen.getByTestId("after-seq")).toHaveTextContent("3");
    expect(
      useAgiChatStore.getState().sessions[chatSessionId]?.messages,
    ).toEqual([
      expect.objectContaining({
        id: terminalMessage.message_id,
        role: "assistant",
        content: terminalMessage.content,
      }),
    ]);

    rendered.unmount();
    const replayApi = {
      listEvents: vi.fn(async () =>
        page({
          events: [event(3, "run_completed")],
          nextAfterSeq: 3,
          terminal: terminalMessage,
        }),
      ),
    } as unknown as AgentRunObserverApi;
    render(<Harness api={replayApi} chatSessionId={chatSessionId} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      useAgiChatStore.getState().sessions[chatSessionId]?.messages,
    ).toHaveLength(1);
  });

  it("restores the full canonical terminal after a persisted reload truncated its chat copy", async () => {
    vi.useFakeTimers();
    const chatSessionId = useAgiChatStore
      .getState()
      .newSession("Observed after reload");
    const longTerminalMessage: AgentRunObserverTerminalMessage = {
      ...terminalMessage,
      content: `Verified terminal result: ${"current-turn evidence ".repeat(
        900,
      )}`,
    };
    useAgiChatStore.getState().appendMessageOnce(chatSessionId, {
      id: longTerminalMessage.message_id,
      role: longTerminalMessage.role,
      content: longTerminalMessage.content,
      at: longTerminalMessage.at,
      traceId: longTerminalMessage.traceId,
      helixAsk: { ...longTerminalMessage.helixAsk },
    });
    const persistedEnvelope =
      window.localStorage.getItem(AGI_CHAT_STORAGE_KEY) ?? "";

    useAgiChatStore.setState({
      sessions: {},
      activeId: undefined,
      hydrated: false,
    });
    window.localStorage.setItem(AGI_CHAT_STORAGE_KEY, persistedEnvelope);
    await useAgiChatStore.persist.rehydrate();
    expect(
      useAgiChatStore.getState().sessions[chatSessionId]?.messages[0]?.content,
    ).toContain("chars for saved chat copy]");

    const api = {
      listEvents: vi.fn(async () =>
        page({
          events: [event(1, "run_completed")],
          nextAfterSeq: 1,
          terminal: longTerminalMessage,
        }),
      ),
    } as unknown as AgentRunObserverApi;
    render(<Harness api={api} chatSessionId={chatSessionId} />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByTestId("phase")).toHaveTextContent("completed");
    expect(
      useAgiChatStore.getState().sessions[chatSessionId]?.messages,
    ).toEqual([
      expect.objectContaining({
        id: longTerminalMessage.message_id,
        content: longTerminalMessage.content,
      }),
    ]);
  });

  it("deduplicates a canonical terminal projection from concurrent observer instances", async () => {
    vi.useFakeTimers();
    const chatSessionId = useAgiChatStore
      .getState()
      .newSession("Observed concurrently");
    const listEvents = vi.fn(async () =>
      page({
        events: [event(1, "run_completed")],
        nextAfterSeq: 1,
        terminal: terminalMessage,
      }),
    );
    const api = { listEvents } as unknown as AgentRunObserverApi;

    render(
      <>
        <Harness api={api} chatSessionId={chatSessionId} />
        <Harness api={api} chatSessionId={chatSessionId} />
      </>,
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(listEvents).toHaveBeenCalledTimes(2);
    expect(screen.getAllByTestId("phase")).toHaveLength(2);
    expect(
      screen
        .getAllByTestId("phase")
        .every((phase) => phase.textContent === "completed"),
    ).toBe(true);
    expect(
      useAgiChatStore.getState().sessions[chatSessionId]?.messages,
    ).toEqual([
      expect.objectContaining({
        id: terminalMessage.message_id,
        content: terminalMessage.content,
      }),
    ]);
  });

  it("never turns event receipts into chat messages", async () => {
    vi.useFakeTimers();
    const chatSessionId = useAgiChatStore.getState().newSession("Observed");
    const api = {
      listEvents: vi.fn(async () =>
        page({
          events: [
            event(1, "run_waiting", {
              content: "Receipt-shaped text is still not an assistant answer.",
            }),
          ],
          nextAfterSeq: 1,
        }),
      ),
    } as unknown as AgentRunObserverApi;

    const rendered = render(
      <Harness api={api} chatSessionId={chatSessionId} />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId("phase")).toHaveTextContent("waiting");
    expect(
      useAgiChatStore.getState().sessions[chatSessionId]?.messages,
    ).toHaveLength(0);
    rendered.unmount();
  });

  it("fails closed when a stable message id conflicts with stored content", () => {
    const appendMessageOnce = vi.fn(() => ({
      inserted: false,
      message: {
        id: terminalMessage.message_id,
        role: "assistant" as const,
        content: "Different content already owns this id.",
        at: terminalMessage.at,
        traceId: terminalMessage.traceId,
        helixAsk: terminalMessage.helixAsk,
      },
    }));

    expect(
      reconcileAgentRunObserverTerminalMessage({
        chatSessionId: "chat-a",
        bindingRef: "binding-a",
        terminalMessage,
        appendMessageOnce,
      }),
    ).toEqual({
      status: "conflict",
      messageId: terminalMessage.message_id,
    });
  });
});
