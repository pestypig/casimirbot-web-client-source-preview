// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HelixAskWorkflowSuggestionRuntime } from "@/components/helix/ask-console/HelixAskWorkflowSuggestionRuntime";
import WorkflowDemoLabPanel from "@/components/workstation/WorkflowDemoLabPanel";
import { buildHelixWorkflowDemoDebugExport } from "@/lib/helix/workflow-demos/workflow-demo-debug";
import { projectResearchPaperToProposalSession } from "@/lib/helix/workflow-demos/research-paper-to-proposal";
import { useHelixWorkflowDemoStore } from "@/store/useHelixWorkflowDemoStore";
import { createHelixWorkflowDemoCustomBinding } from "@/lib/helix/workflow-demos/workflow-demo-context";
import { useAgiChatStore } from "@/store/useAgiChatStore";

const launchHelixAskPrompt = vi.fn();
const testBinding = () => createHelixWorkflowDemoCustomBinding("Quantum energy inequalities and negative-energy constraints")!;
const TEST_CHAT_ID = "chat:workflow";

const submitCurrentQte = (turnId: string, prompt: string) => {
  const state = useHelixWorkflowDemoStore.getState();
  const session = state.session;
  if (!session) throw new Error("workflow session required");
  const stepId = projectResearchPaperToProposalSession(session).currentStepId;
  if (!stepId) throw new Error("current workflow step required");
  state.recordPromptInserted({
    stepId,
    prompt,
    templatePrompt: prompt,
    sourceSessionId: TEST_CHAT_ID,
  });
  useHelixWorkflowDemoStore.getState().markPromptSubmitted({
    runId: session.runId,
    stepId,
    sourceSessionId: TEST_CHAT_ID,
    turnId,
    prompt,
  });
};

vi.mock("@/lib/helix/ask-prompt-launch", () => ({
  launchHelixAskPrompt: (...args: unknown[]) => launchHelixAskPrompt(...args),
}));

describe("HelixAskWorkflowSuggestionRuntime", () => {
  afterEach(cleanup);

  beforeEach(() => {
    window.localStorage.clear();
    useHelixWorkflowDemoStore.getState().resetDemo();
    useHelixWorkflowDemoStore.getState().clearDebugHistory();
    useAgiChatStore.setState({ sessions: {}, activeId: TEST_CHAT_ID, hydrated: true });
    launchHelixAskPrompt.mockReset();
  });

  it("renders an editable non-terminal QTE and inserts without auto-submit", () => {
    useHelixWorkflowDemoStore.getState().startResearchPaperToProposalDemo(testBinding(), TEST_CHAT_ID);
    render(<HelixAskWorkflowSuggestionRuntime />);

    const surface = screen.getByTestId("helix-ask-workflow-qte");
    expect(surface).toHaveAttribute("data-assistant-answer", "false");
    expect(surface).toHaveAttribute("data-terminal-eligible", "false");
    expect(surface).toHaveAttribute("data-auto-submit", "false");

    const editor = screen.getByLabelText("Editable next workflow prompt");
    fireEvent.change(editor, { target: { value: "Edited bounded paper lookup" } });
    fireEvent.click(screen.getByRole("button", { name: /use next prompt/i }));

    expect(launchHelixAskPrompt).toHaveBeenCalledWith(expect.objectContaining({
      question: "Edited bounded paper lookup",
      autoSubmit: false,
      suppressWorkstationPayloadActions: true,
      workflowQte: expect.objectContaining({
        schema: "helix.workflow_qte_launch.v1",
        sourceSessionId: TEST_CHAT_ID,
        stepId: "paper_lookup",
      }),
    }));
    const inserted = useHelixWorkflowDemoStore.getState().debugEvents.find(
      (event) => event.event_kind === "qte_prompt_inserted",
    );
    expect(inserted).toMatchObject({
      qte_step_id: "paper_lookup",
      prompt_length: "Edited bounded paper lookup".length,
      prompt_edited: true,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    });
    expect(inserted?.prompt_hash).toMatch(/^fnv1a32:/);
    expect(inserted).not.toHaveProperty("prompt");
    expect(useHelixWorkflowDemoStore.getState().session?.pendingQteDispatch).toMatchObject({
      sourceSessionId: TEST_CHAT_ID,
      stepId: "paper_lookup",
      submittedTurnId: null,
    });
  });

  it("observes a typed workbench payload and moves to the next unmet step", async () => {
    useHelixWorkflowDemoStore.getState().startResearchPaperToProposalDemo(testBinding(), TEST_CHAT_ID);
    const { rerender } = render(<HelixAskWorkflowSuggestionRuntime />);
    expect(screen.getByText("Find a bounded paper")).toBeInTheDocument();
    const submittedPrompt = "Find a bounded scholarly paper";
    submitCurrentQte("turn:lookup", submittedPrompt);

    const replyCreatedAtMs = Date.now() - 10;
    rerender(<HelixAskWorkflowSuggestionRuntime latestPayload={{
      id: "reply:lookup",
      createdAtMs: replyCreatedAtMs,
      schema: "helix.scholarly_pdf_workbench_state.v1",
      turn_id: "turn:lookup",
      question: submittedPrompt,
      scholarly_memory_id: "paper-memory:1",
      paper: { title: "Paper one" },
      pdf: { rendered_page_refs: [] },
      status: { has_ocr_or_math_candidate: false, has_promoted_exact_row: false, graph_reflection_refs: [] },
      evidence_chain: {
        paper_memory_ref: "paper-memory:1",
        rendered_page_refs: [],
        ocr_math_packet_refs: [],
        promoted_equation_refs: [],
        graph_reflection_refs: [],
      },
      assistant_answer: false,
      terminal_eligible: false,
    }} />);

    await waitFor(() => expect(screen.getByText("Render a PDF page")).toBeInTheDocument());
    const state = useHelixWorkflowDemoStore.getState();
    const advancement = state.debugEvents.find((event) => event.event_kind === "workflow_step_advanced");
    expect(advancement).toMatchObject({
      source_client_reply_id: "reply:lookup",
      source_turn_id: "turn:lookup",
      amends_debug_for_turn_id: "turn:lookup",
      before_step_id: "paper_lookup",
      after_step_id: "pdf_page_render",
      qte_step_id: "pdf_page_render",
      new_artifact_refs: expect.arrayContaining(["paper-memory:1"]),
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    });

    const debugExport = buildHelixWorkflowDemoDebugExport({
      session: state.session,
      events: state.debugEvents,
      target: {
        client_reply_id: "reply:lookup",
        turn_id: "turn:lookup",
        trace_id: null,
        reply_created_at_ms: replyCreatedAtMs,
      },
      exportedAt: "2026-07-15T12:00:00.000Z",
    });
    expect(debugExport).toMatchObject({
      schema: "helix.workflow_demo_debug.v1",
      current_turn_event_count: expect.any(Number),
      runtime_goal_lane_attached: false,
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    });
    expect(debugExport.current_turn_events).toContainEqual(expect.objectContaining({
      event_kind: "workflow_step_advanced",
      source_turn_id: "turn:lookup",
    }));
    expect(debugExport.post_final_amendments.length).toBeGreaterThan(0);
  });

  it("admits evidence only for the current procedural step", () => {
    useHelixWorkflowDemoStore.getState().startResearchPaperToProposalDemo(testBinding(), TEST_CHAT_ID);
    const workbenchWithFutureEvidence = {
      id: "reply:multi-depth",
      turn_id: "turn:multi-depth",
      schema: "helix.scholarly_pdf_workbench_state.v1",
      scholarly_memory_id: "paper-memory:1",
      paper: { title: "Paper one" },
      pdf: { rendered_page_refs: ["page:1"] },
      status: { has_ocr_or_math_candidate: true, has_promoted_exact_row: false, graph_reflection_refs: [] },
      evidence_chain: {
        paper_memory_ref: "paper-memory:1",
        rendered_page_refs: ["page:1"],
        ocr_math_packet_refs: ["ocr:stale"],
        promoted_equation_refs: [],
        graph_reflection_refs: [],
      },
      assistant_answer: false,
      terminal_eligible: false,
    };

    submitCurrentQte("turn:multi-depth", "Find the bounded paper");
    useHelixWorkflowDemoStore.getState().observePayload({
      ...workbenchWithFutureEvidence,
      question: "Find the bounded paper",
    }, TEST_CHAT_ID);
    let session = useHelixWorkflowDemoStore.getState().session;
    expect(session?.evidence).toMatchObject({
      paperRefs: expect.arrayContaining(["paper-memory:1"]),
      renderedPageRefs: [],
      ocrMathCandidateRefs: [],
    });

    submitCurrentQte("turn:page", "Render one PDF page");
    useHelixWorkflowDemoStore.getState().observePayload({
      ...workbenchWithFutureEvidence,
      id: "reply:page",
      turn_id: "turn:page",
      question: "Render one PDF page",
    }, TEST_CHAT_ID);
    session = useHelixWorkflowDemoStore.getState().session;
    expect(session?.evidence).toMatchObject({
      renderedPageRefs: ["page:1"],
      ocrMathCandidateRefs: [],
    });
  });

  it("records a typed failure as a non-advancing debug observation", async () => {
    useHelixWorkflowDemoStore.getState().startResearchPaperToProposalDemo(testBinding(), TEST_CHAT_ID);
    submitCurrentQte("turn:typed-failure", "Find the bounded paper");
    render(<HelixAskWorkflowSuggestionRuntime latestPayload={{
      id: "reply:typed-failure",
      turn_id: "turn:typed-failure",
      question: "Find the bounded paper",
      ok: false,
      terminal_artifact_kind: "typed_failure",
      scholarly_pdf_workbench_state: {
        schema: "helix.scholarly_pdf_workbench_state.v1",
        scholarly_memory_id: "paper-memory:must-not-advance",
      },
    }} />);

    await waitFor(() => {
      const observation = useHelixWorkflowDemoStore.getState().debugEvents.find(
        (event) => event.source_turn_id === "turn:typed-failure" &&
          event.event_kind === "workflow_evidence_observed",
      );
      expect(observation).toMatchObject({
        event_kind: "workflow_evidence_observed",
        before_step_id: "paper_lookup",
        after_step_id: "paper_lookup",
        observed_artifact_refs: [],
        new_artifact_refs: [],
        reason: "typed_failure_not_admitted_as_workflow_evidence",
        answer_authority: false,
        assistant_answer: false,
        terminal_eligible: false,
      });
    });
    expect(useHelixWorkflowDemoStore.getState().session?.evidence.paperRefs).toEqual([]);
    expect(screen.getByText("Find a bounded paper")).toBeInTheDocument();
  });

  it("enables the public demo from the lab panel", () => {
    render(<WorkflowDemoLabPanel />);
    expect(screen.getByTestId("workflow-demo-lab-panel")).toBeInTheDocument();
    expect(screen.getByText("public demo")).toBeInTheDocument();
    expect(screen.queryByTestId("helix-ask-workflow-qte")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Custom topic" }));
    fireEvent.change(screen.getByLabelText("Custom workflow objective"), {
      target: { value: "Quantum energy inequalities and negative-energy constraints" },
    });
    fireEvent.click(screen.getByRole("button", { name: /enable demo/i }));

    expect(screen.getByTestId("helix-ask-workflow-qte")).toBeInTheDocument();
    expect(screen.getAllByText("Find a bounded paper")).toHaveLength(2);
  });

  it("rejects evidence from a different chat and requires an explicit repin", () => {
    useHelixWorkflowDemoStore.getState().startResearchPaperToProposalDemo(testBinding(), TEST_CHAT_ID);
    submitCurrentQte("turn:lookup", "Find the bounded paper");
    useHelixWorkflowDemoStore.getState().observePayload({
      id: "reply:other-chat",
      turn_id: "turn:lookup",
      question: "Find the bounded paper",
      schema: "helix.scholarly_pdf_workbench_state.v1",
      scholarly_memory_id: "paper-memory:must-not-admit",
    }, "chat:other");

    expect(useHelixWorkflowDemoStore.getState().session?.evidence.paperRefs).toEqual([]);
    expect(useHelixWorkflowDemoStore.getState().debugEvents).toContainEqual(expect.objectContaining({
      event_kind: "workflow_evidence_rejected",
      reason: "payload_from_non_origin_chat",
    }));

    useAgiChatStore.setState({ activeId: "chat:other" });
    render(<WorkflowDemoLabPanel />);
    expect(screen.getByTestId("workflow-demo-chat-mismatch")).toBeInTheDocument();
    expect(screen.queryByTestId("helix-ask-workflow-qte")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue this run here" }));
    expect(useHelixWorkflowDemoStore.getState().session?.originSessionId).toBe("chat:other");
    expect(screen.getByTestId("helix-ask-workflow-qte")).toBeInTheDocument();
  });

  it("offers an inline explicit continue action when a new chat owns the Ask surface", () => {
    useHelixWorkflowDemoStore.getState().startResearchPaperToProposalDemo(testBinding(), TEST_CHAT_ID);
    useAgiChatStore.setState({ activeId: "chat:new" });
    render(<HelixAskWorkflowSuggestionRuntime />);

    expect(screen.getByTestId("helix-ask-workflow-chat-mismatch")).toBeInTheDocument();
    expect(screen.queryByTestId("helix-ask-workflow-qte")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue this run here" }));
    expect(useHelixWorkflowDemoStore.getState().session?.originSessionId).toBe("chat:new");
    expect(screen.getByTestId("helix-ask-workflow-qte")).toBeInTheDocument();
  });

  it("rejects same-chat evidence from a turn other than the submitted QTE turn", () => {
    useHelixWorkflowDemoStore.getState().startResearchPaperToProposalDemo(testBinding(), TEST_CHAT_ID);
    submitCurrentQte("turn:qte", "Find the bounded paper");
    useHelixWorkflowDemoStore.getState().observePayload({
      id: "reply:unlinked",
      turn_id: "turn:other",
      question: "Find the bounded paper",
      schema: "helix.scholarly_pdf_workbench_state.v1",
      scholarly_memory_id: "paper-memory:must-not-admit",
    }, TEST_CHAT_ID);

    expect(useHelixWorkflowDemoStore.getState().session?.evidence.paperRefs).toEqual([]);
    expect(useHelixWorkflowDemoStore.getState().debugEvents).toContainEqual(expect.objectContaining({
      event_kind: "workflow_evidence_rejected",
      reason: "payload_turn_not_linked_to_qte_submission",
    }));
  });

  it("causally replays all seven QTE steps to a typed completed session", () => {
    useHelixWorkflowDemoStore.getState().startResearchPaperToProposalDemo(testBinding(), TEST_CHAT_ID);
    const steps = [
      {
        stepId: "paper_lookup",
        turnId: "turn:replay:1",
        prompt: "Replay paper lookup",
        payload: {
          schema: "helix.scholarly_pdf_workbench_state.v1",
          scholarly_memory_id: "paper-memory:replay",
          paper: { title: "Replay paper" },
        },
      },
      {
        stepId: "pdf_page_render",
        turnId: "turn:replay:2",
        prompt: "Replay page render",
        payload: {
          schema: "helix.scholarly_pdf_workbench_state.v1",
          pdf: { rendered_page_refs: ["page-render:replay:1"] },
          evidence_chain: { rendered_page_refs: ["page-render:replay:1"] },
        },
      },
      {
        stepId: "ocr_math_candidate",
        turnId: "turn:replay:3",
        prompt: "Replay OCR math candidate",
        payload: {
          schema: "helix.scholarly_pdf_workbench_state.v1",
          pdf: { rendered_page_refs: ["page-render:replay:2"] },
          status: { has_ocr_or_math_candidate: true },
          evidence_chain: {
            rendered_page_refs: ["page-render:replay:2"],
            ocr_math_packet_refs: ["ocr-math:replay"],
          },
        },
      },
      {
        stepId: "exact_row_promotion",
        turnId: "turn:replay:4",
        prompt: "Replay exact row promotion",
        payload: {
          schema: "helix.scholarly_pdf_workbench_state.v1",
          status: { has_promoted_exact_row: true },
          evidence_chain: { promoted_equation_refs: ["equation-row:replay"] },
        },
      },
      {
        stepId: "graph_reflection",
        turnId: "turn:replay:5",
        prompt: "Replay graph reflection",
        payload: {
          schema: "helix.scholarly_pdf_workbench_state.v1",
          status: { graph_reflection_refs: ["graph-reflection:replay"] },
          evidence_chain: { graph_reflection_refs: ["graph-reflection:replay"] },
        },
      },
      {
        stepId: "provenance_audit",
        turnId: "turn:replay:6",
        prompt: "Replay provenance audit",
        payload: {
          schema: "helix.scholarly_pdf_workbench_state.v1",
          scholarly_memory_id: "paper-memory:replay",
          turn_id: "turn:replay:6",
          selected_affordance: "audit_provenance",
          pdf: { rendered_page_refs: ["page-render:replay:2"] },
          status: {
            has_promoted_exact_row: true,
            graph_reflection_refs: ["graph-reflection:replay"],
          },
          evidence_chain: {
            promoted_equation_refs: ["equation-row:replay"],
            graph_reflection_refs: ["graph-reflection:replay"],
          },
          terminal_authority: {
            terminal_artifact_kind: "provenance_audit_receipt",
            terminal_authority_ref: "provenance-audit:replay",
          },
        },
      },
      {
        stepId: "proposal_handoff",
        turnId: "turn:replay:7",
        prompt: "Replay proposal handoff",
        payload: {
          schema: "helix.postulate_submit_receipt.v1",
          receiptId: "postulate-receipt:replay",
          terminal_artifact_kind: "postulate_submit_receipt",
        },
      },
    ] as const;

    for (const [index, step] of steps.entries()) {
      expect(projectResearchPaperToProposalSession(
        useHelixWorkflowDemoStore.getState().session,
      ).currentStepId).toBe(step.stepId);
      submitCurrentQte(step.turnId, step.prompt);
      useHelixWorkflowDemoStore.getState().observePayload({
        id: `reply:replay:${index + 1}`,
        ...step.payload,
        turn_id: step.turnId,
        question: step.prompt,
      }, TEST_CHAT_ID);
    }

    const state = useHelixWorkflowDemoStore.getState();
    const projection = projectResearchPaperToProposalSession(state.session);
    expect(projection).toMatchObject({
      completed: true,
      completedStepCount: 7,
      currentStepId: null,
      qte: null,
    });
    expect(state.session).toMatchObject({
      status: "completed",
      pendingQteDispatch: null,
      evidence: {
        paperRefs: expect.arrayContaining(["paper-memory:replay"]),
        renderedPageRefs: expect.arrayContaining(["page-render:replay:1"]),
        ocrMathCandidateRefs: expect.arrayContaining(["ocr-math:replay"]),
        promotedEquationRefs: expect.arrayContaining(["equation-row:replay"]),
        graphReflectionRefs: expect.arrayContaining(["graph-reflection:replay"]),
        provenanceAuditRefs: expect.arrayContaining(["provenance-audit:replay"]),
        proposalReceiptRefs: expect.arrayContaining(["postulate-receipt:replay"]),
      },
    });
    expect(state.debugEvents.filter((event) => event.event_kind === "qte_prompt_submitted")).toHaveLength(7);
    expect(state.debugEvents.filter((event) => event.event_kind === "workflow_step_advanced")).toHaveLength(6);
    expect(state.debugEvents).toContainEqual(expect.objectContaining({
      event_kind: "workflow_completed",
      source_turn_id: "turn:replay:7",
      before_step_id: "proposal_handoff",
      after_step_id: null,
    }));
  });

  it("binds the first QTE to the active chat research objective with debug provenance", () => {
    useAgiChatStore.setState({
      activeId: "chat:workflow",
      hydrated: true,
      sessions: {
        "chat:workflow": {
          id: "chat:workflow",
          title: "Research",
          contextId: "helix-ask:desktop",
          personaId: "default",
          createdAt: "2026-07-15T12:00:00.000Z",
          updatedAt: "2026-07-15T12:02:00.000Z",
          messages: [{
            id: "message:research-objective",
            role: "user",
            at: "2026-07-15T12:02:00.000Z",
            traceId: "turn:research-objective",
            content: "Find primary papers about quantum energy inequalities, negative energy, and traversable wormhole geometry.",
          }],
        },
      },
    });

    render(<WorkflowDemoLabPanel />);
    expect(screen.getByText(/Find primary papers about quantum energy inequalities/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /enable demo/i }));

    const qte = screen.getByTestId("helix-ask-workflow-qte");
    expect(qte).toHaveAttribute("data-context-source-kind", "current_chat");
    expect((screen.getByLabelText("Editable next workflow prompt") as HTMLTextAreaElement).value)
      .toContain("quantum energy inequalities");
    const contextEvent = useHelixWorkflowDemoStore.getState().debugEvents.find(
      (event) => event.event_kind === "workflow_context_bound",
    );
    expect(contextEvent).toMatchObject({
      source_client_reply_id: null,
      source_turn_id: "turn:research-objective",
      context_source_kind: "current_chat",
      context_source_message_id: "message:research-objective",
      context_source_trace_id: "turn:research-objective",
      context_confidence: "high",
      raw_content_included: false,
      answer_authority: false,
      terminal_eligible: false,
    });
    expect(contextEvent?.context_objective_hash).toMatch(/^fnv1a32:/);
    expect(contextEvent).not.toHaveProperty("objective");
  });
});
