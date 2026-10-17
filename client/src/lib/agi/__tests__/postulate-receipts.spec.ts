/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EssenceProposal } from "@shared/proposals";
import {
  CLAIMABLE_POSTULATE_RECEIPTS_EVENT,
  POSTULATE_BOARD_EVENT,
  buildClaimablePostulateReceipt,
  extractPostulateEvidenceContextFromText,
  ingestPostulateReviewReceiptsFromAskPayload,
  readClaimablePostulateReceipts,
  rememberClaimablePostulateReceipt,
  updateClaimablePostulateReceiptStatus,
} from "@/lib/agi/proposals";

const makePostulateProposal = (overrides: Partial<EssenceProposal> = {}): EssenceProposal => ({
  id: "postulate-1",
  kind: "postulate",
  status: "accepted_rewarded",
  source: "agent",
  title: "Constructive badge graph postulate",
  summary: "A constructive postulate for review.",
  explanation: "Scored as a review candidate.",
  target: {
    type: "postulate-board",
    domain: "physics",
    badgeGraphLocatorRefs: ["theory-badge-graph:/warp/qei/residual"],
  },
  patchKind: "badge-graph-suggestion",
  patch: "{}",
  rewardTokens: 250,
  ownerId: null,
  safetyStatus: "passed",
  safetyScore: 0.92,
  safetyReport: "accepted_for_structured_review",
  createdAt: "2026-07-07T04:00:00.000Z",
  updatedAt: "2026-07-07T04:00:00.000Z",
  createdForDay: "2026-07-07",
  metadata: {
    postulate: {
      receiptId: "receipt-1",
      receiptIssuedAt: "2026-07-07T04:00:00.000Z",
      receiptIntegrityHash: "abc123",
      rewardCreditStatus: "claim_pending",
      receiptClaimStatus: "unclaimed",
    },
  },
  ...overrides,
});

describe("postulate claimable receipt helpers", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("builds claimable anonymous receipts with receipt integrity fields", () => {
    const receipt = buildClaimablePostulateReceipt(makePostulateProposal());

    expect(receipt).toEqual(expect.objectContaining({
      proposalId: "postulate-1",
      receiptId: "receipt-1",
      receiptIssuedAt: "2026-07-07T04:00:00.000Z",
      receiptIntegrityHash: "abc123",
      rewardTokens: 250,
      score: 0.92,
      status: "claim_pending",
    }));
  });

  it("persists, dedupes, and broadcasts claimable receipt changes", () => {
    const listener = vi.fn();
    window.addEventListener(CLAIMABLE_POSTULATE_RECEIPTS_EVENT, listener);

    const first = buildClaimablePostulateReceipt(makePostulateProposal())!;
    rememberClaimablePostulateReceipt(first);
    rememberClaimablePostulateReceipt({ ...first, title: "Updated title" });

    expect(readClaimablePostulateReceipts()).toEqual([
      expect.objectContaining({ proposalId: "postulate-1", title: "Updated title" }),
    ]);
    expect(listener).toHaveBeenCalledTimes(2);

    window.removeEventListener(CLAIMABLE_POSTULATE_RECEIPTS_EVENT, listener);
  });

  it("marks stored receipts claimed without losing issued receipt metadata", () => {
    const receipt = buildClaimablePostulateReceipt(makePostulateProposal())!;
    rememberClaimablePostulateReceipt(receipt);

    updateClaimablePostulateReceiptStatus("postulate-1", "claimed", {
      receiptIssuedAt: "2026-07-07T04:00:00.000Z",
      receiptIntegrityHash: "abc123",
    });

    expect(readClaimablePostulateReceipts()).toEqual([
      expect.objectContaining({
        proposalId: "postulate-1",
        status: "claimed",
        receiptIssuedAt: "2026-07-07T04:00:00.000Z",
        receiptIntegrityHash: "abc123",
      }),
    ]);
  });

  it("does not build browser claim receipts for owned non-reward postulates", () => {
    const receipt = buildClaimablePostulateReceipt(makePostulateProposal({
      ownerId: "profile:owner",
      rewardTokens: 0,
      metadata: {
        postulate: {
          receiptId: "receipt-owned",
          rewardCreditStatus: "none",
          receiptClaimStatus: "unclaimed",
        },
      },
    }));

    expect(receipt).toBeNull();
  });

  it("extracts structured evidence refs from final-answer text", () => {
    const context = extractPostulateEvidenceContextFromText([
      "scientific_image_sidecar:paper-page-2",
      "promoted_equation_row:eq-2.1",
      "page_render:paper:2",
      "equation_crop:eq-2.1-row",
      "graph_reflection:theory-badge-graph:/warp/qei/residual",
      "provenance_audit:paper-page-2",
      "calculator_check:dimensional:eq-2.1",
      "uncertainty_reduction:qei-residual",
    ].join(" "));

    expect(context).toMatchObject({
      evidenceSidecarRefs: ["scientific_image_sidecar:paper-page-2"],
      promotedEquationRowRefs: ["promoted_equation_row:eq-2.1"],
      pageRenderRefs: ["page_render:paper:2"],
      cropRefs: ["equation_crop:eq-2.1-row"],
      graphReflectionRefs: ["graph_reflection:theory-badge-graph:/warp/qei/residual"],
      provenanceAuditRefs: ["provenance_audit:paper-page-2"],
      calculatorCheckRefs: ["calculator_check:dimensional:eq-2.1"],
      uncertaintyReductionRefs: ["uncertainty_reduction:qei-residual"],
    });
  });

  it("extracts promoted scientific Image Lens refs from structured receipt text", () => {
    const context = extractPostulateEvidenceContextFromText(JSON.stringify({
      schema: "helix.promoted_scientific_image_evidence.v1",
      evidence_id: "promoted_scientific_image_evidence:image_lens_region:promoted-row-a",
      sidecar_id: "ask:turn-7:scientific_image_evidence_sidecar",
      source_id: "pdf-page-render:a57b3f7f064f9ade",
      source_hash: "sha256:abcdef1234567890",
      page_number: 5,
      packet_ref: "scientific_packet:source-page-row-a",
      crop_ref: "sha256:abcdef1234567890#crop=73,570,1077,87",
      reflection_id: "scientific_evidence_graph_reflection:source-page-a",
    }));

    expect(context.evidenceSidecarRefs).toContain("ask:turn-7:scientific_image_evidence_sidecar");
    expect(context.promotedEquationRowRefs).toContain("scientific_packet:source-page-row-a");
    expect(context.promotedEquationRowRefs).toContain("promoted_scientific_image_evidence:image_lens_region:promoted-row-a");
    expect(context.pageRenderRefs).toContain("pdf-page-render:a57b3f7f064f9ade");
    expect(context.pageRenderRefs).toContain("sha256:abcdef1234567890");
    expect(context.cropRefs).toContain("sha256:abcdef1234567890#crop=73,570,1077,87");
    expect(context.graphReflectionRefs).toContain("scientific_evidence_graph_reflection:source-page-a");
  });

  it("ingests Ask postulate review terminal results outside the deprecated pill", () => {
    const boardListener = vi.fn();
    const receiptListener = vi.fn();
    window.addEventListener(POSTULATE_BOARD_EVENT, boardListener);
    window.addEventListener(CLAIMABLE_POSTULATE_RECEIPTS_EVENT, receiptListener);

    ingestPostulateReviewReceiptsFromAskPayload({
      terminal_result: {
        schema: "helix.ask.postulate_review_result.v1",
        receiptId: "receipt-ask-1",
        proposal: makePostulateProposal({
          id: "postulate-ask-1",
          metadata: {
            postulate: {
              receiptId: "receipt-ask-1",
              receiptIssuedAt: "2026-07-07T04:30:00.000Z",
              receiptIntegrityHash: "ask-hash",
              rewardCreditStatus: "claim_pending",
              receiptClaimStatus: "unclaimed",
            },
          },
        }),
      },
    });

    expect(readClaimablePostulateReceipts()).toEqual([
      expect.objectContaining({
        proposalId: "postulate-ask-1",
        receiptId: "receipt-ask-1",
        status: "claim_pending",
      }),
    ]);
    expect(boardListener).toHaveBeenCalledTimes(1);
    expect(receiptListener).toHaveBeenCalledTimes(1);

    window.removeEventListener(POSTULATE_BOARD_EVENT, boardListener);
    window.removeEventListener(CLAIMABLE_POSTULATE_RECEIPTS_EVENT, receiptListener);
  });
});
