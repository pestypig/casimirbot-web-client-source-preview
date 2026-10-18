// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as agiApi from "@/lib/agi/api";
import ImageLensPanel from "@/components/workstation/ImageLensPanel";
import { HELIX_ASK_LIVE_EVENT_BUS_EVENT } from "@/lib/helix/liveEventsBus";
import { useDocumentImageRegionStore } from "@/store/useDocumentImageRegionStore";
import { mergeScientificEvidenceWorkflowStatus, useScientificEvidenceWorkflowStore } from "@/store/useScientificEvidenceWorkflowStore";
import { useVisualSourceCaptureStore } from "@/store/useVisualSourceCaptureStore";

const initialRegionState = useDocumentImageRegionStore.getState();
const initialVisualState = useVisualSourceCaptureStore.getState();
const TEST_IMAGE_DATA_URL = "data:image/png;base64,iVBORw0KGgo=";
const TEST_IMAGE_FILE = new File(["test-image"], "test-image.png", { type: "image/png" });

function loadLocalImage() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement | null;
  expect(input).toBeTruthy();
  fireEvent.change(input!, { target: { files: [TEST_IMAGE_FILE] } });
}

beforeEach(() => {
  useDocumentImageRegionStore.setState(initialRegionState, true);
  useVisualSourceCaptureStore.setState(initialVisualState, true);
  useScientificEvidenceWorkflowStore.getState().clear();
  window.localStorage.clear();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(() => TEST_IMAGE_DATA_URL),
  });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/agi/situation/visual-frame/latest")) {
      return new Response(JSON.stringify({
        ok: true,
        active_source: {
          source_id: "visual_source:active",
          environment_id: "environment:active",
          pipeline_id: "pipeline:active",
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("/api/agi/situation/visual-source/start")) {
      return new Response(JSON.stringify({
        ok: true,
        source: {
          source_id: "visual_source:image_lens_manual",
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("/api/agi/situation/visual-frame/analyze")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      return new Response(JSON.stringify({
        ok: true,
        evidence: {
          frame_id: "visual_frame:crop",
          evidence_id: "visual_evidence:crop",
          summary: "Analyzed crop frame summary.",
          visual_observer_profile_id: "visual_observer:active",
          visual_observer_profile_title: "Active shade",
          visual_prompt_hash: "prompt:active",
          source_id: body.source_id,
        },
        live_source_chunk: {
          chunk_id: "live_chunk:crop",
        },
        live_source_analysis_jobs: [
          { job_id: "analysis_job:crop" },
        ],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: false, error: "unexpected_url" }), { status: 404, headers: { "Content-Type": "application/json" } });
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  cleanup();
});

describe("ImageLensPanel", () => {
  it("starts as a top image workspace with a central add affordance", () => {
    render(<ImageLensPanel />);

    expect(screen.getByText("Image Lens")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose image file" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Image URL")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load url/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open live answer/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("LaTeX candidate")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("x")).not.toBeInTheDocument();
  });

  it("shows the Live Answer shortcut only after a crop frame is sent", async () => {
    const events: Array<CustomEvent> = [];
    const handler = (event: Event) => events.push(event as CustomEvent);
    window.addEventListener("open-helix-panel", handler);
    try {
      render(<ImageLensPanel />);
      expect(screen.queryByRole("button", { name: /open live answer/i })).not.toBeInTheDocument();

      loadLocalImage();
      const image = await screen.findByAltText("Image source");
      Object.defineProperty(image, "naturalWidth", { value: 200, configurable: true });
      Object.defineProperty(image, "naturalHeight", { value: 100, configurable: true });
      fireEvent.load(image);
      fireEvent.click(screen.getByRole("button", { name: /send crop frame/i }));

      await waitFor(() => expect(screen.getByRole("button", { name: /open live answer/i })).toBeInTheDocument());
      fireEvent.click(screen.getByRole("button", { name: /open live answer/i }));
      expect(events[0]?.detail).toEqual({ id: "live-answer-environment" });
    } finally {
      window.removeEventListener("open-helix-panel", handler);
    }
  });

  it("sends a crop frame to Live Answer visual source receipts", async () => {
    const liveEvents: Array<CustomEvent> = [];
    const imageLensEvents: Array<CustomEvent> = [];
    const handler = (event: Event) => liveEvents.push(event as CustomEvent);
    const imageLensHandler = (event: Event) => imageLensEvents.push(event as CustomEvent);
    window.addEventListener(HELIX_ASK_LIVE_EVENT_BUS_EVENT, handler);
    window.addEventListener("helix:image-lens:visual-frame-sent", imageLensHandler);
    try {
      render(<ImageLensPanel />);

      loadLocalImage();

      const image = await screen.findByAltText("Image source");
      Object.defineProperty(image, "naturalWidth", { value: 200, configurable: true });
      Object.defineProperty(image, "naturalHeight", { value: 100, configurable: true });
      Object.defineProperty(image, "getBoundingClientRect", {
        value: () => ({ left: 10, top: 20, width: 200, height: 100, right: 210, bottom: 120 }),
        configurable: true,
      });
      fireEvent.load(image);

      fireEvent.click(screen.getByRole("button", { name: /advanced/i }));
      fireEvent.change(await screen.findByLabelText("x"), { target: { value: "10" } });
      fireEvent.change(screen.getByLabelText("y"), { target: { value: "10" } });
      fireEvent.change(screen.getByLabelText("width"), { target: { value: "50" } });
      fireEvent.change(screen.getByLabelText("height"), { target: { value: "40" } });
      fireEvent.click(screen.getByRole("button", { name: /send crop frame/i }));

      await waitFor(() => expect(screen.getByText(/Crop frame sent to Live Answer visual source/i)).toBeInTheDocument());
      expect(screen.getByText(/Claim boundary: visual crop observation only; not answer authority\./i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /confirm candidate/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /reject/i })).not.toBeInTheDocument();
      expect(screen.getByText(/Analyzed crop frame summary/i)).toBeInTheDocument();
      expect(useDocumentImageRegionStore.getState().receipts).toHaveLength(1);
      const receipt = useDocumentImageRegionStore.getState().receipts[0];
      expect(receipt?.crop.bboxPx).toEqual({ x: 10, y: 10, width: 50, height: 40 });
      expect(receipt?.extraction.latexCandidate).toBeUndefined();
      const producer = useVisualSourceCaptureStore.getState().producers["visual_source:active"];
      expect(producer).toBeTruthy();
      expect(producer?.frame_history).toHaveLength(1);
      expect(producer?.frame_history?.[0]?.summary).toBe("Analyzed crop frame summary.");
      expect(producer?.frame_history?.[0]?.evidence_id).toBe("visual_evidence:crop");
      expect(producer?.frame_history?.[0]?.source_kind).toBe("image_lens_crop");
      expect(producer?.frame_history?.[0]?.crop_only).toBe(true);
      expect(producer?.frame_history?.[0]?.crop_bbox_px).toEqual({ x: 10, y: 10, width: 50, height: 40 });
      const analyzeCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes("/api/agi/situation/visual-frame/analyze"));
      const analyzeBody = JSON.parse(String(analyzeCall?.[1]?.body ?? "{}"));
      expect(analyzeBody.image_data_url).toBe("data:image/png;base64,iVBORw0KGgo=");
      expect(analyzeBody.prompt).toMatch(/only the pixels visible inside this Image Lens crop/i);
      expect(analyzeBody.crop_only).toBe(true);
      expect(analyzeBody.crop_bbox_px).toEqual({ x: 10, y: 10, width: 50, height: 40 });
      expect(liveEvents[0]?.detail.entry.tool).toBe("image-lens.visual_frame");
      expect(liveEvents[0]?.detail.entry.meta.terminal_eligible).toBe(false);
      expect(imageLensEvents[0]?.detail).toEqual({
        sourceId: "visual_source:active",
        frameId: "visual_frame:crop",
        evidenceId: "visual_evidence:crop",
      });
    } finally {
      window.removeEventListener(HELIX_ASK_LIVE_EVENT_BUS_EVENT, handler);
      window.removeEventListener("helix:image-lens:visual-frame-sent", imageLensHandler);
    }
  });

  it("keeps backend coordinate controls in the advanced drawer", async () => {
    render(<ImageLensPanel />);

    fireEvent.click(screen.getByRole("button", { name: /advanced/i }));

    expect(await screen.findByTestId("image-lens-advanced")).toBeInTheDocument();
    expect(screen.getByLabelText("x")).toBeInTheDocument();
    expect(screen.getByLabelText("Source kind")).toBeInTheDocument();
    expect(screen.queryByLabelText("LaTeX candidate")).not.toBeInTheDocument();
  });

  it("reflects a mounted PDF page source from Ask/Image Lens evidence", async () => {
    useDocumentImageRegionStore.getState().setSourceImage({
      sourceImageUrl: "data:image/png;base64,pdf-page-source",
      sourceAttachmentId: "pdf-page-render:panel",
      sourceKind: "pdf_page_render",
      pageNumber: 3,
      pageCount: 11,
      pageImageRef: "data:image/png;base64,pdf-page-source",
      sourceId: "pdf-page-render:source",
      evidenceId: "ask:test:image-lens-region",
      regionId: "image_lens_region:panel",
      scientificEvidenceSidecarId: "scientific_image_sidecar:panel",
      scholarlySourcePdfRef: "artifact://scholarly-pdf/panel",
      sourceRefHash: "sha256:panel-page",
      mountedAt: "2026-07-07T14:00:00.000Z",
    });

    render(<ImageLensPanel />);

    expect(await screen.findByTestId("image-lens-mounted-pdf-source")).toHaveTextContent("PDF page 3 / 11");
    const workflowStatus = await screen.findByTestId("image-lens-scientific-workflow-status");
    expect(workflowStatus).toHaveTextContent("pdf-page-render:source");
    expect(workflowStatus).toHaveTextContent("sha256:panel-page");
    expect(workflowStatus).toHaveTextContent("scientific_image_sidecar:panel");
    expect(workflowStatus).toHaveTextContent("Postulate refs:");
    fireEvent.click(screen.getByRole("button", { name: /advanced/i }));
    expect(await screen.findByLabelText("Page")).toHaveValue("3");
    expect(screen.getByLabelText("Source kind")).toHaveValue("pdf_page_render");
  });

  it("loads a typed PDF page when Enter is pressed in the advanced page field", async () => {
    useDocumentImageRegionStore.getState().setSourceImage({
      sourceImageUrl: "data:image/png;base64,pdf-page-three",
      sourceAttachmentId: "pdf-page-render:panel:3",
      sourceKind: "pdf_page_render",
      pageNumber: 3,
      pageCount: 11,
      pageImageRef: "data:image/png;base64,pdf-page-three",
      sourceId: "pdf-page-render:source:3",
      scholarlySourcePdfRef: "artifact://scholarly-pdf/panel.pdf",
      scholarlyPdfCachePath: "C:/workspace/artifacts/helix/scholarly-pdfs/panel.pdf",
    });
    const oneShot = vi.spyOn(agiApi, "runCapabilityLaneOneShot").mockImplementation(async (payload) => {
      useDocumentImageRegionStore.getState().setSourceImage({
        sourceImageUrl: "data:image/png;base64,pdf-page-seven",
        sourceAttachmentId: "pdf-page-render:panel:7",
        sourceKind: "pdf_page_render",
        pageNumber: 7,
        pageCount: 11,
        pageImageRef: "data:image/png;base64,pdf-page-seven",
        sourceId: "pdf-page-render:source:7",
        scholarlySourcePdfRef: "artifact://scholarly-pdf/panel.pdf",
        scholarlyPdfCachePath: "C:/workspace/artifacts/helix/scholarly-pdfs/panel.pdf",
      });
      return { ok: true };
    });

    render(<ImageLensPanel />);
    fireEvent.click(screen.getByRole("button", { name: /advanced/i }));
    const pageInput = await screen.findByTestId("image-lens-page-input");
    fireEvent.change(pageInput, { target: { value: "7" } });
    fireEvent.keyDown(pageInput, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(oneShot).toHaveBeenCalledTimes(1));
    expect(oneShot).toHaveBeenCalledWith(expect.objectContaining({
      capability_lane_call: expect.objectContaining({
        capability: "visual_analysis.inspect_image_region",
        page_number: 7,
        scholarly_source_pdf_ref: "artifact://scholarly-pdf/panel.pdf",
        scholarly_pdf_cache_path: "C:/workspace/artifacts/helix/scholarly-pdfs/panel.pdf",
        source_mount_only: true,
      }),
    }));
    expect(await screen.findByTestId("image-lens-mounted-pdf-source")).toHaveTextContent("PDF page 7 / 11");
    expect(screen.getByText("PDF page 7 loaded.")).toBeInTheDocument();
  });

  it("hydrates the status strip from compact scientific workflow memory", async () => {
    useDocumentImageRegionStore.getState().setSourceImage({
      sourceImageUrl: "data:image/png;base64,pdf-page-source",
      sourceAttachmentId: "pdf-page-render:panel",
      sourceKind: "pdf_page_render",
      pageNumber: 5,
      pageCount: 11,
      pageImageRef: "data:image/png;base64,pdf-page-source",
      sourceId: "pdf-page-render:source",
      evidenceId: "ask:test:image-lens-region",
      regionId: "image_lens_region:panel",
      scientificEvidenceSidecarId: "scientific_image_sidecar:panel",
      scholarlySourcePdfRef: "artifact://scholarly-pdf/panel",
      sourceRefHash: "sha256:panel-page",
      mountedAt: "2026-07-07T14:00:00.000Z",
    });
    mergeScientificEvidenceWorkflowStatus({
      schema: "helix.scientific_evidence_workflow_status.v1",
      pageLoaded: true,
      sourceId: "pdf-page-render:source",
      sourceKind: "pdf_page_render",
      sourceImageHash: "sha256:panel-page",
      pageNumber: 5,
      pageCount: 11,
      cropRef: "sha256:panel-page#crop=73,570,1077,87",
      cropRegionRef: "equation_crop:image_lens_region:panel",
      sidecarId: "scientific_image_sidecar:panel",
      evidenceDepth: "exact_row_promoted",
      promotedRowState: "promoted",
      promotedEquationLatex: "S = \\int d^4x \\sqrt{-g} e^{-\\phi} \\{R + L_m\\}, (7)",
      graphReflectionStatus: "diagnostic_reflected",
      calculatorTemplateStatus: "template_admissible",
      postulateReadyRefs: {
        evidenceSidecarRefs: ["scientific_image_sidecar:panel"],
        promotedEquationRowRefs: ["promoted_equation_row:image_lens_region:panel"],
        pageRenderRefs: ["pdf-page-render:source"],
        cropRefs: ["sha256:panel-page#crop=73,570,1077,87"],
        graphReflectionRefs: ["graph_reflection:diagnostic:panel"],
        provenanceAuditRefs: ["provenance_audit:sha256:panel-page"],
        calculatorCheckRefs: ["calculator_check:template_admissibility:panel"],
        uncertaintyReductionRefs: [],
      },
      activeBlockers: [],
      historicalBlockers: ["no_ocr_or_latex_candidate"],
      claimBoundary: "observation_only_not_proof",
    });

    render(<ImageLensPanel />);

    const workflowStatus = await screen.findByTestId("image-lens-scientific-workflow-status");
    expect(workflowStatus).toHaveTextContent("Row: promoted");
    expect(workflowStatus).toHaveTextContent("Graph: diagnostic_reflected");
    expect(workflowStatus).toHaveTextContent("Calculator: template_admissible");
    expect(workflowStatus).toHaveTextContent(/Postulate refs: [1-9]/);
  });

  it("recovers a retained PDF page source when the panel opens blank", async () => {
    window.localStorage.setItem("helix:image-lens:last-document-source:v1", JSON.stringify({
      sourceImageUrl: "data:image/png;base64,recovered-pdf-page-source",
      sourceAttachmentId: "pdf-page-render:recovered-panel",
      sourceKind: "pdf_page_render",
      pageNumber: 5,
      pageCount: 9,
      pageImageRef: "data:image/png;base64,recovered-pdf-page-source",
      sourceId: "pdf-page-render:recovered-source",
      evidenceId: "ask:test:recovered-image-lens-region",
      regionId: "image_lens_region:recovered-panel",
      scientificEvidenceSidecarId: "scientific_image_sidecar:recovered-panel",
      scholarlySourcePdfRef: "artifact://scholarly-pdf/recovered-panel",
      sourceRefHash: "sha256:recovered-panel-page",
      mountedAt: "2026-07-07T15:00:00.000Z",
    }));

    render(<ImageLensPanel />);

    expect(await screen.findByText("Recovered page evidence from last Ask turn.")).toBeInTheDocument();
    expect(await screen.findByTestId("image-lens-mounted-pdf-source")).toHaveTextContent("PDF page 5 / 9");
    expect(await screen.findByAltText("Image source")).toHaveAttribute(
      "src",
      "data:image/png;base64,recovered-pdf-page-source",
    );
    expect(useDocumentImageRegionStore.getState().source).toMatchObject({
      sourceImageUrl: "data:image/png;base64,recovered-pdf-page-source",
      sourceKind: "pdf_page_render",
      pageNumber: 5,
      scientificEvidenceSidecarId: "scientific_image_sidecar:recovered-panel",
    });
  });

  it("keeps UI copy inside the candidate and claim-boundary lane", () => {
    render(<ImageLensPanel />);

    const text = document.body.textContent ?? "";
    expect(text).toMatch(/observation only \/ not answer authority/i);
    expect(text).not.toMatch(/\bvalidated\b/i);
    expect(text).not.toMatch(/\bviable\b/i);
    expect(text).not.toMatch(/\bcertified\b/i);
    expect(text).not.toMatch(/\bproves\b/i);
  });
});
