import { describe, expect, it } from "vitest";
import {
  formatGoalPillCadence,
  labelizeGoalPillValue,
} from "@/lib/helix/ask-goal-pill-display";

describe("Helix Ask goal pill display", () => {
  it("labelizes goal values for compact pill text", () => {
    expect(labelizeGoalPillValue("source_health")).toBe("source health");
    expect(labelizeGoalPillValue("event-accumulation")).toBe("event accumulation");
    expect(labelizeGoalPillValue("  multiple   spaces  ")).toBe("multiple spaces");
    expect(labelizeGoalPillValue("")).toBe("none");
    expect(labelizeGoalPillValue(null)).toBe("none");
  });

  it("formats cadence labels without owning goal runtime behavior", () => {
    expect(formatGoalPillCadence({ kind: "manual" })).toBe("manual");
    expect(formatGoalPillCadence({ kind: "interval", everyMs: 12_400 })).toBe("12s interval");
    expect(formatGoalPillCadence({ kind: "event_accumulation", minUpdates: 3 })).toBe("3 updates");
    expect(formatGoalPillCadence({ kind: "user_turn_only" })).toBe("user turns");
  });
});
