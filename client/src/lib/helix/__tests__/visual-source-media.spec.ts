import { afterEach, describe, expect, it, vi } from "vitest";

import {
  attachVisualSourceAudioWithCancellation,
  getHelixVisualSourceCapabilities,
  requestVisualSourceMediaStream,
  stopVisualSourceMediaStream,
  type HelixVisualSourceMediaDevices,
} from "@/lib/helix/visualSourceMedia";

type FakeTrack = {
  kind: "audio" | "video";
  stop: ReturnType<typeof vi.fn>;
  getSettings: () => MediaTrackSettings;
};

const makeTrack = (
  kind: "audio" | "video",
  settings: MediaTrackSettings = {},
): FakeTrack => ({
  kind,
  stop: vi.fn(),
  getSettings: () => settings,
});

const makeStream = (tracks: FakeTrack[]): MediaStream => ({
  getTracks: () => tracks,
  getVideoTracks: () => tracks.filter((track) => track.kind === "video"),
  getAudioTracks: () => tracks.filter((track) => track.kind === "audio"),
} as unknown as MediaStream);

const deferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe("Helix visual source media", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports screen and camera capabilities without prompting", () => {
    const mediaDevices: HelixVisualSourceMediaDevices = {
      getDisplayMedia: vi.fn(),
      getUserMedia: vi.fn(),
    };

    expect(getHelixVisualSourceCapabilities(mediaDevices)).toEqual({
      screen: { supported: true, displayAudioRequestSupported: true },
      camera: { supported: true },
    });
    expect(getHelixVisualSourceCapabilities(null)).toEqual({
      screen: { supported: false, displayAudioRequestSupported: false },
      camera: { supported: false },
    });
  });

  it("requests one display stream and reports its selected browser-tab surface", async () => {
    const videoTrack = makeTrack("video", { displaySurface: "browser" } as MediaTrackSettings);
    const audioTrack = makeTrack("audio");
    const stream = makeStream([videoTrack, audioTrack]);
    const getDisplayMedia = vi.fn().mockResolvedValue(stream);

    const result = await requestVisualSourceMediaStream({
      kind: "screen",
      includeDisplayAudio: true,
      displayAudioConstraints: {
        echoCancellation: false,
        noiseSuppression: false,
      },
      mediaDevices: { getDisplayMedia },
    });

    expect(getDisplayMedia).toHaveBeenCalledWith({
      video: true,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
      },
    });
    expect(result).toMatchObject({
      ok: true,
      kind: "screen",
      stream,
      videoTrack,
      sourceOrigin: "browser_getDisplayMedia",
      surface: "browser_tab",
      displayAudioRequested: true,
      audioTrackAvailable: true,
    });
  });

  it("requests a silent device camera with the selected facing mode and device", async () => {
    const videoTrack = makeTrack("video");
    const stream = makeStream([videoTrack]);
    const getUserMedia = vi.fn().mockResolvedValue(stream);

    const result = await requestVisualSourceMediaStream({
      kind: "camera",
      cameraFacingMode: "environment",
      cameraDeviceId: " camera-2 ",
      mediaDevices: { getUserMedia },
    });

    expect(getUserMedia).toHaveBeenCalledWith({
      video: {
        deviceId: { exact: "camera-2" },
        facingMode: { ideal: "environment" },
      },
      audio: false,
    });
    expect(result).toMatchObject({
      ok: true,
      kind: "camera",
      stream,
      videoTrack,
      sourceOrigin: "browser_getUserMedia",
      surface: "camera",
      displayAudioRequested: false,
      audioTrackAvailable: false,
    });
  });

  it("returns stable unsupported and browser error codes", async () => {
    await expect(requestVisualSourceMediaStream({ kind: "camera", mediaDevices: null })).resolves.toMatchObject({
      ok: false,
      errorCode: "unsupported",
      browserErrorName: null,
    });

    const denied = new DOMException("Denied by user", "NotAllowedError");
    await expect(requestVisualSourceMediaStream({
      kind: "screen",
      mediaDevices: { getDisplayMedia: vi.fn().mockRejectedValue(denied) },
    })).resolves.toMatchObject({
      ok: false,
      errorCode: "permission_denied_or_cancelled",
      browserErrorName: "NotAllowedError",
    });
  });

  it("stops all returned tracks when a source has no video", async () => {
    const audioTrack = makeTrack("audio");
    const stream = makeStream([audioTrack]);

    const result = await requestVisualSourceMediaStream({
      kind: "screen",
      mediaDevices: { getDisplayMedia: vi.fn().mockResolvedValue(stream) },
    });

    expect(result).toMatchObject({ ok: false, errorCode: "missing_video_track" });
    expect(audioTrack.stop).toHaveBeenCalledTimes(1);
  });

  it("continues stopping tracks if one track throws", () => {
    const first = makeTrack("video");
    first.stop.mockImplementation(() => {
      throw new Error("already ended");
    });
    const second = makeTrack("audio");

    expect(stopVisualSourceMediaStream(makeStream([first, second]))).toBe(1);
    expect(first.stop).toHaveBeenCalledTimes(1);
    expect(second.stop).toHaveBeenCalledTimes(1);
  });

  it("compensates a remote audio registration when capture is cancelled while registration settles", async () => {
    const controller = new AbortController();
    const registration = deferred<void>();
    const attach = vi.fn().mockResolvedValue({ source_id: "audio-local" });
    const stopRegistered = vi.fn();

    const result = attachVisualSourceAudioWithCancellation({
      signal: controller.signal,
      register: () => registration.promise,
      attach,
      stopRegistered,
      stopAttached: vi.fn(),
    });
    controller.abort();
    registration.resolve();

    await expect(result).rejects.toThrow("visual_capture_cancelled");
    expect(stopRegistered).toHaveBeenCalledTimes(1);
    expect(attach).not.toHaveBeenCalled();
  });

  it("stops a late audio attachment when capture is cancelled during recorder startup", async () => {
    const controller = new AbortController();
    const attachment = deferred<{ source_id: string }>();
    const stopRegistered = vi.fn();
    const stopAttached = vi.fn();
    const attach = vi.fn(() => attachment.promise);

    const result = attachVisualSourceAudioWithCancellation({
      signal: controller.signal,
      register: vi.fn().mockResolvedValue(undefined),
      attach,
      stopRegistered,
      stopAttached,
    });
    await vi.waitFor(() => expect(attach).toHaveBeenCalledTimes(1));
    controller.abort();
    const lateSource = { source_id: "audio-late" };
    attachment.resolve(lateSource);

    await expect(result).rejects.toThrow("visual_capture_cancelled");
    expect(stopAttached).toHaveBeenCalledWith(lateSource);
    expect(stopRegistered).toHaveBeenCalledTimes(1);
  });

  it("keeps an immediate replacement active when the cancelled registration settles last", async () => {
    const oldController = new AbortController();
    const oldRegistration = deferred<void>();
    const remoteStates = new Map<string, "active" | "stopped">();
    const stoppedIds: string[] = [];
    const oldSourceId = "audio:visual-attempt:old";
    const newSourceId = "audio:visual-attempt:new";

    const oldResult = attachVisualSourceAudioWithCancellation({
      signal: oldController.signal,
      register: async () => {
        await oldRegistration.promise;
        remoteStates.set(oldSourceId, "active");
      },
      attach: vi.fn().mockResolvedValue({ source_id: "local-old" }),
      stopRegistered: () => {
        stoppedIds.push(oldSourceId);
        remoteStates.set(oldSourceId, "stopped");
      },
      stopAttached: vi.fn(),
    });
    oldController.abort();

    await expect(attachVisualSourceAudioWithCancellation({
      signal: new AbortController().signal,
      register: async () => {
        remoteStates.set(newSourceId, "active");
      },
      attach: vi.fn().mockResolvedValue({ source_id: "local-new" }),
      stopRegistered: () => {
        stoppedIds.push(newSourceId);
        remoteStates.set(newSourceId, "stopped");
      },
      stopAttached: vi.fn(),
    })).resolves.toEqual({ source_id: "local-new" });

    oldRegistration.resolve();
    await expect(oldResult).rejects.toThrow("visual_capture_cancelled");
    expect(stoppedIds).toEqual([oldSourceId]);
    expect(remoteStates).toEqual(new Map([
      [newSourceId, "active"],
      [oldSourceId, "stopped"],
    ]));
  });
});
