// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  collectScientificEvidenceWorkflowStatusesFromPayload,
  ingestScientificEvidenceWorkflowStatusFromAskPayload,
  mergeScientificEvidenceWorkflowStatus,
  readActiveScientificEvidenceWorkflowStatus,
  useScientificEvidenceWorkflowStore,
  type ScientificEvidenceWorkflowStatus,
} from "@/store/useScientificEvidenceWorkflowStore";

const emptyRefs = {
  evidenceSidecarRefs: [],
  promotedEquationRowRefs: [],
  pageRenderRefs: [],
  cropRefs: [],
  graphReflectionRefs: [],
  provenanceAuditRefs: [],
  calculatorCheckRefs: [],
  uncertaintyReductionRefs: [],
};

const baseStatus = (overrides: Partial<ScientificEvidenceWorkflowStatus> = {}): ScientificEvidenceWorkflowStatus => ({
  schema: "helix.scientific_evidence_workflow_status.v1",
  pageLoaded: true,
  sourceId: "pdf-page-render:test",
  sourceKind: "pdf_page_render",
  sourceImageHash: "sha256:test-page",
  pageNumber: 5,
  pageCount: 12,
  cropRef: "sha256:test-page#crop=73,570,1077,87",
  cropRegionRef: "equation_crop:image_lens_region:test",
  sidecarId: "scientific_image_sidecar:test",
  evidenceDepth: "page_loaded",
  promotedRowState: "missing",
  promotedEquationLatex: null,
  graphReflectionStatus: "missing",
  calculatorTemplateStatus: "missing",
  postulateReadyRefs: emptyRefs,
  activeBlockers: ["promoted_equation_row_ref_missing"],
  historicalBlockers: [],
  claimBoundary: "observation_only_not_proof",
  ...overrides,
});

describe("useScientificEvidenceWorkflowStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useScientificEvidenceWorkflowStore.getState().clear();
  });

  it("merges compact scientific workflow state without letting weaker later rows erase promoted evidence", () => {
    mergeScientificEvidenceWorkflowStatus(baseStatus({
      evidenceDepth: "exact_row_promoted",
      promotedRowState: "promoted",
      promotedEquationLatex: "S = \\int d^4x \\sqrt{-g} e^{-\\phi} \\{ R + L_m \\}, (7)",
      graphReflectionStatus: "diagnostic_reflected",
      calculatorTemplateStatus: "template_admissible",
      postulateReadyRefs: {
        ...emptyRefs,
        evidenceSidecarRefs: ["scientific_image_sidecar:test"],
        promotedEquationRowRefs: ["promoted_equation_row:image_lens_region:test"],
        pageRenderRefs: ["pdf-page-render:test"],
        cropRefs: ["sha256:test-page#crop=73,570,1077,87"],
        graphReflectionRefs: ["graph_reflection:diagnostic:test"],
        calculatorCheckRefs: ["calculator_check:template_admissibility:test"],
      },
      activeBlockers: [],
    }));

    mergeScientificEvidenceWorkflowStatus(baseStatus({
      evidenceDepth: "exact_row_partial",
      promotedRowState: "partial",
      promotedEquationLatex: "(7)",
      cropRef: "sha256:test-page#crop=866,563,266,44",
      activeBlockers: ["retry_row_does_not_overlap_prior_page_equation_candidate"],
    }));

    const active = readActiveScientificEvidenceWorkflowStatus();
    expect(active?.evidenceDepth).toBe("exact_row_promoted");
    expect(active?.promotedRowState).toBe("promoted");
    expect(active?.graphReflectionStatus).toBe("diagnostic_reflected");
    expect(active?.calculatorTemplateStatus).toBe("template_admissible");
    expect(active?.postulateReadyRefs.promotedEquationRowRefs).toContain("promoted_equation_row:image_lens_region:test");
    expect(active?.historicalBlockers).toContain("retry_row_does_not_overlap_prior_page_equation_candidate");
  });

  it("ingests workflow statuses from Ask payloads and trims oversized equation text for browser persistence", () => {
    const longLatex = `S=${"x".repeat(3000)}`;
    const payload = {
      debug: {
        route_metadata: {
          scientific_evidence_workflow_status: baseStatus({
            evidenceDepth: "exact_row_promoted",
            promotedRowState: "promoted",
            promotedEquationLatex: longLatex,
          }),
        },
      },
    };

    expect(collectScientificEvidenceWorkflowStatusesFromPayload(payload)).toHaveLength(1);
    const applied = ingestScientificEvidenceWorkflowStatusFromAskPayload(payload);
    expect(applied).toHaveLength(1);
    expect(readActiveScientificEvidenceWorkflowStatus()?.promotedEquationLatex?.length).toBeLessThan(longLatex.length);
  });

  it("keeps a promoted complete equation block ahead of later row-level evidence", () => {
    mergeScientificEvidenceWorkflowStatus(baseStatus({
      evidenceDepth: "exact_block_promoted",
      promotedRowState: "promoted",
      cropRef: "sha256:test-page#crop=80,120,1060,300",
      postulateReadyRefs: {
        ...emptyRefs,
        promotedEquationRowRefs: ["promoted_equation_block:sha256:test-page#crop=80,120,1060,300"],
      },
      activeBlockers: [],
    }));
    mergeScientificEvidenceWorkflowStatus(baseStatus({
      evidenceDepth: "exact_row_promoted",
      promotedRowState: "promoted",
      cropRef: "sha256:test-page#crop=73,570,1077,87",
    }));

    expect(readActiveScientificEvidenceWorkflowStatus()).toMatchObject({
      evidenceDepth: "exact_block_promoted",
      cropRef: "sha256:test-page#crop=80,120,1060,300",
    });
  });

  it("keeps inline page images out of the persisted workflow ledger", () => {
    const inlineImage = `data:image/png;base64,${"a".repeat(400_000)}`;
    mergeScientificEvidenceWorkflowStatus(baseStatus({
      sourceId: inlineImage,
      sourceImageHash: "sha256:stable-page",
      postulateReadyRefs: {
        ...emptyRefs,
        pageRenderRefs: [inlineImage, "page_render:sha256:stable-page:page:8"],
      },
    }));

    const active = readActiveScientificEvidenceWorkflowStatus();
    expect(active?.sourceId).toBeNull();
    expect(active?.postulateReadyRefs.pageRenderRefs).toEqual(["page_render:sha256:stable-page:page:8"]);
    const persisted = window.localStorage.getItem("helix:scientific-evidence-workflow-status:v1") ?? "";
    expect(persisted).not.toContain("data:image");
    expect(persisted.length).toBeLessThan(10_000);
  });

  it("does not let a storage quota exception abort the active workflow update", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    });

    expect(() => mergeScientificEvidenceWorkflowStatus(baseStatus())).not.toThrow();
    expect(readActiveScientificEvidenceWorkflowStatus()?.sourceId).toBe("pdf-page-render:test");

    setItem.mockRestore();
  });
});
