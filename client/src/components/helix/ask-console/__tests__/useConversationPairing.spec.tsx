// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useConversationPairing } from "../useConversationPairing";
const { binding, savedBinding, pairing, destinations } = vi.hoisted(() => ({
  binding: vi.fn(), savedBinding: vi.fn(), pairing: vi.fn(), destinations: vi.fn(),
}));
vi.mock("@/lib/agent-access/reasoningTaskBinding", () => ({
  inspectCurrentReasoningBinding: binding, readReasoningBinding: savedBinding,
  HELIX_REASONING_BINDING_UPDATED_EVENT: "binding-change",
}));
vi.mock("@/lib/agent-access/durablePairing", () => ({
  inspectPairing: pairing, listPairingDestinations: destinations,
}));
function configure() {
  savedBinding.mockReturnValue(null);
  binding.mockResolvedValue({ status: "active", pairing_id: "pairing:exact",
    reasoning_binding_id: "binding:exact", helix_conversation_id: "chat:exact" });
  pairing.mockResolvedValue({ pairing: { id: "pairing:exact", chatId: "chat:exact",
    destinationDigest: "exact", state: "accepted", pairingExpiresAt: "2099-01-01T00:00:00Z" } });
  destinations.mockResolvedValue({ destinations: [
    { destinationDigest: "other", destination: { taskId: "task:wrong" } },
    { destinationDigest: "exact", destination: { taskId: "task:exact" } },
  ] });
}
afterEach(() => { cleanup(); vi.resetAllMocks(); });
describe("conversation pairing display", () => {
  it("resolves only the exact reviewed destination digest, never the newest task", async () => {
    configure();
    const { result } = renderHook(() => useConversationPairing("chat:exact"));
    await waitFor(() => expect(result.current).toMatchObject({ status: "active", taskId: "task:exact" }));
  });
  it("does not call a revoked pairing active even if a stale binding says active", async () => {
    configure();
    pairing.mockResolvedValue({ pairing: { id: "pairing:exact", chatId: "chat:exact", state: "revoked" } });
    const { result } = renderHook(() => useConversationPairing("chat:exact"));
    await waitFor(() => expect(pairing).toHaveBeenCalled());
    expect(result.current).toMatchObject({ status: "revoked", taskId: null });
    expect(destinations).not.toHaveBeenCalled();
  });
  it("reports an expired owner grant without resolving or exposing its task", async () => {
    configure();
    pairing.mockResolvedValue({ pairing: { id: "pairing:exact", chatId: "chat:exact",
      state: "accepted", pairingExpiresAt: "2020-01-01T00:00:00Z" } });
    const { result } = renderHook(() => useConversationPairing("chat:exact"));
    await waitFor(() => expect(result.current.status).toBe("expired"));
    expect(result.current.taskId).toBeNull();
    expect(destinations).not.toHaveBeenCalled();
  });
  it("uses an authenticated terminal pairing read when a restarted service has no current binding", async () => {
    configure();
    binding.mockRejectedValue(new Error("reasoning_binding_not_found"));
    savedBinding.mockReturnValue({ helix_conversation_id: "chat:exact", pairing_id: "pairing:exact" });
    pairing.mockResolvedValue({ pairing: { id: "pairing:exact", chatId: "chat:exact",
      state: "expired", pairingExpiresAt: "2020-01-01T00:00:00Z" } });
    const { result } = renderHook(() => useConversationPairing("chat:exact"));
    await waitFor(() => expect(result.current.status).toBe("expired"));
    expect(result.current.taskId).toBeNull();
    expect(destinations).not.toHaveBeenCalled();
  });
  it("does not treat a saved binding as active when its authenticated pairing read fails", async () => {
    configure();
    binding.mockRejectedValue(new Error("reasoning_binding_not_found"));
    savedBinding.mockReturnValue({ helix_conversation_id: "chat:exact", pairing_id: "pairing:exact" });
    pairing.mockRejectedValue(new Error("pairing_request_failed"));
    const { result } = renderHook(() => useConversationPairing("chat:exact"));
    await waitFor(() => expect(pairing).toHaveBeenCalled());
    expect(result.current).toEqual({ status: "unavailable", taskId: null });
  });
  it("clears identity immediately on revocation and ignores a late active response", async () => {
    configure();
    const { result } = renderHook(() => useConversationPairing("chat:exact"));
    await waitFor(() => expect(result.current.taskId).toBe("task:exact"));
    let resolveOld: (value: unknown) => void = () => {};
    binding.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    act(() => window.dispatchEvent(new CustomEvent("binding-change", {
      detail: { helix_conversation_id: "chat:exact", status: "active" },
    })));
    binding.mockImplementation(() => new Promise(() => {}));
    act(() => window.dispatchEvent(new CustomEvent("binding-change", {
      detail: { helix_conversation_id: "chat:exact", status: "revoked" },
    })));
    expect(result.current).toEqual({ status: "revoked", taskId: null });
    await act(async () => resolveOld({ status: "active", pairing_id: "pairing:exact",
      reasoning_binding_id: "binding:exact", helix_conversation_id: "chat:exact" }));
    expect(result.current).toEqual({ status: "revoked", taskId: null });
  });
  it("does not guess the task when the matching destination is unavailable", async () => {
    configure(); destinations.mockResolvedValue({ destinations: [] });
    const { result } = renderHook(() => useConversationPairing("chat:exact"));
    await waitFor(() => expect(result.current.status).toBe("active"));
    expect(result.current.taskId).toBeNull();
  });
  it("keeps an authenticated active binding when optional registration labels fail", async () => {
    configure(); destinations.mockRejectedValue(new Error("registration_list_unavailable"));
    const { result } = renderHook(() => useConversationPairing("chat:exact"));
    await waitFor(() => expect(result.current).toMatchObject({ status: "active",
      taskId: null, pairingId: "pairing:exact", bindingId: "binding:exact" }));
  });
  it("never carries an old chat's pairing into a newly selected chat", async () => {
    configure();
    const { result, rerender } = renderHook(({ chatId }) => useConversationPairing(chatId), {
      initialProps: { chatId: "chat:exact" },
    });
    await waitFor(() => expect(result.current.taskId).toBe("task:exact"));
    binding.mockImplementation(() => new Promise(() => {}));
    rerender({ chatId: "chat:other" });
    expect(result.current).toEqual({ status: "unavailable", taskId: null });
  });
});
