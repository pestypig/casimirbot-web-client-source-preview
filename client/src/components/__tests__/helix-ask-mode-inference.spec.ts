import { beforeAll, describe, expect, it } from "vitest";

let inferAskMode: typeof import("@/lib/helix/ask-exploration-policy").inferAskMode;

beforeAll(async () => {
  (globalThis as Record<string, unknown>).__HELIX_ASK_JOB_TIMEOUT_MS__ = "1200000";
  ({ inferAskMode } = await import("@/lib/helix/ask-exploration-policy"));
});

describe("inferAskMode", () => {
  it("infers verify prompts", () => {
    expect(inferAskMode("Verify the certificate integrity before shipping.")).toBe("verify");
  });

  it("infers act prompts", () => {
    expect(inferAskMode("Implement the routing patch for voice transcription.")).toBe("act");
  });

  it("infers observe prompts", () => {
    expect(inferAskMode("Monitor the current system status and summarize the current state.")).toBe("observe");
  });

  it("falls back when intent is ambiguous", () => {
    expect(inferAskMode("Tell me about the Helix architecture.")).toBeUndefined();
  });
});
