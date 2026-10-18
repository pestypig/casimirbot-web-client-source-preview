import { describe, expect, it, vi, beforeEach } from "vitest";
import type { DocumentTranslationUnit } from "@shared/document-translation";
import { buildDocumentInlineTranslationDataAttributes } from "@/lib/docs/liveTranslationInlineProjection";
import {
  clearDocumentLiveTranslationProjectionRegistry,
  documentLiveTranslationProjectionRegistryKey,
  ingestDocumentLiveTranslationProjection,
  ingestDocumentLiveTranslationProjectionFromAskLiveEvent,
  readDocumentLiveTranslationProjectionSnapshot,
  summarizeDocumentLiveTranslationProjectionSnapshot,
  subscribeDocumentLiveTranslationProjectionRegistry,
} from "@/lib/docs/liveTranslationProjectionRegistry";

const unit = (unitId: string): DocumentTranslationUnit => ({
  unit_id: unitId,
  kind: "paragraph",
  source_markdown: `Source ${unitId}`,
  translatable: true,
  protected_spans: [],
});

const projectedPayload = (
  text: string,
  observedAtMs = 100,
  overrides: Record<string, unknown> = {},
) => ({
  capability_lane_projection_receipts: [
    {
      schema: "helix.live_translation.projection_receipt.v1",
      receipt_ref: `receipt:docs:u1:${observedAtMs}`,
      observation_ref: `obs:docs:u1:${observedAtMs}`,
      lane_id: "live_translation",
      capability: "live_translation.translate_text",
      projection_target: "docs_chunk",
      projection_status: "projected",
      source_id: "document_markdown:docs/research/nhm2.md",
      chunk_id: "u0001",
      observed_at_ms: observedAtMs,
      target_language: "es",
      translated_text: text,
      ...overrides,
    },
  ],
});

const registryMeta = (overrides: Record<string, unknown> = {}) => ({
  chunkId: "u0001",
  chunkIndex: null,
  dedupeKey: null,
  sourceEventId: null,
  sourceEventMs: null,
  observedAtMs: 100,
  laneSessionId: null,
  observationLaneSessionId: null,
  goalBindingId: null,
  latestEventId: null,
  hasObservation: true,
  selectedBackendProvider: null,
  freshnessStatus: "unknown",
  terminalAuthorityStatus: "not_terminal_authority",
  sourceId: "document_markdown:docs/research/nhm2.md",
  sourceKind: null,
  accountLocale: null,
  projectionTarget: "docs_chunk",
  targetLanguage: "es",
  cancelRequested: false,
  contextRole: "tool_evidence",
  ...overrides,
});

const laneSessionLiveEvent = (overrides: Record<string, unknown> = {}) => ({
  contextId: "helix-ask:desktop",
  entry: {
    id: "lane-session-live-event",
    text: "Lane session update.",
    meta: {
      source_event_type: "lane_session",
      lane: "live_translation",
      laneSessionId: "lane-session-docs",
      lifecycleAction: "start",
      permissionProfile: "permissions non-mutating",
      sessionStatus: "running",
      sessionHealth: "healthy",
      sourceId: "document_markdown:docs/research/nhm2.md",
      sourceKind: "docs",
      sourceTextHash: "source-text-hash-session",
      sourceTextCharCount: 2048,
      latestProjectionTarget: "docs_chunk",
      accountLocale: "es-US",
      targetLanguage: "es",
      selectedBackendProvider: "live_translation.local_runtime",
      latestChunkId: "u0001",
      latestChunkIndex: 0,
      latestDedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
      latestSourceEventId: "docs:event:1",
      latestSourceEventMs: 250,
      latestObservedAtMs: 300,
      latestFreshnessStatus: "fresh",
      latestEventId: "lane-session-docs:observation_recorded:300",
      latestSessionReason: "lane_session_observation_recorded",
      sessionDebugPhase: "running:record_observation:observation_recorded",
      sessionObservationStatus: "observation_recorded",
      sessionControlKey: "lane-session-docs::fnv1a32:session::docs_chunk::es-US::es",
      sourceBindingKey: "docs:nhm2::fnv1a32:session::docs_chunk::es-US::es",
      latestSourceBindingKey: "docs:nhm2::fnv1a32:session-latest::docs_chunk::es-US::es",
      sourceIdentityKey: "docs:nhm2::fnv1a32:session::docs::docs_chunk::es-US::es",
      laneSessionSourceBindingKey: "docs:nhm2::fnv1a32:session::docs_chunk::es-US::es",
      laneSessionSourceIdentityKey: "docs:nhm2::fnv1a32:session::docs::docs_chunk::es-US::es",
      latestObservationKey: "docs:nhm2::fnv1a32:session::docs_chunk::es::u0001::obs:lane-session-docs",
      hasObservation: true,
      observationRef: "obs:lane-session-docs",
      receiptRef: "receipt:lane-session-docs",
      updatedAtMs: 325,
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
      ...overrides,
    },
  },
});

const laneMailLoopLiveEvent = (overrides: Record<string, unknown> = {}) => ({
  contextId: "helix-ask:desktop",
  entry: {
    id: "lane-mail-loop-live-event",
    text: "Lane mail loop update.",
    meta: {
      source_event_type: "lane_mail_loop",
      lane: "live_translation",
      laneSessionId: "lane-session-docs",
      observationLaneSessionId: "lane-session-docs-observation",
      sourceId: "document_markdown:docs/research/nhm2.md",
      sourceKind: "docs",
      sourceTextHash: "source-text-hash-mail",
      sourceTextCharCount: 2048,
      accountLocale: "es-US",
      latestProjectionTarget: "docs_chunk",
      latestChunkId: "u0001",
      latestChunkIndex: 0,
      latestDedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
      latestSourceEventId: "docs:event:1",
      latestSourceEventMs: 250,
      latestObservedAtMs: 300,
      latestFreshnessStatus: "fresh",
      targetLanguage: "es",
      laneSessionControlKey: "lane-session-docs::fnv1a32:mail::docs_chunk::es-US::es",
      latestSourceBindingKey: "docs:nhm2::fnv1a32:mail-latest::docs_chunk::es-US::es",
      laneSessionSourceBindingKey: "docs:nhm2::fnv1a32:mail::docs_chunk::es-US::es",
      laneSessionSourceIdentityKey: "docs:nhm2::fnv1a32:mail::docs::docs_chunk::es-US::es",
      sourceIdentityKey: "docs:nhm2::fnv1a32:mail-packet::docs::docs_chunk::es-US::es",
      mailLoopObservationKey: "docs:nhm2::fnv1a32:mail::docs_chunk::es::u0001::obs:lane-mail-loop-docs",
      stagePlayMailId: "stage-play-mail-translation",
      stagePlayWakeExpected: true,
      mailboxThreadId: "thread-docs-translation",
      mailStatus: "unread",
      selectedBackendProvider: "live_translation.local_runtime",
      observationRef: "obs:lane-mail-loop-docs",
      receiptRef: "receipt:lane-mail-loop-docs",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
      ...overrides,
    },
  },
});

const laneGoalBindingLiveEvent = (overrides: Record<string, unknown> = {}) => ({
  contextId: "helix-ask:desktop",
  entry: {
    id: "goal-binding-translate-docs",
    text: "Goal-bound lane session update.",
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
      reportReason: "goal_lane_evidence_recorded_for_debug_only",
      quietBehaviorApplied: true,
      wakeExpected: false,
      mailboxWakeExpected: false,
      decisionWakeExpected: false,
      surfaceBadgeExpected: false,
      terminalReportRequested: false,
      terminalReportAuthorized: false,
      selectedBackendProvider: "live_translation.local_runtime",
      sourceId: "document_markdown:docs/research/nhm2.md",
      sourceKind: "docs",
      sourceTextHash: "source-text-hash-goal",
      sourceTextCharCount: 2048,
      accountLocale: "es-US",
      latestProjectionTarget: "docs_chunk",
      targetLanguage: "es",
      latestChunkId: "u0001",
      latestChunkIndex: 0,
      latestDedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
      latestSourceEventId: "docs:event:1",
      latestSourceEventMs: 250,
      latestObservedAtMs: 300,
      latestFreshnessStatus: "fresh",
      latestEventId: "goal-binding-translate-docs:observation_recorded:300",
      sessionControlKey: "lane-session-docs::fnv1a32:goal::docs_chunk::es-US::es",
      goalBindingKey: "goal:account-language::goal-binding-translate-docs::lane-session-docs::live_translation",
      sourceBindingKey: "docs:nhm2::fnv1a32:goal::docs_chunk::es-US::es",
      latestSourceBindingKey: "docs:nhm2::fnv1a32:goal-latest::docs_chunk::es-US::es",
      sourceIdentityKey: "docs:nhm2::fnv1a32:goal::docs::docs_chunk::es-US::es",
      laneSessionSourceBindingKey: "docs:nhm2::fnv1a32:goal-session::docs_chunk::es-US::es",
      laneSessionSourceIdentityKey: "docs:nhm2::fnv1a32:goal-session::docs::docs_chunk::es-US::es",
      latestObservationKey: "docs:nhm2::fnv1a32:goal::docs_chunk::es::u0001::obs:goal-binding-docs",
      latestMailLoopObservationKey: "docs:nhm2::fnv1a32:goal::docs_chunk::es::u0001::receipt:goal-binding-docs",
      hasObservation: true,
      observationRef: "obs:goal-binding-docs",
      receiptRef: "receipt:goal-binding-docs",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
      ...overrides,
    },
  },
});

describe("document live translation projection registry", () => {
  beforeEach(() => {
    clearDocumentLiveTranslationProjectionRegistry();
  });

  it("stores governed lane projections by document, locale, and projection target", () => {
    expect(documentLiveTranslationProjectionRegistryKey({
      docPath: "docs/research/nhm2.md",
      locale: "ES",
      projectionTarget: null,
    })).toBe("docs/research/nhm2.md|es|docs_chunk");

    const snapshot = ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      payload: projectedPayload("Texto gobernado."),
    });

    expect(snapshot).toMatchObject({
      version: 1,
      translations: {
        u0001: {
          status: "ready",
          text: "Texto gobernado.",
        },
      },
    });
    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
    })).toBe(snapshot);
  });

  it("treats receipt-only mail-loop live events as inspectable non-answer evidence", () => {
    const snapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:mail",
      units: [unit("u0001")],
      eventPayload: laneMailLoopLiveEvent({
        sourceHash: "fnv1a32:mail",
        observationRef: undefined,
        observation_ref: undefined,
        hasObservation: undefined,
        has_observation: undefined,
        receiptRef: "receipt:lane-mail-loop-docs-only",
        mailLoopObservationKey: "docs:nhm2::fnv1a32:mail::docs_chunk::es::u0001::receipt:lane-mail-loop-docs-only",
      }),
    });

    expect(snapshot.mailLoops["stage-play-mail-translation"]).toMatchObject({
      observationRef: null,
      receiptRef: "receipt:lane-mail-loop-docs-only",
      latestMailLoopObservationKey:
        "docs:nhm2::fnv1a32:mail::docs_chunk::es::u0001::receipt:lane-mail-loop-docs-only",
      hasObservation: true,
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(snapshot)).toMatchObject({
      mailLoopCount: 1,
      observedMailLoopCount: 1,
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("keeps direct governed lane projections separated by projection target", () => {
    const chunkSnapshot = ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      projectionTarget: "docs_chunk",
      units: [unit("u0001")],
      payload: projectedPayload("Texto del documento.", 100, {
        projection_target: "docs_chunk",
        receipt_ref: "receipt:docs:u1:chunk",
        observation_ref: "obs:docs:u1:chunk",
      }),
    });

    const hoverSnapshot = ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      projectionTarget: "docs_hover",
      units: [unit("u0001")],
      payload: projectedPayload("Texto hover.", 200, {
        projection_target: "docs_hover",
        receipt_ref: "receipt:docs:u1:hover",
        observation_ref: "obs:docs:u1:hover",
      }),
    });

    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      projectionTarget: "docs_chunk",
    })).toBe(chunkSnapshot);
    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      projectionTarget: "docs_hover",
    })).toBe(hoverSnapshot);
    expect(chunkSnapshot.translations.u0001).toMatchObject({
      status: "ready",
      text: "Texto del documento.",
      observationRef: "obs:docs:u1:chunk",
      receiptRef: "receipt:docs:u1:chunk",
      projectionTarget: "docs_chunk",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(hoverSnapshot.translations.u0001).toMatchObject({
      status: "ready",
      text: "Texto hover.",
      observationRef: "obs:docs:u1:hover",
      receiptRef: "receipt:docs:u1:hover",
      projectionTarget: "docs_hover",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("can scope governed lane projections by document source hash", () => {
    expect(documentLiveTranslationProjectionRegistryKey({
      docPath: "docs/research/nhm2.md",
      locale: "ES",
      sourceHash: "fnv1a32:new",
      projectionTarget: null,
    })).toBe("docs/research/nhm2.md|es|docs_chunk|fnv1a32:new");

    const oldSnapshot = ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:old",
      units: [unit("u0001")],
      payload: projectedPayload("Texto anterior.", 100, { source_hash: "fnv1a32:old" }),
    });
    const newSnapshot = ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:new",
      units: [unit("u0001")],
      payload: projectedPayload("Texto nuevo.", 200, { source_hash: "fnv1a32:new" }),
    });

    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:old",
    })).toBe(oldSnapshot);
    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:new",
    })).toBe(newSnapshot);
    expect(newSnapshot.translations.u0001).toMatchObject({
      status: "ready",
      text: "Texto nuevo.",
    });
  });

  it("scopes same-source-hash projections by source identity when provided", () => {
    const visibleIdentity =
      "document_markdown:docs/research/nhm2.md::fnv1a32:current-document::fnv1a32:visible-chunk::17::docs::docs_chunk::es-US::es-US";
    const staleIdentity =
      "document_markdown:docs/research/nhm2.md::fnv1a32:current-document::fnv1a32:stale-chunk::19::docs::docs_chunk::es-US::es-US";

    expect(documentLiveTranslationProjectionRegistryKey({
      docPath: "docs/research/nhm2.md",
      locale: "es-US",
      sourceHash: "fnv1a32:current-document",
      sourceIdentityKey: visibleIdentity,
      projectionTarget: "docs_chunk",
    })).toBe(`docs/research/nhm2.md|es-us|docs_chunk|fnv1a32:current-document|source_identity:${visibleIdentity}`);

    const visibleSnapshot = ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es-US",
      sourceHash: "fnv1a32:current-document",
      sourceIdentityKey: visibleIdentity,
      units: [unit("u0001")],
      payload: projectedPayload("Texto visible.", 100, {
        source_hash: "fnv1a32:current-document",
        source_text_hash: "fnv1a32:visible-chunk",
        source_text_char_count: 17,
        source_identity_key: visibleIdentity,
      }),
    });
    const staleSnapshot = ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es-US",
      sourceHash: "fnv1a32:current-document",
      sourceIdentityKey: staleIdentity,
      units: [unit("u0001")],
      payload: projectedPayload("Texto obsoleto.", 90, {
        source_hash: "fnv1a32:current-document",
        source_text_hash: "fnv1a32:stale-chunk",
        source_text_char_count: 19,
        source_identity_key: staleIdentity,
      }),
    });

    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es-US",
      sourceHash: "fnv1a32:current-document",
      sourceIdentityKey: visibleIdentity,
      projectionTarget: "docs_chunk",
    })).toBe(visibleSnapshot);
    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es-US",
      sourceHash: "fnv1a32:current-document",
      sourceIdentityKey: staleIdentity,
      projectionTarget: "docs_chunk",
    })).toBe(staleSnapshot);
    expect(visibleSnapshot.translations.u0001).toMatchObject({
      status: "ready",
      text: "Texto visible.",
      sourceIdentityKey: visibleIdentity,
    });
    expect(staleSnapshot.translations.u0001).toMatchObject({
      status: "ready",
      text: "Texto obsoleto.",
      sourceIdentityKey: staleIdentity,
    });
    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es-US",
      sourceHash: "fnv1a32:current-document",
      projectionTarget: "docs_chunk",
    })).toMatchObject({
      version: 0,
      translations: {},
    });
  });

  it("keeps the newest non-terminal projection error receipt in the registry", () => {
    const input = {
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:current",
      units: [unit("u0001")],
    };

    const cancelledSnapshot = ingestDocumentLiveTranslationProjection({
      ...input,
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
            source_hash: "fnv1a32:current",
            chunk_id: "u0001",
            source_event_ms: 300,
            observed_at_ms: 325,
            target_language: "es",
            cancel_requested: true,
          },
        ],
      },
    });
    const failedSnapshot = ingestDocumentLiveTranslationProjection({
      ...input,
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
            source_hash: "fnv1a32:current",
            chunk_id: "u0001",
            source_event_ms: 400,
            observed_at_ms: 425,
            target_language: "es",
            error: "backend_unconfigured",
          },
        ],
      },
    });
    const lateCancelledSnapshot = ingestDocumentLiveTranslationProjection({
      ...input,
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
            source_hash: "fnv1a32:current",
            chunk_id: "u0001",
            source_event_ms: 300,
            observed_at_ms: 325,
            target_language: "es",
            cancel_requested: true,
          },
        ],
      },
    });

    expect(cancelledSnapshot.translations.u0001).toMatchObject({
      status: "error",
      error: "translation_projection_cancelled",
      observationRef: "obs:docs:u1:cancelled:older",
      receiptRef: "receipt:docs:u1:cancelled:older",
      projectionStatus: "cancelled",
      sourceEventMs: 300,
      observedAtMs: 325,
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(failedSnapshot.translations.u0001).toMatchObject({
      status: "error",
      error: "translation_projection_failed",
      observationRef: "obs:docs:u1:failed:newer",
      receiptRef: "receipt:docs:u1:failed:newer",
      projectionStatus: "failed",
      sourceEventMs: 400,
      observedAtMs: 425,
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(lateCancelledSnapshot).toBe(failedSnapshot);
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(lateCancelledSnapshot)).toMatchObject({
      displayStatus: "failed",
      latestObservationRef: "obs:docs:u1:failed:newer",
      latestReceiptRef: "receipt:docs:u1:failed:newer",
      latestProjectionStatus: "failed",
      latestSourceEventMs: 400,
      latestObservedAtMs: 425,
      latestTerminalAuthorityStatus: "not_terminal_authority",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("can scope governed lane projections by source text identity when provided", () => {
    const staleSnapshot = ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:current-doc",
      sourceTextHash: "source-text-current",
      sourceTextCharCount: 21,
      units: [unit("u0001")],
      payload: projectedPayload("Texto anterior.", 100, {
        source_hash: "fnv1a32:current-doc",
        source_text_hash: "source-text-old",
        source_text_char_count: 18,
      }),
    });

    expect(staleSnapshot.translations.u0001).toMatchObject({
      status: "error",
      error: "translation_projection_source_text_mismatch",
      projectionStatus: "missing",
      sourceHash: "fnv1a32:current-doc",
      sourceTextHash: "source-text-current",
      sourceTextCharCount: 21,
      observationRef: "obs:docs:u1:100",
      receiptRef: "receipt:docs:u1:100",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(staleSnapshot.translations.u0001.text).toBeUndefined();
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(staleSnapshot)).toMatchObject({
      totalCount: 1,
      pendingCount: 0,
      readyCount: 0,
      errorCount: 1,
      healthStatus: "blocked",
      displayStatus: "blocked",
      hasRenderableText: false,
      hasProjectionErrors: true,
      latestStatus: "error",
      latestProjectionStatus: "missing",
      latestError: "translation_projection_source_text_mismatch",
      latestSourceHash: "fnv1a32:current-doc",
      latestSourceTextHash: "source-text-current",
      latestSourceTextCharCount: 21,
      latestTerminalAuthorityStatus: "not_terminal_authority",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });

    const currentSnapshot = ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:current-doc",
      sourceTextHash: "source-text-current",
      sourceTextCharCount: 21,
      units: [unit("u0001")],
      payload: projectedPayload("Texto actual.", 200, {
        source_hash: "fnv1a32:current-doc",
        source_text_hash: "source-text-current",
        source_text_char_count: 21,
      }),
    });

    expect(currentSnapshot.translations.u0001).toMatchObject({
      status: "ready",
      text: "Texto actual.",
      sourceHash: "fnv1a32:current-doc",
      sourceTextHash: "source-text-current",
      sourceTextCharCount: 21,
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("can scope governed lane projections by source identity key when provided", () => {
    const staleSnapshot = ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:current-doc",
      sourceIdentityKey: "docs:nhm2::current::docs::docs_chunk::es-US::es",
      units: [unit("u0001")],
      payload: projectedPayload("Texto anterior.", 100, {
        source_hash: "fnv1a32:current-doc",
        source_identity_key: "docs:nhm2::previous::docs::docs_chunk::es-US::es",
      }),
    });

    expect(staleSnapshot.translations.u0001).toMatchObject({
      status: "error",
      error: "translation_projection_source_identity_mismatch",
      projectionStatus: "missing",
      sourceHash: "fnv1a32:current-doc",
      sourceIdentityKey: "docs:nhm2::current::docs::docs_chunk::es-US::es",
      observationRef: "obs:docs:u1:100",
      receiptRef: "receipt:docs:u1:100",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(staleSnapshot.translations.u0001.text).toBeUndefined();

    const currentSnapshot = ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:current-doc",
      sourceIdentityKey: "docs:nhm2::current::docs::docs_chunk::es-US::es",
      units: [unit("u0001")],
      payload: projectedPayload("Texto actual.", 200, {
        source_hash: "fnv1a32:current-doc",
        source_identity_key: "docs:nhm2::current::docs::docs_chunk::es-US::es",
      }),
    });

    expect(currentSnapshot.translations.u0001).toMatchObject({
      status: "ready",
      text: "Texto actual.",
      sourceHash: "fnv1a32:current-doc",
      sourceIdentityKey: "docs:nhm2::current::docs::docs_chunk::es-US::es",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("summarizes an empty projection snapshot without answer authority", () => {
    expect(summarizeDocumentLiveTranslationProjectionSnapshot({
      version: 0,
      translations: {},
      laneSessions: {},
      mailLoops: {},
      goalBindings: {},
    })).toEqual({
      version: 0,
      totalCount: 0,
      pendingCount: 0,
      readyCount: 0,
      errorCount: 0,
      healthStatus: "empty",
      displayStatus: "empty",
      displayStatusReason: "no_projection_activity",
      hasRenderableText: false,
      hasProjectionErrors: false,
      projectedCount: 0,
      staleCount: 0,
      cancelledCount: 0,
      failedCount: 0,
      latestStatus: null,
      latestObservedAtMs: null,
      latestSourceEventId: null,
      latestSourceEventMs: null,
      latestObservationRef: null,
      latestReceiptRef: null,
      latestVisibleObservationRef: null,
      latestVisibleReceiptRef: null,
      latestEvidenceObservationRef: null,
      latestEvidenceReceiptRef: null,
      latestLaneSessionId: null,
      latestObservationLaneSessionId: null,
      latestGoalBindingIdFromProjection: null,
      latestSessionControlKey: null,
      latestSourceBindingKey: null,
      latestSourceIdentityKey: null,
      latestObservationKey: null,
      latestMailLoopObservationKey: null,
      latestGoalBindingKey: null,
      latestEventId: null,
      latestHasObservation: false,
      latestSelectedBackendProvider: null,
      latestChunkId: null,
      latestChunkIndex: null,
      latestDedupeKey: null,
      latestSource: null,
      latestSourceId: null,
      latestSourceHash: null,
      latestSourceKind: null,
      latestSourceTextHash: null,
      latestSourceTextCharCount: null,
      latestProjectionTarget: null,
      latestProjectionKey: null,
      latestServerProjectionKey: null,
      latestAccountLocale: null,
      latestTargetLanguage: null,
      latestProjectionStatus: null,
      latestFreshnessStatus: null,
      latestContextRole: null,
      latestTerminalAuthorityStatus: "not_terminal_authority",
      latestCancelRequested: false,
      latestError: null,
      suppressedReceiptCount: 0,
      latestSuppressedObservationRef: null,
      latestSuppressedReceiptRef: null,
      latestSuppressedObservationLaneSessionId: null,
      latestSuppressedGoalBindingId: null,
      latestSuppressedSessionControlKey: null,
      latestSuppressedSourceBindingKey: null,
      latestSuppressedSourceIdentityKey: null,
      latestSuppressedObservationKey: null,
      latestSuppressedMailLoopObservationKey: null,
      latestSuppressedGoalBindingKey: null,
      latestSuppressedEventId: null,
      latestSuppressedHasObservation: false,
      latestSuppressedSelectedBackendProvider: null,
      latestSuppressedProjectionStatus: null,
      latestSuppressedChunkId: null,
      latestSuppressedChunkIndex: null,
      latestSuppressedDedupeKey: null,
      latestSuppressedSourceEventId: null,
      latestSuppressedSourceEventMs: null,
      latestSuppressedObservedAtMs: null,
      latestSuppressedProjectionKey: null,
      latestSuppressedServerProjectionKey: null,
      latestSuppressedFreshnessStatus: null,
      latestSuppressedDisplayStatus: null,
      latestSuppressedContextRole: null,
      latestSuppressedTerminalAuthorityStatus: "not_terminal_authority",
      latestSuppressedSourceId: null,
      latestSuppressedSourceHash: null,
      latestSuppressedSourceKind: null,
      latestSuppressedSourceTextHash: null,
      latestSuppressedSourceTextCharCount: null,
      latestSuppressedAccountLocale: null,
      latestSuppressedProjectionTarget: null,
      latestSuppressedTargetLanguage: null,
      latestSuppressedCancelRequested: false,
      latestSuppressedReason: null,
      laneSessionCount: 0,
      activeLaneSessionCount: 0,
      observedLaneSessionCount: 0,
      pausedLaneSessionCount: 0,
      stoppedLaneSessionCount: 0,
      blockedLaneSessionCount: 0,
      latestLaneSessionStatus: null,
      latestLaneSessionHealth: null,
      latestLaneSessionLifecycleAction: null,
      latestLaneSessionReason: null,
      latestLaneSessionDebugPhase: null,
      latestLaneSessionObservationStatus: null,
      latestLaneSessionPermissionProfile: null,
      latestLaneSessionUpdatedAtMs: null,
      latestLaneSessionEventId: null,
      latestLaneSessionControlKey: null,
      latestLaneSessionSourceBindingKey: null,
      latestLaneSessionSourceIdentityKey: null,
      latestLaneSessionHasObservation: false,
      latestLaneSessionSourceId: null,
      latestLaneSessionSourceHash: null,
      latestLaneSessionSourceKind: null,
      latestLaneSessionSourceTextHash: null,
      latestLaneSessionSourceTextCharCount: null,
      latestLaneSessionProjectionTarget: null,
      latestLaneSessionAccountLocale: null,
      latestLaneSessionTargetLanguage: null,
      latestLaneSessionChunkId: null,
      latestLaneSessionChunkIndex: null,
      latestLaneSessionDedupeKey: null,
      latestLaneSessionSourceEventId: null,
      latestLaneSessionSourceEventMs: null,
      latestLaneSessionObservedAtMs: null,
      latestLaneSessionFreshnessStatus: null,
      latestLaneSessionSelectedBackendProvider: null,
      latestLaneSessionTerminalAuthorityStatus: "not_terminal_authority",
      mailLoopCount: 0,
      pendingMailLoopCount: 0,
      observedMailLoopCount: 0,
      blockedMailLoopCount: 0,
      latestMailLoopStatus: null,
      latestMailLoopId: null,
      latestMailLoopDeliveryStatus: null,
      latestMailLoopBlockedReason: null,
      latestPreviousStagePlayMailId: null,
      latestMailLoopWakeKind: "none",
      latestMailLoopMailboxWakeExpected: false,
      latestMailLoopDecisionWakeExpected: false,
      latestMailLoopObservationLaneSessionId: null,
      latestMailLoopSessionControlKey: null,
      latestMailLoopSourceBindingKey: null,
      latestMailLoopSourceIdentityKey: null,
      latestMailLoopLaneSessionSourceBindingKey: null,
      latestMailLoopLaneSessionSourceIdentityKey: null,
      latestMailLoopSourceId: null,
      latestMailLoopSourceHash: null,
      latestMailLoopSourceKind: null,
      latestMailLoopSourceTextHash: null,
      latestMailLoopSourceTextCharCount: null,
      latestMailLoopProjectionTarget: null,
      latestMailLoopAccountLocale: null,
      latestMailLoopTargetLanguage: null,
      latestMailLoopChunkId: null,
      latestMailLoopChunkIndex: null,
      latestMailLoopDedupeKey: null,
      latestMailLoopSourceEventId: null,
      latestMailLoopSourceEventMs: null,
      latestMailLoopObservedAtMs: null,
      latestMailLoopFreshnessStatus: null,
      latestMailLoopSelectedBackendProvider: null,
      latestMailLoopTerminalAuthorityStatus: "not_terminal_authority",
      goalBindingCount: 0,
      activeGoalBindingCount: 0,
      observedGoalBindingCount: 0,
      blockedGoalBindingCount: 0,
      latestGoalBindingId: null,
      latestGoalId: null,
      latestGoalBindingLaneSessionId: null,
      latestGoalBindingStatus: null,
      latestGoalBindingSessionStatus: null,
      latestGoalBindingSessionHealth: null,
      latestGoalBindingActivationPolicy: null,
      latestGoalBindingAttentionPolicy: null,
      latestGoalBindingStopCondition: null,
      latestGoalBindingReportPolicy: null,
      latestGoalBindingQuietBehavior: null,
      latestGoalBindingReportAction: null,
      latestGoalBindingReportReason: null,
      latestGoalBindingQuietBehaviorApplied: null,
      latestGoalBindingWakeExpected: null,
      latestGoalBindingMailboxWakeExpected: null,
      latestGoalBindingDecisionWakeExpected: null,
      latestGoalBindingSurfaceBadgeExpected: null,
      latestGoalBindingTerminalReportRequested: null,
      latestGoalBindingTerminalReportAuthorized: null,
      latestGoalBindingSelectedBackendProvider: null,
      latestGoalBindingObservationRef: null,
      latestGoalBindingReceiptRef: null,
      latestGoalBindingEventId: null,
      latestGoalBindingSessionControlKey: null,
      latestGoalBindingSourceBindingKeyFromEvent: null,
      latestGoalBindingSourceIdentityKey: null,
      latestGoalBindingLaneSessionSourceBindingKey: null,
      latestGoalBindingLaneSessionSourceIdentityKey: null,
      latestGoalBindingHasObservation: false,
      latestGoalBindingTerminalAuthorityStatus: "not_terminal_authority",
      latestGoalBindingSourceId: null,
      latestGoalBindingSourceHash: null,
      latestGoalBindingSourceKind: null,
      latestGoalBindingSourceTextHash: null,
      latestGoalBindingSourceTextCharCount: null,
      latestGoalBindingProjectionTarget: null,
      latestGoalBindingAccountLocale: null,
      latestGoalBindingTargetLanguage: null,
      latestGoalBindingChunkId: null,
      latestGoalBindingChunkIndex: null,
      latestGoalBindingDedupeKey: null,
      latestGoalBindingSourceBindingKey: null,
      latestGoalBindingSourceIdentityKeyFromBinding: null,
      latestGoalBindingObservationKey: null,
      latestGoalBindingMailLoopObservationKey: null,
      latestGoalBindingKeyFromBinding: null,
      observedLaneActivityCount: 0,
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("summarizes blocked lane state without projected text as blocked but non-authoritative", () => {
    const summary = summarizeDocumentLiveTranslationProjectionSnapshot({
      version: 1,
      translations: {},
      laneSessions: {
        "lane-session-blocked": {
          laneSessionId: "lane-session-blocked",
          laneId: "live_translation",
          sessionStatus: "blocked",
          sessionHealth: "blocked",
          sourceId: "document_markdown:docs/research/nhm2.md",
          sourceHash: "fnv1a32:block",
          sourceKind: "docs",
          projectionTarget: "docs_chunk",
          accountLocale: "es-US",
          targetLanguage: "es",
          updatedAtMs: 200,
          lastObservationRef: "obs:blocked",
          lastReceiptRef: "receipt:blocked",
          answerAuthority: false,
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
      },
      mailLoops: {},
      goalBindings: {},
    });

    expect(summary).toMatchObject({
      totalCount: 0,
      readyCount: 0,
      errorCount: 0,
      healthStatus: "blocked",
      displayStatus: "blocked",
      hasRenderableText: false,
      hasProjectionErrors: false,
      laneSessionCount: 1,
      activeLaneSessionCount: 0,
      pausedLaneSessionCount: 0,
      stoppedLaneSessionCount: 0,
      blockedLaneSessionCount: 1,
      latestLaneSessionId: "lane-session-blocked",
      latestLaneSessionStatus: "blocked",
      latestLaneSessionHealth: "blocked",
      latestLaneSessionTerminalAuthorityStatus: "not_terminal_authority",
      latestLaneSessionUpdatedAtMs: 200,
      latestSourceId: "document_markdown:docs/research/nhm2.md",
      latestSourceHash: "fnv1a32:block",
      latestObservationRef: "obs:blocked",
      latestReceiptRef: "receipt:blocked",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("summarizes active lane state without projected text as degraded but non-authoritative", () => {
    const summary = summarizeDocumentLiveTranslationProjectionSnapshot({
      version: 2,
      translations: {},
      laneSessions: {
        "lane-session-running": {
          laneSessionId: "lane-session-running",
          laneId: "live_translation",
          sessionStatus: "running",
          sessionHealth: "healthy",
          sourceId: "document_markdown:docs/research/nhm2.md",
          sourceHash: "fnv1a32:active",
          sourceKind: "docs",
          projectionTarget: "docs_chunk",
          accountLocale: "es-US",
          targetLanguage: "es",
          updatedAtMs: 300,
          lastObservationRef: null,
          lastReceiptRef: null,
          answerAuthority: false,
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
      },
      mailLoops: {},
      goalBindings: {},
    });

    expect(summary).toMatchObject({
      totalCount: 0,
      readyCount: 0,
      errorCount: 0,
      healthStatus: "degraded",
      displayStatus: "active",
      hasRenderableText: false,
      hasProjectionErrors: false,
      laneSessionCount: 1,
      activeLaneSessionCount: 1,
      pausedLaneSessionCount: 0,
      stoppedLaneSessionCount: 0,
      blockedLaneSessionCount: 0,
      latestLaneSessionId: "lane-session-running",
      latestLaneSessionStatus: "running",
      latestLaneSessionHealth: "healthy",
      latestLaneSessionTerminalAuthorityStatus: "not_terminal_authority",
      latestSourceHash: "fnv1a32:active",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("summarizes paused lane sessions separately while preserving active lane health", () => {
    const summary = summarizeDocumentLiveTranslationProjectionSnapshot({
      version: 3,
      translations: {},
      laneSessions: {
        "lane-session-paused": {
          laneSessionId: "lane-session-paused",
          laneId: "live_translation",
          sessionStatus: "paused",
          sessionHealth: "healthy",
          sourceId: "document_markdown:docs/research/nhm2.md",
          sourceHash: "fnv1a32:paused",
          sourceKind: "docs",
          projectionTarget: "docs_chunk",
          accountLocale: "es-US",
          targetLanguage: "es",
          updatedAtMs: 400,
          lastObservationRef: null,
          lastReceiptRef: null,
          answerAuthority: false,
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
      },
      mailLoops: {},
      goalBindings: {},
    });

    expect(summary).toMatchObject({
      totalCount: 0,
      healthStatus: "degraded",
      displayStatus: "active",
      laneSessionCount: 1,
      activeLaneSessionCount: 1,
      pausedLaneSessionCount: 1,
      stoppedLaneSessionCount: 0,
      blockedLaneSessionCount: 0,
      latestLaneSessionId: "lane-session-paused",
      latestLaneSessionStatus: "paused",
      latestLaneSessionHealth: "healthy",
      latestLaneSessionSourceHash: "fnv1a32:paused",
      latestLaneSessionTerminalAuthorityStatus: "not_terminal_authority",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("summarizes stopped lane sessions separately from active and blocked sessions", () => {
    const summary = summarizeDocumentLiveTranslationProjectionSnapshot({
      version: 4,
      translations: {},
      laneSessions: {
        "lane-session-stopped": {
          laneSessionId: "lane-session-stopped",
          laneId: "live_translation",
          sessionStatus: "stopped",
          sessionHealth: "idle",
          sourceId: "document_markdown:docs/research/nhm2.md",
          sourceHash: "fnv1a32:stopped",
          sourceKind: "docs",
          projectionTarget: "docs_chunk",
          accountLocale: "es-US",
          targetLanguage: "es",
          updatedAtMs: 450,
          lastObservationRef: null,
          lastReceiptRef: null,
          answerAuthority: false,
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
      },
      mailLoops: {},
      goalBindings: {},
    });

    expect(summary).toMatchObject({
      totalCount: 0,
      healthStatus: "empty",
      displayStatus: "empty",
      laneSessionCount: 1,
      activeLaneSessionCount: 0,
      pausedLaneSessionCount: 0,
      stoppedLaneSessionCount: 1,
      blockedLaneSessionCount: 0,
      latestLaneSessionId: "lane-session-stopped",
      latestLaneSessionStatus: "stopped",
      latestLaneSessionHealth: "idle",
      latestLaneSessionSourceHash: "fnv1a32:stopped",
      latestLaneSessionTerminalAuthorityStatus: "not_terminal_authority",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("preserves current ready text when a later stale lane projection arrives", () => {
    ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      payload: projectedPayload("Texto vigente.", 100),
    });
    const snapshot = ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      payload: {
        capability_lane_projection_receipts: [
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:u1:stale",
            observation_ref: "obs:docs:u1:stale",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "stale",
            source_id: "document_markdown:docs/research/nhm2.md",
            chunk_id: "u0001",
            observed_at_ms: 200,
            target_language: "es",
            translated_text: "Texto viejo.",
            stale: true,
          },
        ],
      },
    });

    expect(snapshot.translations.u0001).toEqual({
      status: "ready",
      text: "Texto vigente.",
      observationRef: "obs:docs:u1:100",
      receiptRef: "receipt:docs:u1:100",
      projectionStatus: "projected",
      ...registryMeta(),
      source: "capability_lane",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("notifies subscribers only when registry state changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDocumentLiveTranslationProjectionRegistry(listener);
    ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      payload: projectedPayload("Texto gobernado.", 100),
    });
    ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      payload: projectedPayload("Texto gobernado.", 100),
    });

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    clearDocumentLiveTranslationProjectionRegistry();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("refreshes subscribers when a same-text projection has newer receipt metadata", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDocumentLiveTranslationProjectionRegistry(listener);
    ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      payload: projectedPayload("Texto gobernado.", 100),
    });
    const snapshot = ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      payload: projectedPayload("Texto gobernado.", 200),
    });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(snapshot.translations.u0001).toMatchObject({
      status: "ready",
      text: "Texto gobernado.",
      observationRef: "obs:docs:u1:200",
      receiptRef: "receipt:docs:u1:200",
      projectionStatus: "projected",
      ...registryMeta({ observedAtMs: 200 }),
      source: "capability_lane",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });

    unsubscribe();
  });

  it("refreshes subscribers when a retry has equal timing but different receipt metadata", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDocumentLiveTranslationProjectionRegistry(listener);
    ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      payload: projectedPayload("Texto inicial.", 200),
    });
    const snapshot = ingestDocumentLiveTranslationProjection({
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
            target_language: "es",
            translated_text: "Texto reintentado.",
          },
        ],
      },
    });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(snapshot.translations.u0001).toMatchObject({
      status: "ready",
      text: "Texto reintentado.",
      observationRef: "obs:docs:u1:retry",
      receiptRef: "receipt:docs:u1:retry",
      ...registryMeta({ observedAtMs: 200 }),
    });

    unsubscribe();
  });

  it("does not let a late older ready projection replace a newer document projection", () => {
    ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      payload: projectedPayload("Texto nuevo.", 200),
    });
    const snapshot = ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      payload: projectedPayload("Texto viejo.", 100),
    });

    expect(snapshot.translations.u0001).toMatchObject({
      status: "ready",
      text: "Texto nuevo.",
      observationRef: "obs:docs:u1:200",
      receiptRef: "receipt:docs:u1:200",
      ...registryMeta({ observedAtMs: 200 }),
    });
  });

  it("summarizes latest projection by source event when both projections have source event times", () => {
    ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      payload: projectedPayload("Texto de evento nuevo.", 200, {
        source_event_id: "docs:event:new",
        source_event_ms: 500,
      }),
    });
    const snapshot = ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0002")],
      payload: projectedPayload("Texto observado tarde.", 300, {
        receipt_ref: "receipt:docs:u2:late",
        observation_ref: "obs:docs:u2:late",
        chunk_id: "u0002",
        source_event_id: "docs:event:old",
        source_event_ms: 250,
      }),
    });

    expect(summarizeDocumentLiveTranslationProjectionSnapshot(snapshot)).toMatchObject({
      latestChunkId: "u0001",
      latestObservedAtMs: 200,
      latestSourceEventId: "docs:event:new",
      latestSourceEventMs: 500,
      latestObservationRef: "obs:docs:u1:200",
      latestReceiptRef: "receipt:docs:u1:200",
    });
  });

  it("does not let stale display text replace a current fresh document projection", () => {
    ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      payload: projectedPayload("Texto fresco.", 200, {
        freshness_status: "fresh",
        source_hash: "source-hash-current",
        source_text_hash: "source-text-current",
      }),
    });
    const snapshot = ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      allowStaleDisplayText: true,
      payload: projectedPayload("Texto obsoleto.", 300, {
        receipt_ref: "receipt:docs:u1:stale",
        observation_ref: "obs:docs:u1:stale",
        projection_status: "stale",
        chunk_index: 7,
        dedupe_key: "dedupe-stale",
        source_event_id: "event-stale",
        source_event_ms: 280,
        freshness_status: "stale",
        terminal_authority_status: "pending_helix_terminal_authority",
        source_hash: "source-hash-stale",
        source_kind: "document_markdown",
        source_text_hash: "source-text-stale",
        account_locale: "es-US",
        target_language: "es",
        stale: true,
      }),
    });

    expect(snapshot.translations.u0001).toMatchObject({
      status: "ready",
      text: "Texto fresco.",
      observationRef: "obs:docs:u1:200",
      receiptRef: "receipt:docs:u1:200",
      projectionStatus: "projected",
      ...registryMeta({
        observedAtMs: 200,
        freshnessStatus: "fresh",
        sourceHash: "source-hash-current",
        sourceTextHash: "source-text-current",
      }),
      suppressedObservationRef: "obs:docs:u1:stale",
      suppressedReceiptRef: "receipt:docs:u1:stale",
      suppressedProjectionStatus: "stale",
      suppressedChunkId: "u0001",
      suppressedChunkIndex: 7,
      suppressedDedupeKey: "dedupe-stale",
      suppressedSourceEventId: "event-stale",
      suppressedSourceEventMs: 280,
      suppressedObservedAtMs: 300,
      suppressedFreshnessStatus: "stale",
      suppressedTerminalAuthorityStatus: "pending_helix_terminal_authority",
      suppressedSourceId: "document_markdown:docs/research/nhm2.md",
      suppressedSourceHash: "source-hash-stale",
      suppressedSourceKind: "docs",
      suppressedSourceTextHash: "source-text-stale",
      suppressedAccountLocale: "es-US",
      suppressedProjectionTarget: "docs_chunk",
      suppressedTargetLanguage: "es",
      suppressedCancelRequested: false,
      suppressedReason: "stale_projection_did_not_replace_fresh_text",
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(snapshot)).toMatchObject({
      readyCount: 1,
      hasRenderableText: true,
      latestProjectionStatus: "projected",
      latestProjectionKey:
        "document_markdown:docs/research/nhm2.md::source-hash-current::source-text-current::docs_chunk::es::u0001::receipt:docs:u1:200",
      latestServerProjectionKey: null,
      latestReceiptRef: "receipt:docs:u1:200",
      latestVisibleReceiptRef: "receipt:docs:u1:200",
      latestEvidenceReceiptRef: "receipt:docs:u1:stale",
      suppressedReceiptCount: 1,
      latestSuppressedObservationRef: "obs:docs:u1:stale",
      latestSuppressedReceiptRef: "receipt:docs:u1:stale",
      latestSuppressedProjectionKey:
        "document_markdown:docs/research/nhm2.md::source-hash-stale::source-text-stale::docs_chunk::es::u0001::receipt:docs:u1:stale",
      latestSuppressedServerProjectionKey: null,
      latestSuppressedProjectionStatus: "stale",
      latestSuppressedChunkId: "u0001",
      latestSuppressedChunkIndex: 7,
      latestSuppressedDedupeKey: "dedupe-stale",
      latestSuppressedSourceEventId: "event-stale",
      latestSuppressedSourceEventMs: 280,
      latestSuppressedObservedAtMs: 300,
      latestSuppressedFreshnessStatus: "stale",
      latestSuppressedDisplayStatus: "stale",
      latestSuppressedTerminalAuthorityStatus: "pending_helix_terminal_authority",
      latestSuppressedSourceId: "document_markdown:docs/research/nhm2.md",
      latestSuppressedSourceHash: "source-hash-stale",
      latestSuppressedSourceKind: "docs",
      latestSuppressedSourceTextHash: "source-text-stale",
      latestSuppressedAccountLocale: "es-US",
      latestSuppressedProjectionTarget: "docs_chunk",
      latestSuppressedTargetLanguage: "es",
      latestSuppressedCancelRequested: false,
      latestSuppressedReason: "stale_projection_did_not_replace_fresh_text",
    });
    expect(buildDocumentInlineTranslationDataAttributes(snapshot.translations.u0001)).toMatchObject({
      "data-doc-translation-visible-observation-ref": "obs:docs:u1:200",
      "data-doc-translation-visible-receipt-ref": "receipt:docs:u1:200",
      "data-doc-translation-evidence-observation-ref": "obs:docs:u1:stale",
      "data-doc-translation-evidence-receipt-ref": "receipt:docs:u1:stale",
      "data-doc-translation-suppressed-reason": "stale_projection_did_not_replace_fresh_text",
      "data-doc-translation-answer-authority": "false",
      "data-doc-translation-terminal-eligible": "false",
      "data-doc-translation-assistant-answer": "false",
      "data-doc-translation-raw-content-included": "false",
    });
  });

  it("does not let newer cancelled or failed receipts replace current ready document projection text", () => {
    ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      payload: projectedPayload("Texto activo.", 200),
    });
    const snapshot = ingestDocumentLiveTranslationProjection({
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
            source_hash: "source-hash-cancelled",
            source_identity_key:
              "document_markdown:docs/research/nhm2.md::source-hash-cancelled::source-text-cancelled::18::docs::docs_chunk::es-US::es",
            source_text_hash: "source-text-cancelled",
            source_text_char_count: 18,
            chunk_id: "u0001",
            observed_at_ms: 300,
            target_language: "es",
            cancel_requested: true,
          },
        ],
      },
    });

    expect(snapshot.translations.u0001).toMatchObject({
      status: "ready",
      text: "Texto activo.",
      observationRef: "obs:docs:u1:200",
      receiptRef: "receipt:docs:u1:200",
      projectionStatus: "projected",
      ...registryMeta({
        observedAtMs: 200,
      }),
      suppressedObservationRef: "obs:docs:u1:cancelled",
      suppressedReceiptRef: "receipt:docs:u1:cancelled",
      suppressedProjectionStatus: "cancelled",
      suppressedChunkId: "u0001",
      suppressedObservedAtMs: 300,
      suppressedSourceId: "document_markdown:docs/research/nhm2.md",
      suppressedSourceHash: "source-hash-cancelled",
      suppressedSourceIdentityKey:
        "document_markdown:docs/research/nhm2.md::source-hash-cancelled::source-text-cancelled::18::docs::docs_chunk::es-US::es",
      suppressedSourceTextHash: "source-text-cancelled",
      suppressedSourceTextCharCount: 18,
      suppressedTargetLanguage: "es",
      suppressedCancelRequested: true,
      suppressedReason: "cancelled_projection_did_not_replace_ready_text",
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(snapshot)).toMatchObject({
      readyCount: 1,
      errorCount: 0,
      hasRenderableText: true,
      hasProjectionErrors: false,
      latestProjectionStatus: "projected",
      latestReceiptRef: "receipt:docs:u1:200",
      latestVisibleReceiptRef: "receipt:docs:u1:200",
      latestEvidenceReceiptRef: "receipt:docs:u1:cancelled",
      suppressedReceiptCount: 1,
      latestSuppressedObservationRef: "obs:docs:u1:cancelled",
      latestSuppressedReceiptRef: "receipt:docs:u1:cancelled",
      latestSuppressedProjectionStatus: "cancelled",
      latestSuppressedDisplayStatus: "cancelled",
      latestSuppressedChunkId: "u0001",
      latestSuppressedObservedAtMs: 300,
      latestSuppressedSourceId: "document_markdown:docs/research/nhm2.md",
      latestSuppressedSourceHash: "source-hash-cancelled",
      latestSuppressedSourceIdentityKey:
        "document_markdown:docs/research/nhm2.md::source-hash-cancelled::source-text-cancelled::18::docs::docs_chunk::es-US::es",
      latestSuppressedSourceTextHash: "source-text-cancelled",
      latestSuppressedSourceTextCharCount: 18,
      latestSuppressedTargetLanguage: "es",
      latestSuppressedCancelRequested: true,
      latestSuppressedReason: "cancelled_projection_did_not_replace_ready_text",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });

    const failedSnapshot = ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      payload: {
        capability_lane_projection_receipts: [
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:u1:failed",
            observation_ref: "obs:docs:u1:failed",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "failed",
            source_id: "document_markdown:docs/research/nhm2.md",
            source_hash: "source-hash-failed",
            source_identity_key:
              "document_markdown:docs/research/nhm2.md::source-hash-failed::source-text-failed::15::docs::docs_chunk::es-US::es",
            source_text_hash: "source-text-failed",
            source_text_char_count: 15,
            chunk_id: "u0001",
            observed_at_ms: 400,
            target_language: "es",
          },
        ],
      },
    });

    expect(failedSnapshot.translations.u0001).toMatchObject({
      status: "ready",
      text: "Texto activo.",
      observationRef: "obs:docs:u1:200",
      receiptRef: "receipt:docs:u1:200",
      projectionStatus: "projected",
      ...registryMeta({
        observedAtMs: 200,
      }),
      suppressedObservationRef: "obs:docs:u1:failed",
      suppressedReceiptRef: "receipt:docs:u1:failed",
      suppressedProjectionStatus: "failed",
      suppressedChunkId: "u0001",
      suppressedObservedAtMs: 400,
      suppressedSourceId: "document_markdown:docs/research/nhm2.md",
      suppressedSourceHash: "source-hash-failed",
      suppressedSourceIdentityKey:
        "document_markdown:docs/research/nhm2.md::source-hash-failed::source-text-failed::15::docs::docs_chunk::es-US::es",
      suppressedSourceTextHash: "source-text-failed",
      suppressedSourceTextCharCount: 15,
      suppressedTargetLanguage: "es",
      suppressedCancelRequested: false,
      suppressedReason: "failed_projection_did_not_replace_ready_text",
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(failedSnapshot)).toMatchObject({
      readyCount: 1,
      errorCount: 0,
      hasRenderableText: true,
      hasProjectionErrors: false,
      latestProjectionStatus: "projected",
      latestReceiptRef: "receipt:docs:u1:200",
      latestVisibleReceiptRef: "receipt:docs:u1:200",
      latestEvidenceReceiptRef: "receipt:docs:u1:failed",
      suppressedReceiptCount: 1,
      latestSuppressedReceiptRef: "receipt:docs:u1:failed",
      latestSuppressedProjectionStatus: "failed",
      latestSuppressedDisplayStatus: "failed",
      latestSuppressedSourceId: "document_markdown:docs/research/nhm2.md",
      latestSuppressedSourceHash: "source-hash-failed",
      latestSuppressedSourceIdentityKey:
        "document_markdown:docs/research/nhm2.md::source-hash-failed::source-text-failed::15::docs::docs_chunk::es-US::es",
      latestSuppressedSourceTextHash: "source-text-failed",
      latestSuppressedSourceTextCharCount: 15,
      latestSuppressedReason: "failed_projection_did_not_replace_ready_text",
    });
  });

  it("uses suppressed source event time when suppressed observed time is missing", () => {
    const summary = summarizeDocumentLiveTranslationProjectionSnapshot({
      version: 3,
      translations: {
        u0001: {
          status: "ready",
          text: "Texto activo 1.",
          observationRef: "obs:docs:u1:ready",
          receiptRef: "receipt:docs:u1:ready",
          projectionStatus: "projected",
          ...registryMeta({ observedAtMs: 200 }),
          source: "capability_lane",
          suppressedObservationRef: "obs:docs:u1:failed:older",
          suppressedReceiptRef: "receipt:docs:u1:failed:older",
          suppressedProjectionStatus: "failed",
          suppressedChunkId: "u0001",
          suppressedSourceEventId: "event-older",
          suppressedSourceEventMs: 400,
          suppressedTargetLanguage: "es",
          suppressedReason: "failed_projection_did_not_replace_ready_text",
          answerAuthority: false,
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
        u0002: {
          status: "ready",
          text: "Texto activo 2.",
          observationRef: "obs:docs:u2:ready",
          receiptRef: "receipt:docs:u2:ready",
          projectionStatus: "projected",
          ...registryMeta({
            chunkId: "u0002",
            observedAtMs: 210,
          }),
          source: "capability_lane",
          suppressedObservationRef: "obs:docs:u2:cancelled:newer",
          suppressedReceiptRef: "receipt:docs:u2:cancelled:newer",
          suppressedProjectionStatus: "cancelled",
          suppressedChunkId: "u0002",
          suppressedSourceEventId: "event-newer",
          suppressedSourceEventMs: 500,
          suppressedTargetLanguage: "es",
          suppressedCancelRequested: true,
          suppressedReason: "cancelled_projection_did_not_replace_ready_text",
          answerAuthority: false,
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
      },
      laneSessions: {},
      mailLoops: {},
      goalBindings: {},
    });

    expect(summary).toMatchObject({
      suppressedReceiptCount: 2,
      latestSuppressedObservationRef: "obs:docs:u2:cancelled:newer",
      latestSuppressedReceiptRef: "receipt:docs:u2:cancelled:newer",
      latestSuppressedProjectionStatus: "cancelled",
      latestSuppressedDisplayStatus: "cancelled",
      latestSuppressedChunkId: "u0002",
      latestSuppressedSourceEventId: "event-newer",
      latestSuppressedSourceEventMs: 500,
      latestSuppressedObservedAtMs: null,
      latestSuppressedTargetLanguage: "es",
      latestSuppressedCancelRequested: true,
      latestSuppressedReason: "cancelled_projection_did_not_replace_ready_text",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("summarizes ready and blocked projection health states", () => {
    const readySnapshot = ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      payload: projectedPayload("Texto listo.", 100),
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(readySnapshot)).toMatchObject({
      totalCount: 1,
      readyCount: 1,
      errorCount: 0,
      healthStatus: "ready",
      displayStatus: "ready",
      hasRenderableText: true,
      hasProjectionErrors: false,
    });

    const readyWithBlockedLaneSession = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      eventPayload: laneSessionLiveEvent({
        sessionStatus: "blocked",
        sessionHealth: "blocked",
        latestSessionReason: "backend_permission_blocked",
        observationRef: "obs:lane-session-blocked",
        receiptRef: "receipt:lane-session-blocked",
        updatedAtMs: 150,
      }),
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(readyWithBlockedLaneSession)).toMatchObject({
      totalCount: 1,
      readyCount: 1,
      healthStatus: "degraded",
      displayStatus: "ready",
      displayStatusReason: "ready_projection_with_lane_blockers",
      hasRenderableText: true,
      blockedLaneSessionCount: 1,
      latestVisibleObservationRef: "obs:docs:u1:100",
      latestVisibleReceiptRef: "receipt:docs:u1:100",
      latestEvidenceObservationRef: "obs:lane-session-blocked",
      latestEvidenceReceiptRef: "receipt:lane-session-blocked",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });

    clearDocumentLiveTranslationProjectionRegistry();
    const blockedSnapshot = ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      payload: {
        capability_lane_projection_receipts: [
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:u1:failed",
            observation_ref: "obs:docs:u1:failed",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "failed",
            source_id: "document_markdown:docs/research/nhm2.md",
            chunk_id: "u0001",
            observed_at_ms: 100,
            target_language: "es",
          },
        ],
      },
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(blockedSnapshot)).toMatchObject({
      totalCount: 1,
      readyCount: 0,
      errorCount: 1,
      healthStatus: "blocked",
      displayStatus: "failed",
      hasRenderableText: false,
      hasProjectionErrors: true,
    });
  });

  it("keeps terminal-authority rejection visible in document projection summaries", () => {
    const snapshot = ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      payload: {
        capability_lane_projection_receipts: [
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:u1:rejected",
            observation_ref: "obs:docs:u1:rejected",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "projected",
            source_id: "document_markdown:docs/research/nhm2.md",
            chunk_id: "u0001",
            observed_at_ms: 100,
            target_language: "es",
            translated_text: "Texto rechazado.",
            terminal_authority_status: "terminal_authority_rejected",
          },
        ],
      },
    });

    expect(snapshot.translations.u0001).toMatchObject({
      status: "ready",
      text: "Texto rechazado.",
      observationRef: "obs:docs:u1:rejected",
      receiptRef: "receipt:docs:u1:rejected",
      terminalAuthorityStatus: "terminal_authority_rejected",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(snapshot)).toMatchObject({
      latestObservationRef: "obs:docs:u1:rejected",
      latestReceiptRef: "receipt:docs:u1:rejected",
      latestTerminalAuthorityStatus: "terminal_authority_rejected",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("summarizes docs projection display statuses for pending and non-renderable receipts", () => {
    const buildProjectionStatusSummary = (projectionStatus: "stale" | "cancelled" | "failed") => {
      clearDocumentLiveTranslationProjectionRegistry();
      return summarizeDocumentLiveTranslationProjectionSnapshot(ingestDocumentLiveTranslationProjection({
        docPath: "docs/research/nhm2.md",
        locale: "es",
        units: [unit("u0001")],
        payload: {
          capability_lane_projection_receipts: [
            {
              schema: "helix.live_translation.projection_receipt.v1",
              receipt_ref: `receipt:docs:u1:${projectionStatus}`,
              observation_ref: `obs:docs:u1:${projectionStatus}`,
              lane_id: "live_translation",
              capability: "live_translation.translate_text",
              projection_target: "docs_chunk",
              projection_status: projectionStatus,
              source_id: "document_markdown:docs/research/nhm2.md",
              chunk_id: "u0001",
              observed_at_ms: 100,
              target_language: "es",
            },
          ],
        },
      }));
    };

    expect(buildProjectionStatusSummary("stale")).toMatchObject({
      displayStatus: "stale",
      displayStatusReason: "stale_projection",
      hasRenderableText: false,
    });
    expect(buildProjectionStatusSummary("cancelled")).toMatchObject({
      displayStatus: "cancelled",
      displayStatusReason: "cancelled_projection",
      hasRenderableText: false,
    });
    expect(buildProjectionStatusSummary("failed")).toMatchObject({
      displayStatus: "failed",
      displayStatusReason: "failed_projection",
      hasRenderableText: false,
    });

    clearDocumentLiveTranslationProjectionRegistry();
    const pendingSnapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      eventPayload: laneMailLoopLiveEvent(),
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(pendingSnapshot)).toMatchObject({
      displayStatus: "pending",
      displayStatusReason: "mail_loop_pending",
      pendingCount: 1,
      pendingMailLoopCount: 1,
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("summarizes projection snapshot health without answer authority", () => {
    const snapshot = ingestDocumentLiveTranslationProjection({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001"), unit("u0002"), unit("u0003")],
      payload: {
        capability_lane_projection_receipts: [
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:u1",
            observation_ref: "obs:docs:u1",
            lane_session_id: "lane-session-docs",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "projected",
            source_id: "document_markdown:docs/research/nhm2.md",
            chunk_id: "u0001",
            observed_at_ms: 100,
            source_event_ms: 90,
            target_language: "es",
            translated_text: "Uno.",
          },
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:u2:cancelled",
            observation_ref: "obs:docs:u2:cancelled",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "cancelled",
            source_id: "document_markdown:docs/research/nhm2.md",
            source_kind: "document_markdown",
            account_locale: "es-US",
            chunk_id: "u0002",
            chunk_index: 1,
            observed_at_ms: 300,
            source_event_id: "docs:event:u0002",
            source_event_ms: 290,
            target_language: "es",
            cancel_requested: true,
          },
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:docs:u3:failed",
            observation_ref: "obs:docs:u3:failed",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_chunk",
            projection_status: "failed",
            source_id: "document_markdown:docs/research/nhm2.md",
            chunk_id: "u0003",
            observed_at_ms: 200,
            source_event_ms: 190,
            target_language: "es",
          },
        ],
      },
    });

    expect(summarizeDocumentLiveTranslationProjectionSnapshot(snapshot)).toEqual({
      version: snapshot.version,
      totalCount: 3,
      pendingCount: 0,
      readyCount: 1,
      errorCount: 2,
      healthStatus: "degraded",
      displayStatus: "ready",
      displayStatusReason: "ready_projection_with_errors",
      hasRenderableText: true,
      hasProjectionErrors: true,
      projectedCount: 1,
      staleCount: 0,
      cancelledCount: 1,
      failedCount: 1,
      latestStatus: "error",
      latestObservedAtMs: 300,
      latestSourceEventMs: 290,
      latestObservationRef: "obs:docs:u2:cancelled",
      latestReceiptRef: "receipt:docs:u2:cancelled",
      latestVisibleObservationRef: "obs:docs:u2:cancelled",
      latestVisibleReceiptRef: "receipt:docs:u2:cancelled",
      latestEvidenceObservationRef: "obs:docs:u2:cancelled",
      latestEvidenceReceiptRef: "receipt:docs:u2:cancelled",
      latestLaneSessionId: null,
      latestObservationLaneSessionId: null,
      latestGoalBindingIdFromProjection: null,
      latestSessionControlKey: null,
      latestSourceBindingKey: null,
      latestSourceIdentityKey: null,
      latestObservationKey: null,
      latestMailLoopObservationKey: null,
      latestGoalBindingKey: null,
      latestEventId: null,
      latestHasObservation: true,
      latestSelectedBackendProvider: null,
      latestChunkId: "u0002",
      latestChunkIndex: 1,
      latestDedupeKey: null,
      latestSource: "capability_lane",
      latestSourceId: "document_markdown:docs/research/nhm2.md",
      latestSourceHash: null,
      latestSourceKind: "docs",
      latestSourceTextHash: null,
      latestSourceTextCharCount: null,
      latestProjectionTarget: "docs_chunk",
      latestProjectionKey:
        "document_markdown:docs/research/nhm2.md::docs_chunk::es::u0002::receipt:docs:u2:cancelled",
      latestServerProjectionKey: null,
      latestAccountLocale: "es-US",
      latestTargetLanguage: "es",
      latestSourceEventId: "docs:event:u0002",
      latestProjectionStatus: "cancelled",
      latestFreshnessStatus: "unknown",
      latestContextRole: "tool_evidence",
      latestTerminalAuthorityStatus: "not_terminal_authority",
      latestCancelRequested: true,
      latestError: "translation_projection_cancelled",
      suppressedReceiptCount: 0,
      latestSuppressedObservationRef: null,
      latestSuppressedReceiptRef: null,
      latestSuppressedObservationLaneSessionId: null,
      latestSuppressedGoalBindingId: null,
      latestSuppressedSessionControlKey: null,
      latestSuppressedSourceBindingKey: null,
      latestSuppressedSourceIdentityKey: null,
      latestSuppressedObservationKey: null,
      latestSuppressedMailLoopObservationKey: null,
      latestSuppressedGoalBindingKey: null,
      latestSuppressedEventId: null,
      latestSuppressedHasObservation: false,
      latestSuppressedSelectedBackendProvider: null,
      latestSuppressedProjectionStatus: null,
      latestSuppressedChunkId: null,
      latestSuppressedChunkIndex: null,
      latestSuppressedDedupeKey: null,
      latestSuppressedSourceEventId: null,
      latestSuppressedSourceEventMs: null,
      latestSuppressedObservedAtMs: null,
      latestSuppressedProjectionKey: null,
      latestSuppressedServerProjectionKey: null,
      latestSuppressedFreshnessStatus: null,
      latestSuppressedDisplayStatus: null,
      latestSuppressedContextRole: null,
      latestSuppressedTerminalAuthorityStatus: "not_terminal_authority",
      latestSuppressedSourceId: null,
      latestSuppressedSourceHash: null,
      latestSuppressedSourceKind: null,
      latestSuppressedSourceTextHash: null,
      latestSuppressedSourceTextCharCount: null,
      latestSuppressedAccountLocale: null,
      latestSuppressedProjectionTarget: null,
      latestSuppressedTargetLanguage: null,
      latestSuppressedCancelRequested: false,
      latestSuppressedReason: null,
      laneSessionCount: 0,
      activeLaneSessionCount: 0,
      observedLaneSessionCount: 0,
      pausedLaneSessionCount: 0,
      stoppedLaneSessionCount: 0,
      blockedLaneSessionCount: 0,
      latestLaneSessionStatus: null,
      latestLaneSessionHealth: null,
      latestLaneSessionLifecycleAction: null,
      latestLaneSessionReason: null,
      latestLaneSessionDebugPhase: null,
      latestLaneSessionObservationStatus: null,
      latestLaneSessionPermissionProfile: null,
      latestLaneSessionUpdatedAtMs: null,
      latestLaneSessionEventId: null,
      latestLaneSessionControlKey: null,
      latestLaneSessionSourceBindingKey: null,
      latestLaneSessionSourceIdentityKey: null,
      latestLaneSessionHasObservation: false,
      latestLaneSessionSourceId: null,
      latestLaneSessionSourceHash: null,
      latestLaneSessionSourceKind: null,
      latestLaneSessionSourceTextHash: null,
      latestLaneSessionSourceTextCharCount: null,
      latestLaneSessionProjectionTarget: null,
      latestLaneSessionAccountLocale: null,
      latestLaneSessionTargetLanguage: null,
      latestLaneSessionChunkId: null,
      latestLaneSessionChunkIndex: null,
      latestLaneSessionDedupeKey: null,
      latestLaneSessionSourceEventId: null,
      latestLaneSessionSourceEventMs: null,
      latestLaneSessionObservedAtMs: null,
      latestLaneSessionFreshnessStatus: null,
      latestLaneSessionSelectedBackendProvider: null,
      latestLaneSessionTerminalAuthorityStatus: "not_terminal_authority",
      mailLoopCount: 0,
      pendingMailLoopCount: 0,
      observedMailLoopCount: 0,
      blockedMailLoopCount: 0,
      latestMailLoopStatus: null,
      latestMailLoopId: null,
      latestMailLoopDeliveryStatus: null,
      latestMailLoopBlockedReason: null,
      latestPreviousStagePlayMailId: null,
      latestMailLoopWakeKind: "none",
      latestMailLoopMailboxWakeExpected: false,
      latestMailLoopDecisionWakeExpected: false,
      latestMailLoopObservationLaneSessionId: null,
      latestMailLoopSessionControlKey: null,
      latestMailLoopSourceBindingKey: null,
      latestMailLoopSourceIdentityKey: null,
      latestMailLoopLaneSessionSourceBindingKey: null,
      latestMailLoopLaneSessionSourceIdentityKey: null,
      latestMailLoopSourceId: null,
      latestMailLoopSourceHash: null,
      latestMailLoopSourceKind: null,
      latestMailLoopSourceTextHash: null,
      latestMailLoopSourceTextCharCount: null,
      latestMailLoopProjectionTarget: null,
      latestMailLoopAccountLocale: null,
      latestMailLoopTargetLanguage: null,
      latestMailLoopChunkId: null,
      latestMailLoopChunkIndex: null,
      latestMailLoopDedupeKey: null,
      latestMailLoopSourceEventId: null,
      latestMailLoopSourceEventMs: null,
      latestMailLoopObservedAtMs: null,
      latestMailLoopFreshnessStatus: null,
      latestMailLoopSelectedBackendProvider: null,
      latestMailLoopTerminalAuthorityStatus: "not_terminal_authority",
      goalBindingCount: 0,
      activeGoalBindingCount: 0,
      observedGoalBindingCount: 0,
      blockedGoalBindingCount: 0,
      latestGoalBindingId: null,
      latestGoalId: null,
      latestGoalBindingLaneSessionId: null,
      latestGoalBindingStatus: null,
      latestGoalBindingSessionStatus: null,
      latestGoalBindingSessionHealth: null,
      latestGoalBindingActivationPolicy: null,
      latestGoalBindingAttentionPolicy: null,
      latestGoalBindingStopCondition: null,
      latestGoalBindingReportPolicy: null,
      latestGoalBindingQuietBehavior: null,
      latestGoalBindingReportAction: null,
      latestGoalBindingReportReason: null,
      latestGoalBindingQuietBehaviorApplied: null,
      latestGoalBindingWakeExpected: null,
      latestGoalBindingMailboxWakeExpected: null,
      latestGoalBindingDecisionWakeExpected: null,
      latestGoalBindingSurfaceBadgeExpected: null,
      latestGoalBindingTerminalReportRequested: null,
      latestGoalBindingTerminalReportAuthorized: null,
      latestGoalBindingSelectedBackendProvider: null,
      latestGoalBindingObservationRef: null,
      latestGoalBindingReceiptRef: null,
      latestGoalBindingEventId: null,
      latestGoalBindingSessionControlKey: null,
      latestGoalBindingSourceBindingKeyFromEvent: null,
      latestGoalBindingSourceIdentityKey: null,
      latestGoalBindingLaneSessionSourceBindingKey: null,
      latestGoalBindingLaneSessionSourceIdentityKey: null,
      latestGoalBindingHasObservation: false,
      latestGoalBindingTerminalAuthorityStatus: "not_terminal_authority",
      latestGoalBindingSourceId: null,
      latestGoalBindingSourceHash: null,
      latestGoalBindingSourceKind: null,
      latestGoalBindingSourceTextHash: null,
      latestGoalBindingSourceTextCharCount: null,
      latestGoalBindingProjectionTarget: null,
      latestGoalBindingAccountLocale: null,
      latestGoalBindingTargetLanguage: null,
      latestGoalBindingChunkId: null,
      latestGoalBindingChunkIndex: null,
      latestGoalBindingDedupeKey: null,
      latestGoalBindingSourceBindingKey: null,
      latestGoalBindingSourceIdentityKeyFromBinding: null,
      latestGoalBindingObservationKey: null,
      latestGoalBindingMailLoopObservationKey: null,
      latestGoalBindingKeyFromBinding: null,
      observedLaneActivityCount: 0,
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("ingests matching Ask live-event translation projections into document state", () => {
    const snapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      eventPayload: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "receipt:live-event",
          text: "UI translation projection.",
          meta: {
            source_event_type: "ui_translation_projection",
            lane: "live_translation",
            sourceId: "document_markdown:docs/research/nhm2.md",
            latestProjectionTarget: "docs_chunk",
            latestChunkId: "u0001",
            latestDedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
            latestObservedAtMs: 300,
            latestFreshnessStatus: "fresh",
            sourceTextHash: "source-text-live-event",
            targetLanguage: "es-US",
            translatedText: "Texto desde evento.",
            projectionStatus: "projected",
            projectionKey: "server-projection-key-live-event",
            receiptRef: "receipt:live-event",
            laneSessionId: "lane-session-live-event",
            observationLaneSessionId: "lane-session-live-event-observation",
            goalBindingId: "goal-binding-live-event",
            sourceIdentityKey: "document_markdown:docs/research/nhm2.md::source-text-live-event::docs::docs_chunk::es-US",
            latestEventId: "lane-session-live-event:observation_recorded:300",
            hasObservation: true,
            selectedBackendProvider: "live_translation.local_runtime",
            observationRef: "obs:live-event",
            terminalAuthorityStatus: "pending_helix_terminal_authority",
            answerAuthority: false,
            terminalEligible: false,
            assistantAnswer: false,
            rawContentIncluded: false,
          },
        },
      },
    });

    expect(snapshot.translations.u0001).toEqual({
      status: "ready",
      text: "Texto desde evento.",
      serverProjectionKey: "server-projection-key-live-event",
      observationRef: "obs:live-event",
      receiptRef: "receipt:live-event",
      laneSessionId: "lane-session-live-event",
      observationLaneSessionId: "lane-session-live-event-observation",
      goalBindingId: "goal-binding-live-event",
      sourceIdentityKey: "document_markdown:docs/research/nhm2.md::source-text-live-event::docs::docs_chunk::es-US",
      latestSourceIdentityKey:
        "document_markdown:docs/research/nhm2.md::source-text-live-event::docs::docs_chunk::es-US",
      latestEventId: "lane-session-live-event:observation_recorded:300",
      hasObservation: true,
      projectionStatus: "projected",
      ...registryMeta({
        dedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
        observedAtMs: 300,
        laneSessionId: "lane-session-live-event",
        observationLaneSessionId: "lane-session-live-event-observation",
        goalBindingId: "goal-binding-live-event",
        latestEventId: "lane-session-live-event:observation_recorded:300",
        hasObservation: true,
        selectedBackendProvider: "live_translation.local_runtime",
        freshnessStatus: "fresh",
        sourceTextHash: "source-text-live-event",
        targetLanguage: "es-US",
        terminalAuthorityStatus: "pending_helix_terminal_authority",
      }),
      source: "capability_lane",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(snapshot)).toMatchObject({
      latestObservationRef: "obs:live-event",
      latestReceiptRef: "receipt:live-event",
      latestLaneSessionId: "lane-session-live-event",
      latestObservationLaneSessionId: "lane-session-live-event-observation",
      latestGoalBindingIdFromProjection: "goal-binding-live-event",
      latestEventId: "lane-session-live-event:observation_recorded:300",
      latestHasObservation: true,
      latestProjectionKey:
        "document_markdown:docs/research/nhm2.md::source-text-live-event::docs::docs_chunk::es-US::u0001::receipt:live-event",
      latestServerProjectionKey: "server-projection-key-live-event",
      latestSourceIdentityKey: "document_markdown:docs/research/nhm2.md::source-text-live-event::docs::docs_chunk::es-US",
      latestSourceTextHash: "source-text-live-event",
      latestTerminalAuthorityStatus: "pending_helix_terminal_authority",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(buildDocumentInlineTranslationDataAttributes(snapshot.translations.u0001)).toMatchObject({
      "data-doc-translation-source-identity-key":
        "document_markdown:docs/research/nhm2.md::source-text-live-event::docs::docs_chunk::es-US",
    });
  });

  it("ingests canonical lane projection receipt live events into document state", () => {
    const snapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:receipt-doc",
      units: [unit("u0001")],
      eventPayload: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "receipt:canonical-live-event",
          text: "Lane receipt: live_translation.translate_text projection receipt recorded.",
          meta: {
            source_event_type: "lane_projection_receipt",
            lane: "live_translation",
            sourceId: "document_markdown:docs/research/nhm2.md",
            sourceHash: "fnv1a32:receipt-doc",
            sourceKind: "docs",
            sourceTextHash: "source-text-canonical-receipt",
            sourceTextCharCount: 39,
            latestProjectionTarget: "docs_chunk",
            latestChunkId: "u0001",
            latestChunkIndex: 2,
            latestDedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es:receipt",
            latestSourceEventId: "docs:event:canonical-receipt",
            latestSourceEventMs: 400,
            latestObservedAtMs: 425,
            latestFreshnessStatus: "fresh",
            accountLocale: "es-US",
            targetLanguage: "es",
            translatedText: "Texto desde recibo canonico.",
            projectionStatus: "projected",
            projectionKey: "server-projection-key-canonical-receipt",
            receiptRef: "receipt:canonical-live-event",
            observationRef: "obs:canonical-live-event",
            selectedBackendProvider: "live_translation.local_runtime",
            terminalAuthorityStatus: "not_terminal_authority",
            answerAuthority: false,
            terminalEligible: false,
            assistantAnswer: false,
            rawContentIncluded: false,
          },
        },
      },
    });

    expect(snapshot.translations.u0001).toEqual({
      status: "ready",
      text: "Texto desde recibo canonico.",
      serverProjectionKey: "server-projection-key-canonical-receipt",
      observationRef: "obs:canonical-live-event",
      receiptRef: "receipt:canonical-live-event",
      laneSessionId: null,
      observationLaneSessionId: null,
      goalBindingId: null,
      latestEventId: null,
      hasObservation: true,
      selectedBackendProvider: "live_translation.local_runtime",
      projectionStatus: "projected",
      ...registryMeta({
        chunkIndex: 2,
        dedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es:receipt",
        sourceEventId: "docs:event:canonical-receipt",
        sourceEventMs: 400,
        observedAtMs: 425,
        selectedBackendProvider: "live_translation.local_runtime",
        freshnessStatus: "fresh",
        sourceHash: "fnv1a32:receipt-doc",
        sourceKind: "docs",
        sourceTextHash: "source-text-canonical-receipt",
        sourceTextCharCount: 39,
        accountLocale: "es-US",
        targetLanguage: "es",
      }),
      source: "capability_lane",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(snapshot)).toMatchObject({
      latestProjectionKey:
        "document_markdown:docs/research/nhm2.md::fnv1a32:receipt-doc::source-text-canonical-receipt::docs_chunk::es::u0001::receipt:canonical-live-event",
      latestServerProjectionKey: "server-projection-key-canonical-receipt",
      latestTerminalAuthorityStatus: "not_terminal_authority",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("accepts canonical latest source identity key live-event metadata", () => {
    const latestSourceIdentityKey =
      "document_markdown:docs/research/nhm2.md::fnv1a32:receipt-doc::source-text-canonical-receipt::docs::docs_chunk::es-US::es";
    const snapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:receipt-doc",
      sourceIdentityKey: latestSourceIdentityKey,
      units: [unit("u0001")],
      eventPayload: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "receipt:canonical-latest-source-identity",
          text: "Lane receipt: live_translation.translate_text projection receipt recorded.",
          meta: {
            source_event_type: "lane_projection_receipt",
            lane: "live_translation",
            sourceId: "document_markdown:docs/research/nhm2.md",
            sourceHash: "fnv1a32:receipt-doc",
            sourceKind: "docs",
            sourceTextHash: "source-text-canonical-receipt",
            latestProjectionTarget: "docs_chunk",
            latestChunkId: "u0001",
            latestObservedAtMs: 425,
            latestFreshnessStatus: "fresh",
            targetLanguage: "es",
            translatedText: "Texto desde identidad reciente.",
            projectionStatus: "projected",
            receiptRef: "receipt:canonical-latest-source-identity",
            observationRef: "obs:canonical-latest-source-identity",
            latest_source_identity_key: latestSourceIdentityKey,
            terminalAuthorityStatus: "not_terminal_authority",
            answerAuthority: false,
            terminalEligible: false,
            assistantAnswer: false,
            rawContentIncluded: false,
          },
        },
      },
    });

    expect(snapshot.translations.u0001).toMatchObject({
      status: "ready",
      text: "Texto desde identidad reciente.",
      sourceIdentityKey: latestSourceIdentityKey,
      latestSourceIdentityKey,
      observationRef: "obs:canonical-latest-source-identity",
      receiptRef: "receipt:canonical-latest-source-identity",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(snapshot)).toMatchObject({
      latestSourceIdentityKey,
      latestObservationRef: "obs:canonical-latest-source-identity",
      latestReceiptRef: "receipt:canonical-latest-source-identity",
      latestTerminalAuthorityStatus: "not_terminal_authority",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(buildDocumentInlineTranslationDataAttributes(snapshot.translations.u0001)).toMatchObject({
      "data-doc-translation-source-identity-key": latestSourceIdentityKey,
      "data-doc-translation-latest-source-identity-key": latestSourceIdentityKey,
    });
  });

  it("summarizes newest source identity keys over older source identity keys", () => {
    const summary = summarizeDocumentLiveTranslationProjectionSnapshot({
      version: 7,
      translations: {
        u0001: {
          status: "ready",
          text: "Texto actual.",
          observationRef: "obs:docs:u1:current",
          receiptRef: "receipt:docs:u1:current",
          projectionStatus: "projected",
          sourceIdentityKey:
            "document_markdown:docs/research/nhm2.md::source-hash-old::source-text-old::10::docs::docs_chunk::es-US::es",
          latestSourceIdentityKey:
            "document_markdown:docs/research/nhm2.md::source-hash-current::source-text-current::13::docs::docs_chunk::es-US::es",
          suppressedObservationRef: "obs:docs:u1:stale",
          suppressedReceiptRef: "receipt:docs:u1:stale",
          suppressedProjectionStatus: "stale",
          suppressedSourceIdentityKey:
            "document_markdown:docs/research/nhm2.md::source-hash-stale-old::source-text-stale-old::8::docs::docs_chunk::es-US::es",
          suppressedLatestSourceIdentityKey:
            "document_markdown:docs/research/nhm2.md::source-hash-stale-current::source-text-stale-current::12::docs::docs_chunk::es-US::es",
          suppressedSelectedBackendProvider: "live_translation.local_runtime",
          suppressedReason: "stale_projection_did_not_replace_fresh_text",
          source: "capability_lane",
          answerAuthority: false,
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
          ...registryMeta({
            observedAtMs: 450,
          }),
        },
      },
      laneSessions: {},
      mailLoops: {},
      goalBindings: {},
    });

    expect(summary).toMatchObject({
      latestSourceIdentityKey:
        "document_markdown:docs/research/nhm2.md::source-hash-current::source-text-current::13::docs::docs_chunk::es-US::es",
      latestSuppressedSourceIdentityKey:
        "document_markdown:docs/research/nhm2.md::source-hash-stale-current::source-text-stale-current::12::docs::docs_chunk::es-US::es",
      latestSuppressedSelectedBackendProvider: "live_translation.local_runtime",
    });
    expect(summary.latestProjectionKey).toContain("source-hash-current::source-text-current");
    expect(summary.latestSuppressedProjectionKey).toContain("source-hash-stale-current::source-text-stale-current");
  });

  it("keeps projection receipt live-event source text mismatches inspectable", () => {
    const snapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:receipt-doc",
      sourceTextHash: "source-text-current",
      sourceTextCharCount: 39,
      units: [unit("u0001")],
      eventPayload: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "receipt:stale-source-text",
          text: "Lane receipt: stale source text projection receipt recorded.",
          meta: {
            source_event_type: "lane_projection_receipt",
            lane: "live_translation",
            sourceId: "document_markdown:docs/research/nhm2.md",
            sourceHash: "fnv1a32:receipt-doc",
            sourceKind: "docs",
            sourceTextHash: "source-text-previous",
            sourceTextCharCount: 39,
            latestProjectionTarget: "docs_chunk",
            latestChunkId: "u0001",
            latestObservedAtMs: 425,
            latestFreshnessStatus: "fresh",
            targetLanguage: "es",
            translatedText: "Texto anterior no debe proyectarse.",
            projectionStatus: "projected",
            receiptRef: "receipt:stale-source-text",
            observationRef: "obs:stale-source-text",
            answerAuthority: false,
            terminalEligible: false,
            assistantAnswer: false,
            rawContentIncluded: false,
          },
        },
      },
    });

    expect(snapshot.translations.u0001).toMatchObject({
      status: "error",
      error: "translation_projection_source_text_mismatch",
      projectionStatus: "missing",
      sourceHash: "fnv1a32:receipt-doc",
      sourceTextHash: "source-text-current",
      sourceTextCharCount: 39,
      observationRef: "obs:stale-source-text",
      receiptRef: "receipt:stale-source-text",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(snapshot.laneSessions).toEqual({});
    expect(snapshot.mailLoops).toEqual({});
    expect(snapshot.goalBindings).toEqual({});
    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:receipt-doc",
      projectionTarget: "docs_chunk",
    })).toEqual(snapshot);
  });

  it("normalizes direct canonical receipt timing and chunk fields from lane timeline live events", () => {
    const snapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:direct-receipt-doc",
      projectionTarget: "docs_chunk",
      units: [unit("u0001")],
      eventPayload: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "receipt:direct-canonical-live-event",
          text: "Lane projection receipt recorded.",
          meta: {
            source_event_type: "lane_projection_receipt",
            lane: "live_translation",
            sourceId: "document_markdown:docs/research/nhm2.md",
            sourceHash: "fnv1a32:direct-receipt-doc",
            sourceKind: "document_markdown",
            projectionTarget: "docs_chunk",
            targetLanguage: "es",
            chunkId: "u0001",
            chunkIndex: 7,
            dedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
            sourceEventId: "docs:event-direct-receipt",
            sourceEventMs: 700,
            observedAtMs: 725,
            freshnessStatus: "stale",
            sourceTextHash: "source-text-direct-receipt",
            sourceTextCharCount: 29,
            translatedText: "Texto directo.",
            projectionStatus: "stale",
            cancelRequested: true,
            projectionKey: "server-projection-key-direct-receipt",
            receiptRef: "receipt:direct-canonical-live-event",
            observationRef: "obs:direct-canonical-live-event",
            terminalAuthorityStatus: "not_terminal_authority",
          },
        },
      },
      allowStaleDisplayText: true,
    });

    expect(snapshot.translations.u0001).toMatchObject({
      status: "error",
      error: "translation_projection_cancelled",
      serverProjectionKey: "server-projection-key-direct-receipt",
      observationRef: "obs:direct-canonical-live-event",
      receiptRef: "receipt:direct-canonical-live-event",
      projectionStatus: "cancelled",
      chunkId: "u0001",
      chunkIndex: 7,
      dedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
      sourceEventId: "docs:event-direct-receipt",
      sourceEventMs: 700,
      observedAtMs: 725,
      freshnessStatus: "stale",
      sourceHash: "fnv1a32:direct-receipt-doc",
      sourceTextHash: "source-text-direct-receipt",
      sourceTextCharCount: 29,
      cancelRequested: true,
      terminalAuthorityStatus: "not_terminal_authority",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(snapshot)).toMatchObject({
      latestChunkId: "u0001",
      latestChunkIndex: 7,
      latestDedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
      latestSourceEventId: "docs:event-direct-receipt",
      latestSourceEventMs: 700,
      latestObservedAtMs: 725,
      latestFreshnessStatus: "stale",
      latestCancelRequested: true,
      latestProjectionStatus: "cancelled",
      latestSuppressedDisplayStatus: null,
      latestSuppressedReceiptRef: null,
      latestTerminalAuthorityStatus: "not_terminal_authority",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("ingests base-language live-event projections for regional account locales", () => {
    const snapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es-US",
      units: [unit("u0001")],
      eventPayload: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "receipt:live-event-base-language",
          text: "UI translation projection.",
          meta: {
            source_event_type: "ui_translation_projection",
            lane: "live_translation",
            sourceId: "document_markdown:docs/research/nhm2.md",
            latestProjectionTarget: "docs_chunk",
            latestChunkId: "u0001",
            latestObservedAtMs: 350,
            latestFreshnessStatus: "fresh",
            targetLanguage: "es",
            translatedText: "Texto base desde evento.",
            projectionStatus: "projected",
            receiptRef: "receipt:live-event-base-language",
            observationRef: "obs:live-event-base-language",
            answerAuthority: false,
            terminalEligible: false,
            assistantAnswer: false,
            rawContentIncluded: false,
          },
        },
      },
    });

    expect(snapshot.translations.u0001).toMatchObject({
      status: "ready",
      text: "Texto base desde evento.",
      observationRef: "obs:live-event-base-language",
      receiptRef: "receipt:live-event-base-language",
      projectionStatus: "projected",
      targetLanguage: "es",
      observedAtMs: 350,
      source: "capability_lane",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("ingests matching Ask live-event lane session state without projecting text", () => {
    const snapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:session",
      units: [unit("u0001")],
      eventPayload: laneSessionLiveEvent({
        sourceHash: "fnv1a32:session",
        lifecycleAction: undefined,
        sessionLifecycleAction: "record_observation",
        terminalAuthorityStatus: "pending_helix_terminal_authority",
        latestReceiptRef: "receipt:lane-session-docs:latest",
      }),
    });

    expect(snapshot.translations).toEqual({});
    expect(snapshot.laneSessions["lane-session-docs"]).toEqual({
      laneSessionId: "lane-session-docs",
      laneId: "live_translation",
      lifecycleAction: "record_observation",
      lifecycleReason: "lane_session_observation_recorded",
      sessionDebugPhase: "running:record_observation:observation_recorded",
      sessionObservationStatus: "observation_recorded",
      permissionProfile: "permissions non-mutating",
      sessionStatus: "running",
      sessionHealth: "healthy",
      sourceId: "document_markdown:docs/research/nhm2.md",
      sourceHash: "fnv1a32:session",
      sourceKind: "docs",
      sourceTextHash: "source-text-hash-session",
      sourceTextCharCount: 2048,
      projectionTarget: "docs_chunk",
      accountLocale: "es-US",
      targetLanguage: "es",
      selectedBackendProvider: "live_translation.local_runtime",
      latestChunkId: "u0001",
      latestChunkIndex: 0,
      latestDedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
      latestSourceEventId: "docs:event:1",
      latestSourceEventMs: 250,
      latestObservedAtMs: 300,
      latestFreshnessStatus: "fresh",
      latestEventId: "lane-session-docs:observation_recorded:300",
      sessionControlKey: "lane-session-docs::fnv1a32:session::docs_chunk::es-US::es",
      sourceBindingKey: "docs:nhm2::fnv1a32:session::docs_chunk::es-US::es",
      latestSourceBindingKey: "docs:nhm2::fnv1a32:session-latest::docs_chunk::es-US::es",
      sourceIdentityKey: "docs:nhm2::fnv1a32:session::docs::docs_chunk::es-US::es",
      laneSessionSourceBindingKey: "docs:nhm2::fnv1a32:session::docs_chunk::es-US::es",
      laneSessionSourceIdentityKey: "docs:nhm2::fnv1a32:session::docs::docs_chunk::es-US::es",
      latestObservationKey: "docs:nhm2::fnv1a32:session::docs_chunk::es::u0001::obs:lane-session-docs",
      hasObservation: true,
      terminalAuthorityStatus: "pending_helix_terminal_authority",
      lastObservationRef: "obs:lane-session-docs",
      lastReceiptRef: "receipt:lane-session-docs:latest",
      updatedAtMs: 325,
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(snapshot)).toMatchObject({
      totalCount: 0,
      readyCount: 0,
      laneSessionCount: 1,
      activeLaneSessionCount: 1,
      observedLaneSessionCount: 1,
      pausedLaneSessionCount: 0,
      stoppedLaneSessionCount: 0,
      blockedLaneSessionCount: 0,
      latestLaneSessionId: "lane-session-docs",
      latestSelectedBackendProvider: "live_translation.local_runtime",
      latestChunkId: "u0001",
      latestDedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
      latestSourceKind: "docs",
      latestSourceHash: "fnv1a32:session",
      latestSourceTextHash: "source-text-hash-session",
      latestSourceTextCharCount: 2048,
      latestProjectionTarget: "docs_chunk",
      latestAccountLocale: "es-US",
      latestTargetLanguage: "es",
      latestObservedAtMs: 300,
      latestSourceEventMs: 250,
      latestObservationRef: "obs:lane-session-docs",
      latestReceiptRef: "receipt:lane-session-docs:latest",
      latestFreshnessStatus: "fresh",
      latestContextRole: "tool_evidence",
      latestTerminalAuthorityStatus: "pending_helix_terminal_authority",
      latestLaneSessionStatus: "running",
      latestLaneSessionHealth: "healthy",
      latestLaneSessionLifecycleAction: "record_observation",
      latestLaneSessionReason: "lane_session_observation_recorded",
      latestLaneSessionDebugPhase: "running:record_observation:observation_recorded",
      latestLaneSessionObservationStatus: "observation_recorded",
      latestLaneSessionPermissionProfile: "permissions non-mutating",
      latestLaneSessionUpdatedAtMs: 325,
      latestLaneSessionEventId: "lane-session-docs:observation_recorded:300",
      latestLaneSessionControlKey: "lane-session-docs::fnv1a32:session::docs_chunk::es-US::es",
      latestLaneSessionSourceBindingKey: "docs:nhm2::fnv1a32:session::docs_chunk::es-US::es",
      latestLaneSessionSourceIdentityKey: "docs:nhm2::fnv1a32:session::docs::docs_chunk::es-US::es",
      latestLaneSessionHasObservation: true,
      latestLaneSessionSourceId: "document_markdown:docs/research/nhm2.md",
      latestLaneSessionSourceHash: "fnv1a32:session",
      latestLaneSessionSourceKind: "docs",
      latestLaneSessionSourceTextHash: "source-text-hash-session",
      latestLaneSessionSourceTextCharCount: 2048,
      latestLaneSessionProjectionTarget: "docs_chunk",
      latestLaneSessionAccountLocale: "es-US",
      latestLaneSessionTargetLanguage: "es",
      latestLaneSessionChunkId: "u0001",
      latestLaneSessionChunkIndex: 0,
      latestLaneSessionDedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
      latestLaneSessionSourceEventId: "docs:event:1",
      latestLaneSessionSourceEventMs: 250,
      latestLaneSessionObservedAtMs: 300,
      latestLaneSessionFreshnessStatus: "fresh",
      latestLaneSessionSelectedBackendProvider: "live_translation.local_runtime",
      latestLaneSessionTerminalAuthorityStatus: "pending_helix_terminal_authority",
      latestSessionControlKey: "lane-session-docs::fnv1a32:session::docs_chunk::es-US::es",
      latestSourceBindingKey: "docs:nhm2::fnv1a32:session-latest::docs_chunk::es-US::es",
      latestSourceIdentityKey: "docs:nhm2::fnv1a32:session::docs::docs_chunk::es-US::es",
      latestObservationKey: "docs:nhm2::fnv1a32:session::docs_chunk::es::u0001::obs:lane-session-docs",
      mailLoopCount: 0,
      observedMailLoopCount: 0,
      goalBindingCount: 0,
      observedGoalBindingCount: 0,
      observedLaneActivityCount: 1,
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("updates lane activity snapshots when only the selected runtime provider changes", () => {
    const baseInput = {
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
    };

    const helixSession = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      ...baseInput,
      sourceHash: "fnv1a32:session",
      eventPayload: laneSessionLiveEvent({
        sourceHash: "fnv1a32:session",
        selectedRuntimeAgentProvider: "helix",
      }),
    });
    const codexSession = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      ...baseInput,
      sourceHash: "fnv1a32:session",
      eventPayload: laneSessionLiveEvent({
        sourceHash: "fnv1a32:session",
        selectedRuntimeAgentProvider: "codex",
      }),
    });

    expect(codexSession.version).toBeGreaterThan(helixSession.version);
    expect(codexSession.laneSessions["lane-session-docs"]).toMatchObject({
      selectedRuntimeAgentProvider: "codex",
      selectedBackendProvider: "live_translation.local_runtime",
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(codexSession)).toMatchObject({
      latestSelectedRuntimeAgentProvider: "codex",
      latestLaneSessionSelectedRuntimeAgentProvider: "codex",
      latestLaneSessionSelectedBackendProvider: "live_translation.local_runtime",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });

    const helixMailLoop = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      ...baseInput,
      eventPayload: laneMailLoopLiveEvent({
        selectedRuntimeAgentProvider: "helix",
      }),
    });
    const codexMailLoop = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      ...baseInput,
      eventPayload: laneMailLoopLiveEvent({
        selectedRuntimeAgentProvider: "codex",
      }),
    });

    expect(codexMailLoop.version).toBeGreaterThan(helixMailLoop.version);
    expect(Object.values(codexMailLoop.mailLoops)[0]).toMatchObject({
      selectedRuntimeAgentProvider: "codex",
      selectedBackendProvider: "live_translation.local_runtime",
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(codexMailLoop)).toMatchObject({
      latestSelectedRuntimeAgentProvider: "codex",
      latestMailLoopSelectedRuntimeAgentProvider: "codex",
      latestMailLoopSelectedBackendProvider: "live_translation.local_runtime",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });

    const helixGoalBinding = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      ...baseInput,
      eventPayload: laneGoalBindingLiveEvent({
        selectedRuntimeAgentProvider: "helix",
      }),
    });
    const codexGoalBinding = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      ...baseInput,
      eventPayload: laneGoalBindingLiveEvent({
        selectedRuntimeAgentProvider: "codex",
      }),
    });

    expect(codexGoalBinding.version).toBeGreaterThan(helixGoalBinding.version);
    expect(codexGoalBinding.goalBindings["goal-binding-translate-docs"]).toMatchObject({
      selectedRuntimeAgentProvider: "codex",
      selectedBackendProvider: "live_translation.local_runtime",
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(codexGoalBinding)).toMatchObject({
      latestSelectedRuntimeAgentProvider: "codex",
      latestGoalBindingSelectedRuntimeAgentProvider: "codex",
      latestGoalBindingSelectedBackendProvider: "live_translation.local_runtime",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("ingests Ask live-event lane activity with latest language metadata only", () => {
    const baseInput = {
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
    };

    const latestLanguageOnly = {
      accountLocale: undefined,
      account_locale: undefined,
      latestAccountLocale: "es-US",
      targetLanguage: undefined,
      target_language: undefined,
      latestTargetLanguage: "es",
    };

    const sessionSnapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      ...baseInput,
      sourceHash: "fnv1a32:session",
      eventPayload: laneSessionLiveEvent({
        ...latestLanguageOnly,
        sourceHash: "fnv1a32:session",
      }),
    });

    expect(sessionSnapshot.laneSessions["lane-session-docs"]).toMatchObject({
      accountLocale: "es-US",
      targetLanguage: "es",
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(sessionSnapshot)).toMatchObject({
      latestAccountLocale: "es-US",
      latestTargetLanguage: "es",
      latestLaneSessionAccountLocale: "es-US",
      latestLaneSessionTargetLanguage: "es",
    });

    const mailSnapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      ...baseInput,
      sourceHash: "fnv1a32:mail",
      eventPayload: laneMailLoopLiveEvent({
        ...latestLanguageOnly,
        sourceHash: "fnv1a32:mail",
      }),
    });

    expect(mailSnapshot.mailLoops["stage-play-mail-translation"]).toMatchObject({
      accountLocale: "es-US",
      targetLanguage: "es",
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(mailSnapshot)).toMatchObject({
      latestAccountLocale: "es-US",
      latestTargetLanguage: "es",
      latestMailLoopAccountLocale: "es-US",
      latestMailLoopTargetLanguage: "es",
    });

    const goalSnapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      ...baseInput,
      sourceHash: "fnv1a32:goal",
      eventPayload: laneGoalBindingLiveEvent({
        ...latestLanguageOnly,
        sourceHash: "fnv1a32:goal",
      }),
    });

    expect(goalSnapshot.goalBindings["goal-binding-translate-docs"]).toMatchObject({
      accountLocale: "es-US",
      targetLanguage: "es",
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(goalSnapshot)).toMatchObject({
      latestAccountLocale: "es-US",
      latestTargetLanguage: "es",
      latestGoalBindingAccountLocale: "es-US",
      latestGoalBindingTargetLanguage: "es",
    });
  });

  it("normalizes serialized lane session chunk timing metadata from Ask live events", () => {
    const snapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      eventPayload: laneSessionLiveEvent({
        latestChunkIndex: "4",
        latestSourceEventMs: "450",
        latestObservedAtMs: "500",
        updatedAtMs: "525",
      }),
    });

    expect(snapshot.laneSessions["lane-session-docs"]).toMatchObject({
      latestChunkIndex: 4,
      latestSourceEventMs: 450,
      latestObservedAtMs: 500,
      updatedAtMs: 525,
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(snapshot)).toMatchObject({
      latestChunkIndex: 4,
      latestSourceEventMs: 450,
      latestObservedAtMs: 500,
      latestLaneSessionUpdatedAtMs: 525,
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("ingests timeline-shaped lane session state from session-list reads", () => {
    const snapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:session",
      sourceIdentityKey: "docs:nhm2::fnv1a32:session::docs::docs_chunk::es-US::es",
      units: [unit("u0001")],
      eventPayload: laneSessionLiveEvent({
        sourceHash: "fnv1a32:session",
        source_hash: "fnv1a32:session",
        sessionStatus: undefined,
        session_status: undefined,
        status: "paused",
        latestProjectionTarget: undefined,
        latest_projection_target: undefined,
        sourceProjectionTarget: "docs_chunk",
        source_projection_target: "docs_chunk",
        latestEventId: undefined,
        latest_event_id: undefined,
        seq: 7,
        hasObservation: false,
        has_observation: false,
        observationRef: undefined,
        observation_ref: undefined,
        receiptRef: undefined,
        receipt_ref: undefined,
      }),
    });

    expect(snapshot.translations).toEqual({});
    expect(snapshot.laneSessions["lane-session-docs"]).toMatchObject({
      laneSessionId: "lane-session-docs",
      laneId: "live_translation",
      sessionStatus: "paused",
      sessionHealth: "healthy",
      projectionTarget: "docs_chunk",
      sourceIdentityKey: "docs:nhm2::fnv1a32:session::docs::docs_chunk::es-US::es",
      hasObservation: false,
      lastObservationRef: null,
      lastReceiptRef: null,
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(snapshot)).toMatchObject({
      laneSessionCount: 1,
      activeLaneSessionCount: 1,
      observedLaneSessionCount: 0,
      pausedLaneSessionCount: 1,
      latestLaneSessionStatus: "paused",
      latestLaneSessionProjectionTarget: "docs_chunk",
      latestLaneSessionHasObservation: false,
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("ingests matching Ask live-event lane mail-loop state without projecting text", () => {
    const snapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:mail",
      units: [unit("u0001")],
      eventPayload: laneMailLoopLiveEvent({
        sourceHash: "fnv1a32:mail",
        terminalAuthorityStatus: "pending_helix_terminal_authority",
        stagePlayMailDeliveryStatus: "deduped_existing",
        previousStagePlayMailId: "stage-play-mail-translation",
        latestEventId: "stage-play-mail-translation:observation_recorded:300",
        latestReceiptRef: "receipt:lane-mail-loop-docs:latest",
      }),
    });

    expect(snapshot.translations).toEqual({});
    expect(snapshot.laneSessions).toEqual({});
    expect(snapshot.mailLoops["stage-play-mail-translation"]).toEqual({
      mailLoopId: "stage-play-mail-translation",
      laneSessionId: "lane-session-docs",
      observationLaneSessionId: "lane-session-docs-observation",
      laneId: "live_translation",
      stagePlayMailId: "stage-play-mail-translation",
      stagePlayMailDeliveryStatus: "deduped_existing",
      previousStagePlayMailId: "stage-play-mail-translation",
      stagePlayWakeExpected: true,
      stagePlayWakeKind: "mailbox_wake",
      mailboxWakeExpected: true,
      decisionWakeExpected: false,
      mailboxThreadId: "thread-docs-translation",
      mailStatus: "unread",
      blockedReason: null,
      sourceId: "document_markdown:docs/research/nhm2.md",
      sourceHash: "fnv1a32:mail",
      sourceKind: "docs",
      sourceTextHash: "source-text-hash-mail",
      sourceTextCharCount: 2048,
      projectionTarget: "docs_chunk",
      accountLocale: "es-US",
      targetLanguage: "es",
      selectedBackendProvider: "live_translation.local_runtime",
      latestChunkId: "u0001",
      latestChunkIndex: 0,
      latestDedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
      latestSourceEventId: "docs:event:1",
      latestSourceEventMs: 250,
      latestEventId: "stage-play-mail-translation:observation_recorded:300",
      latestObservedAtMs: 300,
      latestFreshnessStatus: "fresh",
      sessionControlKey: "lane-session-docs::fnv1a32:mail::docs_chunk::es-US::es",
      sourceBindingKey: "docs:nhm2::fnv1a32:mail::docs_chunk::es-US::es",
      latestSourceBindingKey: "docs:nhm2::fnv1a32:mail-latest::docs_chunk::es-US::es",
      sourceIdentityKey: "docs:nhm2::fnv1a32:mail-packet::docs::docs_chunk::es-US::es",
      laneSessionSourceBindingKey: "docs:nhm2::fnv1a32:mail::docs_chunk::es-US::es",
      laneSessionSourceIdentityKey: "docs:nhm2::fnv1a32:mail::docs::docs_chunk::es-US::es",
      latestMailLoopObservationKey: "docs:nhm2::fnv1a32:mail::docs_chunk::es::u0001::obs:lane-mail-loop-docs",
      terminalAuthorityStatus: "pending_helix_terminal_authority",
      observationRef: "obs:lane-mail-loop-docs",
      receiptRef: "receipt:lane-mail-loop-docs:latest",
      hasObservation: true,
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(snapshot)).toMatchObject({
      totalCount: 0,
      readyCount: 0,
      laneSessionCount: 0,
      mailLoopCount: 1,
      pendingMailLoopCount: 1,
      observedMailLoopCount: 1,
      blockedMailLoopCount: 0,
      latestMailLoopStatus: "unread",
      latestMailLoopId: "stage-play-mail-translation",
      latestMailLoopDeliveryStatus: "deduped_existing",
      latestMailLoopBlockedReason: null,
      latestPreviousStagePlayMailId: "stage-play-mail-translation",
      latestMailLoopWakeKind: "mailbox_wake",
      latestMailLoopMailboxWakeExpected: true,
      latestMailLoopDecisionWakeExpected: false,
      latestMailLoopObservationLaneSessionId: "lane-session-docs-observation",
      latestMailLoopSessionControlKey: "lane-session-docs::fnv1a32:mail::docs_chunk::es-US::es",
      latestMailLoopSourceBindingKey: "docs:nhm2::fnv1a32:mail-latest::docs_chunk::es-US::es",
      latestMailLoopSourceIdentityKey: "docs:nhm2::fnv1a32:mail-packet::docs::docs_chunk::es-US::es",
      latestMailLoopLaneSessionSourceBindingKey: "docs:nhm2::fnv1a32:mail::docs_chunk::es-US::es",
      latestMailLoopLaneSessionSourceIdentityKey: "docs:nhm2::fnv1a32:mail::docs::docs_chunk::es-US::es",
      latestMailLoopSelectedBackendProvider: "live_translation.local_runtime",
      latestMailLoopTerminalAuthorityStatus: "pending_helix_terminal_authority",
      latestEventId: "stage-play-mail-translation:observation_recorded:300",
      latestHasObservation: true,
      latestSessionControlKey: "lane-session-docs::fnv1a32:mail::docs_chunk::es-US::es",
      latestSelectedBackendProvider: "live_translation.local_runtime",
      latestSourceHash: "fnv1a32:mail",
      latestSourceKind: "docs",
      latestSourceTextHash: "source-text-hash-mail",
      latestSourceTextCharCount: 2048,
      latestProjectionTarget: "docs_chunk",
      latestAccountLocale: "es-US",
      latestTerminalAuthorityStatus: "pending_helix_terminal_authority",
      latestContextRole: "tool_evidence",
      latestSourceBindingKey: "docs:nhm2::fnv1a32:mail-latest::docs_chunk::es-US::es",
      latestSourceIdentityKey: "docs:nhm2::fnv1a32:mail-packet::docs::docs_chunk::es-US::es",
      latestMailLoopObservationKey: "docs:nhm2::fnv1a32:mail::docs_chunk::es::u0001::obs:lane-mail-loop-docs",
      goalBindingCount: 0,
      activeGoalBindingCount: 0,
      observedGoalBindingCount: 0,
      blockedGoalBindingCount: 0,
      observedLaneActivityCount: 1,
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("keeps newer mail-loop lifecycle state when a late older blocked event arrives", () => {
    const blockedSnapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      eventPayload: laneMailLoopLiveEvent({
        stagePlayWakeExpected: true,
        mailStatus: "unread",
        blockedReason: "translation_backend_busy",
        latestObservedAtMs: 100,
        observationRef: "obs:lane-mail-loop-docs:blocked",
        stagePlayMailDeliveryStatus: "deduped_existing",
        previousStagePlayMailId: "stage-play-mail-translation",
      }),
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(blockedSnapshot)).toMatchObject({
      mailLoopCount: 1,
      pendingMailLoopCount: 1,
      blockedMailLoopCount: 1,
      latestMailLoopStatus: "unread",
      latestMailLoopBlockedReason: "translation_backend_busy",
    });
    const clearedSnapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      eventPayload: laneMailLoopLiveEvent({
        stagePlayWakeExpected: false,
        mailStatus: "processed",
        blockedReason: null,
        latestObservedAtMs: 300,
        observationRef: "obs:lane-mail-loop-docs:processed",
      }),
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(clearedSnapshot)).toMatchObject({
      mailLoopCount: 1,
      blockedMailLoopCount: 0,
      latestMailLoopStatus: "processed",
      latestMailLoopBlockedReason: null,
    });
    const lateSnapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      eventPayload: laneMailLoopLiveEvent({
        stagePlayWakeExpected: true,
        mailStatus: "unread",
        blockedReason: "translation_backend_busy",
        latestObservedAtMs: 200,
        observationRef: "obs:lane-mail-loop-docs:late-blocked",
      }),
    });

    expect(lateSnapshot).toBe(clearedSnapshot);
    expect(lateSnapshot.mailLoops["stage-play-mail-translation"]).toMatchObject({
      stagePlayWakeExpected: false,
      stagePlayWakeKind: "none",
      mailboxWakeExpected: false,
      decisionWakeExpected: false,
      mailStatus: "processed",
      blockedReason: null,
      stagePlayMailDeliveryStatus: "deduped_existing",
      previousStagePlayMailId: "stage-play-mail-translation",
      selectedBackendProvider: "live_translation.local_runtime",
      latestObservedAtMs: 300,
      observationRef: "obs:lane-mail-loop-docs:processed",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(lateSnapshot)).toMatchObject({
      mailLoopCount: 1,
      pendingMailLoopCount: 0,
      blockedMailLoopCount: 0,
      latestMailLoopStatus: "processed",
      latestMailLoopId: "stage-play-mail-translation",
      latestMailLoopDeliveryStatus: "deduped_existing",
      latestPreviousStagePlayMailId: "stage-play-mail-translation",
      latestMailLoopWakeKind: "none",
      latestMailLoopObservationLaneSessionId: "lane-session-docs-observation",
      latestMailLoopTerminalAuthorityStatus: "not_terminal_authority",
      latestSelectedBackendProvider: "live_translation.local_runtime",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("ignores Ask live-event lane mail-loop rows for a different target language than the active locale", () => {
    const snapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      eventPayload: laneMailLoopLiveEvent({
        targetLanguage: "fr",
        latestDedupeKey: "document_markdown:docs/research/nhm2.md:u0001:fr",
      }),
    });

    expect(snapshot).toEqual({
      version: 0,
      translations: {},
      laneSessions: {},
      mailLoops: {},
      goalBindings: {},
    });
  });

  it("ingests matching Ask live-event goal binding state without projecting text", () => {
    const snapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:goal",
      units: [unit("u0001")],
      eventPayload: laneGoalBindingLiveEvent({
        sourceHash: "fnv1a32:goal",
        terminalAuthorityStatus: "pending_helix_terminal_authority",
        sourceIdentityKey: undefined,
        goalBindingSourceIdentityKey: "docs:nhm2::fnv1a32:goal::docs::docs_chunk::es-US::es",
        latestReceiptRef: "receipt:goal-binding-docs:latest",
      }),
    });

    expect(snapshot.translations).toEqual({});
    expect(snapshot.laneSessions).toEqual({});
    expect(snapshot.mailLoops).toEqual({});
    expect(snapshot.goalBindings["goal-binding-translate-docs"]).toEqual({
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
      reportReason: "goal_lane_evidence_recorded_for_debug_only",
      quietBehaviorApplied: true,
      wakeExpected: false,
      mailboxWakeExpected: false,
      decisionWakeExpected: false,
      surfaceBadgeExpected: false,
      terminalReportRequested: false,
      terminalReportAuthorized: false,
      selectedBackendProvider: "live_translation.local_runtime",
      sourceId: "document_markdown:docs/research/nhm2.md",
      sourceHash: "fnv1a32:goal",
      sourceKind: "docs",
      sourceTextHash: "source-text-hash-goal",
      sourceTextCharCount: 2048,
      projectionTarget: "docs_chunk",
      accountLocale: "es-US",
      targetLanguage: "es",
      latestChunkId: "u0001",
      latestChunkIndex: 0,
      latestDedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
      latestSourceEventId: "docs:event:1",
      latestSourceEventMs: 250,
      latestObservedAtMs: 300,
      latestFreshnessStatus: "fresh",
      latestEventId: "goal-binding-translate-docs:observation_recorded:300",
      sessionControlKey: "lane-session-docs::fnv1a32:goal::docs_chunk::es-US::es",
      goalBindingKey: "goal:account-language::goal-binding-translate-docs::lane-session-docs::live_translation",
      sourceBindingKey: "docs:nhm2::fnv1a32:goal::docs_chunk::es-US::es",
      latestSourceBindingKey: "docs:nhm2::fnv1a32:goal-latest::docs_chunk::es-US::es",
      sourceIdentityKey: "docs:nhm2::fnv1a32:goal::docs::docs_chunk::es-US::es",
      laneSessionSourceBindingKey: "docs:nhm2::fnv1a32:goal-session::docs_chunk::es-US::es",
      laneSessionSourceIdentityKey: "docs:nhm2::fnv1a32:goal-session::docs::docs_chunk::es-US::es",
      latestObservationKey: "docs:nhm2::fnv1a32:goal::docs_chunk::es::u0001::obs:goal-binding-docs",
      latestMailLoopObservationKey: "docs:nhm2::fnv1a32:goal::docs_chunk::es::u0001::receipt:goal-binding-docs",
      hasObservation: true,
      terminalAuthorityStatus: "pending_helix_terminal_authority",
      observationRef: "obs:goal-binding-docs",
      receiptRef: "receipt:goal-binding-docs:latest",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(snapshot)).toMatchObject({
      totalCount: 0,
      readyCount: 0,
      laneSessionCount: 0,
      mailLoopCount: 0,
      goalBindingCount: 1,
      activeGoalBindingCount: 1,
      observedGoalBindingCount: 1,
      blockedGoalBindingCount: 0,
      latestGoalBindingId: "goal-binding-translate-docs",
      latestGoalId: "goal-account-language",
      latestGoalBindingLaneSessionId: "lane-session-docs",
      latestGoalBindingStatus: "active",
      latestGoalBindingSessionStatus: "running",
      latestGoalBindingSessionHealth: "healthy",
      latestGoalBindingActivationPolicy: "while_goal_active",
      latestGoalBindingAttentionPolicy: "quiet_until_salient",
      latestGoalBindingStopCondition: "goal_complete",
      latestGoalBindingReportPolicy: "debug_only",
      latestGoalBindingQuietBehavior: "record_only",
      latestGoalBindingReportAction: "record_only",
      latestGoalBindingReportReason: "goal_lane_evidence_recorded_for_debug_only",
      latestGoalBindingQuietBehaviorApplied: true,
      latestGoalBindingWakeExpected: false,
      latestGoalBindingMailboxWakeExpected: false,
      latestGoalBindingDecisionWakeExpected: false,
      latestGoalBindingSurfaceBadgeExpected: false,
      latestGoalBindingTerminalReportRequested: false,
      latestGoalBindingTerminalReportAuthorized: false,
      latestGoalBindingSelectedBackendProvider: "live_translation.local_runtime",
      latestGoalBindingObservationRef: "obs:goal-binding-docs",
      latestGoalBindingReceiptRef: "receipt:goal-binding-docs:latest",
      latestGoalBindingEventId: "goal-binding-translate-docs:observation_recorded:300",
      latestGoalBindingSessionControlKey: "lane-session-docs::fnv1a32:goal::docs_chunk::es-US::es",
      latestGoalBindingSourceBindingKeyFromEvent: "docs:nhm2::fnv1a32:goal-latest::docs_chunk::es-US::es",
      latestGoalBindingSourceIdentityKey: "docs:nhm2::fnv1a32:goal::docs::docs_chunk::es-US::es",
      latestGoalBindingLaneSessionSourceBindingKey: "docs:nhm2::fnv1a32:goal-session::docs_chunk::es-US::es",
      latestGoalBindingLaneSessionSourceIdentityKey: "docs:nhm2::fnv1a32:goal-session::docs::docs_chunk::es-US::es",
      latestGoalBindingHasObservation: true,
      latestEventId: "goal-binding-translate-docs:observation_recorded:300",
      latestHasObservation: true,
      latestSessionControlKey: "lane-session-docs::fnv1a32:goal::docs_chunk::es-US::es",
      latestGoalBindingTerminalAuthorityStatus: "pending_helix_terminal_authority",
      latestGoalBindingSourceId: "document_markdown:docs/research/nhm2.md",
      latestGoalBindingSourceHash: "fnv1a32:goal",
      latestGoalBindingSourceKind: "docs",
      latestGoalBindingSourceTextHash: "source-text-hash-goal",
      latestGoalBindingSourceTextCharCount: 2048,
      latestGoalBindingProjectionTarget: "docs_chunk",
      latestGoalBindingAccountLocale: "es-US",
      latestGoalBindingTargetLanguage: "es",
      latestGoalBindingChunkId: "u0001",
      latestGoalBindingChunkIndex: 0,
      latestGoalBindingDedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
      latestGoalBindingSourceBindingKey: "docs:nhm2::fnv1a32:goal-latest::docs_chunk::es-US::es",
      latestGoalBindingSourceIdentityKeyFromBinding: "docs:nhm2::fnv1a32:goal::docs::docs_chunk::es-US::es",
      latestGoalBindingObservationKey: "docs:nhm2::fnv1a32:goal::docs_chunk::es::u0001::obs:goal-binding-docs",
      latestGoalBindingMailLoopObservationKey: "docs:nhm2::fnv1a32:goal::docs_chunk::es::u0001::receipt:goal-binding-docs",
      latestGoalBindingKeyFromBinding:
        "goal:account-language::goal-binding-translate-docs::lane-session-docs::live_translation",
      latestSelectedBackendProvider: "live_translation.local_runtime",
      latestSourceHash: "fnv1a32:goal",
      latestSourceKind: "docs",
      latestSourceTextHash: "source-text-hash-goal",
      latestSourceTextCharCount: 2048,
      latestProjectionTarget: "docs_chunk",
      latestAccountLocale: "es-US",
      latestTerminalAuthorityStatus: "pending_helix_terminal_authority",
      latestContextRole: "tool_evidence",
      latestSourceBindingKey: "docs:nhm2::fnv1a32:goal-latest::docs_chunk::es-US::es",
      latestSourceIdentityKey: "docs:nhm2::fnv1a32:goal::docs::docs_chunk::es-US::es",
      latestObservationKey: "docs:nhm2::fnv1a32:goal::docs_chunk::es::u0001::obs:goal-binding-docs",
      latestMailLoopObservationKey: "docs:nhm2::fnv1a32:goal::docs_chunk::es::u0001::receipt:goal-binding-docs",
      latestGoalBindingKey:
        "goal:account-language::goal-binding-translate-docs::lane-session-docs::live_translation",
      observedLaneActivityCount: 1,
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("treats receipt-only goal-binding live events as observed non-answer lane activity", () => {
    const snapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:goal",
      units: [unit("u0001")],
      eventPayload: laneGoalBindingLiveEvent({
        sourceHash: "fnv1a32:goal",
        terminalAuthorityStatus: "pending_helix_terminal_authority",
        sourceIdentityKey: undefined,
        goalBindingSourceIdentityKey: "docs:nhm2::fnv1a32:goal::docs::docs_chunk::es-US::es",
        observationRef: undefined,
        observation_ref: undefined,
        hasObservation: false,
        has_observation: false,
        receiptRef: "receipt:goal-binding-docs-only",
        latestObservationKey: undefined,
        latest_observation_key: undefined,
        latestMailLoopObservationKey:
          "docs:nhm2::fnv1a32:goal::docs_chunk::es::u0001::receipt:goal-binding-docs-only",
      }),
    });

    expect(snapshot.goalBindings["goal-binding-translate-docs"]).toMatchObject({
      observationRef: null,
      receiptRef: "receipt:goal-binding-docs-only",
      latestObservationKey: null,
      latestMailLoopObservationKey:
        "docs:nhm2::fnv1a32:goal::docs_chunk::es::u0001::receipt:goal-binding-docs-only",
      hasObservation: true,
      terminalAuthorityStatus: "pending_helix_terminal_authority",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(snapshot)).toMatchObject({
      goalBindingCount: 1,
      activeGoalBindingCount: 1,
      observedGoalBindingCount: 1,
      latestGoalBindingObservationRef: null,
      latestGoalBindingReceiptRef: "receipt:goal-binding-docs-only",
      latestGoalBindingHasObservation: true,
      latestGoalBindingMailLoopObservationKey:
        "docs:nhm2::fnv1a32:goal::docs_chunk::es::u0001::receipt:goal-binding-docs-only",
      observedLaneActivityCount: 1,
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("ignores Ask live-event goal binding rows for a different target language than the active locale", () => {
    const snapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      eventPayload: laneGoalBindingLiveEvent({
        targetLanguage: "fr",
        latestDedupeKey: "document_markdown:docs/research/nhm2.md:u0001:fr",
      }),
    });

    expect(snapshot).toEqual({
      version: 0,
      translations: {},
      laneSessions: {},
      mailLoops: {},
      goalBindings: {},
    });
  });

  it("keeps newer lane session lifecycle state when a late older event arrives", () => {
    ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      eventPayload: laneSessionLiveEvent({
        sessionStatus: "running",
        sessionHealth: "healthy",
        updatedAtMs: 100,
        latestObservedAtMs: 100,
        observationRef: "obs:lane-session-docs:running",
      }),
    });
    const blockedSnapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      eventPayload: laneSessionLiveEvent({
        sessionStatus: "blocked",
        sessionHealth: "blocked",
        updatedAtMs: 300,
        latestObservedAtMs: 300,
        observationRef: "obs:lane-session-docs:blocked",
      }),
    });
    const lateSnapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      eventPayload: laneSessionLiveEvent({
        sessionStatus: "running",
        sessionHealth: "healthy",
        updatedAtMs: 200,
        latestObservedAtMs: 200,
        observationRef: "obs:lane-session-docs:late-running",
      }),
    });

    expect(lateSnapshot).toBe(blockedSnapshot);
    expect(lateSnapshot.laneSessions["lane-session-docs"]).toMatchObject({
      sessionStatus: "blocked",
      sessionHealth: "blocked",
      lastObservationRef: "obs:lane-session-docs:blocked",
      updatedAtMs: 300,
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(summarizeDocumentLiveTranslationProjectionSnapshot(lateSnapshot)).toMatchObject({
      laneSessionCount: 1,
      activeLaneSessionCount: 0,
      pausedLaneSessionCount: 0,
      stoppedLaneSessionCount: 0,
      blockedLaneSessionCount: 1,
      latestLaneSessionStatus: "blocked",
      latestLaneSessionHealth: "blocked",
      latestLaneSessionLifecycleAction: "start",
      latestLaneSessionReason: "lane_session_observation_recorded",
      latestLaneSessionDebugPhase: "running:record_observation:observation_recorded",
      latestLaneSessionObservationStatus: "observation_recorded",
      latestLaneSessionPermissionProfile: "permissions non-mutating",
      latestLaneSessionUpdatedAtMs: 300,
      latestLaneSessionTerminalAuthorityStatus: "not_terminal_authority",
      mailLoopCount: 0,
      goalBindingCount: 0,
    });
  });

  it("keeps live-event projections separated by projection target", () => {
    ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      projectionTarget: "docs_chunk",
      units: [unit("u0001")],
      eventPayload: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "receipt:hover",
          text: "UI translation projection.",
          meta: {
            source_event_type: "ui_translation_projection",
            lane: "live_translation",
            sourceId: "document_markdown:docs/research/nhm2.md",
            latestProjectionTarget: "docs_hover",
            latestChunkId: "u0001",
            latestDedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es:hover",
            latestObservedAtMs: 400,
            latestFreshnessStatus: "fresh",
            targetLanguage: "es",
            translatedText: "Texto hover.",
            projectionStatus: "projected",
            receiptRef: "receipt:hover",
            observationRef: "obs:hover",
          },
        },
      },
    });

    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      projectionTarget: "docs_chunk",
    })).toEqual({
      version: 0,
      translations: {},
      laneSessions: {},
      mailLoops: {},
      goalBindings: {},
    });
    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      projectionTarget: "docs_hover",
    }).translations.u0001).toMatchObject({
      status: "ready",
      text: "Texto hover.",
      observationRef: "obs:hover",
      receiptRef: "receipt:hover",
      projectionStatus: "projected",
      projectionTarget: "docs_hover",
      targetLanguage: "es",
      source: "capability_lane",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });

    ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      projectionTarget: "docs_chunk",
      units: [unit("u0002")],
      eventPayload: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "receipt:selection",
          text: "UI translation projection.",
          meta: {
            source_event_type: "ui_translation_projection",
            lane: "live_translation",
            sourceId: "document_markdown:docs/research/nhm2.md",
            latestProjectionTarget: "docs_selection",
            latestChunkId: "u0002",
            latestDedupeKey: "document_markdown:docs/research/nhm2.md:u0002:es:selection",
            latestObservedAtMs: 450,
            latestFreshnessStatus: "fresh",
            targetLanguage: "es",
            translatedText: "Texto seleccionado.",
            projectionStatus: "projected",
            receiptRef: "receipt:selection",
            observationRef: "obs:selection",
          },
        },
      },
    });

    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      projectionTarget: "docs_chunk",
    }).translations.u0002).toBeUndefined();
    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      projectionTarget: "docs_hover",
    }).translations.u0002).toBeUndefined();
    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      projectionTarget: "docs_selection",
    }).translations.u0002).toMatchObject({
      status: "ready",
      text: "Texto seleccionado.",
      observationRef: "obs:selection",
      receiptRef: "receipt:selection",
      projectionStatus: "projected",
      projectionTarget: "docs_selection",
      targetLanguage: "es",
      source: "capability_lane",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("keeps live-event projections separated by document source hash when provided", () => {
    const oldSnapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:old",
      projectionTarget: "docs_chunk",
      units: [unit("u0001")],
      eventPayload: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "receipt:old-source",
          text: "UI translation projection.",
          meta: {
            source_event_type: "ui_translation_projection",
            lane: "live_translation",
            sourceId: "document_markdown:docs/research/nhm2.md",
            sourceHash: "fnv1a32:old",
            latestProjectionTarget: "docs_chunk",
            latestChunkId: "u0001",
            latestObservedAtMs: 300,
            targetLanguage: "es",
            translatedText: "Texto viejo.",
            projectionStatus: "projected",
            receiptRef: "receipt:old-source",
            observationRef: "obs:old-source",
          },
        },
      },
    });
    const mismatchedSnapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:new",
      projectionTarget: "docs_chunk",
      units: [unit("u0001")],
      eventPayload: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "receipt:old-source",
          text: "UI translation projection.",
          meta: {
            source_event_type: "ui_translation_projection",
            lane: "live_translation",
            sourceId: "document_markdown:docs/research/nhm2.md",
            sourceHash: "fnv1a32:old",
            latestProjectionTarget: "docs_chunk",
            latestChunkId: "u0001",
            latestObservedAtMs: 300,
            targetLanguage: "es",
            translatedText: "Texto viejo.",
            projectionStatus: "projected",
            receiptRef: "receipt:old-source",
            observationRef: "obs:old-source",
          },
        },
      },
    });

    expect(oldSnapshot.translations.u0001).toMatchObject({
      status: "ready",
      text: "Texto viejo.",
      observationRef: "obs:old-source",
      receiptRef: "receipt:old-source",
    });
    expect(mismatchedSnapshot).toEqual({
      version: 0,
      translations: {},
      laneSessions: {},
      mailLoops: {},
      goalBindings: {},
    });
    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:new",
      projectionTarget: "docs_chunk",
    })).toEqual({
      version: 0,
      translations: {},
      laneSessions: {},
      mailLoops: {},
      goalBindings: {},
    });
  });

  it("ignores un-hashed live-event projections for a hash-scoped active document", () => {
    const snapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:current",
      projectionTarget: "docs_chunk",
      units: [unit("u0001")],
      eventPayload: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "receipt:unhashed",
          text: "UI translation projection.",
          meta: {
            source_event_type: "ui_translation_projection",
            lane: "live_translation",
            sourceId: "document_markdown:docs/research/nhm2.md",
            latestProjectionTarget: "docs_chunk",
            latestChunkId: "u0001",
            latestObservedAtMs: 320,
            targetLanguage: "es",
            translatedText: "Texto sin hash.",
            projectionStatus: "projected",
            receiptRef: "receipt:unhashed",
            observationRef: "obs:unhashed",
          },
        },
      },
    });

    expect(snapshot).toEqual({
      version: 0,
      translations: {},
      laneSessions: {},
      mailLoops: {},
      goalBindings: {},
    });
    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:current",
      projectionTarget: "docs_chunk",
    })).toEqual({
      version: 0,
      translations: {},
      laneSessions: {},
      mailLoops: {},
      goalBindings: {},
    });
  });

  it("ignores hashed live-event projections for an unscoped active document bucket", () => {
    const snapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      projectionTarget: "docs_chunk",
      units: [unit("u0001")],
      eventPayload: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "receipt:hashed-unscoped",
          text: "UI translation projection.",
          meta: {
            source_event_type: "ui_translation_projection",
            lane: "live_translation",
            sourceId: "document_markdown:docs/research/nhm2.md",
            sourceHash: "fnv1a32:other",
            latestProjectionTarget: "docs_chunk",
            latestChunkId: "u0001",
            latestObservedAtMs: 330,
            targetLanguage: "es",
            translatedText: "Texto de otro hash.",
            projectionStatus: "projected",
            receiptRef: "receipt:hashed-unscoped",
            observationRef: "obs:hashed-unscoped",
          },
        },
      },
    });

    expect(snapshot).toEqual({
      version: 0,
      translations: {},
      laneSessions: {},
      mailLoops: {},
      goalBindings: {},
    });
    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      projectionTarget: "docs_chunk",
    })).toEqual({
      version: 0,
      translations: {},
      laneSessions: {},
      mailLoops: {},
      goalBindings: {},
    });
  });

  it("ignores stale source-hash live-event session, mail-loop, and goal-binding rows", () => {
    const activeInput = {
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:current",
      projectionTarget: "docs_chunk",
      units: [unit("u0001")],
    };

    const laneSessionSnapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      ...activeInput,
      eventPayload: laneSessionLiveEvent({
        sourceHash: "fnv1a32:previous",
        observationRef: "obs:lane-session-previous-source",
      }),
    });
    const mailLoopSnapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      ...activeInput,
      eventPayload: laneMailLoopLiveEvent({
        sourceHash: "fnv1a32:previous",
        observationRef: "obs:lane-mail-previous-source",
      }),
    });
    const goalBindingSnapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      ...activeInput,
      eventPayload: laneGoalBindingLiveEvent({
        sourceHash: "fnv1a32:previous",
        observationRef: "obs:goal-binding-previous-source",
      }),
    });

    expect(laneSessionSnapshot).toEqual({
      version: 0,
      translations: {},
      laneSessions: {},
      mailLoops: {},
      goalBindings: {},
    });
    expect(mailLoopSnapshot).toEqual(laneSessionSnapshot);
    expect(goalBindingSnapshot).toEqual(laneSessionSnapshot);
    expect(readDocumentLiveTranslationProjectionSnapshot(activeInput)).toEqual(laneSessionSnapshot);
  });

  it("ignores stale source-identity lifecycle rows but keeps projection receipt mismatch inspectable", () => {
    const activeInput = {
      docPath: "docs/research/nhm2.md",
      locale: "es",
      sourceHash: "fnv1a32:current",
      sourceIdentityKey: "docs:nhm2::current::docs::docs_chunk::es-US::es",
      projectionTarget: "docs_chunk",
      units: [unit("u0001")],
    };

    const laneSessionSnapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      ...activeInput,
      eventPayload: laneSessionLiveEvent({
        sourceHash: "fnv1a32:current",
        sourceIdentityKey: "docs:nhm2::previous::docs::docs_chunk::es-US::es",
        observationRef: "obs:lane-session-previous-identity",
      }),
    });
    const mailLoopSnapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      ...activeInput,
      eventPayload: laneMailLoopLiveEvent({
        sourceHash: "fnv1a32:current",
        sourceIdentityKey: "docs:nhm2::previous-mail::docs::docs_chunk::es-US::es",
        laneSessionSourceIdentityKey: "docs:nhm2::previous::docs::docs_chunk::es-US::es",
        observationRef: "obs:lane-mail-previous-identity",
      }),
    });
    const goalBindingSnapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      ...activeInput,
      eventPayload: laneGoalBindingLiveEvent({
        sourceHash: "fnv1a32:current",
        sourceIdentityKey: "docs:nhm2::previous::docs::docs_chunk::es-US::es",
        observationRef: "obs:goal-binding-previous-identity",
      }),
    });
    const projectionSnapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      ...activeInput,
      eventPayload: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "receipt:previous-identity",
          text: "UI translation projection.",
          meta: {
            source_event_type: "ui_translation_projection",
            lane: "live_translation",
            sourceId: "document_markdown:docs/research/nhm2.md",
            sourceHash: "fnv1a32:current",
            sourceIdentityKey: "docs:nhm2::previous::docs::docs_chunk::es-US::es",
            latestProjectionTarget: "docs_chunk",
            latestChunkId: "u0001",
            latestObservedAtMs: 300,
            targetLanguage: "es",
            translatedText: "Texto viejo.",
            projectionStatus: "projected",
            receiptRef: "receipt:previous-identity",
            observationRef: "obs:previous-identity",
          },
        },
      },
    });

    expect(laneSessionSnapshot).toEqual({
      version: 0,
      translations: {},
      laneSessions: {},
      mailLoops: {},
      goalBindings: {},
    });
    expect(mailLoopSnapshot).toEqual(laneSessionSnapshot);
    expect(goalBindingSnapshot).toEqual(laneSessionSnapshot);
    expect(projectionSnapshot.translations.u0001).toMatchObject({
      status: "error",
      error: "translation_projection_source_identity_mismatch",
      projectionStatus: "missing",
      sourceHash: "fnv1a32:current",
      sourceIdentityKey: "docs:nhm2::current::docs::docs_chunk::es-US::es",
      observationRef: "obs:previous-identity",
      receiptRef: "receipt:previous-identity",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(projectionSnapshot.laneSessions).toEqual({});
    expect(projectionSnapshot.mailLoops).toEqual({});
    expect(projectionSnapshot.goalBindings).toEqual({});
    expect(readDocumentLiveTranslationProjectionSnapshot(activeInput)).toEqual(projectionSnapshot);
  });

  it("ignores live-event projections for a different target language than the active locale", () => {
    const snapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      eventPayload: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "receipt:fr",
          text: "UI translation projection.",
          meta: {
            source_event_type: "ui_translation_projection",
            lane: "live_translation",
            sourceId: "document_markdown:docs/research/nhm2.md",
            latestProjectionTarget: "docs_chunk",
            latestChunkId: "u0001",
            latestDedupeKey: "document_markdown:docs/research/nhm2.md:u0001:fr",
            latestObservedAtMs: 500,
            latestFreshnessStatus: "fresh",
            targetLanguage: "fr",
            translatedText: "Texte francais.",
            projectionStatus: "projected",
            receiptRef: "receipt:fr",
            observationRef: "obs:fr",
          },
        },
      },
    });

    expect(snapshot).toEqual({
      version: 0,
      translations: {},
      laneSessions: {},
      mailLoops: {},
      goalBindings: {},
    });
    expect(readDocumentLiveTranslationProjectionSnapshot({
      docPath: "docs/research/nhm2.md",
      locale: "fr",
      projectionTarget: "docs_chunk",
    })).toEqual({
      version: 0,
      translations: {},
      laneSessions: {},
      mailLoops: {},
      goalBindings: {},
    });
  });

  it("ignores Ask live events that do not target the active document source", () => {
    const snapshot = ingestDocumentLiveTranslationProjectionFromAskLiveEvent({
      docPath: "docs/research/nhm2.md",
      locale: "es",
      units: [unit("u0001")],
      eventPayload: {
        contextId: "helix-ask:desktop",
        entry: {
          id: "receipt:other-doc",
          text: "UI translation projection.",
          meta: {
            source_event_type: "ui_translation_projection",
            lane: "live_translation",
            sourceId: "document_markdown:docs/other.md",
            latestProjectionTarget: "docs_chunk",
            latestChunkId: "u0001",
            targetLanguage: "es",
            translatedText: "Texto ajeno.",
            projectionStatus: "projected",
          },
        },
      },
    });

    expect(snapshot).toEqual({
      version: 0,
      translations: {},
      laneSessions: {},
      mailLoops: {},
      goalBindings: {},
    });
  });
});
