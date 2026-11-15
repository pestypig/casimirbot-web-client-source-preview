/** @vitest-environment jsdom */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HelixVisualSourceRequestResult } from "@/lib/helix/visualSourceMedia";

const mocks = vi.hoisted(() => ({
  media: vi.fn<() => Promise<HelixVisualSourceRequestResult>>(),
  start: vi.fn(async (_input: unknown) => ({ summary: "Captured test frame", evidence: null })),
  stop: vi.fn(),
  descriptor: vi.fn(async (_input: unknown) => undefined),
  includeAudio: false,
  sources: {},
  attach: vi.fn(async () => ({ source_id: "test-audio", status: "active", label: "Test audio" })),
  stopAudio: vi.fn(),
}));
vi.mock("@/lib/helix/visualSourceMedia", async (original) => ({
  ...await original<typeof import("@/lib/helix/visualSourceMedia")>(),
  requestVisualSourceMediaStream: mocks.media,
}));
vi.mock("@/lib/helix/visualFrameProducer", () => ({
  getActiveVisualFrameStream: () => null,
  startVisualFrameProducerInterval: mocks.start,
  stopVisualFrameProducerInterval: mocks.stop,
  adoptServerVisualProducerPolicies: vi.fn(async () => undefined),
}));
vi.mock("@/lib/helix/liveSourceDescriptorClient", () => ({
  postVisualLiveSourceDescriptor: mocks.descriptor,
  postAudioTranscriptLiveSourceDescriptor: mocks.descriptor,
}));
vi.mock("../HelixAskVisualCapturePreference", () => ({
  readHelixAskVisualCaptureAudioPreference: () => mocks.includeAudio,
  syncHelixAskVisualCaptureRoutePreference: vi.fn(),
}));
vi.mock("@/store/useSituationRoomStore", () => ({
  useSituationRoomStore: Object.assign(() => mocks.sources, { getState: () => ({
    active_room_id: "test-room", rooms: { "test-room": { room_id: "test-room" } },
    setActiveRoom: vi.fn(), attachDisplayAudioSource: mocks.attach, stopSource: mocks.stopAudio,
  }) }),
}));
import { useHelixAskVisualSourceCaptureRuntime } from "../useHelixAskVisualSourceCaptureRuntime";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function source(withAudio = false): Extract<HelixVisualSourceRequestResult, { ok: true }> {
  const track = Object.assign(new EventTarget(), { kind: "video", readyState: "live", stop: vi.fn() });
  const audio = Object.assign(new EventTarget(), { kind: "audio", readyState: "live", stop: vi.fn() });
  const stream = { getVideoTracks: () => [track], getAudioTracks: () => withAudio ? [audio] : [],
    getTracks: () => withAudio ? [track, audio] : [track] } as unknown as MediaStream;
  return { ok: true, kind: "screen", stream, videoTrack: track as unknown as MediaStreamTrack,
    sourceOrigin: "browser_getDisplayMedia", surface: "browser_tab", displayAudioRequested: withAudio, audioTrackAvailable: withAudio };
}
const setup = () => renderHook(() => useHelixAskVisualSourceCaptureRuntime({
  situationRoomId: "test-room", canUseCaptureControls: true,
  appendSyntheticLiveEvent: vi.fn(), onUserError: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks(); mocks.includeAudio = false;
  mocks.media.mockReset(); mocks.start.mockResolvedValue({ summary: "Captured test frame", evidence: null });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ source: { source_id: "test-visual" } }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("visual capture source and stream ownership", () => {
  it("stops the registered source when its video track ends after capture completed", async () => {
    const media = source(); mocks.media.mockResolvedValue(media);
    const hook = setup(); act(() => hook.result.current.handleVisualSituationSourceCapture());
    await waitFor(() => expect(hook.result.current.visualSituationSourceStatus).toBe("active"));
    expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({ sourceId: "test-visual", stream: media.stream }));
    act(() => media.videoTrack.dispatchEvent(new Event("ended")));
    expect(hook.result.current.visualSituationSourceStatus).toBe("idle");
    expect(hook.result.current.visualSituationSourceId).toBeNull();
    expect(media.videoTrack.stop).toHaveBeenCalled(); expect(mocks.stop).toHaveBeenCalledWith("test-visual");
  });
  it("stops a late media stream after the user cancels the picker", async () => {
    const pending = deferred<HelixVisualSourceRequestResult>(); mocks.media.mockReturnValue(pending.promise);
    const hook = setup(); act(() => hook.result.current.handleVisualSituationSourceCapture());
    await waitFor(() => expect(hook.result.current.visualSituationSourceId).toBe("test-visual"));
    act(() => hook.result.current.handleVisualSituationSourceCapture());
    const media = source(); await act(async () => { pending.resolve(media); });
    expect(media.videoTrack.stop).toHaveBeenCalled(); expect(mocks.start).not.toHaveBeenCalled();
    expect(hook.result.current.visualSituationSourceStatus).toBe("idle");
  });
  it("stops late registration and media after unmount", async () => {
    const registration = deferred<{ source: { source_id: string } }>();
    vi.stubGlobal("fetch", vi.fn(async (path: string) => ({ ok: true, json: async () =>
      path.endsWith("visual-source/start") ? registration.promise : {} })));
    const media = source(); mocks.media.mockResolvedValue(media);
    const hook = setup(); act(() => hook.result.current.handleVisualSituationSourceCapture()); hook.unmount();
    await act(async () => { registration.resolve({ source: { source_id: "test-visual" } }); });
    expect(media.videoTrack.stop).toHaveBeenCalled(); expect(mocks.stop).toHaveBeenCalledWith("test-visual");
    expect(mocks.start).not.toHaveBeenCalled();
  });
  it("keeps the active stream for tab audio and stops both sources on detach", async () => {
    mocks.includeAudio = true; const media = source(true); mocks.media.mockResolvedValue(media);
    const hook = setup(); act(() => hook.result.current.handleVisualSituationSourceCapture());
    await waitFor(() => expect(hook.result.current.visualSituationSourceStatus).toBe("active"));
    expect(hook.result.current.displayAudioStatus).toBe("active");
    expect(mocks.attach).toHaveBeenCalledWith("test-room", "Helix Ask shared tab audio",
      expect.objectContaining({ stream: media.stream, stopStreamOnStop: false }));
    act(() => hook.result.current.handleVisualSituationSourceCapture());
    expect(mocks.stopAudio).toHaveBeenCalledWith("test-audio");
    for (const track of media.stream.getTracks()) expect(track.stop).toHaveBeenCalled();
  });
  it("reports denied media and stops its pending registered source", async () => {
    mocks.media.mockResolvedValue({ ok: false, kind: "screen", errorCode: "permission_denied_or_cancelled",
      message: "Picker denied", browserErrorName: "NotAllowedError" });
    const hook = setup(); act(() => hook.result.current.handleVisualSituationSourceCapture());
    await waitFor(() => expect(hook.result.current.visualSituationSourceStatus).toBe("error"));
    expect(hook.result.current.visualSituationSourceError).toContain("Picker denied");
    expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.stop).toHaveBeenCalledWith("test-visual");
  });
});
