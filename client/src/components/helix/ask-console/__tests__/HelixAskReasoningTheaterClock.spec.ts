import { describe, expect, it } from "vitest";
import {
  REASONING_THEATER_EVENT_EXTRAPOLATION_HOLD_MS,
  REASONING_THEATER_STALLED_WARNING_METER_MAX,
  resolveReasoningTheaterExtrapolatedElapsedMs,
  resolveReasoningTheaterMeterTargetForClock,
} from "../HelixAskReasoningTheaterClock";

describe("HelixAskReasoningTheaterClock", () => {
  it("caps local event timeline extrapolation after the last turn event", () => {
    expect(
      resolveReasoningTheaterExtrapolatedElapsedMs({
        baseElapsedMs: 2000,
        elapsedSinceAnchorMs: REASONING_THEATER_EVENT_EXTRAPOLATION_HOLD_MS + 900,
      }),
    ).toBe(2000 + REASONING_THEATER_EVENT_EXTRAPOLATION_HOLD_MS);
  });

  it("caps the warning meter while the turn stream is quiet", () => {
    expect(
      resolveReasoningTheaterMeterTargetForClock({
        rawTargetPct: 100,
        eventQuietMs: REASONING_THEATER_EVENT_EXTRAPOLATION_HOLD_MS + 1,
      }),
    ).toBe(REASONING_THEATER_STALLED_WARNING_METER_MAX);

    expect(
      resolveReasoningTheaterMeterTargetForClock({
        rawTargetPct: 100,
        eventQuietMs: REASONING_THEATER_EVENT_EXTRAPOLATION_HOLD_MS,
      }),
    ).toBe(100);
  });
});
