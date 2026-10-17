import { describe, expect, it } from "vitest";
import {
  buildHelixVisibleTranslationDataAttributes,
  buildHelixVisibleTranslationProjections,
  clearHelixVisibleTranslationProjectionContext,
  publishHelixVisibleTranslationProjectionsFromPayload,
  readHelixVisibleTranslationProjectionContext,
  selectHelixVisibleTranslationProjection,
} from "@/lib/helix/visible-translation-projection";

const docsHoverReceipt = (overrides: Record<string, unknown> = {}) => ({
  schema: "helix.live_translation.projection_receipt.v1",
  receipt_ref: "receipt:docs:hover",
  observation_ref: "obs:docs:hover",
  selected_runtime_agent_provider: "codex",
  selected_backend_provider: "live_translation.local_runtime",
  lane_id: "live_translation",
  capability: "live_translation.translate_text",
  projection_key: "docs-hover:current:es",
  projection_target: "docs_hover",
  projection_status: "projected",
  source_id: "document_markdown:docs/current.md#docs-viewer:hover:u0002",
  panel_id: "docs-viewer",
  region_id: "docs-viewer:hover:u0002",
  doc_path: "docs/current.md",
  source_hash: "fnv1a32:doc-source",
  source_kind: "hover_region",
  source_text_hash: "fnv1a32:hovered",
  source_text_char_count: 16,
  account_locale: "es-US",
  chunk_id: "docs-viewer:hover:u0002",
  chunk_index: 0,
  dedupe_key: "document_markdown:docs/current.md::hovered::docs_hover::es",
  source_event_id: "docs-hover:event-1",
  source_event_ms: 200,
  observed_at_ms: 250,
  freshness_status: "fresh",
  bbox: { x: 24, y: 48, width: 320, height: 44, source: "docs-hover-anchor" },
  target_language: "es",
  translated_text: "Oracion enfocada",
  terminal_authority_status: "not_terminal_authority",
  answer_authority: false,
  terminal_eligible: false,
  assistant_answer: false,
  raw_content_included: false,
  ...overrides,
});

describe("Helix visible translation projection context", () => {
  it("selects current hovered document projection receipts without answer authority", () => {
    const states = buildHelixVisibleTranslationProjections({
      capability_lane_projection_receipts: [
        docsHoverReceipt({
          receipt_ref: "receipt:docs:hover:old",
          observation_ref: "obs:docs:hover:old",
          translated_text: "Anterior",
          observed_at_ms: 100,
        }),
        docsHoverReceipt(),
      ],
    });

    const selected = selectHelixVisibleTranslationProjection({
      states,
      projectionTarget: "docs_hover",
      sourceId: "document_markdown:docs/current.md#docs-viewer:hover:u0002",
      docPath: "docs/current.md",
      accountLocale: "es",
      targetLanguage: "es",
    });

    expect(selected).toMatchObject({
      status: "projected",
      displayText: "Oracion enfocada",
      projectionTarget: "docs_hover",
      sourceKind: "hover_region",
      bbox: { x: 24, y: 48, width: 320, height: 44, source: "docs-hover-anchor" },
      sourceEventId: "docs-hover:event-1",
      sourceEventMs: 200,
      observationRef: "obs:docs:hover",
      receiptRef: "receipt:docs:hover",
      selectedRuntimeAgentProvider: "codex",
      selectedBackendProvider: "live_translation.local_runtime",
      contextRole: "tool_evidence",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("emits projection-only DOM/debug attributes for visible translation receipts", () => {
    const [state] = buildHelixVisibleTranslationProjections({
      capability_lane_projection_receipts: [docsHoverReceipt()],
    });

    expect(buildHelixVisibleTranslationDataAttributes(state)).toMatchObject({
      "data-helix-visible-translation-role": "governed-visible-text-projection",
      "data-helix-visible-translation-authority-policy": "projection_only_not_answer_authority",
      "data-helix-visible-translation-terminal-authority-owner": "helix",
      "data-helix-visible-translation-status": "projected",
      "data-helix-visible-translation-projection-target": "docs_hover",
      "data-helix-visible-translation-source-kind": "hover_region",
      "data-helix-visible-translation-bbox":
        JSON.stringify({ x: 24, y: 48, width: 320, height: 44, source: "docs-hover-anchor" }),
      "data-helix-visible-translation-source-event-ms": "200",
      "data-helix-visible-translation-observation-ref": "obs:docs:hover",
      "data-helix-visible-translation-receipt-ref": "receipt:docs:hover",
      "data-helix-visible-translation-answer-authority": "false",
      "data-helix-visible-translation-terminal-eligible": "false",
      "data-helix-visible-translation-assistant-answer": "false",
      "data-helix-visible-translation-raw-content-included": "false",
      "data-helix-visible-translation-reentry-required": "true",
    });
  });

  it("publishes visible projection context for mounted workstation surfaces", () => {
    clearHelixVisibleTranslationProjectionContext();
    expect(readHelixVisibleTranslationProjectionContext()).toEqual([]);

    const published = publishHelixVisibleTranslationProjectionsFromPayload({
      debug: {
        capability_lane_projection_receipts: [docsHoverReceipt()],
      },
    });

    expect(published).toHaveLength(1);
    expect(readHelixVisibleTranslationProjectionContext()).toEqual([
      expect.objectContaining({
        projectionTarget: "docs_hover",
        displayText: "Oracion enfocada",
        observationRef: "obs:docs:hover",
        receiptRef: "receipt:docs:hover",
        answerAuthority: false,
        terminalEligible: false,
      }),
    ]);

    clearHelixVisibleTranslationProjectionContext();
  });

  it("merges partial visible document chunk projection receipts without erasing earlier chunks", () => {
    clearHelixVisibleTranslationProjectionContext();

    publishHelixVisibleTranslationProjectionsFromPayload({
      capability_lane_projection_receipts: [
        docsHoverReceipt({
          projection_key: "docs-chunk:current:u0001:es",
          projection_target: "docs_chunk",
          receipt_ref: "receipt:docs:chunk:u0001",
          observation_ref: "obs:docs:chunk:u0001",
          source_id: "document_markdown:docs/current.md",
          source_kind: "docs_viewer",
          chunk_id: "u0001",
          chunk_index: 0,
          region_id: "docs-viewer:u0001",
          translated_text: "Primer parrafo",
          source_event_id: "docs-chunk:event-u0001",
          source_event_ms: 300,
          observed_at_ms: 350,
        }),
      ],
    });
    publishHelixVisibleTranslationProjectionsFromPayload({
      capability_lane_projection_receipts: [
        docsHoverReceipt({
          projection_key: "docs-chunk:current:u0002:es",
          projection_target: "docs_chunk",
          receipt_ref: "receipt:docs:chunk:u0002",
          observation_ref: "obs:docs:chunk:u0002",
          source_id: "document_markdown:docs/current.md",
          source_kind: "docs_viewer",
          chunk_id: "u0002",
          chunk_index: 1,
          region_id: "docs-viewer:u0002",
          translated_text: "Segundo parrafo",
          source_event_id: "docs-chunk:event-u0002",
          source_event_ms: 400,
          observed_at_ms: 450,
        }),
      ],
    });

    expect(readHelixVisibleTranslationProjectionContext()).toEqual([
      expect.objectContaining({
        projectionTarget: "docs_chunk",
        chunkId: "u0001",
        chunkIndex: 0,
        displayText: "Primer parrafo",
        sourceEventId: "docs-chunk:event-u0001",
        sourceEventMs: 300,
        observationRef: "obs:docs:chunk:u0001",
        receiptRef: "receipt:docs:chunk:u0001",
        answerAuthority: false,
        terminalEligible: false,
      }),
      expect.objectContaining({
        projectionTarget: "docs_chunk",
        chunkId: "u0002",
        chunkIndex: 1,
        displayText: "Segundo parrafo",
        sourceEventId: "docs-chunk:event-u0002",
        sourceEventMs: 400,
        observationRef: "obs:docs:chunk:u0002",
        receiptRef: "receipt:docs:chunk:u0002",
        answerAuthority: false,
        terminalEligible: false,
      }),
    ]);

    clearHelixVisibleTranslationProjectionContext();
  });

  it("requires matching chunk or region when selecting scoped visible document projections", () => {
    const states = buildHelixVisibleTranslationProjections({
      capability_lane_projection_receipts: [
        docsHoverReceipt({
          projection_key: "docs-chunk:current:u0001:es",
          projection_target: "docs_chunk",
          receipt_ref: "receipt:docs:chunk:u0001",
          observation_ref: "obs:docs:chunk:u0001",
          source_id: "document_markdown:docs/current.md",
          source_kind: "docs_viewer",
          chunk_id: "u0001",
          chunk_index: 0,
          region_id: "docs-viewer:u0001",
          translated_text: "Primer parrafo",
        }),
      ],
    });

    expect(selectHelixVisibleTranslationProjection({
      states,
      projectionTarget: "docs_chunk",
      sourceId: "document_markdown:docs/current.md",
      docPath: "docs/current.md",
      chunkId: "u0002",
      targetLanguage: "es",
    })).toBeNull();
    expect(selectHelixVisibleTranslationProjection({
      states,
      projectionTarget: "docs_chunk",
      sourceId: "document_markdown:docs/current.md",
      docPath: "docs/current.md",
      regionId: "docs-viewer:u0002",
      targetLanguage: "es",
    })).toBeNull();
    expect(selectHelixVisibleTranslationProjection({
      states,
      projectionTarget: "docs_chunk",
      sourceId: "document_markdown:docs/current.md",
      docPath: "docs/current.md",
      chunkId: "u0001",
      regionId: "docs-viewer:u0001",
      targetLanguage: "es",
    })).toMatchObject({
      displayText: "Primer parrafo",
      chunkId: "u0001",
      regionId: "docs-viewer:u0001",
      answerAuthority: false,
      terminalEligible: false,
    });
  });

  it("selects the newest visible projection by source event before late observation time", () => {
    const states = buildHelixVisibleTranslationProjections({
      capability_lane_projection_receipts: [
        docsHoverReceipt({
          receipt_ref: "receipt:docs:hover:new-source",
          observation_ref: "obs:docs:hover:new-source",
          translated_text: "Texto actual",
          source_event_id: "docs-hover:event-new",
          source_event_ms: 500,
          observed_at_ms: 550,
        }),
        docsHoverReceipt({
          receipt_ref: "receipt:docs:hover:old-source-late",
          observation_ref: "obs:docs:hover:old-source-late",
          translated_text: "Texto anterior",
          source_event_id: "docs-hover:event-old",
          source_event_ms: 400,
          observed_at_ms: 800,
        }),
      ],
    });

    expect(selectHelixVisibleTranslationProjection({
      states,
      projectionTarget: "docs_hover",
      sourceId: "document_markdown:docs/current.md#docs-viewer:hover:u0002",
      docPath: "docs/current.md",
      targetLanguage: "es",
    })).toMatchObject({
      displayText: "Texto actual",
      sourceEventId: "docs-hover:event-new",
      sourceEventMs: 500,
      observedAtMs: 550,
      receiptRef: "receipt:docs:hover:new-source",
      answerAuthority: false,
      terminalEligible: false,
    });
  });

  it("does not let newer non-displayable visible receipts hide ready translated text", () => {
    const states = buildHelixVisibleTranslationProjections({
      capability_lane_projection_receipts: [
        docsHoverReceipt({
          projection_key: "docs-hover:current:es:ready",
          receipt_ref: "receipt:docs:hover:ready",
          observation_ref: "obs:docs:hover:ready",
          translated_text: "Texto visible",
          source_event_id: "docs-hover:event-ready",
          source_event_ms: 500,
          observed_at_ms: 550,
        }),
        docsHoverReceipt({
          projection_key: "docs-hover:current:es:failed-newer",
          receipt_ref: "receipt:docs:hover:failed-newer",
          observation_ref: "obs:docs:hover:failed-newer",
          projection_status: "failed",
          translated_text: null,
          source_event_id: "docs-hover:event-failed",
          source_event_ms: 600,
          observed_at_ms: 650,
        }),
        docsHoverReceipt({
          projection_key: "docs-hover:current:es:cancelled-newer",
          receipt_ref: "receipt:docs:hover:cancelled-newer",
          observation_ref: "obs:docs:hover:cancelled-newer",
          projection_status: "cancelled",
          translated_text: null,
          source_event_id: "docs-hover:event-cancelled",
          source_event_ms: 700,
          observed_at_ms: 750,
        }),
      ],
    });

    expect(selectHelixVisibleTranslationProjection({
      states,
      projectionTarget: "docs_hover",
      sourceId: "document_markdown:docs/current.md#docs-viewer:hover:u0002",
      docPath: "docs/current.md",
      regionId: "docs-viewer:hover:u0002",
      chunkId: "docs-viewer:hover:u0002",
      targetLanguage: "es",
    })).toMatchObject({
      status: "projected",
      displayText: "Texto visible",
      sourceEventId: "docs-hover:event-ready",
      sourceEventMs: 500,
      observationRef: "obs:docs:hover:ready",
      receiptRef: "receipt:docs:hover:ready",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });
});
