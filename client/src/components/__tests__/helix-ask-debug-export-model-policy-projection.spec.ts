import { describe, expect, it } from "vitest";
import { mergeRenderedLanguageModelPolicySummaryIntoDebugExport } from "@/components/helix/ask-console/HelixAskDebugExportModelPolicyProjection";

describe("Helix Ask debug export model policy projection", () => {
  it("merges rendered AI model policy summaries into copied debug exports", () => {
    const modelPolicyDebugSummary = "AI: Auto -> Fast | gpt-5.4-mini | reasoning: low | turn-local";
    const merged = JSON.parse(
      mergeRenderedLanguageModelPolicySummaryIntoDebugExport(
        JSON.stringify({
          schema: "helix.ask.debug_export.v1",
          debug: {},
        }),
        { modelPolicyDebugSummary },
      ),
    ) as Record<string, unknown>;
    const mergedDebug = merged.debug as Record<string, unknown>;

    expect(merged.language_model_debug_summary).toBe(modelPolicyDebugSummary);
    expect(merged.model_policy_debug_summary).toBe(modelPolicyDebugSummary);
    expect(mergedDebug.language_model_debug_summary).toBe(modelPolicyDebugSummary);
    expect(mergedDebug.model_policy_debug_summary).toBe(modelPolicyDebugSummary);
  });

  it("does not promote ordinary model labels as policy summaries", () => {
    const nonPolicyPayload = JSON.stringify({ schema: "helix.ask.debug_export.v1" });

    expect(
      mergeRenderedLanguageModelPolicySummaryIntoDebugExport(nonPolicyPayload, {
        modelPolicyDebugSummary: "Model: gpt-4o-mini",
      }),
    ).toBe(nonPolicyPayload);
  });
});
