import { afterEach, describe, expect, it } from "vitest";
import { useHelixWorkflowDemoStore } from "@/store/useHelixWorkflowDemoStore";
import { projectResearchPaperToProposalSession } from "@/lib/helix/workflow-demos/research-paper-to-proposal";
import { createHelixWorkflowDemoCustomBinding } from "@/lib/helix/workflow-demos/workflow-demo-context";
import { hashHelixWorkflowDemoDebugText } from "@/lib/helix/workflow-demos/workflow-demo-debug";
import {
  HELIX_WORKFLOW_DEMO_SESSION_SCHEMA,
  HELIX_WORKFLOW_QTE_DISPATCH_SCHEMA,
  RESEARCH_PAPER_TO_PROPOSAL_DEMO_ID,
  createEmptyHelixWorkflowDemoEvidence,
  type HelixWorkflowDemoSessionV1,
} from "@shared/contracts/helix-workflow-demo.v1";

const sessionForSubmittedStep3 = (question: string, turnId: string): HelixWorkflowDemoSessionV1 => ({
  schema: HELIX_WORKFLOW_DEMO_SESSION_SCHEMA,
  runId: "workflow-demo:retry-store-test",
  demoId: RESEARCH_PAPER_TO_PROPOSAL_DEMO_ID,
  status: "active",
  startedAt: "2026-07-16T00:00:00.000Z",
  updatedAt: "2026-07-16T00:00:01.000Z",
  evidence: {
    ...createEmptyHelixWorkflowDemoEvidence(),
    paperRefs: ["https://arxiv.org/abs/gr-qc/9510071"],
    renderedPageRefs: ["pdf-page-render:page-2"],
  },
  dismissedStepId: null,
  contextBinding: createHelixWorkflowDemoCustomBinding("Quantum inequalities in negative-energy geometries")!,
  originSessionId: "chat:workflow-retry",
  pendingQteDispatch: {
    schema: HELIX_WORKFLOW_QTE_DISPATCH_SCHEMA,
    runId: "workflow-demo:retry-store-test",
    stepId: "ocr_math_candidate",
    sourceSessionId: "chat:workflow-retry",
    insertedPromptHash: hashHelixWorkflowDemoDebugText(question),
    submittedPromptHash: hashHelixWorkflowDemoDebugText(question),
    submittedTurnId: turnId,
    insertedAt: "2026-07-16T00:00:00.500Z",
    submittedAt: "2026-07-16T00:00:01.000Z",
  },
  stepRetry: null,
});

afterEach(() => {
  useHelixWorkflowDemoStore.setState({ session: null, debugEvents: [] });
});

describe("useHelixWorkflowDemoStore bounded Step 3 retries", () => {
  it("records a causally linked partial receipt separately from completion evidence", () => {
    const question = "Inspect only page 2 and extract the first displayed equation.";
    const turnId = "ask:page-2-partial";
    useHelixWorkflowDemoStore.setState({
      session: sessionForSubmittedStep3(question, turnId),
      debugEvents: [],
    });
    const payload = {
      schema: "helix.ask.reply.v1",
      turn_id: turnId,
      question,
      observation: {
        schema: "helix.image_lens_region_inspection_observation.v1",
        capability: "visual_analysis.inspect_image_region",
        source_id: "pdf-page-render:page-2",
        page_number: 2,
        page_count: 26,
        extraction_status: "failed",
        quality_flags: ["no_ocr_or_latex_candidate"],
        crop_image_ref: "artifact://crop/page-2.png",
        receipt_ref: "receipt:image-lens:page-2",
        evidence_id: "evidence:image-lens:page-2",
        assistant_answer: false,
        terminal_eligible: false,
      },
    };

    useHelixWorkflowDemoStore.getState().observePayload(payload, "chat:workflow-retry");
    const firstState = useHelixWorkflowDemoStore.getState();
    expect(firstState.session?.evidence.ocrMathCandidateRefs).toEqual([]);
    expect(firstState.session?.stepRetry).toMatchObject({
      stepId: "ocr_math_candidate",
      attemptCount: 1,
      triedPageNumbers: [2],
      latestPageNumber: 2,
      sourceTurnId: turnId,
    });
    const projection = projectResearchPaperToProposalSession(firstState.session);
    expect(projection.currentStepId).toBe("ocr_math_candidate");
    expect(projection.completedStepCount).toBe(2);
    expect(projection.qte?.prompt).toContain("only bounded adjacent PDF page 1");
    expect(firstState.debugEvents.at(-1)).toMatchObject({
      event_kind: "workflow_evidence_observed",
      source_turn_id: turnId,
      reason: "typed_partial_observation_selected_bounded_step_retry",
      qte_step_id: "ocr_math_candidate",
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
    });
    expect(firstState.debugEvents.at(-1)?.prompt_hash).not.toBeNull();

    useHelixWorkflowDemoStore.getState().observePayload(payload, "chat:workflow-retry");
    expect(useHelixWorkflowDemoStore.getState().session?.stepRetry?.attemptCount).toBe(1);
    expect(useHelixWorkflowDemoStore.getState().debugEvents).toHaveLength(firstState.debugEvents.length);
  });

  it("clears retry state only when a typed OCR candidate advances the step", () => {
    const question = "Inspect only bounded adjacent PDF page 1.";
    const turnId = "ask:page-1-candidate";
    const session = sessionForSubmittedStep3(question, turnId);
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
      sourceTurnId: "ask:page-2-partial",
      observedAt: "2026-07-16T00:00:01.000Z",
    };
    useHelixWorkflowDemoStore.setState({ session, debugEvents: [] });

    useHelixWorkflowDemoStore.getState().observePayload({
      schema: "helix.ask.reply.v1",
      turn_id: turnId,
      question,
      receipt: {
        schema: "image_lens_region_inspection_receipt/v1",
        source_id: "pdf-page-render:page-1",
        page_number: 1,
        extraction_status: "partial",
        latex_candidate: "G_{\\mu\\nu}=8\\pi T_{\\mu\\nu}",
        crop_ref: "crop:page-1-equation",
        evidence_id: "evidence:page-1-equation",
        assistant_answer: false,
        terminal_eligible: false,
      },
    }, "chat:workflow-retry");

    const state = useHelixWorkflowDemoStore.getState();
    expect(state.session?.stepRetry).toBeNull();
    expect(state.session?.evidence.ocrMathCandidateRefs).toEqual(expect.arrayContaining([
      "crop:page-1-equation",
      "evidence:page-1-equation",
    ]));
    expect(projectResearchPaperToProposalSession(state.session).currentStepId).toBe("exact_row_promotion");
    expect(state.debugEvents.at(-1)?.reason).toBe("typed_evidence_advanced_next_unmet_step");
  });
});
