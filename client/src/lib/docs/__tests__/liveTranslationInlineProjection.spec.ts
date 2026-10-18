import { describe, expect, it } from "vitest";
import type { DocumentTranslationUnit } from "@shared/document-translation";
import {
  buildDocumentInlineTranslationDataAttributes,
  buildDocumentInlineTranslationProjectionKey,
  buildDocumentInlineTranslationSuppressedProjectionKey,
  buildDocumentLiveTranslationInlineStates,
  documentMarkdownTranslationEntryToInlineRenderState,
  filterReadyDocumentInlineTranslationRenderStates,
  formatDocumentInlineTranslationText,
  mergeDocumentLiveTranslationInlineStates,
  resolveDocumentInlineTranslationDisplayStatus,
  resolveDocumentInlineTranslationSuppressedDisplayStatus,
  sameDocumentInlineTranslationRenderState,
  simplifyDocumentLiveTranslationInlineStates,
} from "@/lib/docs/liveTranslationInlineProjection";
import type { DocumentMarkdownTranslationEntry } from "@/lib/docs/documentTranslationClient";
import { renderDocumentMarkdownWithInlineTranslations } from "@/lib/docs/liveTranslationInlineRenderer";
import { buildHelixLiveTranslationProjectionReceiptFromProjection } from "@/lib/helix/live-translation-projection";
import {
  buildHelixVisibleTranslationProjections,
  clearHelixVisibleTranslationProjectionContext,
  publishHelixVisibleTranslationProjectionsFromPayload,
  readHelixVisibleTranslationProjectionContext,
} from "@/lib/helix/visible-translation-projection";

const unit = (unitId: string, translatable = true): DocumentTranslationUnit => ({
  unit_id: unitId,
  kind: "paragraph",
  source_markdown: `Source ${unitId}`,
  translatable,
  protected_spans: [],
});

const inlineMeta = (overrides: Record<string, unknown> = {}) => ({
  chunkId: null,
  chunkIndex: null,
  dedupeKey: null,
  sourceEventId: null,
  sourceEventMs: null,
  observedAtMs: null,
  laneSessionId: null,
  observationLaneSessionId: null,
  goalBindingId: null,
  latestEventId: null,
  hasObservation: true,
  selectedBackendProvider: null,
  freshnessStatus: "unknown",
  terminalAuthorityStatus: "not_terminal_authority",
  contextRole: "tool_evidence",
  sourceId: "document_markdown:docs/research/nhm2.md",
  sourceKind: null,
  accountLocale: null,
  projectionTarget: "docs_chunk",
  targetLanguage: "es",
  cancelRequested: false,
  ...overrides,
});

describe("document live translation inline projection", () => {
  it("adapts MicroDeck document translation entries into non-terminal inline render state", () => {
    const entry: DocumentMarkdownTranslationEntry = {
      unitId: "u0001",
      status: "ready",
      text: "Texto desde MicroDeck.",
      runId: "micro-run-1",
      role: "assistant",
      observationRef: "obs:micro:u1",
      receiptRef: "receipt:micro:u1",
      laneSessionId: "lane-session-docs",
      observationLaneSessionId: "lane-session-docs-observation",
      goalBindingId: "goal-binding-docs",
      sourceBindingKey: "docs:nhm2::source-hash::docs_chunk::es-US::es",
      latestSourceBindingKey: "docs:nhm2::source-hash::docs_chunk::es-US::es",
      laneSessionSourceBindingKey: "docs:nhm2::source-hash::docs_chunk::es-US::es",
      laneSessionSourceIdentityKey:
        "docs:nhm2::source-hash::source-text-hash::26::document_markdown::docs_chunk::es-US::es",
      latestObservationKey: "docs:nhm2::source-hash::docs_chunk::es::u0001::obs:micro:u1",
      latestMailLoopObservationKey: "docs:nhm2::source-hash::docs_chunk::es::u0001::receipt:micro:u1",
      goalBindingKey: "goal:translate-docs::goal-binding-docs::lane-session-docs::live_translation",
      latestEventId: "lane-session-docs:observation_recorded:250",
      hasObservation: true,
      docPath: "docs/research/nhm2.md",
      sourceHash: "source-hash",
      sourceTextHash: "source-text-hash",
      sourceTextCharCount: 26,
      chunkId: "doc-inline:source-hash:u0001",
      chunkIndex: 2,
      dedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
      sourceEventId: "source-event-1",
      sourceEventMs: 240,
      observedAtMs: 250,
      projectionStatus: "projected",
      freshnessStatus: "fresh",
      terminalAuthorityStatus: "pending_helix_terminal_authority",
      selectedBackendProvider: "live_translation.local_runtime",
      sourceId: "document_markdown:docs/research/nhm2.md",
      source: "document_microdeck",
      sourceKind: "document_markdown",
      projectionTarget: "docs_chunk",
      targetLanguage: "es",
      accountLocale: "es-US",
    };

    expect(documentMarkdownTranslationEntryToInlineRenderState(entry)).toEqual({
      status: "ready",
      text: "Texto desde MicroDeck.",
      observationRef: "obs:micro:u1",
      receiptRef: "receipt:micro:u1",
      laneSessionId: "lane-session-docs",
      observationLaneSessionId: "lane-session-docs-observation",
      goalBindingId: "goal-binding-docs",
      sourceBindingKey: "docs:nhm2::source-hash::docs_chunk::es-US::es",
      latestSourceBindingKey: "docs:nhm2::source-hash::docs_chunk::es-US::es",
      laneSessionSourceBindingKey: "docs:nhm2::source-hash::docs_chunk::es-US::es",
      laneSessionSourceIdentityKey:
        "docs:nhm2::source-hash::source-text-hash::26::document_markdown::docs_chunk::es-US::es",
      latestObservationKey: "docs:nhm2::source-hash::docs_chunk::es::u0001::obs:micro:u1",
      latestMailLoopObservationKey: "docs:nhm2::source-hash::docs_chunk::es::u0001::receipt:micro:u1",
      goalBindingKey: "goal:translate-docs::goal-binding-docs::lane-session-docs::live_translation",
      latestEventId: "lane-session-docs:observation_recorded:250",
      hasObservation: true,
      chunkId: "doc-inline:source-hash:u0001",
      chunkIndex: 2,
      dedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
      sourceEventId: "source-event-1",
      sourceEventMs: 240,
      observedAtMs: 250,
      projectionStatus: "projected",
      freshnessStatus: "fresh",
      terminalAuthorityStatus: "pending_helix_terminal_authority",
      selectedBackendProvider: "live_translation.local_runtime",
      sourceId: "document_markdown:docs/research/nhm2.md",
      sourceHash: "source-hash",
      sourceKind: "document_markdown",
      sourceTextHash: "source-text-hash",
      sourceTextCharCount: 26,
      accountLocale: "es-US",
      projectionTarget: "docs_chunk",
      targetLanguage: "es",
      source: "document_microdeck",
      contextRole: "tool_evidence",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("treats receipt-only document translation entries as observed non-terminal evidence", () => {
    const entry: DocumentMarkdownTranslationEntry = {
      unitId: "u0001",
      status: "ready",
      text: "Texto desde recibo.",
      runId: "micro-run-receipt-only",
      role: "assistant",
      observationRef: null,
      receiptRef: "receipt:micro:u1",
      latestObservationKey: null,
      latestMailLoopObservationKey: "docs:nhm2::source-hash::docs_chunk::es::u0001::receipt:micro:u1",
      goalBindingKey: "goal:translate-docs::goal-binding-docs::lane-session-docs::live_translation",
      latestEventId: "lane-session-docs:mail_loop:350",
      docPath: "docs/research/nhm2.md",
      sourceHash: "source-hash",
      sourceTextHash: "source-text-hash",
      sourceTextCharCount: 26,
      chunkId: "u0001",
      sourceEventId: "source-event-1",
      sourceEventMs: 340,
      observedAtMs: 350,
      projectionStatus: "projected",
      freshnessStatus: "fresh",
      terminalAuthorityStatus: "not_terminal_authority",
      selectedBackendProvider: "live_translation.local_runtime",
      sourceId: "document_markdown:docs/research/nhm2.md",
      source: "document_microdeck",
      sourceKind: "document_markdown",
      projectionTarget: "docs_chunk",
      targetLanguage: "es",
      accountLocale: "es-US",
    };

    const state = documentMarkdownTranslationEntryToInlineRenderState(entry);

    expect(state).toMatchObject({
      status: "ready",
      text: "Texto desde recibo.",
      observationRef: null,
      receiptRef: "receipt:micro:u1",
      latestMailLoopObservationKey: "docs:nhm2::source-hash::docs_chunk::es::u0001::receipt:micro:u1",
      hasObservation: true,
      contextRole: "tool_evidence",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(buildDocumentInlineTranslationProjectionKey(state)).toBe([
      "document_markdown:docs/research/nhm2.md",
      "source-hash",
      "source-text-hash",
      "docs_chunk",
      "es",
      "u0001",
      "receipt:micro:u1",
    ].join("::"));
    expect(buildDocumentInlineTranslationDataAttributes(state)).toMatchObject({
      "data-doc-translation-has-observation": "true",
      "data-doc-translation-reentry-required": "true",
      "data-doc-translation-answer-authority": "false",
      "data-doc-translation-terminal-eligible": "false",
      "data-doc-translation-assistant-answer": "false",
      "data-doc-translation-raw-content-included": "false",
      "data-doc-translation-receipt-ref": "receipt:micro:u1",
      "data-doc-translation-latest-mail-loop-observation-key":
        "docs:nhm2::source-hash::docs_chunk::es::u0001::receipt:micro:u1",
    });
  });

  it("filters cached inline render state down to ready translated text", () => {
    expect(filterReadyDocumentInlineTranslationRenderStates({
      ready: {
        status: "ready",
        text: "Texto listo.",
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
      blankReady: {
        status: "ready",
        text: "   ",
      },
      loading: {
        status: "loading",
      },
      error: {
        status: "error",
        error: "translation_projection_failed",
      },
    })).toEqual({
      ready: {
        status: "ready",
        text: "Texto listo.",
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    });
  });

  it("builds render data attributes for translation projection metadata", () => {
    expect(buildDocumentInlineTranslationDataAttributes({
      status: "error",
      error: "translation_projection_cancelled",
      serverProjectionKey: "server-projection-key-current",
      observationRef: "obs:docs:u1",
      receiptRef: "receipt:docs:u1",
      laneSessionId: "lane-session-docs",
      sessionDebugPhase: "running:record_observation:observation_recorded",
      sessionObservationStatus: "observation_recorded",
      sourceIdentityKey: "document_markdown:docs/research/nhm2.md::source-hash::docs_chunk::es",
      sourceBindingKey: "docs:nhm2::source-hash::docs_chunk::es-US::es",
      latestSourceBindingKey: "docs:nhm2::source-hash::docs_chunk::es-US::es",
      laneSessionSourceBindingKey: "docs:nhm2::source-hash::docs_chunk::es-US::es",
      laneSessionSourceIdentityKey:
        "docs:nhm2::source-hash::source-text-hash::26::document_markdown::docs_chunk::es-US::es",
      latestObservationKey: "docs:nhm2::source-hash::docs_chunk::es::chunk-1::obs:docs:u1",
      latestMailLoopObservationKey: "docs:nhm2::source-hash::docs_chunk::es::chunk-1::receipt:docs:u1",
      goalBindingKey: "goal:translate-docs::goal-binding-docs::lane-session-docs::live_translation",
      selectedBackendProvider: "live_translation.local_runtime",
      projectionStatus: "cancelled",
      chunkId: "chunk-1",
      chunkIndex: 3,
      dedupeKey: "dedupe-1",
      sourceEventId: "event-1",
      sourceEventMs: 123,
      observedAtMs: 456,
      freshnessStatus: "fresh",
      terminalAuthorityStatus: "pending_helix_terminal_authority",
      sourceId: "document_markdown:docs/research/nhm2.md",
      sourceHash: "source-hash",
      sourceKind: "document_markdown",
      sourceTextHash: "source-text-hash",
      sourceTextCharCount: 26,
      accountLocale: "es-US",
      projectionTarget: "docs_chunk",
      targetLanguage: "es",
      cancelRequested: true,
      contextRole: "tool_evidence",
      suppressedServerProjectionKey: "server-projection-key-stale",
      suppressedObservationRef: "obs:docs:u1:stale",
      suppressedReceiptRef: "receipt:docs:u1:stale",
      suppressedLaneSessionId: "lane-session-docs-stale",
      suppressedSessionDebugPhase: "paused:stale_observation:suppressed",
      suppressedSessionObservationStatus: "suppressed_stale_observation",
      suppressedSourceIdentityKey: "document_markdown:docs/research/nhm2-stale.md::source-hash-stale::docs_chunk::es",
      suppressedSourceBindingKey: "docs:nhm2-stale::source-hash-stale::docs_chunk::es-US::es",
      suppressedLatestSourceBindingKey: "docs:nhm2-stale::source-hash-stale::docs_chunk::es-US::es",
      suppressedLaneSessionSourceBindingKey: "docs:nhm2-stale::source-hash-stale::docs_chunk::es-US::es",
      suppressedLaneSessionSourceIdentityKey:
        "docs:nhm2-stale::source-hash-stale::source-text-hash-stale::31::document_markdown::docs_chunk::es-US::es",
      suppressedLatestObservationKey: "docs:nhm2-stale::source-hash-stale::docs_chunk::es::chunk-stale::obs:docs:u1:stale",
      suppressedLatestMailLoopObservationKey:
        "docs:nhm2-stale::source-hash-stale::docs_chunk::es::chunk-stale::receipt:docs:u1:stale",
      suppressedGoalBindingKey: "goal:translate-docs::goal-binding-stale::lane-session-docs::live_translation",
      suppressedProjectionStatus: "stale",
      suppressedChunkId: "chunk-stale",
      suppressedChunkIndex: 4,
      suppressedDedupeKey: "dedupe-stale",
      suppressedSourceEventId: "event-stale",
      suppressedSourceEventMs: 777,
      suppressedObservedAtMs: 789,
      suppressedFreshnessStatus: "stale",
      suppressedTerminalAuthorityStatus: "not_terminal_authority",
      suppressedContextRole: "tool_evidence",
      suppressedSourceId: "document_markdown:docs/research/nhm2-stale.md",
      suppressedSourceHash: "source-hash-stale",
      suppressedSourceKind: "document_markdown",
      suppressedSourceTextHash: "source-text-hash-stale",
      suppressedSourceTextCharCount: 31,
      suppressedAccountLocale: "es-US",
      suppressedProjectionTarget: "docs_chunk",
      suppressedTargetLanguage: "es",
      suppressedCancelRequested: true,
      suppressedReason: "stale_projection_did_not_replace_fresh_text",
      source: "capability_lane",
      selectedRuntimeAgentProvider: "codex",
      suppressedSelectedRuntimeAgentProvider: "helix",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    })).toEqual({
      "data-doc-translation-source": "capability_lane",
      "data-doc-translation-projection-key": [
        "document_markdown:docs/research/nhm2.md::source-hash::docs_chunk::es",
        "chunk-1",
        "receipt:docs:u1",
      ].join("::"),
      "data-doc-translation-server-projection-key": "server-projection-key-current",
      "data-doc-translation-authority-policy": "projection_only_not_answer_authority",
      "data-doc-translation-terminal-authority-owner": "helix",
      "data-doc-translation-render-status": "error",
      "data-doc-translation-display-status": "cancelled",
      "data-doc-translation-display-status-reason": "cancelled_projection",
      "data-doc-translation-governed-projection": "true",
      "data-doc-translation-projection-status": "cancelled",
      "data-doc-translation-selected-backend-provider": "live_translation.local_runtime",
      "data-doc-translation-selected-runtime-agent-provider": "codex",
      "data-doc-translation-observation-ref": "obs:docs:u1",
      "data-doc-translation-receipt-ref": "receipt:docs:u1",
      "data-doc-translation-visible-observation-ref": "obs:docs:u1",
      "data-doc-translation-visible-receipt-ref": "receipt:docs:u1",
      "data-doc-translation-evidence-observation-ref": "obs:docs:u1:stale",
      "data-doc-translation-evidence-receipt-ref": "receipt:docs:u1:stale",
      "data-doc-translation-lane-session-id": "lane-session-docs",
      "data-doc-translation-session-debug-phase": "running:record_observation:observation_recorded",
      "data-doc-translation-session-observation-status": "observation_recorded",
      "data-doc-translation-source-identity-key": "document_markdown:docs/research/nhm2.md::source-hash::docs_chunk::es",
      "data-doc-translation-source-binding-key": "docs:nhm2::source-hash::docs_chunk::es-US::es",
      "data-doc-translation-latest-source-binding-key": "docs:nhm2::source-hash::docs_chunk::es-US::es",
      "data-doc-translation-lane-session-source-binding-key": "docs:nhm2::source-hash::docs_chunk::es-US::es",
      "data-doc-translation-lane-session-source-identity-key":
        "docs:nhm2::source-hash::source-text-hash::26::docs::docs_chunk::es-US::es",
      "data-doc-translation-latest-observation-key": "docs:nhm2::source-hash::docs_chunk::es::chunk-1::obs:docs:u1",
      "data-doc-translation-latest-mail-loop-observation-key":
        "docs:nhm2::source-hash::docs_chunk::es::chunk-1::receipt:docs:u1",
      "data-doc-translation-goal-binding-key": "goal:translate-docs::goal-binding-docs::lane-session-docs::live_translation",
      "data-doc-translation-chunk-id": "chunk-1",
      "data-doc-translation-chunk-index": "3",
      "data-doc-translation-dedupe-key": "dedupe-1",
      "data-doc-translation-source-event-id": "event-1",
      "data-doc-translation-source-event-ms": "123",
      "data-doc-translation-observed-at-ms": "456",
      "data-doc-translation-freshness-status": "fresh",
      "data-doc-translation-terminal-authority-status": "pending_helix_terminal_authority",
      "data-doc-translation-context-role": "tool_evidence",
      "data-doc-translation-answer-authority": "false",
      "data-doc-translation-reentry-required": "true",
      "data-doc-translation-source-id": "document_markdown:docs/research/nhm2.md",
      "data-doc-translation-source-hash": "source-hash",
      "data-doc-translation-source-kind": "docs",
      "data-doc-translation-source-text-hash": "source-text-hash",
      "data-doc-translation-source-text-char-count": "26",
      "data-doc-translation-account-locale": "es-US",
      "data-doc-translation-projection-target": "docs_chunk",
      "data-doc-translation-target-language": "es",
      "data-doc-translation-cancel-requested": "true",
      "data-doc-translation-suppressed-observation-ref": "obs:docs:u1:stale",
      "data-doc-translation-suppressed-receipt-ref": "receipt:docs:u1:stale",
      "data-doc-translation-suppressed-lane-session-id": "lane-session-docs-stale",
      "data-doc-translation-suppressed-projection-key": [
        "document_markdown:docs/research/nhm2-stale.md::source-hash-stale::docs_chunk::es",
        "chunk-stale",
        "receipt:docs:u1:stale",
      ].join("::"),
      "data-doc-translation-suppressed-server-projection-key": "server-projection-key-stale",
      "data-doc-translation-suppressed-session-debug-phase": "paused:stale_observation:suppressed",
      "data-doc-translation-suppressed-session-observation-status": "suppressed_stale_observation",
      "data-doc-translation-suppressed-source-identity-key":
        "document_markdown:docs/research/nhm2-stale.md::source-hash-stale::docs_chunk::es",
      "data-doc-translation-suppressed-source-binding-key": "docs:nhm2-stale::source-hash-stale::docs_chunk::es-US::es",
      "data-doc-translation-suppressed-latest-source-binding-key":
        "docs:nhm2-stale::source-hash-stale::docs_chunk::es-US::es",
      "data-doc-translation-suppressed-lane-session-source-binding-key":
        "docs:nhm2-stale::source-hash-stale::docs_chunk::es-US::es",
      "data-doc-translation-suppressed-lane-session-source-identity-key":
        "docs:nhm2-stale::source-hash-stale::source-text-hash-stale::31::docs::docs_chunk::es-US::es",
      "data-doc-translation-suppressed-latest-observation-key":
        "docs:nhm2-stale::source-hash-stale::docs_chunk::es::chunk-stale::obs:docs:u1:stale",
      "data-doc-translation-suppressed-latest-mail-loop-observation-key":
        "docs:nhm2-stale::source-hash-stale::docs_chunk::es::chunk-stale::receipt:docs:u1:stale",
      "data-doc-translation-suppressed-goal-binding-key":
        "goal:translate-docs::goal-binding-stale::lane-session-docs::live_translation",
      "data-doc-translation-suppressed-projection-status": "stale",
      "data-doc-translation-suppressed-display-status": "stale",
      "data-doc-translation-suppressed-display-status-reason": "stale_projection_suppressed",
      "data-doc-translation-suppressed-chunk-id": "chunk-stale",
      "data-doc-translation-suppressed-chunk-index": "4",
      "data-doc-translation-suppressed-dedupe-key": "dedupe-stale",
      "data-doc-translation-suppressed-source-event-id": "event-stale",
      "data-doc-translation-suppressed-source-event-ms": "777",
      "data-doc-translation-suppressed-observed-at-ms": "789",
      "data-doc-translation-suppressed-freshness-status": "stale",
      "data-doc-translation-suppressed-terminal-authority-status": "not_terminal_authority",
      "data-doc-translation-suppressed-context-role": "tool_evidence",
      "data-doc-translation-suppressed-reentry-required": "true",
      "data-doc-translation-suppressed-answer-authority": "false",
      "data-doc-translation-suppressed-terminal-eligible": "false",
      "data-doc-translation-suppressed-assistant-answer": "false",
      "data-doc-translation-suppressed-raw-content-included": "false",
      "data-doc-translation-suppressed-selected-runtime-agent-provider": "helix",
      "data-doc-translation-suppressed-source-id": "document_markdown:docs/research/nhm2-stale.md",
      "data-doc-translation-suppressed-source-hash": "source-hash-stale",
      "data-doc-translation-suppressed-source-kind": "docs",
      "data-doc-translation-suppressed-source-text-hash": "source-text-hash-stale",
      "data-doc-translation-suppressed-source-text-char-count": "31",
      "data-doc-translation-suppressed-account-locale": "es-US",
      "data-doc-translation-suppressed-projection-target": "docs_chunk",
      "data-doc-translation-suppressed-target-language": "es",
      "data-doc-translation-suppressed-cancel-requested": "true",
      "data-doc-translation-suppressed-reason": "stale_projection_did_not_replace_fresh_text",
      "data-doc-translation-terminal-eligible": "false",
      "data-doc-translation-assistant-answer": "false",
      "data-doc-translation-raw-content-included": "false",
    });
    expect(buildDocumentInlineTranslationProjectionKey({
      status: "ready",
      text: "Texto",
      sourceId: "document_markdown:docs/research/nhm2.md",
      projectionTarget: "docs_chunk",
      targetLanguage: "es",
      chunkId: "u0001",
      observationRef: "obs:docs:u1",
    })).toBe("document_markdown:docs/research/nhm2.md::docs_chunk::es::u0001::obs:docs:u1");
    expect(buildDocumentInlineTranslationProjectionKey({
      status: "ready",
      text: "Texto",
      sourceIdentityKey: "document_markdown:docs/research/nhm2.md::source-hash-old::docs::docs_chunk::es::es",
      latestSourceIdentityKey:
        "document_markdown:docs/research/nhm2.md::source-hash-current::source-text-current::12::docs::docs_chunk::es::es",
      chunkId: "u0001",
      observationRef: "obs:docs:u1",
    })).toBe(
      "document_markdown:docs/research/nhm2.md::source-hash-current::source-text-current::12::docs::docs_chunk::es::es::u0001::obs:docs:u1",
    );
    expect(buildDocumentInlineTranslationProjectionKey({
      status: "ready",
      text: "Texto",
      sourceId: "document_markdown:docs/research/nhm2.md",
      projectionTarget: "docs_chunk",
      targetLanguage: "es",
      chunkId: "u0001",
      latestObservationKey: "docs:nhm2::source-hash::docs_chunk::es::u0001::obs:docs:u1",
    })).toBe(
      "document_markdown:docs/research/nhm2.md::docs_chunk::es::u0001::docs:nhm2::source-hash::docs_chunk::es::u0001::obs:docs:u1",
    );
    expect(buildDocumentInlineTranslationSuppressedProjectionKey({
      status: "error",
      error: "translation_projection_stale",
      suppressedSourceIdentityKey:
        "document_markdown:docs/research/nhm2.md::source-hash-old::docs::docs_chunk::es::es",
      suppressedLatestSourceIdentityKey:
        "document_markdown:docs/research/nhm2.md::source-hash-current::source-text-current::12::docs::docs_chunk::es::es",
      suppressedChunkId: "u0001",
      suppressedObservationRef: "obs:docs:u1",
    })).toBe(
      "document_markdown:docs/research/nhm2.md::source-hash-current::source-text-current::12::docs::docs_chunk::es::es::u0001::obs:docs:u1",
    );
    expect(buildDocumentInlineTranslationSuppressedProjectionKey({
      status: "error",
      error: "translation_projection_stale",
      suppressedSourceId: "document_markdown:docs/research/nhm2.md",
      suppressedProjectionTarget: "docs_chunk",
      suppressedTargetLanguage: "es",
      suppressedChunkId: "u0001",
      suppressedLatestMailLoopObservationKey:
        "docs:nhm2::source-hash::docs_chunk::es::u0001::receipt:docs:u1",
    })).toBe(
      "document_markdown:docs/research/nhm2.md::docs_chunk::es::u0001::docs:nhm2::source-hash::docs_chunk::es::u0001::receipt:docs:u1",
    );
    expect(resolveDocumentInlineTranslationDisplayStatus({
      status: "ready",
      text: "Texto actual",
      projectionStatus: "cancelled",
      freshnessStatus: "fresh",
      cancelRequested: true,
    })).toBe("cancelled");
    expect(resolveDocumentInlineTranslationDisplayStatus({
      status: "loading",
      laneSessionId: "lane-session-docs",
      projectionStatus: "missing",
      freshnessStatus: "fresh",
    })).toBe("active");
    expect(buildDocumentInlineTranslationDataAttributes({
      status: "loading",
      laneSessionId: "lane-session-docs",
      projectionStatus: "missing",
      freshnessStatus: "fresh",
      source: "capability_lane",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    })).toMatchObject({
      "data-doc-translation-render-status": "loading",
      "data-doc-translation-display-status": "active",
      "data-doc-translation-lane-session-id": "lane-session-docs",
      "data-doc-translation-terminal-eligible": "false",
      "data-doc-translation-assistant-answer": "false",
    });
    expect(resolveDocumentInlineTranslationDisplayStatus({
      status: "loading",
      projectionStatus: "missing",
      freshnessStatus: "fresh",
    })).toBe("pending");
  });

  it("derives suppressed projection display health without changing current ready text", () => {
    expect(resolveDocumentInlineTranslationSuppressedDisplayStatus({
      status: "ready",
      text: "Texto listo.",
      suppressedProjectionStatus: "cancelled",
      suppressedReceiptRef: "receipt:cancelled",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    })).toBe("cancelled");
    expect(resolveDocumentInlineTranslationSuppressedDisplayStatus({
      status: "ready",
      text: "Texto listo.",
      suppressedProjectionStatus: "failed",
      suppressedObservationRef: "obs:failed",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    })).toBe("failed");
    expect(resolveDocumentInlineTranslationSuppressedDisplayStatus({
      status: "ready",
      text: "Texto listo.",
      suppressedReason: "hash_mismatch_projection_rejected",
      suppressedLatestObservationKey: "latest:rejected",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    })).toBe("blocked");
    expect(resolveDocumentInlineTranslationSuppressedDisplayStatus({
      status: "ready",
      text: "Texto listo.",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    })).toBeNull();
  });

  it("marks receipt-bearing inline projections as re-entry required even without optional terminal flag", () => {
    expect(buildDocumentInlineTranslationDataAttributes({
      status: "ready",
      text: "Texto listo.",
      observationRef: "obs:docs:u1",
      receiptRef: "receipt:docs:u1",
      source: "capability_lane",
      contextRole: "tool_evidence",
      answerAuthority: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    })).toMatchObject({
      "data-doc-translation-context-role": "tool_evidence",
      "data-doc-translation-answer-authority": "false",
      "data-doc-translation-reentry-required": "true",
      "data-doc-translation-assistant-answer": "false",
      "data-doc-translation-raw-content-included": "false",
    });
  });

  it("marks suppressed session-key projections as re-entry required without receipt refs", () => {
    expect(buildDocumentInlineTranslationDataAttributes({
      status: "error",
      error: "translation_projection_source_identity_mismatch",
      suppressedSourceId: "document_markdown:docs/research/nhm2.md",
      suppressedProjectionTarget: "docs_chunk",
      suppressedTargetLanguage: "es",
      suppressedChunkId: "u0001",
      suppressedLatestObservationKey: "docs:nhm2::source-hash::docs_chunk::es::u0001::obs:docs:u1",
      source: "capability_lane",
      contextRole: "tool_evidence",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    })).toMatchObject({
      "data-doc-translation-suppressed-projection-key":
        "document_markdown:docs/research/nhm2.md::docs_chunk::es::u0001::docs:nhm2::source-hash::docs_chunk::es::u0001::obs:docs:u1",
      "data-doc-translation-suppressed-latest-observation-key":
        "docs:nhm2::source-hash::docs_chunk::es::u0001::obs:docs:u1",
      "data-doc-translation-suppressed-reentry-required": "true",
      "data-doc-translation-terminal-eligible": "false",
      "data-doc-translation-assistant-answer": "false",
      "data-doc-translation-raw-content-included": "false",
    });
  });

  it("formats translated markdown-like text for inline document projection", () => {
    expect(formatDocumentInlineTranslationText([
      "### Titulo",
      "- primer punto",
      "1. segundo punto",
      "| celda traducida |",
    ].join("\n"))).toBe([
      "Titulo",
      "primer punto",
      "segundo punto",
      "celda traducida",
    ].join("\n"));
  });

  it("adapts governed live translation receipts into docs inline translation state", () => {
    expect(buildDocumentLiveTranslationInlineStates({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001"), unit("u0002"), unit("u0003", false)],
      payload: {
        capability_lane_projection_receipts: [
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:u1",
            observation_ref: "obs:docs:u1",
            lane_session_id: "lane-session-docs",
            selected_runtime_agent_provider: "codex",
            selected_backend_provider: "live_translation.local_runtime",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "projected",
            source_id: "document_markdown:docs/research/nhm2.md",
            source_kind: "docs",
            source_text_hash: "source-text-hash-u1",
            source_text_char_count: 18,
            account_locale: "es-US",
            chunk_id: "u0001",
            dedupe_key: "document_markdown:docs/research/nhm2.md:u0001:es",
            observed_at_ms: 100,
            target_language: "es",
            translated_text: "Primer bloque.",
          },
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:u2",
            observation_ref: "obs:docs:u2",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "projected",
            source_id: "document_markdown:docs/research/nhm2.md",
            chunk_id: "batch-1",
            dedupe_key: "document_markdown:docs/research/nhm2.md:u0002:es",
            observed_at_ms: 110,
            target_language: "es",
            translated_text: "Segundo bloque.",
          },
        ],
      },
    })).toEqual({
      u0001: {
        status: "ready",
        text: "Primer bloque.",
        observationRef: "obs:docs:u1",
        receiptRef: "receipt:docs:u1",
        projectionStatus: "projected",
        ...inlineMeta({
          chunkId: "u0001",
          dedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
          observedAtMs: 100,
          laneSessionId: "lane-session-docs",
          selectedRuntimeAgentProvider: "codex",
          selectedBackendProvider: "live_translation.local_runtime",
          sourceKind: "docs",
          sourceTextHash: "source-text-hash-u1",
          sourceTextCharCount: 18,
          accountLocale: "es-US",
        }),
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
      u0002: {
        status: "ready",
        text: "Segundo bloque.",
        observationRef: "obs:docs:u2",
        receiptRef: "receipt:docs:u2",
        projectionStatus: "projected",
        ...inlineMeta({
          chunkId: "batch-1",
          dedupeKey: "document_markdown:docs/research/nhm2.md:u0002:es",
          observedAtMs: 110,
        }),
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    });
  });

  it("adapts Ask visible-chunk projection receipts into docs inline translation state", () => {
    const states = buildDocumentLiveTranslationInlineStates({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "source-hash-current-doc",
      sourceTextHash: "source-text-current",
      sourceTextCharCount: 19,
      units: [unit("visible-chunk-1"), unit("visible-chunk-2")],
      payload: {
        debug: {
          capability_lane_projection_receipts: [
            {
              schema: "helix.live_translation.projection_receipt.v1",
              receipt_ref: "ask:visible-title:receipt",
              observation_ref: "ask:visible-title:observation",
              selected_runtime_agent_provider: "codex",
              selected_backend_provider: "live_translation.local_runtime",
              lane_id: "live_translation",
              capability: "live_translation.translate_text",
              projection_target: "docs_chunk",
              projection_status: "projected",
              source_id: "document_markdown:docs/research/nhm2.md#visible-chunk-1",
              bbox: { x: 8, y: 16, width: 260, height: 44, source: "visible-doc-chunk" },
              doc_path: "docs/research/nhm2.md",
              source_hash: "source-hash-current-doc",
              source_kind: "docs_viewer",
              source_text_hash: "source-text-current",
              source_text_char_count: 19,
              account_locale: "es",
              chunk_id: "visible-chunk-1",
              chunk_index: 0,
              dedupe_key: "document_markdown:docs/research/nhm2.md:visible-chunk-1:es",
              observed_at_ms: 180,
              freshness_status: "fresh",
              target_language: "es",
              translated_text: "Titulo visible desde Ask.",
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

    expect(states).toEqual({
      "visible-chunk-1": {
        status: "ready",
        text: "Titulo visible desde Ask.",
        observationRef: "ask:visible-title:observation",
        receiptRef: "ask:visible-title:receipt",
        projectionStatus: "projected",
        ...inlineMeta({
          chunkId: "visible-chunk-1",
          chunkIndex: 0,
          dedupeKey: "document_markdown:docs/research/nhm2.md:visible-chunk-1:es",
          observedAtMs: 180,
          selectedRuntimeAgentProvider: "codex",
          selectedBackendProvider: "live_translation.local_runtime",
          sourceId: "document_markdown:docs/research/nhm2.md#visible-chunk-1",
          bbox: { x: 8, y: 16, width: 260, height: 44, source: "visible-doc-chunk" },
          sourceHash: "source-hash-current-doc",
          sourceKind: "docs",
          sourceTextHash: "source-text-current",
          sourceTextCharCount: 19,
          accountLocale: "es",
          freshnessStatus: "fresh",
        }),
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    });
    expect(buildDocumentInlineTranslationDataAttributes(states["visible-chunk-1"])).toMatchObject({
      "data-doc-translation-bbox": JSON.stringify({
        x: 8,
        y: 16,
        width: 260,
        height: 44,
        source: "visible-doc-chunk",
      }),
      "data-doc-translation-authority-policy": "projection_only_not_answer_authority",
      "data-doc-translation-answer-authority": "false",
    });
    expect(states["visible-chunk-2"]).toBeUndefined();
  });

  it("honors source-text scope when adapting governed receipts into docs inline state", () => {
    const payload = {
      capability_lane_projection_receipts: [
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:docs:old-source-text",
          observation_ref: "obs:docs:old-source-text",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_chunk",
          projection_status: "projected",
          source_id: "document_markdown:docs/research/nhm2.md",
          source_hash: "source-hash-current-doc",
          source_text_hash: "source-text-old",
          source_text_char_count: 18,
          chunk_id: "u0001",
          dedupe_key: "document_markdown:docs/research/nhm2.md:u0001:es",
          observed_at_ms: 100,
          target_language: "es",
          translated_text: "Texto viejo.",
          terminal_eligible: false,
          assistant_answer: false,
          raw_content_included: false,
        },
      ],
    };

    expect(buildDocumentLiveTranslationInlineStates({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "source-hash-current-doc",
      sourceTextHash: "source-text-current",
      sourceTextCharCount: 21,
      units: [unit("u0001")],
      payload,
    })).toMatchObject({
      u0001: {
        status: "error",
        error: "translation_projection_source_text_mismatch",
        observationRef: "obs:docs:old-source-text",
        receiptRef: "receipt:docs:old-source-text",
        projectionStatus: "missing",
        sourceId: "document_markdown:docs/research/nhm2.md",
        sourceHash: "source-hash-current-doc",
        sourceTextHash: "source-text-current",
        sourceTextCharCount: 21,
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    });
    expect(buildDocumentLiveTranslationInlineStates({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "source-hash-current-doc",
      sourceTextHash: "source-text-old",
      sourceTextCharCount: 18,
      units: [unit("u0001")],
      payload,
    })).toMatchObject({
      u0001: {
        status: "ready",
        text: "Texto viejo.",
        observationRef: "obs:docs:old-source-text",
        receiptRef: "receipt:docs:old-source-text",
        projectionStatus: "projected",
        sourceHash: "source-hash-current-doc",
        sourceTextHash: "source-text-old",
        sourceTextCharCount: 18,
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    });
  });

  it("keeps rejected source identity visible in docs inline error attributes", () => {
    const staleIdentity =
      "document_markdown:docs/research/nhm2.md::source-hash-current-doc::source-text-old::18::docs::docs_chunk::es::es";
    const currentIdentity =
      "document_markdown:docs/research/nhm2.md::source-hash-current-doc::source-text-current::21::docs::docs_chunk::es::es";
    const laneStates = buildDocumentLiveTranslationInlineStates({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "source-hash-current-doc",
      sourceIdentityKey: currentIdentity,
      units: [unit("u0001")],
      payload: {
        capability_lane_projection_receipts: [
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:old-identity",
            observation_ref: "obs:docs:old-identity",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "projected",
            source_id: "document_markdown:docs/research/nhm2.md",
            source_hash: "source-hash-current-doc",
            source_identity_key: staleIdentity,
            chunk_id: "u0001",
            dedupe_key: "document_markdown:docs/research/nhm2.md:u0001:es",
            observed_at_ms: 100,
            target_language: "es",
            translated_text: "Texto viejo.",
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        ],
      },
    });

    expect(laneStates).toMatchObject({
      u0001: {
        status: "error",
        error: "translation_projection_source_identity_mismatch",
        sourceIdentityKey: currentIdentity,
        latestSourceIdentityKey: staleIdentity,
        observationRef: "obs:docs:old-identity",
        receiptRef: "receipt:docs:old-identity",
        projectionStatus: "missing",
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    });

    const renderStates = simplifyDocumentLiveTranslationInlineStates(laneStates);
    expect(renderStates.u0001).toMatchObject({
      status: "error",
      error: "translation_projection_source_identity_mismatch",
      sourceIdentityKey: currentIdentity,
      latestSourceIdentityKey: staleIdentity,
      observationRef: "obs:docs:old-identity",
      receiptRef: "receipt:docs:old-identity",
      source: "capability_lane",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(buildDocumentInlineTranslationDataAttributes(renderStates.u0001)).toMatchObject({
      "data-doc-translation-render-status": "error",
      "data-doc-translation-projection-status": "missing",
      "data-doc-translation-display-status-reason": "projection_error_blocked",
      "data-doc-translation-source-identity-key": currentIdentity,
      "data-doc-translation-latest-source-identity-key": staleIdentity,
      "data-doc-translation-observation-ref": "obs:docs:old-identity",
      "data-doc-translation-receipt-ref": "receipt:docs:old-identity",
      "data-doc-translation-display-status": "blocked",
      "data-doc-translation-reentry-required": "true",
      "data-doc-translation-answer-authority": "false",
      "data-doc-translation-terminal-eligible": "false",
      "data-doc-translation-assistant-answer": "false",
      "data-doc-translation-raw-content-included": "false",
    });
  });

  it("preserves stale, cancelled, and failed lane receipts as non-terminal inline errors", () => {
    expect(buildDocumentLiveTranslationInlineStates({
      docPath: "docs/research/nhm2.md",
      locale: "fr",
      units: [unit("u0001"), unit("u0002"), unit("u0003")],
      payload: {
        capability_lane_projection_receipts: [
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:stale",
            observation_ref: "obs:docs:stale",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "stale",
            source_id: "document_markdown:docs/research/nhm2.md",
            chunk_id: "u0001",
            observed_at_ms: 100,
            target_language: "fr",
            translated_text: "Ancien bloc.",
            stale: true,
          },
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:cancelled",
            observation_ref: "obs:docs:cancelled",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "cancelled",
            source_id: "document_markdown:docs/research/nhm2.md",
            chunk_id: "u0002",
            observed_at_ms: 110,
            target_language: "fr",
            cancel_requested: true,
          },
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:failed",
            observation_ref: "obs:docs:failed",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "failed",
            source_id: "document_markdown:docs/research/nhm2.md",
            chunk_id: "u0003",
            observed_at_ms: 120,
            target_language: "fr",
          },
        ],
      },
    })).toEqual({
      u0001: {
        status: "error",
        error: "translation_projection_stale",
        observationRef: "obs:docs:stale",
        receiptRef: "receipt:docs:stale",
        projectionStatus: "stale",
        ...inlineMeta({
          chunkId: "u0001",
          observedAtMs: 100,
          targetLanguage: "fr",
        }),
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
      u0002: {
        status: "error",
        error: "translation_projection_cancelled",
        observationRef: "obs:docs:cancelled",
        receiptRef: "receipt:docs:cancelled",
        projectionStatus: "cancelled",
        ...inlineMeta({
          chunkId: "u0002",
          observedAtMs: 110,
          targetLanguage: "fr",
          cancelRequested: true,
        }),
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
      u0003: {
        status: "error",
        error: "translation_projection_failed",
        observationRef: "obs:docs:failed",
        receiptRef: "receipt:docs:failed",
        projectionStatus: "failed",
        ...inlineMeta({
          chunkId: "u0003",
          observedAtMs: 120,
          targetLanguage: "fr",
        }),
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    });
  });

  it("simplifies and merges lane states into the docs renderer state shape conservatively", () => {
    const laneStates = buildDocumentLiveTranslationInlineStates({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001"), unit("u0002"), unit("u0003")],
      payload: {
        capability_lane_projection_receipts: [
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:u1",
            observation_ref: "obs:docs:u1",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "projected",
            source_id: "document_markdown:docs/research/nhm2.md",
            chunk_id: "u0001",
            observed_at_ms: 100,
            target_language: "es",
            translated_text: "Texto gobernado.",
          },
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:u2",
            observation_ref: "obs:docs:u2",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "cancelled",
            source_id: "document_markdown:docs/research/nhm2.md",
            chunk_id: "u0002",
            observed_at_ms: 110,
            target_language: "es",
            cancel_requested: true,
          },
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:u3",
            observation_ref: "obs:docs:u3",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "stale",
            source_id: "document_markdown:docs/research/nhm2.md",
            chunk_id: "u0003",
            observed_at_ms: 120,
            target_language: "es",
            translated_text: "Texto viejo.",
            stale: true,
          },
        ],
      },
    });

    expect(simplifyDocumentLiveTranslationInlineStates(laneStates)).toEqual({
      u0001: {
        status: "ready",
        text: "Texto gobernado.",
        observationRef: "obs:docs:u1",
        receiptRef: "receipt:docs:u1",
        projectionStatus: "projected",
        ...inlineMeta({
          chunkId: "u0001",
          observedAtMs: 100,
        }),
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
      u0002: {
        status: "error",
        error: "translation_projection_cancelled",
        observationRef: "obs:docs:u2",
        receiptRef: "receipt:docs:u2",
        projectionStatus: "cancelled",
        ...inlineMeta({
          chunkId: "u0002",
          observedAtMs: 110,
          cancelRequested: true,
        }),
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
      u0003: {
        status: "error",
        error: "translation_projection_stale",
        observationRef: "obs:docs:u3",
        receiptRef: "receipt:docs:u3",
        projectionStatus: "stale",
        ...inlineMeta({
          chunkId: "u0003",
          observedAtMs: 120,
        }),
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    });

    expect(mergeDocumentLiveTranslationInlineStates({
      current: {
        u0001: { status: "loading" },
        u0002: { status: "loading" },
        u0003: { status: "ready", text: "Texto vigente." },
      },
      laneStates,
    })).toEqual({
      u0001: {
        status: "ready",
        text: "Texto gobernado.",
        observationRef: "obs:docs:u1",
        receiptRef: "receipt:docs:u1",
        projectionStatus: "projected",
        ...inlineMeta({
          chunkId: "u0001",
          observedAtMs: 100,
        }),
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
      u0002: {
        status: "error",
        error: "translation_projection_cancelled",
        observationRef: "obs:docs:u2",
        receiptRef: "receipt:docs:u2",
        projectionStatus: "cancelled",
        ...inlineMeta({
          chunkId: "u0002",
          observedAtMs: 110,
          cancelRequested: true,
        }),
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
      u0003: {
        status: "ready",
        text: "Texto vigente.",
      },
    });
  });

  it("keeps stale suppressed receipt terminal authority inspectable when fresh text stays visible", () => {
    expect(mergeDocumentLiveTranslationInlineStates({
      current: {
        u0001: {
          status: "ready",
          text: "Texto fresco.",
          observationRef: "obs:docs:fresh",
          receiptRef: "receipt:docs:fresh",
          projectionStatus: "projected",
          ...inlineMeta({
            observedAtMs: 200,
            terminalAuthorityStatus: "not_terminal_authority",
          }),
          source: "capability_lane",
          answerAuthority: false,
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
      },
      laneStates: {
        u0001: {
          status: "ready",
          text: "Texto viejo.",
          observationRef: "obs:docs:stale",
          receiptRef: "receipt:docs:stale",
          projectionStatus: "stale",
          ...inlineMeta({
            chunkId: "chunk-stale",
            chunkIndex: 9,
            dedupeKey: "dedupe-stale",
            sourceEventId: "event-stale",
            sourceEventMs: 80,
          observedAtMs: 100,
          laneSessionId: "lane-session-stale",
          sessionDebugPhase: "paused:stale_observation:suppressed",
          sessionObservationStatus: "suppressed_stale_observation",
          selectedBackendProvider: "live_translation.local_runtime",
            freshnessStatus: "stale",
            terminalAuthorityStatus: "pending_helix_terminal_authority",
            sourceHash: "source-hash-stale",
            sourceKind: "document_markdown",
            accountLocale: "es-US",
            projectionTarget: "docs_chunk",
            targetLanguage: "es",
            cancelRequested: true,
          }),
          source: "capability_lane",
          answerAuthority: false,
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
      },
    })).toEqual({
      u0001: {
        status: "ready",
        text: "Texto fresco.",
        observationRef: "obs:docs:fresh",
        receiptRef: "receipt:docs:fresh",
        projectionStatus: "projected",
        ...inlineMeta({
          observedAtMs: 200,
          terminalAuthorityStatus: "not_terminal_authority",
        }),
        source: "capability_lane",
        suppressedObservationRef: "obs:docs:stale",
        suppressedReceiptRef: "receipt:docs:stale",
        suppressedLaneSessionId: "lane-session-stale",
        suppressedSessionDebugPhase: "paused:stale_observation:suppressed",
        suppressedSessionObservationStatus: "suppressed_stale_observation",
        suppressedProjectionStatus: "stale",
        suppressedChunkId: "chunk-stale",
        suppressedChunkIndex: 9,
        suppressedDedupeKey: "dedupe-stale",
        suppressedSourceEventId: "event-stale",
        suppressedSourceEventMs: 80,
        suppressedObservedAtMs: 100,
        suppressedFreshnessStatus: "stale",
        suppressedTerminalAuthorityStatus: "pending_helix_terminal_authority",
        suppressedContextRole: "tool_evidence",
        suppressedHasObservation: true,
        suppressedSelectedBackendProvider: "live_translation.local_runtime",
        suppressedSourceId: "document_markdown:docs/research/nhm2.md",
        suppressedSourceHash: "source-hash-stale",
        suppressedSourceKind: "document_markdown",
        suppressedAccountLocale: "es-US",
        suppressedProjectionTarget: "docs_chunk",
        suppressedTargetLanguage: "es",
        suppressedCancelRequested: true,
        suppressedReason: "stale_projection_did_not_replace_fresh_text",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    });
  });

  it("treats projection receipt and source hash metadata as part of inline render state identity", () => {
    expect(sameDocumentInlineTranslationRenderState(
      {
        status: "ready",
        text: "Texto gobernado.",
        observationRef: "obs:docs:u1:100",
        receiptRef: "receipt:docs:u1:100",
        projectionStatus: "projected",
        ...inlineMeta(),
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
      {
        status: "ready",
        text: "Texto gobernado.",
        observationRef: "obs:docs:u1:200",
        receiptRef: "receipt:docs:u1:200",
        projectionStatus: "projected",
        ...inlineMeta(),
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    )).toBe(false);

    expect(sameDocumentInlineTranslationRenderState(
      {
        status: "ready",
        text: "Texto gobernado.",
        observationRef: "obs:docs:u1",
        receiptRef: "receipt:docs:u1",
        projectionStatus: "projected",
        sessionDebugPhase: "running:record_observation:observation_recorded",
        sessionObservationStatus: "observation_recorded",
        ...inlineMeta(),
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
      {
        status: "ready",
        text: "Texto gobernado.",
        observationRef: "obs:docs:u1",
        receiptRef: "receipt:docs:u1",
        projectionStatus: "projected",
        sessionDebugPhase: "running:record_observation:waiting",
        sessionObservationStatus: "waiting_for_observation",
        ...inlineMeta(),
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    )).toBe(false);

    expect(sameDocumentInlineTranslationRenderState(
      {
        status: "ready",
        text: "Texto gobernado.",
        observationRef: "obs:docs:u1",
        receiptRef: "receipt:docs:u1",
        projectionStatus: "projected",
        ...inlineMeta({ sourceHash: "fnv1a32:current" }),
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
      {
        status: "ready",
        text: "Texto gobernado.",
        observationRef: "obs:docs:u1",
        receiptRef: "receipt:docs:u1",
        projectionStatus: "projected",
        ...inlineMeta({ sourceHash: "fnv1a32:previous" }),
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    )).toBe(false);

    expect(sameDocumentInlineTranslationRenderState(
      {
        status: "ready",
        text: "Texto gobernado.",
        observationRef: "obs:docs:u1",
        receiptRef: "receipt:docs:u1",
        projectionStatus: "projected",
        suppressedLaneSessionId: "lane-session-suppressed-a",
        ...inlineMeta(),
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
      {
        status: "ready",
        text: "Texto gobernado.",
        observationRef: "obs:docs:u1",
        receiptRef: "receipt:docs:u1",
        projectionStatus: "projected",
        suppressedLaneSessionId: "lane-session-suppressed-b",
        ...inlineMeta(),
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    )).toBe(false);
  });

  it("keeps the existing inline render state map when lane projection metadata is unchanged", () => {
    const laneStates = buildDocumentLiveTranslationInlineStates({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      payload: {
        capability_lane_projection_receipts: [
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:u1",
            observation_ref: "obs:docs:u1",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "projected",
            source_id: "document_markdown:docs/research/nhm2.md",
            chunk_id: "u0001",
            observed_at_ms: 100,
            target_language: "es",
            translated_text: "Texto gobernado.",
          },
        ],
      },
    });
    const current = simplifyDocumentLiveTranslationInlineStates(laneStates);

    expect(mergeDocumentLiveTranslationInlineStates({
      current,
      laneStates,
    })).toBe(current);
  });

  it("keeps the newer ready projection when an older ready receipt arrives late", () => {
    const laneStates = buildDocumentLiveTranslationInlineStates({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      payload: {
        capability_lane_projection_receipts: [
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:u1:older",
            observation_ref: "obs:docs:u1:older",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "projected",
            source_id: "document_markdown:docs/research/nhm2.md",
            chunk_id: "u0001",
            observed_at_ms: 100,
            target_language: "es",
            translated_text: "Texto anterior.",
          },
        ],
      },
    });

    expect(mergeDocumentLiveTranslationInlineStates({
      current: {
        u0001: {
          status: "ready",
          text: "Texto nuevo.",
          observationRef: "obs:docs:u1:newer",
          receiptRef: "receipt:docs:u1:newer",
          projectionStatus: "projected",
          ...inlineMeta({
            chunkId: "u0001",
            observedAtMs: 200,
          }),
          source: "capability_lane",
          answerAuthority: false,
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
      },
      laneStates,
    })).toEqual({
      u0001: {
        status: "ready",
        text: "Texto nuevo.",
        observationRef: "obs:docs:u1:newer",
        receiptRef: "receipt:docs:u1:newer",
        projectionStatus: "projected",
        ...inlineMeta({
          chunkId: "u0001",
          observedAtMs: 200,
        }),
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    });
  });

  it("uses source event time for ready projection ordering when observed time is missing", () => {
    const laneStates = buildDocumentLiveTranslationInlineStates({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      payload: {
        capability_lane_projection_receipts: [
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:u1:older",
            observation_ref: "obs:docs:u1:older",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "projected",
            source_id: "document_markdown:docs/research/nhm2.md",
            chunk_id: "u0001",
            source_event_ms: 100,
            target_language: "es",
            translated_text: "Texto anterior.",
          },
        ],
      },
    });

    expect(mergeDocumentLiveTranslationInlineStates({
      current: {
        u0001: {
          status: "ready",
          text: "Texto nuevo.",
          observationRef: "obs:docs:u1:newer",
          receiptRef: "receipt:docs:u1:newer",
          projectionStatus: "projected",
          ...inlineMeta({
            chunkId: "u0001",
            sourceEventMs: 200,
          }),
          source: "capability_lane",
          answerAuthority: false,
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
      },
      laneStates,
    })).toEqual({
      u0001: {
        status: "ready",
        text: "Texto nuevo.",
        observationRef: "obs:docs:u1:newer",
        receiptRef: "receipt:docs:u1:newer",
        projectionStatus: "projected",
        ...inlineMeta({
          chunkId: "u0001",
          sourceEventMs: 200,
        }),
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    });
  });

  it("keeps newer source-event ready text when an older source event is observed later", () => {
    const laneStates = buildDocumentLiveTranslationInlineStates({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      payload: {
        capability_lane_projection_receipts: [
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:u1:older-source-event",
            observation_ref: "obs:docs:u1:older-source-event",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "projected",
            source_id: "document_markdown:docs/research/nhm2.md",
            chunk_id: "u0001",
            source_event_ms: 100,
            observed_at_ms: 500,
            target_language: "es",
            translated_text: "Texto observado tarde.",
          },
        ],
      },
    });

    expect(mergeDocumentLiveTranslationInlineStates({
      current: {
        u0001: {
          status: "ready",
          text: "Texto de evento mas reciente.",
          observationRef: "obs:docs:u1:newer-source-event",
          receiptRef: "receipt:docs:u1:newer-source-event",
          projectionStatus: "projected",
          ...inlineMeta({
            chunkId: "u0001",
            sourceEventMs: 200,
            observedAtMs: 300,
          }),
          source: "capability_lane",
          answerAuthority: false,
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
      },
      laneStates,
    })).toEqual({
      u0001: {
        status: "ready",
        text: "Texto de evento mas reciente.",
        observationRef: "obs:docs:u1:newer-source-event",
        receiptRef: "receipt:docs:u1:newer-source-event",
        projectionStatus: "projected",
        ...inlineMeta({
          chunkId: "u0001",
          sourceEventMs: 200,
          observedAtMs: 300,
        }),
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    });
  });

  it("uses chunk index as the ready projection ordering tie-breaker", () => {
    const laneStates = buildDocumentLiveTranslationInlineStates({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      payload: {
        capability_lane_projection_receipts: [
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:u1:older-chunk",
            observation_ref: "obs:docs:u1:older-chunk",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "projected",
            source_id: "document_markdown:docs/research/nhm2.md",
            chunk_id: "u0001",
            chunk_index: 1,
            observed_at_ms: 200,
            source_event_ms: 150,
            target_language: "es",
            translated_text: "Texto anterior.",
          },
        ],
      },
    });

    expect(mergeDocumentLiveTranslationInlineStates({
      current: {
        u0001: {
          status: "ready",
          text: "Texto nuevo.",
          observationRef: "obs:docs:u1:newer-chunk",
          receiptRef: "receipt:docs:u1:newer-chunk",
          projectionStatus: "projected",
          ...inlineMeta({
            chunkId: "u0001",
            chunkIndex: 2,
            observedAtMs: 200,
            sourceEventMs: 150,
          }),
          source: "capability_lane",
          answerAuthority: false,
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
      },
      laneStates,
    })).toEqual({
      u0001: {
        status: "ready",
        text: "Texto nuevo.",
        observationRef: "obs:docs:u1:newer-chunk",
        receiptRef: "receipt:docs:u1:newer-chunk",
        projectionStatus: "projected",
        ...inlineMeta({
          chunkId: "u0001",
          chunkIndex: 2,
          observedAtMs: 200,
          sourceEventMs: 150,
        }),
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    });
  });

  it("refreshes ready projection metadata when a retry has equal timing", () => {
    const laneStates = buildDocumentLiveTranslationInlineStates({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      payload: {
        capability_lane_projection_receipts: [
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:u1:retry",
            observation_ref: "obs:docs:u1:retry",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "projected",
            source_id: "document_markdown:docs/research/nhm2.md",
            chunk_id: "u0001",
            observed_at_ms: 200,
            source_event_ms: 150,
            target_language: "es",
            translated_text: "Texto reintentado.",
          },
        ],
      },
    });

    expect(mergeDocumentLiveTranslationInlineStates({
      current: {
        u0001: {
          status: "ready",
          text: "Texto inicial.",
          observationRef: "obs:docs:u1:initial",
          receiptRef: "receipt:docs:u1:initial",
          projectionStatus: "projected",
          ...inlineMeta({
            chunkId: "u0001",
            observedAtMs: 200,
            sourceEventMs: 150,
          }),
          source: "capability_lane",
          answerAuthority: false,
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
      },
      laneStates,
    })).toEqual({
      u0001: {
        status: "ready",
        text: "Texto reintentado.",
        observationRef: "obs:docs:u1:retry",
        receiptRef: "receipt:docs:u1:retry",
        projectionStatus: "projected",
        ...inlineMeta({
          chunkId: "u0001",
          observedAtMs: 200,
          sourceEventMs: 150,
        }),
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    });
  });

  it("keeps ready text when a newer cancelled projection state arrives", () => {
    const laneStates = buildDocumentLiveTranslationInlineStates({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      payload: {
        capability_lane_projection_receipts: [
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:u1:cancelled",
            observation_ref: "obs:docs:u1:cancelled",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "cancelled",
            source_id: "document_markdown:docs/research/nhm2.md",
            chunk_id: "u0001",
            observed_at_ms: 300,
            target_language: "es",
            cancel_requested: true,
          },
        ],
      },
    });

    expect(mergeDocumentLiveTranslationInlineStates({
      current: {
        u0001: {
          status: "ready",
          text: "Texto activo.",
          observationRef: "obs:docs:u1:ready",
          receiptRef: "receipt:docs:u1:ready",
          projectionStatus: "projected",
          ...inlineMeta({
            chunkId: "u0001",
            observedAtMs: 200,
          }),
          source: "capability_lane",
          answerAuthority: false,
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
      },
      laneStates,
    })).toEqual({
      u0001: {
        status: "ready",
        text: "Texto activo.",
        observationRef: "obs:docs:u1:ready",
        receiptRef: "receipt:docs:u1:ready",
        projectionStatus: "projected",
        ...inlineMeta({
          chunkId: "u0001",
          observedAtMs: 200,
        }),
        suppressedObservationRef: "obs:docs:u1:cancelled",
        suppressedReceiptRef: "receipt:docs:u1:cancelled",
        suppressedProjectionStatus: "cancelled",
        suppressedChunkId: "u0001",
        suppressedChunkIndex: null,
        suppressedDedupeKey: null,
        suppressedSourceEventId: null,
        suppressedSourceEventMs: null,
        suppressedObservedAtMs: 300,
        suppressedFreshnessStatus: "unknown",
        suppressedTerminalAuthorityStatus: "not_terminal_authority",
        suppressedContextRole: "tool_evidence",
        suppressedHasObservation: true,
        suppressedSourceId: "document_markdown:docs/research/nhm2.md",
        suppressedSourceHash: null,
        suppressedSourceKind: null,
        suppressedAccountLocale: null,
        suppressedProjectionTarget: "docs_chunk",
        suppressedTargetLanguage: "es",
        suppressedCancelRequested: true,
        suppressedReason: "cancelled_projection_did_not_replace_ready_text",
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    });
  });

  it("preserves source event metadata when suppressing cancellation over ready text", () => {
    const laneStates = buildDocumentLiveTranslationInlineStates({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      payload: {
        capability_lane_projection_receipts: [
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:u1:cancelled",
            observation_ref: "obs:docs:u1:cancelled",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "cancelled",
            source_id: "document_markdown:docs/research/nhm2.md",
            chunk_id: "u0001",
            source_event_ms: 300,
            target_language: "es",
            cancel_requested: true,
          },
        ],
      },
    });

    expect(mergeDocumentLiveTranslationInlineStates({
      current: {
        u0001: {
          status: "ready",
          text: "Texto activo.",
          observationRef: "obs:docs:u1:ready",
          receiptRef: "receipt:docs:u1:ready",
          projectionStatus: "projected",
          ...inlineMeta({
            chunkId: "u0001",
            sourceEventMs: 200,
          }),
          source: "capability_lane",
          answerAuthority: false,
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
      },
      laneStates,
    })).toEqual({
      u0001: {
        status: "ready",
        text: "Texto activo.",
        observationRef: "obs:docs:u1:ready",
        receiptRef: "receipt:docs:u1:ready",
        projectionStatus: "projected",
        ...inlineMeta({
          chunkId: "u0001",
          sourceEventMs: 200,
        }),
        suppressedObservationRef: "obs:docs:u1:cancelled",
        suppressedReceiptRef: "receipt:docs:u1:cancelled",
        suppressedProjectionStatus: "cancelled",
        suppressedChunkId: "u0001",
        suppressedChunkIndex: null,
        suppressedDedupeKey: null,
        suppressedSourceEventId: null,
        suppressedSourceEventMs: 300,
        suppressedObservedAtMs: null,
        suppressedFreshnessStatus: "unknown",
        suppressedTerminalAuthorityStatus: "not_terminal_authority",
        suppressedContextRole: "tool_evidence",
        suppressedHasObservation: true,
        suppressedSourceId: "document_markdown:docs/research/nhm2.md",
        suppressedSourceHash: null,
        suppressedSourceKind: null,
        suppressedAccountLocale: null,
        suppressedProjectionTarget: "docs_chunk",
        suppressedTargetLanguage: "es",
        suppressedCancelRequested: true,
        suppressedReason: "cancelled_projection_did_not_replace_ready_text",
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    });
  });

  it("keeps newer ready text when older cancelled or failed receipts arrive late", () => {
    const laneStates = buildDocumentLiveTranslationInlineStates({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001"), unit("u0002")],
      payload: {
        capability_lane_projection_receipts: [
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:u1:cancelled:older",
            observation_ref: "obs:docs:u1:cancelled:older",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "cancelled",
            source_id: "document_markdown:docs/research/nhm2.md",
            chunk_id: "u0001",
            observed_at_ms: 100,
            target_language: "es",
            cancel_requested: true,
          },
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:u2:failed:older",
            observation_ref: "obs:docs:u2:failed:older",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "failed",
            source_id: "document_markdown:docs/research/nhm2.md",
            chunk_id: "u0002",
            observed_at_ms: 110,
            target_language: "es",
            error: "backend_unconfigured",
          },
        ],
      },
    });

    expect(mergeDocumentLiveTranslationInlineStates({
      current: {
        u0001: {
          status: "ready",
          text: "Texto activo uno.",
          observationRef: "obs:docs:u1:ready:newer",
          receiptRef: "receipt:docs:u1:ready:newer",
          projectionStatus: "projected",
          ...inlineMeta({
            chunkId: "u0001",
            observedAtMs: 200,
          }),
          source: "capability_lane",
          answerAuthority: false,
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
        u0002: {
          status: "ready",
          text: "Texto activo dos.",
          observationRef: "obs:docs:u2:ready:newer",
          receiptRef: "receipt:docs:u2:ready:newer",
          projectionStatus: "projected",
          ...inlineMeta({
            chunkId: "u0002",
            observedAtMs: 210,
          }),
          source: "capability_lane",
          answerAuthority: false,
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
      },
      laneStates,
    })).toEqual({
      u0001: {
        status: "ready",
        text: "Texto activo uno.",
        observationRef: "obs:docs:u1:ready:newer",
        receiptRef: "receipt:docs:u1:ready:newer",
        projectionStatus: "projected",
        ...inlineMeta({
          chunkId: "u0001",
          observedAtMs: 200,
        }),
        suppressedObservationRef: "obs:docs:u1:cancelled:older",
        suppressedReceiptRef: "receipt:docs:u1:cancelled:older",
        suppressedProjectionStatus: "cancelled",
        suppressedChunkId: "u0001",
        suppressedChunkIndex: null,
        suppressedDedupeKey: null,
        suppressedSourceEventId: null,
        suppressedSourceEventMs: null,
        suppressedObservedAtMs: 100,
        suppressedFreshnessStatus: "unknown",
        suppressedTerminalAuthorityStatus: "not_terminal_authority",
        suppressedContextRole: "tool_evidence",
        suppressedHasObservation: true,
        suppressedSourceId: "document_markdown:docs/research/nhm2.md",
        suppressedSourceHash: null,
        suppressedSourceKind: null,
        suppressedAccountLocale: null,
        suppressedProjectionTarget: "docs_chunk",
        suppressedTargetLanguage: "es",
        suppressedCancelRequested: true,
        suppressedReason: "cancelled_projection_did_not_replace_ready_text",
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
      u0002: {
        status: "ready",
        text: "Texto activo dos.",
        observationRef: "obs:docs:u2:ready:newer",
        receiptRef: "receipt:docs:u2:ready:newer",
        projectionStatus: "projected",
        ...inlineMeta({
          chunkId: "u0002",
          observedAtMs: 210,
        }),
        suppressedObservationRef: "obs:docs:u2:failed:older",
        suppressedReceiptRef: "receipt:docs:u2:failed:older",
        suppressedProjectionStatus: "failed",
        suppressedChunkId: "u0002",
        suppressedChunkIndex: null,
        suppressedDedupeKey: null,
        suppressedSourceEventId: null,
        suppressedSourceEventMs: null,
        suppressedObservedAtMs: 110,
        suppressedFreshnessStatus: "unknown",
        suppressedTerminalAuthorityStatus: "not_terminal_authority",
        suppressedContextRole: "tool_evidence",
        suppressedHasObservation: true,
        suppressedSourceId: "document_markdown:docs/research/nhm2.md",
        suppressedSourceHash: null,
        suppressedSourceKind: null,
        suppressedAccountLocale: null,
        suppressedProjectionTarget: "docs_chunk",
        suppressedTargetLanguage: "es",
        suppressedCancelRequested: false,
        suppressedReason: "failed_projection_did_not_replace_ready_text",
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    });
  });

  it("keeps the newest non-terminal projection error receipt inspectable", () => {
    const newerErrorLaneStates = buildDocumentLiveTranslationInlineStates({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      payload: {
        capability_lane_projection_receipts: [
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:u1:failed:newer",
            observation_ref: "obs:docs:u1:failed:newer",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "failed",
            source_id: "document_markdown:docs/research/nhm2.md",
            chunk_id: "u0001",
            source_event_ms: 400,
            observed_at_ms: 425,
            target_language: "es",
            error: "backend_unconfigured",
          },
        ],
      },
    });

    const current = {
      u0001: {
        status: "error",
        error: "translation_projection_cancelled",
        observationRef: "obs:docs:u1:cancelled:older",
        receiptRef: "receipt:docs:u1:cancelled:older",
        projectionStatus: "cancelled",
        ...inlineMeta({
          chunkId: "u0001",
          sourceEventMs: 300,
          observedAtMs: 325,
          cancelRequested: true,
        }),
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    } satisfies Record<string, ReturnType<typeof mergeDocumentLiveTranslationInlineStates>[string]>;

    expect(mergeDocumentLiveTranslationInlineStates({
      current,
      laneStates: newerErrorLaneStates,
    })).toMatchObject({
      u0001: {
        status: "error",
        error: "translation_projection_failed",
        observationRef: "obs:docs:u1:failed:newer",
        receiptRef: "receipt:docs:u1:failed:newer",
        projectionStatus: "failed",
        sourceEventMs: 400,
        observedAtMs: 425,
        cancelRequested: false,
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    });

    const olderErrorLaneStates = buildDocumentLiveTranslationInlineStates({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      payload: {
        capability_lane_projection_receipts: [
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:u1:cancelled:older",
            observation_ref: "obs:docs:u1:cancelled:older",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "cancelled",
            source_id: "document_markdown:docs/research/nhm2.md",
            chunk_id: "u0001",
            source_event_ms: 300,
            observed_at_ms: 325,
            target_language: "es",
            cancel_requested: true,
          },
        ],
      },
    });
    const newerCurrent = mergeDocumentLiveTranslationInlineStates({
      current,
      laneStates: newerErrorLaneStates,
    });

    expect(mergeDocumentLiveTranslationInlineStates({
      current: newerCurrent,
      laneStates: olderErrorLaneStates,
    })).toBe(newerCurrent);
  });

  it("keeps newer suppressed receipt metadata when an older suppressed receipt arrives late", () => {
    const laneStates = buildDocumentLiveTranslationInlineStates({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      payload: {
        capability_lane_projection_receipts: [
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:u1:cancelled:older",
            observation_ref: "obs:docs:u1:cancelled:older",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "cancelled",
            source_id: "document_markdown:docs/research/nhm2.md",
            chunk_id: "u0001",
            source_event_ms: 300,
            target_language: "es",
            cancel_requested: true,
          },
        ],
      },
    });

    const current = {
      u0001: {
        status: "ready",
        text: "Texto activo.",
        observationRef: "obs:docs:u1:ready",
        receiptRef: "receipt:docs:u1:ready",
        projectionStatus: "projected",
        ...inlineMeta({
          chunkId: "u0001",
          observedAtMs: 200,
        }),
        suppressedObservationRef: "obs:docs:u1:failed:newer",
        suppressedReceiptRef: "receipt:docs:u1:failed:newer",
        suppressedProjectionStatus: "failed",
        suppressedChunkId: "u0001",
        suppressedChunkIndex: null,
        suppressedDedupeKey: null,
        suppressedSourceEventId: null,
        suppressedSourceEventMs: 400,
        suppressedObservedAtMs: null,
        suppressedFreshnessStatus: "unknown",
        suppressedTerminalAuthorityStatus: "not_terminal_authority",
        suppressedContextRole: "tool_evidence",
        suppressedHasObservation: true,
        suppressedSourceId: "document_markdown:docs/research/nhm2.md",
        suppressedSourceHash: null,
        suppressedSourceKind: null,
        suppressedAccountLocale: null,
        suppressedProjectionTarget: "docs_chunk",
        suppressedTargetLanguage: "es",
        suppressedCancelRequested: false,
        suppressedReason: "failed_projection_did_not_replace_ready_text",
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    } satisfies Record<string, ReturnType<typeof mergeDocumentLiveTranslationInlineStates>[string]>;

    expect(mergeDocumentLiveTranslationInlineStates({
      current,
      laneStates,
    })).toBe(current);
  });

  it("converts stored visible docs chunk projections back into non-terminal inline render state", () => {
    const visibleStates = buildHelixVisibleTranslationProjections({
      capability_lane_projection_receipts: [
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:visible:u1",
          observation_ref: "obs:visible:u1",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_chunk",
          projection_status: "projected",
          source_id: "document_markdown:docs/research/nhm2.md",
          doc_path: "docs/research/nhm2.md",
          source_hash: "source-hash",
          source_text_hash: "chunk-source-hash",
          source_text_char_count: 13,
          chunk_id: "u0001",
          chunk_index: 0,
          translated_text: "Texto visible.",
          observed_at_ms: 500,
          target_language: "es",
          account_locale: "es-US",
          terminal_authority_status: "not_terminal_authority",
          selected_backend_provider: "live_translation.local_runtime",
        },
      ],
    });

    const laneStates = buildDocumentLiveTranslationInlineStates({
      docPath: "docs/research/nhm2.md",
      locale: "es-US",
      targetLanguage: "es",
      sourceHash: "source-hash",
      units: [unit("u0001")],
      payload: {
        capability_lane_projection_receipts: visibleStates.map((state) =>
          buildHelixLiveTranslationProjectionReceiptFromProjection(state.projection)
        ),
      },
    });

    expect(laneStates.u0001).toMatchObject({
      status: "ready",
      text: "Texto visible.",
      observationRef: "obs:visible:u1",
      receiptRef: "receipt:visible:u1",
      projectionStatus: "projected",
      source: "capability_lane",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
      terminalAuthorityStatus: "not_terminal_authority",
    });
  });

  it("renders merged visible docs chunk projection receipts as governed non-terminal document blocks", () => {
    clearHelixVisibleTranslationProjectionContext();

    publishHelixVisibleTranslationProjectionsFromPayload({
      capability_lane_projection_receipts: [
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:visible:u1",
          observation_ref: "obs:visible:u1",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_chunk",
          projection_status: "projected",
          source_id: "document_markdown:docs/research/nhm2.md",
          doc_path: "docs/research/nhm2.md",
          source_hash: "source-hash",
          source_kind: "docs_viewer",
          source_text_hash: "chunk-source-hash",
          source_text_char_count: 13,
          chunk_id: "u0001",
          chunk_index: 0,
          translated_text: "Primer bloque visible.",
          source_event_id: "visible:event:u1",
          source_event_ms: 500,
          observed_at_ms: 550,
          target_language: "es",
          account_locale: "es-US",
          terminal_authority_status: "not_terminal_authority",
          selected_runtime_agent_provider: "codex",
          selected_backend_provider: "live_translation.local_runtime",
          answer_authority: false,
          terminal_eligible: false,
          assistant_answer: false,
          raw_content_included: false,
        },
      ],
    });
    publishHelixVisibleTranslationProjectionsFromPayload({
      capability_lane_projection_receipts: [
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:visible:u2",
          observation_ref: "obs:visible:u2",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_chunk",
          projection_status: "projected",
          source_id: "document_markdown:docs/research/nhm2.md",
          doc_path: "docs/research/nhm2.md",
          source_hash: "source-hash",
          source_kind: "docs_viewer",
          source_text_hash: "chunk-source-hash",
          source_text_char_count: 13,
          chunk_id: "u0002",
          chunk_index: 1,
          translated_text: "Segundo bloque visible.",
          source_event_id: "visible:event:u2",
          source_event_ms: 600,
          observed_at_ms: 650,
          target_language: "es",
          account_locale: "es-US",
          terminal_authority_status: "not_terminal_authority",
          selected_runtime_agent_provider: "codex",
          selected_backend_provider: "live_translation.local_runtime",
          answer_authority: false,
          terminal_eligible: false,
          assistant_answer: false,
          raw_content_included: false,
        },
      ],
    });

    const visibleStates = readHelixVisibleTranslationProjectionContext();
    const laneStates = buildDocumentLiveTranslationInlineStates({
      docPath: "docs/research/nhm2.md",
      locale: "es-US",
      targetLanguage: "es",
      sourceHash: "source-hash",
      units: [unit("u0001"), unit("u0002")],
      payload: {
        capability_lane_projection_receipts: visibleStates.map((state) =>
          buildHelixLiveTranslationProjectionReceiptFromProjection(state.projection)
        ),
      },
    });
    const merged = mergeDocumentLiveTranslationInlineStates({
      current: {},
      laneStates,
    });
    const html = renderDocumentMarkdownWithInlineTranslations({
      units: [unit("u0001"), unit("u0002")],
      translations: merged,
      loadingText: "Translating",
      errorText: (reason) => `Translation blocked: ${reason}`,
      fallbackErrorText: "unknown",
    });

    expect(visibleStates).toHaveLength(2);
    expect(merged).toMatchObject({
      u0001: {
        status: "ready",
        text: "Primer bloque visible.",
        observationRef: "obs:visible:u1",
        receiptRef: "receipt:visible:u1",
        sourceEventMs: 500,
        selectedRuntimeAgentProvider: "codex",
        selectedBackendProvider: "live_translation.local_runtime",
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
      u0002: {
        status: "ready",
        text: "Segundo bloque visible.",
        observationRef: "obs:visible:u2",
        receiptRef: "receipt:visible:u2",
        sourceEventMs: 600,
        selectedRuntimeAgentProvider: "codex",
        selectedBackendProvider: "live_translation.local_runtime",
        source: "capability_lane",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    });
    expect(html).toContain("Primer bloque visible.");
    expect(html).toContain("Segundo bloque visible.");
    expect(html).toContain('data-doc-translation-role="governed-inline-projection"');
    expect(html).toContain('data-doc-translation-authority-policy="projection_only_not_answer_authority"');
    expect(html).toContain('data-doc-translation-answer-authority="false"');
    expect(html).toContain('data-doc-translation-terminal-eligible="false"');
    expect(html).toContain('data-doc-translation-selected-runtime-agent-provider="codex"');
    expect(html).toContain('data-doc-translation-source-event-ms="500"');
    expect(html).toContain('data-doc-translation-source-event-ms="600"');

    clearHelixVisibleTranslationProjectionContext();
  });
});
