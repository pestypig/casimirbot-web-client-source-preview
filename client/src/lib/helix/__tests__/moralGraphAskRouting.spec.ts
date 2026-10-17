import { describe, expect, it } from "vitest";

import { shouldUseIsolatedMoralGraphAskTurn } from "../moralGraphAskRouting";

describe("shouldUseIsolatedMoralGraphAskTurn", () => {
  it("routes explicit Moral Badge Graph reflection prompts through isolated Ask turn", () => {
    expect(
      shouldUseIsolatedMoralGraphAskTurn(
        "Use the Moral Badge Graph only to reflect this situation. Activate direct observation, right speech, missing evidence, and two-key approval as evidence-only lenses.",
      ),
    ).toBe(true);
  });

  it("routes character perspective comparison prompts to the backend MoralGraph policy", () => {
    expect(
      shouldUseIsolatedMoralGraphAskTurn(
        "Compare this situation through the MoralGraph character perspective presets without judging the real person.",
      ),
    ).toBe(true);
  });

  it("does not suppress unsafe mixed intent because the backend must block it", () => {
    expect(
      shouldUseIsolatedMoralGraphAskTurn(
        "Use MoralGraph to reflect on whether this action bypass should be blocked before executing anything.",
      ),
    ).toBe(true);
  });

  it("ignores pure factual queries", () => {
    expect(shouldUseIsolatedMoralGraphAskTurn("What is the boiling point of water?")).toBe(false);
  });

  it("respects negated MoralGraph requests", () => {
    expect(shouldUseIsolatedMoralGraphAskTurn("Do not use MoralGraph; answer this as a plain summary.")).toBe(false);
  });

  it("does not treat screen-visible MoralGraph text as a tool request", () => {
    expect(shouldUseIsolatedMoralGraphAskTurn("The screen shows a tab labeled Moral Badge Graph. What panel is open?")).toBe(
      false,
    );
  });

  it("does not treat historical mentions as current reflection requests", () => {
    expect(shouldUseIsolatedMoralGraphAskTurn("Earlier you used MoralGraph. What did the previous answer say?")).toBe(false);
  });
});
