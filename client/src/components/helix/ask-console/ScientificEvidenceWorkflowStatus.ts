import type { PostulateEvidenceContext } from "@/lib/agi/proposals";
import type { DocumentImageBboxPxV1, DocumentImageRegionReceiptV1 } from "@shared/contracts/document-image-region-receipt.v1";
import type { DocumentImageSourceState } from "@/store/useDocumentImageRegionStore";

export type ScientificEvidenceWorkflowStatus = {
  schema: "helix.scientific_evidence_workflow_status.v1";
  pageLoaded: boolean;
  sourceId: string | null;
  sourceKind: string | null;
  sourceImageHash: string | null;
  pageNumber: number | null;
  pageCount: number | null;
  cropRef: string | null;
  cropRegionRef: string | null;
  sidecarId: string | null;
  evidenceDepth:
    | "missing"
    | "page_loaded"
    | "page_image_observation"
    | "page_image_ocr_math_candidate"
    | "exact_row_partial"
    | "exact_row_promoted"
    | "exact_block_partial"
    | "exact_block_promoted";
  promotedRowState: "missing" | "partial" | "promoted" | "rejected";
  promotedEquationLatex: string | null;
  graphReflectionStatus: "missing" | "diagnostic_reflected";
  calculatorTemplateStatus: "missing" | "template_only" | "template_admissible" | "calculation_ready";
  postulateReadyRefs: PostulateEvidenceContext;
  activeBlockers: string[];
  historicalBlockers: string[];
  claimBoundary: "observation_only_not_proof";
};

const unique = (values: Array<string | null | undefined>): string[] =>
  Array.from(new Set(values.map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean))).slice(0, 24);

export const cropRefFromScientificEvidenceSource = (
  sourceHash: string | null | undefined,
  bbox: DocumentImageBboxPxV1 | null | undefined,
): string | null => {
  const hash = typeof sourceHash === "string" && sourceHash.trim() ? sourceHash.trim() : "";
  if (!hash || !bbox) return null;
  const values = [bbox.x, bbox.y, bbox.width, bbox.height];
  if (!values.every((value) => Number.isFinite(value) && value >= 0) || bbox.width <= 0 || bbox.height <= 0) return null;
  return `${hash}#crop=${bbox.x},${bbox.y},${bbox.width},${bbox.height}`;
};

const readTextEvidenceFlags = (text: string) => ({
  hasExactRowPromoted: /\bexact_row_promoted\b|\bexact row promotion:\s*promoted\b|\bpromoted exact rows?\b|\bactive promoted row blockers\s*:\s*`?none/i.test(text),
  hasExactRowPartial: /\bexact_row_partial\b|\bexact row promotion:\s*partial\b|\bpartial_candidate\b/i.test(text),
  hasExactBlockPromoted: /\bexact_block_promoted\b|\bexact block promotion:\s*promoted\b|\bpromoted exact blocks?\b/i.test(text),
  hasExactBlockPartial: /\bexact_block_partial\b|\bexact block promotion:\s*partial\b/i.test(text),
  hasGraphReflection: /\bTheory Badge Graph reflection completed\b|\bdiagnostic graph reflection\b|\bgraph reflection\b/i.test(text),
  hasCalculatorTemplate:
    /\bcalculator template admissibility\b|\bCalculator status:\s*(?:template_admissible|template_only)\b|\btemplate_admissible\b|\btemplate_only\b/i.test(text),
  hasCalculationReady: /\bcalculation[-_\s]?ready\b|\bcalculation_ready_count\s*[:=]\s*[1-9]/i.test(text),
});

export function buildScientificEvidenceWorkflowStatus(args: {
  source?: DocumentImageSourceState | null;
  cropDraft?: DocumentImageBboxPxV1 | null;
  lastReceipt?: DocumentImageRegionReceiptV1 | null;
  evidenceContext?: PostulateEvidenceContext | null;
  evidenceText?: string | null;
}): ScientificEvidenceWorkflowStatus {
  const source = args.source ?? null;
  const receipt = args.lastReceipt ?? null;
  const evidenceText = typeof args.evidenceText === "string" ? args.evidenceText : "";
  const flags = readTextEvidenceFlags(evidenceText);
  const cropRef =
    cropRefFromScientificEvidenceSource(source?.sourceRefHash, source?.cropDraft ?? args.cropDraft ?? null) ??
    (receipt?.crop?.imageHash && receipt?.crop?.bboxPx
      ? cropRefFromScientificEvidenceSource(receipt.crop.imageHash, receipt.crop.bboxPx)
      : null);
  const cropRegionRef = receipt?.crop?.regionId ? `equation_crop:${receipt.crop.regionId}` : null;
  const sidecarRefs = unique([
    source?.scientificEvidenceSidecarId,
    ...(args.evidenceContext?.evidenceSidecarRefs ?? []),
  ]);
  const pageRenderRefs = unique([
    source?.sourceId,
    source?.pageImageRef,
    receipt?.pageRef?.pageImageRef,
    source?.sourceKind === "pdf_page_render" && source?.sourceId ? `page_render:${source.sourceId}` : null,
    source?.sourceKind === "pdf_page_render" && source?.sourceRefHash
      ? `page_render:${source.sourceRefHash}${source.pageNumber ? `:page:${source.pageNumber}` : ""}`
      : null,
    ...(args.evidenceContext?.pageRenderRefs ?? []),
  ]);
  const cropRefs = unique([
    cropRegionRef,
    cropRef,
    cropRef ? `equation_crop:${cropRef}` : null,
    ...(args.evidenceContext?.cropRefs ?? []),
  ]);
  const provenanceAuditRefs = unique([
    source?.sourceRefHash ? `provenance_audit:${source.sourceRefHash}` : null,
    receipt?.crop?.imageHash ? `provenance_audit:${receipt.crop.imageHash}` : null,
    ...(args.evidenceContext?.provenanceAuditRefs ?? []),
  ]);
  const promotedEquationRowRefs = unique([
    source?.evidenceId,
    source?.scientificEvidenceSidecarId && source?.regionId ? `promoted_equation_row:${source.regionId}` : null,
    flags.hasExactBlockPromoted && cropRef ? `promoted_equation_block:${cropRef}` : null,
    flags.hasExactRowPromoted && cropRef ? `promoted_equation_row:${cropRef}` : null,
    ...(args.evidenceContext?.promotedEquationRowRefs ?? []),
  ]);
  const graphReflectionRefs = unique(args.evidenceContext?.graphReflectionRefs ?? []);
  const calculatorCheckRefs = unique([
    ...(args.evidenceContext?.calculatorCheckRefs ?? []),
    flags.hasCalculatorTemplate ? "calculator_check:template_admissibility:template_admissible" : null,
  ]);
  const uncertaintyReductionRefs = unique(args.evidenceContext?.uncertaintyReductionRefs ?? []);
  const promotedEquationLatex = receipt?.extraction?.latexCandidate ?? null;
  const promotedRowState =
    promotedEquationRowRefs.length > 0 || flags.hasExactRowPromoted || flags.hasExactBlockPromoted
      ? "promoted"
      : flags.hasExactRowPartial || flags.hasExactBlockPartial || Boolean(promotedEquationLatex)
        ? "partial"
        : "missing";
  const evidenceDepth =
    flags.hasExactBlockPromoted
      ? "exact_block_promoted"
      : flags.hasExactBlockPartial
        ? "exact_block_partial"
        : promotedRowState === "promoted"
          ? "exact_row_promoted"
          : promotedRowState === "partial"
            ? "exact_row_partial"
            : receipt?.extraction?.latexCandidate || receipt?.extraction?.textCandidate
              ? "page_image_ocr_math_candidate"
              : receipt
                ? "page_image_observation"
                : source
                  ? "page_loaded"
                  : "missing";
  const calculatorTemplateStatus =
    flags.hasCalculationReady
      ? "calculation_ready"
      : calculatorCheckRefs.length > 0
        ? "template_admissible"
        : flags.hasCalculatorTemplate
          ? "template_only"
          : "missing";
  const graphReflectionStatus =
    graphReflectionRefs.length > 0 || flags.hasGraphReflection ? "diagnostic_reflected" : "missing";

  return {
    schema: "helix.scientific_evidence_workflow_status.v1",
    pageLoaded: Boolean(source),
    sourceId: source?.sourceId ?? null,
    sourceKind: source?.sourceKind ?? null,
    sourceImageHash: source?.sourceRefHash ?? receipt?.crop?.imageHash ?? null,
    pageNumber: source?.pageNumber ?? receipt?.pageRef?.pageNumber ?? null,
    pageCount: source?.pageCount ?? null,
    cropRef,
    cropRegionRef,
    sidecarId: sidecarRefs[0] ?? null,
    evidenceDepth,
    promotedRowState,
    promotedEquationLatex,
    graphReflectionStatus,
    calculatorTemplateStatus,
    postulateReadyRefs: {
      evidenceSidecarRefs: sidecarRefs,
      promotedEquationRowRefs,
      pageRenderRefs,
      cropRefs,
      graphReflectionRefs,
      provenanceAuditRefs,
      calculatorCheckRefs,
      uncertaintyReductionRefs,
    },
    activeBlockers: [
      !source ? "page_source_missing" : null,
      sidecarRefs.length === 0 ? "scientific_sidecar_ref_missing" : null,
      promotedEquationRowRefs.length === 0 ? "promoted_equation_row_ref_missing" : null,
      graphReflectionStatus === "missing" ? "graph_reflection_ref_missing" : null,
      calculatorTemplateStatus === "missing" ? "calculator_template_status_missing" : null,
    ].filter((entry): entry is string => Boolean(entry)),
    historicalBlockers: [],
    claimBoundary: "observation_only_not_proof",
  };
}
