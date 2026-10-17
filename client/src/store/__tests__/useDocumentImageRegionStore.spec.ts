// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { buildDocumentImageRegionReceipt } from "@/lib/document-image/documentImageRegions";
import { useDocumentImageRegionStore } from "../useDocumentImageRegionStore";

const initialState = useDocumentImageRegionStore.getState();

afterEach(() => {
  window.localStorage.clear();
  useDocumentImageRegionStore.setState(initialState, true);
});

function makeReceipt() {
  return buildDocumentImageRegionReceipt({
    generatedAt: "2026-06-11T12:00:00.000Z",
    sourceAttachmentId: "image-attachment:test",
    sourceKind: "image_attachment",
    sourceImageRef: "data:image/png;base64,source",
    bboxPx: { x: 1, y: 2, width: 30, height: 40 },
    imageRef: "data:image/png;base64,crop",
    kind: "equation",
    confidence: 0.8,
    summary: "Equation candidate.",
  });
}

describe("document image region store", () => {
  it("records source image state and recent receipts", () => {
    useDocumentImageRegionStore.getState().setSourceImage({
      sourceImageUrl: "data:image/png;base64,source",
      sourceAttachmentId: "image-attachment:test",
      sourceKind: "image_attachment",
      pageNumber: null,
    });
    const receipt = makeReceipt();

    useDocumentImageRegionStore.getState().addReceipt(receipt);

    expect(useDocumentImageRegionStore.getState().source?.sourceAttachmentId).toBe("image-attachment:test");
    expect(useDocumentImageRegionStore.getState().lastReceipt).toBe(receipt);
    expect(useDocumentImageRegionStore.getState().receipts).toEqual([receipt]);
  });

  it("updates candidate review status without changing claim boundary", () => {
    const receipt = makeReceipt();
    useDocumentImageRegionStore.getState().addReceipt(receipt);
    useDocumentImageRegionStore.getState().updateReceiptStatus(receipt.crop.regionId, "confirmed");

    const updated = useDocumentImageRegionStore.getState().receipts[0];
    expect(updated?.extraction.status).toBe("confirmed");
    expect(updated?.claimBoundary.notProofAuthority).toBe(true);
  });

  it("persists PDF page source dimensions for restart recovery", () => {
    useDocumentImageRegionStore.getState().setSourceImage({
      sourceImageUrl: "data:image/png;base64,page",
      sourceAttachmentId: "pdf-page-render:test",
      sourceKind: "pdf_page_render",
      sourceId: "pdf-page-render:test",
      pageImageRef: "data:image/png;base64,page",
      pageNumber: 5,
      pageCount: 12,
      scholarlyPdfCachePath: "C:/workspace/artifacts/helix/scholarly-pdfs/test.pdf",
    });

    useDocumentImageRegionStore.getState().setNaturalSize({ width: 1224, height: 1584 });
    useDocumentImageRegionStore.getState().setCropDraft({ x: 73, y: 570, width: 1077, height: 87 });
    useDocumentImageRegionStore.setState(initialState, true);

    expect(useDocumentImageRegionStore.getState().rehydratePersistedSourceImage()).toBe(true);
    expect(useDocumentImageRegionStore.getState().source).toMatchObject({
      sourceId: "pdf-page-render:test",
      sourceKind: "pdf_page_render",
      sourceDimensionsPx: { width: 1224, height: 1584 },
      cropDraft: { x: 73, y: 570, width: 1077, height: 87 },
      viewMode: "manual_crop",
      coordinateSpace: "natural_image_px",
      scholarlyPdfCachePath: "C:/workspace/artifacts/helix/scholarly-pdfs/test.pdf",
    });
    expect(useDocumentImageRegionStore.getState().naturalSize).toEqual({ width: 1224, height: 1584 });
    expect(useDocumentImageRegionStore.getState().cropDraft).toEqual({ x: 73, y: 570, width: 1077, height: 87 });
  });

  it("keeps oversized rendered pages in memory without filling localStorage", () => {
    window.localStorage.setItem(
      "helix:image-lens:last-document-source:v1",
      JSON.stringify({ sourceImageUrl: "data:image/png;base64,stale" }),
    );
    const sourceImageUrl = `data:image/png;base64,${"a".repeat(300_000)}`;

    useDocumentImageRegionStore.getState().setSourceImage({
      sourceImageUrl,
      sourceAttachmentId: "pdf-page-render:large",
      sourceKind: "pdf_page_render",
      sourceId: "pdf-page-render:large",
      pageNumber: 8,
    });

    expect(useDocumentImageRegionStore.getState().source?.sourceImageUrl).toBe(sourceImageUrl);
    expect(window.localStorage.getItem("helix:image-lens:last-document-source:v1")).toBeNull();
  });
});
