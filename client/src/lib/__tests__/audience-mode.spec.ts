import { describe, expect, it } from "vitest";
import { formatDerivationLabel, resolveMetricClaimLabel, sanitizeAudienceText } from "../audience-mode";

describe("audience mode", () => {
  it("suppresses speculative/internal terms in public mode", () => {
    const text = "This is speculative and internal with proxy-derived context.";
    expect(sanitizeAudienceText(text, "public")).not.toMatch(/speculative|internal|proxy-derived/i);
  });

  it("keeps full terminology in academic mode", () => {
    const text = "speculative internal proxy-derived";
    expect(sanitizeAudienceText(text, "academic")).toBe(text);
  });

  it("prevents proxy labels from reading as geometry-derived in public mode", () => {
    expect(formatDerivationLabel({ mode: "public", metricDerived: false, sourceLabel: "pipeline" })).toBe(
      "operational estimate",
    );
    expect(formatDerivationLabel({ mode: "public", metricDerived: true, sourceLabel: "warp.metric.T00" })).toBe(
      "geometry-derived",
    );
  });

  it("fails closed for strict metric claims with missing contract", () => {
    expect(
      resolveMetricClaimLabel({
        mode: "public",
        strictMode: true,
        metricDerived: true,
        metricContractOk: false,
        sourceLabel: "warp.metric.T00",
      }),
    ).toBe("metric claim unavailable");
    expect(
      resolveMetricClaimLabel({
        mode: "academic",
        strictMode: true,
        metricDerived: true,
        metricContractOk: false,
        sourceLabel: "warp.metric.T00",
      }),
    ).toBe("metric claim unavailable (contract missing)");
  });

  it("fails closed for strict metric claims with unknown contract status", () => {
    expect(
      resolveMetricClaimLabel({
        mode: "public",
        strictMode: true,
        metricDerived: true,
        metricContractOk: undefined,
        sourceLabel: "warp.metric.T00",
      }),
    ).toBe("metric claim unavailable");
    expect(
      resolveMetricClaimLabel({
        mode: "academic",
        strictMode: true,
        metricDerived: true,
        metricContractOk: undefined,
        sourceLabel: "warp.metric.T00",
      }),
    ).toBe("metric claim unavailable (contract missing)");
  });

  it("matches audience snapshots", () => {
    expect({
      public: formatDerivationLabel({ mode: "public", metricDerived: false, sourceLabel: "pipeline" }),
      academic: formatDerivationLabel({ mode: "academic", metricDerived: false, sourceLabel: "pipeline" }),
    }).toMatchSnapshot();
  });
});
