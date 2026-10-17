import { describe, expect, it } from "vitest";

import {
  isDiagnosticVisualEvidence,
  readVisualEvidenceSummary,
} from "../ask-visual-evidence-readers";

describe("ask visual evidence readers", () => {
  it("reads direct visual evidence summaries before nested evidence summaries", () => {
    expect(
      readVisualEvidenceSummary({
        summary: " direct summary ",
        evidence: { summary: "nested summary" },
      }),
    ).toBe("direct summary");
    expect(readVisualEvidenceSummary({ evidence: { summary: " nested summary " } })).toBe("nested summary");
    expect(readVisualEvidenceSummary({ evidence: { summary: 42 } })).toBeNull();
    expect(readVisualEvidenceSummary(null)).toBeNull();
  });

  it("detects diagnostic visual evidence summaries", () => {
    expect(
      isDiagnosticVisualEvidence({
        summary: "No configured vision provider is available.",
      }),
    ).toBe(true);
    expect(
      isDiagnosticVisualEvidence({
        evidence: { summary: "The configured vision provider did not return an image description." },
      }),
    ).toBe(true);
    expect(
      isDiagnosticVisualEvidence({
        summary: "The image shows a calculator panel with expression 8*9.",
      }),
    ).toBe(false);
  });
});
