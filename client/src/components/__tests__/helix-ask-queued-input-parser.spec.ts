import { beforeAll, describe, expect, it } from "vitest";
import {
  buildHelixAskHardBackendEntrypointRouteMetadata as buildRecrownedHardBackendEntrypointRouteMetadata,
} from "@/components/helix/ask-console/HelixAskBackendEntrypointPolicy";
import { buildHelixAskSubmitBackendEntrypointRoutePlan } from "@/components/helix/ask-console/HelixAskSubmitBackendEntrypointOptions";

let parseHelixAskQueuedQuestionsInput: typeof import("@/components/helix/HelixAskPill").parseHelixAskQueuedQuestionsInput;
let buildHelixAskRepliesFromChatSession: typeof import("@/components/helix/HelixAskPill").buildHelixAskRepliesFromChatSession;
let buildHelixAskBackendEntrypointRuntimeFingerprint: typeof import("@/components/helix/HelixAskPill").buildHelixAskBackendEntrypointRuntimeFingerprint;
let buildHelixAskHardBackendEntrypointRouteMetadata: typeof import("@/components/helix/HelixAskPill").buildHelixAskHardBackendEntrypointRouteMetadata;
let requiresHelixAskBackendEntrypoint: typeof import("@/components/helix/HelixAskPill").requiresHelixAskBackendEntrypoint;
let resolveHelixAskHardPromptProjectionGuard: typeof import("@/components/helix/HelixAskPill").resolveHelixAskHardPromptProjectionGuard;
let shouldUseHelixAskBackendTurnEntrypoint: typeof import("@/components/helix/HelixAskPill").shouldUseHelixAskBackendTurnEntrypoint;
let buildHelixPillDebugExportEnvelopeFromMasterPayload: typeof import("@/components/helix/HelixAskPill").buildHelixDebugExportEnvelopeFromMasterPayload;
let buildHelixDebugExportEnvelopeFromMasterPayload: typeof import("@/lib/agi/debugExport").buildHelixDebugExportEnvelopeFromMasterPayload;

beforeAll(async () => {
  (globalThis as Record<string, unknown>).__HELIX_ASK_JOB_TIMEOUT_MS__ = "1200000";
  ({
    buildHelixAskBackendEntrypointRuntimeFingerprint,
    buildHelixAskHardBackendEntrypointRouteMetadata,
    buildHelixAskRepliesFromChatSession,
    buildHelixDebugExportEnvelopeFromMasterPayload: buildHelixPillDebugExportEnvelopeFromMasterPayload,
    parseHelixAskQueuedQuestionsInput,
    requiresHelixAskBackendEntrypoint,
    resolveHelixAskHardPromptProjectionGuard,
    shouldUseHelixAskBackendTurnEntrypoint,
  } = await import("@/components/helix/HelixAskPill"));
  ({ buildHelixDebugExportEnvelopeFromMasterPayload } = await import("@/lib/agi/debugExport"));
});

describe("Helix Ask queued input parser", () => {
  it("preserves multiline prompt instructions as one user turn", () => {
    const prompt = [
      "Call scientific-calculator.solve_expression with this exact expression: ((sqrt(81)+ln(e^3))*7-5^2)/2.",
      "",
      "Use the calculator tool, wait for its observation, re-enter the calculator receipt as evidence, then answer from the calculator-backed terminal result only. Do not answer from mental math or a model-synthesized fallback.",
    ].join("\n");

    expect(parseHelixAskQueuedQuestionsInput(prompt)).toEqual([prompt.trim()]);
  });

  it("preserves delimiter-looking text as content instead of creating queued turns", () => {
    const prompt = "First paragraph\n---\nSecond paragraph";

    expect(parseHelixAskQueuedQuestionsInput(prompt)).toEqual([prompt]);
  });

  it("preserves numbered question labels as content instead of creating queued turns", () => {
    const prompt = "Question 1: First turn\nPrompt 2: Second turn";

    expect(parseHelixAskQueuedQuestionsInput(prompt)).toEqual([prompt]);
  });
});

describe("Helix Ask backend entrypoint projection guard", () => {
  const hardCalculatorPrompt =
    "Call scientific-calculator.solve_expression with this exact expression: ((sqrt(81)+ln(e^3))*7-5^2)/2, use the calculator tool, wait for calculator_receipt, re-enter that receipt as evidence, and answer only from the calculator-backed terminal result; do not answer from mental math or model-synthesized fallback.";

  it("classifies explicit tool-family prompts as backend Ask entrypoint required", () => {
    expect(requiresHelixAskBackendEntrypoint(hardCalculatorPrompt)).toBe(true);
    expect(
      requiresHelixAskBackendEntrypoint(
        "Run scholarly-research.lookup_papers, fetch_full_text, and extract_numeric_parameters for Alcubierre metric energy estimates.",
      ),
    ).toBe(true);
    expect(
      requiresHelixAskBackendEntrypoint(
        "Use the Image Lens region tool on the attached image. Inspect the header/caption area first, then inspect each equation block separately.",
      ),
    ).toBe(true);
    expect(requiresHelixAskBackendEntrypoint("What should I cook for dinner tonight?")).toBe(false);
  });

  it("builds submit route plans outside the legacy pill for natural Moral Graph prompts", () => {
    const prompt =
      "Use the Moral Graph to help me reflect on a roommate situation. Someone knew they might not be able to meet a shared payment, but waited until the last moment to say anything.";
    const plan = buildHelixAskSubmitBackendEntrypointRoutePlan({
      question: prompt,
      turnId: "ask:moral-submit-plan",
      threadId: "session:moral-submit-plan",
      manualCanaryEnabled: true,
    });
    const routeMetadata = plan.routeMetadata as Record<string, unknown>;
    const sourceTarget = routeMetadata.source_target_intent as Record<string, unknown>;
    const mandatoryNextTool = routeMetadata.mandatory_next_tool as Record<string, unknown>;

    expect(plan).toMatchObject({
      backendOwnedPastedTextResumeRecall: false,
      hardBackendEntrypointRequired: true,
      forceReasoningDispatch: true,
      useBackendAskTurnEntrypoint: true,
    });
    expect(routeMetadata).toMatchObject({
      source: "hard_tool_backend_entrypoint",
      sourceTarget: "moral_graph",
      requiredToolFamily: "moral_graph",
    });
    expect(sourceTarget).toMatchObject({
      target_source: "moral_graph",
      target_kind: "moral_graph_reflection",
      strength: "hard",
      must_enter_backend_ask: true,
      allow_client_shortcut: false,
    });
    expect(mandatoryNextTool).toMatchObject({
      tool_name: "moral-graph.reflect_context",
      required_tool_family: "moral_graph",
    });
  });

  it("builds hard backend Ask route metadata for Image Lens region prompts", () => {
    const prompt =
      "Use the Image Lens region tool on the attached image. Inspect the header/caption area first, then inspect each equation block separately.";
    const metadata = buildRecrownedHardBackendEntrypointRouteMetadata({
      question: prompt,
      turnId: "ask:image-lens-turn",
      threadId: "session-image-lens",
    }) as Record<string, unknown>;
    const sourceTarget = metadata.source_target_intent as Record<string, unknown>;
    const mandatoryNextTool = metadata.mandatory_next_tool as Record<string, unknown>;

    expect(metadata.source).toBe("hard_tool_backend_entrypoint");
    expect(metadata.sourceTarget).toBe("scientific_image_evidence");
    expect(metadata.requiredToolFamily).toBe("visual_analysis");
    expect(sourceTarget).toMatchObject({
      schema: "helix.ask_source_target_intent.v1",
      target_source: "scientific_image_evidence",
      target_kind: "scientific_image_evidence_sidecar",
      strength: "hard",
      must_enter_backend_ask: true,
      allow_client_shortcut: false,
      allow_no_tool_direct: false,
      precedence_reason: "hard_tool_family_backend_entrypoint_required",
    });
    expect(mandatoryNextTool).toMatchObject({
      tool_name: "visual_analysis.inspect_image_region",
      selected_capability: "visual_analysis.inspect_image_region",
      required_tool_family: "visual_analysis",
    });
  });

  it("does not treat tool-like quoted translation payloads as backend tool requests", () => {
    const prompt =
      'translate to japanese "I don\'t see a voice/speak-out-loud tool admitted for this turn. The available Helix workstation capabilities include live_env.request_interim_voice_callout, calculator, docs/search, repo search, web search, panel open/focus, and status/context observation."';

    expect(requiresHelixAskBackendEntrypoint(prompt)).toBe(false);
    expect(
      buildHelixAskHardBackendEntrypointRouteMetadata({
        question: prompt,
        turnId: "ask:quoted-translation",
        threadId: "session-quoted-translation",
      }),
    ).toBeNull();
  });

  it("keeps backend entrypoint admission when verification is requested outside a quoted translation payload", () => {
    const prompt =
      'translate to japanese "I don\'t see live_env.request_interim_voice_callout" and verify whether that capability is available in this runtime';

    expect(requiresHelixAskBackendEntrypoint(prompt)).toBe(true);
    const metadata = buildHelixAskHardBackendEntrypointRouteMetadata({
      question: prompt,
      turnId: "ask:quoted-translation-verify",
      threadId: "session-quoted-translation-verify",
    }) as Record<string, unknown>;

    expect(metadata.source).toBe("hard_tool_backend_entrypoint");
    expect(metadata.requiredToolFamily).toBe("live_env");
  });

  it("builds hard backend Ask route metadata for explicit calculator tool prompts", () => {
    const metadata = buildHelixAskHardBackendEntrypointRouteMetadata({
      question: hardCalculatorPrompt,
      turnId: "ask:calculator-turn",
      threadId: "session-1",
    }) as Record<string, unknown>;
    const sourceTarget = metadata.source_target_intent as Record<string, unknown>;
    const mandatoryNextTool = metadata.mandatory_next_tool as Record<string, unknown>;

    expect(metadata.source).toBe("hard_tool_backend_entrypoint");
    expect(metadata.sourceTarget).toBe("calculator_stream");
    expect(metadata.requiredToolFamily).toBe("calculator");
    expect(sourceTarget).toMatchObject({
      schema: "helix.ask_source_target_intent.v1",
      target_source: "calculator_stream",
      target_kind: "calculator_stream",
      strength: "hard",
      must_enter_backend_ask: true,
      allow_client_shortcut: false,
      allow_no_tool_direct: false,
      precedence_reason: "hard_tool_family_backend_entrypoint_required",
    });
    expect(sourceTarget.suppressed_routes).toEqual(
      expect.arrayContaining(["durable_chat_session", "client_projection", "evidence_finalization_fallback", "no_tool_direct"]),
    );
    expect(mandatoryNextTool).toMatchObject({
      schema: "helix.mandatory_next_tool.v1",
      tool_name: "scientific-calculator.solve_expression",
      selected_capability: "scientific-calculator.solve_expression",
      required_tool_family: "calculator",
      terminal_forbidden: true,
      missing_required_evidence: "calculator_receipt",
    });
  });

  it("builds hard backend Ask route metadata for scholarly research tool-chain prompts", () => {
    const metadata = buildHelixAskHardBackendEntrypointRouteMetadata({
      question:
        "Run scholarly-research.lookup_papers, scholarly-research.fetch_full_text, and scholarly-research.extract_numeric_parameters for Alcubierre metric energy estimates.",
      turnId: "ask:scholarly-turn",
      threadId: "session-scholarly",
    }) as Record<string, any>;

    expect(metadata.source).toBe("hard_tool_backend_entrypoint");
    expect(metadata.sourceTarget).toBe("scholarly_research");
    expect(metadata.requiredToolFamily).toBe("scholarly_research");
    expect(metadata.source_target_intent).toMatchObject({
      target_source: "scholarly_research",
      target_kind: "scholarly_research",
      must_enter_backend_ask: true,
      allow_client_shortcut: false,
      allow_no_tool_direct: false,
    });
    expect(metadata.source_target_intent.requested_outputs).toEqual(
      expect.arrayContaining([
        "scholarly_paper_evidence",
        "full_text_observation",
        "numeric_parameter_observation",
      ]),
    );
    expect(metadata.mandatory_next_tool).toMatchObject({
      tool_name: "scholarly-research.lookup_papers",
      required_tool_family: "scholarly_research",
      terminal_forbidden: true,
    });
  });

  it("uses backend Ask turn entrypoint for hard tool prompts even when the manual canary is off", () => {
    expect(
      shouldUseHelixAskBackendTurnEntrypoint({
        manualCanaryEnabled: false,
        hardBackendEntrypointRequired: true,
      }),
    ).toBe(true);
    expect(
      shouldUseHelixAskBackendTurnEntrypoint({
        manualCanaryEnabled: false,
        hardBackendEntrypointRequired: false,
      }),
    ).toBe(false);
  });

  it("classifies backend Ask entrypoint runtime fingerprints without treating calculator as failed", () => {
    const routeMetadata = buildHelixAskHardBackendEntrypointRouteMetadata({
      question: hardCalculatorPrompt,
      turnId: "ask:calculator-turn",
      threadId: "session-1",
    });
    const fingerprint = buildHelixAskBackendEntrypointRuntimeFingerprint({
      submitHandlerSource: "HelixAskPill.runAsk",
      runAskEntered: true,
      hardBackendEntrypointRequired: true,
      useBackendAskTurnEntrypoint: false,
      backendAskCallAttempted: false,
      backendAskCallPath: "askLocal",
      backendAskCallError: null,
      routeMetadata,
      legacyAskLocalBypassed: false,
      askEntrypointObserved: false,
    });

    expect(fingerprint).toMatchObject({
      schema: "helix.backend_ask_entrypoint_runtime_fingerprint.v1",
      client_entrypoint_guard_version: "E81",
      submit_handler_source: "HelixAskPill.runAsk",
      runAsk_entered: true,
      hard_backend_entrypoint_required: true,
      use_backend_ask_turn_entrypoint: false,
      backend_ask_call_attempted: false,
      backend_ask_call_path: "askLocal",
      route_metadata_source: "hard_tool_backend_entrypoint",
      mandatory_next_tool_name: "scientific-calculator.solve_expression",
      legacy_ask_local_bypassed: false,
      first_broken_rail: "backend_ask_entrypoint",
      repair_target: "prompt_submit_entrypoint",
      assistant_answer: false,
    });
  });

  it("classifies backend debug materialization separately once backend Ask was attempted", () => {
    const fingerprint = buildHelixAskBackendEntrypointRuntimeFingerprint({
      submitHandlerSource: "HelixAskPill.runAsk",
      runAskEntered: true,
      hardBackendEntrypointRequired: true,
      useBackendAskTurnEntrypoint: true,
      backendAskCallAttempted: true,
      backendAskCallPath: "runAskTurn",
      backendAskCallError: "stream failed",
      routeMetadata: null,
      legacyAskLocalBypassed: true,
      askEntrypointObserved: false,
    });

    expect(fingerprint.first_broken_rail).toBe("backend_debug_materialization");
    expect(fingerprint.repair_target).toBe("debug_export_bridge");
    expect(fingerprint.backend_ask_call_attempted).toBe(true);
    expect(fingerprint.legacy_ask_local_bypassed).toBe(true);
  });

  it("demotes projection layers for hard prompts when no server terminal exists", () => {
    const guard = resolveHelixAskHardPromptProjectionGuard({
      hardBackendEntrypointRequired: true,
      backendAskCallAttempted: true,
      serverTerminalText: null,
      serverTerminalSource: "legacy_shadow",
      currentBrokenRail: "backend_debug_materialization",
      currentRepairTarget: "debug_export_bridge",
    });

    expect(guard).toMatchObject({
      schema: "helix.hard_prompt_projection_guard.v1",
      client_projection_policy_version: "E80",
      projection_allowed: false,
      selected_failure_code: "backend_debug_materialization",
      selected_failure_text: "Backend Ask was reached, but no server terminal artifact or debug artifact was materialized for this turn.",
      first_broken_rail: "backend_debug_materialization",
      repair_target: "debug_export_bridge",
      assistant_answer: false,
    });
    expect(guard?.demoted_projection_layers).toEqual(
      expect.arrayContaining(["durable_chat_session", "client_projection", "evidence_finalization_fallback"]),
    );
  });

  it("allows projection for hard prompts only when a non-legacy server terminal source exists", () => {
    const guard = resolveHelixAskHardPromptProjectionGuard({
      hardBackendEntrypointRequired: true,
      backendAskCallAttempted: true,
      serverTerminalText: "Calculator-backed result.",
      serverTerminalSource: "terminal_answer_authority",
    });

    expect(guard).toMatchObject({
      client_projection_policy_version: "E80",
      projection_allowed: true,
      allowed_projection_source: "terminal_answer_authority",
      selected_failure_code: null,
      first_broken_rail: null,
    });
  });

  it("does not build hard backend Ask route metadata for ordinary chat", () => {
    expect(
      buildHelixAskHardBackendEntrypointRouteMetadata({
        question: "What should I cook for dinner tonight?",
        turnId: "ask:ordinary-turn",
        threadId: "session-ordinary",
      }),
    ).toBeNull();
  });

  it("suppresses durable chat projection for hard calculator prompts without backend receipts", () => {
    const replies = buildHelixAskRepliesFromChatSession({
      id: "session-1",
      title: "Helix Ask",
      createdAt: "2026-06-16T00:00:00.000Z",
      updatedAt: "2026-06-16T00:00:01.000Z",
      personaId: "default",
      messages: [
        {
          id: "user-1",
          role: "user",
          content: hardCalculatorPrompt,
          at: "2026-06-16T00:00:00.000Z",
          tokens: 1,
        },
        {
          id: "assistant-1",
          role: "assistant",
          content: "I need retrieval before finalizing this claim.",
          at: "2026-06-16T00:00:01.000Z",
          tokens: 1,
        },
      ],
    } as never);

    expect(replies).toEqual([]);
  });

  it("allows ordinary durable chat projections that do not require the Ask solver entrypoint", () => {
    const [reply] = buildHelixAskRepliesFromChatSession({
      id: "session-2",
      title: "Helix Ask",
      createdAt: "2026-06-16T00:00:00.000Z",
      updatedAt: "2026-06-16T00:00:01.000Z",
      personaId: "default",
      messages: [
        {
          id: "user-1",
          role: "user",
          content: "Say hello in one sentence.",
          at: "2026-06-16T00:00:00.000Z",
          tokens: 1,
        },
        {
          id: "assistant-1",
          role: "assistant",
          content: "Hello.",
          at: "2026-06-16T00:00:01.000Z",
          tokens: 1,
        },
      ],
    } as never);

    expect(reply.content).toBe("Hello.");
    expect(reply.ok).toBe(true);
    expect(reply.final_answer_source).toBe("durable_chat_session");
    expect(reply.debug?.ask_entrypoint_required).toBe(false);
  });

  it("does not project stale retrieval fallback as a quoted translation answer", () => {
    const prompt =
      'translate to japanese "I don\'t see a voice/speak-out-loud tool admitted for this turn. The available Helix workstation capabilities include live_env.request_interim_voice_callout, calculator, docs/search, repo search, web search, panel open/focus, and status/context observation."';
    const [reply] = buildHelixAskRepliesFromChatSession({
      id: "session-quoted-translation-stale-fallback",
      title: "Helix Ask",
      createdAt: "2026-06-16T00:00:00.000Z",
      updatedAt: "2026-06-16T00:00:01.000Z",
      personaId: "default",
      messages: [
        {
          id: "user-1",
          role: "user",
          content: prompt,
          at: "2026-06-16T00:00:00.000Z",
          tokens: 1,
        },
        {
          id: "assistant-1",
          role: "assistant",
          content: "I need retrieval before finalizing this claim. I do not yet have grounded evidence references for it.",
          at: "2026-06-16T00:00:01.000Z",
          tokens: 1,
        },
      ],
    } as never);

    expect(requiresHelixAskBackendEntrypoint(prompt)).toBe(false);
    expect(reply.content).toBe("I could not complete that turn.\nCause: terminal_authority_missing.");
    expect(reply.ok).toBe(false);
    expect(reply.final_answer_source).toBe("typed_failure");
    expect(reply.terminal_artifact_kind).toBe("typed_failure");
    expect(reply.terminal_error_code).toBe("terminal_authority_missing");
    expect(reply.debug?.blocked_projection_kind).toBe("durable_chat_session");
    expect(reply.content).not.toContain("I need retrieval before finalizing this claim");
  });

  it("does not treat an ask-shaped durable chat trace id as backend entrypoint evidence", () => {
    const replies = buildHelixAskRepliesFromChatSession({
      id: "session-3",
      title: "Helix Ask",
      createdAt: "2026-06-16T00:00:00.000Z",
      updatedAt: "2026-06-16T00:00:01.000Z",
      personaId: "default",
      messages: [
        {
          id: "user-1",
          role: "user",
          traceId: "ask:calculator-turn",
          content: hardCalculatorPrompt,
          at: "2026-06-16T00:00:00.000Z",
          tokens: 1,
        },
        {
          id: "assistant-1",
          role: "assistant",
          traceId: "ask:calculator-turn",
          content: "Calculator-backed answer.",
          at: "2026-06-16T00:00:01.000Z",
          tokens: 1,
        },
      ],
    } as never);

    expect(replies).toEqual([]);
  });

  it("exposes backend entrypoint failure fields in debug export", () => {
    const replies = buildHelixAskRepliesFromChatSession({
      id: "session-4",
      title: "Helix Ask",
      createdAt: "2026-06-16T00:00:00.000Z",
      updatedAt: "2026-06-16T00:00:01.000Z",
      personaId: "default",
      messages: [
        {
          id: "user-1",
          role: "user",
          content: hardCalculatorPrompt,
          at: "2026-06-16T00:00:00.000Z",
          tokens: 1,
        },
        {
          id: "assistant-1",
          role: "assistant",
          content: "I need retrieval before finalizing this claim.",
          at: "2026-06-16T00:00:01.000Z",
          tokens: 1,
        },
      ],
    } as never);

    expect(replies).toEqual([]);
  });

  it("exposes backend entrypoint failure fields in the Helix Ask pill debug export", () => {
    const replies = buildHelixAskRepliesFromChatSession({
      id: "session-5",
      title: "Helix Ask",
      createdAt: "2026-06-16T00:00:00.000Z",
      updatedAt: "2026-06-16T00:00:01.000Z",
      personaId: "default",
      messages: [
        {
          id: "user-1",
          role: "user",
          traceId: "ask:calculator-turn",
          content: hardCalculatorPrompt,
          at: "2026-06-16T00:00:00.000Z",
          tokens: 1,
        },
        {
          id: "assistant-1",
          role: "assistant",
          traceId: "ask:calculator-turn",
          content: "I need retrieval before finalizing this claim.",
          at: "2026-06-16T00:00:01.000Z",
          tokens: 1,
        },
      ],
    } as never);

    expect(replies).toEqual([]);
  });

  it("does not project scholarly workstation evaluation text when backend Ask entrypoint is missing", () => {
    const scholarlyPrompt =
      'Continue the demo from the selected strongest candidate, "Correlation of the L-mode density limit with edge collisionality". Use scholarly-research.fetch_full_text for that paper if a source_ref is available.';
    const staleEvaluation =
      "I cannot claim the requested workstation tool or UI action ran because Helix did not produce a successful observation or action receipt for every gateway request. Blocked or failed gateway request: scholarly-research.fetch_full_text: pdf_or_full_text_url_required.";
    const payload = {
      id: "helix-chat-turn:client-only",
      question: scholarlyPrompt,
      content: staleEvaluation,
      selected_final_answer: staleEvaluation,
      final_answer_source: "workstation_tool_evaluation",
      terminal_artifact_kind: "workstation_tool_evaluation",
      ask_entrypoint_required: true,
      ask_entrypoint_observed: false,
      blocked_projection_kind: "client_projection",
    } as Record<string, unknown>;

    const reusableDebugExport = JSON.parse(
      buildHelixDebugExportEnvelopeFromMasterPayload(
        { id: "helix-chat-turn:client-only", question: scholarlyPrompt, content: staleEvaluation },
        payload,
      ),
    ) as Record<string, unknown>;
    const pillDebugExport = JSON.parse(
      buildHelixPillDebugExportEnvelopeFromMasterPayload(
        { id: "helix-chat-turn:client-only", question: scholarlyPrompt, content: staleEvaluation } as never,
        payload,
      ),
    ) as Record<string, unknown>;

    for (const [label, debugExport] of [
      ["reusable", reusableDebugExport],
      ["pill", pillDebugExport],
    ] as const) {
      expect(debugExport.selected_final_answer, label).toBe(
        "This prompt requires the backend Ask solver path before a final answer can be shown.",
      );
      expect(debugExport.final_answer_source).toBe("typed_failure");
      expect(debugExport.terminal_artifact_kind).toBe("typed_failure");
      expect(debugExport.terminal_error_code).toBe("backend_ask_entry_required");
      expect(debugExport.ask_entrypoint_required).toBe(true);
      expect(debugExport.ask_entrypoint_observed).toBe(false);
      expect(debugExport.first_broken_rail).toBe("backend_ask_entrypoint");
      expect(debugExport.selected_final_answer).not.toContain("pdf_or_full_text_url_required");
    }
  });

  it("does not preserve generic typed failure text when a hard prompt explicitly missed the backend entrypoint", () => {
    const prompt =
      "Using my previous reflection in this chat, and the currently promoted page-grounded equation evidence, help frame it into a candidate postulate.";
    const payload = {
      id: "ask:postulate-entrypoint-missed",
      question: prompt,
      content: "I could not complete that turn.",
      selected_final_answer: "I could not complete that turn.",
      final_answer_source: "typed_failure",
      terminal_artifact_kind: "typed_failure",
      terminal_error_code: null,
      ask_entrypoint_required: true,
      ask_entrypoint_observed: false,
      ask_entrypoint_failure_code: "backend_ask_entry_required",
      blocked_projection_kind: "client_projection",
      debug_export_source: "backend_ref_advertised",
      debug_export_ref: {
        endpoint: "/api/agi/ask/turn/ask%3Apostulate-entrypoint-missed/debug-export",
        turn_id: "ask:postulate-entrypoint-missed",
      },
    } as Record<string, unknown>;

    const reusableDebugExport = JSON.parse(
      buildHelixDebugExportEnvelopeFromMasterPayload(
        { id: "ask:postulate-entrypoint-missed", question: prompt, content: "I could not complete that turn." },
        payload,
      ),
    ) as Record<string, unknown>;
    const pillDebugExport = JSON.parse(
      buildHelixPillDebugExportEnvelopeFromMasterPayload(
        { id: "ask:postulate-entrypoint-missed", question: prompt, content: "I could not complete that turn." } as never,
        payload,
      ),
    ) as Record<string, unknown>;

    for (const [label, debugExport] of [
      ["reusable", reusableDebugExport],
      ["pill", pillDebugExport],
    ] as const) {
      expect(debugExport.selected_final_answer, label).toBe(
        "This prompt requires the backend Ask solver path before a final answer can be shown.",
      );
      expect(debugExport.final_answer_source, label).toBe("typed_failure");
      expect(debugExport.terminal_artifact_kind, label).toBe("typed_failure");
      expect(debugExport.terminal_error_code, label).toBe("backend_ask_entry_required");
      expect(debugExport.first_broken_rail, label).toBe("backend_ask_entrypoint");
      expect(debugExport.repair_target, label).toBe("prompt_submit_entrypoint");
    }
  });

  it("does not preserve stale selected_final_answer in size-bounded backend-entrypoint debug exports", () => {
    const prompt =
      "Use the Moral Graph to help me reflect on a roommate situation. Someone knew they might not be able to meet a shared payment, but waited until the last moment to say anything.";
    const staleProjection =
      "I can see the scientific workflow still has a page source to work from, but the reusable scientific evidence package is not available in this turn.";
    const payload = {
      id: "ask:moral-graph-entrypoint-missed-large-export",
      question: prompt,
      content: staleProjection,
      selected_final_answer: staleProjection,
      ask_entrypoint_required: true,
      ask_entrypoint_observed: false,
      ask_entrypoint_failure_code: "backend_ask_entry_required",
      blocked_projection_kind: "client_projection",
      oversized_debug_padding: "x".repeat(760_000),
    } as Record<string, unknown>;

    const debugExport = JSON.parse(
      buildHelixDebugExportEnvelopeFromMasterPayload(
        { id: "ask:moral-graph-entrypoint-missed-large-export", question: prompt, content: staleProjection },
        payload,
      ),
    ) as Record<string, unknown>;

    expect(debugExport.selected_final_answer).toBe(
      "This prompt requires the backend Ask solver path before a final answer can be shown.",
    );
    expect(debugExport.final_answer_source).toBe("typed_failure");
    expect(debugExport.terminal_artifact_kind).toBe("typed_failure");
    expect(debugExport.terminal_error_code).toBe("backend_ask_entry_required");
    expect(debugExport.first_broken_rail).toBe("backend_ask_entrypoint");
    expect(debugExport.repair_target).toBe("prompt_submit_entrypoint");
    expect(debugExport.selected_final_answer).not.toContain("scientific workflow");
  });
});
