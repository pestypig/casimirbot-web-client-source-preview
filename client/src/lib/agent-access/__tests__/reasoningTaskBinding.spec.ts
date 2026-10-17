// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { HELIX_REASONING_BINDING_STORAGE_KEY, readReasoningBinding, readLatestReasoningBinding,
  HELIX_REASONING_BINDING_UPDATED_EVENT, inspectCurrentReasoningBinding,
  issueReasoningBindingClaim, resolveReasoningSteeringConversationId } from
  "../reasoningTaskBinding";

describe("reasoning steering conversation selection", () => {
  afterEach(() => { vi.unstubAllGlobals(); window.localStorage.clear(); });
  it("retains validated saved bindings while ignoring malformed cache entries", () => {
    const binding = { reasoning_binding_id: "saved-binding", helix_conversation_id: "saved-chat",
      binding_epoch: 4, status: "active", continuation_transport: "polling" };
    window.localStorage.setItem(HELIX_REASONING_BINDING_STORAGE_KEY, JSON.stringify({
      "saved-chat": binding,
      malformed: { ...binding, binding_epoch: "999" },
      absent: null,
      list: [binding],
    }));
    expect(readReasoningBinding("saved-chat")).toEqual(binding);
    expect(readReasoningBinding("malformed")).toBeNull();
    expect(readReasoningBinding("absent")).toBeNull();
    expect(readReasoningBinding("list")).toBeNull();
    expect(readLatestReasoningBinding()).toEqual(binding);
    window.localStorage.setItem(HELIX_REASONING_BINDING_STORAGE_KEY, "invalid JSON");
    expect(readLatestReasoningBinding()).toBeNull();
  });
  it("carries only an explicit run selection in the browser claim request", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      claim_handle: "test-handle", binding: { reasoning_binding_id: "binding-test",
        helix_conversation_id: "chat-test", binding_epoch: 1, status: "pending_claim",
        continuation_transport: "polling" },
    }), { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    const input = { clientSessionRef: "client-test", helixConversationId: "chat-test" };
    await issueReasoningBindingClaim(input);
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string))
      .toEqual({ client_session_ref: "client-test", helix_conversation_id: "chat-test" });
    await issueReasoningBindingClaim({ ...input,
      runAssociation: { run_id: "run-test", verification_ref: "verification-test" } });
    expect(JSON.parse((fetch.mock.calls[1] as unknown as [string, RequestInit])[1].body as string))
      .toEqual({ client_session_ref: "client-test", helix_conversation_id: "chat-test",
        run_id: "run-test", run_verification_ref: "verification-test" });
  });

  it("does not announce an unchanged current binding as a new binding event", async () => {
    const binding = { reasoning_binding_id: "binding-test", helix_conversation_id: "chat-test",
      binding_epoch: 1, status: "active", continuation_transport: "polling" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ binding }), { status: 200 })));
    const listener = vi.fn();
    window.addEventListener(HELIX_REASONING_BINDING_UPDATED_EVENT, listener);
    try {
      await inspectCurrentReasoningBinding("chat-test");
      await inspectCurrentReasoningBinding("chat-test");
      expect(listener).toHaveBeenCalledTimes(1);
      binding.status = "revoked";
      await inspectCurrentReasoningBinding("chat-test");
      expect(listener).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener(HELIX_REASONING_BINDING_UPDATED_EVENT, listener);
    }
  });

  it("uses the operator-selected chat before the shell context fallback", () => {
    expect(resolveReasoningSteeringConversationId(
      "selected-chat",
      "context-chat",
    )).toBe("selected-chat");
  });

  it("uses the shell context only when no chat is selected", () => {
    expect(resolveReasoningSteeringConversationId(null, "context-chat"))
      .toBe("context-chat");
  });
});
