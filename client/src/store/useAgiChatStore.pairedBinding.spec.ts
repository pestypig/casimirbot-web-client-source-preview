// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import { AGI_CHAT_STORAGE_KEY, useAgiChatStore } from "./useAgiChatStore";

beforeEach(() => {
  localStorage.clear();
  useAgiChatStore.setState({ sessions: {}, activeId: undefined, reasoningTaskBindings: {}, hydrated: true });
});
const binding = { reasoning_binding_id: "binding:one", pairing_id: "pairing:one",
  helix_conversation_id: "chat:one", status: "active" as const,
  continuation_transport: "unavailable" as const, binding_epoch: 1 };

it("O4/O5 removes only the unavailable pairing from persisted chat projections", () => {
  const store = useAgiChatStore.getState();
  const other = { ...binding, helix_conversation_id: "chat:two" };
  store.rememberReasoningTaskBinding(binding);
  store.rememberReasoningTaskBinding(other);
  store.forgetPairedReasoningTaskBinding("chat:one", "pairing:one");
  expect(useAgiChatStore.getState().reasoningTaskBindings).toEqual({ "chat:two": other });
  expect(JSON.parse(localStorage.getItem(AGI_CHAT_STORAGE_KEY)!).state.reasoningTaskBindings)
    .toEqual({ "chat:two": other });
  store.forgetPairedReasoningTaskBinding("chat:one", "pairing:one");
  expect(useAgiChatStore.getState().reasoningTaskBindings).toEqual({ "chat:two": other });
});

it.each(["pairing:new", undefined])("O4/O5 stale invalidation preserves a different or legacy pairing (%s)", pairingId => {
  const store = useAgiChatStore.getState();
  const replacement = { ...binding, pairing_id: pairingId, reasoning_binding_id: "binding:new", binding_epoch: 2 };
  store.rememberReasoningTaskBinding(replacement);
  store.forgetPairedReasoningTaskBinding("chat:one", "pairing:one");
  expect(useAgiChatStore.getState().reasoningTaskBindings["chat:one"]).toEqual(replacement);
});
