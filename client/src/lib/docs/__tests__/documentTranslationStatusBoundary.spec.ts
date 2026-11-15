import { describe, expect, it } from "vitest";
import type { DocumentMarkdownTranslationEntry } from "../documentTranslationClient";
import { documentMarkdownTranslationEntryToInlineRenderState } from "../liveTranslationInlineProjection";
import { buildActiveDocVisibleTranslationContext } from "../visibleTranslationContext";

describe("document translation status boundaries", () => {
  it.each([
    { status: "projected", freshness: "fresh", rendered: "projected", visible: "projected", normalizedFreshness: "fresh" },
    { status: " Stale ", freshness: " STALE ", rendered: "stale", visible: "stale", normalizedFreshness: "stale" },
    { status: "cancelled", freshness: "unknown", rendered: "cancelled", visible: "cancelled", normalizedFreshness: "unknown" },
    { status: "FAILED", freshness: "FRESH", rendered: "failed", visible: "failed", normalizedFreshness: "fresh" },
    { status: "missing", freshness: "future-state", rendered: "missing", visible: null, normalizedFreshness: undefined },
    { status: "missing", freshness: "fresh", rendered: "missing", visible: null, normalizedFreshness: "fresh" },
    { status: "unrecognized", freshness: "unrecognized", rendered: undefined, visible: null, normalizedFreshness: undefined },
    { status: null, freshness: null, rendered: undefined, visible: null, normalizedFreshness: undefined },
    { status: undefined, freshness: undefined, rendered: undefined, visible: null, normalizedFreshness: undefined },
  ])("normalizes receipt status $status and freshness $freshness without asserting authority", (sample) => {
    const entry: DocumentMarkdownTranslationEntry = {
      unitId: "u1", status: "ready", text: "Translated paragraph", runId: "test-translation",
      role: "packet_composer", projectionStatus: sample.status, freshnessStatus: sample.freshness,
      observationRef: "test-observation", receiptRef: "test-receipt", contextRole: "tool_evidence",
      answerAuthority: false, assistantAnswer: false, terminalEligible: false, rawContentIncluded: false,
    };
    const rendered = documentMarkdownTranslationEntryToInlineRenderState(entry);
    expect(rendered.projectionStatus).toBe(sample.rendered);
    expect(rendered.freshnessStatus).toBe(sample.normalizedFreshness);
    const context = buildActiveDocVisibleTranslationContext({
      docPath: "docs/test.md", rawMarkdown: "Visible paragraph", rawMarkdownSourceHash: "test-source-hash",
      units: [{ unit_id: "u1", kind: "paragraph", source_markdown: "Visible paragraph", translatable: true, protected_spans: [] }],
      existingTranslations: { u1: rendered }, accountLocale: "en", targetLanguage: "es",
      selectedText: "Selected paragraph", selectionExistingProjection: rendered,
      hoverText: "Hovered paragraph", hoverExistingProjection: rendered,
      uiTextRegions: [{ sourceText: "Translate", sourceId: "test-button", regionId: "test-region",
        existingProjectionStatus: sample.status, existingFreshnessStatus: sample.freshness }],
    });
    expect(context).not.toBeNull();
    expect(context?.chunks).toHaveLength(3); expect(context?.ui_text_regions).toHaveLength(1);
    for (const region of [...context!.chunks, ...context!.ui_text_regions]) {
      expect(region.existing_projection_status).toBe(sample.visible);
      expect(region.existing_freshness_status).toBe(sample.normalizedFreshness ?? null);
      expect(region).toMatchObject({ answer_authority: false, assistant_answer: false, terminal_eligible: false, reentry_required: true });
    }
    expect(rendered.observationRef).toBe("test-observation"); expect(rendered.receiptRef).toBe("test-receipt");
  });
});
