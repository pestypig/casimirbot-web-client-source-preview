import { describe, expect, it, vi } from "vitest";

import { hashDocumentSource, segmentMarkdownForTranslation } from "@shared/document-translation";
import { researchLibraryDocViewerPath } from "@shared/helix-research-library";
import {
  HELIX_ACTIVE_DOC_VISIBLE_TRANSLATION_CONTEXT_CHANGED_EVENT,
  buildActiveDocVisibleTranslationContext,
  clearActiveDocVisibleTranslationContext,
  publishActiveDocVisibleTranslationContext,
  readActiveDocVisibleTranslationContext,
  type HelixActiveDocVisibleTranslationContextChangedEventDetail,
} from "../visibleTranslationContext";

describe("visible translation context", () => {
  it("builds bounded non-authoritative visible document translation chunks", () => {
    const rawMarkdown = [
      "# Current Status",
      "",
      "First paragraph for translation.",
      "",
      "Second paragraph for translation.",
    ].join("\n");
    const sourceHash = hashDocumentSource(rawMarkdown);

    const context = buildActiveDocVisibleTranslationContext({
      docPath: "docs/current.md",
      title: "Current Status",
      rawMarkdown,
      rawMarkdownSourceHash: sourceHash,
      units: segmentMarkdownForTranslation(rawMarkdown),
      accountLocale: "en",
      targetLanguage: "es",
      nowMs: 1783000000000,
    });

    expect(context).toMatchObject({
      schema: "helix.ask.active_doc_visible_translation_context.v1",
      source_kind: "docs_viewer",
      panel_id: "docs-viewer",
      doc_path: "docs/current.md",
      title: "Current Status",
      source_id: "document_markdown:docs/current.md",
      source_hash: sourceHash,
      source_text_hash: sourceHash,
      source_text_char_count: rawMarkdown.length,
      account_locale: "en",
      target_language: "es",
      projection_target: "docs_chunk",
      collection_strategy: "loaded_document_translation_units_bounded",
      raw_content_included: false,
      assistant_answer: false,
      terminal_eligible: false,
      answer_authority: false,
      reentry_required: true,
    });
    expect(context?.chunks.length).toBeGreaterThan(0);
    expect(context?.chunks[0]).toMatchObject({
      source_kind: "docs_viewer",
      panel_id: "docs-viewer",
      doc_path: "docs/current.md",
      source_id: "document_markdown:docs/current.md",
      source_hash: sourceHash,
      source_event_id: expect.stringContaining("visible_translation_source_event:docs/current.md:chunk:u0001"),
      source_event_ms: 1783000000000,
      observed_at_ms: 1783000000000,
      chunk_id: "u0001",
      chunk_index: 0,
      visible_text: "# Current Status",
      projection_target: "docs_chunk",
      existing_observation_ref: null,
      existing_receipt_ref: null,
      raw_content_included: false,
      assistant_answer: false,
      terminal_eligible: false,
      answer_authority: false,
      reentry_required: true,
    });
  });

  it("publishes and clears the active document context without stale document bleed", () => {
    const rawMarkdown = "# One";
    const context = buildActiveDocVisibleTranslationContext({
      docPath: "docs/one.md",
      rawMarkdown,
      rawMarkdownSourceHash: hashDocumentSource(rawMarkdown),
      units: segmentMarkdownForTranslation(rawMarkdown),
      accountLocale: "en",
      targetLanguage: "es",
    });

    publishActiveDocVisibleTranslationContext(context);
    expect(readActiveDocVisibleTranslationContext()?.doc_path).toBe("docs/one.md");

    clearActiveDocVisibleTranslationContext("docs/two.md");
    expect(readActiveDocVisibleTranslationContext()?.doc_path).toBe("docs/one.md");

    clearActiveDocVisibleTranslationContext("docs/one.md");
    expect(readActiveDocVisibleTranslationContext()).toBeNull();
  });

  it("emits a visible context change event only when source identity changes", () => {
    const rawMarkdown = [
      "# One",
      "",
      "First section.",
      "",
      "Second section.",
    ].join("\n");
    const sourceHash = hashDocumentSource(rawMarkdown);
    const units = segmentMarkdownForTranslation(rawMarkdown);
    const firstContext = buildActiveDocVisibleTranslationContext({
      docPath: "docs/one.md",
      rawMarkdown,
      rawMarkdownSourceHash: sourceHash,
      units,
      visibleUnitIds: ["u0002"],
      accountLocale: "en",
      targetLanguage: "es",
    });
    const duplicateContext = buildActiveDocVisibleTranslationContext({
      docPath: "docs/one.md",
      rawMarkdown,
      rawMarkdownSourceHash: sourceHash,
      units,
      visibleUnitIds: ["u0002"],
      accountLocale: "en",
      targetLanguage: "es",
    });
    const secondContext = buildActiveDocVisibleTranslationContext({
      docPath: "docs/one.md",
      rawMarkdown,
      rawMarkdownSourceHash: sourceHash,
      units,
      visibleUnitIds: ["u0003"],
      accountLocale: "en",
      targetLanguage: "es",
    });
    const events: HelixActiveDocVisibleTranslationContextChangedEventDetail[] = [];
    const listener = (event: Event) => {
      events.push((event as CustomEvent<HelixActiveDocVisibleTranslationContextChangedEventDetail>).detail);
    };

    const eventTarget = new EventTarget();
    class TestCustomEvent<T = unknown> extends Event {
      detail: T;

      constructor(type: string, init?: CustomEventInit<T>) {
        super(type);
        this.detail = init?.detail as T;
      }
    }

    vi.stubGlobal("CustomEvent", TestCustomEvent);
    vi.stubGlobal("window", {
      addEventListener: eventTarget.addEventListener.bind(eventTarget),
      removeEventListener: eventTarget.removeEventListener.bind(eventTarget),
      dispatchEvent: eventTarget.dispatchEvent.bind(eventTarget),
    });

    clearActiveDocVisibleTranslationContext();
    window.addEventListener(HELIX_ACTIVE_DOC_VISIBLE_TRANSLATION_CONTEXT_CHANGED_EVENT, listener);
    try {
      publishActiveDocVisibleTranslationContext(firstContext);
      publishActiveDocVisibleTranslationContext(duplicateContext);
      publishActiveDocVisibleTranslationContext(secondContext);
    } finally {
      window.removeEventListener(HELIX_ACTIVE_DOC_VISIBLE_TRANSLATION_CONTEXT_CHANGED_EVENT, listener);
      clearActiveDocVisibleTranslationContext();
      vi.unstubAllGlobals();
    }

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      schema: "helix.ask.active_doc_visible_translation_context_changed.v1",
      previous_identity_key: null,
      context: {
        doc_path: "docs/one.md",
      },
    });
    expect(events[1]).toMatchObject({
      previous_context: {
        doc_path: "docs/one.md",
      },
      context: {
        doc_path: "docs/one.md",
      },
    });
  });

  it("uses DOM-visible unit ids when provided instead of first-document fallback order", () => {
    const rawMarkdown = [
      "# Heading",
      "",
      "First paragraph.",
      "",
      "Second paragraph.",
      "",
      "Third paragraph.",
    ].join("\n");
    const context = buildActiveDocVisibleTranslationContext({
      docPath: "docs/visible.md",
      rawMarkdown,
      rawMarkdownSourceHash: hashDocumentSource(rawMarkdown),
      units: segmentMarkdownForTranslation(rawMarkdown),
      visibleUnitIds: ["u0003", "u0002"],
      accountLocale: "en",
      targetLanguage: "es",
    });

    expect(context).toMatchObject({
      collection_strategy: "dom_near_viewport_translation_anchors",
      chunk_count: 2,
    });
    expect(context?.chunks.map((chunk) => chunk.chunk_id)).toEqual(["u0002", "u0003"]);
    expect(context?.chunks.map((chunk) => chunk.chunk_index)).toEqual([0, 1]);
    expect(context?.chunks.map((chunk) => chunk.visible_text)).toEqual([
      "First paragraph.",
      "Second paragraph.",
    ]);
  });

  it("carries existing governed projection refs on visible chunks", () => {
    const rawMarkdown = [
      "# Heading",
      "",
      "Paragraph with an existing projection.",
    ].join("\n");
    const sourceHash = hashDocumentSource(rawMarkdown);
    const context = buildActiveDocVisibleTranslationContext({
      docPath: "docs/projected.md",
      rawMarkdown,
      rawMarkdownSourceHash: sourceHash,
      units: segmentMarkdownForTranslation(rawMarkdown),
      visibleUnitIds: ["u0002"],
      existingTranslations: {
        u0002: {
          observationRef: "ask:turn:capability_lane:live_translation.translate_text:observation:1",
          receiptRef: "ask:turn:capability_lane:live_translation.translate_text:receipt:1",
          projectionStatus: "projected",
          freshnessStatus: "fresh",
          terminalAuthorityStatus: "terminal_authority_rejected",
          sourceEventMs: 1782999999000,
          observedAtMs: 1782999999100,
        },
      },
      accountLocale: "en",
      targetLanguage: "es",
    });

    expect(context?.chunks).toHaveLength(1);
    expect(context?.chunks[0]).toMatchObject({
      chunk_id: "u0002",
      existing_observation_ref: "ask:turn:capability_lane:live_translation.translate_text:observation:1",
      existing_receipt_ref: "ask:turn:capability_lane:live_translation.translate_text:receipt:1",
      existing_projection_status: "projected",
      existing_freshness_status: "fresh",
      existing_terminal_authority_status: "terminal_authority_rejected",
      existing_source_event_ms: 1782999999000,
      existing_observed_at_ms: 1782999999100,
      assistant_answer: false,
      terminal_eligible: false,
      answer_authority: false,
      raw_content_included: false,
      reentry_required: true,
    });
  });

  it("includes selected document text as a governed docs selection target", () => {
    const rawMarkdown = [
      "# Heading",
      "",
      "Paragraph with selectable text.",
    ].join("\n");
    const sourceHash = hashDocumentSource(rawMarkdown);
    const context = buildActiveDocVisibleTranslationContext({
      docPath: "docs/selected.md",
      rawMarkdown,
      rawMarkdownSourceHash: sourceHash,
      units: segmentMarkdownForTranslation(rawMarkdown),
      selectedText: "Selectable text",
      selectionRef: "docs-viewer:selection:fnv1a32:selected",
      selectionBbox: {
        x: 12,
        y: 24,
        width: 320,
        height: 48,
        top: 24,
        left: 12,
        right: 332,
        bottom: 72,
        viewport_width: 1280,
        viewport_height: 720,
        source: "selection-client-rect",
      },
      selectionExistingProjection: {
        observationRef: "ask:turn:translation:observation:selected",
        receiptRef: "ask:turn:translation:receipt:selected",
        projectionStatus: "projected",
        freshnessStatus: "fresh",
        terminalAuthorityStatus: "not_terminal_authority",
        sourceEventMs: 1782999998000,
        observedAtMs: 1782999998100,
      },
      accountLocale: "en",
      targetLanguage: "es",
      nowMs: 1783000000100,
    });

    expect(context?.chunks[0]).toMatchObject({
      source_kind: "selection",
      panel_id: "docs-viewer",
      doc_path: "docs/selected.md",
      source_id: "document_markdown:docs/selected.md#docs-viewer:selection:fnv1a32:selected",
      source_hash: sourceHash,
      source_text_hash: hashDocumentSource("Selectable text"),
      source_text_char_count: "Selectable text".length,
      source_event_id: expect.stringContaining("visible_translation_source_event:docs/selected.md:selection:docs-viewer:selection"),
      source_event_ms: 1783000000100,
      observed_at_ms: 1783000000100,
      visible_text: "Selectable text",
      chunk_id: "docs-viewer:selection:fnv1a32:selected",
      chunk_index: 0,
      region_id: "docs-viewer:selection:fnv1a32:selected",
      bbox: {
        x: 12,
        y: 24,
        width: 320,
        height: 48,
        top: 24,
        left: 12,
        right: 332,
        bottom: 72,
        viewport_width: 1280,
        viewport_height: 720,
        source: "selection-client-rect",
      },
      projection_target: "docs_selection",
      existing_observation_ref: "ask:turn:translation:observation:selected",
      existing_receipt_ref: "ask:turn:translation:receipt:selected",
      existing_projection_status: "projected",
      existing_freshness_status: "fresh",
      existing_terminal_authority_status: "not_terminal_authority",
      existing_source_event_ms: 1782999998000,
      existing_observed_at_ms: 1782999998100,
      assistant_answer: false,
      terminal_eligible: false,
      answer_authority: false,
      raw_content_included: false,
      reentry_required: true,
    });
    expect(context?.chunks[0]?.dedupe_key).toContain("docs_selection");
  });

  it("includes hovered document text as a governed docs hover target", () => {
    const rawMarkdown = [
      "# Heading",
      "",
      "Paragraph with hoverable text.",
    ].join("\n");
    const sourceHash = hashDocumentSource(rawMarkdown);
    const context = buildActiveDocVisibleTranslationContext({
      docPath: "docs/hovered.md",
      rawMarkdown,
      rawMarkdownSourceHash: sourceHash,
      units: segmentMarkdownForTranslation(rawMarkdown),
      hoverText: "Hoverable text",
      hoverRef: "docs-viewer:hover:u0002",
      hoverBbox: {
        x: 20,
        y: 32,
        width: 180,
        height: 30,
        source: "hover-client-rect",
      },
      hoverExistingProjection: {
        observationRef: "ask:turn:translation:observation:hover",
        receiptRef: "ask:turn:translation:receipt:hover",
        projectionStatus: "projected",
        freshnessStatus: "fresh",
        terminalAuthorityStatus: "terminal_authority_rejected",
        sourceEventMs: 1782999998200,
        observedAtMs: 1782999998300,
      },
      accountLocale: "en",
      targetLanguage: "es",
      nowMs: 1783000000200,
    });

    expect(context?.chunks[0]).toMatchObject({
      source_kind: "hover_region",
      panel_id: "docs-viewer",
      doc_path: "docs/hovered.md",
      source_id: "document_markdown:docs/hovered.md#docs-viewer:hover:u0002",
      source_hash: sourceHash,
      source_text_hash: hashDocumentSource("Hoverable text"),
      source_text_char_count: "Hoverable text".length,
      source_event_id: expect.stringContaining("visible_translation_source_event:docs/hovered.md:hover:docs-viewer:hover"),
      source_event_ms: 1783000000200,
      observed_at_ms: 1783000000200,
      visible_text: "Hoverable text",
      chunk_id: "docs-viewer:hover:u0002",
      chunk_index: 0,
      region_id: "docs-viewer:hover:u0002",
      bbox: {
        x: 20,
        y: 32,
        width: 180,
        height: 30,
        source: "hover-client-rect",
      },
      projection_target: "docs_hover",
      existing_observation_ref: "ask:turn:translation:observation:hover",
      existing_receipt_ref: "ask:turn:translation:receipt:hover",
      existing_projection_status: "projected",
      existing_freshness_status: "fresh",
      existing_terminal_authority_status: "terminal_authority_rejected",
      existing_source_event_ms: 1782999998200,
      existing_observed_at_ms: 1782999998300,
      assistant_answer: false,
      terminal_eligible: false,
      answer_authority: false,
      raw_content_included: false,
      reentry_required: true,
    });
    expect(context?.chunks[0]?.dedupe_key).toContain("docs_hover");
  });

  it("keeps selected, hovered, and visible document chunks in stable zero-based order", () => {
    const rawMarkdown = [
      "# Heading",
      "",
      "Paragraph visible in the viewport.",
    ].join("\n");
    const context = buildActiveDocVisibleTranslationContext({
      docPath: "docs/mixed-visible.md",
      rawMarkdown,
      rawMarkdownSourceHash: hashDocumentSource(rawMarkdown),
      units: segmentMarkdownForTranslation(rawMarkdown),
      visibleUnitIds: ["u0002"],
      selectedText: "Selected phrase",
      selectionRef: "docs-viewer:selection:fnv1a32:mixed-selected",
      hoverText: "Hovered phrase",
      hoverRef: "docs-viewer:hover:u0002",
      accountLocale: "en",
      targetLanguage: "es",
    });

    expect(context?.chunks.map((chunk) => ({
      source_kind: chunk.source_kind,
      chunk_id: chunk.chunk_id,
      chunk_index: chunk.chunk_index,
      projection_target: chunk.projection_target,
    }))).toEqual([
      {
        source_kind: "selection",
        chunk_id: "docs-viewer:selection:fnv1a32:mixed-selected",
        chunk_index: 0,
        projection_target: "docs_selection",
      },
      {
        source_kind: "hover_region",
        chunk_id: "docs-viewer:hover:u0002",
        chunk_index: 1,
        projection_target: "docs_hover",
      },
      {
        source_kind: "docs_viewer",
        chunk_id: "u0002",
        chunk_index: 2,
        projection_target: "docs_chunk",
      },
    ]);
  });

  it("includes governed account-language UI regions without answer authority", () => {
    const rawMarkdown = "# Heading";
    const sourceHash = hashDocumentSource(rawMarkdown);
    const context = buildActiveDocVisibleTranslationContext({
      docPath: "docs/ui-region.md",
      rawMarkdown,
      rawMarkdownSourceHash: sourceHash,
      units: segmentMarkdownForTranslation(rawMarkdown),
      accountLocale: "en",
      targetLanguage: "es",
      nowMs: 1783000000300,
      uiTextRegions: [
        {
          sourceText: "Current Status",
          sourceId: "workstation-shell#docs-viewer:title",
          regionId: "docs-viewer:title",
          bbox: {
            x: 4,
            y: 8,
            width: 240,
            height: 36,
            source: "account-language-region",
          },
          sourceKind: "panel_text",
          existingObservationRef: "ask:turn:translation:observation:title",
          existingReceiptRef: "ask:turn:translation:receipt:title",
          existingProjectionStatus: "projected",
          existingFreshnessStatus: "fresh",
          existingTerminalAuthorityStatus: "not_terminal_authority",
          existingSourceEventMs: 1782999999000,
          existingObservedAtMs: 1782999999100,
        },
        {
          sourceText: "Translate",
          sourceId: "workstation-shell#docs-viewer:translate-button",
          regionId: "docs-viewer:translate-button",
          bbox: {
            x: 2,
            y: 10,
            width: 0,
            height: 20,
            source: "invalid-zero-width",
          },
          sourceKind: "button_label",
          existingObservationRef: "ask:turn:translation:observation:button",
          existingReceiptRef: "ask:turn:translation:receipt:button",
          existingProjectionStatus: "projected",
          existingFreshnessStatus: "fresh",
          existingTerminalAuthorityStatus: "not_terminal_authority",
          existingSourceEventMs: 1782999999200,
          existingObservedAtMs: 1782999999300,
        },
      ],
    });

    expect(context?.ui_text_regions).toHaveLength(2);
    expect(context?.ui_text_regions[0]).toMatchObject({
      source_kind: "panel_text",
      panel_id: "docs-viewer",
      doc_path: "docs/ui-region.md",
      source_id: "workstation-shell#docs-viewer:title",
      source_hash: sourceHash,
      source_event_id: expect.stringContaining("visible_translation_source_event:docs/ui-region.md:ui:docs-viewer:title"),
      source_event_ms: 1783000000300,
      observed_at_ms: 1783000000300,
      visible_text: "Current Status",
      chunk_id: "docs-viewer:title",
      chunk_index: 0,
      region_id: "docs-viewer:title",
      bbox: {
        x: 4,
        y: 8,
        width: 240,
        height: 36,
        source: "account-language-region",
      },
      projection_target: "account_language",
      existing_observation_ref: "ask:turn:translation:observation:title",
      existing_receipt_ref: "ask:turn:translation:receipt:title",
      existing_projection_status: "projected",
      existing_freshness_status: "fresh",
      existing_terminal_authority_status: "not_terminal_authority",
      existing_source_event_ms: 1782999999000,
      existing_observed_at_ms: 1782999999100,
      assistant_answer: false,
      terminal_eligible: false,
      answer_authority: false,
      raw_content_included: false,
      reentry_required: true,
    });
    expect(context?.ui_text_regions[0]?.source_text_hash).toBe(hashDocumentSource("Current Status"));
    expect(context?.ui_text_regions[0]?.dedupe_key).toContain("account_language");
    expect(context?.ui_text_regions[1]).toMatchObject({
      source_kind: "button_label",
      panel_id: "docs-viewer",
      doc_path: "docs/ui-region.md",
      source_id: "workstation-shell#docs-viewer:translate-button",
      source_hash: sourceHash,
      source_event_ms: 1783000000300,
      observed_at_ms: 1783000000300,
      visible_text: "Translate",
      chunk_id: "docs-viewer:translate-button",
      chunk_index: 1,
      region_id: "docs-viewer:translate-button",
      bbox: null,
      projection_target: "account_language",
      existing_observation_ref: "ask:turn:translation:observation:button",
      existing_receipt_ref: "ask:turn:translation:receipt:button",
      existing_projection_status: "projected",
      existing_freshness_status: "fresh",
      existing_terminal_authority_status: "not_terminal_authority",
      existing_source_event_ms: 1782999999200,
      existing_observed_at_ms: 1782999999300,
      assistant_answer: false,
      terminal_eligible: false,
      answer_authority: false,
      raw_content_included: false,
      reentry_required: true,
    });
    expect(context?.ui_text_regions[1]?.source_text_hash).toBe(hashDocumentSource("Translate"));
    expect(context?.ui_text_regions[1]?.dedupe_key).toContain("account_language");
  });

  it("carries opaque private Research Library provenance through every visible target", () => {
    const documentRef = "private-research:account-token:document-token";
    const docPath = researchLibraryDocViewerPath(documentRef);
    const rawMarkdown = "# Private paper\n\nVisible extracted paragraph.";
    const context = buildActiveDocVisibleTranslationContext({
      docPath,
      title: "Private paper",
      documentSourceKind: "research_library",
      documentRef,
      privateSource: true,
      rawMarkdown,
      rawMarkdownSourceHash: hashDocumentSource(rawMarkdown),
      units: segmentMarkdownForTranslation(rawMarkdown),
      accountLocale: "en",
      targetLanguage: "es",
      uiTextRegions: [{
        sourceText: "Translate",
        sourceId: "workstation-shell#docs-viewer:translate-button",
        regionId: "docs-viewer:translate-button",
        sourceKind: "button_label",
      }],
    });

    expect(context).toMatchObject({
      doc_path: docPath,
      source_id: `document_markdown:${docPath}`,
      document_source_kind: "research_library",
      document_ref: documentRef,
      private_source: true,
    });
    expect(context?.chunks).not.toHaveLength(0);
    for (const target of [...(context?.chunks ?? []), ...(context?.ui_text_regions ?? [])]) {
      expect(target).toMatchObject({
        doc_path: docPath,
        document_source_kind: "research_library",
        document_ref: documentRef,
        private_source: true,
      });
    }

    expect(buildActiveDocVisibleTranslationContext({
      docPath,
      documentSourceKind: "research_library",
      privateSource: true,
      rawMarkdown,
      rawMarkdownSourceHash: hashDocumentSource(rawMarkdown),
      units: segmentMarkdownForTranslation(rawMarkdown),
      accountLocale: "en",
      targetLanguage: "es",
    })).toBeNull();
  });
});
