// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runImageLensFocusRun } from "@/lib/helix/imageLensFocusRun";
import { useDocumentImageRegionStore } from "@/store/useDocumentImageRegionStore";
import { useVisualSourceCaptureStore } from "@/store/useVisualSourceCaptureStore";

const initialDocumentState = useDocumentImageRegionStore.getState();
const initialVisualState = useVisualSourceCaptureStore.getState();

class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  crossOrigin = "";
  naturalWidth = 400;
  naturalHeight = 200;
  width = 400;
  height = 200;
  private value = "";

  set src(value: string) {
    this.value = value;
    setTimeout(() => this.onload?.(), 0);
  }

  get src(): string {
    return this.value;
  }
}

beforeEach(() => {
  useDocumentImageRegionStore.setState(initialDocumentState, true);
  useVisualSourceCaptureStore.setState(initialVisualState, true);
  vi.stubGlobal("Image", MockImage);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,crop");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  useDocumentImageRegionStore.setState(initialDocumentState, true);
  useVisualSourceCaptureStore.setState(initialVisualState, true);
});

describe("runImageLensFocusRun", () => {
  it("submits broad and focused crops into the Live Answer visual source carousel", async () => {
    useDocumentImageRegionStore.getState().setSourceImage({
      sourceImageUrl: "data:image/png;base64,source",
      sourceAttachmentId: "image-attachment:test",
      sourceKind: "image_attachment",
      pageNumber: null,
    });
    useDocumentImageRegionStore.getState().setNaturalSize({ width: 400, height: 200 });
    const postJson = vi.fn(async () => ({
      ok: true,
      evidence: {
        frame_id: "visual_frame:focus",
        evidence_id: "visual_evidence:focus",
        summary: "Focused crop summary.",
      },
      live_source_chunk: {
        chunk_id: "live_chunk:focus",
      },
      live_source_analysis_jobs: [
        { job_id: "analysis_job:focus" },
      ],
    }));

    const result = await runImageLensFocusRun({
      postJson,
      request: {
        sourceId: "visual_source:focus",
        mode: "broad_then_regions",
        maxRegions: 2,
        regions: [
          {
            regionId: "equation-region",
            bboxPct: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
            reason: "Equation block",
            priority: 10,
          },
        ],
      },
    });

    expect(result.blockers).toEqual([]);
    expect(result.submittedRegions).toHaveLength(2);
    expect(result.submittedRegions[0]).toMatchObject({
      regionId: "focus-region:broad-frame",
      bboxPx: { x: 0, y: 0, width: 400, height: 200 },
      evidenceId: "visual_evidence:focus",
      frameId: "visual_frame:focus",
    });
    expect(result.submittedRegions[1]).toMatchObject({
      regionId: "equation-region",
      bboxPx: { x: 100, y: 50, width: 200, height: 100 },
    });
    expect(postJson).toHaveBeenCalledTimes(2);
    const producer = useVisualSourceCaptureStore.getState().producers["visual_source:focus"];
    expect(producer?.frame_history).toHaveLength(2);
    expect(producer?.frame_history?.[0]?.summary).toBe("Focused crop summary.");
    expect(useDocumentImageRegionStore.getState().receipts).toHaveLength(2);
    expect(useDocumentImageRegionStore.getState().cropDraft).toEqual({ x: 100, y: 50, width: 200, height: 100 });
  });

  it("returns a blocked observation artifact when no source is loaded", async () => {
    const result = await runImageLensFocusRun({
      request: {
        sourceId: "visual_source:missing",
        regions: [
          {
            regionId: "region",
            bboxPct: { x: 0, y: 0, width: 1, height: 1 },
            reason: "test",
            priority: 1,
          },
        ],
      },
    });

    expect(result.submittedRegions).toEqual([]);
    expect(result.blockers).toContain("image_lens_focus_run_source_not_available");
    expect(result.claimBoundary).toEqual({
      observationOnly: true,
      notAnswerAuthority: true,
    });
  });
});
