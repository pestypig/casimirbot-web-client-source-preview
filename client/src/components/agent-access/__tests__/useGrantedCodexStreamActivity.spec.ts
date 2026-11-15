// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useGrantedCodexStreamActivity, type LocalCodexStreamGrant } from "../useGrantedCodexStreamActivity";

const taskId = "01a0eded-a444-7330-9313-fbbbe61285dd";
const otherTaskId = "01a0798b-b5bd-7bf2-946a-9a77e086316a";
const sourceRef = `codex-thread:${taskId}`;
const grant: LocalCodexStreamGrant = { sourceRef, threadId: taskId, title: "Selected chat",
  helixConversationId: "chat:source", grantedAt: "2026-11-13T12:00:00.000Z" };
const ready = (text = "Current visible update", id = taskId, source = sourceRef) => ({
  status: "ready", frame: { schema: "helix.codex_conversation_cloud_frame.v1",
    taskId: id, helixConversationId: source, turns: [{ id: "turn:visible", user: "Read only",
      assistant: text, assistantPhase: "final_answer", status: "completed" }] },
});
const deferred = () => {
  let resolve!: (value: ReturnType<typeof ready>) => void;
  const promise = new Promise<ReturnType<typeof ready>>(done => { resolve = done; });
  return { promise, resolve };
};
function install(read: ReturnType<typeof vi.fn>) {
  window.casimirDesktop = { codexStreamGrants: read } as unknown as NonNullable<Window["casimirDesktop"]>;
}
afterEach(() => { cleanup(); delete window.casimirDesktop; vi.useRealTimers(); });

describe("exact granted stream activity", () => {
  it("reads only enabled exact sources and does not grant or publish", async () => {
    const read = vi.fn(async () => ready()); install(read);
    const { result, rerender } = renderHook(({ enabled }) => useGrantedCodexStreamActivity([grant], enabled),
      { initialProps: { enabled: false } });
    expect(read).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current[sourceRef]?.frame.taskId).toBe(taskId));
    expect(read.mock.calls).toEqual([[{ operation: "read", sourceRef }]]);
  });

  it.each([
    ["wrong task", ready("Wrong task update", otherTaskId)],
    ["wrong source", ready("Wrong source update", taskId, `codex-thread:${otherTaskId}`)],
    ["unavailable", { status: "unavailable", frame: ready().frame }],
  ])("omits a %s receipt", async (_reason, response) => {
    const read = vi.fn(async () => response); install(read);
    const { result } = renderHook(() => useGrantedCodexStreamActivity([grant], true));
    await act(async () => { await Promise.resolve(); });
    expect(read).toHaveBeenCalledOnce();
    expect(result.current).toEqual({});
  });

  it("retires the displayed frame immediately when the same exact grant is renewed", async () => {
    const next = deferred();
    const read = vi.fn().mockResolvedValueOnce(ready("Old grant update")).mockReturnValue(next.promise);
    install(read);
    const { result, rerender } = renderHook(({ current }) => useGrantedCodexStreamActivity([current], true),
      { initialProps: { current: grant } });
    await waitFor(() => expect(result.current[sourceRef]).toBeDefined());
    rerender({ current: { ...grant, grantedAt: "2026-11-13T13:00:00.000Z" } });
    expect(result.current).toEqual({});
    expect(read).toHaveBeenCalledTimes(2);
    await act(async () => { next.resolve(ready("Renewed grant update")); });
    expect(result.current[sourceRef]?.frame.turns[0].assistant).toBe("Renewed grant update");
  });

  it("discards a pending read after replacement of the grant for the same source", async () => {
    const old = deferred(), next = deferred();
    const read = vi.fn().mockReturnValueOnce(old.promise).mockReturnValue(next.promise); install(read);
    const { result, rerender } = renderHook(({ current }) => useGrantedCodexStreamActivity([current], true),
      { initialProps: { current: grant } });
    rerender({ current: { ...grant, grantedAt: "2026-11-13T13:00:00.000Z" } });
    await act(async () => { old.resolve(ready("Retired update")); });
    expect(result.current).toEqual({});
    await act(async () => { next.resolve(ready("Current update")); });
    expect(result.current[sourceRef]?.frame.turns[0].assistant).toBe("Current update");
  });

  it("rechecks a changed Helix association before projecting the source again", async () => {
    const next = deferred();
    const read = vi.fn().mockResolvedValueOnce(ready()).mockReturnValue(next.promise); install(read);
    const { result, rerender } = renderHook(({ current }) => useGrantedCodexStreamActivity([current], true),
      { initialProps: { current: grant } });
    await waitFor(() => expect(result.current[sourceRef]).toBeDefined());
    rerender({ current: { ...grant, helixConversationId: "chat:replacement" } });
    expect(result.current).toEqual({});
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("discards a late read after streaming is disabled", async () => {
    const pending = deferred(); const read = vi.fn(() => pending.promise); install(read);
    const { result, rerender } = renderHook(({ enabled }) => useGrantedCodexStreamActivity([grant], enabled),
      { initialProps: { enabled: true } });
    rerender({ enabled: false });
    await act(async () => { pending.resolve(ready()); });
    expect(result.current).toEqual({});
    expect(read).toHaveBeenCalledOnce();
  });

  it("removes a previously visible source when the next native read is denied", async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValueOnce(ready()).mockResolvedValue({ status: "unavailable" }); install(read);
    const { result } = renderHook(() => useGrantedCodexStreamActivity([grant], true));
    await act(async () => { await Promise.resolve(); });
    expect(result.current[sourceRef]).toBeDefined();
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current).toEqual({});
  });
});
