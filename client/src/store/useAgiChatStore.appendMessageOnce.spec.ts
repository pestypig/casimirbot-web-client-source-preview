// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import type { ChatMessage } from "@shared/agi-chat";
import { AGI_CHAT_STORAGE_KEY, useAgiChatStore } from "@/store/useAgiChatStore";
import { useWorkspaceMemoryRegistryStore } from "@/store/useWorkspaceMemoryRegistryStore";

const terminalMessage: ChatMessage = {
  id: "agent-terminal:binding-a:authority-a",
  role: "assistant",
  content: "The external run completed with verified current-turn evidence.",
  at: "2026-07-26T14:30:00.000Z",
  traceId: "agent-run-a",
  helixAsk: {
    schema: "helix.agent_run_observer.terminal_projection.v1",
    binding_ref: "binding-a",
    authority_ref: "authority-a",
    terminal_text_hash: "sha256:terminal-a",
  },
};

describe("useAgiChatStore.appendMessageOnce", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAgiChatStore.setState({
      sessions: {},
      activeId: undefined,
      hydrated: true,
    });
    useWorkspaceMemoryRegistryStore.setState({ artifacts: {} });
  });

  it("inserts a complete stable message exactly once", () => {
    const sessionId = useAgiChatStore
      .getState()
      .newSession("Agent observer", "helix-ask-chat:agent-observer");

    const first = useAgiChatStore
      .getState()
      .appendMessageOnce(sessionId, terminalMessage);
    const replay = useAgiChatStore
      .getState()
      .appendMessageOnce(sessionId, terminalMessage);

    expect(first).toMatchObject({
      inserted: true,
      message: { id: terminalMessage.id },
    });
    expect(replay).toMatchObject({
      inserted: false,
      message: { id: terminalMessage.id },
    });
    expect(useAgiChatStore.getState().sessions[sessionId]?.messages).toEqual([
      expect.objectContaining({
        ...terminalMessage,
        tokens: expect.any(Number),
      }),
    ]);
  });

  it.each(["New chat", "My saved title"])("preserves first-user title behavior for %s on replay", title => {
    const id = useAgiChatStore.getState().newSession(title);
    const message: ChatMessage = { id: "steering:one", role: "user", content: "Inspect the platform",
      at: "2026-09-08T12:00:00.000Z" };
    useAgiChatStore.getState().appendMessageOnce(id, message);
    const first = useAgiChatStore.getState().sessions[id];
    expect(first.title).toBe(title === "New chat" ? message.content : title);
    useAgiChatStore.getState().appendMessageOnce(id, { ...message, content: "Conflicting replay" });
    expect(useAgiChatStore.getState().sessions[id]).toEqual(first);
  });

  it("does not overwrite an existing stable message on conflicting replay", () => {
    const sessionId = useAgiChatStore.getState().newSession("Agent observer");
    useAgiChatStore.getState().appendMessageOnce(sessionId, terminalMessage);

    const replay = useAgiChatStore.getState().appendMessageOnce(sessionId, {
      ...terminalMessage,
      content: "A conflicting replay must not replace the accepted projection.",
    });

    expect(replay.inserted).toBe(false);
    expect(replay.message?.content).toBe(terminalMessage.content);
    expect(
      useAgiChatStore.getState().sessions[sessionId]?.messages,
    ).toHaveLength(1);
  });

  it("repairs only the canonical full terminal projection after a persisted reload truncates its chat copy", async () => {
    const sessionId = useAgiChatStore
      .getState()
      .newSession("Agent observer", "helix-ask-chat:agent-observer");
    const longTerminalMessage = {
      ...terminalMessage,
      content: `Verified terminal result: ${"current-turn evidence ".repeat(
        900,
      )}`,
    };
    useAgiChatStore
      .getState()
      .appendMessageOnce(sessionId, longTerminalMessage);

    const persistedEnvelope = window.localStorage.getItem(AGI_CHAT_STORAGE_KEY);
    expect(persistedEnvelope).toBeTruthy();
    const persistedContent = JSON.parse(persistedEnvelope ?? "{}")?.state
      ?.sessions?.[sessionId]?.messages?.[0]?.content;
    expect(persistedContent).toContain("chars for saved chat copy]");
    expect(persistedContent).not.toBe(longTerminalMessage.content);

    useAgiChatStore.setState({
      sessions: {},
      activeId: undefined,
      hydrated: false,
    });
    window.localStorage.setItem(AGI_CHAT_STORAGE_KEY, persistedEnvelope ?? "");
    await useAgiChatStore.persist.rehydrate();
    expect(
      useAgiChatStore.getState().sessions[sessionId]?.messages[0]?.content,
    ).toBe(persistedContent);

    const replay = useAgiChatStore
      .getState()
      .appendMessageOnce(sessionId, longTerminalMessage);

    expect(replay).toMatchObject({
      inserted: false,
      message: {
        id: terminalMessage.id,
        content: longTerminalMessage.content,
      },
    });
    expect(useAgiChatStore.getState().sessions[sessionId]?.messages).toEqual([
      expect.objectContaining({
        id: terminalMessage.id,
        content: longTerminalMessage.content,
      }),
    ]);
  });

  it("does not repair a truncation-shaped replay with a different terminal identity", async () => {
    const sessionId = useAgiChatStore
      .getState()
      .newSession("Agent observer", "helix-ask-chat:agent-observer");
    const longTerminalMessage = {
      ...terminalMessage,
      content: `Verified terminal result: ${"current-turn evidence ".repeat(
        900,
      )}`,
    };
    useAgiChatStore
      .getState()
      .appendMessageOnce(sessionId, longTerminalMessage);
    const persistedEnvelope =
      window.localStorage.getItem(AGI_CHAT_STORAGE_KEY) ?? "";

    useAgiChatStore.setState({
      sessions: {},
      activeId: undefined,
      hydrated: false,
    });
    window.localStorage.setItem(AGI_CHAT_STORAGE_KEY, persistedEnvelope);
    await useAgiChatStore.persist.rehydrate();
    const persistedMessage =
      useAgiChatStore.getState().sessions[sessionId]?.messages[0];

    const replay = useAgiChatStore.getState().appendMessageOnce(sessionId, {
      ...longTerminalMessage,
      helixAsk: {
        ...longTerminalMessage.helixAsk,
        terminal_text_hash: "sha256:different-terminal",
      },
    });

    expect(replay).toEqual({
      inserted: false,
      message: persistedMessage,
    });
    expect(replay.message?.content).toContain("chars for saved chat copy]");
    expect(replay.message?.helixAsk?.terminal_text_hash).toBe(
      "sha256:terminal-a",
    );
  });

  it("fails closed when the target session does not exist", () => {
    expect(
      useAgiChatStore
        .getState()
        .appendMessageOnce("missing-session", terminalMessage),
    ).toEqual({ inserted: false, message: null });
  });
});
