import { describe, expect, it } from "vitest";
import { discordIsolatedSpeechTicketScope, discordVoiceBridgeCloseMessage } from "../DiscordVoiceGptLiveBridge";

describe("Discord GPT Live bridge close diagnostics", () => {
  it("shows a safe worker admission reason", () => {
    expect(discordVoiceBridgeCloseMessage({ code: 1008, reason: "roster_incomplete" }))
      .toBe("Discord bridge denied: roster_incomplete.");
  });

  it("does not display arbitrary WebSocket close text", () => {
    expect(discordVoiceBridgeCloseMessage({ code: 1008, reason: "private ticket text" }))
      .toBe("Discord bridge disconnected.");
    expect(discordVoiceBridgeCloseMessage({ code: 1000, reason: "roster_incomplete" }))
      .toBe("Discord bridge disconnected.");
  });
});

describe("Discord isolated speech ticket compatibility", () => {
  it("keeps an older audio-only ticket usable without opening isolated transcription", () => {
    expect(discordIsolatedSpeechTicketScope({}, "realtime:owner")).toBeNull();
  });

  it("requires both fields to match this exact Realtime session", () => {
    expect(discordIsolatedSpeechTicketScope({
      realtime_session_id: "realtime:owner", provider_call_ref: "call:owner",
    }, "realtime:owner")).toEqual({
      realtimeSessionId: "realtime:owner", providerCallRef: "call:owner",
    });
    expect(() => discordIsolatedSpeechTicketScope({
      realtime_session_id: "realtime:other", provider_call_ref: "call:owner",
    }, "realtime:owner")).toThrow("discord_isolated_speech_bridge_scope_unavailable");
    expect(() => discordIsolatedSpeechTicketScope({
      realtime_session_id: "realtime:owner",
    }, "realtime:owner")).toThrow("discord_isolated_speech_bridge_scope_unavailable");
  });
});
