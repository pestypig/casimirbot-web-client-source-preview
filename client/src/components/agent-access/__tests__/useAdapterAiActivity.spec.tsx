// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAdapterAiActivity } from "../useAdapterAiActivity";

const { fetchPage } = vi.hoisted(() => ({ fetchPage: vi.fn() }));
vi.mock("@/components/helix/ask-console/HelixOperatorActivityApi", () => ({
  fetchAdapterAiActivityPage: fetchPage,
  HelixOperatorActivityHttpError: class extends Error {
    constructor(readonly status: number) { super("http_error"); }
  },
  shouldRetainResponsesActivityAfterReadFailure: () => false,
}));

afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks(); });

describe("Adapter AI activity polling", () => {
  it("shows the active chat even when an older saved chat never answers", async () => {
    fetchPage.mockImplementation(({ helixConversationId }: { helixConversationId: string }) =>
      helixConversationId === "chat:stalled" ? new Promise(() => {}) :
        Promise.resolve({ helix_conversation_id: helixConversationId,
          run_id: "run:current", events: [{ activity_event_id: "event:current" }] }));
    const { result } = renderHook(() => useAdapterAiActivity(
      ["chat:stalled", "chat:current"], true));
    await waitFor(() => expect(result.current.pages["chat:current"]?.events)
      .toEqual([{ activity_event_id: "event:current" }]));
    expect(result.current.pages["chat:stalled"]).toBeUndefined();
    expect(fetchPage).toHaveBeenCalledWith(expect.objectContaining({
      helixConversationId: "chat:current" }));
  });

  it("reports a stalled read after its deadline without retaining an old page", async () => {
    vi.useFakeTimers();
    fetchPage.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useAdapterAiActivity(["chat:stalled"], true));
    await act(async () => { await vi.advanceTimersByTimeAsync(10_001); });
    expect(result.current.failures["chat:stalled"]).toBe("activity_unavailable");
    expect(result.current.pages["chat:stalled"]).toBeUndefined();
  });
});
