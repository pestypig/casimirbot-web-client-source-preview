import { describe, expect, it } from "vitest";

import {
  parseHelixEnvBooleanValue,
  parseHelixEnvEnabledUnlessExactZeroValue,
  parseHelixEnvEnabledUnlessZeroValue,
  parseHelixEnvNumberValue,
  parseHelixEnvOneFlagValue,
  parseHelixEnvPercentValue,
  readHelixEnvBoolean,
  readHelixEnvEnabledUnlessExactZero,
  readHelixEnvEnabledUnlessZero,
  readHelixEnvNumber,
  readHelixEnvOneFlag,
  readHelixEnvPercent,
} from "@/lib/helix/ask-env-config";

describe("Helix Ask env config parsing", () => {
  it("parses enabled and disabled boolean env values", () => {
    for (const value of ["1", "true", "yes", " TRUE "]) {
      expect(parseHelixEnvBooleanValue(value, false)).toBe(true);
    }
    for (const value of ["0", "false", "no", " FALSE "]) {
      expect(parseHelixEnvBooleanValue(value, true)).toBe(false);
    }
  });

  it("keeps the boolean fallback for empty or unrecognized values", () => {
    expect(parseHelixEnvBooleanValue("", true)).toBe(true);
    expect(parseHelixEnvBooleanValue(undefined, false)).toBe(false);
    expect(parseHelixEnvBooleanValue("maybe", true)).toBe(true);
    expect(parseHelixEnvBooleanValue("maybe", false)).toBe(false);
  });

  it("parses finite number values without clamping or rounding", () => {
    expect(parseHelixEnvNumberValue("42", 7)).toBe(42);
    expect(parseHelixEnvNumberValue("0.58", 1)).toBe(0.58);
    expect(parseHelixEnvNumberValue("", 7)).toBe(0);
    expect(parseHelixEnvNumberValue("not-a-number", 7)).toBe(7);
    expect(parseHelixEnvNumberValue(Number.POSITIVE_INFINITY, 7)).toBe(7);
  });

  it("parses percent values using the existing rounded and clamped convention", () => {
    expect(parseHelixEnvPercentValue("12.4", 100)).toBe(12);
    expect(parseHelixEnvPercentValue("12.6", 100)).toBe(13);
    expect(parseHelixEnvPercentValue("-8", 100)).toBe(0);
    expect(parseHelixEnvPercentValue("140", 100)).toBe(100);
  });

  it("parses exact-one flags without treating other truthy words as enabled", () => {
    expect(parseHelixEnvOneFlagValue("1")).toBe(true);
    expect(parseHelixEnvOneFlagValue(" 1 ")).toBe(true);
    expect(parseHelixEnvOneFlagValue("true")).toBe(false);
    expect(parseHelixEnvOneFlagValue("yes")).toBe(false);
    expect(parseHelixEnvOneFlagValue("0", true)).toBe(false);
    expect(parseHelixEnvOneFlagValue("", true)).toBe(true);
  });

  it("parses enabled-unless-zero flags with the existing canary convention", () => {
    expect(parseHelixEnvEnabledUnlessZeroValue("0")).toBe(false);
    expect(parseHelixEnvEnabledUnlessZeroValue(" 0 ")).toBe(false);
    expect(parseHelixEnvEnabledUnlessZeroValue("1")).toBe(true);
    expect(parseHelixEnvEnabledUnlessZeroValue("true")).toBe(true);
    expect(parseHelixEnvEnabledUnlessZeroValue("anything")).toBe(true);
    expect(parseHelixEnvEnabledUnlessZeroValue("", false)).toBe(false);
  });

  it("parses exact-zero feature toggles without trimming", () => {
    expect(parseHelixEnvEnabledUnlessExactZeroValue("0")).toBe(false);
    expect(parseHelixEnvEnabledUnlessExactZeroValue(0)).toBe(false);
    expect(parseHelixEnvEnabledUnlessExactZeroValue(" 0 ")).toBe(true);
    expect(parseHelixEnvEnabledUnlessExactZeroValue("false")).toBe(true);
    expect(parseHelixEnvEnabledUnlessExactZeroValue("", false)).toBe(true);
    expect(parseHelixEnvEnabledUnlessExactZeroValue(undefined, true)).toBe(true);
    expect(parseHelixEnvEnabledUnlessExactZeroValue(null, false)).toBe(true);
  });

  it("normalizes percent fallbacks when the env value is missing or invalid", () => {
    expect(parseHelixEnvPercentValue("", 125)).toBe(100);
    expect(parseHelixEnvPercentValue(undefined, -5)).toBe(0);
    expect(parseHelixEnvPercentValue("not-a-number", 42)).toBe(42);
  });

  it("reads keyed values from a provided env record without touching import.meta", () => {
    const env = {
      ENABLED: "yes",
      NUMBER_VALUE: "12.5",
      ACTIVE_PERCENT: "66.7",
      EXACT_FLAG: "1",
      CANARY_FLAG: "0",
      EXACT_ZERO_DISABLED: "0",
    };
    expect(readHelixEnvBoolean(env, "ENABLED", false)).toBe(true);
    expect(readHelixEnvBoolean(env, "MISSING", true)).toBe(true);
    expect(readHelixEnvNumber(env, "NUMBER_VALUE", 1)).toBe(12.5);
    expect(readHelixEnvNumber(env, "MISSING_NUMBER", 9)).toBe(9);
    expect(readHelixEnvPercent(env, "ACTIVE_PERCENT", 100)).toBe(67);
    expect(readHelixEnvPercent(env, "MISSING", 12)).toBe(12);
    expect(readHelixEnvOneFlag(env, "EXACT_FLAG")).toBe(true);
    expect(readHelixEnvOneFlag(env, "MISSING_FLAG", true)).toBe(true);
    expect(readHelixEnvEnabledUnlessZero(env, "CANARY_FLAG")).toBe(false);
    expect(readHelixEnvEnabledUnlessZero(env, "MISSING_CANARY", true)).toBe(true);
    expect(readHelixEnvEnabledUnlessExactZero(env, "EXACT_ZERO_DISABLED")).toBe(false);
    expect(readHelixEnvEnabledUnlessExactZero(env, "MISSING_EXACT_ZERO", true)).toBe(true);
  });
});
