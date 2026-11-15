// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNavPoseStore } from "./useNavPoseStore";

const begin = (traceId = "test:nav-upload") => {
  const store = useNavPoseStore.getState();
  store.beginEpisode({ traceId, seed: "test-only-seed" });
  store.recordEpisodePhase({ phase: "sense", ts: "2026-11-14T00:00:00.000Z" });
};
const events = () => useNavPoseStore.getState().episodeEvents;
const flush = () => useNavPoseStore.getState().flushEpisode();
const pendingResponse = () => {
  let resolve!: (value: { ok: boolean }) => void;
  const promise = new Promise<{ ok: boolean }>((done) => { resolve = done; });
  return { promise, resolve };
};

beforeEach(() => {
  useNavPoseStore.setState({ episodeTraceId: undefined, episodeSeed: undefined, episodeEvents: [] });
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("navigation trace upload retention", () => {
  it("does not send an empty episode", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await flush();
    useNavPoseStore.getState().beginEpisode({ traceId: "test:empty", seed: "test" });
    await flush();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([400, 401, 500])("retains the exact buffered events after HTTP %s", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status }));
    begin();
    const snapshot = events();
    await flush();
    expect(events()).toBe(snapshot);
  });

  it("retains events when the network fails or fetch is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("test network failure")));
    begin();
    const snapshot = events();
    await flush();
    expect(events()).toBe(snapshot);
    vi.stubGlobal("fetch", undefined);
    await flush();
    expect(events()).toBe(snapshot);
  });

  it("can retry the same snapshot after a rejection and clears only after acceptance", async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetch);
    begin();
    await flush();
    expect(events()).toHaveLength(1);
    await flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1].body).toBe(fetch.mock.calls[0][1].body);
    expect(events()).toEqual([]);
  });

  it("coalesces overlapping flushes for one in-flight upload", async () => {
    const response = pendingResponse();
    const fetch = vi.fn().mockReturnValue(response.promise);
    vi.stubGlobal("fetch", fetch);
    begin();
    const first = flush();
    const second = flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    response.resolve({ ok: true });
    await Promise.all([first, second]);
    expect(events()).toEqual([]);
  });

  it("keeps events recorded while an acknowledged snapshot was in flight", async () => {
    const response = pendingResponse();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(response.promise));
    begin();
    const upload = flush();
    useNavPoseStore.getState().recordEpisodePhase({ phase: "compare", actualDelta: 2 });
    const newerEvent = events()[1];
    response.resolve({ ok: true });
    await upload;
    expect(events()).toEqual([newerEvent]);
  });

  it("lets a new episode flush while a previous episode's upload is still pending", async () => {
    const firstResponse = pendingResponse();
    const secondResponse = pendingResponse();
    const fetch = vi.fn().mockReturnValueOnce(firstResponse.promise).mockReturnValueOnce(secondResponse.promise);
    vi.stubGlobal("fetch", fetch);
    begin("test:first");
    const first = flush();
    begin("test:second");
    const second = flush();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetch.mock.calls[1][1].body).traceId).toBe("test:second");
    firstResponse.resolve({ ok: true });
    await first;
    expect(events()).toHaveLength(1);
    secondResponse.resolve({ ok: true });
    await second;
    expect(events()).toEqual([]);
  });

  it.each([false, true])("does not erase a replacement episode (reused trace ID: %s)", async (reuse) => {
    const response = pendingResponse();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(response.promise));
    begin("test:old");
    const upload = flush();
    begin("test:new");
    if (reuse) begin("test:old");
    const newerEvents = events();
    response.resolve({ ok: true });
    await upload;
    expect(events()).toEqual(newerEvents);
  });
});
