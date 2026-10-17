import { describe, expect, it } from "vitest";
import { validateDocumentImageRegionReceiptV1 } from "@shared/contracts/document-image-region-receipt.v1";
import {
  buildDocumentImageRegionReceipt,
  clampDocumentImageBbox,
  hashDocumentImageString,
} from "../documentImageRegions";

describe("document image region helpers", () => {
  it("clamps crop boxes to natural image bounds", () => {
    expect(clampDocumentImageBbox(
      { x: 90, y: 40, width: 30, height: 20 },
      { width: 100, height: 50 },
    )).toEqual({ x: 90, y: 40, width: 10, height: 10 });
  });

  it("builds a valid candidate receipt with hashed locator anchors", () => {
    const receipt = buildDocumentImageRegionReceipt({
      generatedAt: "2026-06-11T12:00:00.000Z",
      sourceAttachmentId: "image-attachment:test",
      sourceKind: "image_attachment",
      sourceImageRef: "data:image/png;base64,source",
      bboxPx: { x: 1, y: 2, width: 30, height: 40 },
      imageRef: "data:image/png;base64,crop",
      kind: "equation",
      confidence: 0.8,
      summary: "Equation candidate.",
      textCandidate: "T00 = rho",
      latexCandidate: "T_{00}=\\rho",
    });

    expect(validateDocumentImageRegionReceiptV1(receipt)).toEqual([]);
    expect(receipt.contractVersion).toBe("document_image_region_receipt/v1");
    expect(receipt.claimBoundary).toEqual({
      ocrCandidateOnly: true,
      notProofAuthority: true,
    });
    expect(receipt.extraction.status).toBe("candidate");
    expect(receipt.locatorAnchor.ocrHash).toBe(hashDocumentImageString("T00 = rho"));
  });

  it("does not create a page reference unless a rendered page is supplied", () => {
    const receipt = buildDocumentImageRegionReceipt({
      generatedAt: "2026-06-11T12:00:00.000Z",
      sourceAttachmentId: "manual:test",
      sourceKind: "manual_image_url",
      sourceImageRef: "https://example.test/image.png",
      bboxPx: { x: 0, y: 0, width: 10, height: 10 },
      imageRef: "https://example.test/image.png#crop=0,0,10,10",
      kind: "unknown",
      confidence: 0.3,
      summary: "Unknown region candidate.",
    });

    expect(receipt.pageRef).toBeUndefined();
    expect(receipt.locatorAnchor.pageNumber).toBeNull();
  });
});
