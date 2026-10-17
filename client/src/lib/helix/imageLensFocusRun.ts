import type { DocumentImageBboxPxV1, DocumentImageSourceKindV1 } from "@shared/contracts/document-image-region-receipt.v1";
import {
  buildImageLensFocusRunResultV1,
  normalizeImageLensFocusRunRequestV1,
  type ImageLensFocusBboxPctV1,
  type ImageLensFocusRegionV1,
  type ImageLensFocusRunRequestV1,
  type ImageLensFocusRunResultV1,
  type ImageLensFocusRunSubmittedRegionV1,
} from "@shared/contracts/image-lens-focus-run.v1";
import {
  buildDocumentImageRegionReceipt,
  clampDocumentImageBbox,
  cropImageToDataUrl,
} from "@/lib/document-image/documentImageRegions";
import { captureFrameDataUrlFromStream } from "@/lib/helix/visualFrameProducer";
import { submitImageLensCropFrame } from "@/lib/helix/imageLensVisualFrame";
import { HELIX_ASK_CONTEXT_ID } from "@/lib/helix/voice-surface-contract";
import { useDocumentImageRegionStore } from "@/store/useDocumentImageRegionStore";
import { useImageLensLiveSourceStore } from "@/store/useImageLensLiveSourceStore";

type PostJson = (path: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>;

export type RunImageLensFocusRunInput = {
  request: Partial<ImageLensFocusRunRequestV1> & Record<string, unknown>;
  postJson?: PostJson;
};

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function defaultPostJson(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const payload = readRecord(await response.json().catch(() => null)) ?? {};
  if (!response.ok) {
    const message = readString(payload.error) ?? readString(payload.message) ?? `request_failed:${response.status}`;
    throw new Error(message);
  }
  return payload;
}

function pctToPx(bboxPct: ImageLensFocusBboxPctV1, naturalSize: { width: number; height: number }): DocumentImageBboxPxV1 {
  return clampDocumentImageBbox(
    {
      x: Math.floor(bboxPct.x * naturalSize.width),
      y: Math.floor(bboxPct.y * naturalSize.height),
      width: Math.max(1, Math.floor(bboxPct.width * naturalSize.width)),
      height: Math.max(1, Math.floor(bboxPct.height * naturalSize.height)),
    },
    naturalSize,
  );
}

function dataUrlOrUrlToImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image_lens_focus_source_load_failed"));
    image.src = src;
  });
}

function buildRegions(request: ImageLensFocusRunRequestV1): ImageLensFocusRegionV1[] {
  const ordered = [...request.regions].sort((left, right) => right.priority - left.priority);
  if (request.mode !== "broad_then_regions") return ordered.slice(0, request.maxRegions);
  return [
    {
      regionId: "focus-region:broad-frame",
      bboxPct: { x: 0, y: 0, width: 1, height: 1 },
      reason: "Broad full-frame context pass before focused crops.",
      priority: Number.MAX_SAFE_INTEGER,
    },
    ...ordered,
  ].slice(0, request.maxRegions);
}

export async function runImageLensFocusRun(input: RunImageLensFocusRunInput): Promise<ImageLensFocusRunResultV1> {
  const request = normalizeImageLensFocusRunRequestV1(input.request);
  const blockers: string[] = [];
  if (!request.sourceId) blockers.push("image_lens_focus_run_missing_source_id");
  if (request.regions.length === 0) blockers.push("image_lens_focus_run_missing_regions");
  if (blockers.length > 0) {
    return buildImageLensFocusRunResultV1({ sourceId: request.sourceId, blockers });
  }

  const documentState = useDocumentImageRegionStore.getState();
  const liveSource = useImageLensLiveSourceStore.getState().liveSource;
  const useLiveSource = Boolean(liveSource?.streamActive && liveSource.stream && liveSource.sourceId === request.sourceId);
  const postJson = input.postJson ?? defaultPostJson;

  let sourceImageRef = documentState.source?.sourceImageUrl ?? "";
  let sourceAttachmentId = documentState.source?.sourceAttachmentId ?? request.sourceId;
  let sourceKind: DocumentImageSourceKindV1 = documentState.source?.sourceKind ?? "manual_image_url";
  let pageNumber = documentState.source?.pageNumber ?? null;
  let naturalSize = documentState.naturalSize;
  let image: HTMLImageElement | null = null;
  let threadId = HELIX_ASK_CONTEXT_ID.desktop;
  let roomId: string | null = null;
  let environmentId: string | null = null;
  let pipelineId: string | null = null;

  try {
    if (useLiveSource && liveSource?.stream) {
      const snapshot = await captureFrameDataUrlFromStream(liveSource.stream);
      image = await dataUrlOrUrlToImage(snapshot);
      sourceImageRef = snapshot;
      sourceAttachmentId = `live-source:${liveSource.sourceId}`;
      sourceKind = "manual_image_url";
      pageNumber = null;
      naturalSize = { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
      threadId = liveSource.threadId ?? threadId;
      roomId = liveSource.roomId ?? null;
      environmentId = liveSource.environmentId ?? null;
      pipelineId = liveSource.pipelineId ?? null;
      useImageLensLiveSourceStore.getState().patchLiveSource({
        latestFrameDataUrl: snapshot,
        lastFrameAt: new Date().toISOString(),
      });
    } else if (documentState.source?.sourceImageUrl) {
      image = await dataUrlOrUrlToImage(documentState.source.sourceImageUrl);
      naturalSize = naturalSize ?? { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
    } else {
      blockers.push("image_lens_focus_run_source_not_available");
    }
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : "image_lens_focus_source_load_failed");
  }

  if (!image || !naturalSize || naturalSize.width <= 0 || naturalSize.height <= 0 || blockers.length > 0) {
    return buildImageLensFocusRunResultV1({ sourceId: request.sourceId, blockers });
  }

  const submittedRegions: ImageLensFocusRunSubmittedRegionV1[] = [];
  for (const region of buildRegions(request)) {
    const bboxPx = pctToPx(region.bboxPct, naturalSize);
    useDocumentImageRegionStore.getState().setCropDraft(bboxPx);

    try {
      const cropDataUrl = await cropImageToDataUrl(image, bboxPx);
      const summary = `Image Lens focus crop ${region.regionId} (${bboxPx.width}x${bboxPx.height}px). Reason: ${region.reason}`;
      const receipt = buildDocumentImageRegionReceipt({
        sourceAttachmentId,
        sourceKind,
        sourceImageRef,
        pageNumber,
        pageImageRef: sourceKind === "pdf_page_render" ? sourceImageRef : undefined,
        bboxPx,
        imageRef: cropDataUrl,
        kind: "unknown",
        confidence: 0.5,
        summary,
        status: "candidate",
        nearbyText: summary,
      });
      const submitted = await submitImageLensCropFrame({
        postJson,
        receipt,
        sourceId: request.sourceId,
        threadId,
        roomId,
        environmentId,
        pipelineId,
        imageDataUrl: cropDataUrl,
        objective: "Image Lens focus run crop frame for Live Answer visual-source analysis.",
      });
      useDocumentImageRegionStore.getState().addReceipt(submitted.receipt);
      submittedRegions.push({
        regionId: region.regionId,
        bboxPct: region.bboxPct,
        bboxPx,
        reason: region.reason,
        evidenceId: submitted.evidenceId,
        frameId: submitted.frameId,
        summary: submitted.summary,
        previewHash: submitted.receipt.crop.imageHash ?? null,
      });
    } catch (error) {
      blockers.push(`region ${region.regionId}: ${error instanceof Error ? error.message : "image_lens_focus_region_failed"}`);
    }
  }

  return buildImageLensFocusRunResultV1({
    sourceId: request.sourceId,
    submittedRegions,
    blockers,
  });
}
