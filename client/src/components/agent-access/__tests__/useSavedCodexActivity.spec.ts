// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HELIX_REASONING_BINDING_UPDATED_EVENT } from
  "@/lib/agent-access/reasoningTaskBinding";
import { readSavedCodexActivity, useSavedCodexActivity } from "../useSavedCodexActivity";

const chatId = "chat:second";
const taskId = "01a0eded-a444-7330-9313-fbbbe61285dd";
const binding = { reasoning_binding_id: "binding:second", helix_conversation_id: chatId,
  status: "active", continuation_transport: "polling", binding_epoch: 2,
  expires_at: "2099-01-01T00:00:00.000Z" };
const frame = { schema: "helix.codex_conversation_cloud_frame.v1", helixConversationId: chatId,
  taskId, turns: [{ id: "turn:visible", user: "Visible request", updates: [],
    assistant: "Visible answer", assistantPhase: "final_answer", status: "completed" }] };

describe("saved Codex activity owner-grant read", () => {
  afterEach(() => { vi.unstubAllGlobals(); delete window.casimirDesktop; localStorage.clear(); });

  it("reads only the authenticated exact-chat binding and native owner-granted frame", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ binding }), { status: 200 })));
    const readCodexMirror = vi.fn(async () => ({ status: "ready", frame }));
    window.casimirDesktop = { readCodexMirror } as unknown as NonNullable<Window["casimirDesktop"]>;
    const result = await readSavedCodexActivity(chatId);
    expect(result).toMatchObject({ status: "ready", value: { chatId,
      bindingId: "binding:second", frame: { taskId } } });
    expect(readCodexMirror).toHaveBeenCalledWith({ bindingId: "binding:second",
      helixConversationId: chatId, visibleLimit: 3 });
  });

  it("drops expired, wrong-chat and denied reads rather than borrowing another task", async () => {
    const readCodexMirror = vi.fn(async () => ({ status: "ready", frame }));
    window.casimirDesktop = { readCodexMirror } as unknown as NonNullable<Window["casimirDesktop"]>;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ binding: {
      ...binding, status: "expired" } }), { status: 200 })));
    expect(await readSavedCodexActivity(chatId)).toEqual({ status: "unavailable" });
    expect(readCodexMirror).not.toHaveBeenCalled();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ binding }), { status: 200 })));
    readCodexMirror.mockResolvedValueOnce({ status: "ready", frame: { ...frame,
      helixConversationId: "chat:wrong" } });
    expect(await readSavedCodexActivity(chatId)).toEqual({ status: "unavailable" });
    readCodexMirror.mockResolvedValueOnce({ status: "unavailable" });
    expect(await readSavedCodexActivity(chatId)).toEqual({ status: "unavailable" });
  });

  it("polls other saved chats only while open and clears a revoked source immediately", async () => {
    let currentStatus: "active" | "revoked" = "active";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ binding: {
      ...binding, status: currentStatus } }), { status: 200 })));
    const readCodexMirror = vi.fn(async () => ({ status: "ready", frame }));
    window.casimirDesktop = { readCodexMirror } as unknown as NonNullable<Window["casimirDesktop"]>;
    const { result, unmount } = renderHook(() => useSavedCodexActivity(
      ["chat:selected", chatId], "chat:selected", true));
    await waitFor(() => expect(result.current[chatId]?.frame.taskId).toBe(taskId));
    expect(readCodexMirror).toHaveBeenCalledTimes(1);
    currentStatus = "revoked";
    window.dispatchEvent(new CustomEvent(HELIX_REASONING_BINDING_UPDATED_EVENT, { detail: {
      ...binding, status: "revoked",
    } }));
    await waitFor(() => expect(result.current[chatId]).toBeUndefined());
    unmount();
  });
});
