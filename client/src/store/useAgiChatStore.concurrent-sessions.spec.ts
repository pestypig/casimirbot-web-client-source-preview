// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { useAgiChatStore } from "@/store/useAgiChatStore";
import { useWorkspaceMemoryRegistryStore } from
  "@/store/useWorkspaceMemoryRegistryStore";

describe("Helix Ask concurrent chat session isolation", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAgiChatStore.setState({
      sessions: {},
      activeId: undefined,
      hydrated: true,
    });
    useWorkspaceMemoryRegistryStore.setState({ artifacts: {} });
  });

  it("creates distinct session and context identity for two agent chats", () => {
    const first = useAgiChatStore.getState().newSession(
      "Agent A",
      "helix-ask-chat:agent-a",
    );
    const second = useAgiChatStore.getState().newSession(
      "Agent B",
      "helix-ask-chat:agent-b",
    );

    expect(first).not.toBe(second);
    expect(useAgiChatStore.getState().sessions[first]?.contextId).toBe(
      "helix-ask-chat:agent-a",
    );
    expect(useAgiChatStore.getState().sessions[second]?.contextId).toBe(
      "helix-ask-chat:agent-b",
    );
  });

  it("reuses only the exact context and does not collapse another chat", () => {
    const first = useAgiChatStore.getState().ensureContextSession(
      "helix-ask-chat:agent-a",
      "Agent A",
    );
    const replay = useAgiChatStore.getState().ensureContextSession(
      "helix-ask-chat:agent-a",
      "Agent A replay",
    );
    const second = useAgiChatStore.getState().ensureContextSession(
      "helix-ask-chat:agent-b",
      "Agent B",
    );

    expect(replay).toBe(first);
    expect(second).not.toBe(first);
    expect(Object.keys(useAgiChatStore.getState().sessions)).toHaveLength(2);
  });

  it("keeps messages in their selected chat when turns interleave", () => {
    const first = useAgiChatStore.getState().newSession(
      "Agent A",
      "helix-ask-chat:agent-a",
    );
    const second = useAgiChatStore.getState().newSession(
      "Agent B",
      "helix-ask-chat:agent-b",
    );

    useAgiChatStore.getState().addMessage(first, {
      role: "user",
      content: "Agent A read-only turn",
    });
    useAgiChatStore.getState().addMessage(second, {
      role: "user",
      content: "Agent B read-only turn",
    });
    useAgiChatStore.getState().addMessage(first, {
      role: "assistant",
      content: "Agent A observation",
    });

    expect(
      useAgiChatStore.getState().sessions[first]?.messages.map(
        (message) => message.content,
      ),
    ).toEqual(["Agent A read-only turn", "Agent A observation"]);
    expect(
      useAgiChatStore.getState().sessions[second]?.messages.map(
        (message) => message.content,
      ),
    ).toEqual(["Agent B read-only turn"]);
  });
});

