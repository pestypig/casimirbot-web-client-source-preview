/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it } from "vitest";
import { hashDocumentSource, type DocumentTranslationUnit } from "@shared/document-translation";
import { HELIX_ASK_LIVE_EVENT_BUS_EVENT } from "@/lib/helix/liveEventsBus";
import { buildHelixLiveTranslationProjectionEventPayloads } from "@/lib/helix/live-translation-projection";
import { installDocumentLiveTranslationProjectionEventIngestion } from "@/lib/docs/liveTranslationProjectionEventIngestion";
import {
  clearDocumentLiveTranslationProjectionRegistry,
  readDocumentLiveTranslationProjectionSnapshot,
  summarizeDocumentLiveTranslationProjectionSnapshot,
} from "@/lib/docs/liveTranslationProjectionRegistry";

const unit = (unitId: string): DocumentTranslationUnit => ({
  unit_id: unitId,
  kind: "paragraph",
  source_markdown: `Source ${unitId}`,
  translatable: true,
  protected_spans: [],
});

const eventProjectionMeta = {
  chunkId: "u0001",
  chunkIndex: 0,
  dedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
  sourceEventId: "source-event:docs:u0001",
  sourceEventMs: 90,
  observedAtMs: 100,
  laneSessionId: "lane-session-docs",
  observationLaneSessionId: "lane-session-docs",
  goalBindingId: "goal-binding-translate-docs",
  sourceBindingKey: "docs:nhm2::fnv1a32:current::docs_chunk::es::es",
  latestSourceBindingKey: "docs:nhm2::fnv1a32:current::docs_chunk::es::es",
  latestObservationKey: "docs:nhm2::fnv1a32:current::docs_chunk::es::u0001::obs:docs:u1",
  latestMailLoopObservationKey: "docs:nhm2::fnv1a32:current::docs_chunk::es::u0001::receipt:docs:u1",
  goalBindingKey: "goal:translate-docs::goal-binding-translate-docs::lane-session-docs::live_translation",
  latestEventId: "lane-session-docs:observation_recorded:100",
  hasObservation: true,
  selectedBackendProvider: "live_translation.local_runtime",
  freshnessStatus: "fresh",
  terminalAuthorityStatus: "not_terminal_authority",
  sourceId: "document_markdown:docs/research/nhm2.md",
  sourceTextHash: "source-text-hash-event",
  sourceKind: "docs",
  accountLocale: "es",
  projectionTarget: "docs_chunk",
  targetLanguage: "es",
  cancelRequested: false,
  contextRole: "tool_evidence",
  answerAuthority: false,
};

describe("document live translation projection event ingestion", () => {
  beforeEach(() => {
    clearDocumentLiveTranslationProjectionRegistry();
  });

  it("ingests matching Ask live-event translation projections for a document", () => {
    const target = new EventTarget();
    const unsubscribe = installDocumentLiveTranslationProjectionEventIngestion({
      eventTarget: target,
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
    });

    target.dispatchEvent(new CustomEvent(HELIX_ASK_LIVE_EVENT_BUS_EVENT, {
      detail: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "receipt:docs:u1",
          text: "UI translation projection.",
          meta: {
            source_event_type: "ui_translation_projection",
            lane: "live_translation",
            sourceId: "document_markdown:docs/research/nhm2.md",
            latestProjectionTarget: "docs_chunk",
            latestChunkId: "u0001",
            latestChunkIndex: 0,
            latestDedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
            latestSourceEventId: "source-event:docs:u0001",
            latestSourceEventMs: 90,
            latestObservedAtMs: 100,
            latestFreshnessStatus: "fresh",
            laneSessionId: "lane-session-docs",
            observationLaneSessionId: "lane-session-docs",
            goalBindingId: "goal-binding-translate-docs",
            sourceBindingKey: "docs:nhm2::fnv1a32:current::docs_chunk::es::es",
            latestObservationKey: "docs:nhm2::fnv1a32:current::docs_chunk::es::u0001::obs:docs:u1",
            latestMailLoopObservationKey: "docs:nhm2::fnv1a32:current::docs_chunk::es::u0001::receipt:docs:u1",
            goalBindingKey: "goal:translate-docs::goal-binding-translate-docs::lane-session-docs::live_translation",
            latestEventId: "lane-session-docs:observation_recorded:100",
            hasObservation: true,
            selectedBackendProvider: "live_translation.local_runtime",
            sourceTextHash: "source-text-hash-event",
            sourceKind: "docs",
            accountLocale: "es",
            targetLanguage: "es",
            translatedText: "Texto desde evento.",
            projectionStatus: "projected",
            receiptRef: "receipt:docs:u1",
            observationRef: "obs:docs:u1",
          },
        },
      },
    }));

    const snapshot = readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
    });
    expect(snapshot.translations.u0001).toEqual({
      status: "ready",
      text: "Texto desde evento.",
      observationRef: "obs:docs:u1",
      receiptRef: "receipt:docs:u1",
      projectionStatus: "projected",
      ...eventProjectionMeta,
      source: "capability_lane",
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(snapshot)).toMatchObject({
      latestProjectionKey:
        "document_markdown:docs/research/nhm2.md::source-text-hash-event::docs_chunk::es::u0001::receipt:docs:u1",
      latestSourceTextHash: "source-text-hash-event",
    });

    unsubscribe();
    target.dispatchEvent(new CustomEvent(HELIX_ASK_LIVE_EVENT_BUS_EVENT, {
      detail: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "receipt:docs:u1:new",
          text: "UI translation projection.",
          meta: {
            source_event_type: "ui_translation_projection",
            lane: "live_translation",
            sourceId: "document_markdown:docs/research/nhm2.md",
            latestProjectionTarget: "docs_chunk",
            latestChunkId: "u0001",
            latestObservedAtMs: 200,
            targetLanguage: "es",
            translatedText: "Texto despues de cancelar.",
            projectionStatus: "projected",
          },
        },
      },
    }));

    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
    }).translations.u0001).toEqual({
      status: "ready",
      text: "Texto desde evento.",
      observationRef: "obs:docs:u1",
      receiptRef: "receipt:docs:u1",
      projectionStatus: "projected",
      ...eventProjectionMeta,
      source: "capability_lane",
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("ingests Ask one-shot projection receipts for chunk-scoped document source ids", () => {
    const target = new EventTarget();
    const unsubscribe = installDocumentLiveTranslationProjectionEventIngestion({
      eventTarget: target,
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "sha256:full-document-hash",
      units: [unit("visible-chunk-1")],
    });

    target.dispatchEvent(new CustomEvent(HELIX_ASK_LIVE_EVENT_BUS_EVENT, {
      detail: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "ask:visible-title:receipt",
          text: "Ask one-shot visible title projection.",
          meta: {
            source_event_type: "lane_projection_receipt",
            lane: "live_translation",
            sourceId: "document_markdown:docs/research/nhm2.md#visible-chunk-1",
            doc_path: "docs/research/nhm2.md",
            latestProjectionTarget: "docs_chunk",
            latestChunkId: "visible-chunk-1",
            latestChunkIndex: 0,
            latestDedupeKey: "document_markdown:docs/research/nhm2.md:visible-chunk-1:es",
            latestObservedAtMs: 120,
            latestFreshnessStatus: "fresh",
            sourceTextHash: "sha256:visible-title",
            sourceKind: "docs_viewer",
            accountLocale: "es",
            targetLanguage: "es",
            translatedText: "Titulo visible.",
            projectionStatus: "projected",
            receiptRef: "ask:visible-title:receipt",
            observationRef: "ask:visible-title:observation",
            selectedBackendProvider: "live_translation.local_runtime",
            terminalAuthorityStatus: "not_terminal_authority",
          },
        },
      },
    }));

    const snapshot = readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "sha256:full-document-hash",
    });
    expect(snapshot.translations["visible-chunk-1"]).toMatchObject({
      status: "ready",
      text: "Titulo visible.",
      sourceId: "document_markdown:docs/research/nhm2.md#visible-chunk-1",
      sourceHash: "sha256:full-document-hash",
      sourceKind: "docs",
      sourceTextHash: "sha256:visible-title",
      chunkId: "visible-chunk-1",
      projectionTarget: "docs_chunk",
      targetLanguage: "es",
      observationRef: "ask:visible-title:observation",
      receiptRef: "ask:visible-title:receipt",
      source: "capability_lane",
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });

    target.dispatchEvent(new CustomEvent(HELIX_ASK_LIVE_EVENT_BUS_EVENT, {
      detail: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "ask:other-doc:receipt",
          text: "Wrong document projection.",
          meta: {
            source_event_type: "lane_projection_receipt",
            lane: "live_translation",
            sourceId: "document_markdown:docs/research/other.md#visible-chunk-1",
            doc_path: "docs/research/other.md",
            latestProjectionTarget: "docs_chunk",
            latestChunkId: "visible-chunk-1",
            targetLanguage: "es",
            translatedText: "Texto equivocado.",
            projectionStatus: "projected",
            receiptRef: "ask:other-doc:receipt",
          },
        },
      },
    }));

    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "sha256:full-document-hash",
    }).translations["visible-chunk-1"]?.text).toBe("Titulo visible.");

    unsubscribe();
  });

  it("ingests projection events built from completed Ask lane receipts", () => {
    const target = new EventTarget();
    const unsubscribe = installDocumentLiveTranslationProjectionEventIngestion({
      eventTarget: target,
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "sha256:full-document-hash",
      sourceTextHash: "sha256:full-document-text",
      sourceTextCharCount: 2048,
      units: [unit("visible-chunk-1")],
    });
    const chunkSourceTextHash = hashDocumentSource("Source visible-chunk-1");

    const [eventPayload] = buildHelixLiveTranslationProjectionEventPayloads({
      contextId: "helix-ask:desktop",
      traceId: "turn:visible-translation",
      nowMs: 200,
      payload: {
        debug: {
          capability_lane_projection_receipts: [
            {
              schema: "helix.live_translation.projection_receipt.v1",
              lane_id: "live_translation",
              capability: "live_translation.translate_text",
              projection_target: "docs_chunk",
              projection_status: "projected",
              source_id: "document_markdown:docs/research/nhm2.md#visible-chunk-1",
              doc_path: "docs/research/nhm2.md",
              bbox: { x: 16, y: 24, width: 320, height: 48, source: "visible-doc-title" },
              source_hash: "sha256:full-document-hash",
              source_kind: "docs_viewer",
              source_text_hash: chunkSourceTextHash,
              source_text_char_count: "Source visible-chunk-1".length,
              account_locale: "es",
              target_language: "es",
              chunk_id: "visible-chunk-1",
              chunk_index: 0,
              dedupe_key: "document_markdown:docs/research/nhm2.md:visible-chunk-1:es",
              observed_at_ms: 180,
              freshness_status: "fresh",
              translated_text: "Titulo visible desde Ask.",
              observation_ref: "ask:visible-title:observation",
              receipt_ref: "ask:visible-title:receipt",
              selected_runtime_agent_provider: "codex",
              selected_backend_provider: "live_translation.local_runtime",
              terminal_authority_status: "not_terminal_authority",
              answer_authority: false,
              terminal_eligible: false,
              assistant_answer: false,
              raw_content_included: false,
            },
          ],
        },
      },
    });

    expect(eventPayload).toBeDefined();
    target.dispatchEvent(new CustomEvent(HELIX_ASK_LIVE_EVENT_BUS_EVENT, {
      detail: eventPayload,
    }));

    const snapshot = readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "sha256:full-document-hash",
    });
    expect(snapshot.translations["visible-chunk-1"]).toMatchObject({
      status: "ready",
      text: "Titulo visible desde Ask.",
      sourceId: "document_markdown:docs/research/nhm2.md#visible-chunk-1",
      sourceHash: "sha256:full-document-hash",
      sourceKind: "docs",
      sourceTextHash: chunkSourceTextHash,
      sourceTextCharCount: "Source visible-chunk-1".length,
      chunkId: "visible-chunk-1",
      chunkIndex: 0,
      bbox: { x: 16, y: 24, width: 320, height: 48, source: "visible-doc-title" },
      projectionTarget: "docs_chunk",
      targetLanguage: "es",
      observationRef: "ask:visible-title:observation",
      receiptRef: "ask:visible-title:receipt",
      selectedBackendProvider: "live_translation.local_runtime",
      source: "capability_lane",
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });

    unsubscribe();
  });

  it("ingests explicit Ask document projections even when target language differs from account locale", () => {
    const target = new EventTarget();
    const unsubscribe = installDocumentLiveTranslationProjectionEventIngestion({
      eventTarget: target,
      docPath: "docs/research/nhm2.md",
      locale: "en",
      sourceHash: "sha256:full-document-hash",
      units: [unit("visible-chunk-1")],
    });

    target.dispatchEvent(new CustomEvent(HELIX_ASK_LIVE_EVENT_BUS_EVENT, {
      detail: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "ask:visible-title:receipt",
          text: "Ask one-shot visible title projection.",
          meta: {
            source_event_type: "lane_projection_receipt",
            lane: "live_translation",
            sourceId: "document_markdown:docs/research/nhm2.md#visible-chunk-1",
            doc_path: "docs/research/nhm2.md",
            latestProjectionTarget: "docs_chunk",
            latestChunkId: "visible-chunk-1",
            latestChunkIndex: 0,
            latestObservedAtMs: 120,
            latestFreshnessStatus: "fresh",
            sourceTextHash: "sha256:visible-title",
            sourceKind: "docs_viewer",
            accountLocale: "en",
            targetLanguage: "es",
            translatedText: "Titulo visible.",
            projectionStatus: "projected",
            receiptRef: "ask:visible-title:receipt",
            observationRef: "ask:visible-title:observation",
            selectedBackendProvider: "live_translation.local_runtime",
            terminalAuthorityStatus: "not_terminal_authority",
          },
        },
      },
    }));

    const snapshot = readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "en",
      sourceHash: "sha256:full-document-hash",
    });
    expect(snapshot.translations["visible-chunk-1"]).toMatchObject({
      status: "ready",
      text: "Titulo visible.",
      accountLocale: "en",
      targetLanguage: "es",
      sourceId: "document_markdown:docs/research/nhm2.md#visible-chunk-1",
      sourceHash: "sha256:full-document-hash",
      sourceTextHash: "sha256:visible-title",
      observationRef: "ask:visible-title:observation",
      receiptRef: "ask:visible-title:receipt",
      source: "capability_lane",
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });

    unsubscribe();
  });

  it("accepts camelCase Ask live-event type metadata for translation projections", () => {
    const target = new EventTarget();
    const unsubscribe = installDocumentLiveTranslationProjectionEventIngestion({
      eventTarget: target,
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:current",
      units: [unit("u0001")],
    });

    target.dispatchEvent(new CustomEvent(HELIX_ASK_LIVE_EVENT_BUS_EVENT, {
      detail: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "receipt:docs:u1:camel",
          text: "UI translation projection.",
          meta: {
            sourceEventType: "ui_translation_projection",
            lane: "live_translation",
            sourceId: "document_markdown:docs/research/nhm2.md",
            sourceHash: "fnv1a32:current",
            latestProjectionTarget: "docs_chunk",
            latestChunkId: "u0001",
            latestObservedAtMs: 100,
            latestFreshnessStatus: "fresh",
            targetLanguage: "es",
            translatedText: "Texto desde evento camel.",
            projectionStatus: "projected",
            receiptRef: "receipt:docs:u1:camel",
            observationRef: "obs:docs:u1:camel",
          },
        },
      },
    }));

    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:current",
    }).translations.u0001).toMatchObject({
      status: "ready",
      text: "Texto desde evento camel.",
      sourceHash: "fnv1a32:current",
      observationRef: "obs:docs:u1:camel",
      receiptRef: "receipt:docs:u1:camel",
      source: "capability_lane",
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });

    unsubscribe();
  });

  it("honors source-text scope for Ask live-event translation projections when provided", () => {
    const target = new EventTarget();
    const unsubscribe = installDocumentLiveTranslationProjectionEventIngestion({
      eventTarget: target,
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:current",
      sourceTextHash: "source-text-current",
      sourceTextCharCount: 21,
      units: [unit("u0001")],
    });

    const dispatchProjection = (sourceTextHash: string, text: string) => {
      target.dispatchEvent(new CustomEvent(HELIX_ASK_LIVE_EVENT_BUS_EVENT, {
        detail: {
          contextId: "helix-ask:desktop",
          entry: {
            id: `receipt:docs:u1:${sourceTextHash}`,
            text: "UI translation projection.",
            meta: {
              sourceEventType: "ui_translation_projection",
              lane: "live_translation",
              sourceId: "document_markdown:docs/research/nhm2.md",
              sourceHash: "fnv1a32:current",
              sourceTextHash,
              sourceTextCharCount: sourceTextHash === "source-text-current" ? 21 : 18,
              latestProjectionTarget: "docs_chunk",
              latestChunkId: "u0001",
              latestObservedAtMs: sourceTextHash === "source-text-current" ? 200 : 100,
              targetLanguage: "es",
              translatedText: text,
              projectionStatus: "projected",
              receiptRef: `receipt:docs:u1:${sourceTextHash}`,
              observationRef: `obs:docs:u1:${sourceTextHash}`,
            },
          },
        },
      }));
    };

    dispatchProjection("source-text-old", "Texto anterior.");
    const staleSnapshot = readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:current",
    });
    expect(staleSnapshot.translations.u0001).toMatchObject({
      status: "error",
      error: "translation_projection_source_text_mismatch",
      projectionStatus: "missing",
      sourceHash: "fnv1a32:current",
      sourceTextHash: "source-text-current",
      sourceTextCharCount: 21,
      observationRef: "obs:docs:u1:source-text-old",
      receiptRef: "receipt:docs:u1:source-text-old",
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(staleSnapshot.translations.u0001.text).toBeUndefined();

    dispatchProjection("source-text-current", "Texto actual.");
    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:current",
    }).translations.u0001).toMatchObject({
      status: "ready",
      text: "Texto actual.",
      sourceHash: "fnv1a32:current",
      sourceTextHash: "source-text-current",
      sourceTextCharCount: 21,
      observationRef: "obs:docs:u1:source-text-current",
      receiptRef: "receipt:docs:u1:source-text-current",
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });

    unsubscribe();
  });

  it("honors source-identity scope for Ask live-event translation projections when provided", () => {
    const target = new EventTarget();
    const sourceIdentityKey = "document_markdown:docs/research/nhm2.md::fnv1a32:current::source-text-current::21::docs::docs_chunk::es::es";
    const unsubscribe = installDocumentLiveTranslationProjectionEventIngestion({
      eventTarget: target,
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:current",
      sourceIdentityKey,
      units: [unit("u0001")],
    });

    const dispatchProjection = (input: {
      sourceIdentityKey: string;
      identityField?: "sourceIdentityKey" | "latest_source_identity_key";
      text: string;
      observedAtMs: number;
      suffix: string;
    }) => {
      const identityField = input.identityField ?? "sourceIdentityKey";
      target.dispatchEvent(new CustomEvent(HELIX_ASK_LIVE_EVENT_BUS_EVENT, {
        detail: {
          contextId: "helix-ask:desktop",
          entry: {
            id: `receipt:docs:u1:${input.suffix}`,
            text: "UI translation projection.",
            meta: {
              sourceEventType: "ui_translation_projection",
              lane: "live_translation",
              sourceId: "document_markdown:docs/research/nhm2.md",
              sourceHash: "fnv1a32:current",
              [identityField]: input.sourceIdentityKey,
              latestProjectionTarget: "docs_chunk",
              latestChunkId: "u0001",
              latestObservedAtMs: input.observedAtMs,
              targetLanguage: "es",
              translatedText: input.text,
              projectionStatus: "projected",
              receiptRef: `receipt:docs:u1:${input.suffix}`,
              observationRef: `obs:docs:u1:${input.suffix}`,
            },
          },
        },
      }));
    };

    dispatchProjection({
      sourceIdentityKey: "document_markdown:docs/research/nhm2.md::fnv1a32:previous::source-text-old::18::docs::docs_chunk::es::es",
      text: "Texto anterior.",
      observedAtMs: 100,
      suffix: "old-identity",
    });

    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:current",
      sourceIdentityKey,
    }).translations.u0001).toMatchObject({
      status: "error",
      error: "translation_projection_source_identity_mismatch",
      projectionStatus: "missing",
      sourceHash: "fnv1a32:current",
      sourceIdentityKey,
      observationRef: "obs:docs:u1:old-identity",
      receiptRef: "receipt:docs:u1:old-identity",
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });

    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:current",
    }).translations.u0001).toBeUndefined();

    dispatchProjection({
      sourceIdentityKey,
      identityField: "latest_source_identity_key",
      text: "Texto actual.",
      observedAtMs: 200,
      suffix: "current-identity",
    });

    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:current",
      sourceIdentityKey,
    }).translations.u0001).toMatchObject({
      status: "ready",
      text: "Texto actual.",
      sourceHash: "fnv1a32:current",
      sourceIdentityKey,
      latestSourceIdentityKey: sourceIdentityKey,
      observationRef: "obs:docs:u1:current-identity",
      receiptRef: "receipt:docs:u1:current-identity",
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });

    unsubscribe();
  });

  it("accepts chunk-level source identities when the listener is scoped by document source hash", () => {
    const target = new EventTarget();
    const unsubscribe = installDocumentLiveTranslationProjectionEventIngestion({
      eventTarget: target,
      docPath: "docs/research/nhm2.md",
      locale: "es-US",
      sourceHash: "fnv1a32:current-document",
      units: [unit("u0001")],
    });

    target.dispatchEvent(new CustomEvent(HELIX_ASK_LIVE_EVENT_BUS_EVENT, {
      detail: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "receipt:docs:u1:chunk-identity",
          text: "UI translation projection.",
          meta: {
            sourceEventType: "ui_translation_projection",
            lane: "live_translation",
            sourceId: "document_markdown:docs/research/nhm2.md",
            sourceHash: "fnv1a32:current-document",
            sourceTextHash: "fnv1a32:visible-chunk",
            sourceTextCharCount: 17,
            sourceIdentityKey:
              "document_markdown:docs/research/nhm2.md::fnv1a32:current-document::fnv1a32:visible-chunk::17::docs::docs_chunk::es-US::es-US",
            latestProjectionTarget: "docs_chunk",
            latestChunkId: "u0001",
            latestObservedAtMs: 210,
            targetLanguage: "es-US",
            translatedText: "Texto del fragmento.",
            projectionStatus: "projected",
            receiptRef: "receipt:docs:u1:chunk-identity",
            observationRef: "obs:docs:u1:chunk-identity",
            terminalAuthorityStatus: "not_terminal_authority",
            answerAuthority: false,
            terminalEligible: false,
            assistantAnswer: false,
            rawContentIncluded: false,
          },
        },
      },
    }));

    const snapshot = readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es-US",
      sourceHash: "fnv1a32:current-document",
    });
    expect(snapshot.translations.u0001).toMatchObject({
      status: "ready",
      text: "Texto del fragmento.",
      sourceHash: "fnv1a32:current-document",
      sourceTextHash: "fnv1a32:visible-chunk",
      sourceIdentityKey:
        "document_markdown:docs/research/nhm2.md::fnv1a32:current-document::fnv1a32:visible-chunk::17::docs::docs_chunk::es-US::es-US",
      observationRef: "obs:docs:u1:chunk-identity",
      receiptRef: "receipt:docs:u1:chunk-identity",
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });

    unsubscribe();
  });

  it("accepts source projection target aliases for Ask live-event translation projections", () => {
    const target = new EventTarget();
    const unsubscribe = installDocumentLiveTranslationProjectionEventIngestion({
      eventTarget: target,
      docPath: "docs/research/nhm2.md",
      locale: "es",
      projectionTarget: "docs_chunk",
      units: [unit("u0001")],
    });

    target.dispatchEvent(new CustomEvent(HELIX_ASK_LIVE_EVENT_BUS_EVENT, {
      detail: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "receipt:docs:u1:source-projection-target",
          text: "UI translation projection.",
          meta: {
            source_event_type: "ui_translation_projection",
            lane: "live_translation",
            sourceId: "document_markdown:docs/research/nhm2.md",
            sourceProjectionTarget: "docs_selection",
            latestChunkId: "u0001",
            latestChunkIndex: 4,
            latestDedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es:selection",
            latestObservedAtMs: 125,
            latestFreshnessStatus: "fresh",
            targetLanguage: "es",
            translatedText: "Texto desde seleccion.",
            projectionStatus: "projected",
            receiptRef: "receipt:docs:u1:source-projection-target",
            observationRef: "obs:docs:u1:source-projection-target",
          },
        },
      },
    }));

    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      projectionTarget: "docs_chunk",
    }).translations.u0001).toBeUndefined();
    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      projectionTarget: "docs_selection",
    }).translations.u0001).toMatchObject({
      status: "ready",
      text: "Texto desde seleccion.",
      projectionTarget: "docs_selection",
      chunkId: "u0001",
      chunkIndex: 4,
      dedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es:selection",
      observationRef: "obs:docs:u1:source-projection-target",
      receiptRef: "receipt:docs:u1:source-projection-target",
      source: "capability_lane",
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });

    unsubscribe();
  });

  it("normalizes legacy inline projection targets to document chunk projections", () => {
    const target = new EventTarget();
    const unsubscribe = installDocumentLiveTranslationProjectionEventIngestion({
      eventTarget: target,
      docPath: "docs/research/nhm2.md",
      locale: "es",
      projectionTarget: "docs_chunk",
      units: [unit("u0001")],
    });

    target.dispatchEvent(new CustomEvent(HELIX_ASK_LIVE_EVENT_BUS_EVENT, {
      detail: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "receipt:docs:u1:legacy-inline-target",
          text: "Legacy inline translation projection.",
          meta: {
            source_event_type: "ui_translation_projection",
            lane: "live_translation",
            sourceId: "document_markdown:docs/research/nhm2.md",
            latestProjectionTarget: "docs_viewer_inline",
            latestChunkId: "u0001",
            latestObservedAtMs: 135,
            latestFreshnessStatus: "fresh",
            targetLanguage: "es",
            translatedText: "Texto heredado.",
            projectionStatus: "projected",
            receiptRef: "receipt:docs:u1:legacy-inline-target",
            observationRef: "obs:docs:u1:legacy-inline-target",
          },
        },
      },
    }));

    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      projectionTarget: "docs_chunk",
    }).translations.u0001).toMatchObject({
      status: "ready",
      text: "Texto heredado.",
      projectionTarget: "docs_chunk",
      observationRef: "obs:docs:u1:legacy-inline-target",
      receiptRef: "receipt:docs:u1:legacy-inline-target",
      terminalEligible: false,
      assistantAnswer: false,
    });
    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      projectionTarget: "docs_viewer_inline",
    }).translations.u0001).toMatchObject({
      status: "ready",
      text: "Texto heredado.",
      projectionTarget: "docs_chunk",
    });

    unsubscribe();
  });

  it("passes stale display policy through live-event projection ingestion", () => {
    const target = new EventTarget();
    const unsubscribe = installDocumentLiveTranslationProjectionEventIngestion({
      eventTarget: target,
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      allowStaleDisplayText: true,
    });

    target.dispatchEvent(new CustomEvent(HELIX_ASK_LIVE_EVENT_BUS_EVENT, {
      detail: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "receipt:docs:u1:stale",
          text: "UI translation projection.",
          meta: {
            source_event_type: "ui_translation_projection",
            lane: "live_translation",
            sourceId: "document_markdown:docs/research/nhm2.md",
            latestProjectionTarget: "docs_chunk",
            latestChunkId: "u0001",
            latestObservedAtMs: 100,
            latestFreshnessStatus: "stale",
            targetLanguage: "es",
            translatedText: "Texto obsoleto visible.",
            projectionStatus: "stale",
            receiptRef: "receipt:docs:u1:stale",
            observationRef: "obs:docs:u1:stale",
          },
        },
      },
    }));

    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
    }).translations.u0001).toMatchObject({
      status: "ready",
      text: "Texto obsoleto visible.",
      observationRef: "obs:docs:u1:stale",
      receiptRef: "receipt:docs:u1:stale",
      projectionStatus: "stale",
      freshnessStatus: "stale",
      source: "capability_lane",
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });

    unsubscribe();
  });

  it("requires matching source hash for scoped Ask live-event translation projections", () => {
    const target = new EventTarget();
    const unsubscribe = installDocumentLiveTranslationProjectionEventIngestion({
      eventTarget: target,
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:current",
      units: [unit("u0001")],
    });

    const dispatchProjection = (sourceHash?: string) => {
      target.dispatchEvent(new CustomEvent(HELIX_ASK_LIVE_EVENT_BUS_EVENT, {
        detail: {
          contextId: "helix-ask:desktop",
          entry: {
            id: `receipt:docs:u1:${sourceHash ?? "missing"}`,
            text: "UI translation projection.",
            meta: {
              source_event_type: "ui_translation_projection",
              lane: "live_translation",
              sourceId: "document_markdown:docs/research/nhm2.md",
              ...(sourceHash ? { sourceHash } : {}),
              latestProjectionTarget: "docs_chunk",
              latestChunkId: "u0001",
              latestObservedAtMs: sourceHash === "fnv1a32:current" ? 300 : 100,
              latestFreshnessStatus: "fresh",
              targetLanguage: "es",
              translatedText: sourceHash === "fnv1a32:current" ? "Texto actual." : "Texto equivocado.",
              projectionStatus: "projected",
              receiptRef: `receipt:docs:u1:${sourceHash ?? "missing"}`,
              observationRef: `obs:docs:u1:${sourceHash ?? "missing"}`,
            },
          },
        },
      }));
    };

    dispatchProjection();
    dispatchProjection("fnv1a32:old");

    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:current",
    }).translations).toEqual({});

    dispatchProjection("fnv1a32:current");

    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:current",
    }).translations.u0001).toMatchObject({
      status: "ready",
      text: "Texto actual.",
      sourceHash: "fnv1a32:current",
      observationRef: "obs:docs:u1:fnv1a32:current",
      receiptRef: "receipt:docs:u1:fnv1a32:current",
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });

    unsubscribe();
  });

  it("keeps a newer ready projection when an older Ask live-event projection arrives late", () => {
    const target = new EventTarget();
    const unsubscribe = installDocumentLiveTranslationProjectionEventIngestion({
      eventTarget: target,
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:current",
      units: [unit("u0001")],
    });

    const dispatchProjection = (input: {
      suffix: string;
      text: string;
      observedAtMs: number;
      sourceEventMs: number;
    }) => {
      target.dispatchEvent(new CustomEvent(HELIX_ASK_LIVE_EVENT_BUS_EVENT, {
        detail: {
          contextId: "helix-ask:desktop",
          entry: {
            id: `receipt:docs:u1:${input.suffix}`,
            text: "UI translation projection.",
            meta: {
              source_event_type: "ui_translation_projection",
              lane: "live_translation",
              sourceId: "document_markdown:docs/research/nhm2.md",
              sourceHash: "fnv1a32:current",
              latestProjectionTarget: "docs_chunk",
              latestChunkId: "u0001",
              latestChunkIndex: 0,
              latestDedupeKey: `document_markdown:docs/research/nhm2.md:u0001:es:${input.suffix}`,
              latestSourceEventId: `source-event:docs:u0001:${input.suffix}`,
              latestSourceEventMs: input.sourceEventMs,
              latestObservedAtMs: input.observedAtMs,
              latestFreshnessStatus: "fresh",
              targetLanguage: "es",
              translatedText: input.text,
              projectionStatus: "projected",
              receiptRef: `receipt:docs:u1:${input.suffix}`,
              observationRef: `obs:docs:u1:${input.suffix}`,
            },
          },
        },
      }));
    };

    dispatchProjection({
      suffix: "newer",
      text: "Texto nuevo.",
      observedAtMs: 300,
      sourceEventMs: 250,
    });
    dispatchProjection({
      suffix: "older",
      text: "Texto viejo.",
      observedAtMs: 200,
      sourceEventMs: 150,
    });

    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:current",
    }).translations.u0001).toMatchObject({
      status: "ready",
      text: "Texto nuevo.",
      observationRef: "obs:docs:u1:newer",
      receiptRef: "receipt:docs:u1:newer",
      sourceEventId: "source-event:docs:u0001:newer",
      sourceEventMs: 250,
      observedAtMs: 300,
      projectionStatus: "projected",
      freshnessStatus: "fresh",
      source: "capability_lane",
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });

    unsubscribe();
  });

  it("ingests matching Ask live-event lane sessions without projecting text", () => {
    const target = new EventTarget();
    const unsubscribe = installDocumentLiveTranslationProjectionEventIngestion({
      eventTarget: target,
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
    });

    target.dispatchEvent(new CustomEvent(HELIX_ASK_LIVE_EVENT_BUS_EVENT, {
      detail: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "lane-session-docs",
          text: "Lane session is running.",
          meta: {
            source_event_type: "lane_session",
            lane: "live_translation",
            laneSessionId: "lane-session-docs",
            sessionStatus: "running",
            sessionHealth: "healthy",
            sourceId: "document_markdown:docs/research/nhm2.md",
            sourceKind: "docs",
            sourceTextHash: "source-text-hash-session",
            sourceTextCharCount: 2048,
            latestProjectionTarget: "docs_chunk",
            accountLocale: "es",
            targetLanguage: "es",
            selectedBackendProvider: "live_translation.local_runtime",
            latestChunkId: "u0001",
            latestChunkIndex: 0,
            latestDedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
            latestSourceEventId: "docs:event:session:1",
            latestSourceEventMs: 90,
            latestObservedAtMs: 100,
            laneSessionSourceBindingKey: "docs:nhm2::session::docs_chunk::es::es",
            laneSessionSourceIdentityKey: "docs:nhm2::session::docs::docs_chunk::es::es",
            observationRef: "obs:lane-session-docs",
            receiptRef: "receipt:lane-session-docs",
            updatedAtMs: 125,
          },
        },
      },
    }));

    const snapshot = readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
    });
    expect(snapshot.translations).toEqual({});
    expect(snapshot.laneSessions["lane-session-docs"]).toMatchObject({
      laneSessionId: "lane-session-docs",
      laneId: "live_translation",
      sessionStatus: "running",
      sessionHealth: "healthy",
      sourceId: "document_markdown:docs/research/nhm2.md",
      sourceKind: "docs",
      sourceTextHash: "source-text-hash-session",
      sourceTextCharCount: 2048,
      projectionTarget: "docs_chunk",
      accountLocale: "es",
      targetLanguage: "es",
      latestChunkId: "u0001",
      latestChunkIndex: 0,
      latestDedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
      latestSourceEventId: "docs:event:session:1",
      latestSourceEventMs: 90,
      latestObservedAtMs: 100,
      sourceBindingKey: "docs:nhm2::session::docs_chunk::es::es",
      sourceIdentityKey: "docs:nhm2::session::docs::docs_chunk::es::es",
      laneSessionSourceBindingKey: "docs:nhm2::session::docs_chunk::es::es",
      laneSessionSourceIdentityKey: "docs:nhm2::session::docs::docs_chunk::es::es",
      lastObservationRef: "obs:lane-session-docs",
      lastReceiptRef: "receipt:lane-session-docs",
      updatedAtMs: 125,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    unsubscribe();
  });

  it("requires matching source hash for scoped Ask live-event lane sessions", () => {
    const target = new EventTarget();
    const unsubscribe = installDocumentLiveTranslationProjectionEventIngestion({
      eventTarget: target,
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:session",
      units: [unit("u0001")],
    });

    const dispatchSession = (sourceHash?: string) => {
      target.dispatchEvent(new CustomEvent(HELIX_ASK_LIVE_EVENT_BUS_EVENT, {
        detail: {
          contextId: "helix-ask:desktop",
          entry: {
            id: `lane-session-docs:${sourceHash ?? "missing"}`,
            text: "Lane session is running.",
            meta: {
              source_event_type: "lane_session",
              lane: "live_translation",
              laneSessionId: "lane-session-docs",
              sessionStatus: "running",
              sessionHealth: "healthy",
              sourceId: "document_markdown:docs/research/nhm2.md",
              ...(sourceHash ? { sourceHash } : {}),
              sourceKind: "docs",
              latestProjectionTarget: "docs_chunk",
              accountLocale: "es",
              targetLanguage: "es",
              selectedBackendProvider: "live_translation.local_runtime",
              latestChunkId: "u0001",
              latestObservedAtMs: sourceHash === "fnv1a32:session" ? 300 : 100,
              observationRef: `obs:lane-session-docs:${sourceHash ?? "missing"}`,
              receiptRef: `receipt:lane-session-docs:${sourceHash ?? "missing"}`,
              updatedAtMs: sourceHash === "fnv1a32:session" ? 325 : 125,
            },
          },
        },
      }));
    };

    dispatchSession();
    dispatchSession("fnv1a32:old");

    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:session",
    }).laneSessions).toEqual({});

    dispatchSession("fnv1a32:session");

    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:session",
    }).laneSessions["lane-session-docs"]).toMatchObject({
      laneSessionId: "lane-session-docs",
      sourceHash: "fnv1a32:session",
      lastObservationRef: "obs:lane-session-docs:fnv1a32:session",
      lastReceiptRef: "receipt:lane-session-docs:fnv1a32:session",
      updatedAtMs: 325,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });

    unsubscribe();
  });

  it("ingests matching Ask live-event lane mail-loop rows without projecting text", () => {
    const target = new EventTarget();
    const unsubscribe = installDocumentLiveTranslationProjectionEventIngestion({
      eventTarget: target,
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
    });

    target.dispatchEvent(new CustomEvent(HELIX_ASK_LIVE_EVENT_BUS_EVENT, {
      detail: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "lane-mail-loop-docs",
          text: "Lane mail loop is pending.",
          meta: {
            source_event_type: "lane_mail_loop",
            lane: "live_translation",
            laneSessionId: "lane-session-docs",
            sourceId: "document_markdown:docs/research/nhm2.md",
            sourceKind: "docs",
            sourceTextHash: "source-text-hash-mail",
            sourceTextCharCount: 2048,
            latestProjectionTarget: "docs_chunk",
            accountLocale: "es",
            latestChunkId: "u0001",
            latestChunkIndex: 0,
            latestDedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
            latestSourceEventId: "docs:event:mail:1",
            latestSourceEventMs: 90,
            latestObservedAtMs: 100,
            latestFreshnessStatus: "fresh",
            targetLanguage: "es",
            stagePlayMailId: "stage-play-mail-translation",
            stagePlayWakeExpected: true,
            mailboxThreadId: "thread-docs-translation",
            mailStatus: "unread",
            selectedBackendProvider: "live_translation.local_runtime",
            observationRef: "obs:lane-mail-loop-docs",
            receiptRef: "receipt:lane-mail-loop-docs",
          },
        },
      },
    }));

    const snapshot = readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
    });
    expect(snapshot.translations).toEqual({});
    expect(snapshot.mailLoops["stage-play-mail-translation"]).toMatchObject({
      mailLoopId: "stage-play-mail-translation",
      laneSessionId: "lane-session-docs",
      laneId: "live_translation",
      stagePlayMailId: "stage-play-mail-translation",
      stagePlayWakeExpected: true,
      stagePlayWakeKind: "mailbox_wake",
      mailboxWakeExpected: true,
      decisionWakeExpected: false,
      mailboxThreadId: "thread-docs-translation",
      mailStatus: "unread",
      selectedBackendProvider: "live_translation.local_runtime",
      sourceId: "document_markdown:docs/research/nhm2.md",
      sourceKind: "docs",
      sourceTextHash: "source-text-hash-mail",
      sourceTextCharCount: 2048,
      projectionTarget: "docs_chunk",
      accountLocale: "es",
      targetLanguage: "es",
      latestChunkId: "u0001",
      latestChunkIndex: 0,
      latestDedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
      latestSourceEventId: "docs:event:mail:1",
      latestSourceEventMs: 90,
      latestObservedAtMs: 100,
      latestFreshnessStatus: "fresh",
      observationRef: "obs:lane-mail-loop-docs",
      receiptRef: "receipt:lane-mail-loop-docs",
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    unsubscribe();
  });

  it("requires matching source hash for scoped Ask live-event lane mail-loop rows", () => {
    const target = new EventTarget();
    const unsubscribe = installDocumentLiveTranslationProjectionEventIngestion({
      eventTarget: target,
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:mail",
      units: [unit("u0001")],
    });

    const dispatchMailLoop = (sourceHash?: string) => {
      target.dispatchEvent(new CustomEvent(HELIX_ASK_LIVE_EVENT_BUS_EVENT, {
        detail: {
          contextId: "helix-ask:desktop",
          entry: {
            id: `lane-mail-loop-docs:${sourceHash ?? "missing"}`,
            text: "Lane mail loop is pending.",
            meta: {
              source_event_type: "lane_mail_loop",
              lane: "live_translation",
              laneSessionId: "lane-session-docs",
              sourceId: "document_markdown:docs/research/nhm2.md",
              ...(sourceHash ? { sourceHash } : {}),
              sourceKind: "docs",
              latestProjectionTarget: "docs_chunk",
              accountLocale: "es",
              latestChunkId: "u0001",
              latestObservedAtMs: sourceHash === "fnv1a32:mail" ? 300 : 100,
              latestFreshnessStatus: "fresh",
              targetLanguage: "es",
              stagePlayMailId: "stage-play-mail-translation",
              stagePlayWakeExpected: true,
              mailboxThreadId: "thread-docs-translation",
              mailStatus: "unread",
              selectedBackendProvider: "live_translation.local_runtime",
              observationRef: `obs:lane-mail-loop-docs:${sourceHash ?? "missing"}`,
              receiptRef: `receipt:lane-mail-loop-docs:${sourceHash ?? "missing"}`,
            },
          },
        },
      }));
    };

    dispatchMailLoop();
    dispatchMailLoop("fnv1a32:old");

    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:mail",
    }).mailLoops).toEqual({});

    dispatchMailLoop("fnv1a32:mail");

    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:mail",
    }).mailLoops["stage-play-mail-translation"]).toMatchObject({
      mailLoopId: "stage-play-mail-translation",
      sourceHash: "fnv1a32:mail",
      observationRef: "obs:lane-mail-loop-docs:fnv1a32:mail",
      receiptRef: "receipt:lane-mail-loop-docs:fnv1a32:mail",
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });

    unsubscribe();
  });

  it("ingests matching Ask live-event goal binding rows without projecting text", () => {
    const target = new EventTarget();
    const unsubscribe = installDocumentLiveTranslationProjectionEventIngestion({
      eventTarget: target,
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
    });

    target.dispatchEvent(new CustomEvent(HELIX_ASK_LIVE_EVENT_BUS_EVENT, {
      detail: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "goal-binding-translate-docs",
          text: "Goal-bound lane session is active.",
          meta: {
            source_event_type: "lane_goal_binding",
            lane: "live_translation",
            goalBindingId: "goal-binding-translate-docs",
            goalId: "goal-account-language",
            laneSessionId: "lane-session-docs",
            bindingStatus: "active",
            sessionStatus: "running",
            sessionHealth: "healthy",
            activationPolicy: "while_goal_active",
            attentionPolicy: "quiet_until_salient",
            stopCondition: "goal_complete",
            reportPolicy: "debug_only",
            quietBehavior: "record_only",
            reportAction: "record_only",
            targetLanguage: "es",
            sourceId: "document_markdown:docs/research/nhm2.md",
            sourceKind: "docs",
            sourceTextHash: "source-text-hash-goal",
            sourceTextCharCount: 2048,
            latestProjectionTarget: "docs_chunk",
            accountLocale: "es",
            latestChunkId: "u0001",
            latestChunkIndex: 0,
            latestDedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
            latestSourceEventId: "docs:event:goal:1",
            latestSourceEventMs: 90,
            latestObservedAtMs: 100,
            latestEventId: "goal-binding-translate-docs:observation_recorded:100",
            hasObservation: true,
            observationRef: "obs:goal-binding-docs",
            receiptRef: "receipt:goal-binding-docs",
          },
        },
      },
    }));

    const snapshot = readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
    });
    expect(snapshot.translations).toEqual({});
    expect(snapshot.goalBindings["goal-binding-translate-docs"]).toMatchObject({
      goalBindingId: "goal-binding-translate-docs",
      goalId: "goal-account-language",
      laneSessionId: "lane-session-docs",
      laneId: "live_translation",
      bindingStatus: "active",
      sessionStatus: "running",
      sessionHealth: "healthy",
      activationPolicy: "while_goal_active",
      attentionPolicy: "quiet_until_salient",
      stopCondition: "goal_complete",
      reportPolicy: "debug_only",
      quietBehavior: "record_only",
      reportAction: "record_only",
      targetLanguage: "es",
      sourceId: "document_markdown:docs/research/nhm2.md",
      sourceKind: "docs",
      sourceTextHash: "source-text-hash-goal",
      sourceTextCharCount: 2048,
      projectionTarget: "docs_chunk",
      accountLocale: "es",
      latestChunkId: "u0001",
      latestChunkIndex: 0,
      latestDedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
      latestSourceEventId: "docs:event:goal:1",
      latestSourceEventMs: 90,
      latestObservedAtMs: 100,
      latestEventId: "goal-binding-translate-docs:observation_recorded:100",
      hasObservation: true,
      observationRef: "obs:goal-binding-docs",
      receiptRef: "receipt:goal-binding-docs",
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    unsubscribe();
  });

  it("ingests receipt-only mail-loop and goal-binding live events as observed non-answer evidence", () => {
    const target = new EventTarget();
    const unsubscribe = installDocumentLiveTranslationProjectionEventIngestion({
      eventTarget: target,
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:receipt-only",
      units: [unit("u0001")],
    });

    target.dispatchEvent(new CustomEvent(HELIX_ASK_LIVE_EVENT_BUS_EVENT, {
      detail: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "lane-mail-loop-docs:receipt-only",
          text: "Lane mail loop produced a projection receipt.",
          meta: {
            source_event_type: "lane_mail_loop",
            lane: "live_translation",
            laneSessionId: "lane-session-docs",
            sourceId: "document_markdown:docs/research/nhm2.md",
            sourceHash: "fnv1a32:receipt-only",
            sourceKind: "docs",
            sourceTextHash: "source-text-hash-receipt-only",
            sourceTextCharCount: 2048,
            latestProjectionTarget: "docs_chunk",
            accountLocale: "es",
            latestChunkId: "u0001",
            latestChunkIndex: 0,
            latestMailLoopObservationKey:
              "docs:nhm2::fnv1a32:receipt-only::docs_chunk::es::u0001::receipt:mail-only",
            targetLanguage: "es",
            stagePlayMailId: "stage-play-mail-translation-receipt-only",
            stagePlayWakeExpected: true,
            mailboxThreadId: "thread-docs-translation",
            mailStatus: "unread",
            hasObservation: false,
            has_observation: false,
            observationRef: undefined,
            observation_ref: undefined,
            receiptRef: "receipt:mail-only",
          },
        },
      },
    }));

    target.dispatchEvent(new CustomEvent(HELIX_ASK_LIVE_EVENT_BUS_EVENT, {
      detail: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "goal-binding-translate-docs:receipt-only",
          text: "Goal-bound lane session recorded a projection receipt.",
          meta: {
            source_event_type: "lane_goal_binding",
            lane: "live_translation",
            goalBindingId: "goal-binding-translate-docs",
            goalId: "goal-account-language",
            laneSessionId: "lane-session-docs",
            bindingStatus: "active",
            sessionStatus: "running",
            sessionHealth: "healthy",
            activationPolicy: "while_goal_active",
            attentionPolicy: "quiet_until_salient",
            stopCondition: "goal_complete",
            reportPolicy: "debug_only",
            quietBehavior: "record_only",
            reportAction: "record_only",
            targetLanguage: "es",
            sourceId: "document_markdown:docs/research/nhm2.md",
            sourceHash: "fnv1a32:receipt-only",
            sourceKind: "docs",
            sourceTextHash: "source-text-hash-receipt-only",
            sourceTextCharCount: 2048,
            latestProjectionTarget: "docs_chunk",
            accountLocale: "es",
            latestChunkId: "u0001",
            latestChunkIndex: 0,
            latestMailLoopObservationKey:
              "docs:nhm2::fnv1a32:receipt-only::docs_chunk::es::u0001::receipt:goal-only",
            hasObservation: false,
            has_observation: false,
            observationRef: undefined,
            observation_ref: undefined,
            receiptRef: "receipt:goal-only",
          },
        },
      },
    }));

    const snapshot = readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:receipt-only",
    });
    expect(snapshot.translations).toEqual({});
    expect(snapshot.mailLoops["stage-play-mail-translation-receipt-only"]).toMatchObject({
      observationRef: null,
      receiptRef: "receipt:mail-only",
      latestMailLoopObservationKey:
        "docs:nhm2::fnv1a32:receipt-only::docs_chunk::es::u0001::receipt:mail-only",
      hasObservation: true,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(snapshot.goalBindings["goal-binding-translate-docs"]).toMatchObject({
      observationRef: null,
      receiptRef: "receipt:goal-only",
      latestMailLoopObservationKey:
        "docs:nhm2::fnv1a32:receipt-only::docs_chunk::es::u0001::receipt:goal-only",
      hasObservation: true,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(snapshot)).toMatchObject({
      observedMailLoopCount: 1,
      observedGoalBindingCount: 1,
      observedLaneActivityCount: 2,
      latestHasObservation: true,
      latestGoalBindingHasObservation: true,
      latestGoalBindingReceiptRef: "receipt:goal-only",
      latestGoalBindingMailLoopObservationKey:
        "docs:nhm2::fnv1a32:receipt-only::docs_chunk::es::u0001::receipt:goal-only",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });

    unsubscribe();
  });

  it("requires matching source hash for scoped Ask live-event goal binding rows", () => {
    const target = new EventTarget();
    const unsubscribe = installDocumentLiveTranslationProjectionEventIngestion({
      eventTarget: target,
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:goal",
      units: [unit("u0001")],
    });

    const dispatchGoalBinding = (sourceHash?: string) => {
      target.dispatchEvent(new CustomEvent(HELIX_ASK_LIVE_EVENT_BUS_EVENT, {
        detail: {
          contextId: "helix-ask:desktop",
          entry: {
            id: `goal-binding-translate-docs:${sourceHash ?? "missing"}`,
            text: "Goal-bound lane session is active.",
            meta: {
              source_event_type: "lane_goal_binding",
              lane: "live_translation",
              goalBindingId: "goal-binding-translate-docs",
              goalId: "goal-account-language",
              laneSessionId: "lane-session-docs",
              bindingStatus: "active",
              sessionStatus: "running",
              sessionHealth: "healthy",
              activationPolicy: "while_goal_active",
              attentionPolicy: "quiet_until_salient",
              stopCondition: "goal_complete",
              reportPolicy: "debug_only",
              quietBehavior: "record_only",
              reportAction: "record_only",
              targetLanguage: "es",
              sourceId: "document_markdown:docs/research/nhm2.md",
              ...(sourceHash ? { sourceHash } : {}),
              sourceKind: "docs",
              latestProjectionTarget: "docs_chunk",
              accountLocale: "es",
              latestChunkId: "u0001",
              latestObservedAtMs: sourceHash === "fnv1a32:goal" ? 300 : 100,
              observationRef: `obs:goal-binding-docs:${sourceHash ?? "missing"}`,
              receiptRef: `receipt:goal-binding-docs:${sourceHash ?? "missing"}`,
            },
          },
        },
      }));
    };

    dispatchGoalBinding();
    dispatchGoalBinding("fnv1a32:old");

    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:goal",
    }).goalBindings).toEqual({});

    dispatchGoalBinding("fnv1a32:goal");

    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:goal",
    }).goalBindings["goal-binding-translate-docs"]).toMatchObject({
      goalBindingId: "goal-binding-translate-docs",
      goalId: "goal-account-language",
      sourceHash: "fnv1a32:goal",
      observationRef: "obs:goal-binding-docs:fnv1a32:goal",
      receiptRef: "receipt:goal-binding-docs:fnv1a32:goal",
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });

    unsubscribe();
  });

  it("requires matching source text identity for scoped session, mail-loop, and goal rows", () => {
    const target = new EventTarget();
    const unsubscribe = installDocumentLiveTranslationProjectionEventIngestion({
      eventTarget: target,
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:current",
      sourceTextHash: "source-text-current",
      sourceTextCharCount: 21,
      units: [unit("u0001")],
    });

    const dispatchLifecycleRows = (sourceTextHash: string, sourceTextCharCount: number, suffix: string) => {
      const commonMeta = {
        lane: "live_translation",
        sourceId: "document_markdown:docs/research/nhm2.md",
        sourceHash: "fnv1a32:current",
        sourceTextHash,
        sourceTextCharCount,
        sourceKind: "docs",
        latestProjectionTarget: "docs_chunk",
        accountLocale: "es",
        targetLanguage: "es",
        latestChunkId: "u0001",
        latestObservedAtMs: suffix === "current" ? 300 : 100,
      };
      target.dispatchEvent(new CustomEvent(HELIX_ASK_LIVE_EVENT_BUS_EVENT, {
        detail: {
          contextId: "helix-ask:desktop",
          entry: {
            id: `lane-session-docs:${suffix}`,
            text: "Lane session is running.",
            meta: {
              ...commonMeta,
              source_event_type: "lane_session",
              laneSessionId: "lane-session-docs",
              sessionStatus: "running",
              sessionHealth: "healthy",
              observationRef: `obs:lane-session-docs:${suffix}`,
              receiptRef: `receipt:lane-session-docs:${suffix}`,
              updatedAtMs: suffix === "current" ? 325 : 125,
            },
          },
        },
      }));
      target.dispatchEvent(new CustomEvent(HELIX_ASK_LIVE_EVENT_BUS_EVENT, {
        detail: {
          contextId: "helix-ask:desktop",
          entry: {
            id: `lane-mail-loop-docs:${suffix}`,
            text: "Lane mail loop is pending.",
            meta: {
              ...commonMeta,
              source_event_type: "lane_mail_loop",
              laneSessionId: "lane-session-docs",
              stagePlayMailId: "stage-play-mail-translation",
              stagePlayWakeExpected: true,
              mailboxThreadId: "thread-docs-translation",
              mailStatus: "unread",
              observationRef: `obs:lane-mail-loop-docs:${suffix}`,
              receiptRef: `receipt:lane-mail-loop-docs:${suffix}`,
            },
          },
        },
      }));
      target.dispatchEvent(new CustomEvent(HELIX_ASK_LIVE_EVENT_BUS_EVENT, {
        detail: {
          contextId: "helix-ask:desktop",
          entry: {
            id: `goal-binding-translate-docs:${suffix}`,
            text: "Goal-bound lane session is active.",
            meta: {
              ...commonMeta,
              source_event_type: "lane_goal_binding",
              goalBindingId: "goal-binding-translate-docs",
              goalId: "goal-account-language",
              laneSessionId: "lane-session-docs",
              bindingStatus: "active",
              sessionStatus: "running",
              sessionHealth: "healthy",
              activationPolicy: "while_goal_active",
              attentionPolicy: "quiet_until_salient",
              stopCondition: "goal_complete",
              reportPolicy: "debug_only",
              quietBehavior: "record_only",
              reportAction: "record_only",
              observationRef: `obs:goal-binding-docs:${suffix}`,
              receiptRef: `receipt:goal-binding-docs:${suffix}`,
            },
          },
        },
      }));
    };

    dispatchLifecycleRows("source-text-old", 18, "old");

    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:current",
    })).toMatchObject({
      laneSessions: {},
      mailLoops: {},
      goalBindings: {},
    });

    dispatchLifecycleRows("source-text-current", 21, "current");

    const snapshot = readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:current",
    });
    expect(snapshot.laneSessions["lane-session-docs"]).toMatchObject({
      sourceTextHash: "source-text-current",
      sourceTextCharCount: 21,
      lastObservationRef: "obs:lane-session-docs:current",
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(snapshot.mailLoops["stage-play-mail-translation"]).toMatchObject({
      sourceTextHash: "source-text-current",
      sourceTextCharCount: 21,
      observationRef: "obs:lane-mail-loop-docs:current",
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(snapshot.goalBindings["goal-binding-translate-docs"]).toMatchObject({
      sourceTextHash: "source-text-current",
      sourceTextCharCount: 21,
      observationRef: "obs:goal-binding-docs:current",
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });

    unsubscribe();
  });
});
