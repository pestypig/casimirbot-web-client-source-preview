import { describe, expect, it } from "vitest";
import {
  REASONING_THEATER_FRONTIER_ACTION_LABEL,
  buildReasoningTheaterFloatingActionText,
  reasoningTheaterFloatingActionTextClassName,
} from "../ask-reasoning-frontier-display";

describe("ask reasoning frontier display helpers", () => {
  it("labels frontier actions", () => {
    expect(REASONING_THEATER_FRONTIER_ACTION_LABEL.large_gain).toBe("Large gain");
    expect(REASONING_THEATER_FRONTIER_ACTION_LABEL.hard_drop).toBe("Hard drop");
  });

  it("builds floating action copy from frontier movement", () => {
    expect(
      buildReasoningTheaterFloatingActionText({
        id: "gain",
        frontierAction: "large_gain",
        frontierDeltaPct: 12.4,
        meterPct: 50,
        latestLiveEvent: null,
        seed: 123,
      }),
    ).toMatchObject({ id: "gain", text: "+12 clarity", tone: "gain" });

    expect(
      buildReasoningTheaterFloatingActionText({
        id: "loss",
        frontierAction: "hard_drop",
        frontierDeltaPct: -9.1,
        meterPct: 50,
        latestLiveEvent: null,
        seed: 456,
      }),
    ).toMatchObject({ text: "-9 pressure", tone: "loss" });
  });

  it("falls back to live event labels for steady frontier movement", () => {
    expect(
      buildReasoningTheaterFloatingActionText({
        id: "tool",
        frontierAction: "steady",
        frontierDeltaPct: 0,
        meterPct: 50,
        latestLiveEvent: { label: "Observation" },
        seed: 1,
      }),
    ).toMatchObject({ text: "tool", tone: "tool" });

    expect(
      buildReasoningTheaterFloatingActionText({
        id: "final",
        frontierAction: "steady",
        frontierDeltaPct: 0,
        meterPct: 50,
        latestLiveEvent: { label: "Final" },
        seed: 1,
      }),
    ).toMatchObject({ text: "settle", tone: "gate" });
  });

  it("formats floating text tone classes", () => {
    expect(reasoningTheaterFloatingActionTextClassName("gain")).toContain("emerald");
    expect(reasoningTheaterFloatingActionTextClassName("loss")).toContain("rose");
    expect(reasoningTheaterFloatingActionTextClassName("tool")).toContain("cyan");
    expect(reasoningTheaterFloatingActionTextClassName("gate")).toContain("violet");
    expect(reasoningTheaterFloatingActionTextClassName("steady")).toContain("slate");
  });
});
