import {
  DOCUMENT_IMAGE_REGION_RECEIPT_VERSION,
  type DocumentImageBboxPxV1,
  type DocumentImageExtractionStatusV1,
  type DocumentImageRegionKindV1,
  type DocumentImageRegionReceiptV1,
  type DocumentImageSourceKindV1,
} from "@shared/contracts/document-image-region-receipt.v1";

export const DEFAULT_DOCUMENT_IMAGE_OBSERVER_PROFILE_ID =
  "stage_play_visual_observer_profile:document-image:v1";

export const DEFAULT_DOCUMENT_IMAGE_SHADE_PROMPT_ID = "document_region_extraction";

export type DocumentImageNaturalSize = {
  width: number;
  height: number;
};

export type BuildDocumentImageRegionReceiptInput = {
  generatedAt?: string;
  sourceAttachmentId: string;
  sourceKind: DocumentImageSourceKindV1;
  sourceImageRef: string;
  pageNumber?: number | null;
  pageImageRef?: string;
  bboxPx: DocumentImageBboxPxV1;
  imageRef: string;
  kind: DocumentImageRegionKindV1;
  confidence: number;
  summary: string;
  textCandidate?: string;
  latexCandidate?: string;
  tableCandidateRef?: string;
  status?: DocumentImageExtractionStatusV1;
  observerProfileId?: string;
  shadePromptId?: string;
  nearbyText?: string;
};

const NON_WORD = /[^a-zA-Z0-9:_-]+/g;

export function clampDocumentImageBbox(
  bbox: DocumentImageBboxPxV1,
  naturalSize: DocumentImageNaturalSize,
): DocumentImageBboxPxV1 {
  const imageWidth = Math.max(1, Math.floor(naturalSize.width));
  const imageHeight = Math.max(1, Math.floor(naturalSize.height));
  const x = clampNumber(Math.floor(bbox.x), 0, imageWidth - 1);
  const y = clampNumber(Math.floor(bbox.y), 0, imageHeight - 1);
  const maxWidth = Math.max(1, imageWidth - x);
  const maxHeight = Math.max(1, imageHeight - y);
  return {
    x,
    y,
    width: clampNumber(Math.floor(bbox.width), 1, maxWidth),
    height: clampNumber(Math.floor(bbox.height), 1, maxHeight),
  };
}

export function makeDocumentImageStableId(parts: Array<string | number | null | undefined>): string {
  return parts
    .map((part: string | number | null | undefined) => String(part ?? "none").trim().replace(NON_WORD, "-").replace(/-+/g, "-"))
    .filter(Boolean)
    .join(":")
    .slice(0, 160);
}

export function hashDocumentImageString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function buildDocumentImageRegionReceipt(
  input: BuildDocumentImageRegionReceiptInput,
): DocumentImageRegionReceiptV1 {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const pagePart = input.pageNumber ?? "page-none";
  const bboxPart = `${input.bboxPx.x},${input.bboxPx.y},${input.bboxPx.width},${input.bboxPx.height}`;
  const seed = `${input.sourceAttachmentId}|${input.sourceImageRef}|${pagePart}|${bboxPart}|${input.kind}|${generatedAt}`;
  const regionId = `doc-image-region:${hashDocumentImageString(seed).replace("fnv1a32:", "")}`;
  const sourceId = makeDocumentImageStableId(["visual_source", "document_image", input.sourceAttachmentId]);
  const frameId = makeDocumentImageStableId(["visual_frame", regionId]);
  const imageHash = hashDocumentImageString(`${input.imageRef}|${bboxPart}`);
  const textHash = input.textCandidate ? hashDocumentImageString(input.textCandidate) : undefined;
  const nearbyTextHash = input.nearbyText ? hashDocumentImageString(input.nearbyText) : undefined;

  return {
    contractVersion: DOCUMENT_IMAGE_REGION_RECEIPT_VERSION,
    generatedAt,
    sourceAttachmentId: input.sourceAttachmentId,
    sourceKind: input.sourceKind,
    ...(input.pageNumber && input.pageImageRef
      ? {
          pageRef: {
            pageNumber: input.pageNumber,
            pageImageRef: input.pageImageRef,
          },
        }
      : {}),
    crop: {
      regionId,
      bboxPx: input.bboxPx,
      imageRef: input.imageRef,
      imageHash,
    },
    visualSource: {
      sourceId,
      frameId,
      observerProfileId: input.observerProfileId ?? DEFAULT_DOCUMENT_IMAGE_OBSERVER_PROFILE_ID,
      ...(input.shadePromptId ? { shadePromptId: input.shadePromptId } : {}),
    },
    classification: {
      kind: input.kind,
      confidence: clampNumber(input.confidence, 0, 1),
      summary: input.summary.trim() || "Document image region candidate.",
    },
    extraction: {
      ...(input.textCandidate ? { textCandidate: input.textCandidate } : {}),
      ...(input.latexCandidate ? { latexCandidate: input.latexCandidate } : {}),
      ...(input.tableCandidateRef ? { tableCandidateRef: input.tableCandidateRef } : {}),
      status: input.status ?? "candidate",
    },
    locatorAnchor: {
      pageNumber: input.pageNumber ?? null,
      bboxPx: input.bboxPx,
      ...(nearbyTextHash ? { nearbyTextHash } : {}),
      ...(textHash ? { ocrHash: textHash } : {}),
      anchorConfidence: clampNumber(input.confidence, 0, 1),
    },
    claimBoundary: {
      ocrCandidateOnly: true,
      notProofAuthority: true,
    },
  };
}

export async function cropImageToDataUrl(
  image: HTMLImageElement,
  bboxPx: DocumentImageBboxPxV1,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(bboxPx.width));
  canvas.height = Math.max(1, Math.floor(bboxPx.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.drawImage(
    image,
    bboxPx.x,
    bboxPx.y,
    bboxPx.width,
    bboxPx.height,
    0,
    0,
    bboxPx.width,
    bboxPx.height,
  );
  return canvas.toDataURL("image/png");
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
