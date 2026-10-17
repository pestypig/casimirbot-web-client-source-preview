import { describe, expect, it } from "vitest";
import { resolveInitialMicArmState } from "../HelixAskMicrophoneSessionState";

describe("Helix Ask microphone session state", () => {
  it("starts every loaded session disarmed", () => {
    expect(resolveInitialMicArmState()).toBe("off");
    expect(resolveInitialMicArmState()).toBe("off");
  });
});
