import { describe, expect, it } from "vitest";

import { isAgibotPreflightScopeError } from "@/lib/helix/ask-agibot-preflight-error";

describe("agibot preflight error classification", () => {
  it("matches known desktop joint scope preflight failures", () => {
    expect(isAgibotPreflightScopeError(new Error("DESKTOP_JOINT_SCOPE_REQUIRED"))).toBe(true);
    expect(isAgibotPreflightScopeError("desktop joint scope is required before running")).toBe(true);
    expect(isAgibotPreflightScopeError({
      message: "Mission interface blocked by bring-up preflight gate.",
    })).toBe(true);
    expect(isAgibotPreflightScopeError("preflight_gate rejected workstation access")).toBe(true);
  });

  it("rejects empty, non-message, and unrelated errors", () => {
    expect(isAgibotPreflightScopeError(null)).toBe(false);
    expect(isAgibotPreflightScopeError({})).toBe(false);
    expect(isAgibotPreflightScopeError(new Error("network timeout"))).toBe(false);
    expect(isAgibotPreflightScopeError("preflight completed successfully")).toBe(false);
  });
});
