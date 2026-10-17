import { describe, expect, it } from "vitest";
import {
  buildHelixLiveTranslationProjectionEventPayloads,
  buildHelixLiveTranslationInlineUnitStates,
  buildHelixLiveTranslationUiProjections,
  selectHelixLiveTranslationUiProjection,
  summarizeHelixLiveTranslationUiProjectionTraffic,
} from "@/lib/helix/live-translation-projection";

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
  sourceKind: null,
  accountLocale: null,
  projectionTarget: "docs_chunk",
  targetLanguage: "es",
  cancelRequested: false,
  contextRole: "tool_evidence",
  ...overrides,
});

describe("Helix live translation UI projection", () => {
  it("builds non-authoritative live events from Ask projection receipts", () => {
    const events = buildHelixLiveTranslationProjectionEventPayloads({
      contextId: "desktop",
      traceId: "turn-1",
      nowMs: 5000,
      payload: {
        debug: {
          capability_lane_projection_receipts: [
            {
              schema: "helix.live_translation.projection_receipt.v1",
              receipt_ref: "receipt:docs:1",
              observation_ref: "obs:docs:1",
              selected_runtime_agent_provider: "codex",
              selected_backend_provider: "live_translation.local_runtime",
              lane_id: "live_translation",
              capability: "live_translation.translate_text",
              projection_target: "docs_chunk",
              projection_status: "projected",
              source_id: "docs:research/current.md#chunk-1",
              doc_path: "docs/research/current.md",
              source_hash: "doc-hash-1",
              source_kind: "docs",
              source_text_hash: "source-text-hash-1",
              source_text_char_count: 42,
              account_locale: "es-US",
              chunk_id: "chunk-1",
              chunk_index: 0,
              dedupe_key: "docs:research/current.md:chunk-1:es",
              source_event_id: "event-1",
              source_event_ms: 1200,
              observed_at_ms: 1400,
              freshness_status: "fresh",
              target_language: "es",
              translated_text: "Texto traducido.",
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

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      contextId: "desktop",
      traceId: "turn-1",
      entry: {
        id: expect.stringContaining("live_translation_projection:"),
        text: "Live translation projection receipt recorded.",
        tool: "live_translation.translate_text",
        tsMs: 1400,
        meta: {
          schema: "helix.live_translation.projection_receipt.v1",
          source_event_type: "lane_projection_receipt",
          lane: "live_translation",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_chunk",
          projection_status: "projected",
          source_id: "docs:research/current.md#chunk-1",
          doc_path: "docs/research/current.md",
          source_hash: "doc-hash-1",
          source_kind: "docs",
          source_text_hash: "source-text-hash-1",
          source_text_char_count: 42,
          account_locale: "es-US",
          target_language: "es",
          chunk_id: "chunk-1",
          chunk_index: 0,
          dedupe_key: "docs:research/current.md:chunk-1:es",
          source_event_id: "event-1",
          source_event_ms: 1200,
          observed_at_ms: 1400,
          freshness_status: "fresh",
          translated_text: "Texto traducido.",
          observation_ref: "obs:docs:1",
          receipt_ref: "receipt:docs:1",
          selected_runtime_agent_provider: "codex",
          selected_backend_provider: "live_translation.local_runtime",
          terminal_authority_status: "not_terminal_authority",
          context_role: "tool_evidence",
          answer_authority: false,
          terminal_eligible: false,
          assistant_answer: false,
          raw_content_included: false,
        },
      },
    });
  });

  it("projects translated chunks from lane projection receipts without terminal authority", () => {
    const projections = buildHelixLiveTranslationUiProjections({
      capability_lane_projection_receipts: [
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:docs:1",
          observation_ref: "obs:docs:1",
          projection_key: "docs:nhm2::source-text-1::docs_chunk::es-US::chunk-1::receipt:docs:1",
          lane_session_id: "lane-session-docs",
          selected_backend_provider: "live_translation.local_runtime",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_chunk",
          projection_status: "projected",
          source_id: "docs:nhm2",
          doc_path: "docs/research/nhm2.md",
          source_kind: "docs",
          account_locale: "es-US",
          chunk_id: "chunk-1",
          chunk_index: 1,
          dedupe_key: "docs:nhm2:chunk-1:es",
          source_event_id: "docs:nhm2:event-1",
          source_event_ms: 1000,
          observed_at_ms: 1200,
          freshness_status: "fresh",
          target_language: "es",
          translated_text: "hola",
          stale: false,
          cancel_requested: false,
          terminal_eligible: false,
          assistant_answer: false,
          raw_content_included: false,
        },
      ],
    });

    expect(projections).toEqual([
      {
        key: "docs_chunk|docs:nhm2|docs|es-US|chunk-1|es|docs:nhm2:chunk-1:es|docs:nhm2:event-1",
        projectionKey: "docs:nhm2::source-text-1::docs_chunk::es-US::chunk-1::receipt:docs:1",
        status: "projected",
        projectionTarget: "docs_chunk",
        sourceId: "docs:nhm2",
        docPath: "docs/research/nhm2.md",
        sourceKind: "docs",
        accountLocale: "es-US",
        chunkId: "chunk-1",
        chunkIndex: 1,
        dedupeKey: "docs:nhm2:chunk-1:es",
        sourceEventId: "docs:nhm2:event-1",
        targetLanguage: "es",
        translatedText: "hola",
        observationRef: "obs:docs:1",
        receiptRef: "receipt:docs:1",
        laneSessionId: "lane-session-docs",
        observationLaneSessionId: null,
        goalBindingId: null,
        latestEventId: null,
        hasObservation: true,
        selectedBackendProvider: "live_translation.local_runtime",
        observedAtMs: 1200,
        sourceEventMs: 1000,
        freshnessStatus: "fresh",
        terminalAuthorityStatus: "not_terminal_authority",
        stale: false,
        cancelRequested: false,
        contextRole: "tool_evidence",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    ]);
  });

  it("does not project text-to-speech receipts as live translation UI projections", () => {
    const projections = buildHelixLiveTranslationUiProjections({
      capability_lane_projection_receipts: [
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:translation:1",
          observation_ref: "obs:translation:1",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "ask_turn",
          projection_status: "projected",
          source_id: "ask_turn",
          source_text_hash: "source-text-hash-1",
          source_text_char_count: 5,
          chunk_id: "chunk-translation",
          target_language: "es",
          translated_text: "hola",
          terminal_authority_status: "not_terminal_authority",
          terminal_eligible: false,
          assistant_answer: false,
          raw_content_included: false,
        },
        {
          schema: "helix.capability_lane.provider_adapter_receipt.v1",
          receipt_ref: "receipt:tts:1",
          observation_ref: "obs:tts:1",
          lane_id: "text_to_speech",
          capability_key: "text_to_speech.speak_text",
          kind: "text_to_speech_playback",
          status: "blocked",
          payload: {
            schema: "helix.text_to_speech.receipt.v1",
            lane_id: "text_to_speech",
            capability: "text_to_speech.speak_text",
            playback_status: "blocked",
            provider_playback_status: "queued_for_retry",
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
          terminal_eligible: false,
          assistant_answer: false,
          raw_content_included: false,
        },
      ],
    });

    expect(projections).toHaveLength(1);
    expect(projections[0]).toMatchObject({
      observationRef: "obs:translation:1",
      receiptRef: "receipt:translation:1",
      translatedText: "hola",
    });
    expect(projections.some((projection) => projection.observationRef === "obs:tts:1")).toBe(false);
  });

  it("projects account-language UI region receipts with panel and region identity", () => {
    const payload = {
      capability_lane_projection_receipts: [
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:account-language:button",
          observation_ref: "obs:account-language:button",
          selected_runtime_agent_provider: "codex",
          selected_backend_provider: "live_translation.local_runtime",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "account_language",
          projection_status: "projected",
          source_id: "workstation-shell#docs-viewer:translate-button",
          panel_id: "docs-viewer",
          region_id: "docs-viewer:translate-button",
          bbox: { x: 12, y: 24, width: 180, height: 32, source: "account-language-region" },
          source_kind: "button_label",
          source_text_hash: "sha256:translate-button",
          source_text_char_count: 9,
          account_locale: "es-US",
          chunk_id: "docs-viewer:translate-button",
          chunk_index: 2,
          dedupe_key: "workstation-shell#docs-viewer:translate-button:es",
          source_event_id: "ui-region:event-1",
          source_event_ms: 100,
          observed_at_ms: 150,
          freshness_status: "fresh",
          target_language: "es",
          translated_text: "Traducir",
          terminal_authority_status: "not_terminal_authority",
          answer_authority: false,
          terminal_eligible: false,
          assistant_answer: false,
          raw_content_included: false,
        },
      ],
    };

    const projections = buildHelixLiveTranslationUiProjections(payload);
    expect(projections).toHaveLength(1);
    expect(projections[0]).toMatchObject({
      projectionTarget: "account_language",
      sourceId: "workstation-shell#docs-viewer:translate-button",
      panelId: "docs-viewer",
      regionId: "docs-viewer:translate-button",
      bbox: { x: 12, y: 24, width: 180, height: 32, source: "account-language-region" },
      sourceKind: "button_label",
      accountLocale: "es-US",
      chunkId: "docs-viewer:translate-button",
      targetLanguage: "es",
      translatedText: "Traducir",
      observationRef: "obs:account-language:button",
      receiptRef: "receipt:account-language:button",
      terminalAuthorityStatus: "not_terminal_authority",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });

    expect(summarizeHelixLiveTranslationUiProjectionTraffic(projections)).toEqual([
      expect.objectContaining({
        sourceId: "workstation-shell#docs-viewer:translate-button",
        latestPanelId: "docs-viewer",
        latestRegionId: "docs-viewer:translate-button",
        latestBbox: { x: 12, y: 24, width: 180, height: 32, source: "account-language-region" },
        sourceKind: "button_label",
        projectionTarget: "account_language",
        accountLocale: "es-US",
        latestObservationRef: "obs:account-language:button",
        latestReceiptRef: "receipt:account-language:button",
        latestTerminalAuthorityStatus: "not_terminal_authority",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      }),
    ]);

    expect(buildHelixLiveTranslationProjectionEventPayloads({
      contextId: "desktop",
      traceId: "turn-account-language",
      payload,
      nowMs: 200,
    })[0]?.entry.meta).toMatchObject({
      projection_target: "account_language",
      source_id: "workstation-shell#docs-viewer:translate-button",
      panel_id: "docs-viewer",
      region_id: "docs-viewer:translate-button",
      bbox: { x: 12, y: 24, width: 180, height: 32, source: "account-language-region" },
      source_kind: "button_label",
      account_locale: "es-US",
      terminal_authority_status: "not_terminal_authority",
      answer_authority: false,
      terminal_eligible: false,
      assistant_answer: false,
      raw_content_included: false,
    });
  });

  it("treats receipt-only mail-loop projection receipts as inspectable evidence", () => {
    const projections = buildHelixLiveTranslationUiProjections({
      capability_lane_projection_receipts: [
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:docs:mail-loop-only",
          latest_mail_loop_observation_key: "docs:nhm2::mail-loop::receipt:docs:mail-loop-only",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_chunk",
          projection_status: "stale",
          source_id: "docs:nhm2",
          source_kind: "docs",
          account_locale: "es-US",
          chunk_id: "chunk-mail",
          target_language: "es",
          stale: true,
          terminal_eligible: false,
          assistant_answer: false,
          raw_content_included: false,
        },
      ],
    });

    expect(projections[0]).toMatchObject({
      receiptRef: "receipt:docs:mail-loop-only",
      observationRef: null,
      latestMailLoopObservationKey: "docs:nhm2::mail-loop::receipt:docs:mail-loop-only",
      hasObservation: true,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("normalizes serialized chunk timing metadata from projection receipts", () => {
    const projections = buildHelixLiveTranslationUiProjections({
      capability_lane_projection_receipts: [
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:docs:serialized",
          observation_ref: "obs:docs:serialized",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_chunk",
          projection_status: "projected",
          source_id: "docs:nhm2",
          chunk_id: "chunk-2",
          chunk_index: "2",
          source_event_id: "docs:nhm2:event-serialized",
          source_event_ms: "1000",
          observed_at_ms: "1200",
          target_language: "es",
          translated_text: "segundo",
        },
      ],
    });

    expect(projections[0]).toMatchObject({
      chunkIndex: 2,
      sourceEventMs: 1000,
      observedAtMs: 1200,
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(summarizeHelixLiveTranslationUiProjectionTraffic(projections)[0]).toMatchObject({
      latestChunkIndex: 2,
      latestSourceEventId: "docs:nhm2:event-serialized",
      latestSourceEventMs: 1000,
      latestObservedAtMs: 1200,
      latestTerminalAuthorityStatus: "not_terminal_authority",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("normalizes camelCase projection receipt metadata without losing lane identity", () => {
    const projections = buildHelixLiveTranslationUiProjections({
      capability_lane_projection_receipts: [
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receiptRef: "receipt:docs:camel",
          observationRef: "obs:docs:camel",
          laneSessionId: "lane-session-docs",
          observationLaneSessionId: "lane-session-observation-docs",
          goalBindingId: "goal-binding-docs",
          sessionDebugPhase: "running:record_observation:observation_recorded",
          sessionObservationStatus: "observation_recorded",
          sourceBindingKey: "docs:nhm2::fnv1a32:camel::docs_chunk::es-US::es",
          latestSourceBindingKey: "docs:nhm2::fnv1a32:camel::docs_chunk::es-US::es",
          laneSessionSourceBindingKey: "docs:nhm2::fnv1a32:camel::docs_chunk::es-US::es",
          laneSessionSourceIdentityKey:
            "docs:nhm2::fnv1a32:camel::sha256:camel-text::128::docs::docs_chunk::es-US::es",
          latestEventId: "lane-session-docs:observation_recorded:250",
          hasObservation: true,
          selectedBackendProvider: "live_translation.local_runtime",
          projectionTarget: "docs_chunk",
          projectionStatus: "projected",
          sourceId: "docs:nhm2",
          sourceHash: "fnv1a32:camel",
          sourceKind: "docs",
          accountLocale: "es-US",
          chunkId: "chunk-camel",
          chunkIndex: "4",
          dedupeKey: "docs:nhm2:chunk-camel:es",
          sourceEventId: "docs:nhm2:event-camel",
          sourceEventMs: "225",
          observedAtMs: "250",
          freshnessStatus: "fresh",
          targetLanguage: "es",
          translatedText: "texto camel",
          terminalAuthorityStatus: "pending_helix_terminal_authority",
        },
      ],
    });

    expect(projections).toEqual([
      expect.objectContaining({
        key: "docs_chunk|docs:nhm2|fnv1a32:camel|docs|es-US|chunk-camel|es|docs:nhm2:chunk-camel:es|docs:nhm2:event-camel",
        projectionTarget: "docs_chunk",
        sourceId: "docs:nhm2",
        sourceHash: "fnv1a32:camel",
        sourceKind: "docs",
        accountLocale: "es-US",
        chunkId: "chunk-camel",
        chunkIndex: 4,
        dedupeKey: "docs:nhm2:chunk-camel:es",
        sourceEventId: "docs:nhm2:event-camel",
        sourceEventMs: 225,
        observedAtMs: 250,
        targetLanguage: "es",
        translatedText: "texto camel",
        observationRef: "obs:docs:camel",
        receiptRef: "receipt:docs:camel",
        laneSessionId: "lane-session-docs",
        observationLaneSessionId: "lane-session-observation-docs",
        goalBindingId: "goal-binding-docs",
        sessionDebugPhase: "running:record_observation:observation_recorded",
        sessionObservationStatus: "observation_recorded",
        sourceBindingKey: "docs:nhm2::fnv1a32:camel::docs_chunk::es-US::es",
        latestSourceBindingKey: "docs:nhm2::fnv1a32:camel::docs_chunk::es-US::es",
        laneSessionSourceBindingKey: "docs:nhm2::fnv1a32:camel::docs_chunk::es-US::es",
        laneSessionSourceIdentityKey:
          "docs:nhm2::fnv1a32:camel::sha256:camel-text::128::docs::docs_chunk::es-US::es",
        latestEventId: "lane-session-docs:observation_recorded:250",
        hasObservation: true,
        selectedBackendProvider: "live_translation.local_runtime",
        terminalAuthorityStatus: "pending_helix_terminal_authority",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      }),
    ]);
    expect(summarizeHelixLiveTranslationUiProjectionTraffic(projections)).toEqual([
      expect.objectContaining({
        latestObservationRef: "obs:docs:camel",
        latestReceiptRef: "receipt:docs:camel",
        latestLaneSessionId: "lane-session-docs",
        latestObservationLaneSessionId: "lane-session-observation-docs",
        latestGoalBindingId: "goal-binding-docs",
        latestLaneSessionDebugPhase: "running:record_observation:observation_recorded",
        latestLaneSessionObservationStatus: "observation_recorded",
        latestSourceBindingKey: "docs:nhm2::fnv1a32:camel::docs_chunk::es-US::es",
        latestLaneSessionSourceBindingKey: "docs:nhm2::fnv1a32:camel::docs_chunk::es-US::es",
        latestLaneSessionSourceIdentityKey:
          "docs:nhm2::fnv1a32:camel::sha256:camel-text::128::docs::docs_chunk::es-US::es",
        latestEventId: "lane-session-docs:observation_recorded:250",
        latestSourceEventId: "docs:nhm2:event-camel",
        latestHasObservation: true,
        selectedBackendProvider: "live_translation.local_runtime",
        latestTerminalAuthorityStatus: "pending_helix_terminal_authority",
      }),
    ]);
  });

  it("preserves terminal-authority rejection status on projection receipts", () => {
    const projections = buildHelixLiveTranslationUiProjections({
      capability_lane_projection_receipts: [
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:docs:rejected",
          observation_ref: "obs:docs:rejected",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_chunk",
          projection_status: "projected",
          source_id: "docs:nhm2",
          chunk_id: "chunk-rejected",
          observed_at_ms: 300,
          target_language: "es",
          translated_text: "texto rechazado",
          terminal_authority_status: "terminal_authority_rejected",
        },
      ],
    });

    expect(projections[0]).toMatchObject({
      observationRef: "obs:docs:rejected",
      receiptRef: "receipt:docs:rejected",
      terminalAuthorityStatus: "terminal_authority_rejected",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(summarizeHelixLiveTranslationUiProjectionTraffic(projections)[0]).toMatchObject({
      latestObservationRef: "obs:docs:rejected",
      latestReceiptRef: "receipt:docs:rejected",
      latestTerminalAuthorityStatus: "terminal_authority_rejected",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("preserves source hash when deriving projections from observation-only call results", () => {
    const projections = buildHelixLiveTranslationUiProjections({
      capability_lane_call_results: [
        {
          observation: {
            schema: "helix.live_translation.observation.v1",
            observation_ref: "obs:docs:call-result",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            selected_backend_provider: "live_translation.local_runtime",
            lane_session_id: "lane-session-docs",
            projection_target: "docs_chunk",
            source_id: "docs:nhm2",
            source_hash: "fnv1a32:nhm2-v2",
            source_identity_key:
              "docs:nhm2::fnv1a32:nhm2-v2::sha256:nhm2-source-text::4096::docs::docs_chunk::es-US::es",
            latest_source_identity_key:
              "docs:nhm2::fnv1a32:nhm2-v2::sha256:nhm2-latest-source-text::2048::docs::docs_chunk::es-US::es",
            lane_session_source_binding_key: "docs:nhm2::fnv1a32:nhm2-v2::docs_chunk::es-US::es",
            lane_session_source_identity_key:
              "docs:nhm2::fnv1a32:nhm2-v2::sha256:nhm2-source-text::4096::docs::docs_chunk::es-US::es",
            source_text_hash: "sha256:nhm2-source-text",
            source_text_char_count: 4096,
            chunk_id: "chunk-hash",
            chunk_index: 3,
            dedupe_key: "docs:nhm2:chunk-hash:es",
            source_event_id: "docs:nhm2:event-hash",
            source_event_ms: 1300,
            observed_at_ms: 1400,
            freshness_status: "fresh",
            target_language: "es",
            translated_text: "texto",
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          },
        },
      ],
    });

    expect(projections).toHaveLength(1);
    expect(projections[0]).toMatchObject({
      key: "docs_chunk|docs:nhm2|fnv1a32:nhm2-v2|sha256:nhm2-source-text|4096|chunk-hash|es|docs:nhm2:chunk-hash:es|docs:nhm2:event-hash",
      sourceId: "docs:nhm2",
      sourceHash: "fnv1a32:nhm2-v2",
      sourceIdentityKey:
        "docs:nhm2::fnv1a32:nhm2-v2::sha256:nhm2-source-text::4096::docs::docs_chunk::es-US::es",
      latestSourceIdentityKey:
        "docs:nhm2::fnv1a32:nhm2-v2::sha256:nhm2-latest-source-text::2048::docs::docs_chunk::es-US::es",
      laneSessionSourceBindingKey: "docs:nhm2::fnv1a32:nhm2-v2::docs_chunk::es-US::es",
      laneSessionSourceIdentityKey:
        "docs:nhm2::fnv1a32:nhm2-v2::sha256:nhm2-source-text::4096::docs::docs_chunk::es-US::es",
      sourceTextHash: "sha256:nhm2-source-text",
      sourceTextCharCount: 4096,
      chunkId: "chunk-hash",
      chunkIndex: 3,
      observationRef: "obs:docs:call-result",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(summarizeHelixLiveTranslationUiProjectionTraffic(projections)[0]).toMatchObject({
      sourceId: "docs:nhm2",
      sourceHash: "fnv1a32:nhm2-v2",
      latestSourceIdentityKey:
        "docs:nhm2::fnv1a32:nhm2-v2::sha256:nhm2-latest-source-text::2048::docs::docs_chunk::es-US::es",
      latestLaneSessionSourceBindingKey: "docs:nhm2::fnv1a32:nhm2-v2::docs_chunk::es-US::es",
      latestLaneSessionSourceIdentityKey:
        "docs:nhm2::fnv1a32:nhm2-v2::sha256:nhm2-source-text::4096::docs::docs_chunk::es-US::es",
      latestSourceTextHash: "sha256:nhm2-source-text",
      latestSourceTextCharCount: 4096,
      latestChunkId: "chunk-hash",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("surfaces stale and cancelled projection states as non-answer UI state", () => {
    const projections = buildHelixLiveTranslationUiProjections({
      debug: {
        capability_lane_projection_receipts: [
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:hover:stale",
            observation_ref: "obs:hover:stale",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_hover",
            projection_status: "stale",
            source_id: "docs:hover",
            chunk_id: "hover-1",
            chunk_index: 0,
            dedupe_key: "hover-1:fr",
            source_event_ms: 1,
            observed_at_ms: 60_000,
            freshness_status: "stale",
            target_language: "fr",
            translated_text: "bonjour",
            stale: true,
            cancel_requested: false,
          },
          {
            schema: "helix.live_translation.projection_receipt.v1",
            receipt_ref: "receipt:hover:cancelled",
            observation_ref: "obs:hover:cancelled",
            lane_id: "live_translation",
            capability: "live_translation.translate_text",
            projection_target: "docs_hover",
            projection_status: "cancelled",
            source_id: "docs:hover",
            chunk_id: "hover-2",
            chunk_index: 1,
            dedupe_key: "hover-2:fr",
            source_event_ms: 2,
            observed_at_ms: 60_001,
            freshness_status: "fresh",
            target_language: "fr",
            translated_text: null,
            stale: false,
            cancel_requested: true,
          },
        ],
      },
    });

    expect(projections.map((entry) => ({
      status: entry.status,
      translatedText: entry.translatedText,
      stale: entry.stale,
      sourceEventId: entry.sourceEventId,
      cancelRequested: entry.cancelRequested,
      answerAuthority: entry.answerAuthority,
      terminalEligible: entry.terminalEligible,
      assistantAnswer: entry.assistantAnswer,
    }))).toEqual([
      {
        status: "stale",
        translatedText: "bonjour",
        stale: true,
        sourceEventId: null,
        cancelRequested: false,
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
      },
      {
        status: "cancelled",
        translatedText: null,
        stale: false,
        sourceEventId: null,
        cancelRequested: true,
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
      },
    ]);
  });

  it("falls back to call-result observations and keeps the latest projection per chunk", () => {
    const projections = buildHelixLiveTranslationUiProjections({
      capability_lane_call_results: [
        {
          capability: "live_translation.translate_text",
          observation: {
            capability: "live_translation.translate_text",
            observation_ref: "obs:selection:old",
            projection_target: "docs_selection",
            source_id: "docs:selection",
            chunk_id: "selection-1",
            chunk_index: 0,
            dedupe_key: "selection-1:es",
            source_event_ms: 10,
            observed_at_ms: 20,
            freshness_status: "fresh",
            target_language: "es",
            translated_text: "viejo",
          },
        },
      ],
      debug: {
        capability_lane_observation_packets: [
          {
            state_delta: {
              live_translation_projection_receipt: {
                schema: "helix.live_translation.projection_receipt.v1",
                receipt_ref: "receipt:selection:new",
                observation_ref: "obs:selection:new",
                lane_id: "live_translation",
                capability: "live_translation.translate_text",
                projection_target: "docs_selection",
                projection_status: "projected",
                source_id: "docs:selection",
                chunk_id: "selection-1",
                chunk_index: 0,
                dedupe_key: "selection-1:es",
                source_event_ms: 10,
                observed_at_ms: 30,
                freshness_status: "fresh",
                target_language: "es",
                translated_text: "nuevo",
                stale: false,
                cancel_requested: false,
              },
            },
          },
        ],
      },
    });

    expect(projections).toHaveLength(1);
    expect(projections[0]).toMatchObject({
      translatedText: "nuevo",
      observationRef: "obs:selection:new",
      receiptRef: "receipt:selection:new",
      observedAtMs: 30,
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
    });
  });

  it("does not let newer cancelled or failed receipts replace ready projection text for the same key", () => {
    const projections = buildHelixLiveTranslationUiProjections({
      capability_lane_projection_receipts: [
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:docs:ready",
          observation_ref: "obs:docs:ready",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_chunk",
          projection_status: "projected",
          source_id: "docs:nhm2",
          source_hash: "source-hash-1",
          source_text_hash: "source-text-hash-1",
          source_text_char_count: 42,
          chunk_id: "chunk-1",
          chunk_index: 0,
          dedupe_key: "docs:nhm2:chunk-1:es",
          observed_at_ms: 100,
          freshness_status: "fresh",
          target_language: "es",
          translated_text: "Texto listo.",
        },
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:docs:cancelled",
          observation_ref: "obs:docs:cancelled",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_chunk",
          projection_status: "cancelled",
          source_id: "docs:nhm2",
          source_hash: "source-hash-1",
          source_text_hash: "source-text-hash-1",
          source_text_char_count: 42,
          chunk_id: "chunk-1",
          chunk_index: 0,
          dedupe_key: "docs:nhm2:chunk-1:es",
          observed_at_ms: 200,
          freshness_status: "fresh",
          target_language: "es",
          translated_text: null,
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
          source_id: "docs:nhm2",
          source_hash: "source-hash-1",
          source_text_hash: "source-text-hash-1",
          source_text_char_count: 42,
          chunk_id: "chunk-1",
          chunk_index: 0,
          dedupe_key: "docs:nhm2:chunk-1:es",
          observed_at_ms: 300,
          freshness_status: "failed",
          target_language: "es",
          translated_text: null,
        },
      ],
    });

    expect(projections).toHaveLength(1);
    expect(projections[0]).toMatchObject({
      status: "projected",
      translatedText: "Texto listo.",
      observationRef: "obs:docs:ready",
      receiptRef: "receipt:docs:ready",
      observedAtMs: 100,
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("summarizes chunk traffic per source without creating answer authority", () => {
    const projections = buildHelixLiveTranslationUiProjections({
      capability_lane_projection_receipts: [
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:docs:1",
          observation_ref: "obs:docs:1",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_chunk",
          projection_status: "projected",
          source_id: "docs:nhm2",
          source_kind: "docs",
          account_locale: "es-US",
          chunk_id: "chunk-1",
          chunk_index: 0,
          observed_at_ms: 100,
          source_event_ms: 80,
          freshness_status: "fresh",
          target_language: "es",
          translated_text: "uno",
        },
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:docs:2",
          observation_ref: "obs:docs:2",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_chunk",
          projection_status: "stale",
          source_id: "docs:nhm2",
          source_kind: "docs",
          account_locale: "es-US",
          chunk_id: "chunk-2",
          chunk_index: 1,
          observed_at_ms: 200,
          source_event_ms: 180,
          freshness_status: "stale",
          target_language: "es",
          translated_text: "dos",
          stale: true,
        },
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:docs:3",
          observation_ref: "obs:docs:3",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_chunk",
          projection_status: "cancelled",
          source_id: "docs:nhm2",
          source_kind: "docs",
          account_locale: "es-US",
          chunk_id: "chunk-3",
          chunk_index: 2,
          observed_at_ms: 300,
          source_event_ms: 280,
          freshness_status: "fresh",
          target_language: "es",
          cancel_requested: true,
        },
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:docs:4",
          observation_ref: "obs:docs:4",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_chunk",
          projection_status: "failed",
          source_id: "docs:nhm2",
          source_kind: "docs",
          account_locale: "es-US",
          chunk_id: "chunk-4",
          chunk_index: 3,
          observed_at_ms: 400,
          source_event_ms: 380,
          freshness_status: "failed",
          target_language: "es",
        },
      ],
    });

    expect(summarizeHelixLiveTranslationUiProjectionTraffic(projections)).toEqual([
      {
        sourceId: "docs:nhm2",
        sourceKind: "docs",
        accountLocale: "es-US",
        projectionTarget: "docs_chunk",
        targetLanguage: "es",
        chunkCount: 4,
        projectedCount: 1,
        staleCount: 1,
        cancelledCount: 1,
        failedCount: 1,
        latestChunkId: "chunk-4",
        latestChunkIndex: 3,
        latestSourceEventId: null,
        latestObservedAtMs: 400,
        latestSourceEventMs: 380,
        latestFreshnessStatus: "failed",
        latestTerminalAuthorityStatus: "not_terminal_authority",
        latestObservationRef: "obs:docs:4",
        latestReceiptRef: "receipt:docs:4",
        latestLaneSessionId: null,
        latestObservationLaneSessionId: null,
        latestGoalBindingId: null,
        latestEventId: null,
        latestHasObservation: true,
        selectedBackendProvider: null,
        contextRole: "tool_evidence",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    ]);
  });

  it("keeps chunk traffic summaries separated by source hash when present", () => {
    const projections = buildHelixLiveTranslationUiProjections({
      capability_lane_projection_receipts: [
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:docs:old",
          observation_ref: "obs:docs:old",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_chunk",
          projection_status: "projected",
          source_id: "document_markdown:docs/research/nhm2.md",
          source_hash: "fnv1a32:old",
          chunk_id: "u0001",
          observed_at_ms: 100,
          target_language: "es",
          translated_text: "Texto viejo.",
        },
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:docs:new",
          observation_ref: "obs:docs:new",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_chunk",
          projection_status: "projected",
          source_id: "document_markdown:docs/research/nhm2.md",
          source_hash: "fnv1a32:new",
          chunk_id: "u0001",
          observed_at_ms: 200,
          target_language: "es",
          translated_text: "Texto nuevo.",
        },
      ],
    });

    expect(summarizeHelixLiveTranslationUiProjectionTraffic(projections)).toEqual([
      expect.objectContaining({
        sourceId: "document_markdown:docs/research/nhm2.md",
        sourceHash: "fnv1a32:new",
        chunkCount: 1,
        latestObservationRef: "obs:docs:new",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      }),
      expect.objectContaining({
        sourceId: "document_markdown:docs/research/nhm2.md",
        sourceHash: "fnv1a32:old",
        chunkCount: 1,
        latestObservationRef: "obs:docs:old",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      }),
    ]);
  });

  it("keeps chunk traffic summaries separated by account locale and source text identity", () => {
    const projections = buildHelixLiveTranslationUiProjections({
      capability_lane_projection_receipts: [
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:docs:es-us",
          observation_ref: "obs:docs:es-us",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_chunk",
          projection_status: "projected",
          source_id: "document_markdown:docs/research/nhm2.md",
          source_hash: "fnv1a32:doc",
          source_kind: "document_markdown",
          source_text_hash: "sha256:text-us",
          source_text_char_count: 40,
          account_locale: "es-US",
          chunk_id: "u0001",
          observed_at_ms: 100,
          target_language: "es",
          translated_text: "Texto para Estados Unidos.",
        },
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:docs:es-mx",
          observation_ref: "obs:docs:es-mx",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_chunk",
          projection_status: "projected",
          source_id: "document_markdown:docs/research/nhm2.md",
          source_hash: "fnv1a32:doc",
          source_kind: "document_markdown",
          source_text_hash: "sha256:text-mx",
          source_text_char_count: 42,
          account_locale: "es-MX",
          chunk_id: "u0001",
          observed_at_ms: 200,
          target_language: "es",
          translated_text: "Texto para Mexico.",
        },
      ],
    });

    expect(summarizeHelixLiveTranslationUiProjectionTraffic(projections)).toEqual([
      expect.objectContaining({
        sourceId: "document_markdown:docs/research/nhm2.md",
        sourceHash: "fnv1a32:doc",
        sourceKind: "docs",
        latestSourceTextHash: "sha256:text-mx",
        latestSourceTextCharCount: 42,
        accountLocale: "es-MX",
        chunkCount: 1,
        latestObservationRef: "obs:docs:es-mx",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      }),
      expect.objectContaining({
        sourceId: "document_markdown:docs/research/nhm2.md",
        sourceHash: "fnv1a32:doc",
        sourceKind: "docs",
        latestSourceTextHash: "sha256:text-us",
        latestSourceTextCharCount: 40,
        accountLocale: "es-US",
        chunkCount: 1,
        latestObservationRef: "obs:docs:es-us",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      }),
    ]);
  });

  it("uses source event time when deduping same-key projections without observed time", () => {
    const projections = buildHelixLiveTranslationUiProjections({
      capability_lane_projection_receipts: [
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:docs:u1:new-source-event",
          observation_ref: "obs:docs:u1:new-source-event",
          projection_key: "docs:nhm2::source-text::docs_chunk::es-US::u0001::stable-receipt",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_chunk",
          projection_status: "projected",
          source_id: "document_markdown:docs/research/nhm2.md",
          source_hash: "fnv1a32:current",
          source_event_id: "docs:event:same",
          source_event_ms: 500,
          chunk_id: "u0001",
          chunk_index: 0,
          target_language: "es",
          translated_text: "Texto mas reciente.",
          terminal_eligible: false,
          assistant_answer: false,
          raw_content_included: false,
        },
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:docs:u1:old-source-event",
          observation_ref: "obs:docs:u1:old-source-event",
          projection_key: "docs:nhm2::source-text::docs_chunk::es-US::u0001::stable-receipt",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_chunk",
          projection_status: "projected",
          source_id: "document_markdown:docs/research/nhm2.md",
          source_hash: "fnv1a32:current",
          source_event_id: "docs:event:same",
          source_event_ms: 100,
          chunk_id: "u0001",
          chunk_index: 0,
          target_language: "es",
          translated_text: "Texto viejo.",
          terminal_eligible: false,
          assistant_answer: false,
          raw_content_included: false,
        },
      ],
    });

    expect(projections).toHaveLength(1);
    expect(selectHelixLiveTranslationUiProjection({
      projections,
      sourceId: "document_markdown:docs/research/nhm2.md",
      sourceHash: "fnv1a32:current",
      projectionTarget: "docs_chunk",
      targetLanguage: "es",
      chunkId: "u0001",
    })).toMatchObject({
      status: "projected",
      displayText: "Texto mas reciente.",
      observationRef: "obs:docs:u1:new-source-event",
      receiptRef: "receipt:docs:u1:new-source-event",
      projection: expect.objectContaining({
        sourceEventId: "docs:event:same",
        sourceEventMs: 500,
        observedAtMs: null,
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      }),
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("does not satisfy a hash-scoped projection request with un-hashed projection evidence", () => {
    const projections = buildHelixLiveTranslationUiProjections({
      capability_lane_projection_receipts: [
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:docs:unscoped",
          observation_ref: "obs:docs:unscoped",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_chunk",
          projection_status: "projected",
          source_id: "document_markdown:docs/research/nhm2.md",
          chunk_id: "u0001",
          observed_at_ms: 200,
          target_language: "es",
          translated_text: "Texto sin hash.",
        },
      ],
    });

    expect(selectHelixLiveTranslationUiProjection({
      projections,
      sourceId: "document_markdown:docs/research/nhm2.md",
      sourceHash: "fnv1a32:current",
      projectionTarget: "docs_chunk",
      targetLanguage: "es",
      chunkId: "u0001",
    })).toMatchObject({
      status: "missing",
      reason: "translation_projection_source_hash_mismatch",
      projection: null,
      displayText: null,
      observationRef: "obs:docs:unscoped",
      receiptRef: "receipt:docs:unscoped",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(buildHelixLiveTranslationInlineUnitStates({
      projections,
      sourceId: "document_markdown:docs/research/nhm2.md",
      sourceHash: "fnv1a32:current",
      projectionTarget: "docs_chunk",
      targetLanguage: "es",
      units: [{ unit_id: "u0001" }],
    })).toMatchObject({
      u0001: {
        status: "error",
        error: "translation_projection_source_hash_mismatch",
        projectionStatus: "missing",
        sourceId: "document_markdown:docs/research/nhm2.md",
        sourceHash: "fnv1a32:current",
        observationRef: "obs:docs:unscoped",
        receiptRef: "receipt:docs:unscoped",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    });
    expect(selectHelixLiveTranslationUiProjection({
      projections,
      sourceId: "document_markdown:docs/research/nhm2.md",
      projectionTarget: "docs_chunk",
      targetLanguage: "es",
      chunkId: "u0001",
    })).toMatchObject({
      status: "projected",
      displayText: "Texto sin hash.",
    });
  });

  it("does not satisfy a source-text-scoped projection request with stale source text evidence", () => {
    const projections = buildHelixLiveTranslationUiProjections({
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
          source_hash: "fnv1a32:current-doc",
          source_text_hash: "fnv1a32:old-text",
          source_text_char_count: 18,
          chunk_id: "u0001",
          observed_at_ms: 200,
          target_language: "es",
          translated_text: "Texto viejo.",
        },
      ],
    });

    expect(selectHelixLiveTranslationUiProjection({
      projections,
      sourceId: "document_markdown:docs/research/nhm2.md",
      sourceHash: "fnv1a32:current-doc",
      sourceTextHash: "fnv1a32:current-text",
      sourceTextCharCount: 21,
      projectionTarget: "docs_chunk",
      targetLanguage: "es",
      chunkId: "u0001",
    })).toMatchObject({
      status: "missing",
      reason: "translation_projection_source_text_mismatch",
      projection: null,
      displayText: null,
      sourceTextHash: "fnv1a32:current-text",
      sourceTextCharCount: 21,
      observationRef: "obs:docs:old-source-text",
      receiptRef: "receipt:docs:old-source-text",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    expect(selectHelixLiveTranslationUiProjection({
      projections,
      sourceId: "document_markdown:docs/research/nhm2.md",
      sourceHash: "fnv1a32:current-doc",
      sourceTextHash: "fnv1a32:old-text",
      sourceTextCharCount: 18,
      projectionTarget: "docs_chunk",
      targetLanguage: "es",
      chunkId: "u0001",
    })).toMatchObject({
      status: "projected",
      reason: "translation_projection_selected",
      displayText: "Texto viejo.",
      sourceTextHash: "fnv1a32:old-text",
      sourceTextCharCount: 18,
      observationRef: "obs:docs:old-source-text",
      receiptRef: "receipt:docs:old-source-text",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("keeps rejected source-identity evidence inspectable without rendering it inline", () => {
    const staleIdentity =
      "document_markdown:docs/research/nhm2.md::fnv1a32:current-doc::fnv1a32:old-text::18::docs::docs_chunk::es-US::es";
    const currentIdentity =
      "document_markdown:docs/research/nhm2.md::fnv1a32:current-doc::fnv1a32:current-text::21::docs::docs_chunk::es-US::es";
    const projections = buildHelixLiveTranslationUiProjections({
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
          source_hash: "fnv1a32:current-doc",
          source_kind: "docs",
          account_locale: "es-US",
          source_identity_key: staleIdentity,
          chunk_id: "u0001",
          observed_at_ms: 200,
          target_language: "es",
          translated_text: "Texto de identidad vieja.",
          selected_runtime_agent_provider: "codex",
          selected_backend_provider: "live_translation.local_runtime",
          terminal_eligible: false,
          assistant_answer: false,
          raw_content_included: false,
        },
      ],
    });

    expect(selectHelixLiveTranslationUiProjection({
      projections,
      sourceId: "document_markdown:docs/research/nhm2.md",
      sourceHash: "fnv1a32:current-doc",
      sourceIdentityKey: currentIdentity,
      projectionTarget: "docs_chunk",
      targetLanguage: "es",
      chunkId: "u0001",
    })).toMatchObject({
      status: "missing",
      reason: "translation_projection_source_identity_mismatch",
      projection: null,
      displayText: null,
      sourceIdentityKey: currentIdentity,
      latestSourceIdentityKey: staleIdentity,
      sourceKind: "docs",
      accountLocale: "es-US",
      targetLanguage: "es",
      observationRef: "obs:docs:old-identity",
      receiptRef: "receipt:docs:old-identity",
      selectedRuntimeAgentProvider: "codex",
      selectedBackendProvider: "live_translation.local_runtime",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
    const inlineStates = buildHelixLiveTranslationInlineUnitStates({
      projections,
      sourceId: "document_markdown:docs/research/nhm2.md",
      sourceHash: "fnv1a32:current-doc",
      sourceIdentityKey: currentIdentity,
      projectionTarget: "docs_chunk",
      targetLanguage: "es",
      units: [{ unit_id: "u0001" }],
    });
    expect(inlineStates).toMatchObject({
      u0001: {
        status: "error",
        error: "translation_projection_source_identity_mismatch",
        sourceIdentityKey: currentIdentity,
        latestSourceIdentityKey: staleIdentity,
        sourceKind: "docs",
        accountLocale: "es-US",
        targetLanguage: "es",
        observationRef: "obs:docs:old-identity",
        receiptRef: "receipt:docs:old-identity",
        selectedRuntimeAgentProvider: "codex",
        selectedBackendProvider: "live_translation.local_runtime",
        projectionStatus: "missing",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    });
    expect("text" in inlineStates.u0001).toBe(false);
  });

  it("does not satisfy inline embedded-dedupe fallback with stale source text evidence", () => {
    const projections = buildHelixLiveTranslationUiProjections({
      capability_lane_projection_receipts: [
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:docs:embedded-old-source-text",
          observation_ref: "obs:docs:embedded-old-source-text",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_chunk",
          projection_status: "projected",
          source_id: "document_markdown:docs/research/nhm2.md",
          source_hash: "fnv1a32:current-doc",
          source_text_hash: "fnv1a32:old-text",
          source_text_char_count: 18,
          chunk_id: "batch-1",
          chunk_index: 0,
          dedupe_key: "document_markdown:docs/research/nhm2.md:u0001:es",
          observed_at_ms: 200,
          target_language: "es",
          translated_text: "Texto viejo incrustado.",
          selected_runtime_agent_provider: "codex",
          terminal_eligible: false,
          assistant_answer: false,
          raw_content_included: false,
        },
      ],
    });

    expect(buildHelixLiveTranslationInlineUnitStates({
      projections,
      sourceId: "document_markdown:docs/research/nhm2.md",
      sourceHash: "fnv1a32:current-doc",
      sourceTextHash: "fnv1a32:current-text",
      sourceTextCharCount: 21,
      projectionTarget: "docs_chunk",
      targetLanguage: "es",
      units: [{ unit_id: "u0001" }],
    })).toMatchObject({
      u0001: {
        status: "error",
        error: "translation_projection_source_text_mismatch",
        projectionStatus: "missing",
        sourceId: "document_markdown:docs/research/nhm2.md",
        sourceHash: "fnv1a32:current-doc",
        sourceTextHash: "fnv1a32:current-text",
        sourceTextCharCount: 21,
        observationRef: "obs:docs:embedded-old-source-text",
        receiptRef: "receipt:docs:embedded-old-source-text",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    });
    expect(buildHelixLiveTranslationInlineUnitStates({
      projections,
      sourceId: "document_markdown:docs/research/nhm2.md",
      sourceHash: "fnv1a32:current-doc",
      sourceTextHash: "fnv1a32:old-text",
      sourceTextCharCount: 18,
      projectionTarget: "docs_chunk",
      targetLanguage: "es",
      units: [{ unit_id: "u0001" }],
    })).toMatchObject({
      u0001: {
        status: "ready",
        text: "Texto viejo incrustado.",
        chunkId: "batch-1",
        dedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
        sourceTextHash: "fnv1a32:old-text",
        sourceTextCharCount: 18,
        selectedRuntimeAgentProvider: "codex",
        observationRef: "obs:docs:embedded-old-source-text",
        receiptRef: "receipt:docs:embedded-old-source-text",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    });
  });

  it("selects the current account-language projection without granting answer authority", () => {
    const projections = buildHelixLiveTranslationUiProjections({
      capability_lane_projection_receipts: [
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:docs:old",
          observation_ref: "obs:docs:old",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_chunk",
          projection_status: "projected",
          source_id: "docs:nhm2",
          chunk_id: "chunk-1",
          chunk_index: 1,
          dedupe_key: "docs:nhm2:chunk-1:es",
          observed_at_ms: 100,
          target_language: "es",
          translated_text: "texto anterior",
        },
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:docs:new",
          observation_ref: "obs:docs:new",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_chunk",
          projection_status: "projected",
          source_id: "docs:nhm2",
          chunk_id: "chunk-1",
          chunk_index: 1,
          dedupe_key: "docs:nhm2:chunk-1:es",
          observed_at_ms: 200,
          target_language: "es-US",
          translated_text: "texto nuevo",
        },
      ],
    });

    expect(selectHelixLiveTranslationUiProjection({
      projections,
      sourceId: "docs:nhm2",
      projectionTarget: "docs_chunk",
      targetLanguage: "ES",
      chunkId: "chunk-1",
    })).toMatchObject({
      status: "projected",
      reason: "translation_projection_selected",
      displayText: "texto nuevo",
      observationRef: "obs:docs:new",
      receiptRef: "receipt:docs:new",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("selects base-language receipts for regional account locales", () => {
    const projections = buildHelixLiveTranslationUiProjections({
      capability_lane_projection_receipts: [
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:docs:base-language",
          observation_ref: "obs:docs:base-language",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_chunk",
          projection_status: "projected",
          source_id: "docs:nhm2",
          chunk_id: "chunk-1",
          observed_at_ms: 200,
          target_language: "es",
          translated_text: "texto base",
        },
      ],
    });

    expect(selectHelixLiveTranslationUiProjection({
      projections,
      sourceId: "docs:nhm2",
      projectionTarget: "docs_chunk",
      targetLanguage: "es-US",
      chunkId: "chunk-1",
    })).toMatchObject({
      status: "projected",
      displayText: "texto base",
      observationRef: "obs:docs:base-language",
      receiptRef: "receipt:docs:base-language",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("keeps cancelled, stale, and missing UI projection states separate from displayed text", () => {
    const projections = buildHelixLiveTranslationUiProjections({
      capability_lane_projection_receipts: [
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:hover:cancelled",
          observation_ref: "obs:hover:cancelled",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_hover",
          projection_status: "cancelled",
          source_id: "docs:hover",
          chunk_id: "hover-1",
          dedupe_key: "hover-1:fr",
          observed_at_ms: 10,
          target_language: "fr",
          cancel_requested: true,
        },
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:hover:stale",
          observation_ref: "obs:hover:stale",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_hover",
          projection_status: "stale",
          source_id: "docs:hover",
          chunk_id: "hover-2",
          dedupe_key: "hover-2:fr",
          observed_at_ms: 20,
          target_language: "fr",
          translated_text: "ancien",
          stale: true,
        },
      ],
    });

    expect(selectHelixLiveTranslationUiProjection({
      projections,
      sourceId: "docs:hover",
      projectionTarget: "docs_hover",
      targetLanguage: "fr",
      chunkId: "hover-1",
    })).toMatchObject({
      status: "cancelled",
      reason: "translation_projection_cancelled",
      displayText: null,
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
    });

    expect(selectHelixLiveTranslationUiProjection({
      projections,
      sourceId: "docs:hover",
      projectionTarget: "docs_hover",
      targetLanguage: "fr",
      chunkId: "hover-2",
    })).toMatchObject({
      status: "stale",
      reason: "translation_projection_stale",
      displayText: null,
    });

    expect(selectHelixLiveTranslationUiProjection({
      projections,
      sourceId: "docs:hover",
      projectionTarget: "docs_hover",
      targetLanguage: "fr",
      chunkId: "hover-2",
      allowStaleDisplayText: true,
    })).toMatchObject({
      status: "stale",
      reason: "translation_projection_selected",
      displayText: "ancien",
    });

    expect(selectHelixLiveTranslationUiProjection({
      projections,
      sourceId: "docs:missing",
      projectionTarget: "docs_hover",
      targetLanguage: "fr",
    })).toMatchObject({
      status: "missing",
      reason: "translation_projection_missing",
      displayText: null,
      projection: null,
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
    });
  });

  it("maps governed lane projections into document inline unit state without answer authority", () => {
    const projections = buildHelixLiveTranslationUiProjections({
      capability_lane_projection_receipts: [
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:doc:u1",
          observation_ref: "obs:doc:u1",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_chunk",
          projection_status: "projected",
          source_id: "document_markdown:docs/research/nhm2.md",
          chunk_id: "u0001",
          chunk_index: 0,
          dedupe_key: "document_markdown:docs/research/nhm2.md:u0001:es",
          observed_at_ms: 100,
          target_language: "es",
          translated_text: "Primer bloque.",
        },
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:doc:u2",
          observation_ref: "obs:doc:u2",
          lane_id: "live_translation",
          capability: "live_translation.translate_text",
          projection_target: "docs_chunk",
          projection_status: "projected",
          source_id: "document_markdown:docs/research/nhm2.md",
          chunk_id: "batch-1",
          chunk_index: 1,
          dedupe_key: "document_markdown:docs/research/nhm2.md:u0002:es",
          observed_at_ms: 110,
          target_language: "es",
          translated_text: "Segundo bloque.",
        },
      ],
    });

    expect(buildHelixLiveTranslationInlineUnitStates({
      projections,
      sourceId: "document_markdown:docs/research/nhm2.md",
      projectionTarget: "docs_chunk",
      targetLanguage: "es",
      units: [
        { unit_id: "u0001", translatable: true },
        { unit_id: "u0002", translatable: true },
        { unit_id: "u0003", translatable: false },
      ],
    })).toEqual({
      u0001: {
        status: "ready",
        text: "Primer bloque.",
        observationRef: "obs:doc:u1",
        receiptRef: "receipt:doc:u1",
        projectionStatus: "projected",
        ...inlineMeta({
          chunkId: "u0001",
          chunkIndex: 0,
          dedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
          observedAtMs: 100,
          sourceId: "document_markdown:docs/research/nhm2.md",
        }),
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
      u0002: {
        status: "ready",
        text: "Segundo bloque.",
        observationRef: "obs:doc:u2",
        receiptRef: "receipt:doc:u2",
        projectionStatus: "projected",
        ...inlineMeta({
          chunkId: "batch-1",
          chunkIndex: 1,
          dedupeKey: "document_markdown:docs/research/nhm2.md:u0002:es",
          observedAtMs: 110,
          sourceId: "document_markdown:docs/research/nhm2.md",
        }),
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    });
  });

  it("maps stale and cancelled lane projections into non-terminal inline unit errors", () => {
    const projections = buildHelixLiveTranslationUiProjections({
      capability_lane_projection_receipts: [
        {
          schema: "helix.live_translation.projection_receipt.v1",
          receipt_ref: "receipt:doc:stale",
          observation_ref: "obs:doc:stale",
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
          receipt_ref: "receipt:doc:cancelled",
          observation_ref: "obs:doc:cancelled",
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
      ],
    });

    expect(buildHelixLiveTranslationInlineUnitStates({
      projections,
      sourceId: "document_markdown:docs/research/nhm2.md",
      projectionTarget: "docs_chunk",
      targetLanguage: "fr",
      units: [
        { unit_id: "u0001", translatable: true },
        { unit_id: "u0002", translatable: true },
      ],
    })).toEqual({
      u0001: {
        status: "error",
        error: "translation_projection_stale",
        observationRef: "obs:doc:stale",
        receiptRef: "receipt:doc:stale",
        projectionStatus: "stale",
        ...inlineMeta({
          chunkId: "u0001",
          observedAtMs: 100,
          sourceId: "document_markdown:docs/research/nhm2.md",
          targetLanguage: "fr",
        }),
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
      u0002: {
        status: "error",
        error: "translation_projection_cancelled",
        observationRef: "obs:doc:cancelled",
        receiptRef: "receipt:doc:cancelled",
        projectionStatus: "cancelled",
        ...inlineMeta({
          chunkId: "u0002",
          observedAtMs: 110,
          sourceId: "document_markdown:docs/research/nhm2.md",
          targetLanguage: "fr",
          cancelRequested: true,
        }),
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      },
    });
  });
});
