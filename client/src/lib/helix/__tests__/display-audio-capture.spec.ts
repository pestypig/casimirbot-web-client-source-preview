import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  (globalThis as Record<string, unknown>).__HELIX_ASK_JOB_TIMEOUT_MS__ = "1200000";
});

import { startDisplayAudioSituationSession } from "@/lib/helix/display-audio-capture";
import type { HelixSituationEvent } from "@/lib/helix/situation-room";

type FakeTrack = {
  kind: "audio" | "video";
  stop: ReturnType<typeof vi.fn>;
  getSettings?: () => Record<string, unknown>;
  addEventListener?: ReturnType<typeof vi.fn>;
};

class FakeMediaStream {
  tracks: FakeTrack[];

  constructor(tracks: FakeTrack[] = []) {
    this.tracks = tracks;
  }

  getTracks(): FakeTrack[] {
    return this.tracks;
  }

  getAudioTracks(): FakeTrack[] {
    return this.tracks.filter((track: FakeTrack) => track.kind === "audio");
  }

  getVideoTracks(): FakeTrack[] {
    return this.tracks.filter((track: FakeTrack) => track.kind === "video");
  }
}

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported = vi.fn(() => true);

  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: ((event: { error?: Error }) => void) | null = null;
  mimeType: string;
  timeslice: number | null = null;

  constructor(
    public stream: FakeMediaStream,
    options?: { mimeType?: string },
  ) {
    this.mimeType = options?.mimeType ?? "";
    FakeMediaRecorder.instances.push(this);
  }

  start(timeslice?: number): void {
    this.state = "recording";
    this.timeslice = timeslice ?? null;
  }

  stop(): void {
    this.state = "inactive";
  }

  requestData(): void {
    // Tests emit chunks directly; this mirrors browsers where requestData flushes pending data.
  }

  emit(data: Blob): void {
    this.ondataavailable?.({ data });
  }
}

const installMediaGlobals = (stream: FakeMediaStream): ReturnType<typeof vi.fn> => {
  FakeMediaRecorder.instances = [];
  const getDisplayMedia = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal("MediaStream", FakeMediaStream);
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getDisplayMedia,
    },
  });
  return getDisplayMedia;
};

describe("display audio situation session", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("requests display audio, transcribes recorder chunks, and emits situation events", async () => {
    vi.useFakeTimers();
    const audioTrack: FakeTrack = { kind: "audio", stop: vi.fn(), addEventListener: vi.fn() };
    const videoTrack: FakeTrack = {
      kind: "video",
      stop: vi.fn(),
      addEventListener: vi.fn(),
      getSettings: () => ({ displaySurface: "browser" }),
    };
    const stream = new FakeMediaStream([audioTrack, videoTrack]);
    const getDisplayMedia = installMediaGlobals(stream);
    const transcribe = vi.fn().mockResolvedValue({
      ok: true,
      text: "Rowan needs food.",
      language: "en",
      confidence: 0.91,
      engine: "openai_transcribe",
    });
    const events: unknown[] = [];
    const transcriptChunks: unknown[] = [];

    const session = await startDisplayAudioSituationSession({
      roomId: "room-1",
      sourceId: "audio_transcript:thread-1",
      environmentId: "env-1",
      missionId: "mission-1",
      threadId: "thread-1",
      captureSessionId: "capture-1",
      chunkMs: 5000,
      transcribe,
      onEvent: (event: HelixSituationEvent) => events.push(event),
      onTranscriptChunk: (chunk) => transcriptChunks.push(chunk),
      isDottiePlaybackActive: () => true,
    });

    expect(getDisplayMedia).toHaveBeenCalledWith({
      video: true,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    expect(session.source).toBe("display_tab_audio");
    expect(FakeMediaRecorder.instances[0]?.timeslice).toBe(250);

    FakeMediaRecorder.instances[0]?.emit(new Blob(["audio"], { type: "audio/webm" }));
    await vi.advanceTimersByTimeAsync(5090);

    await vi.waitFor(() => expect(events).toHaveLength(1));
    await vi.waitFor(() => expect(transcriptChunks).toHaveLength(1));
    expect(transcribe).toHaveBeenCalledWith(
      expect.objectContaining({
        room_id: "room-1",
        mission_id: "mission-1",
        thread_id: "thread-1",
        capture_session_id: "capture-1",
        chunk_index: 0,
        capture_source: "display_tab_audio",
        command_lane_enabled: false,
      }),
    );
    expect(events[0]).toMatchObject({
      room_id: "room-1",
      mission_id: "mission-1",
      thread_id: "thread-1",
      source: "display_tab_audio",
      event_type: "voice_transcript",
      text: "Rowan needs food.",
      capture_session_id: "capture-1",
      chunk_index: 0,
      meta: {
        confidence: 0.91,
        language: "en",
        engine: "openai_transcribe",
        possible_tts_echo: true,
      },
    });
    expect(transcriptChunks[0]).toMatchObject({
      sourceId: "audio_transcript:thread-1",
      environmentId: "env-1",
      captureSessionId: "capture-1",
      chunkIndex: 0,
      durationMs: expect.any(Number),
      fromTs: expect.any(String),
      toTs: expect.any(String),
    });

    session.stop();
    expect(audioTrack.stop).toHaveBeenCalledTimes(1);
    expect(videoTrack.stop).toHaveBeenCalledTimes(1);
  });

  it("can record from a provided display stream without stopping shared tracks", async () => {
    vi.useFakeTimers();
    const audioTrack: FakeTrack = { kind: "audio", stop: vi.fn(), addEventListener: vi.fn() };
    const videoTrack: FakeTrack = {
      kind: "video",
      stop: vi.fn(),
      addEventListener: vi.fn(),
      getSettings: () => ({ displaySurface: "browser" }),
    };
    const stream = new FakeMediaStream([audioTrack, videoTrack]);
    const getDisplayMedia = installMediaGlobals(new FakeMediaStream([]));
    const transcribe = vi.fn().mockResolvedValue({
      ok: true,
      text: "Shared stream audio.",
      language: "en",
      confidence: 0.85,
      engine: "openai_transcribe",
    });
    const events: unknown[] = [];

    const session = await startDisplayAudioSituationSession({
      roomId: "room-1",
      captureSessionId: "capture-shared",
      chunkMs: 1000,
      stream: stream as unknown as MediaStream,
      stopStreamOnStop: false,
      transcribe,
      onEvent: (event: HelixSituationEvent) => events.push(event),
    });

    expect(getDisplayMedia).not.toHaveBeenCalled();
    FakeMediaRecorder.instances[0]?.emit(new Blob(["audio"], { type: "audio/webm" }));
    await vi.advanceTimersByTimeAsync(1090);
    await vi.waitFor(() => expect(events).toHaveLength(1));

    session.stop();
    expect(audioTrack.stop).not.toHaveBeenCalled();
    expect(videoTrack.stop).not.toHaveBeenCalled();
  });

  it("fails clearly and stops tracks when the selected source has no audio track", async () => {
    const videoTrack: FakeTrack = {
      kind: "video",
      stop: vi.fn(),
      getSettings: () => ({ displaySurface: "window" }),
    };
    installMediaGlobals(new FakeMediaStream([videoTrack]));

    await expect(
      startDisplayAudioSituationSession({
        roomId: "room-1",
        onEvent: vi.fn(),
      }),
    ).rejects.toThrow("Selected source did not provide an audio track.");
    expect(videoTrack.stop).toHaveBeenCalledTimes(1);
  });
});
