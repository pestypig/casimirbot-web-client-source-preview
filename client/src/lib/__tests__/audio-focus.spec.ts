import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAudioFocusSnapshot,
  interruptAudioFocusByKind,
  releaseAudioFocus,
  requestAudioFocus,
  resetAudioFocusForTests,
} from "@/lib/audio-focus";

describe("audio focus", () => {
  beforeEach(resetAudioFocusForTests);

  it("lets terminal ElevenLabs playback preempt and then resume Realtime audio", () => {
    const muteRealtime = vi.fn();
    const resumeRealtime = vi.fn();
    expect(requestAudioFocus({
      id: "realtime:1",
      kind: "helix_realtime",
      priority: 20,
      stop: muteRealtime,
      resume: resumeRealtime,
    })).toBe(true);
    expect(requestAudioFocus({
      id: "elevenlabs:1",
      kind: "helix_terminal_voice",
      priority: 100,
      stop: vi.fn(),
    })).toBe(true);
    expect(muteRealtime).toHaveBeenCalledTimes(1);
    expect(getAudioFocusSnapshot()).toMatchObject({
      active_id: "elevenlabs:1",
      active_kind: "helix_terminal_voice",
      resumable_id: "realtime:1",
    });
    releaseAudioFocus("elevenlabs:1");
    expect(resumeRealtime).toHaveBeenCalledTimes(1);
    expect(getAudioFocusSnapshot().active_id).toBe("realtime:1");
  });

  it("rejects lower-priority Realtime playback while terminal voice owns focus", () => {
    requestAudioFocus({ id: "terminal", priority: 100, stop: vi.fn() });
    expect(requestAudioFocus({ id: "realtime", priority: 20, stop: vi.fn() })).toBe(false);
    expect(getAudioFocusSnapshot().active_id).toBe("terminal");
  });

  it("resumes deferred Realtime audio after terminal voice releases focus", () => {
    const resumeRealtime = vi.fn();
    requestAudioFocus({ id: "terminal", priority: 100, stop: vi.fn() });

    expect(requestAudioFocus({
      id: "realtime",
      kind: "helix_realtime",
      priority: 20,
      resumeWhenAvailable: true,
      stop: vi.fn(),
      resume: resumeRealtime,
    })).toBe(false);

    releaseAudioFocus("terminal");

    expect(resumeRealtime).toHaveBeenCalledOnce();
    expect(getAudioFocusSnapshot().active_id).toBe("realtime");
  });

  it("removes deferred Realtime audio when its transport closes", () => {
    requestAudioFocus({ id: "terminal", priority: 100, stop: vi.fn() });
    requestAudioFocus({
      id: "realtime",
      kind: "helix_realtime",
      priority: 20,
      resumeWhenAvailable: true,
      stop: vi.fn(),
      resume: vi.fn(),
    });

    releaseAudioFocus("realtime");

    expect(getAudioFocusSnapshot().resumable_id).toBeNull();
  });

  it("interrupts terminal voice and restores the preempted Realtime source", () => {
    const resumeRealtime = vi.fn();
    const stopTerminal = vi.fn();
    requestAudioFocus({
      id: "realtime",
      kind: "helix_realtime",
      priority: 20,
      stop: vi.fn(),
      resume: resumeRealtime,
    });
    requestAudioFocus({
      id: "terminal",
      kind: "helix_terminal_voice",
      priority: 100,
      stop: stopTerminal,
    });

    expect(interruptAudioFocusByKind("helix_terminal_voice")).toBe(true);

    expect(stopTerminal).toHaveBeenCalledWith("interrupted");
    expect(resumeRealtime).toHaveBeenCalledOnce();
    expect(getAudioFocusSnapshot()).toMatchObject({
      active_id: "realtime",
      active_kind: "helix_realtime",
      resumable_id: null,
    });
  });
});
