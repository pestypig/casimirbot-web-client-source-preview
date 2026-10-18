import { describe, expect, it } from "vitest";

import {
  buildHelixAskHardBackendEntrypointRouteMetadata,
  requiresHelixAskBackendEntrypoint,
  resolveHelixAskBackendEntrypointFamily,
} from "../HelixAskBackendEntrypointPolicy";
import { buildHelixAskMinimalRuntimeSubmitPlan } from "../HelixAskMinimalRuntimeSubmitPlan";
import { buildHelixAskMinimalRuntimeTurnPayload } from "../HelixAskMinimalRuntimeTransport";
import { buildHelixAskSubmitBackendEntrypointRoutePlan } from "../HelixAskSubmitBackendEntrypointOptions";

describe("Helix Ask backend entrypoint policy", () => {
  it("routes affirmative note creation through backend Ask with the note-create capability", () => {
    const question = 'write a note for me "hh"';

    expect(requiresHelixAskBackendEntrypoint(question)).toBe(true);
    expect(resolveHelixAskBackendEntrypointFamily(question)).toMatchObject({
      family: "workstation_notes",
      sourceTarget: "workstation_panel",
      requiredToolFamily: "workstation-notes",
      selectedCapability: "workstation-notes.create_note",
    });

    const routeMetadata = buildHelixAskHardBackendEntrypointRouteMetadata({
      question,
      turnId: "turn-note-create",
      threadId: "thread-note-create",
    });

    expect(routeMetadata).toMatchObject({
      source: "hard_tool_backend_entrypoint",
      sourceTarget: "workstation_panel",
      requiredToolFamily: "workstation-notes",
      mandatory_next_tool: {
        tool_name: "workstation-notes.create_note",
        required_tool_family: "workstation-notes",
        selected_capability: "workstation-notes.create_note",
        terminal_forbidden: true,
      },
      source_target_intent: {
        must_enter_backend_ask: true,
        allow_client_shortcut: false,
        allow_no_tool_direct: false,
        requested_outputs: expect.arrayContaining(["workspace_action_receipt", "note_update_receipt"]),
      },
    });
  });

  it("does not treat contextual or negated note mentions as mutating commands", () => {
    for (const question of [
      'do not write a note for me "hh"',
      'the screen says write a note for me "hh"',
      'when I write a note for me "hh", it says saved but fails',
      'debug why write a note for me "hh" failed',
    ]) {
      expect(requiresHelixAskBackendEntrypoint(question)).toBe(false);
      expect(resolveHelixAskBackendEntrypointFamily(question)).toBeNull();
    }
  });

  it("does not require backend Ask when the user asks conceptually about a tool and forbids execution", () => {
    for (const question of [
      "What is the Moral Graph reflection tool? Explain conceptually. Do not run it.",
      "In plain English, describe what the string `internet-search.search_web` looks like as a tool identifier. Do not run it.",
      "Explain `scientific-calculator.solve_expression` as a tool identifier. Do not run it.",
      "What is the Docs Viewer tool? Explain conceptually. Do not open docs.",
      "Describe `repo.search` as a capability name. Do not run it.",
      "What is Image Lens as a tool? Explain only; do not inspect an image.",
      "Define the scholarly-research.lookup_papers capability. Do not call it.",
      "Define the research-library.apply_evidence_enrichment capability. Do not call it.",
      "Define helix_ask.reflect_theory_context as a capability. Do not call it.",
      "What is the Theory Badge Graph? Explain conceptually. Do not reflect anything.",
    ]) {
      expect(requiresHelixAskBackendEntrypoint(question)).toBe(false);
      expect(resolveHelixAskBackendEntrypointFamily(question)).toBeNull();
    }
  });

  it("does not promote a research-tool behavior question into an Image Lens command", () => {
    const question =
      "Does your research-paper tool select papers it can parse, or does it first check which papers are openable and then use Image Lens when visual extraction is needed?";

    expect(requiresHelixAskBackendEntrypoint(question)).toBe(false);
    expect(resolveHelixAskBackendEntrypointFamily(question)).toBeNull();
    expect(buildHelixAskHardBackendEntrypointRouteMetadata({
      question,
      turnId: "turn-research-tool-behavior",
      threadId: "thread-research-tool-behavior",
    })).toBeNull();
  });

  it.each([
    "Does the scientific calculator support symbolic variables?",
    "Can Docs Viewer open Markdown files by path?",
    "How does your repo search tool select matching files?",
    "Does the internet search tool return source links?",
    "Can the Moral Graph tool inspect a situation without changing it?",
    "Does Image Lens read equations from selected regions?",
    "Can the workstation notes tool append instead of creating a note?",
    "How does your workspace diagnostic tool check status?",
    "Does the live-source tool read mail before recording a decision?",
    "Can the narrator tool return a receipt without speaking automatically?",
    "Does the Postulate Board workflow create a review before submission?",
    "Can the Theory Badge Graph compare interpretations without changing badges?",
  ])("keeps cross-family capability behavior wording non-executing: %s", (question) => {
    expect(requiresHelixAskBackendEntrypoint(question)).toBe(false);
    expect(resolveHelixAskBackendEntrypointFamily(question)).toBeNull();
  });

  it("still requires backend Ask when the user explicitly asks to use a tool family", () => {
    const examples = [
      {
        question:
          "Use only the Moral Graph. Reflect on whether I should apologize after snapping at a coworker. Do not use web, papers, calculator, image, or PDF context.",
        family: "moral_graph",
        selectedCapability: "moral-graph.reflect_context",
      },
      {
        question: "Use the scientific calculator to solve 8*9.",
        family: "calculator",
        selectedCapability: "scientific-calculator.solve_expression",
      },
      {
        question: "Use repo.search to find terminal authority code.",
        family: "repo_code",
        selectedCapability: "repo.search",
      },
      {
        question: "Use scholarly-research.lookup_papers for Weyl integrable spacetime.",
        family: "scholarly_research",
        selectedCapability: "scholarly-research.lookup_papers",
      },
    ];

    for (const example of examples) {
      expect(requiresHelixAskBackendEntrypoint(example.question)).toBe(true);
      expect(resolveHelixAskBackendEntrypointFamily(example.question)).toMatchObject({
        family: example.family,
        selectedCapability: example.selectedCapability,
      });
    }
  });

  it("routes an affirmative Minecraft relocation through the live-environment backend", () => {
    const question =
      "Move my selected Minecraft player DatDamPig to a safe random surface near this base. Use the built-in spreadplayers command centered at x=-38 z=-11 with minimum separation 20 and maximum range 36. Do not respect teams and make no other changes.";

    expect(requiresHelixAskBackendEntrypoint(question)).toBe(true);
    expect(resolveHelixAskBackendEntrypointFamily(question)).toMatchObject({
      family: "environment_connector",
      sourceTarget: "live_environment",
      targetKind: "minecraft_environment",
      requiredToolFamily: "environment_connector",
      selectedCapability: "com.casimirbot.minecraft.command",
      explicitCue: "affirmative_minecraft_environment_operation",
      requestedOutputs: expect.arrayContaining([
        "environment_command_receipt",
        "post_action_observation",
        "rollback_receipt",
      ]),
    });

    expect(buildHelixAskHardBackendEntrypointRouteMetadata({
      question,
      turnId: "turn-minecraft-relocation",
      threadId: "thread-minecraft-relocation",
    })).toMatchObject({
      source: "hard_tool_backend_entrypoint",
      sourceTarget: "live_environment",
      requiredToolFamily: "environment_connector",
      mandatory_next_tool: {
        tool_name: "com.casimirbot.minecraft.command",
        required_tool_family: "environment_connector",
        selected_capability: "com.casimirbot.minecraft.command",
        terminal_forbidden: true,
      },
      source_target_intent: {
        target_source: "live_environment",
        target_kind: "minecraft_environment",
        must_enter_backend_ask: true,
        allow_client_shortcut: false,
        allow_no_tool_direct: false,
        requested_outputs: expect.arrayContaining([
          "environment_command_receipt",
          "post_action_observation",
        ]),
      },
    });
  });

  it("routes natural Minecraft reads and structure actions without forcing a read capability", () => {
    const readQuestion =
      "Using my paired Minecraft Fabric environment and selected player, check my current health, food, dimension, exact position, and game mode now.";
    expect(requiresHelixAskBackendEntrypoint(readQuestion)).toBe(true);
    expect(resolveHelixAskBackendEntrypointFamily(readQuestion)).toMatchObject({
      family: "environment_connector",
      sourceTarget: "live_environment",
      selectedCapability: null,
      explicitCue: "affirmative_minecraft_environment_read",
    });
    expect(buildHelixAskHardBackendEntrypointRouteMetadata({
      question: readQuestion,
      turnId: "turn-minecraft-read",
      threadId: "thread-minecraft-read",
    })?.mandatory_next_tool).toBeUndefined();

    const postActionReadQuestion =
      "Using my paired Minecraft Fabric environment and selected player, read DatDamPig current exact position, dimension, health, food, and game mode now as fresh post-action verification of the immediately preceding spreadplayers command. Do not mutate anything. Report the observation timestamp and freshness.";
    expect(resolveHelixAskBackendEntrypointFamily(postActionReadQuestion)).toMatchObject({
      family: "environment_connector",
      selectedCapability: null,
      explicitCue: "affirmative_minecraft_environment_read",
    });
    expect(buildHelixAskHardBackendEntrypointRouteMetadata({
      question: postActionReadQuestion,
      turnId: "turn-minecraft-post-action-read",
      threadId: "thread-minecraft-post-action-read",
    })?.mandatory_next_tool).toBeUndefined();

    const wallQuestion =
      "At a safe open location near my selected Minecraft player, build a five-block-wide stone-brick wall and verify the exact structure.";
    expect(resolveHelixAskBackendEntrypointFamily(wallQuestion)).toMatchObject({
      family: "environment_connector",
      selectedCapability: "com.casimirbot.minecraft.command",
      explicitCue: "affirmative_minecraft_environment_operation",
    });
  });

  it.each([
    "Do not move my selected Minecraft player; explain spreadplayers.",
    "If we move DatDamPig later, use spreadplayers.",
    "Previously I asked you to build a Minecraft wall.",
    'The screen says "Move my selected Minecraft player with spreadplayers."',
    'The phrase "Build a wall in Minecraft" is only an example.',
    "Can the Minecraft environment tool teleport players? Explain conceptually.",
    "Why did the previous Minecraft command fail?",
  ])("does not execute a contextual Minecraft environment mention: %s", (question) => {
    expect(requiresHelixAskBackendEntrypoint(question)).toBe(false);
    expect(resolveHelixAskBackendEntrypointFamily(question)).toBeNull();
  });

  it("routes bounded Research Library enrichment through a read-first compound Ask path", () => {
    const question =
      "Using the saved Research Library document for https://arxiv.org/pdf/gr-qc/9510071.pdf, read only PDF page 4 and its current paper-evidence sidecar. Create a Calculator-ready prefill, but do not run the Calculator. Persist the enrichment using research-library.apply_evidence_enrichment. Do not mutate the Theory Badge Graph.";

    expect(requiresHelixAskBackendEntrypoint(question)).toBe(true);
    expect(resolveHelixAskBackendEntrypointFamily(question)).toMatchObject({
      family: "research_library",
      sourceTarget: "research_library",
      targetKind: "saved_paper_evidence_enrichment",
      requiredToolFamily: "research_library",
      selectedCapability: "research-library.read_document",
      explicitCue: "research_library_read_then_enrich",
      requestedOutputs: expect.arrayContaining([
        "research_library_observation",
        "paper_evidence_enrichment_observation",
        "calculator_prefill",
        "model_authored_synthesis",
      ]),
    });

    expect(buildHelixAskHardBackendEntrypointRouteMetadata({
      question,
      turnId: "turn-research-library-enrich",
      threadId: "thread-research-library-enrich",
    })).toMatchObject({
      source: "hard_tool_backend_entrypoint",
      sourceTarget: "research_library",
      requiredToolFamily: "research_library",
      mandatory_next_tool: {
        tool_name: "research-library.read_document",
        selected_capability: "research-library.read_document",
        terminal_forbidden: true,
      },
      source_target_intent: {
        target_source: "research_library",
        target_kind: "saved_paper_evidence_enrichment",
        must_enter_backend_ask: true,
        allow_client_shortcut: false,
        requested_outputs: expect.arrayContaining([
          "research_library_observation",
          "paper_evidence_enrichment_observation",
        ]),
      },
    });
  });

  it("routes the exact Theory Badge Graph interpretation comparison through backend Ask", () => {
    const question =
      "Now compare two interpretations with the Theory Badge Graph: first, that macroscopic probability is epistemic because coarse-graining hides deterministic microstates; second, that probability is fundamental rather than caused by missing information. Show where the graph supports or fails to represent each interpretation.";

    expect(requiresHelixAskBackendEntrypoint(question)).toBe(true);
    expect(resolveHelixAskBackendEntrypointFamily(question)).toMatchObject({
      family: "theory_badge_graph",
      sourceTarget: "theory_locator",
      targetKind: "theory_locator",
      requiredToolFamily: "theory_locator",
      selectedCapability: "helix_ask.reflect_theory_context",
      explicitCue: "affirmative_theory_badge_graph_reflection",
      requestedOutputs: expect.arrayContaining([
        "theory_context_reflection_observation",
        "model_authored_synthesis",
      ]),
    });

    expect(buildHelixAskHardBackendEntrypointRouteMetadata({
      question,
      turnId: "turn-theory-interpretations",
      threadId: "thread-theory-interpretations",
    })).toMatchObject({
      source: "hard_tool_backend_entrypoint",
      sourceTarget: "theory_locator",
      requiredToolFamily: "theory_locator",
      mandatory_next_tool: {
        tool_name: "helix_ask.reflect_theory_context",
        required_tool_family: "theory_locator",
        terminal_forbidden: true,
      },
      source_target_intent: {
        target_source: "theory_locator",
        target_kind: "theory_locator",
        must_enter_backend_ask: true,
        allow_client_shortcut: false,
        allow_no_tool_direct: false,
      },
    });
  });

  it("routes current Theory Badge Graph selection questions through a bounded context read", () => {
    const question = "What do these selected badges imply, and which branches are possible next?";

    expect(resolveHelixAskBackendEntrypointFamily(question)).toMatchObject({
      family: "theory_badge_graph",
      sourceTarget: "theory_locator",
      targetKind: "theory_badge_graph_current_context",
      selectedCapability: "theory-badge-graph.current_context",
      explicitCue: "current_theory_badge_graph_selection",
    });
  });

  it.each([
    "Do not reflect deterministic laws with the Theory Badge Graph.",
    "Now do not compare deterministic laws with the Theory Badge Graph.",
    "Next time, compare deterministic laws with the Theory Badge Graph.",
    "If we continue, then compare deterministic laws with the Theory Badge Graph.",
    "Previously I asked you to reflect deterministic laws with the Theory Badge Graph.",
    'The phrase "Reflect deterministic laws with the Theory Badge Graph" is only an example.',
    "The button says Now compare deterministic laws with the Theory Badge Graph.",
    "Previously I asked you to call helix_ask.reflect_theory_context.",
  ])("does not backend-route a contextual Theory Badge Graph mention: %s", (question) => {
    expect(requiresHelixAskBackendEntrypoint(question)).toBe(false);
    expect(resolveHelixAskBackendEntrypointFamily(question)).toBeNull();
  });

  it("keeps Theory Graph negation subordinate to the affirmative Research Library enrichment", () => {
    const question =
      "Using the saved Research Library document, read its sidecar and persist the enrichment using research-library.apply_evidence_enrichment. Do not mutate or reflect anything to the Theory Badge Graph.";

    expect(resolveHelixAskBackendEntrypointFamily(question)).toMatchObject({
      family: "research_library",
      selectedCapability: "research-library.read_document",
      explicitCue: "research_library_read_then_enrich",
    });
  });

  it("routes a direct enrichment command to the mutating Research Library capability", () => {
    const question =
      "Run research-library.apply_evidence_enrichment for document research:abcdefgh using the supplied revision-bound proposal.";

    expect(resolveHelixAskBackendEntrypointFamily(question)).toMatchObject({
      family: "research_library",
      selectedCapability: "research-library.apply_evidence_enrichment",
    });
  });

  it("builds a recrowned minimal-runtime backend payload for note creation", () => {
    const submitPlan = buildHelixAskMinimalRuntimeSubmitPlan({
      draft: 'make a note for me "hh"',
      selectedRuntime: "codex",
      selectedLanguageModelProfile: "auto",
      desktopUrl: "http://localhost:5173/workstation",
    });

    const payload = buildHelixAskMinimalRuntimeTurnPayload({
      submitPlan,
      sessionId: "thread-note-create",
      traceId: "trace-note-create",
      turnId: "turn-note-create",
      maxTokens: 1000,
    });

    expect(payload).toMatchObject({
      question: 'make a note for me "hh"',
      requiresBackendAskEntrypoint: true,
      requires_backend_ask_entrypoint: true,
      ask_entrypoint_required: true,
      forceReasoningDispatch: true,
      force_reasoning_dispatch: true,
      use_backend_ask_turn_entrypoint: true,
      backend_ask_call_attempted: true,
      backend_ask_call_path: "runAskTurnStream",
      legacy_ask_local_bypassed: true,
      route_metadata_source: "hard_tool_backend_entrypoint",
      mandatory_next_tool_name: "workstation-notes.create_note",
      routeMetadata: {
        requiredToolFamily: "workstation-notes",
        mandatory_next_tool: {
          tool_name: "workstation-notes.create_note",
        },
      },
    });
  });

  it("ignores stale backend-entrypoint flags for conceptual no-run tool explanations", () => {
    const question = "What is the Moral Graph reflection tool? Explain conceptually. Do not run it.";
    const routePlan = buildHelixAskSubmitBackendEntrypointRoutePlan({
      question,
      baseRunOptions: {
        requiresBackendAskEntrypoint: true,
        forceReasoningDispatch: true,
        routeMetadata: {
          schema: "helix.ask.route_metadata.v1",
          source: "hard_tool_backend_entrypoint",
          sourceTarget: "moral_graph",
          requiredToolFamily: "moral_graph",
        },
      },
      turnId: "turn-concept-no-run",
      threadId: "thread-concept-no-run",
      manualCanaryEnabled: false,
    });

    expect(routePlan).toMatchObject({
      hardBackendEntrypointRequired: false,
      forceReasoningDispatch: false,
      useBackendAskTurnEntrypoint: false,
      routeMetadata: undefined,
    });

    const submitPlan = buildHelixAskMinimalRuntimeSubmitPlan({
      draft: question,
      selectedRuntime: "codex",
      selectedLanguageModelProfile: "auto",
      desktopUrl: "http://localhost:5173/workstation",
      pendingPrompt: {
        promptId: "pending-concept-no-run",
        question,
        autoSubmit: true,
        requiresBackendAskEntrypoint: true,
        requires_backend_ask_entrypoint: true,
        forceReasoningDispatch: true,
        routeMetadata: {
          schema: "helix.ask.route_metadata.v1",
          source: "hard_tool_backend_entrypoint",
          sourceTarget: "moral_graph",
          requiredToolFamily: "moral_graph",
        },
        createdAt: Date.now(),
      },
    });

    const payload = buildHelixAskMinimalRuntimeTurnPayload({
      submitPlan,
      sessionId: "thread-concept-no-run",
      traceId: "trace-concept-no-run",
      turnId: "turn-concept-no-run",
      maxTokens: 1000,
    });

    expect(payload).toMatchObject({ question });
    expect(payload?.requiresBackendAskEntrypoint).toBeUndefined();
    expect(payload?.requires_backend_ask_entrypoint).toBeUndefined();
    expect(payload?.forceReasoningDispatch).toBeUndefined();
    expect(payload?.force_reasoning_dispatch).toBeUndefined();
    expect(payload?.routeMetadata).toBeUndefined();
    expect(payload?.route_metadata).toBeUndefined();
    expect(payload?.ask_entrypoint_required).toBeUndefined();
    expect(payload?.hard_backend_entrypoint_required).toBeUndefined();
    expect(payload?.backend_ask_call_attempted).toBeUndefined();
    expect(payload?.mandatory_next_tool_name).toBeUndefined();
  });
});
