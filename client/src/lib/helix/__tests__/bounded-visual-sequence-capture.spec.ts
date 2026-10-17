// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoundedCaptureError, startBoundedVisualSequenceCapture } from "../boundedVisualSequenceCapture";

vi.mock("html-to-image", () => ({ toCanvas: vi.fn(async () => document.createElement("canvas")) }));

class FakeTrack extends EventTarget {
  id = "track-1";
  kind = "video";
  label = "selected window";
  stopped = false;
  constructor(private readonly displaySurface: string) { super(); }
  getSettings() { return { displaySurface: this.displaySurface }; }
  stop() { this.stopped = true; }
  end() { this.dispatchEvent(new Event("ended")); }
}

class FakeStream {
  constructor(private readonly video: FakeTrack[], private readonly audio: FakeTrack[] = []) {}
  getTracks() { return [...this.video, ...this.audio] as unknown as MediaStreamTrack[]; }
  getVideoTracks() { return this.video as unknown as MediaStreamTrack[]; }
  getAudioTracks() { return this.audio as unknown as MediaStreamTrack[]; }
}

class FakeRecorder {
  static isTypeSupported() { return true; }
  state: RecordingState = "inactive";
  mimeType = "video/webm";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(_stream: MediaStream, _options?: MediaRecorderOptions) {}
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["pixels"], { type: "video/webm" }) } as BlobEvent);
    this.onstop?.();
  }
}

const identity = {
  sourceId: "pending",
  producerEpoch: "pending",
  profileId: "profile:developer",
  runId: "capture:test",
  threadId: "motorcycle-hud-lab",
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-04T15:00:00.000Z"));
  vi.stubGlobal("MediaStream", FakeStream);
  vi.stubGlobal("crypto", { randomUUID: () => "11111111-1111-4111-8111-111111111111" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("VSE-0B bounded selected-surface capture", () => {
  it("requires affirmative consent before opening a picker", async () => {
    await expect(startBoundedVisualSequenceCapture({
      consent: false as true,
      contentCleared: true,
      surface: "program_window",
      MediaRecorderCtor: FakeRecorder as unknown as typeof MediaRecorder,
    })).rejects.toMatchObject({ code: "consent_required" } satisfies Partial<BoundedCaptureError>);
    await expect(startBoundedVisualSequenceCapture({
      consent: true,
      contentCleared: false as true,
      surface: "program_window",
      MediaRecorderCtor: FakeRecorder as unknown as typeof MediaRecorder,
    })).rejects.toMatchObject({ code: "content_clearance_required" });
  });

  it("rejects ambient whole-screen selection and stops its track", async () => {
    const track = new FakeTrack("monitor");
    const getDisplayMedia = vi.fn(async () => new FakeStream([track]) as unknown as MediaStream);
    await expect(startBoundedVisualSequenceCapture({
      consent: true,
      contentCleared: true,
      surface: "program_window",
      identity,
      mediaDevices: { getDisplayMedia },
      MediaRecorderCtor: FakeRecorder as unknown as typeof MediaRecorder,
    })).rejects.toMatchObject({ code: "whole_screen_forbidden" });
    expect(track.stopped).toBe(true);
  });

  it("records exactly the selected window without audio and emits live provenance on manual stop", async () => {
    const track = new FakeTrack("window");
    const audio = new FakeTrack("audio");
    audio.kind = "audio";
    const active = await startBoundedVisualSequenceCapture({
      consent: true,
      contentCleared: true,
      surface: "minecraft_client_window",
      identity,
      mediaDevices: { getDisplayMedia: async () => new FakeStream([track], [audio]) as unknown as MediaStream },
      MediaRecorderCtor: FakeRecorder as unknown as typeof MediaRecorder,
    });
    vi.advanceTimersByTime(2_000);
    active.stop();
    const result = await active.completion;
    expect(result.metadata).toMatchObject({
      source_surface: "minecraft_client_window",
      source_id: "display-track:track-1",
      producer_epoch: "track:track-1",
      recorded_duration_ms: 2_000,
      stop_reason: "manual_stop",
      audio_captured: false,
      protected_content: false,
      sensitive_content: false,
    });
    expect(audio.stopped).toBe(true);
    expect(track.stopped).toBe(true);
    expect(result.blob.size).toBeGreaterThan(0);
  });

  it("discards the recording when consent is revoked or the selected source ends", async () => {
    for (const endKind of ["revoke", "track"] as const) {
      const track = new FakeTrack("window");
      const active = await startBoundedVisualSequenceCapture({
        consent: true,
        contentCleared: true,
        surface: "program_window",
        identity,
        mediaDevices: { getDisplayMedia: async () => new FakeStream([track]) as unknown as MediaStream },
        MediaRecorderCtor: FakeRecorder as unknown as typeof MediaRecorder,
      });
      if (endKind === "revoke") active.revoke(); else track.end();
      await expect(active.completion).rejects.toMatchObject({ code: "source_lost" });
    }
  });

  it("fails closed when a bound HUD producer epoch changes", async () => {
    const track = new FakeTrack("canvas");
    const canvas = document.createElement("canvas");
    Object.defineProperty(canvas, "captureStream", { value: () => new FakeStream([track]) });
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => tag === "canvas" ? canvas : originalCreate(tag)) as typeof document.createElement);
    const context = { clearRect: vi.fn(), drawImage: vi.fn() };
    vi.spyOn(canvas, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
    let current = { ...identity, sourceId: "hud", producerEpoch: "epoch-1" };
    const element = document.createElement("div");
    const active = await startBoundedVisualSequenceCapture({
      consent: true,
      contentCleared: true,
      surface: "hud_composed_feed",
      identity: current,
      getIdentity: () => current,
      hudElement: element,
      MediaRecorderCtor: FakeRecorder as unknown as typeof MediaRecorder,
    });
    current = { ...current, producerEpoch: "epoch-2" };
    vi.advanceTimersByTime(200);
    await expect(active.completion).rejects.toMatchObject({ code: "source_identity_changed" });
  });
});
