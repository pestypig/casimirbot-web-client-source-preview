import { describe, expect, it } from "vitest";

import {
  buildHelixAskConsoleAssemblyDebugSnapshot,
  formatHelixAskConsoleCapabilityLaneRowChips,
  formatHelixAskConsoleCapabilityLaneRowDetailText,
  formatHelixAskConsoleCapabilityLaneSummaryText,
  resolveHelixAskConsoleCapabilityLaneRowDetail,
} from "@/components/helix/ask-console/HelixAskConsoleDiagnostics";
import { createHelixAskConsoleStreamIngressDebug } from "@/lib/helix/ask-active-turn-stream";

describe("Helix Ask console diagnostics", () => {
  it("reads lane timeline JSON rows as first-class lane detail", () => {
    const detail = resolveHelixAskConsoleCapabilityLaneRowDetail({
      key: "lane-reentered-json",
      source: "agent_work",
      label: "Timeline",
      text: "Capability lane observation re-entered.",
      meta: JSON.stringify({
        schema: "helix.capability_lane.provider_timeline_event.v1",
        stage: "lane_reentered",
        status: "pending",
        selected_runtime_agent_provider: "codex",
        lane_id: "live_translation",
        capability_id: "live_translation.translate_text",
        selected_backend_provider: "live_translation.local_runtime",
        observation_ref: "ask:lane:translation:obs",
        receipt_ref: "ask:lane:translation:obs:projection:receipt",
        latest_visible_observation_ref: "ask:lane:translation:obs:visible",
        latest_visible_receipt_ref: "ask:lane:translation:receipt:visible",
        latest_evidence_observation_ref: "ask:lane:translation:obs:stale",
        latest_evidence_receipt_ref: "ask:lane:translation:receipt:stale",
        source_id: "docs:nhm2",
        source_hash: "sha256:doc-a",
        source_kind: "docs_viewer",
        source_text_hash: "sha256:source-text-a",
        source_text_char_count: 2048,
        source_identity_key:
          "docs:nhm2::sha256:doc-a::sha256:source-text-a::2048::docs_viewer::docs_viewer.inline_translation::es-US::es",
        projection_target: "docs_viewer.inline_translation",
        account_locale: "es-US",
        target_language: "es",
        latest_chunk_id: "chunk-1",
        latest_chunk_index: 2,
        latest_dedupe_key: "docs:nhm2:chunk-1:es",
        answer_authority: false,
        terminal_eligible: false,
        assistant_answer: false,
        raw_content_included: false,
        terminal_authority_status: "pending_helix_terminal_authority",
      }),
      status: "reentered",
      tone: "checkpoint",
      evidenceRefs: ["ask:lane:translation:obs"],
    });

    expect(detail).toMatchObject({
      executionState: "reentered",
      normalizedStage: "lane_reentered",
      stateLabel: "pending",
      selectedRuntimeAgentProvider: "codex",
      laneId: "live_translation",
      capabilityId: "live_translation.translate_text",
      selectedBackendProvider: "live_translation.local_runtime",
      observationRef: "ask:lane:translation:obs",
      receiptRef: "ask:lane:translation:obs:projection:receipt",
      latestVisibleObservationRef: "ask:lane:translation:obs:visible",
      latestVisibleReceiptRef: "ask:lane:translation:receipt:visible",
      latestEvidenceObservationRef: "ask:lane:translation:obs:stale",
      latestEvidenceReceiptRef: "ask:lane:translation:receipt:stale",
      sourceId: "docs:nhm2",
      sourceHash: "sha256:doc-a",
      sourceKind: "docs_viewer",
      sourceTextHash: "sha256:source-text-a",
      sourceTextCharCount: "2048",
      sourceIdentityKey:
        "docs:nhm2::sha256:doc-a::sha256:source-text-a::2048::docs_viewer::docs_viewer.inline_translation::es-US::es",
      projectionTarget: "docs_chunk",
      accountLocale: "es-US",
      targetLanguage: "es",
      chunkId: "chunk-1",
      chunkIndex: "2",
      dedupeKey: "docs:nhm2:chunk-1:es",
      laneExecuted: "true",
      observationReentered: "true",
      answerAuthority: "false",
      terminalEligible: "false",
      assistantAnswer: "false",
      rawContentIncluded: "false",
      terminalAuthorityStatus: "pending_helix_terminal_authority",
    });
    expect(formatHelixAskConsoleCapabilityLaneRowDetailText("reentered", detail)).toContain(
      "Visible receipt ask:lane:translation:receipt:visible",
    );
    expect(formatHelixAskConsoleCapabilityLaneRowDetailText("reentered", detail)).toContain(
      "Evidence receipt ask:lane:translation:receipt:stale",
    );
  });

  it("reads exported lane console state rows as first-class lane detail", () => {
    const detail = resolveHelixAskConsoleCapabilityLaneRowDetail({
      key: "lane-console-state-json",
      source: "agent_work",
      label: "Timeline",
      text: "Capability lane backend selected.",
      meta: JSON.stringify({
        schema: "helix.capability_lane.console_state_row.v1",
        stage: "lane_backend_selected",
        normalized_stage: "backend",
        state_label: "backend_selected",
        execution_state: "backend_selected",
        adapter_boundary: "helix_agent_provider_edge",
        selected_runtime_agent_provider: "codex",
        lane_id: "live_translation",
        capability_id: "live_translation.translate_text",
        requested_backend_provider: "google_gemini",
        selected_backend_provider: "live_translation.local_runtime",
        backend_selection_reason: "helix_selected_deterministic_backend",
        lane_visible: false,
        lane_requested: true,
        lane_executed: false,
        observation_reentered: false,
        terminal_authority_status: "not_terminal_authority",
      }),
      status: "checkpoint",
      tone: "checkpoint",
      evidenceRefs: [],
    });

    expect(detail).toMatchObject({
      executionState: "backend_selected",
      normalizedStage: "backend",
      stateLabel: "backend_selected",
      adapterBoundary: "helix_agent_provider_edge",
      selectedRuntimeAgentProvider: "codex",
      laneId: "live_translation",
      capabilityId: "live_translation.translate_text",
      requestedBackendProvider: "google_gemini",
      selectedBackendProvider: "live_translation.local_runtime",
      backendSelectionReason: "helix_selected_deterministic_backend",
      laneRequested: "true",
      laneExecuted: "false",
      terminalAuthorityStatus: "not_terminal_authority",
    });
    expect(formatHelixAskConsoleCapabilityLaneRowChips(detail)).toEqual([
      "Execution backend selected",
      "Provider codex",
      "Lane live_translation",
      "Capability live_translation.translate_text",
      "Backend live_translation.local_runtime",
      "Authority not_terminal_authority",
    ]);
  });

  it("reads camelCase lane timeline JSON fields from client-shaped live events", () => {
    const detail = resolveHelixAskConsoleCapabilityLaneRowDetail({
      key: "lane-observed-camel-json",
      source: "agent_work",
      label: "Timeline",
      text: "Capability lane observation produced.",
      meta: JSON.stringify({
        schema: "helix.capability_lane.provider_timeline_event.v1",
        stage: "lane_observation",
        status: "observed_pending_reentry",
        selectedRuntimeAgentProvider: "codex",
        adapterBoundary: "helix_agent_provider_edge",
        laneId: "live_translation",
        capabilityId: "live_translation.translate_text",
        selectedBackendProvider: "live_translation.local_runtime",
        observationRef: "ask:lane:translation:obs",
        receiptRef: "ask:lane:translation:obs:projection:receipt",
        sourceId: "docs:nhm2",
        sourceHash: "sha256:doc-a",
        sourceKind: "docs_viewer",
        sourceTextHash: "sha256:source-text-a",
        sourceTextCharCount: 2048,
        sourceIdentityKey:
          "docs:nhm2::sha256:doc-a::sha256:source-text-a::2048::docs_viewer::docs_viewer.inline_translation::es-US::es",
        projectionTarget: "docs_viewer.inline_translation",
        accountLocale: "es-US",
        targetLanguage: "es",
        chunkId: "chunk-1",
        chunkIndex: 2,
        dedupeKey: "docs:nhm2:chunk-1:es",
        sourceEventId: "docs:event-1",
        sourceEventMs: 100,
        observedAtMs: 125,
        freshnessStatus: "fresh",
        cancelRequested: false,
        answerAuthority: false,
        terminalEligible: false,
        assistantAnswer: false,
        rawContentIncluded: false,
        reentryStatus: "observation_packet_required_for_provider_reentry",
        terminalAuthorityStatus: "pending_helix_terminal_authority",
      }),
      status: "succeeded",
      tone: "observation",
      evidenceRefs: ["ask:lane:translation:obs"],
    });

    expect(detail).toMatchObject({
      executionState: "executed_pending_reentry",
      normalizedStage: "lane_observation",
      stateLabel: "observed_pending_reentry",
      selectedRuntimeAgentProvider: "codex",
      adapterBoundary: "helix_agent_provider_edge",
      laneId: "live_translation",
      capabilityId: "live_translation.translate_text",
      selectedBackendProvider: "live_translation.local_runtime",
      observationRef: "ask:lane:translation:obs",
      receiptRef: "ask:lane:translation:obs:projection:receipt",
      sourceId: "docs:nhm2",
      sourceHash: "sha256:doc-a",
      sourceKind: "docs_viewer",
      sourceTextHash: "sha256:source-text-a",
      sourceTextCharCount: "2048",
      sourceIdentityKey:
        "docs:nhm2::sha256:doc-a::sha256:source-text-a::2048::docs_viewer::docs_viewer.inline_translation::es-US::es",
      projectionTarget: "docs_chunk",
      accountLocale: "es-US",
      targetLanguage: "es",
      chunkId: "chunk-1",
      chunkIndex: "2",
      dedupeKey: "docs:nhm2:chunk-1:es",
      sourceEventId: "docs:event-1",
      sourceEventMs: "100",
      observedAtMs: "125",
      freshnessStatus: "fresh",
      cancelRequested: "false",
      laneExecuted: "true",
      answerAuthority: "false",
      terminalEligible: "false",
      assistantAnswer: "false",
      rawContentIncluded: "false",
      reentryStatus: "observation_packet_required_for_provider_reentry",
      terminalAuthorityStatus: "pending_helix_terminal_authority",
    });
  });

  it("reads session-list timeline rows with status and health as console lane session detail", () => {
    const detail = resolveHelixAskConsoleCapabilityLaneRowDetail({
      key: "lane-session-list-json",
      source: "agent_work",
      label: "Timeline",
      text: "Capability lane session listed.",
      meta: JSON.stringify({
        schema: "helix.capability_lane.provider_timeline_event.v1",
        stage: "lane_session",
        status: "paused",
        health: "healthy",
        session_debug_phase: "running:record_observation:observation_recorded",
        session_observation_status: "observation_recorded",
        selected_runtime_agent_provider: "codex",
        adapter_boundary: "helix_agent_provider_edge",
        lane_id: "live_translation",
        lane_session_id: "lane-session-docs",
        requested_backend_provider: "google_gemini",
        selected_backend_provider: "live_translation.local_runtime",
        fallback_backend_provider: "live_translation.local_runtime",
        selection_reason: "requested backend unavailable; local fallback selected",
        cost_class: "free_local",
        latency_class: "interactive",
        privacy_class: "local_only",
        session_control_key: "lane-session-docs::docs:nhm2::docs_chunk::es-US::es",
        source_binding_key: "docs:nhm2::docs_chunk::es-US::es",
        latest_source_binding_key: "docs:nhm2::docs_chunk::latest::es-US::es",
        source_identity_key: "docs:nhm2::sha256:doc-a::sha256:source-text-a::2048::docs::docs_chunk::es-US::es",
        source_projection_target: "docs_chunk",
        latest_account_locale: "es-US",
        latest_target_language: "es",
        latest_receipt_ref: "receipt:session-latest",
        has_observation: false,
        context_role: "tool_evidence",
        answer_authority: false,
        terminal_eligible: false,
        assistant_answer: false,
        raw_content_included: false,
      }),
      status: "paused",
      tone: "working",
      evidenceRefs: [],
    });

    expect(detail).toMatchObject({
      executionState: "session_active",
      normalizedStage: "lane_session",
      stateLabel: "paused",
      selectedRuntimeAgentProvider: "codex",
      adapterBoundary: "helix_agent_provider_edge",
      laneId: "live_translation",
      laneSessionId: "lane-session-docs",
      requestedBackendProvider: "google_gemini",
      selectedBackendProvider: "live_translation.local_runtime",
      fallbackBackendProvider: "live_translation.local_runtime",
      backendSelectionReason: "requested backend unavailable; local fallback selected",
      backendCostClass: "free_local",
      backendLatencyClass: "interactive",
      backendPrivacyClass: "local_only",
      sessionStatus: "paused",
      sessionHealth: "healthy",
      sessionDebugPhase: "running:record_observation:observation_recorded",
      sessionObservationStatus: "observation_recorded",
      sessionControlKey: "lane-session-docs::docs:nhm2::docs_chunk::es-US::es",
      sourceBindingKey: "docs:nhm2::docs_chunk::es-US::es",
      latestSourceBindingKey: "docs:nhm2::docs_chunk::latest::es-US::es",
      sourceIdentityKey: "docs:nhm2::sha256:doc-a::sha256:source-text-a::2048::docs::docs_chunk::es-US::es",
      projectionTarget: "docs_chunk",
      accountLocale: "es-US",
      targetLanguage: "es",
      receiptRef: "receipt:session-latest",
      hasObservation: "false",
      contextRole: "tool_evidence",
      answerAuthority: "false",
      terminalEligible: "false",
      assistantAnswer: "false",
      rawContentIncluded: "false",
    });

    expect(formatHelixAskConsoleCapabilityLaneRowDetailText("session", detail)).toContain(
      "Requested backend google_gemini",
    );
    expect(formatHelixAskConsoleCapabilityLaneRowDetailText("session", detail)).toContain(
      "Backend live_translation.local_runtime",
    );
    expect(formatHelixAskConsoleCapabilityLaneRowDetailText("session", detail)).toContain(
      "Selection reason requested backend unavailable; local fallback selected",
    );
    expect(formatHelixAskConsoleCapabilityLaneRowDetailText("session", detail)).toContain(
      "Cost free_local",
    );
    expect(formatHelixAskConsoleCapabilityLaneRowDetailText("session", detail)).toContain(
      "Latency interactive",
    );
    expect(formatHelixAskConsoleCapabilityLaneRowDetailText("session", detail)).toContain(
      "Privacy local_only",
    );
    expect(formatHelixAskConsoleCapabilityLaneRowDetailText("session", detail)).toContain(
      "Session phase running:record_observation:observation_recorded",
    );
    expect(formatHelixAskConsoleCapabilityLaneRowDetailText("session", detail)).toContain(
      "Observation status observation_recorded",
    );
    expect(formatHelixAskConsoleCapabilityLaneRowDetailText("session", detail)).toContain(
      "Account locale es-US | Target es",
    );
    expect(formatHelixAskConsoleCapabilityLaneRowDetailText("session", detail)).toContain(
      "Receipt receipt:session-latest",
    );
  });

  it("reads text-token lane session phase and observation status as console detail", () => {
    const detail = resolveHelixAskConsoleCapabilityLaneRowDetail({
      key: "lane-session-token-meta",
      source: "agent_work",
      label: "Timeline",
      text: "Capability lane session advanced.",
      meta:
        "source capability_lane_session_debug_summaries | live_translation | lane_session | " +
        "lane session lane-session-docs | session status running | session health healthy | " +
        "session phase running:record_observation:observation_recorded | " +
        "observation status observation_recorded",
      status: "running",
      tone: "working",
      evidenceRefs: [],
    });

    expect(detail).toMatchObject({
      executionState: "session_active",
      laneId: "live_translation",
      laneSessionId: "lane-session-docs",
      sessionStatus: "running",
      sessionHealth: "healthy",
      sessionDebugPhase: "running:record_observation:observation_recorded",
      sessionObservationStatus: "observation_recorded",
    });
    expect(formatHelixAskConsoleCapabilityLaneRowDetailText("session", detail)).toContain(
      "Session phase running:record_observation:observation_recorded",
    );
    expect(formatHelixAskConsoleCapabilityLaneRowDetailText("session", detail)).toContain(
      "Observation status observation_recorded",
    );
  });

  it("builds a recrowned console assembly snapshot with stream counters and row source meta", () => {
    const streamIngress = createHelixAskConsoleStreamIngressDebug({
      turnId: "ask:turn-1",
      traceId: "trace-1",
      startedAtMs: 100,
    });
    const snapshot = buildHelixAskConsoleAssemblyDebugSnapshot({
      askBusy: true,
      activeTurnId: "ask:turn-1",
      activeTraceId: "trace-1",
      activeStartedAtMs: 100,
      activeQuestion: "hello",
      totalLiveEventCount: 4,
      retainedLiveEventCount: 3,
      activeLiveEventCount: 3,
      visibleActiveTurnStreamRows: [
        {
          key: "row-1",
          source: "agent_work",
          label: "Model Re-entry",
          text: "Codex is evaluating the observation.",
          meta: "source live_provider_transcript | reasoning | model_reentry",
          status: "running",
          tone: "working",
          evidenceRefs: [],
        },
        {
          key: "lane-visible",
          source: "agent_work",
          label: "Lane Visible",
          text: "Lane visible: live_translation.",
          meta: "source model_visible_capability_lane_manifest | lane_visible",
          status: "available",
          tone: "working",
          evidenceRefs: [],
        },
        {
          key: "lane-requested",
          source: "agent_work",
          label: "Lane Request",
          text: "Lane requested: live_translation.translate_text.",
          meta: "source capability_lane_call_results | lane_requested",
          status: "requested",
          tone: "checkpoint",
          evidenceRefs: [],
        },
        {
          key: "lane-backend",
          source: "agent_work",
          label: "Lane Backend",
          text: "Lane backend selected: live_translation.local_runtime.",
          meta: "source capability_lane_backend_selections | lane_backend_selected",
          status: "selected",
          tone: "checkpoint",
          evidenceRefs: [],
        },
        {
          key: "lane-observed",
          source: "agent_work",
          label: "Lane Observation",
          text: "Lane observation produced a translation receipt.",
          meta: "source capability_lane_call_results | live_translation | lane_observation | runtime provider codex | adapter boundary helix_agent_provider_edge | capability live_translation.translate_text | backend live_translation.local_runtime | observation ask:lane:translation:obs | receipt ask:lane:translation:obs:projection:receipt | latest visible receipt ask:lane:translation:visible:receipt | latest evidence receipt ask:lane:translation:stale:receipt | reentry status observation_packet_required_for_provider_reentry | source payload hash sha256:source-text-a | source payload chars 2048 | source event docs:event-1 | source event ms 100 | observed 125 | freshness stale | cancelled | target es | context role tool_evidence | terminal authority not_terminal_authority",
          status: "succeeded",
          tone: "observation",
          evidenceRefs: ["ask:lane:translation:obs"],
        },
        {
          key: "lane-receipt",
          source: "agent_work",
          label: "Lane Receipt",
          text: "Lane projection receipt recorded for docs UI.",
          meta: "source capability_lane_projection_receipts | live_translation | lane_projection_receipt | capability live_translation.translate_text | receipt ask:lane:translation:obs:projection:receipt | context role tool_evidence | terminal authority not_terminal_authority",
          status: "recorded",
          tone: "observation",
          evidenceRefs: ["ask:lane:translation:obs:projection:receipt"],
        },
        {
          key: "lane-reentered",
          source: "agent_work",
          label: "Lane Re-entry",
          text: "Observation packet re-entered provider context.",
          meta: "source capability_lane_observation_packets | lane_reentered",
          status: "reentered",
          tone: "checkpoint",
          evidenceRefs: ["ask:lane:translation:obs"],
        },
        {
          key: "lane-session",
          source: "agent_work",
          label: "Lane Session",
          text: "Lane session: live_translation.",
          meta: "source capability_lane_session_debug_summaries | live_translation | lane_session | session status paused | session health degraded | latest event lane-session-docs:pause:150 | has observation false",
          status: "running",
          tone: "working",
          evidenceRefs: ["ask:lane:translation:obs"],
        },
        {
          key: "lane-mail",
          source: "agent_work",
          label: "Lane Mail",
          text: "Lane mail loop: live_translation.",
          meta: "source capability_lane_mail_loop_debug_summaries | live_translation | lane_mail_loop | materialized mail evidence true | source document_markdown:docs/research/nhm2.md | source hash fnv1a32:goal-docs | source kind docs | source payload hash fnv1a32:goal-source-text | source payload chars 2048 | projection docs_chunk | account locale es-US | target es | chunk chunk-goal | chunk index 0 | dedupe document_markdown:docs/research/nhm2.md:chunk-goal:es | source event docs:event-mail | source event ms 160 | observed 190 | freshness fresh | session control key lane-session-docs::document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es-US::es | source binding key document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es-US::es | source identity key document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::fnv1a32:goal-source-text::2048::docs::docs_chunk::es-US::es | mail observation key document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es::chunk-goal::ask:lane:translation:obs:projection:receipt | observation session lane-session-docs | observation ask:lane:translation:obs | mailbox wake expected true | decision wake expected false | context role tool_evidence",
          status: "healthy",
          tone: "observation",
          evidenceRefs: ["ask:lane:translation:obs"],
        },
        {
          key: "lane-goal-binding",
          source: "agent_work",
          label: "Goal Lane",
          text: "Goal lane binding: live_translation.",
          meta: "source capability_lane_goal_binding_debug_summaries | live_translation | lane_goal_binding | goal goal:account-language | goal binding goal-binding-docs | goal binding key goal:account-language::goal-binding-docs::lane-session-docs::live_translation | lane session lane-session-docs | session control key lane-session-docs::document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es-US::es | source binding key document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es-US::es | source identity key document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::fnv1a32:goal-source-text::2048::docs::docs_chunk::es-US::es | mail observation key document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es::chunk-goal::ask:lane:translation:obs:projection:receipt | source document_markdown:docs/research/nhm2.md | source hash fnv1a32:goal-docs | source kind docs | source payload hash fnv1a32:goal-source-text | source payload chars 2048 | projection docs_chunk | account locale es-US | target es | chunk u0001 | chunk index 0 | dedupe document_markdown:docs/research/nhm2.md:u0001:es | observation obs:translation-goal-binding | receipt receipt:translation-goal-binding | report summary goal lane wake on salience; reason goal_binding_policy_requests_wake_on_salience | context role tool_evidence | terminal authority pending_helix_terminal_authority",
          status: "bound",
          tone: "checkpoint",
          evidenceRefs: ["ask:lane:translation:obs"],
        },
        {
          key: "lane-goal-dispatch-plan",
          source: "agent_work",
          label: "Goal Dispatch",
          text: "Goal dispatch plan: live_translation; target ask_wake; target es.",
          meta: "source capability_lane_goal_dispatch_plans | live_translation | lane_goal_dispatch_plan | lane session lane-session-docs | session control key lane-session-docs::document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es-US::es | source binding key document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es-US::es | source identity key document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::fnv1a32:goal-source-text::2048::docs::docs_chunk::es-US::es | mail observation key document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es::chunk-goal::ask:lane:translation:obs:projection:receipt",
          status: "pending",
          tone: "checkpoint",
          evidenceRefs: ["ask:lane:translation:obs"],
        },
        {
          key: "lane-goal-dispatch-admission",
          source: "agent_work",
          label: "Goal Admission",
          text: "Goal dispatch admission: live_translation; target ask_wake; target es.",
          meta: "source capability_lane_goal_dispatch_admissions | live_translation | lane_goal_dispatch_admission | lane session lane-session-docs | session control key lane-session-docs::document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es-US::es | source binding key document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es-US::es | source identity key document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::fnv1a32:goal-source-text::2048::docs::docs_chunk::es-US::es | mail observation key document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es::chunk-goal::ask:lane:translation:obs:projection:receipt",
          status: "pending",
          tone: "checkpoint",
          evidenceRefs: ["ask:lane:translation:obs"],
        },
        {
          key: "lane-goal-dispatch-readiness",
          source: "agent_work",
          label: "Goal Readiness",
          text: "Goal dispatch readiness: plans 1; next wake kinds mailbox_wake; target languages es.",
          meta: "source capability_lane_goal_dispatch_readiness | live_translation | lane_goal_dispatch_readiness | lane session lane-session-docs | session control key lane-session-docs::document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es-US::es | source binding key document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es-US::es | source identity key document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::fnv1a32:goal-source-text::2048::docs::docs_chunk::es-US::es | mail observation key document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es::chunk-goal::ask:lane:translation:obs:projection:receipt | wake kind mailbox_wake | live mail loop required 1 | terminal authority required 0 | any live mail loop required true | any terminal authority required false",
          status: "pending",
          tone: "checkpoint",
          evidenceRefs: ["ask:lane:translation:obs"],
        },
        {
          key: "terminal-selected",
          source: "final",
          label: "Terminal",
          text: "Terminal answer selected after capability lane re-entry.",
          meta: "source capability_lane_turn_timeline | helix_terminal_authority | terminal_selected | observation ask:lane:translation:obs | receipt ask:lane:translation:obs:projection:receipt | context role tool_evidence | terminal authority authorized_by_helix_provider_candidate_bridge",
          status: "final",
          tone: "final",
          evidenceRefs: ["ask:lane:translation:obs"],
        },
      ],
      replies: [
        {
          id: "reply-1",
          canonicalKey: "ask:turn-0",
          createdAtMs: 50,
        },
      ],
      latestReplyId: "reply-1",
      streamIngress,
      activeStreamDom: { rowCount: 1 },
    });

    expect(snapshot).toMatchObject({
      schema: "helix.ask.console_assembly_debug.v1",
      askBusy: true,
      activeTurnId: "ask:turn-1",
      activeLiveEventCount: 3,
      activeRowCount: 14,
      filteredLiveEvents: 1,
      streamIngress,
      renderOrder: [
        {
          kind: "active_turn_stream",
          key: "ask:turn-1",
          rowCount: 14,
          renderPlacement: "inline_active_turn",
        },
        {
          kind: "completed_reply",
          replyId: "reply-1",
          canonicalKey: "ask:turn-0",
          isLatest: true,
        },
      ],
      capabilityLaneSummary: {
        lifecycleStatus: "terminal_selected",
        visibleCount: 1,
        requestedCount: 1,
        executedCount: 3,
        backendSelectedCount: 1,
        observedCount: 1,
        receiptCount: 1,
        reenteredCount: 1,
        sessionCount: 1,
        observedSessionCount: 0,
        mailLoopCount: 1,
        observedMailLoopCount: 1,
        mailboxWakeExpectedCount: 1,
        decisionWakeExpectedCount: 0,
        goalBindingCount: 1,
        observedGoalBindingCount: 1,
        observedLaneActivityCount: 2,
        goalDispatchPlanCount: 1,
        goalDispatchAdmissionCount: 1,
        goalDispatchReadinessCount: 1,
        terminalSelectedCount: 1,
        terminalRejectedCount: 0,
        visibleReceiptRefCount: 1,
        evidenceReceiptRefCount: 1,
        stageSequence: [
          "visible",
          "requested",
          "backend_selected",
          "observed",
          "receipt",
          "reentered",
          "session",
          "mail_loop",
          "goal_binding",
          "goal_dispatch_plan",
          "goal_dispatch_admission",
          "goal_dispatch_readiness",
          "terminal_selected",
        ],
        stageSequenceText:
          "visible > requested > backend > observed > receipt > reentered > session > mail > goal > goal_plan > goal_admission > goal_readiness > terminal_selected",
        visibleLaneDoesNotMeanExecuted: true,
      },
      capabilityLaneRows: [
        {
          key: "lane-visible",
          stage: "visible",
          label: "Lane Visible",
          status: "available",
        },
        {
          key: "lane-requested",
          stage: "requested",
          label: "Lane Request",
          status: "requested",
        },
        {
          key: "lane-backend",
          stage: "backend_selected",
          label: "Lane Backend",
          status: "selected",
        },
        {
          key: "lane-observed",
          stage: "observed",
          label: "Lane Observation",
          status: "succeeded",
          detail: {
            selectedRuntimeAgentProvider: "codex",
            adapterBoundary: "helix_agent_provider_edge",
            laneId: "live_translation",
            capabilityId: "live_translation.translate_text",
            selectedBackendProvider: "live_translation.local_runtime",
            observationRef: "ask:lane:translation:obs",
            receiptRef: "ask:lane:translation:obs:projection:receipt",
            latestVisibleReceiptRef: "ask:lane:translation:visible:receipt",
            latestEvidenceReceiptRef: "ask:lane:translation:stale:receipt",
            reentryStatus: "observation_packet_required_for_provider_reentry",
            sourceEventId: "docs:event-1",
            sourceEventMs: "100",
            observedAtMs: "125",
            freshnessStatus: "stale",
            cancelRequested: "true",
            sourceTextHash: "sha256:source-text-a",
            sourceTextCharCount: "2048",
            targetLanguage: "es",
            contextRole: "tool_evidence",
            terminalAuthorityStatus: "not_terminal_authority",
          },
        },
        {
          key: "lane-receipt",
          stage: "receipt",
          label: "Lane Receipt",
          status: "recorded",
          detail: {
            laneId: "live_translation",
            capabilityId: "live_translation.translate_text",
            receiptRef: "ask:lane:translation:obs:projection:receipt",
            contextRole: "tool_evidence",
            terminalAuthorityStatus: "not_terminal_authority",
          },
        },
        {
          key: "lane-reentered",
          stage: "reentered",
          label: "Lane Re-entry",
          status: "reentered",
        },
        {
          key: "lane-session",
          stage: "session",
          label: "Lane Session",
          status: "running",
          detail: {
            laneId: "live_translation",
            sessionStatus: "paused",
            sessionHealth: "degraded",
            latestEventId: "lane-session-docs:pause:150",
            hasObservation: "false",
          },
        },
        {
          key: "lane-mail",
          stage: "mail_loop",
          label: "Lane Mail",
          status: "healthy",
          detail: {
            laneId: "live_translation",
            materializedMailLoopEvidence: "true",
            sourceId: "document_markdown:docs/research/nhm2.md",
            sourceHash: "fnv1a32:goal-docs",
            sourceKind: "docs",
            sourceTextHash: "fnv1a32:goal-source-text",
            sourceTextCharCount: "2048",
            projectionTarget: "docs_chunk",
            accountLocale: "es-US",
            targetLanguage: "es",
            chunkId: "chunk-goal",
            chunkIndex: "0",
            dedupeKey: "document_markdown:docs/research/nhm2.md:chunk-goal:es",
            sourceEventId: "docs:event-mail",
            sourceEventMs: "160",
            observedAtMs: "190",
            freshnessStatus: "fresh",
            sessionControlKey:
              "lane-session-docs::document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es-US::es",
            sourceBindingKey: "document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es-US::es",
            sourceIdentityKey:
              "document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::fnv1a32:goal-source-text::2048::docs::docs_chunk::es-US::es",
            latestMailLoopObservationKey:
              "document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es::chunk-goal::ask:lane:translation:obs:projection:receipt",
            observationRef: "ask:lane:translation:obs",
            observationLaneSessionId: "lane-session-docs",
            mailboxWakeExpected: "true",
            decisionWakeExpected: "false",
            contextRole: "tool_evidence",
          },
        },
        {
          key: "lane-goal-binding",
          stage: "goal_binding",
          label: "Goal Lane",
          status: "bound",
          detail: {
            laneId: "live_translation",
            goalId: "goal:account-language",
            goalBindingId: "goal-binding-docs",
            goalBindingKey: "goal:account-language::goal-binding-docs::lane-session-docs::live_translation",
            laneSessionId: "lane-session-docs",
            sessionControlKey:
              "lane-session-docs::document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es-US::es",
            sourceBindingKey: "document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es-US::es",
            sourceIdentityKey:
              "document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::fnv1a32:goal-source-text::2048::docs::docs_chunk::es-US::es",
            latestMailLoopObservationKey:
              "document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es::chunk-goal::ask:lane:translation:obs:projection:receipt",
            sourceId: "document_markdown:docs/research/nhm2.md",
            sourceHash: "fnv1a32:goal-docs",
            sourceKind: "docs",
            sourceTextHash: "fnv1a32:goal-source-text",
            sourceTextCharCount: "2048",
            projectionTarget: "docs_chunk",
            accountLocale: "es-US",
            targetLanguage: "es",
            chunkId: "u0001",
            chunkIndex: "0",
            dedupeKey: "document_markdown:docs/research/nhm2.md:u0001:es",
            observationRef: "obs:translation-goal-binding",
            receiptRef: "receipt:translation-goal-binding",
            reportSummaryText:
              "goal lane wake on salience; reason goal_binding_policy_requests_wake_on_salience",
            contextRole: "tool_evidence",
            terminalAuthorityStatus: "pending_helix_terminal_authority",
          },
        },
        {
          key: "lane-goal-dispatch-plan",
          stage: "goal_dispatch_plan",
          label: "Goal Dispatch",
          status: "pending",
          detail: {
            laneId: "live_translation",
            laneSessionId: "lane-session-docs",
            sessionControlKey:
              "lane-session-docs::document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es-US::es",
            sourceBindingKey: "document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es-US::es",
            sourceIdentityKey:
              "document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::fnv1a32:goal-source-text::2048::docs::docs_chunk::es-US::es",
            latestMailLoopObservationKey:
              "document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es::chunk-goal::ask:lane:translation:obs:projection:receipt",
          },
        },
        {
          key: "lane-goal-dispatch-admission",
          stage: "goal_dispatch_admission",
          label: "Goal Admission",
          status: "pending",
          detail: {
            laneId: "live_translation",
            laneSessionId: "lane-session-docs",
            sessionControlKey:
              "lane-session-docs::document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es-US::es",
            sourceBindingKey: "document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es-US::es",
            sourceIdentityKey:
              "document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::fnv1a32:goal-source-text::2048::docs::docs_chunk::es-US::es",
            latestMailLoopObservationKey:
              "document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es::chunk-goal::ask:lane:translation:obs:projection:receipt",
          },
        },
        {
          key: "lane-goal-dispatch-readiness",
          stage: "goal_dispatch_readiness",
          label: "Goal Readiness",
          status: "pending",
          detail: {
            laneId: "live_translation",
            laneSessionId: "lane-session-docs",
            sessionControlKey:
              "lane-session-docs::document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es-US::es",
            sourceBindingKey: "document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es-US::es",
            sourceIdentityKey:
              "document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::fnv1a32:goal-source-text::2048::docs::docs_chunk::es-US::es",
            latestMailLoopObservationKey:
              "document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::docs_chunk::es::chunk-goal::ask:lane:translation:obs:projection:receipt",
            wakeKind: "mailbox_wake",
            liveMailLoopRequiredCount: "1",
            terminalAuthorityRequiredCount: "0",
            anyLiveMailLoopRequired: "true",
            anyTerminalAuthorityRequired: "false",
          },
        },
        {
          key: "terminal-selected",
          stage: "terminal_selected",
          label: "Terminal",
          status: "final",
          detail: {
            laneId: "helix_terminal_authority",
            observationRef: "ask:lane:translation:obs",
            receiptRef: "ask:lane:translation:obs:projection:receipt",
            contextRole: "tool_evidence",
            terminalAuthorityStatus: "authorized_by_helix_provider_candidate_bridge",
          },
        },
      ],
    });
    expect(formatHelixAskConsoleCapabilityLaneSummaryText(snapshot.capabilityLaneSummary)).toBe(
      "Lane timeline: visible 1 / requested 1 / executed 3 / backend 1 / observed 1 / receipt 1 / re-entered 1 / session 1 / mail 1 / observed mail 1 / mailbox wake 1 / goal 1 / observed goal 1 / observed lane activity 2 / dispatch plan 1 / dispatch admission 1 / dispatch readiness 1 / terminal selected 1 / visible receipt refs 1 / evidence receipt refs 1. Status: terminal selected. Runtime codex. Lane live_translation. Backend live_translation.local_runtime. Path: visible > requested > backend > observed > receipt > reentered > session > mail > goal > goal_plan > goal_admission > goal_readiness > terminal_selected. Visible lanes are available, not executed.",
    );
    expect(snapshot.capabilityLaneSummary.mailboxWakeExpectedCount).toBe(1);
    expect(snapshot.capabilityLaneSummary.decisionWakeExpectedCount).toBe(0);
    expect(snapshot.capabilityLaneSummary.runtimeAgentProviders).toEqual(["codex"]);
    expect(snapshot.capabilityLaneSummary.laneIds).toEqual(["live_translation"]);
    expect(snapshot.capabilityLaneSummary.backendProviders).toEqual(["live_translation.local_runtime"]);
    expect(snapshot.capabilityLaneRows.find((row) => row.key === "lane-visible")?.detailText).toContain(
      "Visible only, not executed",
    );
    expect(snapshot.capabilityLaneRows.find((row) => row.key === "lane-visible")?.detail).toMatchObject({
      executionState: "available_only",
    });
    expect(snapshot.capabilityLaneRows.find((row) => row.key === "lane-requested")?.detail).toMatchObject({
      executionState: "requested_not_executed",
    });
    expect(snapshot.capabilityLaneRows.find((row) => row.key === "lane-backend")?.detail).toMatchObject({
      executionState: "backend_selected",
    });
    expect(snapshot.capabilityLaneRows.find((row) => row.key === "lane-reentered")?.detail).toMatchObject({
      executionState: "reentered",
    });
    expect(snapshot.capabilityLaneRows.find((row) => row.key === "lane-observed")?.detailText).toContain(
      "Provider codex | Adapter helix_agent_provider_edge | Lane live_translation | Capability live_translation.translate_text | Backend live_translation.local_runtime",
    );
    expect(snapshot.capabilityLaneRows.find((row) => row.key === "lane-observed")?.detailText).toContain(
      "Observation ask:lane:translation:obs | Receipt ask:lane:translation:obs:projection:receipt",
    );
    expect(snapshot.capabilityLaneRows.find((row) => row.key === "lane-observed")?.detailText).toContain(
      "Re-entry observation_packet_required_for_provider_reentry",
    );
    expect(snapshot.capabilityLaneRows.find((row) => row.key === "lane-observed")?.detailText).toContain(
      "Context role tool_evidence | Authority not_terminal_authority",
    );
    expect(snapshot.capabilityLaneRows.find((row) => row.key === "lane-receipt")?.detailText).toContain(
      "Lane executed true",
    );
    expect(snapshot.capabilityLaneRows.find((row) => row.key === "lane-reentered")?.detailText).toContain(
      "Lane executed true | Observation re-entered true",
    );
    expect(snapshot.capabilityLaneRows.find((row) => row.key === "lane-observed")?.detailText).toContain(
      "Source text sha256:source-text-a | Source chars 2048 | Target es | Source event docs:event-1 | Source event ms 100 | Observed 125 | Freshness stale | Cancelled",
    );
    expect(snapshot.capabilityLaneRows.find((row) => row.key === "lane-goal-binding")?.detailText).toContain(
      "Source document_markdown:docs/research/nhm2.md | Source hash fnv1a32:goal-docs | Source kind docs | Source text fnv1a32:goal-source-text | Source chars 2048 | Projection docs_chunk | Account locale es-US | Target es | Chunk u0001 | Chunk index 0 | Dedupe document_markdown:docs/research/nhm2.md:u0001:es",
    );
    expect(snapshot.capabilityLaneRows.find((row) => row.key === "lane-goal-binding")?.detailText).toContain(
      "Source identity key document_markdown:docs/research/nhm2.md::fnv1a32:goal-docs::fnv1a32:goal-source-text::2048::docs::docs_chunk::es-US::es",
    );
    expect(snapshot.capabilityLaneRows.find((row) => row.key === "lane-goal-binding")?.detailText).toContain(
      "Report goal lane wake on salience; reason goal_binding_policy_requests_wake_on_salience",
    );
    expect(snapshot.capabilityLaneRows.find((row) => row.key === "lane-mail")?.detailText).toContain(
      "Mailbox wake expected true | Decision wake expected false",
    );
    expect(snapshot.capabilityLaneRows.find((row) => row.key === "lane-goal-dispatch-readiness")?.detailText)
      .toContain(
        "Wake mailbox_wake | Live mail loop required 1 | Terminal authority required 0 | Any live mail loop required true | Any terminal authority required false",
      );
    expect(snapshot.capabilityLaneRows.find((row) => row.key === "terminal-selected")?.detailText).toContain(
      "Context role tool_evidence | Authority authorized_by_helix_provider_candidate_bridge",
    );
    expect(snapshot.activeRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: "row-1",
        source: "agent_work",
        label: "Model Re-entry",
        status: "running",
        meta: "source live_provider_transcript | reasoning | model_reentry",
      }),
    ]));
  });

  it("marks lane manifest rows as visible only until a lane is actually requested or executed", () => {
    const snapshot = buildHelixAskConsoleAssemblyDebugSnapshot({
      askBusy: true,
      activeTurnId: "ask:turn-visible-only",
      activeTraceId: "trace-visible-only",
      activeStartedAtMs: 100,
      activeQuestion: "what lanes can you see?",
      totalLiveEventCount: 1,
      retainedLiveEventCount: 1,
      activeLiveEventCount: 1,
      visibleActiveTurnStreamRows: [
        {
          key: "lane-visible",
          source: "agent_work",
          label: "Lane Visible",
          text: "Lane visible: live_translation.",
          meta: "source model_visible_capability_lane_manifest | lane_visible",
          status: "available",
          tone: "working",
          evidenceRefs: [],
        },
      ],
      replies: [],
      latestReplyId: null,
      streamIngress: createHelixAskConsoleStreamIngressDebug({
        turnId: "ask:turn-visible-only",
        traceId: "trace-visible-only",
        startedAtMs: 100,
      }),
      activeStreamDom: { rowCount: 1 },
    });

    expect(snapshot.capabilityLaneSummary).toMatchObject({
      lifecycleStatus: "visible_only",
      visibleCount: 1,
      requestedCount: 0,
      executedCount: 0,
      backendSelectedCount: 0,
      observedCount: 0,
      reenteredCount: 0,
      terminalSelectedCount: 0,
      terminalRejectedCount: 0,
      visibleLaneDoesNotMeanExecuted: true,
    });
    expect(snapshot.capabilityLaneRows).toEqual([
      expect.objectContaining({
        key: "lane-visible",
        stage: "visible",
        status: "available",
        detailText: expect.stringContaining("Visible only, not executed"),
      }),
    ]);
    expect(formatHelixAskConsoleCapabilityLaneRowChips(snapshot.capabilityLaneRows[0]!.detail)).toContain(
      "Execution available only",
    );
  });

  it("marks persistent lane session activity without pretending a one-shot lane executed", () => {
    const snapshot = buildHelixAskConsoleAssemblyDebugSnapshot({
      askBusy: true,
      activeTurnId: "ask:turn-session-only",
      activeTraceId: "trace-session-only",
      activeStartedAtMs: 100,
      activeQuestion: "keep translating this document",
      totalLiveEventCount: 1,
      retainedLiveEventCount: 1,
      activeLiveEventCount: 1,
      visibleActiveTurnStreamRows: [
        {
          key: "lane-session",
          source: "agent_work",
          label: "Lane Session",
          text: "Lane session: live_translation.",
          meta: "source capability_lane_session_debug_summaries | live_translation | lane_session | session status running | session health healthy | action record_observation | session control key lane-session-docs::docs:nhm2::sha256:doc-a::docs_viewer.inline_translation::es-US::es | source binding key docs:nhm2::sha256:doc-a::docs_viewer.inline_translation::es-US::es | latest source binding key docs:nhm2::sha256:doc-b::docs_viewer.inline_translation::es-US::es | source identity key docs:nhm2::sha256:doc-a::sha256:source-text-a::2048::docs::docs_viewer.inline_translation::es-US::es | latest source identity key docs:nhm2::sha256:doc-a::sha256:source-text-b::1024::docs::docs_viewer.inline_translation::es-US::es | observation key docs:nhm2::sha256:doc-a::docs_viewer.inline_translation::es::chunk-1::ask:lane:translation:obs:projection:receipt",
          status: "running",
          tone: "working",
          evidenceRefs: [
            "lane-session-docs::docs:nhm2::sha256:doc-a::docs_viewer.inline_translation::es-US::es",
            "docs:nhm2::sha256:doc-a::docs_viewer.inline_translation::es-US::es",
            "docs:nhm2::sha256:doc-a::sha256:source-text-a::2048::docs::docs_viewer.inline_translation::es-US::es",
          ],
        },
      ],
      replies: [],
      latestReplyId: null,
      streamIngress: createHelixAskConsoleStreamIngressDebug({
        turnId: "ask:turn-session-only",
        traceId: "trace-session-only",
        startedAtMs: 100,
      }),
      activeStreamDom: { rowCount: 1 },
    });

    expect(snapshot.capabilityLaneSummary).toMatchObject({
      lifecycleStatus: "session_active",
      requestedCount: 0,
      executedCount: 0,
      backendSelectedCount: 0,
      observedCount: 0,
      reenteredCount: 0,
      sessionCount: 1,
      observedSessionCount: 1,
      observedLaneActivityCount: 1,
      terminalSelectedCount: 0,
      terminalRejectedCount: 0,
      visibleLaneDoesNotMeanExecuted: true,
    });
    expect(snapshot.capabilityLaneRows[0]?.detail).toMatchObject({
      laneId: "live_translation",
      sessionStatus: "running",
      sessionHealth: "healthy",
      sessionLifecycleAction: "record_observation",
      sessionControlKey:
        "lane-session-docs::docs:nhm2::sha256:doc-a::docs_viewer.inline_translation::es-US::es",
      sourceBindingKey: "docs:nhm2::sha256:doc-a::docs_viewer.inline_translation::es-US::es",
      latestSourceBindingKey: "docs:nhm2::sha256:doc-b::docs_viewer.inline_translation::es-US::es",
      sourceIdentityKey:
        "docs:nhm2::sha256:doc-a::sha256:source-text-a::2048::docs::docs_viewer.inline_translation::es-US::es",
      latestSourceIdentityKey:
        "docs:nhm2::sha256:doc-a::sha256:source-text-b::1024::docs::docs_viewer.inline_translation::es-US::es",
      latestObservationKey:
        "docs:nhm2::sha256:doc-a::docs_viewer.inline_translation::es::chunk-1::ask:lane:translation:obs:projection:receipt",
      evidenceRefs: [
        "lane-session-docs::docs:nhm2::sha256:doc-a::docs_viewer.inline_translation::es-US::es",
        "docs:nhm2::sha256:doc-a::docs_viewer.inline_translation::es-US::es",
        "docs:nhm2::sha256:doc-a::sha256:source-text-a::2048::docs::docs_viewer.inline_translation::es-US::es",
      ],
    });
    expect(snapshot.capabilityLaneRows[0]?.detailText).toContain(
      "Session status running | Session health healthy | Action record_observation | Session control lane-session-docs::docs:nhm2::sha256:doc-a::docs_viewer.inline_translation::es-US::es",
    );
    expect(snapshot.capabilityLaneRows[0]?.detailText).toContain(
      "Latest source identity key docs:nhm2::sha256:doc-a::sha256:source-text-b::1024::docs::docs_viewer.inline_translation::es-US::es",
    );
    expect(snapshot.capabilityLaneRows[0]?.detailText).toContain(
      "Latest source binding key docs:nhm2::sha256:doc-b::docs_viewer.inline_translation::es-US::es",
    );
    expect(snapshot.capabilityLaneRows[0]?.detailText).toContain("Evidence refs 3");
  });

  it("marks lane terminal authority rejections separately from selected terminals", () => {
    const snapshot = buildHelixAskConsoleAssemblyDebugSnapshot({
      askBusy: true,
      activeTurnId: "ask:turn-terminal-rejected",
      activeTraceId: "trace-terminal-rejected",
      activeStartedAtMs: 100,
      activeQuestion: "translate this into Spanish",
      totalLiveEventCount: 3,
      retainedLiveEventCount: 3,
      activeLiveEventCount: 3,
      visibleActiveTurnStreamRows: [
        {
          key: "lane-visible",
          source: "agent_work",
          label: "Lane Visible",
          text: "Lane visible: live_translation.",
          meta: "source model_visible_capability_lane_manifest | lane_visible",
          status: "available",
          tone: "working",
          evidenceRefs: [],
        },
        {
          key: "lane-observed",
          source: "agent_work",
          label: "Lane Observation",
          text: "Lane observation produced a translation receipt.",
          meta: "source capability_lane_call_results | lane_observation",
          status: "succeeded",
          tone: "observation",
          evidenceRefs: ["ask:lane:translation:obs"],
        },
        {
          key: "terminal-rejected",
          source: "final",
          label: "Terminal",
          text: "Terminal authority rejected direct lane output.",
          meta: "source capability_lane_call_results | terminal_rejected | terminal_authority_missing",
          status: "rejected",
          tone: "error",
          evidenceRefs: ["ask:lane:translation:obs"],
        },
      ],
      replies: [],
      latestReplyId: null,
      streamIngress: createHelixAskConsoleStreamIngressDebug({
        turnId: "ask:turn-terminal-rejected",
        traceId: "trace-terminal-rejected",
        startedAtMs: 100,
      }),
      activeStreamDom: { rowCount: 3 },
    });

    expect(snapshot.capabilityLaneSummary).toMatchObject({
      lifecycleStatus: "terminal_rejected",
      visibleCount: 1,
      executedCount: 1,
      observedCount: 1,
      terminalSelectedCount: 0,
      terminalRejectedCount: 1,
      terminalAuthorityRejectedCount: 0,
      visibleLaneDoesNotMeanExecuted: true,
    });
    expect(snapshot.capabilityLaneRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: "terminal-rejected",
        stage: "terminal_rejected",
        label: "Terminal",
        status: "rejected",
      }),
    ]));
  });

  it("counts rejected lane authority status separately from rejected terminal rows", () => {
    const snapshot = buildHelixAskConsoleAssemblyDebugSnapshot({
      askBusy: true,
      activeTurnId: "ask:turn-authority-rejected",
      activeTraceId: "trace-authority-rejected",
      activeStartedAtMs: 100,
      activeQuestion: "translate hello to Spanish",
      totalLiveEventCount: 1,
      retainedLiveEventCount: 1,
      activeLiveEventCount: 1,
      visibleActiveTurnStreamRows: [
        {
          key: "lane-observed-authority-rejected",
          source: "agent_work",
          label: "Lane Observation",
          text: "Lane observation produced a non-terminal receipt.",
          meta: JSON.stringify({
            schema: "helix.capability_lane.provider_timeline_event.v1",
            stage: "lane_observation",
            status: "succeeded",
            selected_runtime_agent_provider: "codex",
            adapter_boundary: "helix_agent_provider_edge",
            lane_id: "live_translation",
            capability_id: "live_translation.translate_text",
            selected_backend_provider: "live_translation.local_runtime",
            observation_ref: "ask:lane:translation:obs",
            receipt_ref: "ask:lane:translation:receipt",
            context_role: "tool_evidence",
            terminal_authority_status: "terminal_authority_rejected",
            answer_authority: false,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          }),
          status: "succeeded",
          tone: "observation",
          evidenceRefs: ["ask:lane:translation:obs"],
        },
      ],
      replies: [],
      latestReplyId: null,
      streamIngress: createHelixAskConsoleStreamIngressDebug({
        turnId: "ask:turn-authority-rejected",
        traceId: "trace-authority-rejected",
        startedAtMs: 100,
      }),
      activeStreamDom: { rowCount: 1 },
    });

    expect(snapshot.capabilityLaneSummary).toMatchObject({
      lifecycleStatus: "executed",
      executedCount: 1,
      observedCount: 1,
      terminalSelectedCount: 0,
      terminalRejectedCount: 0,
      terminalAuthorityRejectedCount: 1,
    });
    expect(formatHelixAskConsoleCapabilityLaneSummaryText(snapshot.capabilityLaneSummary)).toContain(
      "authority rejected 1",
    );
    expect(snapshot.capabilityLaneRows[0]?.detail).toMatchObject({
      terminalAuthorityStatus: "terminal_authority_rejected",
      answerAuthority: "false",
      terminalEligible: "false",
      assistantAnswer: "false",
      rawContentIncluded: "false",
    });
    expect(snapshot.capabilityLaneRows[0]?.detailText).toContain("Context role tool_evidence");
    expect(snapshot.capabilityLaneRows[0]?.detailText).toContain("Authority terminal_authority_rejected");
  });

  it("marks mail-loop and goal-bound lane activity as lifecycle states", () => {
    const mailLoopSnapshot = buildHelixAskConsoleAssemblyDebugSnapshot({
      askBusy: true,
      activeTurnId: "ask:turn-mail-loop",
      activeTraceId: "trace-mail-loop",
      activeStartedAtMs: 100,
      activeQuestion: "watch translated source events",
      totalLiveEventCount: 1,
      retainedLiveEventCount: 1,
      activeLiveEventCount: 1,
      visibleActiveTurnStreamRows: [
        {
          key: "lane-mail",
          source: "agent_work",
          label: "Lane Mail",
          text: "Lane mail loop: live_translation.",
          meta: "source capability_lane_mail_loop_debug_summaries | lane_mail_loop",
          status: "healthy",
          tone: "observation",
          evidenceRefs: [],
        },
      ],
      replies: [],
      latestReplyId: null,
      streamIngress: createHelixAskConsoleStreamIngressDebug({
        turnId: "ask:turn-mail-loop",
        traceId: "trace-mail-loop",
        startedAtMs: 100,
      }),
      activeStreamDom: { rowCount: 1 },
    });
    const goalSnapshot = buildHelixAskConsoleAssemblyDebugSnapshot({
      askBusy: true,
      activeTurnId: "ask:turn-goal-bound",
      activeTraceId: "trace-goal-bound",
      activeStartedAtMs: 100,
      activeQuestion: "keep this translation goal active",
      totalLiveEventCount: 1,
      retainedLiveEventCount: 1,
      activeLiveEventCount: 1,
      visibleActiveTurnStreamRows: [
        {
          key: "lane-goal",
          source: "agent_work",
          label: "Goal Lane",
          text: "Goal lane binding: live_translation.",
          meta:
            "source capability_lane_goal_binding_debug_summaries | live_translation | lane_goal_binding | report action surface_badge | report reason goal_binding_policy_surfaces_badge_without_terminal_answer | quiet behavior applied true | wake expected false | mailbox wake expected false | decision wake expected false | surface badge expected true | terminal report requested false | terminal report authorized false",
          status: "bound",
          tone: "checkpoint",
          evidenceRefs: [],
        },
      ],
      replies: [],
      latestReplyId: null,
      streamIngress: createHelixAskConsoleStreamIngressDebug({
        turnId: "ask:turn-goal-bound",
        traceId: "trace-goal-bound",
        startedAtMs: 100,
      }),
      activeStreamDom: { rowCount: 1 },
    });

    expect(mailLoopSnapshot.capabilityLaneSummary).toMatchObject({
      lifecycleStatus: "mail_loop_active",
      mailLoopCount: 1,
      observedMailLoopCount: 0,
      observedLaneActivityCount: 0,
      requestedCount: 0,
      executedCount: 0,
      observedCount: 0,
      visibleLaneDoesNotMeanExecuted: true,
    });
    expect(goalSnapshot.capabilityLaneSummary).toMatchObject({
      lifecycleStatus: "goal_bound",
      goalBindingCount: 1,
      observedGoalBindingCount: 0,
      observedLaneActivityCount: 0,
      requestedCount: 0,
      executedCount: 0,
      observedCount: 0,
      visibleLaneDoesNotMeanExecuted: true,
    });
    expect(goalSnapshot.capabilityLaneRows[0]?.detail).toMatchObject({
      reportAction: "surface_badge",
      reportReason: "goal_binding_policy_surfaces_badge_without_terminal_answer",
      quietBehaviorApplied: "true",
      wakeExpected: "false",
      mailboxWakeExpected: "false",
      decisionWakeExpected: "false",
      surfaceBadgeExpected: "true",
      terminalReportRequested: "false",
      terminalReportAuthorized: "false",
    });
    expect(goalSnapshot.capabilityLaneRows[0]?.detailText).toContain(
      "Report action surface_badge | Report reason goal_binding_policy_surfaces_badge_without_terminal_answer | Quiet applied true | Wake expected false | Mailbox wake expected false | Decision wake expected false | Surface badge expected true",
    );
  });

  it("counts receipt-only mail-loop and goal-bound rows as observed lane activity", () => {
    const snapshot = buildHelixAskConsoleAssemblyDebugSnapshot({
      askBusy: true,
      activeTurnId: "ask:turn-receipt-only-lane-activity",
      activeTraceId: "trace-receipt-only-lane-activity",
      activeStartedAtMs: 100,
      activeQuestion: "keep translated document receipts visible",
      totalLiveEventCount: 2,
      retainedLiveEventCount: 2,
      activeLiveEventCount: 2,
      visibleActiveTurnStreamRows: [
        {
          key: "lane-mail-receipt-only",
          source: "agent_work",
          label: "Lane Mail",
          text: "Lane mail loop recorded a receipt.",
          meta: JSON.stringify({
            schema: "helix.capability_lane.provider_timeline_event.v1",
            stage: "lane_mail_loop",
            selected_runtime_agent_provider: "codex",
            adapter_boundary: "helix_agent_provider_edge",
            lane_id: "live_translation",
            capability_id: "live_translation.translate_text",
            status: "created",
            selected_backend_provider: "live_translation.local_runtime",
            observation_ref: null,
            receipt_ref: "receipt:lane-mail-loop-docs-only",
            latest_mail_loop_observation_key:
              "docs:nhm2::fnv1a32:mail::docs_chunk::es::u0001::receipt:lane-mail-loop-docs-only",
            has_observation: true,
            mailbox_wake_expected: true,
            decision_wake_expected: false,
            context_role: "tool_evidence",
            terminal_authority_status: "pending_helix_terminal_authority",
            answer_authority: false,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          }),
          status: "created",
          tone: "observation",
          evidenceRefs: [],
        },
        {
          key: "lane-goal-receipt-only",
          source: "agent_work",
          label: "Goal Lane",
          text: "Goal-bound lane recorded a receipt.",
          meta: JSON.stringify({
            schema: "helix.capability_lane.provider_timeline_event.v1",
            stage: "lane_goal_binding",
            selected_runtime_agent_provider: "codex",
            adapter_boundary: "helix_agent_provider_edge",
            lane_id: "live_translation",
            goal_id: "goal:account-language",
            goal_binding_id: "goal-binding-translate-docs",
            lane_session_id: "lane-session-docs",
            status: "active",
            selected_backend_provider: "live_translation.local_runtime",
            observation_ref: null,
            receipt_ref: "receipt:goal-binding-docs-only",
            latest_mail_loop_observation_key:
              "docs:nhm2::fnv1a32:goal::docs_chunk::es::u0001::receipt:goal-binding-docs-only",
            has_observation: true,
            terminal_report_requested: false,
            terminal_report_authorized: false,
            context_role: "tool_evidence",
            terminal_authority_status: "pending_helix_terminal_authority",
            answer_authority: false,
            terminal_eligible: false,
            assistant_answer: false,
            raw_content_included: false,
          }),
          status: "bound",
          tone: "checkpoint",
          evidenceRefs: [],
        },
      ],
      replies: [],
      latestReplyId: null,
      streamIngress: createHelixAskConsoleStreamIngressDebug({
        turnId: "ask:turn-receipt-only-lane-activity",
        traceId: "trace-receipt-only-lane-activity",
        startedAtMs: 100,
      }),
      activeStreamDom: { rowCount: 2 },
    });

    expect(snapshot.capabilityLaneSummary).toMatchObject({
      lifecycleStatus: "goal_bound",
      mailLoopCount: 1,
      observedMailLoopCount: 1,
      goalBindingCount: 1,
      observedGoalBindingCount: 1,
      observedLaneActivityCount: 2,
      receiptCount: 0,
      visibleLaneDoesNotMeanExecuted: true,
    });
    expect(formatHelixAskConsoleCapabilityLaneSummaryText(snapshot.capabilityLaneSummary)).toContain(
      "observed lane activity 2",
    );
    expect(snapshot.capabilityLaneRows[0]?.detailText).toContain("Receipt receipt:lane-mail-loop-docs-only");
    expect(snapshot.capabilityLaneRows[0]?.detailText).toContain("Has observation true");
    expect(snapshot.capabilityLaneRows[1]?.detailText).toContain("Receipt receipt:goal-binding-docs-only");
    expect(snapshot.capabilityLaneRows[1]?.detailText).toContain("Has observation true");
  });

  it("keeps inactive diagnostic rows out of active row counts", () => {
    const snapshot = buildHelixAskConsoleAssemblyDebugSnapshot({
      askBusy: false,
      activeTurnId: "ask:turn-1",
      activeTraceId: "trace-1",
      activeStartedAtMs: 100,
      activeQuestion: "hello",
      totalLiveEventCount: 4,
      retainedLiveEventCount: 4,
      activeLiveEventCount: 4,
      visibleActiveTurnStreamRows: [
        {
          key: "stale-row",
          source: "agent_work",
          label: "Thinking",
          text: "Stale row",
          meta: "source live_provider_transcript",
          status: "running",
          tone: "working",
          evidenceRefs: [],
        },
      ],
      replies: [],
      latestReplyId: null,
      streamIngress: createHelixAskConsoleStreamIngressDebug(),
      activeStreamDom: null,
    });

    expect(snapshot.activeLiveEventCount).toBe(0);
    expect(snapshot.activeRowCount).toBe(0);
    expect(snapshot.renderOrder).toEqual([]);
    expect(snapshot.activeRows).toEqual([]);
    expect(snapshot.capabilityLaneSummary.visibleCount).toBe(0);
    expect(snapshot.capabilityLaneSummary.executedCount).toBe(0);
    expect(snapshot.capabilityLaneSummary.lifecycleStatus).toBe("none");
    expect(snapshot.capabilityLaneRows).toEqual([]);
  });

  it("preserves stream ingress counters without keeping completed turns marked active", () => {
    const streamIngress = createHelixAskConsoleStreamIngressDebug({
      turnId: "ask:turn-1",
      traceId: "trace-1",
      startedAtMs: 100,
    });
    streamIngress.rawStreamPacketCount = 8;
    streamIngress.transcriptPacketCount = 7;
    streamIngress.acceptedLiveEventCount = 6;
    streamIngress.replayedTranscriptEventCount = 0;
    streamIngress.droppedEventCount = 0;

    const snapshot = buildHelixAskConsoleAssemblyDebugSnapshot({
      askBusy: false,
      activeTurnId: "ask:turn-1",
      activeTraceId: "trace-1",
      activeStartedAtMs: 100,
      activeQuestion: "solve 19*23",
      totalLiveEventCount: 6,
      retainedLiveEventCount: 6,
      activeLiveEventCount: 6,
      visibleActiveTurnStreamRows: [
        {
          key: "live-row",
          source: "agent_work",
          label: "Tool Observation",
          text: "Calculator observed 19*23 = 437.",
          meta: "source live_provider_transcript",
          status: "completed",
          tone: "observation",
          evidenceRefs: [],
        },
      ],
      replies: [
        {
          id: "ask:turn-1",
          canonicalKey: "ask:turn-1",
          createdAtMs: 200,
        },
      ],
      latestReplyId: "ask:turn-1",
      streamIngress,
      activeStreamDom: {
        activeStreamMounted: false,
        activeStreamHandoffState: "completed_reply",
        quietGapRowVisible: false,
      },
    });

    expect(snapshot.askBusy).toBe(false);
    expect(snapshot.activeRowCount).toBe(0);
    expect(snapshot.activeRows).toEqual([]);
    expect(snapshot.streamIngress).toMatchObject({
      rawStreamPacketCount: 8,
      transcriptPacketCount: 7,
      acceptedLiveEventCount: 6,
      replayedTranscriptEventCount: 0,
      droppedEventCount: 0,
    });
    expect(snapshot.renderOrder).toEqual([
      expect.objectContaining({
        kind: "completed_reply",
        replyId: "ask:turn-1",
        canonicalKey: "ask:turn-1",
        isLatest: true,
      }),
    ]);
    expect(snapshot.activeStreamDom).toMatchObject({
      activeStreamMounted: false,
      activeStreamHandoffState: "completed_reply",
      quietGapRowVisible: false,
    });
  });
});
