import { describe, expect, it } from "vitest";
import type { DocumentTranslationUnit } from "@shared/document-translation";
import { renderDocumentMarkdownWithInlineTranslations } from "@/lib/docs/liveTranslationInlineRenderer";

const unit = (unitId: string, sourceMarkdown: string, translatable = true): DocumentTranslationUnit => ({
  unit_id: unitId,
  kind: "paragraph",
  source_markdown: sourceMarkdown,
  translatable,
  protected_spans: [],
});

describe("document live translation inline renderer", () => {
  it("marks missing governed inline projections as empty without adding visible translation text", () => {
    const rendered = renderDocumentMarkdownWithInlineTranslations({
      units: [unit("u0001", "Original source paragraph.")],
      translations: {},
      loadingText: "Translating...",
      errorText: (reason) => `Could not translate: ${reason}`,
      fallbackErrorText: "translation failed",
    });

    expect(rendered).toContain("Original source paragraph.");
    expect(rendered).toContain('data-doc-translation-anchor="u0001"');
    expect(rendered).toContain('data-doc-translation-role="governed-inline-projection-anchor"');
    expect(rendered).toContain('data-doc-translation-answer-authority="false"');
    expect(rendered).toContain('data-doc-translation-governed-projection="true"');
    expect(rendered).toContain('data-doc-translation-authority-policy="projection_only_not_answer_authority"');
    expect(rendered).toContain('data-doc-translation-terminal-authority-owner="helix"');
    expect(rendered).toContain('data-doc-translation-display-status="empty"');
    expect(rendered).toContain('data-doc-translation-display-status-reason="no_projection_activity"');
    expect(rendered).toContain('data-doc-translation-render-status="empty"');
    expect(rendered).toContain('data-doc-translation-projection-status="missing"');
    expect(rendered).toContain('data-doc-translation-reentry-required="true"');
    expect(rendered).toContain('data-doc-translation-terminal-eligible="false"');
    expect(rendered).toContain('data-doc-translation-assistant-answer="false"');
    expect(rendered).toContain('data-doc-translation-raw-content-included="false"');
    expect(rendered).not.toContain("Translating...");
    expect(rendered).not.toContain("Could not translate");
    expect(rendered).not.toContain("doc-generated-translation");
  });

  it("keeps markdown block boundaries around inline translation anchors", () => {
    const rendered = renderDocumentMarkdownWithInlineTranslations({
      units: [
        unit("u0001", "First source paragraph."),
        unit("u0002", "## Source subtitle"),
      ],
      translations: {},
      loadingText: "Translating...",
      errorText: (reason) => `Could not translate: ${reason}`,
      fallbackErrorText: "translation failed",
    });

    expect(rendered).toContain("First source paragraph.\n\n<div");
    expect(rendered).toContain('</div>\n\n## Source subtitle');
  });

  it("renders governed translation projection separately from source text with non-authority metadata", () => {
    const rendered = renderDocumentMarkdownWithInlineTranslations({
      units: [
        unit("u0001", "Original source paragraph."),
        unit("u0002", "Protected source paragraph.", false),
      ],
      translations: {
        u0001: {
          status: "ready",
          text: "### Parrafo traducido\n- linea dos",
          observationRef: "obs:docs:u1",
          receiptRef: "receipt:docs:u1",
          serverProjectionKey: "server-projection-key-current",
          observationLaneSessionId: "lane-session-observation-u1",
          goalBindingId: "goal-binding-translate-docs",
          sessionDebugPhase: "running:record_observation:observation_recorded",
          sessionObservationStatus: "observation_recorded",
          latestEventId: "lane-session-docs:observation_recorded:300",
          hasObservation: true,
          selectedRuntimeAgentProvider: "codex",
          selectedBackendProvider: "live_translation.local_runtime",
          projectionStatus: "projected",
          chunkId: "u0001",
          chunkIndex: 0,
          dedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
          sourceEventId: "source-event:docs:u0001",
          sourceEventMs: 240,
          observedAtMs: 300,
          freshnessStatus: "fresh",
          terminalAuthorityStatus: "not_terminal_authority",
          sourceId: "document_markdown:docs/research/nhm2.md",
          bbox: { x: 16, y: 24, width: 320, height: 48, source: "visible-doc-title" },
          sourceIdentityKey: "document_markdown:docs/research/nhm2.md::source-hash-current",
          laneSessionSourceBindingKey: "docs:nhm2::source-hash-current::docs_chunk::es-US::es",
          laneSessionSourceIdentityKey:
            "docs:nhm2::source-hash-current::source-text-hash-current::27::document_markdown::docs_chunk::es-US::es",
          sourceHash: "source-hash-current",
          sourceKind: "document_markdown",
          sourceTextHash: "source-text-hash-current",
          sourceTextCharCount: 27,
          accountLocale: "es-US",
          projectionTarget: "docs_chunk",
          targetLanguage: "es",
          source: "capability_lane",
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
      },
      loadingText: "Translating...",
      errorText: (reason) => `Could not translate: ${reason}`,
      fallbackErrorText: "translation failed",
    });

    expect(rendered).toContain("Original source paragraph.");
    expect(rendered).toContain("Protected source paragraph.");
    expect(rendered).toContain('data-doc-translation-anchor="u0001"');
    expect(rendered).toContain('data-doc-translation-role="governed-inline-projection-anchor"');
    expect(rendered).toContain('data-doc-translation-answer-authority="false"');
    expect(rendered).toContain('data-doc-translation-display-status="ready"');
    expect(rendered).toContain('data-doc-translation-display-status-reason="ready_projection_available"');
    expect(rendered).toContain('data-doc-translation-render-status="ready"');
    expect(rendered).toContain('data-doc-translation-observation-ref="obs:docs:u1"');
    expect(rendered).toContain('data-doc-translation-receipt-ref="receipt:docs:u1"');
    expect(rendered).toContain('data-doc-translation-server-projection-key="server-projection-key-current"');
    expect(rendered).toContain('class="doc-generated-translation');
    expect(rendered).toContain("border-emerald-400/70 text-emerald-300");
    expect(rendered).toContain('data-doc-translation-line="u0001"');
    expect(rendered).toContain('data-doc-translation-role="governed-inline-projection"');
    expect(rendered).toContain('data-doc-translation-answer-authority="false"');
    expect(rendered).toContain('data-doc-translation-answer-authority="false" data-doc-translation-source=');
    expect(rendered).toContain('data-doc-translation-target-language="es"');
    expect(rendered).toContain('lang="es" dir="auto"');
    expect(rendered).toContain('data-doc-translation-governed-projection="true"');
    expect(rendered).toContain('data-doc-translation-authority-policy="projection_only_not_answer_authority"');
    expect(rendered).toContain('data-doc-translation-terminal-authority-owner="helix"');
    expect(rendered).toContain('data-doc-translation-render-status="ready"');
    expect(rendered).toContain('data-doc-translation-display-status="ready"');
    expect(rendered).toContain('data-doc-translation-observation-ref="obs:docs:u1"');
    expect(rendered).toContain('data-doc-translation-receipt-ref="receipt:docs:u1"');
    expect(rendered).toContain('data-doc-translation-observation-lane-session-id="lane-session-observation-u1"');
    expect(rendered).toContain('data-doc-translation-selected-runtime-agent-provider="codex"');
    expect(rendered).toContain('data-doc-translation-goal-binding-id="goal-binding-translate-docs"');
    expect(rendered).toContain(
      'data-doc-translation-session-debug-phase="running:record_observation:observation_recorded"',
    );
    expect(rendered).toContain('data-doc-translation-session-observation-status="observation_recorded"');
    expect(rendered).toContain('data-doc-translation-latest-event-id="lane-session-docs:observation_recorded:300"');
    expect(rendered).toContain('data-doc-translation-has-observation="true"');
    expect(rendered).toContain('data-doc-translation-terminal-authority-status="not_terminal_authority"');
    expect(rendered).toContain('data-doc-translation-terminal-eligible="false"');
    expect(rendered).toContain('data-doc-translation-assistant-answer="false"');
    expect(rendered).toContain('data-doc-translation-raw-content-included="false"');
    expect(rendered).toContain(
      'data-doc-translation-bbox="{&quot;x&quot;:16,&quot;y&quot;:24,&quot;width&quot;:320,&quot;height&quot;:48,&quot;source&quot;:&quot;visible-doc-title&quot;}"',
    );
    expect(rendered).toContain('data-doc-translation-chunk-id="u0001"');
    expect(rendered).toContain('data-doc-translation-chunk-index="0"');
    expect(rendered).toContain(
      'data-doc-translation-dedupe-key="document_markdown:docs/research/nhm2.md:u0001:es"',
    );
    expect(rendered).toContain('data-doc-translation-source-event-id="source-event:docs:u0001"');
    expect(rendered).toContain('data-doc-translation-source-event-ms="240"');
    expect(rendered).toContain('data-doc-translation-observed-at-ms="300"');
    expect(rendered).toContain('data-doc-translation-freshness-status="fresh"');
    expect(rendered).toContain('data-doc-translation-source-kind="docs"');
    expect(rendered).toContain(
      'data-doc-translation-source-identity-key="document_markdown:docs/research/nhm2.md::source-hash-current"',
    );
    expect(rendered).toContain(
      'data-doc-translation-lane-session-source-binding-key="docs:nhm2::source-hash-current::docs_chunk::es-US::es"',
    );
    expect(rendered).toContain(
      'data-doc-translation-lane-session-source-identity-key="docs:nhm2::source-hash-current::source-text-hash-current::27::docs::docs_chunk::es-US::es"',
    );
    expect(rendered).toContain('data-doc-translation-source-hash="source-hash-current"');
    expect(rendered).toContain([
      'data-doc-translation-projection-key="document_markdown:docs/research/nhm2.md',
      'source-hash-current',
      'u0001',
      'receipt:docs:u1"',
    ].join("::"));
    expect(rendered).toContain('data-doc-translation-source-text-hash="source-text-hash-current"');
    expect(rendered).toContain('data-doc-translation-source-text-char-count="27"');
    expect(rendered).toContain("Parrafo traducido<br />linea dos");
  });

  it("keeps inline projection keys distinct when source text hash changes", () => {
    const rendered = renderDocumentMarkdownWithInlineTranslations({
      units: [
        unit("u0001", "Original source paragraph."),
        unit("u0002", "Original source paragraph."),
      ],
      translations: {
        u0001: {
          status: "ready",
          text: "Texto anterior",
          observationRef: "obs:docs:u1",
          receiptRef: "receipt:docs:shared",
          projectionStatus: "projected",
          freshnessStatus: "fresh",
          terminalAuthorityStatus: "not_terminal_authority",
          sourceId: "document_markdown:docs/research/nhm2.md",
          sourceHash: "source-hash-current",
          sourceTextHash: "source-text-hash-old",
          projectionTarget: "docs_chunk",
          targetLanguage: "es",
          chunkId: "u0001",
          source: "capability_lane",
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
        u0002: {
          status: "ready",
          text: "Texto nuevo",
          observationRef: "obs:docs:u2",
          receiptRef: "receipt:docs:shared",
          projectionStatus: "projected",
          freshnessStatus: "fresh",
          terminalAuthorityStatus: "not_terminal_authority",
          sourceId: "document_markdown:docs/research/nhm2.md",
          sourceHash: "source-hash-current",
          sourceTextHash: "source-text-hash-new",
          projectionTarget: "docs_chunk",
          targetLanguage: "es",
          chunkId: "u0001",
          source: "capability_lane",
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
      },
      loadingText: "Translating...",
      errorText: (reason) => `Could not translate: ${reason}`,
      fallbackErrorText: "translation failed",
    });

    expect(rendered).toContain([
      'data-doc-translation-projection-key="document_markdown:docs/research/nhm2.md',
      'source-hash-current',
      'source-text-hash-old',
      'docs_chunk',
      'es',
      'u0001',
      'receipt:docs:shared"',
    ].join("::"));
    expect(rendered).toContain([
      'data-doc-translation-projection-key="document_markdown:docs/research/nhm2.md',
      'source-hash-current',
      'source-text-hash-new',
      'docs_chunk',
      'es',
      'u0001',
      'receipt:docs:shared"',
    ].join("::"));
  });

  it("keeps projection errors visible as receipts instead of translated answers", () => {
    const rendered = renderDocumentMarkdownWithInlineTranslations({
      units: [unit("u0001", "Original source paragraph.")],
      translations: {
        u0001: {
          status: "error",
          error: "translation_projection_stale",
          observationRef: "obs:docs:stale",
          receiptRef: "receipt:docs:stale",
          projectionStatus: "stale",
          freshnessStatus: "stale",
          terminalAuthorityStatus: "not_terminal_authority",
          source: "capability_lane",
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
      },
      loadingText: "Translating...",
      errorText: (reason) => `Could not translate: ${reason}`,
      fallbackErrorText: "translation failed",
    });

    expect(rendered).toContain("Original source paragraph.");
    expect(rendered).toContain('data-doc-translation-anchor="u0001"');
    expect(rendered).toContain('data-doc-translation-role="governed-inline-projection-anchor"');
    expect(rendered).toContain('data-doc-translation-answer-authority="false"');
    expect(rendered).toContain('data-doc-translation-display-status="stale"');
    expect(rendered).toContain('data-doc-translation-display-status-reason="stale_projection"');
    expect(rendered).toContain('data-doc-translation-render-status="error"');
    expect(rendered).toContain('data-doc-translation-observation-ref="obs:docs:stale"');
    expect(rendered).toContain("Could not translate: translation_projection_stale");
    expect(rendered).toContain("border-amber-400/70 text-amber-300");
    expect(rendered).toContain('data-doc-translation-role="governed-inline-projection"');
    expect(rendered).toContain('data-doc-translation-answer-authority="false"');
    expect(rendered).toContain('data-doc-translation-governed-projection="true"');
    expect(rendered).toContain('data-doc-translation-render-status="error"');
    expect(rendered).toContain('data-doc-translation-display-status="stale"');
    expect(rendered).toContain('data-doc-translation-projection-status="stale"');
    expect(rendered).toContain('data-doc-translation-observation-ref="obs:docs:stale"');
    expect(rendered).toContain('data-doc-translation-terminal-eligible="false"');
    expect(rendered).toContain('data-doc-translation-assistant-answer="false"');
  });

  it("renders source identity mismatches as blocked governed projection state", () => {
    const rendered = renderDocumentMarkdownWithInlineTranslations({
      units: [unit("u0001", "Original source paragraph.")],
      translations: {
        u0001: {
          status: "error",
          error: "translation_projection_source_text_mismatch",
          observationRef: "obs:docs:stale-source-text",
          receiptRef: "receipt:docs:stale-source-text",
          projectionStatus: "missing",
          freshnessStatus: "unknown",
          terminalAuthorityStatus: "not_terminal_authority",
          sourceId: "document_markdown:docs/research/nhm2.md",
          sourceIdentityKey: "document_markdown:docs/research/nhm2.md::source-hash-current",
          latestSourceIdentityKey:
            "document_markdown:docs/research/nhm2.md::source-hash-current::source-text-current::27::docs::docs_chunk::es-US::es",
          sourceHash: "source-hash-current",
          sourceTextHash: "source-text-current",
          sourceTextCharCount: 27,
          projectionTarget: "docs_chunk",
          targetLanguage: "es",
          source: "capability_lane",
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
      },
      loadingText: "Translating...",
      errorText: (reason) => `Could not translate: ${reason}`,
      fallbackErrorText: "translation failed",
    });

    expect(rendered).toContain("Original source paragraph.");
    expect(rendered).toContain("Could not translate: translation_projection_source_text_mismatch");
    expect(rendered).toContain('data-doc-translation-display-status="blocked"');
    expect(rendered).toContain('data-doc-translation-display-status-reason="projection_error_blocked"');
    expect(rendered).toContain('data-doc-translation-render-status="error"');
    expect(rendered).toContain('data-doc-translation-projection-status="missing"');
    expect(rendered).toContain('data-doc-translation-observation-ref="obs:docs:stale-source-text"');
    expect(rendered).toContain('data-doc-translation-receipt-ref="receipt:docs:stale-source-text"');
    expect(rendered).toContain('data-doc-translation-reentry-required="true"');
    expect(rendered).toContain('data-doc-translation-source-hash="source-hash-current"');
    expect(rendered).toContain('data-doc-translation-source-text-hash="source-text-current"');
    expect(rendered).toContain('data-doc-translation-source-text-char-count="27"');
    expect(rendered).toContain('data-doc-translation-terminal-eligible="false"');
    expect(rendered).toContain('data-doc-translation-assistant-answer="false"');
    expect(rendered).not.toContain("Texto viejo");
  });

  it("keeps rejected stale source identity visible in blocked projection DOM attributes", () => {
    const currentIdentity =
      "document_markdown:docs/research/current.md::hash-current::text-current::31::docs::docs_chunk::es-US::es";
    const staleIdentity =
      "document_markdown:docs/research/previous.md::hash-previous::text-previous::27::docs::docs_chunk::es-US::es";

    const rendered = renderDocumentMarkdownWithInlineTranslations({
      units: [unit("u0001", "Current source paragraph.")],
      translations: {
        u0001: {
          status: "error",
          error: "translation_projection_source_identity_mismatch",
          observationRef: "obs:docs:stale-identity",
          receiptRef: "receipt:docs:stale-identity",
          projectionStatus: "missing",
          freshnessStatus: "unknown",
          terminalAuthorityStatus: "not_terminal_authority",
          sourceId: "document_markdown:docs/research/current.md",
          sourceIdentityKey: currentIdentity,
          latestSourceIdentityKey: staleIdentity,
          selectedRuntimeAgentProvider: "codex",
          selectedBackendProvider: "live_translation.local_runtime",
          sourceHash: "hash-current",
          sourceKind: "docs",
          sourceTextHash: "text-current",
          sourceTextCharCount: 31,
          accountLocale: "es-US",
          projectionTarget: "docs_chunk",
          targetLanguage: "es",
          source: "capability_lane",
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
      },
      loadingText: "Translating...",
      errorText: (reason) => `Could not translate: ${reason}`,
      fallbackErrorText: "translation failed",
    });

    expect(rendered).toContain("Current source paragraph.");
    expect(rendered).toContain("Could not translate: translation_projection_source_identity_mismatch");
    expect(rendered).toContain('data-doc-translation-display-status="blocked"');
    expect(rendered).toContain('data-doc-translation-display-status-reason="projection_error_blocked"');
    expect(rendered).toContain('data-doc-translation-render-status="error"');
    expect(rendered).toContain('data-doc-translation-projection-status="missing"');
    expect(rendered).toContain('data-doc-translation-observation-ref="obs:docs:stale-identity"');
    expect(rendered).toContain('data-doc-translation-receipt-ref="receipt:docs:stale-identity"');
    expect(rendered).toContain(`data-doc-translation-source-identity-key="${currentIdentity}"`);
    expect(rendered).toContain(`data-doc-translation-latest-source-identity-key="${staleIdentity}"`);
    expect(rendered).toContain('data-doc-translation-selected-runtime-agent-provider="codex"');
    expect(rendered).toContain('data-doc-translation-selected-backend-provider="live_translation.local_runtime"');
    expect(rendered).toContain('data-doc-translation-source-kind="docs"');
    expect(rendered).toContain('data-doc-translation-account-locale="es-US"');
    expect(rendered).toContain('data-doc-translation-terminal-eligible="false"');
    expect(rendered).toContain('data-doc-translation-assistant-answer="false"');
    expect(rendered).toContain('data-doc-translation-raw-content-included="false"');
  });

  it("keeps suppressed stale projection identity inspectable while rendering current ready text", () => {
    const rendered = renderDocumentMarkdownWithInlineTranslations({
      units: [unit("u0001", "Original source paragraph.")],
      translations: {
        u0001: {
          status: "ready",
          text: "Texto actual",
          observationRef: "obs:docs:current",
          receiptRef: "receipt:docs:current",
          serverProjectionKey: "server-projection-key-current",
          projectionStatus: "projected",
          freshnessStatus: "fresh",
          terminalAuthorityStatus: "not_terminal_authority",
          sourceId: "document_markdown:docs/research/nhm2.md",
          sourceIdentityKey: "document_markdown:docs/research/nhm2.md::source-hash-current",
          latestSourceIdentityKey:
            "document_markdown:docs/research/nhm2.md::source-hash-current::source-text-current::27::docs::docs_chunk::es-US::es",
          sourceHash: "source-hash-current",
          sourceTextHash: "source-text-current",
          projectionTarget: "docs_chunk",
          targetLanguage: "es",
          chunkId: "u0001",
          suppressedObservationRef: "obs:docs:stale",
          suppressedReceiptRef: "receipt:docs:stale",
          suppressedLaneSessionId: "lane-session-docs-stale",
          suppressedObservationLaneSessionId: "lane-session-docs-stale-observation",
          suppressedGoalBindingId: "goal-binding-docs-stale",
          suppressedSessionControlKey:
            "lane-session-docs-stale::document_markdown:docs/research/nhm2.md::source-hash-previous::docs_chunk::es-US::es",
          suppressedSourceBindingKey:
            "document_markdown:docs/research/nhm2.md::source-hash-previous::docs_chunk::es-US::es",
          suppressedServerProjectionKey: "server-projection-key-stale",
          suppressedProjectionStatus: "stale",
          suppressedFreshnessStatus: "stale",
          suppressedTerminalAuthorityStatus: "pending_helix_terminal_authority",
          suppressedSourceId: "document_markdown:docs/research/nhm2.md",
          suppressedSourceIdentityKey: "document_markdown:docs/research/nhm2.md::source-hash-previous",
          suppressedLatestSourceIdentityKey:
            "document_markdown:docs/research/nhm2.md::source-hash-previous::source-text-previous::27::docs::docs_chunk::es-US::es",
          suppressedLatestObservationKey:
            "document_markdown:docs/research/nhm2.md::source-hash-previous::docs_chunk::es::u0001::obs:docs:stale",
          suppressedLatestMailLoopObservationKey:
            "document_markdown:docs/research/nhm2.md::source-hash-previous::docs_chunk::es::u0001::receipt:docs:stale",
          suppressedGoalBindingKey:
            "goal:translate-docs::goal-binding-docs-stale::lane-session-docs-stale::live_translation",
          suppressedLatestEventId: "lane-session-docs-stale:record_observation:240",
          suppressedHasObservation: true,
          suppressedSelectedRuntimeAgentProvider: "codex",
          suppressedLaneSessionSourceBindingKey: "docs:nhm2::source-hash-previous::docs_chunk::es-US::es",
          suppressedLaneSessionSourceIdentityKey:
            "docs:nhm2::source-hash-previous::source-text-previous::27::document_markdown::docs_chunk::es-US::es",
          suppressedSelectedBackendProvider: "live_translation.local_runtime",
          suppressedSourceHash: "source-hash-previous",
          suppressedSourceKind: "document_markdown",
          suppressedSourceTextHash: "source-text-previous",
          suppressedSourceTextCharCount: 27,
          suppressedAccountLocale: "es-US",
          suppressedProjectionTarget: "docs_chunk",
          suppressedTargetLanguage: "es",
          suppressedChunkId: "u0001",
          suppressedChunkIndex: 0,
          suppressedDedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
          suppressedSourceEventId: "docs:stale-event:u0001",
          suppressedSourceEventMs: 220,
          suppressedObservedAtMs: 240,
          suppressedCancelRequested: false,
          suppressedReason: "stale_projection_did_not_replace_fresh_text",
          source: "capability_lane",
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
      },
      loadingText: "Translating...",
      errorText: (reason) => `Could not translate: ${reason}`,
      fallbackErrorText: "translation failed",
    });

    expect(rendered).toContain("Texto actual");
    expect(rendered).toContain('data-doc-translation-display-status="ready"');
    expect(rendered).toContain('data-doc-translation-display-status-reason="ready_projection_available"');
    expect(rendered).toContain([
      'data-doc-translation-projection-key="document_markdown:docs/research/nhm2.md',
      'source-hash-current',
      'source-text-current',
      '27',
      'docs',
      'docs_chunk',
      'es-US',
      'es',
      'u0001',
      'receipt:docs:current"',
    ].join("::"));
    expect(rendered).toContain([
      'data-doc-translation-suppressed-projection-key="document_markdown:docs/research/nhm2.md',
      'source-hash-previous',
      'source-text-previous',
      '27',
      'docs',
      'docs_chunk',
      'es-US',
      'es',
      'u0001',
      'receipt:docs:stale"',
    ].join("::"));
    expect(rendered).toContain('data-doc-translation-server-projection-key="server-projection-key-current"');
    expect(rendered).toContain('data-doc-translation-suppressed-server-projection-key="server-projection-key-stale"');
    expect(rendered).toContain('data-doc-translation-suppressed-observation-ref="obs:docs:stale"');
    expect(rendered).toContain('data-doc-translation-suppressed-receipt-ref="receipt:docs:stale"');
    expect(rendered).toContain('data-doc-translation-suppressed-lane-session-id="lane-session-docs-stale"');
    expect(rendered).toContain(
      'data-doc-translation-suppressed-observation-lane-session-id="lane-session-docs-stale-observation"',
    );
    expect(rendered).toContain('data-doc-translation-suppressed-goal-binding-id="goal-binding-docs-stale"');
    expect(rendered).toContain(
      'data-doc-translation-suppressed-session-control-key="lane-session-docs-stale::document_markdown:docs/research/nhm2.md::source-hash-previous::docs_chunk::es-US::es"',
    );
    expect(rendered).toContain(
      'data-doc-translation-suppressed-source-binding-key="document_markdown:docs/research/nhm2.md::source-hash-previous::docs_chunk::es-US::es"',
    );
    expect(rendered).toContain(
      'data-doc-translation-source-identity-key="document_markdown:docs/research/nhm2.md::source-hash-current"',
    );
    expect(rendered).toContain(
      'data-doc-translation-latest-source-identity-key="document_markdown:docs/research/nhm2.md::source-hash-current::source-text-current::27::docs::docs_chunk::es-US::es"',
    );
    expect(rendered).toContain(
      'data-doc-translation-suppressed-source-identity-key="document_markdown:docs/research/nhm2.md::source-hash-previous"',
    );
    expect(rendered).toContain(
      'data-doc-translation-suppressed-latest-source-identity-key="document_markdown:docs/research/nhm2.md::source-hash-previous::source-text-previous::27::docs::docs_chunk::es-US::es"',
    );
    expect(rendered).toContain(
      'data-doc-translation-suppressed-latest-observation-key="document_markdown:docs/research/nhm2.md::source-hash-previous::docs_chunk::es::u0001::obs:docs:stale"',
    );
    expect(rendered).toContain(
      'data-doc-translation-suppressed-latest-mail-loop-observation-key="document_markdown:docs/research/nhm2.md::source-hash-previous::docs_chunk::es::u0001::receipt:docs:stale"',
    );
    expect(rendered).toContain(
      'data-doc-translation-suppressed-goal-binding-key="goal:translate-docs::goal-binding-docs-stale::lane-session-docs-stale::live_translation"',
    );
    expect(rendered).toContain(
      'data-doc-translation-suppressed-latest-event-id="lane-session-docs-stale:record_observation:240"',
    );
    expect(rendered).toContain('data-doc-translation-suppressed-has-observation="true"');
    expect(rendered).toContain('data-doc-translation-suppressed-selected-runtime-agent-provider="codex"');
    expect(rendered).toContain(
      'data-doc-translation-suppressed-lane-session-source-binding-key="docs:nhm2::source-hash-previous::docs_chunk::es-US::es"',
    );
    expect(rendered).toContain(
      'data-doc-translation-suppressed-lane-session-source-identity-key="docs:nhm2::source-hash-previous::source-text-previous::27::docs::docs_chunk::es-US::es"',
    );
    expect(rendered).toContain('data-doc-translation-suppressed-source-hash="source-hash-previous"');
    expect(rendered).toContain('data-doc-translation-suppressed-source-kind="docs"');
    expect(rendered).toContain('data-doc-translation-suppressed-source-text-hash="source-text-previous"');
    expect(rendered).toContain('data-doc-translation-suppressed-source-text-char-count="27"');
    expect(rendered).toContain('data-doc-translation-suppressed-account-locale="es-US"');
    expect(rendered).toContain(
      'data-doc-translation-suppressed-selected-backend-provider="live_translation.local_runtime"',
    );
    expect(rendered).toContain('data-doc-translation-suppressed-chunk-id="u0001"');
    expect(rendered).toContain('data-doc-translation-suppressed-chunk-index="0"');
    expect(rendered).toContain(
      'data-doc-translation-suppressed-dedupe-key="document_markdown:docs/research/nhm2.md:u0001:es"',
    );
    expect(rendered).toContain('data-doc-translation-suppressed-source-event-id="docs:stale-event:u0001"');
    expect(rendered).toContain('data-doc-translation-suppressed-source-event-ms="220"');
    expect(rendered).toContain('data-doc-translation-suppressed-observed-at-ms="240"');
    expect(rendered).toContain('data-doc-translation-suppressed-freshness-status="stale"');
    expect(rendered).toContain(
      'data-doc-translation-suppressed-terminal-authority-status="pending_helix_terminal_authority"',
    );
    expect(rendered).toContain('data-doc-translation-suppressed-display-status="stale"');
    expect(rendered).toContain('data-doc-translation-suppressed-display-status-reason="stale_projection_suppressed"');
    expect(rendered).toContain('data-doc-translation-suppressed-context-role="tool_evidence"');
    expect(rendered).toContain('data-doc-translation-suppressed-cancel-requested="false"');
    expect(rendered).toContain('data-doc-translation-suppressed-answer-authority="false"');
    expect(rendered).toContain('data-doc-translation-suppressed-terminal-eligible="false"');
    expect(rendered).toContain('data-doc-translation-suppressed-assistant-answer="false"');
    expect(rendered).toContain('data-doc-translation-suppressed-raw-content-included="false"');
    expect(rendered).toContain('data-doc-translation-suppressed-reason="stale_projection_did_not_replace_fresh_text"');
    expect(rendered).not.toContain("Could not translate");
  });

  it("keeps active translation projection traceable as non-authoritative lane state", () => {
    const rendered = renderDocumentMarkdownWithInlineTranslations({
      units: [unit("u0001", "Original source paragraph.")],
      translations: {
        u0001: {
          status: "loading",
          observationRef: "obs:docs:pending",
          receiptRef: "receipt:docs:pending",
          laneSessionId: "lane-session-docs-translation",
          hasObservation: false,
          selectedBackendProvider: "live_translation.local_runtime",
          projectionStatus: "missing",
          freshnessStatus: "fresh",
          terminalAuthorityStatus: "not_terminal_authority",
          sourceId: "document_markdown:docs/research/nhm2.md",
          sourceHash: "source-hash-current",
          sourceKind: "document_markdown",
          accountLocale: "es-US",
          projectionTarget: "docs_chunk",
          targetLanguage: "es",
          source: "capability_lane",
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
      },
      loadingText: "Translating...",
      errorText: (reason) => `Could not translate: ${reason}`,
      fallbackErrorText: "translation failed",
    });

    expect(rendered).toContain("Translating...");
    expect(rendered).toContain('data-doc-translation-anchor="u0001"');
    expect(rendered).toContain('data-doc-translation-role="governed-inline-projection-anchor"');
    expect(rendered).toContain('data-doc-translation-answer-authority="false"');
    expect(rendered).toContain('data-doc-translation-display-status="active"');
    expect(rendered).toContain('data-doc-translation-display-status-reason="lane_activity_without_projection"');
    expect(rendered).toContain('data-doc-translation-render-status="loading"');
    expect(rendered).toContain('data-doc-translation-lane-session-id="lane-session-docs-translation"');
    expect(rendered).toContain("border-cyan-400/70 text-cyan-300/85 animate-pulse");
    expect(rendered).toContain('data-doc-translation-role="governed-inline-projection"');
    expect(rendered).toContain('data-doc-translation-answer-authority="false"');
    expect(rendered).toContain('data-doc-translation-governed-projection="true"');
    expect(rendered).toContain('data-doc-translation-render-status="loading"');
    expect(rendered).toContain('data-doc-translation-display-status="active"');
    expect(rendered).toContain('data-doc-translation-projection-status="missing"');
    expect(rendered).toContain('data-doc-translation-lane-session-id="lane-session-docs-translation"');
    expect(rendered).toContain('data-doc-translation-target-language="es"');
    expect(rendered).toContain('lang="es" dir="auto"');
    expect(rendered).toContain('data-doc-translation-has-observation="false"');
    expect(rendered).toContain('data-doc-translation-source-hash="source-hash-current"');
    expect(rendered).toContain('data-doc-translation-terminal-authority-status="not_terminal_authority"');
    expect(rendered).toContain('data-doc-translation-terminal-eligible="false"');
    expect(rendered).toContain('data-doc-translation-assistant-answer="false"');
    expect(rendered).toContain('data-doc-translation-raw-content-included="false"');
  });

  it("keeps generic loading translation projection as pending when no lane session is active", () => {
    const rendered = renderDocumentMarkdownWithInlineTranslations({
      units: [unit("u0001", "Original source paragraph.")],
      translations: {
        u0001: {
          status: "loading",
          projectionStatus: "missing",
          freshnessStatus: "fresh",
          terminalAuthorityStatus: "not_terminal_authority",
          source: "capability_lane",
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
      },
      loadingText: "Translating...",
      errorText: (reason) => `Could not translate: ${reason}`,
      fallbackErrorText: "translation failed",
    });

    expect(rendered).toContain("Translating...");
    expect(rendered).toContain("border-emerald-400/60 text-emerald-300/80 animate-pulse");
    expect(rendered).toContain('data-doc-translation-render-status="loading"');
    expect(rendered).toContain('data-doc-translation-display-status="pending"');
    expect(rendered).toContain('data-doc-translation-display-status-reason="pending_projection_without_lane_session"');
    expect(rendered).toContain('dir="auto"');
    expect(rendered).toContain('data-doc-translation-terminal-eligible="false"');
    expect(rendered).toContain('data-doc-translation-assistant-answer="false"');
  });

  it("projects cancelled, failed, and blocked display health without making receipts answers", () => {
    const renderFor = (unitId: string, state: Parameters<typeof renderDocumentMarkdownWithInlineTranslations>[0]["translations"][string]) =>
      renderDocumentMarkdownWithInlineTranslations({
        units: [unit(unitId, "Original source paragraph.")],
        translations: { [unitId]: state },
        loadingText: "Translating...",
        errorText: (reason) => `Could not translate: ${reason}`,
        fallbackErrorText: "translation failed",
      });

    const cancelled = renderFor("u-cancelled", {
      status: "error",
      error: "translation_projection_cancelled",
      observationRef: "obs:docs:cancelled",
      receiptRef: "receipt:docs:cancelled",
      projectionStatus: "cancelled",
      freshnessStatus: "fresh",
      terminalAuthorityStatus: "not_terminal_authority",
      source: "capability_lane",
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(cancelled).toContain('data-doc-translation-display-status="cancelled"');
    expect(cancelled).toContain('data-doc-translation-display-status-reason="cancelled_projection"');
    expect(cancelled).toContain("border-zinc-400/70 text-zinc-300");
    expect(cancelled).toContain('data-doc-translation-terminal-eligible="false"');
    expect(cancelled).toContain('data-doc-translation-assistant-answer="false"');

    const failed = renderFor("u-failed", {
      status: "error",
      error: "translation_projection_failed",
      observationRef: "obs:docs:failed",
      receiptRef: "receipt:docs:failed",
      projectionStatus: "failed",
      freshnessStatus: "fresh",
      terminalAuthorityStatus: "not_terminal_authority",
      source: "capability_lane",
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(failed).toContain('data-doc-translation-display-status="failed"');
    expect(failed).toContain('data-doc-translation-display-status-reason="failed_projection"');
    expect(failed).toContain("border-rose-400/70 text-rose-300");
    expect(failed).toContain('data-doc-translation-terminal-eligible="false"');
    expect(failed).toContain('data-doc-translation-assistant-answer="false"');

    const blocked = renderFor("u-blocked", {
      status: "error",
      error: "translation_projection_blocked",
      observationRef: "obs:docs:blocked",
      receiptRef: "receipt:docs:blocked",
      projectionStatus: "missing",
      freshnessStatus: "fresh",
      terminalAuthorityStatus: "not_terminal_authority",
      source: "capability_lane",
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(blocked).toContain('data-doc-translation-display-status="blocked"');
    expect(blocked).toContain('data-doc-translation-display-status-reason="projection_error_blocked"');
    expect(blocked).toContain("border-amber-400/70 text-amber-300");
    expect(blocked).toContain('data-doc-translation-terminal-eligible="false"');
    expect(blocked).toContain('data-doc-translation-assistant-answer="false"');
  });
});
