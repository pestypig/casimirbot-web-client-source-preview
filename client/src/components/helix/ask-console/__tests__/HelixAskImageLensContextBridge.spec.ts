// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { useDocumentImageRegionStore } from "@/store/useDocumentImageRegionStore";
import { readHelixAskActiveImageLensSourceContext } from "../HelixAskImageLensContextBridge";

const initialState = useDocumentImageRegionStore.getState();

afterEach(() => {
  window.localStorage.clear();
  useDocumentImageRegionStore.setState(initialState, true);
});

describe("HelixAskImageLensContextBridge", () => {
  it("exposes restored PDF source, crop, and sidecar refs without claiming promotion authority", () => {
    useDocumentImageRegionStore.getState().setSourceImage({
      sourceImageUrl: "data:image/png;base64,page",
      sourceAttachmentId: "pdf-page-render:test-source",
      sourceKind: "pdf_page_render",
      sourceId: "pdf-page-render:test-source",
      pageImageRef: "data:image/png;base64,page",
      pageNumber: 5,
      pageCount: 7,
      sourceRefHash: "sha256:abcdef1234567890",
      scientificEvidenceSidecarId: "ask:test:scientific_image_evidence_sidecar",
      regionId: "image_lens_region:promoted-row-a",
      naturalSize: { width: 1224, height: 1584 },
      sourceDimensionsPx: { width: 1224, height: 1584 },
      cropDraft: { x: 73, y: 570, width: 1077, height: 87 },
      viewMode: "manual_crop",
      coordinateSpace: "natural_image_px",
    });

    const context = readHelixAskActiveImageLensSourceContext();

    expect(context).toMatchObject({
      source_id: "pdf-page-render:test-source",
      source_kind: "pdf_page_render",
      source_ref_hash: "sha256:abcdef1234567890",
      page_number: 5,
      current_crop_bbox_px: { x: 73, y: 570, width: 1077, height: 87 },
      crop_ref: "sha256:abcdef1234567890#crop=73,570,1077,87",
      equation_crop_ref: "equation_crop:sha256:abcdef1234567890#crop=73,570,1077,87",
      page_render_ref: "page_render:sha256:abcdef1234567890:page:5",
      promoted_equation_row_ref: "promoted_equation_row:image_lens_region:promoted-row-a",
      scientific_evidence_sidecar_id: "ask:test:scientific_image_evidence_sidecar",
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
    });
  });

  it("does not synthesize promoted row refs from crop state alone", () => {
    useDocumentImageRegionStore.getState().setSourceImage({
      sourceImageUrl: "data:image/png;base64,page",
      sourceAttachmentId: "pdf-page-render:test-source",
      sourceKind: "pdf_page_render",
      sourceId: "pdf-page-render:test-source",
      pageImageRef: "data:image/png;base64,page",
      pageNumber: 5,
      sourceRefHash: "sha256:abcdef1234567890",
      naturalSize: { width: 1224, height: 1584 },
      cropDraft: { x: 73, y: 570, width: 1077, height: 87 },
      viewMode: "manual_crop",
      coordinateSpace: "natural_image_px",
    });

    const context = readHelixAskActiveImageLensSourceContext();

    expect(context?.crop_ref).toBe("sha256:abcdef1234567890#crop=73,570,1077,87");
    expect(context?.promoted_equation_row_ref).toBeNull();
  });
});
