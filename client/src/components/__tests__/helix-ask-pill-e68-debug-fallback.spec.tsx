import { describe, expect, it } from "vitest";

import { buildDebugExportDrawerFallbackResult } from "@/lib/agi/debugExport";

describe("helix ask pill E68 debug fallback", () => {
  it("turns empty clipboard readback into a drawer fallback result", () => {
    const result = buildDebugExportDrawerFallbackResult({
      attemptedPayloadHash: "hash-123",
      copiedTextLength: 2048,
      readbackMatch: "empty",
      error: "clipboard_empty_after_write",
    });

    expect(result.ok).toBe(true);
    expect(result.method).toBe("debug_drawer");
    expect(result.readback_match).toBe("empty");
    expect(result.fallback_presented).toBe(true);
    expect(result.copied_text_length).toBe(2048);
  });
});
