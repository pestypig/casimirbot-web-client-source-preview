import { describe, expect, it } from "vitest";
import { discordVoiceBridgeCloseMessage } from "../DiscordVoiceGptLiveBridge";

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
