/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

let copyNarratorEventText: typeof import("../NarratorPanel").copyNarratorEventText;

beforeAll(async () => {
  (globalThis as Record<string, unknown>).__HELIX_ASK_JOB_TIMEOUT_MS__ = "1200000";
  ({ copyNarratorEventText } = await import("../NarratorPanel"));
});

describe("copyNarratorEventText", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to textarea copy when clipboard write permission is denied", async () => {
    const writeText = vi.fn(async () => {
      throw new DOMException("Write permission denied.", "NotAllowedError");
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => true),
    });

    await expect(copyNarratorEventText("Narrator event text")).resolves.toEqual({
      ok: true,
      method: "textarea_fallback",
    });
    expect(writeText).toHaveBeenCalledWith("Narrator event text");
    expect(document.execCommand).toHaveBeenCalledWith("copy");
  });

  it("returns a failed result instead of throwing when all copy methods fail", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn(async () => {
          throw new DOMException("Write permission denied.", "NotAllowedError");
        }),
      },
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => false),
    });

    const result = await copyNarratorEventText("Narrator event text");

    expect(result.ok).toBe(false);
    expect(result.method).toBe("failed");
    expect(result.error).toContain("Write permission denied");
  });
});
