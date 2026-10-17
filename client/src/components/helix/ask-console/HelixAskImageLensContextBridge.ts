import { useDocumentImageRegionStore } from "@/store/useDocumentImageRegionStore";
import { buildScientificEvidenceWorkflowStatus, cropRefFromScientificEvidenceSource } from "./ScientificEvidenceWorkflowStatus";
import {
  mergeScientificEvidenceWorkflowStatus,
  mergeScientificEvidenceWorkflowStatusRecords,
  readActiveScientificEvidenceWorkflowStatus,
} from "@/store/useScientificEvidenceWorkflowStore";

export function readHelixAskActiveImageLensSourceContext(): Record<string, unknown> | null {
  const state = useDocumentImageRegionStore.getState();
  const source = state.source;
  if (!source) return null;
  const sourceDimensions = source.sourceDimensionsPx ?? source.naturalSize ?? state.naturalSize ?? null;
  const currentCrop = source.cropDraft ?? state.cropDraft ?? null;
  const cropRef = cropRefFromScientificEvidenceSource(source.sourceRefHash, currentCrop);
  const pageRenderRef = source.sourceKind === "pdf_page_render" && source.sourceRefHash
    ? `page_render:${source.sourceRefHash}${source.pageNumber ? `:page:${source.pageNumber}` : ""}`
    : null;
  const localScientificEvidenceWorkflowStatus = buildScientificEvidenceWorkflowStatus({
    source,
    cropDraft: currentCrop,
    lastReceipt: state.lastReceipt,
  });
  const storedScientificEvidenceWorkflowStatus = readActiveScientificEvidenceWorkflowStatus();
  const scientificEvidenceWorkflowStatus = storedScientificEvidenceWorkflowStatus
    ? mergeScientificEvidenceWorkflowStatusRecords(localScientificEvidenceWorkflowStatus, storedScientificEvidenceWorkflowStatus)
    : localScientificEvidenceWorkflowStatus;
  mergeScientificEvidenceWorkflowStatus(scientificEvidenceWorkflowStatus, { askThreadId: "helix-ask:desktop" });
  return {
    source_id: source.sourceId ?? null,
    source_attachment_id: source.sourceAttachmentId,
    source_kind: source.sourceKind,
    source_image_ref: source.pageImageRef ?? source.sourceImageUrl,
    page_image_ref: source.pageImageRef ?? null,
    source_ref_hash: source.sourceRefHash ?? null,
    source_dimensions_px: sourceDimensions,
    natural_size_px: sourceDimensions,
    current_crop_bbox_px: currentCrop,
    current_crop_ref: cropRef,
    crop_ref: cropRef,
    equation_crop_ref: cropRef ? `equation_crop:${cropRef}` : null,
    page_render_ref: pageRenderRef ?? source.sourceId ?? source.pageImageRef ?? null,
    coordinate_space: source.coordinateSpace ?? "natural_image_px",
    view_mode: source.viewMode ?? "fit_to_panel",
    page_number: source.pageNumber ?? null,
    page_count: source.pageCount ?? null,
    evidence_id: source.evidenceId ?? null,
    region_id: source.regionId ?? null,
    promoted_equation_row_ref: source.scientificEvidenceSidecarId && source.regionId
      ? `promoted_equation_row:${source.regionId}`
      : null,
    scientific_evidence_sidecar_id: source.scientificEvidenceSidecarId ?? null,
    scientific_evidence_workflow_status: scientificEvidenceWorkflowStatus,
    scholarly_source_pdf_ref: source.scholarlySourcePdfRef ?? null,
    assistant_answer: false,
    terminal_eligible: false,
    raw_content_included: false,
  };
}

export function attachHelixAskActiveImageLensSourceContext<T extends Record<string, unknown>>(snapshot: T): T {
  const activeImageLensSource = readHelixAskActiveImageLensSourceContext();
  if (!activeImageLensSource) return snapshot;
  const scientificEvidenceWorkflowStatus =
    activeImageLensSource.scientific_evidence_workflow_status ?? null;
  return {
    ...snapshot,
    activeImageLensSource,
    active_image_lens_source: activeImageLensSource,
    scientificEvidenceWorkflowStatus,
    scientific_evidence_workflow_status: scientificEvidenceWorkflowStatus,
  };
}
