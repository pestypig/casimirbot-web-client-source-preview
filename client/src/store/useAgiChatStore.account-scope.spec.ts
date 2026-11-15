/* @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";
import {
  cacheAccountCapabilityPolicy,
  HELIX_ACCOUNT_PROFILE_CHANGE_STORAGE_KEY,
} from "@/lib/workstation/accountCapabilityPolicy";
import {
  agiChatStorageKeyForProfile,
  useAgiChatStore,
} from "@/store/useAgiChatStore";

afterEach(() => {
  cacheAccountCapabilityPolicy(null, null);
  localStorage.clear();
});

describe("Helix Ask chat account scope", () => {
  it("separates messages and task bindings without attributing the old shared key", () => {
    localStorage.setItem("agi-chat-sessions-v1", JSON.stringify({
      state: { sessions: { legacy: { id: "legacy", title: "Old private chat", messages: [] } } },
      version: 0,
    }));
    cacheAccountCapabilityPolicy(null, "profile:alpha");
    expect(useAgiChatStore.getState().sessions).toEqual({});
    const alphaId = useAgiChatStore.getState().newSession("Alpha chat");
    useAgiChatStore.getState().addMessage(alphaId, { role: "user", content: "Alpha private message" });
    useAgiChatStore.getState().rememberReasoningTaskBinding({
      reasoning_binding_id: "binding-alpha",
      helix_conversation_id: alphaId,
      status: "active", continuation_transport: "polling", binding_epoch: 1,
    });

    window.dispatchEvent(new StorageEvent("storage", {
      key: HELIX_ACCOUNT_PROFILE_CHANGE_STORAGE_KEY,
    }));
    expect(useAgiChatStore.getState()).toMatchObject({
      sessions: {}, reasoningTaskBindings: {}, hydrated: false,
    });

    cacheAccountCapabilityPolicy(null, "profile:beta");
    expect(useAgiChatStore.getState().sessions).toEqual({});
    expect(useAgiChatStore.getState().reasoningTaskBindings).toEqual({});
    const betaId = useAgiChatStore.getState().newSession("Beta chat");
    useAgiChatStore.getState().addMessage(betaId, { role: "user", content: "Beta private message" });

    cacheAccountCapabilityPolicy(null, null);
    expect(useAgiChatStore.getState().sessions).toEqual({});
    cacheAccountCapabilityPolicy(null, "profile:alpha");
    expect(useAgiChatStore.getState().sessions[alphaId]?.messages[0]?.content)
      .toBe("Alpha private message");
    expect(useAgiChatStore.getState().sessions[betaId]).toBeUndefined();
    expect(useAgiChatStore.getState().reasoningTaskBindings[alphaId]?.reasoning_binding_id)
      .toBe("binding-alpha");
    expect(localStorage.getItem("agi-chat-sessions-v1")).toContain("Old private chat");
    expect(localStorage.getItem(agiChatStorageKeyForProfile("profile:alpha")))
      .toContain("Alpha private message");
    expect(localStorage.getItem(agiChatStorageKeyForProfile("profile:beta")))
      .toContain("Beta private message");
  });

});
