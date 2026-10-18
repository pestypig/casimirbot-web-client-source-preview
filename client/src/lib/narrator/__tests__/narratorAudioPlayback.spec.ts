/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VoiceSpeakResponse } from "@/lib/agi/api";
import {
  playNarratorVoiceResponse,
  stopNarratorAudioPlayback,
} from "../narratorAudioPlayback";

const originalAudio = globalThis.Audio;
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

describe("narratorAudioPlayback", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:narrator-audio");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    stopNarratorAudioPlayback();
    globalThis.Audio = originalAudio;
    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
    vi.restoreAllMocks();
  });

  it("rejects JSON voice responses because no audio was heard", async () => {
    await expect(playNarratorVoiceResponse({
      kind: "json",
      status: 200,
      payload: { ok: true, dryRun: true },
      headers: {
        provider: "dry-run",
        profile: null,
        cache: null,
        normalizationBenchmark: null,
        normalizationSkipReason: null,
      },
    })).rejects.toThrow("voice_response_dry_run");
  });

  it("resolves only after the audio element ends", async () => {
    let audioEnded: (() => void) | null = null;
    globalThis.Audio = class {
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onplaying: (() => void) | null = null;
      ontimeupdate: (() => void) | null = null;
      currentTime = 0;
      duration = 1.5;
      muted = false;
      volume = 1;
      paused = false;
      readyState = 4;
      networkState = 1;
      error = null;
      src = "";
      constructor(src: string) {
        this.src = src;
        audioEnded = () => this.onended?.();
      }
      play = vi.fn(() => {
        this.onplaying?.();
        this.currentTime = 1.5;
        this.ontimeupdate?.();
        return Promise.resolve();
      });
      pause = vi.fn();
      load = vi.fn();
      removeAttribute = vi.fn();
    } as unknown as typeof Audio;

    const response: VoiceSpeakResponse = {
      kind: "audio",
      status: 200,
      mimeType: "audio/mpeg",
      blob: new Blob(["audio-bytes"], { type: "audio/mpeg" }),
      headers: {
        provider: "elevenlabs",
        profile: "vU0dJF9WOwsWEUfX1Aqw",
        cache: null,
        normalizationBenchmark: null,
        normalizationSkipReason: null,
      },
    };

    const played = playNarratorVoiceResponse(response);
    let resolved = false;
    void played.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(resolved).toBe(false);
    audioEnded?.();
    await expect(played).resolves.toMatchObject({
      stage: "ended",
      playingObserved: true,
      endedObserved: true,
      timeupdateCount: 1,
      maxCurrentTime: 1.5,
      muted: false,
      volume: 1,
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:narrator-audio");
  });
});
