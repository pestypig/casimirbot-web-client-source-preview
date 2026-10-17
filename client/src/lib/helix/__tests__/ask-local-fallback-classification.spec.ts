import { describe, expect, it } from "vitest";

import {
  isLikelyIdeologyDomainLeak,
  isMultilangConfidenceGateResponse,
} from "@/lib/helix/ask-local-fallback-classification";

describe("Ask local fallback classification", () => {
  it("detects multilang confidence gate failures by error, fail class, and fail reason", () => {
    expect(isMultilangConfidenceGateResponse({
      ok: false,
      error: "multilang_dispatch_blocked",
    })).toBe(true);
    expect(isMultilangConfidenceGateResponse({
      ok: false,
      error: "multilang_confirmation_required",
    })).toBe(true);
    expect(isMultilangConfidenceGateResponse({
      ok: false,
      fail_class: "multilang_confidence_gate",
    })).toBe(true);
    expect(isMultilangConfidenceGateResponse({
      ok: false,
      fail_reason: "HELIX_INTERPRETER_LOW_CONFIDENCE",
    })).toBe(true);
    expect(isMultilangConfidenceGateResponse({
      ok: false,
      fail_reason: "HELIX_MULTILANG_CONFIRMATION_REQUIRED",
    })).toBe(true);
  });

  it("rejects successful responses and unrelated failures", () => {
    expect(isMultilangConfidenceGateResponse({
      ok: true,
      error: "multilang_dispatch_blocked",
      fail_class: "multilang_confidence_gate",
      fail_reason: "HELIX_MULTILANG_CONFIRMATION_REQUIRED",
    })).toBe(false);
    expect(isMultilangConfidenceGateResponse({
      ok: false,
      error: "network_timeout",
      fail_class: "transport",
      fail_reason: "FETCH_FAILED",
    })).toBe(false);
    expect(isMultilangConfidenceGateResponse({})).toBe(false);
  });

  it("detects mission-ethos leakage only when the prompt did not ask for that domain", () => {
    expect(
      isLikelyIdeologyDomainLeak({
        promptText: "Explain the calculator result for this scalar expression.",
        outputText: "Mission ethos and stewardship policy guide the warp vessel toward radiance to the sun.",
      }),
    ).toBe(true);
    expect(
      isLikelyIdeologyDomainLeak({
        promptText: "How does mission ethos apply here?",
        outputText: "Mission ethos and stewardship policy guide the answer.",
      }),
    ).toBe(false);
    expect(
      isLikelyIdeologyDomainLeak({
        promptText: "Explain stewardship policy for a workshop.",
        outputText: "The stewardship policy for a workshop should preserve context and tooling.",
      }),
    ).toBe(false);
    expect(
      isLikelyIdeologyDomainLeak({
        promptText: "Explain the calculator result.",
        outputText: "The calculator returned a scalar result.",
      }),
    ).toBe(false);
  });
});
