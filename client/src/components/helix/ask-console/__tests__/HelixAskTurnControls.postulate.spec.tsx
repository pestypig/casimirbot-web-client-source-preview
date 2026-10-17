/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const launchMocks = vi.hoisted(() => ({
  launchHelixAskPrompt: vi.fn(),
}));

vi.mock("@/lib/helix/ask-prompt-launch", () => ({
  launchHelixAskPrompt: launchMocks.launchHelixAskPrompt,
}));

import { HelixAskTurnControls } from "../HelixAskTurnControls";
import { useDocumentImageRegionStore } from "@/store/useDocumentImageRegionStore";
import { useScientificEvidenceWorkflowStore } from "@/store/useScientificEvidenceWorkflowStore";

describe("HelixAskTurnControls postulate action", () => {
  beforeEach(() => {
    useScientificEvidenceWorkflowStore.getState().clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.clearAllTimers();
    useScientificEvidenceWorkflowStore.getState().clear();
    useDocumentImageRegionStore.setState({
      source: null,
      naturalSize: null,
      cropDraft: { x: 0, y: 0, width: 640, height: 360 },
      receipts: [],
      lastReceipt: null,
    });
  });

  const renderControls = (overrides: Partial<React.ComponentProps<typeof HelixAskTurnControls>> = {}) =>
    render(
      <HelixAskTurnControls
        onCopyFinal={vi.fn()}
        onDebugCopy={vi.fn()}
        onReadAloud={vi.fn()}
        postulateText="A constructive final answer that can be attached as a postulate."
        postulateTestId="helix-ask-postulate"
        {...overrides}
      />,
    );

  it("renders the postulate action as an icon-only peer with the final-answer controls", () => {
    renderControls();

    const copy = screen.getByRole("button", { name: "Copy response" });
    const debug = screen.getByRole("button", { name: "Debug copy" });
    const readAloud = screen.getByRole("button", { name: "Read aloud" });
    const postulate = screen.getByTestId("helix-ask-postulate");

    expect(copy).toBeTruthy();
    expect(debug).toBeTruthy();
    expect(readAloud).toBeTruthy();
    expect(postulate).toBeTruthy();
    expect(postulate.textContent).toBe("");
    expect(postulate.getAttribute("aria-label")).toBe("Send postulate for review");
  });

  it("launches an auto-submitted /postulate runtime review turn with explicit source ids", () => {
    renderControls({
      postulateOriginatingSessionId: "turn-source-1",
      postulateOriginatingAnswerId: "answer-source-1",
    });

    fireEvent.click(screen.getByTestId("helix-ask-postulate"));

    expect(launchMocks.launchHelixAskPrompt).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("/postulate")).toBeNull();
    expect(screen.queryByLabelText("Postulate review note")).toBeNull();
    expect(screen.queryByLabelText("Attached final answer")).toBeNull();
    expect(launchMocks.launchHelixAskPrompt).toHaveBeenCalledWith(expect.objectContaining({
      autoSubmit: true,
      forceReasoningDispatch: true,
      requiresBackendAskEntrypoint: true,
      question: expect.stringContaining("/postulate\nReview this postulate candidate"),
      routeMetadata: expect.objectContaining({
        invocationKind: "postulate_final_answer_review",
        allowedCapabilities: ["postulate.submit_proposal"],
        requiredCanonicalGoal: "postulate_runtime_review_then_gated_submit",
        requiredTerminalProductKind: "postulate_runtime_review",
        requiredTerminalArtifactKind: "postulate_runtime_review",
        allowedTerminalProductKinds: ["postulate_runtime_review", "typed_failure"],
        allowedTerminalArtifactKinds: ["postulate_runtime_review", "typed_failure"],
      }),
    }));
    const payload = launchMocks.launchHelixAskPrompt.mock.calls[0]?.[0];
    expect(payload.question).toContain("Return JSON only with this shape:");
    expect(payload.question).toContain("Evidence context:");
    expect(payload.question).toContain("Candidate postulate:");
    expect(payload.question).toContain("A constructive final answer that can be attached as a postulate.");
    expect(payload.question).toContain("Originating session: turn-source-1");
    expect(payload.question).toContain("Originating answer: answer-source-1");
    expect(payload.question).toContain("decision");
    expect(payload.question).toContain("readinessRating");
    expect(payload.question).toContain("not claim proof");
  });

  it("carries recent scientific Image Lens evidence refs into postulate review metadata", () => {
    renderControls({
      postulateOriginatingAnswerId: "answer-source-1",
      postulateEvidenceText: [
        "I am using the latest scientific Image Lens evidence chain, not a fresh scholarly lookup.",
        "Evidence depth: `exact_row_promoted`.",
        "Sidecar: `ask:turn-1:scientific_image_evidence_sidecar:retry:ask:turn-2`.",
        "Image Lens source: `pdf-page-render:a57b3f7f064f9ade`.",
        "Crop ref: `sha256:23e70bd8fb953a139ca1afcc206cd51dd4f76c66bbef7524b487b63ba77fdf95#crop=73,570,1078,87`.",
        "Active promoted row blockers: `none`.",
        "Theory Badge Graph reflection completed as diagnostic evidence only.",
        "Calculator status: template_only.",
      ].join("\n"),
    });

    fireEvent.click(screen.getByTestId("helix-ask-postulate"));

    const payload = launchMocks.launchHelixAskPrompt.mock.calls[0]?.[0];
    expect(payload.routeMetadata.evidenceContext).toMatchObject({
      evidenceSidecarRefs: [expect.stringContaining("scientific_image_evidence_sidecar")],
      promotedEquationRowRefs: [expect.stringContaining("promoted_equation_row:sha256")],
      pageRenderRefs: expect.arrayContaining(["pdf-page-render:a57b3f7f064f9ade"]),
      cropRefs: [expect.stringContaining("sha256:23e70bd8fb953a139")],
      graphReflectionRefs: ["graph_reflection:diagnostic:answer-source-1"],
      calculatorCheckRefs: ["calculator_check:template_admissibility:template_admissible"],
    });
    expect(payload.routeMetadata.scientificEvidenceWorkflowStatus).toMatchObject({
      schema: "helix.scientific_evidence_workflow_status.v1",
      evidenceDepth: "exact_row_promoted",
      promotedRowState: "promoted",
      calculatorTemplateStatus: "template_admissible",
    });
    expect(payload.question).toContain("Scientific evidence workflow status:");
    expect(payload.question).toContain("promotedEquationRowRefs");
    expect(payload.question).toContain("graphReflectionRefs");
  });

  it("adds restored Image Lens PDF source and crop provenance to the postulate evidence package", () => {
    useDocumentImageRegionStore.setState({
      source: {
        sourceImageUrl: "data:image/png;base64,abc",
        sourceAttachmentId: "pdf-page-render:a57b3f7f064f9ade",
        sourceKind: "pdf_page_render",
        pageNumber: 5,
        pageImageRef: "pdf-page-render:a57b3f7f064f9ade",
        sourceId: "pdf-page-render:a57b3f7f064f9ade",
        scientificEvidenceSidecarId: "ask:turn-7:scientific_image_evidence_sidecar",
        sourceRefHash: "sha256:abcdef1234567890",
        naturalSize: { width: 1224, height: 1584 },
        sourceDimensionsPx: { width: 1224, height: 1584 },
        cropDraft: { x: 73, y: 570, width: 1077, height: 87 },
        viewMode: "manual_crop",
        coordinateSpace: "natural_image_px",
      },
      naturalSize: { width: 1224, height: 1584 },
      cropDraft: { x: 73, y: 570, width: 1077, height: 87 },
    });

    renderControls({
      postulateEvidenceText: [
        "Evidence depth: `exact_row_promoted`.",
        "Active promoted row blockers: `none`.",
      ].join("\n"),
    });

    fireEvent.click(screen.getByTestId("helix-ask-postulate"));

    const payload = launchMocks.launchHelixAskPrompt.mock.calls[0]?.[0];
    expect(payload.routeMetadata.evidenceContext).toMatchObject({
      evidenceSidecarRefs: expect.arrayContaining(["ask:turn-7:scientific_image_evidence_sidecar"]),
      pageRenderRefs: expect.arrayContaining([
        "pdf-page-render:a57b3f7f064f9ade",
        "page_render:pdf-page-render:a57b3f7f064f9ade",
        "page_render:sha256:abcdef1234567890:page:5",
      ]),
      cropRefs: expect.arrayContaining([
        "equation_crop:sha256:abcdef1234567890#crop=73,570,1077,87",
        "sha256:abcdef1234567890#crop=73,570,1077,87",
      ]),
      promotedEquationRowRefs: expect.arrayContaining([
        "promoted_equation_row:sha256:abcdef1234567890#crop=73,570,1077,87",
      ]),
    });
    expect(payload.routeMetadata.scientificEvidenceWorkflowStatus).toMatchObject({
      sourceId: "pdf-page-render:a57b3f7f064f9ade",
      sourceImageHash: "sha256:abcdef1234567890",
      pageNumber: 5,
      cropRef: "sha256:abcdef1234567890#crop=73,570,1077,87",
      sidecarId: "ask:turn-7:scientific_image_evidence_sidecar",
      evidenceDepth: "exact_row_promoted",
    });
  });
});
