import { describe, expect, it } from "vitest";
import {
  buildHelixAskHardBackendEntrypointRouteMetadata,
  requiresHelixAskBackendEntrypoint,
  resolveHelixAskBackendEntrypointFamily,
} from "../helix/ask-console/HelixAskBackendEntrypointPolicy";

describe("Helix Ask backend entrypoint scientific image policy", () => {
  it("routes /postulate through the backend runtime review gate instead of client projection", () => {
    const prompt =
      "/postulate Review this postulate candidate for Postulate Board submission. Grade it in this chat before any board submission.";
    const resolution = resolveHelixAskBackendEntrypointFamily(prompt);

    expect(requiresHelixAskBackendEntrypoint(prompt)).toBe(true);
    expect(resolution).toMatchObject({
      family: "postulate",
      sourceTarget: "postulate_board",
      targetKind: "postulate_runtime_review",
      requiredToolFamily: "postulate",
      selectedCapability: null,
      explicitCue: "/postulate",
      requestedOutputs: expect.arrayContaining([
        "postulate_runtime_review",
        "postulate_submission_gate",
        "postulate_submit_receipt",
        "revision_recovery_plan",
        "typed_failure",
      ]),
    });
  });

  it("marks /postulate hard backend metadata as a no-shortcut postulate review contract", () => {
    const metadata = buildHelixAskHardBackendEntrypointRouteMetadata({
      question: "/postulate Review this postulate candidate.",
      turnId: "turn:postulate",
      threadId: "thread:postulate",
    });

    expect(metadata?.sourceTarget).toBe("postulate_board");
    expect(metadata?.source_target_intent).toMatchObject({
      target_source: "postulate_board",
      target_kind: "postulate_runtime_review",
      must_enter_backend_ask: true,
      allow_client_shortcut: false,
      allow_no_tool_direct: false,
      requested_outputs: expect.arrayContaining([
        "postulate_runtime_review",
        "postulate_submission_gate",
        "revision_recovery_plan",
      ]),
    });
    expect(metadata?.mandatory_next_tool).toBeUndefined();
  });

  it("routes explicit Moral Graph prompts through backend Ask without image sidecar prerequisites", () => {
    const prompt =
      "Use moral-graph.reflect_context for inherited conditioning, purpose as inquiry, and recognition before transcendence.";
    const metadata = buildHelixAskHardBackendEntrypointRouteMetadata({
      question: prompt,
      turnId: "turn:moral-graph",
      threadId: "thread:moral-graph",
    });

    expect(requiresHelixAskBackendEntrypoint(prompt)).toBe(true);
    expect(resolveHelixAskBackendEntrypointFamily(prompt)).toMatchObject({
      family: "moral_graph",
      sourceTarget: "moral_graph",
      targetKind: "moral_graph_reflection",
      requiredToolFamily: "moral_graph",
      selectedCapability: "moral-graph.reflect_context",
      requestedOutputs: expect.arrayContaining([
        "moral_graph_observation",
        "diagnostic_reflection",
        "typed_failure",
      ]),
    });
    expect(metadata?.source_target_intent).toMatchObject({
      target_source: "moral_graph",
      target_kind: "moral_graph_reflection",
      must_enter_backend_ask: true,
      allow_client_shortcut: false,
      requested_outputs: expect.arrayContaining(["moral_graph_observation"]),
    });
    expect(metadata?.source_target_intent?.requested_outputs).not.toContain("scientific_evidence_sidecar");
    expect(metadata?.mandatory_next_tool).toMatchObject({
      tool_name: "moral-graph.reflect_context",
      required_tool_family: "moral_graph",
      missing_required_evidence: "tool_observation",
      canonical_goal: "moral_graph",
    });
  });

  it("routes natural Moral Graph reflection requests through backend Ask", () => {
    const prompt =
      "Use the Moral Graph to help me reflect on a roommate situation. Someone knew they might not be able to meet a shared payment, but waited until the last moment to say anything. I don't want to decide whether they are a bad person. I want to understand what dependency existed, what choices were taken away by the delay, and what kind of repair or boundary would be fair now.";
    const metadata = buildHelixAskHardBackendEntrypointRouteMetadata({
      question: prompt,
      turnId: "turn:moral-graph-natural",
      threadId: "thread:moral-graph-natural",
    });

    expect(requiresHelixAskBackendEntrypoint(prompt)).toBe(true);
    expect(resolveHelixAskBackendEntrypointFamily(prompt)).toMatchObject({
      family: "moral_graph",
      sourceTarget: "moral_graph",
      targetKind: "moral_graph_reflection",
      requiredToolFamily: "moral_graph",
      selectedCapability: "moral-graph.reflect_context",
    });
    expect(metadata?.source_target_intent).toMatchObject({
      target_source: "moral_graph",
      target_kind: "moral_graph_reflection",
      must_enter_backend_ask: true,
      allow_client_shortcut: false,
      allow_no_tool_direct: false,
      requested_outputs: expect.arrayContaining(["moral_graph_observation", "diagnostic_reflection"]),
    });
    expect(metadata?.source_target_intent?.suppressed_routes).toEqual(
      expect.arrayContaining(["client_projection", "evidence_finalization_fallback"]),
    );
    expect(metadata?.source_target_intent?.requested_outputs).not.toContain("scientific_evidence_sidecar");
    expect(metadata?.mandatory_next_tool).toMatchObject({
      tool_name: "moral-graph.reflect_context",
      required_tool_family: "moral_graph",
    });
  });

  it("routes docs.search and repo.search prompts through backend Ask evidence lanes", () => {
    const docsPrompt = "Use docs.search to find the section that defines evidence admission.";
    const repoPrompt = "Use repo.search to find where artifact admission traces are built.";

    expect(requiresHelixAskBackendEntrypoint(docsPrompt)).toBe(true);
    expect(resolveHelixAskBackendEntrypointFamily(docsPrompt)).toMatchObject({
      family: "docs_viewer",
      sourceTarget: "docs_viewer",
      selectedCapability: "docs.search",
      requestedOutputs: expect.arrayContaining(["doc_evidence"]),
    });

    expect(requiresHelixAskBackendEntrypoint(repoPrompt)).toBe(true);
    expect(resolveHelixAskBackendEntrypointFamily(repoPrompt)).toMatchObject({
      family: "repo_code",
      sourceTarget: "repo_code",
      selectedCapability: "repo.search",
      requestedOutputs: expect.arrayContaining(["repo_code", "line_backed_source"]),
    });
  });

  it("routes natural scientific document image prompts through the compound backend path", () => {
    const prompt = "Here is a scientific document image. Extract the equations and compare them to the theory badge graph.";

    expect(requiresHelixAskBackendEntrypoint(prompt)).toBe(true);
    expect(resolveHelixAskBackendEntrypointFamily(prompt)).toMatchObject({
      family: "scientific_image",
      sourceTarget: "scientific_image_evidence",
      targetKind: "scientific_image_evidence_sidecar",
      requiredToolFamily: "visual_analysis",
      selectedCapability: "visual_analysis.inspect_image_region",
      explicitCue: "scientific_image_evidence_sidecar",
      requestedOutputs: expect.arrayContaining([
        "image_lens_crop_observation",
        "scientific_evidence_sidecar",
        "theory_reflection",
        "calculator_payload_filter",
        "typed_failure",
      ]),
    });
  });

  it("routes saved-text/Image-Lens comparisons without forcing a fresh crop", () => {
    const prompt =
      "Using the saved machine-readable page-8 text and the Image Lens crop, compare equation (47) row by row. Report the actual detected display-row count, symbol/subscript agreements, and mismatches. Do not promote exact-block evidence unless every displayed line and label agrees.";
    const resolution = resolveHelixAskBackendEntrypointFamily(prompt);
    const metadata = buildHelixAskHardBackendEntrypointRouteMetadata({
      question: prompt,
      turnId: "turn:retained-image-comparison",
      threadId: "thread:retained-image-comparison",
    });

    expect(requiresHelixAskBackendEntrypoint(prompt)).toBe(true);
    expect(resolution).toMatchObject({
      family: "scientific_image",
      sourceTarget: "scientific_image_evidence",
      targetKind: "scientific_image_evidence_sidecar",
      selectedCapability: null,
      explicitCue: "affirmative_scientific_image_text_comparison",
      requestedOutputs: expect.arrayContaining([
        "scientific_evidence_sidecar",
        "machine_text_visual_comparison",
        "model_authored_synthesis",
      ]),
    });
    expect(metadata).not.toHaveProperty("mandatory_next_tool");
  });

  it("keeps scientific image extraction-only prompts out of theory and calculator routing", () => {
    const prompt = "Here is a scientific document image. Extract the equations and LaTeX candidates.";
    const resolution = resolveHelixAskBackendEntrypointFamily(prompt);

    expect(requiresHelixAskBackendEntrypoint(prompt)).toBe(true);
    expect(resolution).toMatchObject({
      family: "scientific_image",
      selectedCapability: "visual_analysis.inspect_image_region",
      requestedOutputs: expect.arrayContaining([
        "image_lens_crop_observation",
        "scientific_evidence_packet",
        "scientific_evidence_sidecar",
        "typed_failure",
      ]),
    });
    expect(resolution?.requestedOutputs).not.toContain("theory_reflection");
    expect(resolution?.requestedOutputs).not.toContain("calculator_payload_filter");
  });

  it("routes promoted equation evidence graph follow-ups through the backend scientific sidecar path", () => {
    const prompt =
      "Reflect the promoted equation evidence to the Theory Badge Graph with diagnostic-only boundaries and report calculator payload admissibility.";
    const resolution = resolveHelixAskBackendEntrypointFamily(prompt);

    expect(requiresHelixAskBackendEntrypoint(prompt)).toBe(true);
    expect(resolution).toMatchObject({
      family: "scientific_image",
      sourceTarget: "scientific_image_evidence",
      targetKind: "scientific_image_evidence_sidecar",
      requiredToolFamily: "visual_analysis",
      selectedCapability: "visual_analysis.inspect_image_region",
      explicitCue: "scientific_image_evidence_sidecar",
      requestedOutputs: expect.arrayContaining([
        "scientific_evidence_packet",
        "scientific_evidence_sidecar",
        "theory_reflection",
        "calculator_payload_filter",
        "typed_failure",
      ]),
    });
  });

  it("routes Postulate Board evidence-ref revisions through the scientific sidecar path", () => {
    const prompt =
      "Revise this Postulate Board draft so its evidence refs cite the actual promoted page-grounded equation row, page number, crop ref, Image Lens source/hash, and evidence depth. Keep it candidate / diagnostic-only. Do not promote a badge or calculator payload.";
    const resolution = resolveHelixAskBackendEntrypointFamily(prompt);

    expect(requiresHelixAskBackendEntrypoint(prompt)).toBe(true);
    expect(resolution).toMatchObject({
      family: "scientific_image",
      sourceTarget: "scientific_image_evidence",
      targetKind: "scientific_image_evidence_sidecar",
      requestedOutputs: expect.arrayContaining([
        "scientific_evidence_packet",
        "scientific_evidence_sidecar",
        "calculator_payload_filter",
        "typed_failure",
      ]),
    });
  });

  it("routes scientific Image Lens continuity audits through the backend sidecar path", () => {
    const prompt =
      "Run a scientific Image Lens evidence continuity audit. Use the latest scientific Image Lens sidecar, not chat memory or a fresh scholarly lookup. Report only: evidence depth, sidecar id, Image Lens source id, source image hash, page number, crop ref, promoted equation LaTeX, active promoted row blockers, and historical non-promoted row blockers.";
    const resolution = resolveHelixAskBackendEntrypointFamily(prompt);

    expect(requiresHelixAskBackendEntrypoint(prompt)).toBe(true);
    expect(resolution).toMatchObject({
      family: "scientific_image",
      sourceTarget: "scientific_image_evidence",
      targetKind: "scientific_image_evidence_sidecar",
      requestedOutputs: expect.arrayContaining([
        "scientific_evidence_sidecar",
        "scientific_image_evidence_continuity_audit",
        "latest_scientific_image_sidecar_ref",
        "typed_failure",
      ]),
    });
  });

  it("routes named Image Lens receipt evaluation through backend Ask without requiring a new crop", () => {
    for (const receiptName of ["crop_1", "equation_7"]) {
      const prompt =
        `Do not run scholarly lookup or internet retrieval. Use only the latest Image Lens observation receipt named ${receiptName}. Evaluate ${receiptName} as an exact equation row for equation (7).`;
      const resolution = resolveHelixAskBackendEntrypointFamily(prompt);
      const metadata = buildHelixAskHardBackendEntrypointRouteMetadata({
        question: prompt,
        turnId: `turn:named-receipt:${receiptName}`,
        threadId: `thread:named-receipt:${receiptName}`,
      });

      expect(requiresHelixAskBackendEntrypoint(prompt)).toBe(true);
      expect(resolution).toMatchObject({
        family: "scientific_image",
        sourceTarget: "scientific_image_evidence",
        targetKind: "scientific_image_named_receipt",
        requiredToolFamily: "visual_analysis",
        selectedCapability: null,
        explicitCue: "image_lens_named_observation_receipt",
        requestedOutputs: ["image_lens_named_receipt_evaluation", "typed_failure"],
      });
      expect(metadata?.source_target_intent).toMatchObject({
        target_source: "scientific_image_evidence",
        target_kind: "scientific_image_named_receipt",
        must_enter_backend_ask: true,
        allow_client_shortcut: false,
        allow_no_tool_direct: false,
        requested_outputs: ["image_lens_named_receipt_evaluation", "typed_failure"],
      });
      expect(metadata?.mandatory_next_tool).toBeUndefined();
    }
  });

  it("routes postulate evidence-ref prompts that ask for latest sidecar refs through backend Ask", () => {
    const prompt =
      "Before rating this postulate, hydrate it from the latest scientific Image Lens sidecar, promoted page-grounded equation refs, graph reflection refs, crop ref, source/hash, and evidence depth.";
    const resolution = resolveHelixAskBackendEntrypointFamily(prompt);

    expect(requiresHelixAskBackendEntrypoint(prompt)).toBe(true);
    expect(resolution).toMatchObject({
      family: "scientific_image",
      sourceTarget: "scientific_image_evidence",
      targetKind: "scientific_image_evidence_sidecar",
      requestedOutputs: expect.arrayContaining([
        "scientific_evidence_sidecar",
        "latest_scientific_image_sidecar_ref",
      ]),
    });
  });

  it("marks the scientific sidecar as the missing evidence for backend route metadata", () => {
    const prompt = "Here is a scientific document image. Extract the equations and compare them to the theory badge graph.";
    const metadata = buildHelixAskHardBackendEntrypointRouteMetadata({
      question: prompt,
      turnId: "turn:scientific-image",
      threadId: "thread:scientific-image",
    });

    expect(metadata?.source_target_intent).toMatchObject({
      target_source: "scientific_image_evidence",
      target_kind: "scientific_image_evidence_sidecar",
      requested_outputs: expect.arrayContaining([
        "image_lens_crop_observation",
        "scientific_evidence_sidecar",
        "theory_reflection",
        "calculator_payload_filter",
      ]),
      must_enter_backend_ask: true,
      allow_client_shortcut: false,
      allow_no_tool_direct: false,
    });
    expect(metadata?.mandatory_next_tool).toMatchObject({
      tool_name: "visual_analysis.inspect_image_region",
      required_tool_family: "visual_analysis",
      terminal_forbidden: true,
      missing_required_evidence: "scientific_evidence_sidecar",
      canonical_goal: "scientific_image",
    });
  });

  it("does not turn ordinary image description into the scientific image workflow", () => {
    const prompt = "Describe this attached image in plain language.";

    expect(resolveHelixAskBackendEntrypointFamily(prompt)).toBeNull();
  });
});
