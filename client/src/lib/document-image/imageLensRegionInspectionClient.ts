import type { ImageLensRegionInspectionReceiptV1 } from "@shared/contracts/image-lens-region-inspection.v1";
import { useDocumentImageRegionStore } from "@/store/useDocumentImageRegionStore";
import { useImageLensLiveSourceStore } from "@/store/useImageLensLiveSourceStore";
import { buildScientificEvidenceWorkflowStatus } from "@/components/helix/ask-console/ScientificEvidenceWorkflowStatus";
import { mergeScientificEvidenceWorkflowStatus } from "@/store/useScientificEvidenceWorkflowStore";
import {
  VISUAL_SOURCE_FRAME_HISTORY_TTL_MS,
  type VisualSourceCaptureFrameHistoryItem,
  useVisualSourceCaptureStore,
} from "@/store/useVisualSourceCaptureStore";

export type ApplyImageLensRegionInspectionReceiptInput = {
  receipt: ImageLensRegionInspectionReceiptV1;
  threadId: string;
  capturedAt?: string;
  producerId?: string | null;
  environmentId?: string | null;
  pipelineId?: string | null;
};

const hashString = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

const isDisplayableImageRef = (value: string | null | undefined): value is string =>
  typeof value === "string" &&
  /^(data:image\/|blob:|https?:\/\/|file:\/\/)/i.test(value.trim());

export function applyImageLensRegionInspectionReceipt(
  input: ApplyImageLensRegionInspectionReceiptInput,
): VisualSourceCaptureFrameHistoryItem {
  const { receipt } = input;
  const documentReceipt = receipt.document_region_receipt;
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const capturedAtMs = Date.parse(capturedAt);
  const expiresAt = new Date(
    (Number.isFinite(capturedAtMs) ? capturedAtMs : Date.now()) + VISUAL_SOURCE_FRAME_HISTORY_TTL_MS,
  ).toISOString();
  const sourceId = documentReceipt.visualSource.sourceId;
  const frameId = documentReceipt.visualSource.frameId;
  const sourceImageRef = receipt.source_kind === "pdf_page_render"
    ? receipt.page_image_ref ?? receipt.source_image_ref
    : receipt.source_image_ref ?? receipt.page_image_ref;
  const sourceImageDisplayable = isDisplayableImageRef(sourceImageRef);

  const documentStore = useDocumentImageRegionStore.getState();
  if (sourceImageDisplayable) {
    if (receipt.source_kind === "pdf_page_render") {
      useImageLensLiveSourceStore.getState().clearLiveSource();
    }
    documentStore.setSourceImage({
      sourceImageUrl: sourceImageRef,
      sourceAttachmentId: documentReceipt.sourceAttachmentId,
      sourceKind: receipt.source_kind,
      pageNumber: receipt.page_number,
      pageCount: receipt.page_count ?? null,
      pageImageRef: receipt.page_image_ref ?? null,
      naturalSize: receipt.source_dimensions_px ?? null,
      sourceDimensionsPx: receipt.source_dimensions_px ?? null,
      sourceId,
      evidenceId: receipt.evidence_id,
      regionId: receipt.region_id,
      scientificEvidenceSidecarId: receipt.scientific_evidence_sidecar?.sidecar_id ?? null,
      scholarlySourcePdfRef: receipt.scholarly_source_pdf_ref ?? null,
      scholarlyPdfCachePath: receipt.scholarly_pdf_cache_path ?? null,
      sourceRefHash: receipt.scientific_evidence_packet?.source_ref_hash ?? receipt.scientific_evidence_sidecar?.source_ref_hash ?? null,
      mountedAt: capturedAt,
    });
  }
  useDocumentImageRegionStore.getState().setCropDraft(receipt.bbox_px);
  useDocumentImageRegionStore.getState().addReceipt(documentReceipt);
  const nextDocumentState = useDocumentImageRegionStore.getState();
  mergeScientificEvidenceWorkflowStatus(
    buildScientificEvidenceWorkflowStatus({
      source: nextDocumentState.source,
      cropDraft: nextDocumentState.cropDraft,
      lastReceipt: nextDocumentState.lastReceipt,
    }),
    { askThreadId: input.threadId },
  );
  useVisualSourceCaptureStore.getState().upsertProducer({
    source_id: sourceId,
    thread_id: input.threadId,
    producer_id: input.producerId ?? "image_lens_region_inspection",
    environment_id: input.environmentId ?? null,
    pipeline_id: input.pipelineId ?? null,
    stream_active: false,
    interval_active: false,
    track_ready_state: "ended",
    capture_mode: "manual",
    cadence_ms: null,
    last_frame_at: capturedAt,
    last_heartbeat_at: capturedAt,
    last_frame_hash: sourceImageDisplayable ? hashString(sourceImageRef) : documentReceipt.crop.imageHash,
    last_frame_preview_data_url: sourceImageDisplayable ? sourceImageRef : receipt.crop_image_ref,
    capture_count: 1,
    post_count: 0,
    last_error: null,
  });
  if (sourceImageDisplayable && receipt.source_kind === "pdf_page_render") {
    const pageFrame: VisualSourceCaptureFrameHistoryItem = {
      history_id: `image_lens_page_source_history:${receipt.region_id}`,
      source_id: sourceId,
      frame_id: `${frameId}:source-page`,
      evidence_id: null,
      captured_at: capturedAt,
      preview_data_url: sourceImageRef,
      preview_hash: hashString(sourceImageRef),
      source_surface: "document",
      source_kind: "full_frame",
      crop_only: false,
      crop_bbox_px: null,
      crop_region_id: null,
      summary: receipt.page_number
        ? `Rendered scholarly PDF page ${receipt.page_number} mounted in Image Lens.`
        : "Rendered scholarly PDF page mounted in Image Lens.",
      visual_observer_profile_id: documentReceipt.visualSource.observerProfileId,
      visual_observer_profile_title: "Image Lens PDF page source",
      visual_prompt_hash: hashString([
        receipt.scholarly_source_pdf_ref ?? "",
        receipt.page_number ?? "",
        receipt.page_count ?? "",
      ].join("|")),
      expires_at: expiresAt,
    };
    useVisualSourceCaptureStore.getState().appendFrameHistory(sourceId, pageFrame, {
      last_frame_at: capturedAt,
      last_heartbeat_at: capturedAt,
      last_frame_hash: pageFrame.preview_hash,
      last_frame_preview_data_url: sourceImageRef,
      post_count: 0,
    });
  }

  const frame: VisualSourceCaptureFrameHistoryItem = {
    history_id: `image_lens_region_history:${receipt.region_id}`,
    source_id: sourceId,
    frame_id: frameId,
    evidence_id: receipt.evidence_id,
    captured_at: capturedAt,
    preview_data_url: receipt.crop_image_ref,
    preview_hash: documentReceipt.crop.imageHash || hashString(receipt.crop_image_ref),
    source_surface: "image_lens",
    source_kind: "image_lens_crop",
    crop_only: true,
    crop_bbox_px: receipt.bbox_px,
    crop_region_id: receipt.region_id,
    summary: receipt.summary,
    visual_observer_profile_id: documentReceipt.visualSource.observerProfileId,
    visual_observer_profile_title: "Image Lens region inspection",
    visual_prompt_hash: hashString([
      receipt.requested_question ?? "",
      receipt.reason_for_crop ?? "",
      receipt.detail,
    ].join("|")),
    expires_at: expiresAt,
  };
  useVisualSourceCaptureStore.getState().appendFrameHistory(sourceId, frame, {
    last_frame_at: capturedAt,
    last_heartbeat_at: capturedAt,
    last_frame_hash: frame.preview_hash,
    last_frame_preview_data_url: receipt.crop_image_ref,
  });
  return frame;
}
