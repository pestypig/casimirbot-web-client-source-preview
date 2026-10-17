import { describe, expect, it } from "vitest";
import {
  buildHelixAccountLanguageTranslationDataAttributes,
  buildHelixAccountLanguageTranslationProjections,
  clearHelixAccountLanguageTranslationProjectionContext,
  publishHelixAccountLanguageTranslationProjectionsFromPayload,
  readHelixAccountLanguageTranslationProjectionContext,
  selectHelixAccountLanguageTranslationProjection,
  subscribeHelixAccountLanguageTranslationProjectionContext,
} from "@/lib/helix/account-language-translation-projection";

const accountLanguageReceipt = (overrides: Record<string, unknown> = {}) => ({
  schema: "helix.live_translation.projection_receipt.v1",
  receipt_ref: "receipt:account-language:button",
  observation_ref: "obs:account-language:button",
  selected_runtime_agent_provider: "codex",
  selected_backend_provider: "live_translation.local_runtime",
  lane_id: "live_translation",
  capability: "live_translation.translate_text",
  projection_key: "account-language:docs-viewer:translate-button:es",
  projection_target: "account_language",
  projection_status: "projected",
  source_id: "workstation-shell#docs-viewer:translate-button",
  panel_id: "docs-viewer",
  region_id: "docs-viewer:translate-button",
  bbox: { x: 12, y: 24, width: 160, height: 32, source: "account-language-region" },
  doc_path: "docs/research/current.md",
  source_hash: "fnv1a32:button",
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
  ...overrides,
});

describe("Helix account-language translation projection", () => {
  it("builds non-authoritative UI-region projection state from account-language receipts", () => {
    const states = buildHelixAccountLanguageTranslationProjections({
      capability_lane_projection_receipts: [accountLanguageReceipt()],
    });

    expect(states).toEqual([
      expect.objectContaining({
        key: "account-language:docs-viewer:translate-button:es",
        status: "ready",
        displayText: "Traducir",
        projectionTarget: "account_language",
        panelId: "docs-viewer",
        regionId: "docs-viewer:translate-button",
        bbox: { x: 12, y: 24, width: 160, height: 32, source: "account-language-region" },
        docPath: "docs/research/current.md",
        sourceId: "workstation-shell#docs-viewer:translate-button",
        sourceKind: "button_label",
        sourceTextHash: "sha256:translate-button",
        sourceTextCharCount: 9,
        accountLocale: "es-US",
        targetLanguage: "es",
        chunkId: "docs-viewer:translate-button",
        chunkIndex: 2,
        sourceEventId: "ui-region:event-1",
        sourceEventMs: 100,
        observedAtMs: 150,
        observationRef: "obs:account-language:button",
        receiptRef: "receipt:account-language:button",
        selectedRuntimeAgentProvider: "codex",
        selectedBackendProvider: "live_translation.local_runtime",
        terminalAuthorityStatus: "not_terminal_authority",
        contextRole: "tool_evidence",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      }),
    ]);
  });

  it("emits DOM/debug attributes that mark account-language projection as non-authoritative", () => {
    const [state] = buildHelixAccountLanguageTranslationProjections({
      capability_lane_projection_receipts: [accountLanguageReceipt()],
    });

    expect(buildHelixAccountLanguageTranslationDataAttributes(state)).toMatchObject({
      "data-helix-account-language-translation-role": "governed-ui-region-projection",
      "data-helix-account-language-translation-authority-policy": "projection_only_not_answer_authority",
      "data-helix-account-language-translation-terminal-authority-owner": "helix",
      "data-helix-account-language-translation-status": "ready",
      "data-helix-account-language-translation-projection-target": "account_language",
      "data-helix-account-language-translation-panel-id": "docs-viewer",
      "data-helix-account-language-translation-region-id": "docs-viewer:translate-button",
      "data-helix-account-language-translation-bbox":
        '{"x":12,"y":24,"width":160,"height":32,"source":"account-language-region"}',
      "data-helix-account-language-translation-source-kind": "button_label",
      "data-helix-account-language-translation-account-locale": "es-US",
      "data-helix-account-language-translation-target-language": "es",
      "data-helix-account-language-translation-observation-ref": "obs:account-language:button",
      "data-helix-account-language-translation-receipt-ref": "receipt:account-language:button",
      "data-helix-account-language-translation-selected-runtime-agent-provider": "codex",
      "data-helix-account-language-translation-selected-backend-provider": "live_translation.local_runtime",
      "data-helix-account-language-translation-terminal-authority-status": "not_terminal_authority",
      "data-helix-account-language-translation-context-role": "tool_evidence",
      "data-helix-account-language-translation-answer-authority": "false",
      "data-helix-account-language-translation-terminal-eligible": "false",
      "data-helix-account-language-translation-assistant-answer": "false",
      "data-helix-account-language-translation-raw-content-included": "false",
      "data-helix-account-language-translation-reentry-required": "true",
      "data-helix-account-language-translation-source-event-id": "ui-region:event-1",
      "data-helix-account-language-translation-source-event-ms": "100",
      "data-helix-account-language-translation-observed-at-ms": "150",
    });
  });

  it("filters out document chunk projections so docs rendering remains owned by the docs registry", () => {
    const states = buildHelixAccountLanguageTranslationProjections({
      capability_lane_projection_receipts: [
        accountLanguageReceipt(),
        accountLanguageReceipt({
          receipt_ref: "receipt:docs:chunk",
          observation_ref: "obs:docs:chunk",
          projection_target: "docs_chunk",
          source_id: "document_markdown:docs/research/current.md",
          panel_id: "docs-viewer",
          region_id: null,
          source_kind: "docs",
          chunk_id: "u0001",
          translated_text: "Documento",
        }),
      ],
    });

    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({
      projection: expect.objectContaining({
        projectionTarget: "account_language",
      }),
      displayText: "Traducir",
    });
  });

  it("keeps stale, failed, and terminal-rejected states inspectable without display authority", () => {
    const states = buildHelixAccountLanguageTranslationProjections({
      capability_lane_projection_receipts: [
        accountLanguageReceipt({
          receipt_ref: "receipt:account-language:stale",
          observation_ref: "obs:account-language:stale",
          projection_status: "stale",
          translated_text: "Viejo",
          stale: true,
          observed_at_ms: 250,
          region_id: "docs-viewer:stale-label",
        }),
        accountLanguageReceipt({
          receipt_ref: "receipt:account-language:failed",
          observation_ref: "obs:account-language:failed",
          projection_status: "failed",
          translated_text: null,
          observed_at_ms: 260,
          region_id: "docs-viewer:failed-label",
        }),
        accountLanguageReceipt({
          receipt_ref: "receipt:account-language:blocked",
          observation_ref: "obs:account-language:blocked",
          terminal_authority_status: "terminal_authority_rejected",
          translated_text: "Bloqueado",
          observed_at_ms: 270,
          region_id: "docs-viewer:blocked-label",
        }),
      ],
    });

    expect(states).toEqual([
      expect.objectContaining({
        status: "blocked",
        displayText: null,
        regionId: "docs-viewer:blocked-label",
        terminalAuthorityStatus: "terminal_authority_rejected",
        answerAuthority: false,
        terminalEligible: false,
      }),
      expect.objectContaining({
        status: "failed",
        displayText: null,
        regionId: "docs-viewer:failed-label",
        answerAuthority: false,
        terminalEligible: false,
      }),
      expect.objectContaining({
        status: "stale",
        displayText: null,
        regionId: "docs-viewer:stale-label",
        answerAuthority: false,
        terminalEligible: false,
      }),
    ]);
  });

  it("derives active and pending health states from lane session metadata", () => {
    const states = buildHelixAccountLanguageTranslationProjections({
      capability_lane_projection_receipts: [
        accountLanguageReceipt({
          receipt_ref: "receipt:account-language:pending",
          observation_ref: "obs:account-language:pending",
          projection_status: "projected",
          translated_text: null,
          terminal_authority_status: "pending_helix_terminal_authority",
          observed_at_ms: 280,
          region_id: "docs-viewer:pending-label",
        }),
        accountLanguageReceipt({
          receipt_ref: "receipt:account-language:active",
          observation_ref: "obs:account-language:active",
          projection_status: "projected",
          translated_text: null,
          lane_session_id: "lane-session-account-language",
          session_debug_phase: "running:translate_visible_region",
          session_observation_status: "observation_recorded",
          terminal_authority_status: "not_terminal_authority",
          observed_at_ms: 290,
          region_id: "docs-viewer:active-label",
        }),
      ],
    });

    expect(states).toEqual([
      expect.objectContaining({
        status: "active",
        displayText: null,
        regionId: "docs-viewer:active-label",
        laneSessionId: "lane-session-account-language",
        terminalAuthorityStatus: "not_terminal_authority",
        answerAuthority: false,
        terminalEligible: false,
      }),
      expect.objectContaining({
        status: "pending",
        displayText: null,
        regionId: "docs-viewer:pending-label",
        terminalAuthorityStatus: "pending_helix_terminal_authority",
        answerAuthority: false,
        terminalEligible: false,
      }),
    ]);
  });

  it("selects the latest matching UI-region projection and returns an empty state for misses", () => {
    const states = buildHelixAccountLanguageTranslationProjections({
      capability_lane_projection_receipts: [
        accountLanguageReceipt({
          receipt_ref: "receipt:account-language:old",
          observation_ref: "obs:account-language:old",
          translated_text: "Antiguo",
          observed_at_ms: 100,
        }),
        accountLanguageReceipt({
          receipt_ref: "receipt:account-language:new",
          observation_ref: "obs:account-language:new",
          translated_text: "Nuevo",
          observed_at_ms: 300,
        }),
      ],
    });

    expect(selectHelixAccountLanguageTranslationProjection({
      states,
      panelId: "docs-viewer",
      regionId: "docs-viewer:translate-button",
      accountLocale: "es",
    })).toMatchObject({
      status: "ready",
      displayText: "Nuevo",
      observationRef: "obs:account-language:new",
      receiptRef: "receipt:account-language:new",
      answerAuthority: false,
      terminalEligible: false,
    });

    expect(selectHelixAccountLanguageTranslationProjection({
      states,
      panelId: "docs-viewer",
      regionId: "docs-viewer:missing",
      targetLanguage: "es",
    })).toMatchObject({
      status: "empty",
      displayText: null,
      projection: null,
      projectionTarget: "account_language",
      panelId: "docs-viewer",
      regionId: "docs-viewer:missing",
      terminalAuthorityStatus: "not_terminal_authority",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("does not let newer non-displayable region receipts hide the latest ready account-language text", () => {
    const states = buildHelixAccountLanguageTranslationProjections({
      capability_lane_projection_receipts: [
        accountLanguageReceipt({
          projection_key: "account-language:docs-viewer:translate-button:es:ready",
          receipt_ref: "receipt:account-language:ready",
          observation_ref: "obs:account-language:ready",
          translated_text: "Traducir",
          observed_at_ms: 300,
        }),
        accountLanguageReceipt({
          projection_key: "account-language:docs-viewer:translate-button:es:failed",
          receipt_ref: "receipt:account-language:failed-newer",
          observation_ref: "obs:account-language:failed-newer",
          projection_status: "failed",
          translated_text: null,
          observed_at_ms: 500,
        }),
        accountLanguageReceipt({
          projection_key: "account-language:docs-viewer:translate-button:es:cancelled",
          receipt_ref: "receipt:account-language:cancelled-newer",
          observation_ref: "obs:account-language:cancelled-newer",
          projection_status: "cancelled",
          translated_text: null,
          observed_at_ms: 600,
        }),
      ],
    });

    expect(selectHelixAccountLanguageTranslationProjection({
      states,
      panelId: "docs-viewer",
      regionId: "docs-viewer:translate-button",
      docPath: "docs/research/current.md",
      sourceId: "workstation-shell#docs-viewer:translate-button",
      targetLanguage: "es",
    })).toMatchObject({
      status: "ready",
      displayText: "Traducir",
      observationRef: "obs:account-language:ready",
      receiptRef: "receipt:account-language:ready",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });
  });

  it("keeps newer source-event account-language text when an older source event is observed later", () => {
    const states = buildHelixAccountLanguageTranslationProjections({
      capability_lane_projection_receipts: [
        accountLanguageReceipt({
          projection_key: "account-language:docs-viewer:translate-button:es:new-source",
          receipt_ref: "receipt:account-language:new-source",
          observation_ref: "obs:account-language:new-source",
          translated_text: "Traducir ahora",
          source_event_id: "ui-region:event-new",
          source_event_ms: 300,
          observed_at_ms: 350,
        }),
        accountLanguageReceipt({
          projection_key: "account-language:docs-viewer:translate-button:es:old-source-late",
          receipt_ref: "receipt:account-language:old-source-late",
          observation_ref: "obs:account-language:old-source-late",
          translated_text: "Traduccion anterior",
          source_event_id: "ui-region:event-old",
          source_event_ms: 200,
          observed_at_ms: 500,
        }),
      ],
    });

    expect(selectHelixAccountLanguageTranslationProjection({
      states,
      panelId: "docs-viewer",
      regionId: "docs-viewer:translate-button",
      docPath: "docs/research/current.md",
      sourceId: "workstation-shell#docs-viewer:translate-button",
      targetLanguage: "es",
    })).toMatchObject({
      status: "ready",
      displayText: "Traducir ahora",
      sourceEventId: "ui-region:event-new",
      sourceEventMs: 300,
      observedAtMs: 350,
      observationRef: "obs:account-language:new-source",
      receiptRef: "receipt:account-language:new-source",
      answerAuthority: false,
      terminalEligible: false,
    });
  });

  it("does not select account-language UI projections from a different active document", () => {
    const states = buildHelixAccountLanguageTranslationProjections({
      capability_lane_projection_receipts: [
        accountLanguageReceipt({
          projection_key: "account-language:docs-viewer:title:old-doc:es",
          receipt_ref: "receipt:account-language:old-title",
          observation_ref: "obs:account-language:old-title",
          region_id: "docs-viewer:title",
          source_id: "workstation-shell#docs-viewer:title",
          doc_path: "docs/research/old.md",
          translated_text: "Titulo anterior",
          observed_at_ms: 400,
        }),
      ],
    });

    expect(selectHelixAccountLanguageTranslationProjection({
      states,
      panelId: "docs-viewer",
      regionId: "docs-viewer:title",
      docPath: "docs/research/current.md",
      sourceId: "workstation-shell#docs-viewer:title",
      targetLanguage: "es",
    })).toMatchObject({
      status: "empty",
      displayText: null,
      docPath: "docs/research/current.md",
      sourceId: "workstation-shell#docs-viewer:title",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    });

    expect(selectHelixAccountLanguageTranslationProjection({
      states,
      panelId: "docs-viewer",
      regionId: "docs-viewer:title",
      docPath: "docs/research/old.md",
      sourceId: "workstation-shell#docs-viewer:title",
      targetLanguage: "es",
    })).toMatchObject({
      status: "ready",
      displayText: "Titulo anterior",
      docPath: "docs/research/old.md",
      observationRef: "obs:account-language:old-title",
      receiptRef: "receipt:account-language:old-title",
      answerAuthority: false,
      terminalEligible: false,
    });
  });

  it("publishes account-language UI-region projection context for later Ask turns", () => {
    clearHelixAccountLanguageTranslationProjectionContext();
    expect(readHelixAccountLanguageTranslationProjectionContext()).toEqual([]);

    const published = publishHelixAccountLanguageTranslationProjectionsFromPayload({
      debug: {
        capability_lane_projection_receipts: [accountLanguageReceipt()],
      },
    });

    expect(published).toHaveLength(1);
    expect(readHelixAccountLanguageTranslationProjectionContext()).toEqual([
      expect.objectContaining({
        status: "ready",
        displayText: "Traducir",
        panelId: "docs-viewer",
        regionId: "docs-viewer:translate-button",
        observationRef: "obs:account-language:button",
        receiptRef: "receipt:account-language:button",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      }),
    ]);

    expect(publishHelixAccountLanguageTranslationProjectionsFromPayload({
      capability_lane_projection_receipts: [
        accountLanguageReceipt({
          projection_target: "docs_chunk",
          translated_text: "Documento",
        }),
      ],
    })).toEqual([]);
    expect(readHelixAccountLanguageTranslationProjectionContext()).toHaveLength(1);

    clearHelixAccountLanguageTranslationProjectionContext();
    expect(readHelixAccountLanguageTranslationProjectionContext()).toEqual([]);
  });

  it("publishes account-language projections from nested runtime debug export payloads", () => {
    clearHelixAccountLanguageTranslationProjectionContext();

    const published = publishHelixAccountLanguageTranslationProjectionsFromPayload({
      debug: {
        debug_export: {
          capability_lane_projection_receipts: [
            accountLanguageReceipt({
              receipt_ref: "receipt:account-language:nested-title",
              observation_ref: "obs:account-language:nested-title",
              projection_key: "account-language:docs-viewer:title:es",
              region_id: "docs-viewer:title",
              source_id: "workstation-shell#docs-viewer:title",
              translated_text: "Titulo",
              source_event_ms: 450,
              observed_at_ms: 475,
            }),
          ],
        },
      },
    });

    expect(published).toEqual([
      expect.objectContaining({
        status: "ready",
        displayText: "Titulo",
        regionId: "docs-viewer:title",
        sourceId: "workstation-shell#docs-viewer:title",
        sourceEventMs: 450,
        observedAtMs: 475,
        observationRef: "obs:account-language:nested-title",
        receiptRef: "receipt:account-language:nested-title",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      }),
    ]);
    expect(readHelixAccountLanguageTranslationProjectionContext()).toEqual(published);

    clearHelixAccountLanguageTranslationProjectionContext();
  });

  it("merges partial account-language projection receipts without erasing other visible regions", () => {
    clearHelixAccountLanguageTranslationProjectionContext();

    publishHelixAccountLanguageTranslationProjectionsFromPayload({
      capability_lane_projection_receipts: [accountLanguageReceipt({
        projection_key: "account-language:docs-viewer:title:es",
        receipt_ref: "receipt:account-language:title",
        observation_ref: "obs:account-language:title",
        region_id: "docs-viewer:title",
        source_id: "workstation-shell#docs-viewer:title",
        translated_text: "Titulo",
        observed_at_ms: 200,
      })],
    });
    publishHelixAccountLanguageTranslationProjectionsFromPayload({
      capability_lane_projection_receipts: [accountLanguageReceipt({
        projection_key: "account-language:docs-viewer:translate-button:es",
        receipt_ref: "receipt:account-language:button",
        observation_ref: "obs:account-language:button",
        region_id: "docs-viewer:translate-button",
        source_id: "workstation-shell#docs-viewer:translate-button",
        translated_text: "Traducir",
        observed_at_ms: 300,
      })],
    });

    expect(readHelixAccountLanguageTranslationProjectionContext()).toEqual([
      expect.objectContaining({
        regionId: "docs-viewer:title",
        displayText: "Titulo",
        receiptRef: "receipt:account-language:title",
        answerAuthority: false,
        terminalEligible: false,
      }),
      expect.objectContaining({
        regionId: "docs-viewer:translate-button",
        displayText: "Traducir",
        receiptRef: "receipt:account-language:button",
        answerAuthority: false,
        terminalEligible: false,
      }),
    ]);

    publishHelixAccountLanguageTranslationProjectionsFromPayload({
      capability_lane_projection_receipts: [accountLanguageReceipt({
        projection_key: "account-language:docs-viewer:title:es",
        receipt_ref: "receipt:account-language:title",
        observation_ref: "obs:account-language:title-updated",
        region_id: "docs-viewer:title",
        source_id: "workstation-shell#docs-viewer:title",
        translated_text: "Titulo actualizado",
        observed_at_ms: 400,
      })],
    });

    expect(readHelixAccountLanguageTranslationProjectionContext()).toEqual([
      expect.objectContaining({
        regionId: "docs-viewer:title",
        displayText: "Titulo actualizado",
        observationRef: "obs:account-language:title-updated",
        receiptRef: "receipt:account-language:title",
      }),
      expect.objectContaining({
        regionId: "docs-viewer:translate-button",
        displayText: "Traducir",
        receiptRef: "receipt:account-language:button",
      }),
    ]);

    clearHelixAccountLanguageTranslationProjectionContext();
  });

  it("notifies subscribers when account-language projection context changes", () => {
    clearHelixAccountLanguageTranslationProjectionContext();
    const notifications: number[] = [];
    const unsubscribe = subscribeHelixAccountLanguageTranslationProjectionContext(() => {
      notifications.push(readHelixAccountLanguageTranslationProjectionContext().length);
    });

    publishHelixAccountLanguageTranslationProjectionsFromPayload({
      capability_lane_projection_receipts: [accountLanguageReceipt()],
    });
    clearHelixAccountLanguageTranslationProjectionContext();
    unsubscribe();
    publishHelixAccountLanguageTranslationProjectionsFromPayload({
      capability_lane_projection_receipts: [accountLanguageReceipt()],
    });

    expect(notifications).toEqual([1, 0]);
    clearHelixAccountLanguageTranslationProjectionContext();
  });
});
