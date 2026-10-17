import { describe, expect, it } from "vitest";

import {
  asObjectRecord,
  asNonEmptyString,
  asStringArray,
  clamp01,
  clampNumber,
  clipText,
  coerceText,
  dedupeStrings,
  readNumber,
} from "@/lib/helix/ask-value-normalization";

describe("ask value normalization", () => {
  it("reads finite numbers and keeps the provided fallback for non-finite values", () => {
    expect(readNumber("42", 7)).toBe(42);
    expect(readNumber(0.5, 7)).toBe(0.5);
    expect(readNumber("not-a-number", 7)).toBe(7);
    expect(readNumber(Number.POSITIVE_INFINITY, 7)).toBe(7);
  });

  it("clamps numbers to the inclusive range", () => {
    expect(clampNumber(-1, 0, 10)).toBe(0);
    expect(clampNumber(4, 0, 10)).toBe(4);
    expect(clampNumber(12, 0, 10)).toBe(10);
  });

  it("clamps ratios to the inclusive unit interval", () => {
    expect(clamp01(-0.2)).toBe(0);
    expect(clamp01(0.42)).toBe(0.42);
    expect(clamp01(1.5)).toBe(1);
  });

  it("clips text with the existing ellipsis convention", () => {
    expect(clipText(undefined, 4)).toBe("");
    expect(clipText("", 4)).toBe("");
    expect(clipText("abcd", 4)).toBe("abcd");
    expect(clipText("abcdef", 4)).toBe("abcd...");
  });

  it("coerces unknown values to text without throwing", () => {
    expect(coerceText(null)).toBe("");
    expect(coerceText(undefined)).toBe("");
    expect(coerceText("ready")).toBe("ready");
    expect(coerceText(72)).toBe("72");
    expect(
      coerceText({
        toString() {
          throw new Error("no string");
        },
      }),
    ).toBe("");
  });

  it("accepts plain object records and rejects arrays or nullish values", () => {
    const record = { status: "ok" };
    expect(asObjectRecord(record)).toBe(record);
    expect(asObjectRecord(["status"])).toBeNull();
    expect(asObjectRecord(null)).toBeNull();
    expect(asObjectRecord("status")).toBeNull();
  });

  it("normalizes non-empty strings by trimming and rejecting non-strings", () => {
    expect(asNonEmptyString(" topic ")).toBe("topic");
    expect(asNonEmptyString("   ")).toBeNull();
    expect(asNonEmptyString(42)).toBeNull();
  });

  it("normalizes string arrays by trimming and removing empty or non-string entries", () => {
    expect(asStringArray([" alpha ", "", 7, "beta", null, " beta "])).toEqual(["alpha", "beta", "beta"]);
    expect(asStringArray("alpha")).toEqual([]);
  });

  it("dedupes strings case-insensitively while preserving first spelling", () => {
    expect(dedupeStrings(["Alpha", "beta", "alpha", "BETA", "Gamma"])).toEqual(["Alpha", "beta", "Gamma"]);
  });
});
