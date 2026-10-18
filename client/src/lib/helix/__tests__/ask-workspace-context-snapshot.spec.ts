import { describe, expect, it } from "vitest";
import { hashDocumentSource, segmentMarkdownForTranslation } from "@shared/document-translation";
import { researchLibraryDocViewerPath } from "@shared/helix-research-library";
import { buildActiveDocVisibleTranslationContext } from "@/lib/docs/visibleTranslationContext";

import {
  buildAskTurnWorkspaceContextSnapshotFromState,
  buildWorkstationLayoutDebugSnapshotFromState,
} from "../ask-workspace-context-snapshot";

describe("ask workspace context snapshot helpers", () => {
  it("attaches current Theory Badge Graph state as ambient, non-terminal context", () => {
    const theoryContext = {
      schema: "helix.theory_badge_graph_current_context.v1",
      graph_id: "helix-theory-badge-graph/v1",
      selected_badge_ids: ["element.h.origin", "physics.quantum.energy_frequency"],
      combination_reader: {
        intermediateBadges: [{ id: "physics.atomic.transition_gap_frequency_context" }],
        availableNextBadges: [{ id: "physics.radiation.mode_context" }],
      },
    };
    const snapshot = buildAskTurnWorkspaceContextSnapshotFromState({
      layoutState: {
        activeGroupId: "main",
        groups: {
          main: {
            activePanelId: "theory-badge-graph",
            panelIds: ["theory-badge-graph", "scientific-calculator"],
          },
        },
      },
      notesState: {},
      calculatorState: {},
      theoryBadgeGraphContext: theoryContext,
      docContext: { path: null, source: "none" },
      lastUpdatedAtMs: 123,
    });

    expect(snapshot).toMatchObject({
      activePanel: "theory-badge-graph",
      hasTheoryBadgeGraphContext: true,
      has_theory_badge_graph_context: true,
      activeTheoryBadgeGraphContext: {
        ...theoryContext,
        panel_id: "theory-badge-graph",
        active_panel: true,
        panel_open: true,
        context_role: "ambient_context",
        output_role: "ambient_context",
        observation_required: true,
        answer_authority: false,
        terminal_eligible: false,
        post_tool_model_step_required: true,
        assistant_answer: false,
        raw_content_included: false,
      },
      active_theory_badge_graph_context: expect.objectContaining({
        selected_badge_ids: ["element.h.origin", "physics.quantum.energy_frequency"],
        active_panel: true,
        panel_open: true,
        answer_authority: false,
        terminal_eligible: false,
      }),
    });
  });

  it("builds a deterministic workstation layout debug snapshot from supplied state", () => {
    expect(buildWorkstationLayoutDebugSnapshotFromState({
      mode: "desktop",
      activeGroupId: "group-b",
      groups: {
        "group-b": { panelIds: ["scientific-calculator", "docs-viewer"] },
        "group-a": { panelIds: ["stage-play-badge-graph", "docs-viewer", ""] },
      },
      chatDock: {
        collapsed: false,
        widthPx: 420,
        side: "right",
      },
      mobileDrawer: {
        open: true,
        snap: "full",
      },
    })).toEqual({
      mode: "desktop",
      activeGroupId: "group-b",
      groupCount: 2,
      openPanels: ["docs-viewer", "scientific-calculator", "stage-play-badge-graph"],
      chatDock: {
        collapsed: false,
        widthPx: 420,
        side: "right",
      },
      mobileDrawer: {
        open: true,
        snap: "full",
      },
    });
  });

  it("handles missing optional layout fields without reading UI stores", () => {
    expect(buildWorkstationLayoutDebugSnapshotFromState({
      groups: {
        empty: { panelIds: null },
      },
    })).toEqual({
      mode: undefined,
      activeGroupId: undefined,
      groupCount: 1,
      openPanels: [],
      chatDock: {
        collapsed: undefined,
        widthPx: undefined,
        side: undefined,
      },
      mobileDrawer: {
        open: undefined,
        snap: undefined,
      },
    });
  });

  it("builds deterministic Ask turn workspace context from supplied state snapshots", () => {
    const longNoteBody = ` ${"note-body ".repeat(1400)} `;
    const snapshot = buildAskTurnWorkspaceContextSnapshotFromState({
      sessionId: "session-1",
      layoutState: {
        activeGroupId: "group-a",
        groups: {
          "group-a": {
            activePanelId: "scientific-calculator",
            panelIds: ["scientific-calculator", "workstation-notes", "docs-viewer"],
          },
          "group-b": {
            activePanelId: "workstation-clipboard-history",
            panelIds: ["workstation-clipboard-history", "docs-viewer"],
          },
        },
      },
      notesState: {
        active_note_id: "note-active",
        order: ["note-new", "note-active", "note-empty"],
        notes: {
          "note-active": { id: "note-active", title: "Active", body: longNoteBody },
          "note-new": { id: "note-new", title: "Newest", body: " newest body " },
          "note-empty": { id: "note-empty", title: "", body: "ignored" },
        },
      },
      calculatorState: {
        currentLatex: " 8*9 ",
        lastSolve: {
          result_text: " 72 ",
          normalized_expression: " 8*9 ",
          trace: { traceId: " trace-123 " },
          ok: true,
        },
        lastCalculatorReceipt: {
          schema: "helix.scientific_calculator_receipt.v1",
          receipt_id: "receipt:calculator:72",
          status: "solved",
          expression: "8*9",
          latex: "8*9",
          variables: [],
          assumptions: [],
          source_refs: ["trace-123"],
          context_keys: ["ask:turn:turn-72"],
          dimensional_check_status: "not_applicable",
          result_value: "72",
          result_unit: null,
          result_text: "72",
          provenance_refs: ["calculator_trace:trace-123"],
          missing_bindings: [],
          blockers: [],
          claim_boundary: "diagnostic only",
          created_at: "2026-07-08T00:00:00.000Z",
          updated_at: "2026-07-08T00:00:00.000Z",
        },
        calculatorReceipts: [{
          schema: "helix.scientific_calculator_receipt.v1",
          receipt_id: "receipt:calculator:72",
          status: "solved",
          expression: "8*9",
          variables: [],
          assumptions: [],
          source_refs: ["trace-123"],
          context_keys: ["ask:turn:turn-72"],
          dimensional_check_status: "not_applicable",
          provenance_refs: ["calculator_trace:trace-123"],
          missing_bindings: [],
          blockers: [],
          claim_boundary: "diagnostic only",
          created_at: "2026-07-08T00:00:00.000Z",
          updated_at: "2026-07-08T00:00:00.000Z",
        }],
        calculatorReceiptIdsByContextKey: {
          "ask:turn:turn-72": "receipt:calculator:72",
        },
        steps: [{ id: 1 }, { id: 2 }],
        debugEvents: [
          {
            action_id: "solve_expression",
            ok: true,
            input_latex: " 8*9 ",
            result_text: " 72 ",
            normalized_expression: " 8*9 ",
            message: " solved ",
            ts: 11,
          },
        ],
      },
      docContext: {
        path: "docs/research/current-whitepaper.md",
        source: "desktop_url",
      },
      activeDocVisibleTranslationContext: {
        schema: "helix.ask.active_doc_visible_translation_context.v1",
        doc_path: "docs/research/current-whitepaper.md",
        chunk_count: 1,
        chunks: [{
          chunk_id: "u0001",
          panelId: "docs-viewer",
          sourceId: "document_markdown:docs/research/current-whitepaper.md#u0001",
          sourceTextHash: "sha256:current-heading",
          sourceTextCharCount: 20,
          projectionTarget: "docs_chunk",
          targetLanguage: "es",
          sourceEventId: "docs:visible:event-1",
          sourceEventMs: 90,
          observedAtMs: 95,
          visible_text: "# Current whitepaper",
          freshnessStatus: "fresh",
          assistant_answer: false,
          terminal_eligible: false,
          answer_authority: false,
          reentry_required: true,
        }],
      },
      accountLanguageTranslationProjections: [
        {
          key: "account-language:docs-viewer:translate-button:es",
          status: "ready",
          displayText: "Traducir",
          panelId: "docs-viewer",
          regionId: "docs-viewer:translate-button",
          sourceId: "workstation-shell#docs-viewer:translate-button",
          sourceTextHash: "sha256:translate-button",
          sourceTextCharCount: 9,
          projectionTarget: "account_language",
          accountLocale: "es-US",
          targetLanguage: "es",
          chunkId: "docs-viewer:translate-button",
          chunkIndex: 2,
          sourceEventId: "ui-region:event-1",
          sourceEventMs: 100,
          observedAtMs: 150,
          freshnessStatus: "fresh",
          observationRef: "obs:account-language:button",
          receiptRef: "receipt:account-language:button",
          contextRole: "tool_evidence",
          answerAuthority: false,
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
      ],
      visibleTranslationProjections: [
        {
          key: "docs-hover:current:es",
          status: "projected",
          displayText: "Oracion enfocada",
          projectionTarget: "docs_hover",
          sourceId: "document_markdown:docs/research/current-whitepaper.md#docs-viewer:hover:u0002",
          panelId: "docs-viewer",
          regionId: "docs-viewer:hover:u0002",
          docPath: "docs/research/current-whitepaper.md",
          sourceKind: "hover_region",
          sourceTextHash: "sha256:hover-source",
          sourceTextCharCount: 17,
          targetLanguage: "es",
          chunkId: "u0002",
          chunkIndex: 1,
          sourceEventId: "docs:hover:event-1",
          sourceEventMs: 120,
          observedAtMs: 160,
          freshnessStatus: "fresh",
          observationRef: "obs:docs:hover",
          receiptRef: "receipt:docs:hover",
          contextRole: "tool_evidence",
          answerAuthority: false,
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
      ],
      situationRoomContext: { job: "active" },
      situationCaptureContext: { capture: "visible" },
      lastUpdatedAtMs: 1234,
    });

    expect(snapshot).toMatchObject({
      sessionId: "session-1",
      activePanel: "scientific-calculator",
      activeGroupId: "group-a",
      groupCount: 2,
      openPanels: [
        "docs-viewer",
        "scientific-calculator",
        "workstation-clipboard-history",
        "workstation-notes",
      ],
      hasCalculatorContext: true,
      active_panel: "scientific-calculator",
      activeDocPath: "docs/research/current-whitepaper.md",
      active_doc_path: "docs/research/current-whitepaper.md",
      source: "desktop_url",
      hasDocContext: true,
      has_doc_context: true,
      docContextValid: true,
      doc_context_valid: true,
      docContextPath: "docs/research/current-whitepaper.md",
      doc_context_path: "docs/research/current-whitepaper.md",
      docContextSource: "desktop_url",
      doc_context_source: "desktop_url",
      activeDocVisibleTranslationContext: {
        schema: "helix.ask.active_doc_visible_translation_context.v1",
        doc_path: "docs/research/current-whitepaper.md",
        chunk_count: 1,
        chunks: [{
          chunk_id: "u0001",
          chunkId: "u0001",
          panelId: "docs-viewer",
          panel_id: "docs-viewer",
          sourceId: "document_markdown:docs/research/current-whitepaper.md#u0001",
          source_id: "document_markdown:docs/research/current-whitepaper.md#u0001",
          sourceTextHash: "sha256:current-heading",
          source_text_hash: "sha256:current-heading",
          sourceTextCharCount: 20,
          source_text_char_count: 20,
          projectionTarget: "docs_chunk",
          projection_target: "docs_chunk",
          targetLanguage: "es",
          target_language: "es",
          sourceEventId: "docs:visible:event-1",
          source_event_id: "docs:visible:event-1",
          sourceEventMs: 90,
          source_event_ms: 90,
          observedAtMs: 95,
          observed_at_ms: 95,
          visible_text: "# Current whitepaper",
          visibleText: "# Current whitepaper",
          freshnessStatus: "fresh",
          freshness_status: "fresh",
          assistant_answer: false,
          terminal_eligible: false,
          answer_authority: false,
          reentry_required: true,
        }],
      },
      active_doc_visible_translation_context: {
        schema: "helix.ask.active_doc_visible_translation_context.v1",
        doc_path: "docs/research/current-whitepaper.md",
        chunk_count: 1,
        chunks: [{
          chunk_id: "u0001",
          chunkId: "u0001",
          panelId: "docs-viewer",
          panel_id: "docs-viewer",
          sourceId: "document_markdown:docs/research/current-whitepaper.md#u0001",
          source_id: "document_markdown:docs/research/current-whitepaper.md#u0001",
          sourceTextHash: "sha256:current-heading",
          source_text_hash: "sha256:current-heading",
          sourceTextCharCount: 20,
          source_text_char_count: 20,
          projectionTarget: "docs_chunk",
          projection_target: "docs_chunk",
          targetLanguage: "es",
          target_language: "es",
          sourceEventId: "docs:visible:event-1",
          source_event_id: "docs:visible:event-1",
          sourceEventMs: 90,
          source_event_ms: 90,
          observedAtMs: 95,
          observed_at_ms: 95,
          visible_text: "# Current whitepaper",
          visibleText: "# Current whitepaper",
          freshnessStatus: "fresh",
          freshness_status: "fresh",
          assistant_answer: false,
          terminal_eligible: false,
          answer_authority: false,
          reentry_required: true,
        }],
      },
      hasActiveDocVisibleTranslationContext: true,
      has_active_doc_visible_translation_context: true,
      accountLanguageTranslationProjections: [{
        key: "account-language:docs-viewer:translate-button:es",
        status: "ready",
        displayText: "Traducir",
        panelId: "docs-viewer",
        panel_id: "docs-viewer",
        regionId: "docs-viewer:translate-button",
        region_id: "docs-viewer:translate-button",
        freshnessStatus: "fresh",
        freshness_status: "fresh",
        sourceId: "workstation-shell#docs-viewer:translate-button",
        source_id: "workstation-shell#docs-viewer:translate-button",
        sourceTextHash: "sha256:translate-button",
        source_text_hash: "sha256:translate-button",
        sourceTextCharCount: 9,
        source_text_char_count: 9,
        projectionTarget: "account_language",
        projection_target: "account_language",
        accountLocale: "es-US",
        account_locale: "es-US",
        targetLanguage: "es",
        target_language: "es",
        chunkId: "docs-viewer:translate-button",
        chunk_id: "docs-viewer:translate-button",
        chunkIndex: 2,
        chunk_index: 2,
        sourceEventId: "ui-region:event-1",
        source_event_id: "ui-region:event-1",
        sourceEventMs: 100,
        source_event_ms: 100,
        observedAtMs: 150,
        observed_at_ms: 150,
        observationRef: "obs:account-language:button",
        observation_ref: "obs:account-language:button",
        receiptRef: "receipt:account-language:button",
        receipt_ref: "receipt:account-language:button",
        contextRole: "tool_evidence",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      }],
      account_language_translation_projections: [{
        key: "account-language:docs-viewer:translate-button:es",
        status: "ready",
        displayText: "Traducir",
        panelId: "docs-viewer",
        panel_id: "docs-viewer",
        regionId: "docs-viewer:translate-button",
        region_id: "docs-viewer:translate-button",
        freshnessStatus: "fresh",
        freshness_status: "fresh",
        sourceId: "workstation-shell#docs-viewer:translate-button",
        source_id: "workstation-shell#docs-viewer:translate-button",
        sourceTextHash: "sha256:translate-button",
        source_text_hash: "sha256:translate-button",
        sourceTextCharCount: 9,
        source_text_char_count: 9,
        projectionTarget: "account_language",
        projection_target: "account_language",
        accountLocale: "es-US",
        account_locale: "es-US",
        targetLanguage: "es",
        target_language: "es",
        chunkId: "docs-viewer:translate-button",
        chunk_id: "docs-viewer:translate-button",
        chunkIndex: 2,
        chunk_index: 2,
        sourceEventId: "ui-region:event-1",
        source_event_id: "ui-region:event-1",
        sourceEventMs: 100,
        source_event_ms: 100,
        observedAtMs: 150,
        observed_at_ms: 150,
        observationRef: "obs:account-language:button",
        observation_ref: "obs:account-language:button",
        receiptRef: "receipt:account-language:button",
        receipt_ref: "receipt:account-language:button",
        contextRole: "tool_evidence",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      }],
      hasAccountLanguageTranslationProjections: true,
      has_account_language_translation_projections: true,
      visibleTranslationProjections: [{
        key: "docs-hover:current:es",
        status: "projected",
        displayText: "Oracion enfocada",
        projectionTarget: "docs_hover",
        sourceId: "document_markdown:docs/research/current-whitepaper.md#docs-viewer:hover:u0002",
        source_id: "document_markdown:docs/research/current-whitepaper.md#docs-viewer:hover:u0002",
        panelId: "docs-viewer",
        panel_id: "docs-viewer",
        regionId: "docs-viewer:hover:u0002",
        region_id: "docs-viewer:hover:u0002",
        freshnessStatus: "fresh",
        freshness_status: "fresh",
        docPath: "docs/research/current-whitepaper.md",
        doc_path: "docs/research/current-whitepaper.md",
        sourceKind: "hover_region",
        source_kind: "hover_region",
        sourceTextHash: "sha256:hover-source",
        source_text_hash: "sha256:hover-source",
        sourceTextCharCount: 17,
        source_text_char_count: 17,
        targetLanguage: "es",
        target_language: "es",
        chunkId: "u0002",
        chunk_id: "u0002",
        chunkIndex: 1,
        chunk_index: 1,
        sourceEventId: "docs:hover:event-1",
        source_event_id: "docs:hover:event-1",
        sourceEventMs: 120,
        source_event_ms: 120,
        observedAtMs: 160,
        observed_at_ms: 160,
        observationRef: "obs:docs:hover",
        observation_ref: "obs:docs:hover",
        receiptRef: "receipt:docs:hover",
        receipt_ref: "receipt:docs:hover",
        contextRole: "tool_evidence",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      }],
      visible_translation_projections: [{
        key: "docs-hover:current:es",
        status: "projected",
        displayText: "Oracion enfocada",
        projectionTarget: "docs_hover",
        sourceId: "document_markdown:docs/research/current-whitepaper.md#docs-viewer:hover:u0002",
        source_id: "document_markdown:docs/research/current-whitepaper.md#docs-viewer:hover:u0002",
        panelId: "docs-viewer",
        panel_id: "docs-viewer",
        regionId: "docs-viewer:hover:u0002",
        region_id: "docs-viewer:hover:u0002",
        freshnessStatus: "fresh",
        freshness_status: "fresh",
        docPath: "docs/research/current-whitepaper.md",
        doc_path: "docs/research/current-whitepaper.md",
        sourceKind: "hover_region",
        source_kind: "hover_region",
        sourceTextHash: "sha256:hover-source",
        source_text_hash: "sha256:hover-source",
        sourceTextCharCount: 17,
        source_text_char_count: 17,
        targetLanguage: "es",
        target_language: "es",
        chunkId: "u0002",
        chunk_id: "u0002",
        chunkIndex: 1,
        chunk_index: 1,
        sourceEventId: "docs:hover:event-1",
        source_event_id: "docs:hover:event-1",
        sourceEventMs: 120,
        source_event_ms: 120,
        observedAtMs: 160,
        observed_at_ms: 160,
        observationRef: "obs:docs:hover",
        observation_ref: "obs:docs:hover",
        receiptRef: "receipt:docs:hover",
        receipt_ref: "receipt:docs:hover",
        contextRole: "tool_evidence",
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
      }],
      hasVisibleTranslationProjections: true,
      has_visible_translation_projections: true,
      docContextFailureReason: null,
      doc_context_failure_reason: null,
      activeNoteId: "note-active",
      activeNoteTitle: "Active",
      lastCreatedNoteId: "note-new",
      lastCreatedNoteTitle: "Newest",
      lastCreatedNoteBody: "newest body",
      hasNoteContext: true,
      situationRoomContext: { job: "active" },
      situationCaptureContext: { capture: "visible" },
      hasSituationRoomContext: true,
      hasClipboardContext: true,
      lastUpdatedAtMs: 1234,
    });
    expect(snapshot.activeCalculatorContext).toEqual({
      schema: "helix.scientific_calculator_active_context.v1",
      panel_id: "scientific-calculator",
      active_panel: true,
      current_latex: "8*9",
      last_result_text: "72",
      last_normalized_expression: "8*9",
      last_trace_id: "trace-123",
      last_ok: true,
      last_calculator_receipt: {
        schema: "helix.scientific_calculator_receipt.v1",
        receipt_id: "receipt:calculator:72",
        status: "solved",
        expression: "8*9",
        latex: "8*9",
        variables: [],
        assumptions: [],
        source_refs: ["trace-123"],
        context_keys: ["ask:turn:turn-72"],
        dimensional_check_status: "not_applicable",
        result_value: "72",
        result_unit: null,
        result_text: "72",
        provenance_refs: ["calculator_trace:trace-123"],
        missing_bindings: [],
        blockers: [],
        claim_boundary: "diagnostic only",
        created_at: "2026-07-08T00:00:00.000Z",
        updated_at: "2026-07-08T00:00:00.000Z",
      },
      calculator_receipts: [{
        schema: "helix.scientific_calculator_receipt.v1",
        receipt_id: "receipt:calculator:72",
        status: "solved",
        expression: "8*9",
        variables: [],
        assumptions: [],
        source_refs: ["trace-123"],
        context_keys: ["ask:turn:turn-72"],
        dimensional_check_status: "not_applicable",
        provenance_refs: ["calculator_trace:trace-123"],
        missing_bindings: [],
        blockers: [],
        claim_boundary: "diagnostic only",
        created_at: "2026-07-08T00:00:00.000Z",
        updated_at: "2026-07-08T00:00:00.000Z",
      }],
      calculator_receipt_status: "solved",
      calculator_receipt_ref: "receipt:calculator:72",
      calculator_receipt_context_index: {
        "ask:turn:turn-72": "receipt:calculator:72",
      },
      step_count: 2,
      recent_debug_events: [{
        action_id: "solve_expression",
        ok: true,
        input_latex: "8*9",
        result_text: "72",
        normalized_expression: "8*9",
        message: "solved",
        ts: 11,
      }],
    });
    expect(String(snapshot.activeNoteBody).length).toBe(12000);
    expect(snapshot.recentNotes).toEqual([
      { id: "note-new", title: "Newest", body: "newest body" },
      { id: "note-active", title: "Active", body: String(snapshot.activeNoteBody) },
    ]);
  });

  it("marks missing docs context without reading stores", () => {
    expect(buildAskTurnWorkspaceContextSnapshotFromState({
      sessionId: null,
      layoutState: {
        activeGroupId: "docs",
        groups: {
          docs: { activePanelId: "docs-viewer", panelIds: ["docs-viewer"] },
        },
      },
      notesState: {
        order: [],
        notes: {},
      },
      calculatorState: {
        debugEvents: [],
        steps: [],
      },
      docContext: {
        path: null,
        source: "missing",
      },
      lastUpdatedAtMs: 5,
    })).toMatchObject({
      sessionId: "helix-ui",
      activePanel: "docs-viewer",
      active_panel: "docs-viewer",
      hasDocContext: false,
      has_doc_context: false,
      accountLanguageTranslationProjections: [],
      account_language_translation_projections: [],
      hasAccountLanguageTranslationProjections: false,
      has_account_language_translation_projections: false,
      visibleTranslationProjections: [],
      visible_translation_projections: [],
      hasVisibleTranslationProjections: false,
      has_visible_translation_projections: false,
      docContextValid: false,
      doc_context_valid: false,
      docContextPath: null,
      doc_context_path: null,
      docContextSource: null,
      doc_context_source: null,
      docContextFailureReason: "docs_panel_open_without_active_doc_path",
      doc_context_failure_reason: "docs_panel_open_without_active_doc_path",
      hasCalculatorContext: false,
      hasNoteContext: false,
      hasClipboardContext: false,
      lastUpdatedAtMs: 5,
    });
  });

  it("normalizes active visible translation context as source evidence only", () => {
    const snapshot = buildAskTurnWorkspaceContextSnapshotFromState({
      sessionId: "session-visible-context",
      layoutState: {
        activeGroupId: "docs",
        groups: {
          docs: { activePanelId: "docs-viewer", panelIds: ["docs-viewer"] },
        },
      },
      notesState: {
        order: [],
        notes: {},
      },
      calculatorState: {
        debugEvents: [],
        steps: [],
      },
      docContext: {
        path: "docs/current.md",
        source: "desktop_url",
      },
      activeDocVisibleTranslationContext: {
        schema: "helix.ask.active_doc_visible_translation_context.v1",
        doc_path: "docs/current.md",
        answerAuthority: true,
        answer_authority: true,
        terminalEligible: true,
        terminal_eligible: true,
        assistantAnswer: true,
        assistant_answer: true,
        rawContentIncluded: true,
        raw_content_included: true,
        reentryRequired: false,
        reentry_required: false,
        chunks: [{
          chunk_id: "u0001",
          visible_text: "Visible heading",
          answerAuthority: true,
          answer_authority: true,
          terminalEligible: true,
          terminal_eligible: true,
          assistantAnswer: true,
          assistant_answer: true,
          rawContentIncluded: true,
          raw_content_included: true,
          reentryRequired: false,
          reentry_required: false,
        }],
        visible_ui_text_regions: [{
          region_id: "docs-viewer:title",
          visible_text: "Document title",
          answer_authority: true,
          terminal_eligible: true,
          assistant_answer: true,
          raw_content_included: true,
          reentry_required: false,
        }],
      },
      lastUpdatedAtMs: 10,
    });

    expect(snapshot.activeDocVisibleTranslationContext).toMatchObject({
      doc_path: "docs/current.md",
      answerAuthority: false,
      answer_authority: false,
      terminalEligible: false,
      terminal_eligible: false,
      assistantAnswer: false,
      assistant_answer: false,
      rawContentIncluded: false,
      raw_content_included: false,
      reentryRequired: true,
      reentry_required: true,
      chunks: [expect.objectContaining({
        chunk_id: "u0001",
        visible_text: "Visible heading",
        answerAuthority: false,
        answer_authority: false,
        terminalEligible: false,
        terminal_eligible: false,
        assistantAnswer: false,
        assistant_answer: false,
        rawContentIncluded: false,
        raw_content_included: false,
        reentryRequired: true,
        reentry_required: true,
      })],
      visible_ui_text_regions: [expect.objectContaining({
        region_id: "docs-viewer:title",
        answer_authority: false,
        terminal_eligible: false,
        assistant_answer: false,
        raw_content_included: false,
        reentry_required: true,
      })],
    });
    expect(snapshot.active_doc_visible_translation_context).toEqual(snapshot.activeDocVisibleTranslationContext);
    expect(snapshot.hasActiveDocVisibleTranslationContext).toBe(true);
  });

  it("drops active visible translation context from a different document", () => {
    const snapshot = buildAskTurnWorkspaceContextSnapshotFromState({
      sessionId: "session-old-visible-context",
      layoutState: {
        activeGroupId: "docs",
        groups: {
          docs: { activePanelId: "docs-viewer", panelIds: ["docs-viewer"] },
        },
      },
      notesState: {
        order: [],
        notes: {},
      },
      calculatorState: {
        debugEvents: [],
        steps: [],
      },
      docContext: {
        path: "docs/current.md",
        source: "desktop_url",
      },
      activeDocVisibleTranslationContext: {
        schema: "helix.ask.active_doc_visible_translation_context.v1",
        doc_path: "docs/old.md",
        chunks: [{
          chunk_id: "old",
          visible_text: "Old document text",
        }],
      },
      lastUpdatedAtMs: 11,
    });

    expect(snapshot.activeDocVisibleTranslationContext).toBeNull();
    expect(snapshot.active_doc_visible_translation_context).toBeNull();
    expect(snapshot.hasActiveDocVisibleTranslationContext).toBe(false);
    expect(snapshot.has_active_doc_visible_translation_context).toBe(false);
  });

  it("lets validated private Research Library context replace stale canonical document identity", () => {
    const documentRef = "private-research:account-token:snapshot-document-token";
    const docPath = researchLibraryDocViewerPath(documentRef);
    const rawMarkdown = "# Research extraction\n\nVisible private paragraph.";
    const visibleContext = buildActiveDocVisibleTranslationContext({
      docPath,
      title: "Research extraction",
      documentSourceKind: "research_library",
      documentRef,
      privateSource: true,
      rawMarkdown,
      rawMarkdownSourceHash: hashDocumentSource(rawMarkdown),
      units: segmentMarkdownForTranslation(rawMarkdown),
      accountLocale: "en",
      targetLanguage: "es",
    });
    expect(visibleContext).not.toBeNull();
    if (!visibleContext) throw new Error("expected private research visible context");

    const snapshot = buildAskTurnWorkspaceContextSnapshotFromState({
      sessionId: "session-private-research",
      layoutState: {
        activeGroupId: "docs",
        groups: { docs: { activePanelId: "docs-viewer", panelIds: ["docs-viewer"] } },
      },
      notesState: {},
      calculatorState: {},
      docContext: { path: "docs/stale-canonical.md", source: "desktop_url" },
      activeDocVisibleTranslationContext: visibleContext,
      visibleTranslationProjections: [
        { key: "stale", docPath: "docs/stale-canonical.md", displayText: "stale" },
        { key: "research", doc_path: docPath, displayText: "traducido" },
      ],
      lastUpdatedAtMs: 20,
    });

    expect(snapshot).toMatchObject({
      activePanel: "docs-viewer",
      activeDocPath: docPath,
      active_doc_path: docPath,
      docContextSource: "active_research_library_visible_context",
      doc_context_source: "active_research_library_visible_context",
      hasDocContext: true,
      hasActiveDocVisibleTranslationContext: true,
    });
    expect(snapshot.activeDocVisibleTranslationContext).toMatchObject({
      document_source_kind: "research_library",
      document_ref: documentRef,
      private_source: true,
      doc_path: docPath,
    });
    expect(snapshot.visibleTranslationProjections).toEqual([
      expect.objectContaining({ key: "research", doc_path: docPath }),
    ]);
  });

  it("fails closed on mismatched private Research Library provenance", () => {
    const documentRef = "private-research:account-token:claimed-document-token";
    const docPath = researchLibraryDocViewerPath(documentRef);
    const rawMarkdown = "# Private extraction";
    const validContext = buildActiveDocVisibleTranslationContext({
      docPath,
      documentSourceKind: "research_library",
      documentRef,
      privateSource: true,
      rawMarkdown,
      rawMarkdownSourceHash: hashDocumentSource(rawMarkdown),
      units: segmentMarkdownForTranslation(rawMarkdown),
      accountLocale: "en",
      targetLanguage: "es",
    });
    if (!validContext) throw new Error("expected private research visible context");
    const malformedContext = {
      ...validContext,
      document_ref: "private-research:account-token:different-document-token",
    } as Record<string, unknown>;

    const snapshot = buildAskTurnWorkspaceContextSnapshotFromState({
      layoutState: {
        activeGroupId: "docs",
        groups: { docs: { activePanelId: "docs-viewer", panelIds: ["docs-viewer"] } },
      },
      notesState: {},
      calculatorState: {},
      docContext: { path: "docs/stale-canonical.md", source: "desktop_url" },
      activeDocVisibleTranslationContext: malformedContext,
      visibleTranslationProjections: [{ key: "research", docPath, displayText: "should-drop" }],
      lastUpdatedAtMs: 21,
    });

    expect(snapshot).toMatchObject({
      activeDocPath: null,
      active_doc_path: null,
      source: "invalid_research_library_visible_context",
      hasDocContext: false,
      hasActiveDocVisibleTranslationContext: false,
      visibleTranslationProjections: [],
    });
  });

  it("fails closed when a private Research Library region collection is not an array", () => {
    const documentRef = "private-research:account-token:malformed-regions-token";
    const docPath = researchLibraryDocViewerPath(documentRef);
    const rawMarkdown = "# Private extraction";
    const validContext = buildActiveDocVisibleTranslationContext({
      docPath,
      documentSourceKind: "research_library",
      documentRef,
      privateSource: true,
      rawMarkdown,
      rawMarkdownSourceHash: hashDocumentSource(rawMarkdown),
      units: segmentMarkdownForTranslation(rawMarkdown),
      accountLocale: "en",
      targetLanguage: "es",
    });
    if (!validContext) throw new Error("expected private research visible context");

    const snapshot = buildAskTurnWorkspaceContextSnapshotFromState({
      layoutState: {
        activeGroupId: "docs",
        groups: { docs: { activePanelId: "docs-viewer", panelIds: ["docs-viewer"] } },
      },
      notesState: {},
      calculatorState: {},
      docContext: { path: "docs/stale-canonical.md", source: "desktop_url" },
      activeDocVisibleTranslationContext: {
        ...validContext,
        panel_text_regions: "private text must not bypass provenance validation",
      },
      visibleTranslationProjections: [{ key: "research", docPath, displayText: "should-drop" }],
      lastUpdatedAtMs: 22,
    });

    expect(snapshot).toMatchObject({
      activeDocPath: null,
      source: "invalid_research_library_visible_context",
      hasDocContext: false,
      hasActiveDocVisibleTranslationContext: false,
      visibleTranslationProjections: [],
    });
  });

  it("bounds account-language projection context and drops malformed entries", () => {
    const projections = Array.from({ length: 30 }, (_, index) => ({
      key: `account-language:region:${index}`,
      status: "ready",
      displayText: `Region ${index}`,
      panelId: "docs-viewer",
      regionId: `region:${index}`,
      sourceId: `source:${index}`,
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    }));

    const snapshot = buildAskTurnWorkspaceContextSnapshotFromState({
      sessionId: "session-account-language",
      layoutState: {
        activeGroupId: "docs",
        groups: {
          docs: { activePanelId: "docs-viewer", panelIds: ["docs-viewer"] },
        },
      },
      notesState: {
        order: [],
        notes: {},
      },
      calculatorState: {
        debugEvents: [],
        steps: [],
      },
      docContext: {
        path: "docs/current.md",
        source: "desktop_url",
      },
      accountLanguageTranslationProjections: [
        ...projections,
        null as unknown as Record<string, unknown>,
        [] as unknown as Record<string, unknown>,
      ],
      lastUpdatedAtMs: 7,
    });

    expect(snapshot.accountLanguageTranslationProjections).toHaveLength(24);
    expect(snapshot.account_language_translation_projections).toHaveLength(24);
    expect(snapshot.accountLanguageTranslationProjections).toEqual(
      projections.slice(0, 24).map((projection) => expect.objectContaining({
        ...projection,
        contextRole: "tool_evidence",
        context_role: "tool_evidence",
        projectionTarget: "account_language",
        projection_target: "account_language",
        answerAuthority: false,
        answer_authority: false,
        terminalEligible: false,
        terminal_eligible: false,
        assistantAnswer: false,
        assistant_answer: false,
        rawContentIncluded: false,
        raw_content_included: false,
      })),
    );
    expect(snapshot.hasAccountLanguageTranslationProjections).toBe(true);
    expect(snapshot.has_account_language_translation_projections).toBe(true);
  });

  it("bounds visible translation projection context and drops malformed entries", () => {
    const projections = Array.from({ length: 30 }, (_, index) => ({
      key: `visible-translation:region:${index}`,
      status: "projected",
      displayText: `Region ${index}`,
      panelId: "docs-viewer",
      regionId: `region:${index}`,
      sourceId: `source:${index}`,
      projectionTarget: "docs_hover",
      answerAuthority: false,
      terminalEligible: false,
      assistantAnswer: false,
      rawContentIncluded: false,
    }));

    const snapshot = buildAskTurnWorkspaceContextSnapshotFromState({
      sessionId: "session-visible-translation",
      layoutState: {
        activeGroupId: "docs",
        groups: {
          docs: { activePanelId: "docs-viewer", panelIds: ["docs-viewer"] },
        },
      },
      notesState: {
        order: [],
        notes: {},
      },
      calculatorState: {
        debugEvents: [],
        steps: [],
      },
      docContext: {
        path: "docs/current.md",
        source: "desktop_url",
      },
      visibleTranslationProjections: [
        ...projections,
        null as unknown as Record<string, unknown>,
        [] as unknown as Record<string, unknown>,
      ],
      lastUpdatedAtMs: 8,
    });

    expect(snapshot.visibleTranslationProjections).toHaveLength(24);
    expect(snapshot.visible_translation_projections).toHaveLength(24);
    expect(snapshot.visibleTranslationProjections).toEqual(
      projections.slice(0, 24).map((projection) => expect.objectContaining({
        ...projection,
        contextRole: "tool_evidence",
        context_role: "tool_evidence",
        answerAuthority: false,
        answer_authority: false,
        terminalEligible: false,
        terminal_eligible: false,
        assistantAnswer: false,
        assistant_answer: false,
        rawContentIncluded: false,
        raw_content_included: false,
      })),
    );
    expect(snapshot.hasVisibleTranslationProjections).toBe(true);
    expect(snapshot.has_visible_translation_projections).toBe(true);
  });

  it("drops translation projections from a different active document but keeps global UI projections", () => {
    const snapshot = buildAskTurnWorkspaceContextSnapshotFromState({
      sessionId: "session-current-doc",
      layoutState: {
        activeGroupId: "docs",
        groups: {
          docs: { activePanelId: "docs-viewer", panelIds: ["docs-viewer"] },
        },
      },
      notesState: {
        order: [],
        notes: {},
      },
      calculatorState: {
        debugEvents: [],
        steps: [],
      },
      docContext: {
        path: "docs/current.md",
        source: "desktop_url",
      },
      accountLanguageTranslationProjections: [
        {
          key: "account-language:old-doc",
          status: "ready",
          displayText: "Documento anterior",
          panelId: "docs-viewer",
          regionId: "docs-viewer:title",
          docPath: "docs/old.md",
          sourceId: "workstation-shell#docs-viewer:title",
          answerAuthority: false,
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
        {
          key: "account-language:global-menu",
          status: "ready",
          displayText: "Menu",
          panelId: "workstation-shell",
          regionId: "global:menu",
          sourceId: "workstation-shell#global:menu",
          answerAuthority: false,
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
      ],
      visibleTranslationProjections: [
        {
          key: "visible:old-doc",
          status: "projected",
          displayText: "Texto anterior",
          projectionTarget: "docs_hover",
          sourceId: "document_markdown:docs/old.md#hover",
          docPath: "docs/old.md",
          answerAuthority: false,
          terminalEligible: false,
          assistantAnswer: false,
          rawContentIncluded: false,
        },
        {
          key: "visible:current-doc",
          status: "projected",
          displayText: "Texto actual",
          projectionTarget: "docs_hover",
          sourceId: "document_markdown:docs/current.md#hover",
          doc_path: "docs/current.md",
          bbox: { x: 10, y: 20, width: 300, height: 40 },
          contextRole: "answer",
          context_role: "answer",
          answerAuthority: true,
          answer_authority: true,
          terminalEligible: true,
          terminal_eligible: true,
          assistantAnswer: true,
          assistant_answer: true,
          rawContentIncluded: true,
          raw_content_included: true,
        },
      ],
      lastUpdatedAtMs: 9,
    });

    expect(snapshot.accountLanguageTranslationProjections).toEqual([
      expect.objectContaining({
        key: "account-language:global-menu",
        displayText: "Menu",
        contextRole: "tool_evidence",
        context_role: "tool_evidence",
        answerAuthority: false,
        answer_authority: false,
        terminalEligible: false,
        terminal_eligible: false,
        reentryRequired: true,
        reentry_required: true,
      }),
    ]);
    expect(snapshot.visibleTranslationProjections).toEqual([
      expect.objectContaining({
        key: "visible:current-doc",
        displayText: "Texto actual",
        bbox: { x: 10, y: 20, width: 300, height: 40 },
        contextRole: "tool_evidence",
        context_role: "tool_evidence",
        answerAuthority: false,
        answer_authority: false,
        terminalEligible: false,
        terminal_eligible: false,
        assistantAnswer: false,
        assistant_answer: false,
        rawContentIncluded: false,
        raw_content_included: false,
        reentryRequired: true,
        reentry_required: true,
      }),
    ]);
    expect(snapshot.visible_translation_projections).toEqual(snapshot.visibleTranslationProjections);
    expect(snapshot.hasAccountLanguageTranslationProjections).toBe(true);
    expect(snapshot.hasVisibleTranslationProjections).toBe(true);
  });

  it("does not promote older recent notes as current context when the focused notes panel has no active note", () => {
    expect(buildAskTurnWorkspaceContextSnapshotFromState({
      sessionId: "session-notes",
      layoutState: {
        activeGroupId: "notes",
        groups: {
          notes: {
            activePanelId: "workstation-notes",
            panelIds: ["workstation-notes", "scientific-calculator"],
          },
        },
      },
      notesState: {
        active_note_id: undefined,
        order: ["note-old"],
        notes: {
          "note-old": {
            id: "note-old",
            title: "Old Common Core note",
            body: "This older body must not describe the current empty notes editor.",
          },
        },
      },
      calculatorState: {
        debugEvents: [],
        steps: [],
      },
      docContext: {
        path: null,
        source: "missing",
      },
      lastUpdatedAtMs: 6,
    })).toMatchObject({
      activePanel: "workstation-notes",
      active_panel: "workstation-notes",
      activeNoteId: null,
      activeNoteTitle: null,
      activeNoteBody: null,
      lastCreatedNoteId: null,
      lastCreatedNoteTitle: null,
      lastCreatedNoteBody: null,
      recentNotes: [],
      hasNoteContext: true,
    });
  });
});
