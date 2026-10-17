import { describe, expect, it } from "vitest";

import {
  isActivePlayback,
  isLikelyIOSDesktopModeUserAgent,
  isLikelyMobileAudioUserAgent,
  resolveVoicePlaybackAttemptPath,
  resolveVoicePlaybackGain,
  shouldBypassVoicePlaybackGraph,
  shouldUseVoicePlaybackAudioGraph,
} from "../ask-voice-playback-runtime";

describe("voice playback runtime helpers", () => {
  it("classifies desktop, mobile, and iOS playback gain", () => {
    expect(resolveVoicePlaybackGain("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(1.15);
    expect(resolveVoicePlaybackGain("Mozilla/5.0 (Linux; Android 14; Pixel) Mobile")).toBe(3.6);
    expect(resolveVoicePlaybackGain("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe(5.0);
  });

  it("detects iOS desktop-mode user agents using navigator touch points", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { maxTouchPoints: 5 },
    });
    try {
      const iosDesktopUa = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15";
      expect(isLikelyIOSDesktopModeUserAgent(iosDesktopUa)).toBe(true);
      expect(isLikelyMobileAudioUserAgent(iosDesktopUa)).toBe(true);
      expect(resolveVoicePlaybackGain(iosDesktopUa)).toBe(5.0);
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, "navigator", descriptor);
      } else {
        Reflect.deleteProperty(globalThis, "navigator");
      }
    }
  });

  it("keeps mobile audio graph enabled unless the env opt-out is set", () => {
    expect(shouldUseVoicePlaybackAudioGraph("Mozilla/5.0 (Linux; Android 14; Pixel) Mobile")).toBe(true);
    expect(shouldUseVoicePlaybackAudioGraph("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe(true);
  });

  it("resolves playback attempt and bypass state deterministically", () => {
    expect(resolveVoicePlaybackAttemptPath({ graphAttached: true, directFallbackAttempted: false })).toBe("audio_graph");
    expect(resolveVoicePlaybackAttemptPath({ graphAttached: false, directFallbackAttempted: true })).toBe("direct_fallback");
    expect(resolveVoicePlaybackAttemptPath({ graphAttached: false, directFallbackAttempted: false })).toBe("direct_element");
    expect(shouldBypassVoicePlaybackGraph({ bypassUntilMs: null, nowMs: 100 })).toBe(false);
    expect(shouldBypassVoicePlaybackGraph({ bypassUntilMs: 200, nowMs: 100 })).toBe(true);
    expect(shouldBypassVoicePlaybackGraph({ bypassUntilMs: 200, nowMs: 250 })).toBe(false);
  });

  it("checks active playback by element identity only", () => {
    const active = {} as HTMLAudioElement;
    const stale = {} as HTMLAudioElement;
    expect(isActivePlayback(active, active)).toBe(true);
    expect(isActivePlayback(stale, active)).toBe(false);
    expect(isActivePlayback(null, active)).toBe(false);
  });
});
