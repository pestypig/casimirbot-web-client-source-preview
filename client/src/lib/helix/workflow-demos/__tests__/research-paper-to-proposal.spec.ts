import { describe, expect, it } from "vitest";
import {
  extractHelixWorkflowDemoEvidenceFromPayload,
  extractHelixWorkflowDemoRetrySignalFromPayload,
  mergeHelixWorkflowDemoEvidence,
  projectResearchPaperToProposalSession,
} from "@/lib/helix/workflow-demos/research-paper-to-proposal";
import {
  HELIX_WORKFLOW_DEMO_SESSION_SCHEMA,
  RESEARCH_PAPER_TO_PROPOSAL_DEMO_ID,
  createEmptyHelixWorkflowDemoEvidence,
  type HelixWorkflowDemoSessionV1,
} from "@shared/contracts/helix-workflow-demo.v1";
import {
  HELIX_DEVELOPER_ACCOUNT_POLICY,
  HELIX_USER_ACCOUNT_POLICY,
  resolveHelixAccountPanelAccess,
} from "@shared/helix-account-session";
import { createHelixWorkflowDemoCustomBinding } from "@/lib/helix/workflow-demos/workflow-demo-context";

const sessionWith = (evidence = createEmptyHelixWorkflowDemoEvidence()): HelixWorkflowDemoSessionV1 => ({
  schema: HELIX_WORKFLOW_DEMO_SESSION_SCHEMA,
  runId: "workflow-demo:test",
  demoId: RESEARCH_PAPER_TO_PROPOSAL_DEMO_ID,
  status: "active",
  startedAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
  evidence,
  dismissedStepId: null,
  contextBinding: createHelixWorkflowDemoCustomBinding("Quantum energy inequalities and negative-energy constraints")!,
});

const workbench = (overrides: Record<string, unknown> = {}) => ({
  schema: "helix.scholarly_pdf_workbench_state.v1",
  turn_id: "turn:paper",
  scholarly_memory_id: "scholarly-memory:paper-1",
  paper: { title: "Bounded paper" },
  pdf: { rendered_page_refs: [] },
  status: {
    has_ocr_or_math_candidate: false,
    has_promoted_exact_row: false,
    graph_reflection_refs: [],
  },
  evidence_chain: {
    paper_memory_ref: "scholarly-memory:paper-1",
    rendered_page_refs: [],
    ocr_math_packet_refs: [],
    promoted_equation_refs: [],
    graph_reflection_refs: [],
  },
  assistant_answer: false,
  terminal_eligible: false,
  ...overrides,
});

describe("research-paper-to-proposal workflow demo", () => {
  it("makes the demo panel available to developers, users, and unsigned sessions", () => {
    expect(HELIX_DEVELOPER_ACCOUNT_POLICY.allowed_panels).toContain("*");
    expect(HELIX_USER_ACCOUNT_POLICY.allowed_panels).toContain("workflow-demo-lab");
    expect(HELIX_USER_ACCOUNT_POLICY.locked_panels).not.toContain("workflow-demo-lab");
    expect(resolveHelixAccountPanelAccess(HELIX_USER_ACCOUNT_POLICY, "workflow-demo-lab")).toEqual({
      state: "available",
      reason: null,
    });
    expect(resolveHelixAccountPanelAccess(null, "workflow-demo-lab")).toEqual({
      state: "available",
      reason: null,
    });
  });

  it("does not advance from assistant prose that merely names every step", () => {
    const evidence = extractHelixWorkflowDemoEvidenceFromPayload({
      ok: true,
      text: "Paper found, page rendered, exact row promoted, graph reflected, provenance audited, and proposal submitted.",
    });
    expect(evidence).toEqual(createEmptyHelixWorkflowDemoEvidence());
    expect(projectResearchPaperToProposalSession(sessionWith(evidence)).currentStepId).toBe("paper_lookup");
  });

  it("does not offer a QTE until the run has an operator-confirmed context binding", () => {
    const session = sessionWith();
    session.contextBinding = null;
    const projection = projectResearchPaperToProposalSession(session);
    expect(projection.currentStepId).toBe("paper_lookup");
    expect(projection.qte).toBeNull();
  });

  it("renders the first QTE from the pinned workflow objective instead of the README example", () => {
    const projection = projectResearchPaperToProposalSession(sessionWith());
    expect(projection.qte?.prompt).toContain("Quantum energy inequalities and negative-energy constraints");
    expect(projection.qte?.prompt).toContain("one short, specific query of at most 12 words");
    expect(projection.qte?.prompt).toContain("make one narrower retry");
    expect(projection.qte?.prompt).toContain("fetch or materialize its full text");
    expect(projection.qte?.prompt).not.toContain("Weyl geometry or Casimir scalar fields");
    expect(projection.qte).toMatchObject({
      contextSourceKind: "custom",
      autoSubmit: false,
      assistantAnswer: false,
      terminalEligible: false,
    });
  });

  it("keeps the page-render QTE mount-only until typed page evidence exists", () => {
    const evidence = extractHelixWorkflowDemoEvidenceFromPayload(workbench());
    const projection = projectResearchPaperToProposalSession(sessionWith(evidence));
    expect(projection.currentStepId).toBe("pdf_page_render");
    expect(projection.qte?.prompt).toContain("`scholarly-memory:paper-1`");
    expect(projection.qte?.prompt).toContain("Mount PDF page 2 in Image Lens as a source only");
    expect(projection.qte?.prompt).toContain("Quantum energy inequalities and negative-energy constraints");
    expect(projection.qte?.prompt).toContain("Do not inspect, crop, OCR, analyze, extract, or read it yet");
    expect(projection.qte).toMatchObject({
      autoSubmit: false,
      assistantAnswer: false,
      terminalEligible: false,
    });
  });

  it("binds the OCR/math QTE to retained page evidence and explicitly admits only visual inspection", () => {
    const evidence = extractHelixWorkflowDemoEvidenceFromPayload(workbench({
      paper: {
        title: "Bounded paper",
        arxiv_id: "gr-qc/9510071",
        canonical_url: "https://arxiv.org/abs/gr-qc/9510071",
      },
      pdf: { rendered_page_refs: ["pdf-page-render:typed-page-1"] },
      evidence_chain: {
        paper_memory_ref: "scholarly-memory:paper-1",
        rendered_page_refs: ["pdf-page-render:typed-page-1"],
        ocr_math_packet_refs: [],
        promoted_equation_refs: [],
        graph_reflection_refs: [],
      },
    }));
    const projection = projectResearchPaperToProposalSession(sessionWith(evidence));
    expect(projection.currentStepId).toBe("ocr_math_candidate");
    expect(evidence.paperRefs).toEqual(expect.arrayContaining([
      "gr-qc/9510071",
      "https://arxiv.org/abs/gr-qc/9510071",
    ]));
    expect(projection.qte?.prompt).toContain("`https://arxiv.org/abs/gr-qc/9510071`");
    expect(projection.qte?.prompt).toContain("`pdf-page-render:typed-page-1`");
    expect(projection.qte?.prompt).toContain("provenance anchor");
    expect(projection.qte?.prompt).toContain("re-materialize page 2 directly");
    expect(projection.qte?.prompt).toContain("Quantum energy inequalities and negative-energy constraints");
    expect(projection.qte?.prompt).toContain("run `visual_analysis.inspect_image_region`");
    expect(projection.qte?.prompt).toContain("Do not run `docs-viewer.search_docs`");
    expect(projection.qte?.prompt).toContain("without a broad lookup or selecting another paper");
    expect(projection.qte?.prompt).toContain("stop this turn with the typed blocker");
    expect(projection.qte?.prompt).toContain("at most one bounded adjacent-page retry");
    expect(projection.qte?.prompt).toContain("observation-only evidence");
    expect(projection.qte).toMatchObject({
      autoSubmit: false,
      assistantAnswer: false,
      terminalEligible: false,
    });
  });

  it("turns a typed page-2 miss into one bounded page-1 retry without completing the step", () => {
    const payload = {
      turn_id: "ask:page-2-miss",
      question: "Inspect page 2.",
      observation: {
        schema: "helix.image_lens_region_inspection_observation.v1",
        capability: "visual_analysis.inspect_image_region",
        source_id: "pdf-page-render:page-2",
        page_number: 2,
        extraction_status: "failed",
        quality_flags: ["no_ocr_or_latex_candidate"],
        crop_image_ref: "artifact://crop/page-2.png",
        receipt_ref: "receipt:image-lens:page-2",
        evidence_id: "evidence:image-lens:page-2",
        assistant_answer: false,
        terminal_eligible: false,
      },
    };
    expect(extractHelixWorkflowDemoEvidenceFromPayload(payload).ocrMathCandidateRefs).toEqual([]);
    expect(extractHelixWorkflowDemoRetrySignalFromPayload(payload)).toMatchObject({
      stepId: "ocr_math_candidate",
      reason: "no_ocr_or_latex_candidate",
      pageNumber: 2,
      sourceId: "pdf-page-render:page-2",
    });

    const session = sessionWith({
      ...createEmptyHelixWorkflowDemoEvidence(),
      paperRefs: ["https://arxiv.org/abs/gr-qc/9510071"],
      renderedPageRefs: ["pdf-page-render:page-2"],
    });
    session.stepRetry = {
      schema: "helix.workflow_demo_step_retry.v1",
      stepId: "ocr_math_candidate",
      reason: "no_ocr_or_latex_candidate",
      attemptCount: 1,
      triedPageNumbers: [2],
      latestPageNumber: 2,
      pageCount: 26,
      sourceId: "pdf-page-render:page-2",
      artifactRefs: ["receipt:image-lens:page-2"],
      sourceTurnId: "ask:page-2-miss",
      observedAt: "2026-07-16T00:00:00.000Z",
    };
    const projection = projectResearchPaperToProposalSession(session);
    expect(projection.currentStepId).toBe("ocr_math_candidate");
    expect(projection.completedStepCount).toBe(2);
    expect(projection.qte?.reason).toContain("page 2 produced no OCR or LaTeX candidate");
    expect(projection.qte?.prompt).toContain("only bounded adjacent PDF page 1");
    expect(projection.qte?.prompt).toContain("stop after this one page");
    expect(projection.qte?.prompt).toContain("do not run `docs-viewer.search_docs`");
    expect(projection.qte?.prompt).toContain("repeat pages 2");
  });

  it("treats prose-only OCR from an equation-scoped page as a bounded retry signal", () => {
    const payload = {
      turn_id: "ask:page-2-prose-only",
      observation: {
        schema: "helix.image_lens_region_inspection_observation.v1",
        capability: "visual_analysis.inspect_image_region",
        source_id: "pdf-page-render:page-2",
        page_number: 2,
        extraction_status: "partial",
        text_candidate: "The central engine remains active after the initial burst.",
        latex_candidate: null,
        quality_flags: [
          "partial_extraction_status",
          "no_ocr_or_latex_candidate",
          "non_equation_text_candidate",
        ],
        assistant_answer: false,
        terminal_eligible: false,
      },
    };

    expect(extractHelixWorkflowDemoRetrySignalFromPayload(payload)).toMatchObject({
      stepId: "ocr_math_candidate",
      reason: "no_ocr_or_latex_candidate",
      pageNumber: 2,
      sourceId: "pdf-page-render:page-2",
    });
  });

  it("advances bounded retries from page 1 to page 3 and then exposes an exhausted typed blocker", () => {
    const session = sessionWith({
      ...createEmptyHelixWorkflowDemoEvidence(),
      paperRefs: ["paper:1"],
      renderedPageRefs: ["page:2"],
    });
    session.stepRetry = {
      schema: "helix.workflow_demo_step_retry.v1",
      stepId: "ocr_math_candidate",
      reason: "no_ocr_or_latex_candidate",
      attemptCount: 2,
      triedPageNumbers: [1, 2],
      latestPageNumber: 1,
      pageCount: 26,
      sourceId: "page:1",
      artifactRefs: ["receipt:page-2", "receipt:page-1"],
      sourceTurnId: "ask:page-1-miss",
      observedAt: "2026-07-16T00:01:00.000Z",
    };
    expect(projectResearchPaperToProposalSession(session).qte?.prompt).toContain("only bounded adjacent PDF page 3");

    session.stepRetry = {
      ...session.stepRetry,
      attemptCount: 3,
      triedPageNumbers: [1, 2, 3],
      latestPageNumber: 3,
      sourceId: "page:3",
      sourceTurnId: "ask:page-3-miss",
    };
    const exhausted = projectResearchPaperToProposalSession(session);
    expect(exhausted.currentStepId).toBe("ocr_math_candidate");
    expect(exhausted.qte?.reason).toContain("retry budget is exhausted");
    expect(exhausted.qte?.prompt).toContain("Do not inspect additional pages");
    expect(exhausted.qte?.prompt).toContain("ask the operator whether to restart the demo with a different paper");
  });

  it("does not derive a retry or a candidate from typed failure or candidate-free partial admissibility prose", () => {
    expect(extractHelixWorkflowDemoRetrySignalFromPayload({
      ok: false,
      terminal_artifact_kind: "typed_failure",
      receipt: {
        schema: "image_lens_region_inspection_receipt/v1",
        page_number: 2,
        extraction_status: "failed",
        quality_flags: ["no_ocr_or_latex_candidate"],
      },
    })).toBeNull();
    const evidence = extractHelixWorkflowDemoEvidenceFromPayload({
      status: {
        schema: "helix.scientific_evidence_workflow_status.v1",
        evidenceDepth: "exact_row_partial",
        promotedRowState: "partial",
        promotedEquationLatex: null,
        sourceId: "page:2",
        sourceImageHash: "sha256:page-2",
        postulateReadyRefs: {
          pageRenderRefs: ["page:2"],
          cropRefs: ["crop:page-2"],
          evidenceSidecarRefs: [],
          promotedEquationRowRefs: [],
          graphReflectionRefs: [],
          provenanceAuditRefs: [],
          calculatorCheckRefs: [],
          uncertaintyReductionRefs: [],
        },
      },
    });
    expect(evidence.ocrMathCandidateRefs).toEqual([]);
  });

  it("admits an actual typed text or LaTeX candidate and does not create a retry", () => {
    const payload = {
      receipt: {
        schema: "image_lens_region_inspection_receipt/v1",
        source_id: "page:3",
        page_number: 3,
        extraction_status: "partial",
        text_candidate: "G_mu_nu = 8 pi T_mu_nu",
        crop_ref: "crop:page-3-equation",
        evidence_id: "evidence:page-3-equation",
      },
    };
    expect(extractHelixWorkflowDemoRetrySignalFromPayload(payload)).toBeNull();
    expect(extractHelixWorkflowDemoEvidenceFromPayload(payload).ocrMathCandidateRefs).toEqual(expect.arrayContaining([
      "crop:page-3-equation",
      "evidence:page-3-equation",
    ]));
  });

  it("advances sequentially from the typed workbench evidence chain", () => {
    const evidence = extractHelixWorkflowDemoEvidenceFromPayload(workbench({
      pdf: { rendered_page_refs: ["page_render:paper-1:page:2"] },
      status: {
        has_ocr_or_math_candidate: true,
        has_promoted_exact_row: true,
        graph_reflection_refs: ["graph_reflection:paper-1"],
      },
      evidence_chain: {
        paper_memory_ref: "scholarly-memory:paper-1",
        rendered_page_refs: ["page_render:paper-1:page:2"],
        ocr_math_packet_refs: ["ocr_math:paper-1:page:2"],
        promoted_equation_refs: ["promoted_equation_row:paper-1:eq:1"],
        graph_reflection_refs: ["graph_reflection:paper-1"],
      },
    }));
    const projection = projectResearchPaperToProposalSession(sessionWith(evidence));
    expect(projection.completedStepCount).toBe(5);
    expect(projection.currentStepId).toBe("provenance_audit");
    expect(projection.qte).toMatchObject({
      stepId: "provenance_audit",
      autoSubmit: false,
      assistantAnswer: false,
      terminalEligible: false,
    });
    expect(projection.qte?.prompt).toContain("`graph_reflection:paper-1`");
  });

  it("requires the typed audit affordance before making proposal handoff current", () => {
    const base = extractHelixWorkflowDemoEvidenceFromPayload(workbench({
      selected_affordance: "reflect_to_theory_badge_graph",
      pdf: { rendered_page_refs: ["page:2"] },
      status: { has_ocr_or_math_candidate: true, has_promoted_exact_row: true, graph_reflection_refs: ["graph:1"] },
      evidence_chain: {
        paper_memory_ref: "paper:1",
        rendered_page_refs: ["page:2"],
        ocr_math_packet_refs: ["ocr:2"],
        promoted_equation_refs: ["row:2"],
        graph_reflection_refs: ["graph:1"],
      },
    }));
    expect(projectResearchPaperToProposalSession(sessionWith(base)).currentStepId).toBe("provenance_audit");

    const selectedButUnverified = extractHelixWorkflowDemoEvidenceFromPayload(workbench({
      selected_affordance: "audit_provenance",
      pdf: { rendered_page_refs: ["page:2"] },
      status: { has_ocr_or_math_candidate: true, has_promoted_exact_row: true, graph_reflection_refs: ["graph:1"] },
      evidence_chain: {
        paper_memory_ref: "paper:1",
        rendered_page_refs: ["page:2"],
        ocr_math_packet_refs: ["ocr:2"],
        promoted_equation_refs: ["row:2"],
        graph_reflection_refs: ["graph:1"],
      },
    }));
    expect(projectResearchPaperToProposalSession(sessionWith(selectedButUnverified)).currentStepId).toBe("provenance_audit");

    const audited = extractHelixWorkflowDemoEvidenceFromPayload(workbench({
      selected_affordance: "audit_provenance",
      terminal_authority: {
        schema: "helix.scholarly_pdf_workbench_terminal_authority.v1",
        terminal_artifact_kind: "scholarly_provenance_audit",
        terminal_authority_ref: "terminal:audit:1",
        assistant_answer: false,
        terminal_eligible: false,
      },
      pdf: { rendered_page_refs: ["page:2"] },
      status: { has_ocr_or_math_candidate: true, has_promoted_exact_row: true, graph_reflection_refs: ["graph:1"] },
      evidence_chain: {
        paper_memory_ref: "paper:1",
        rendered_page_refs: ["page:2"],
        ocr_math_packet_refs: ["ocr:2"],
        promoted_equation_refs: ["row:2"],
        graph_reflection_refs: ["graph:1"],
      },
    }));
    const projection = projectResearchPaperToProposalSession(sessionWith(
      mergeHelixWorkflowDemoEvidence(base, audited),
    ));
    expect(projection.completedStepCount).toBe(6);
    expect(projection.currentStepId).toBe("proposal_handoff");
    expect(projection.qte?.prompt).toMatch(/^\/postulate\b/);
    expect(projection.qte?.prompt).toContain("`provenance_audit:turn:paper`");
  });

  it("ignores structured-looking evidence on a typed failure", () => {
    const evidence = extractHelixWorkflowDemoEvidenceFromPayload({
      ok: false,
      terminal_artifact_kind: "typed_failure",
      scholarly_pdf_workbench_state: workbench(),
    });
    expect(evidence).toEqual(createEmptyHelixWorkflowDemoEvidence());
  });

  it("completes only after a typed postulate submission receipt is observed", () => {
    const prior = {
      ...createEmptyHelixWorkflowDemoEvidence(),
      paperRefs: ["paper:1"],
      renderedPageRefs: ["page:1"],
      ocrMathCandidateRefs: ["ocr:1"],
      promotedEquationRefs: ["row:1"],
      graphReflectionRefs: ["graph:1"],
      provenanceAuditRefs: ["audit:1"],
    };
    const receipt = extractHelixWorkflowDemoEvidenceFromPayload({
      terminal_artifact_kind: "postulate_submit_receipt",
      receiptId: "postulate-receipt:1",
    });
    const projection = projectResearchPaperToProposalSession(sessionWith(
      mergeHelixWorkflowDemoEvidence(prior, receipt),
    ));
    expect(projection.completed).toBe(true);
    expect(projection.qte).toBeNull();
  });
});
