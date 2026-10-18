/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EssenceProposal } from "@shared/proposals";

const proposalMocks = vi.hoisted(() => ({
  fetchPostulateBoard: vi.fn(),
}));

const accountPolicyMocks = vi.hoisted(() => ({
  fetchAccountCapabilityPolicy: vi.fn(),
  readCachedAccountCapabilityPolicy: vi.fn(),
}));

vi.mock("@/lib/agi/proposals", () => ({
  POSTULATE_BOARD_EVENT: "helix-postulate-board-changed",
  fetchPostulateBoard: proposalMocks.fetchPostulateBoard,
}));

vi.mock("@/lib/workstation/accountCapabilityPolicy", () => ({
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT: "helix-account-capability-policy-changed",
  fetchAccountCapabilityPolicy: accountPolicyMocks.fetchAccountCapabilityPolicy,
  readCachedAccountCapabilityPolicy: accountPolicyMocks.readCachedAccountCapabilityPolicy,
}));

import PostulateBoardPanel from "../PostulateBoardPanel";

const acceptedPostulate = (): EssenceProposal => ({
  id: "postulate-card-1",
  kind: "postulate",
  status: "claimed",
  source: "agent",
  title: "Resolve unresolved badge graph locator",
  summary: "Review a candidate patch for an unresolved physics graph location.",
  explanation: "Accepted as a constructive review candidate.",
  target: {
    type: "postulate-board",
    domain: "physics",
    badgeGraphLocatorRefs: ["theory-badge-graph:/warp/qei/residual"],
  },
  patchKind: "badge-graph-suggestion",
  patch: "{}",
  rewardTokens: 250,
  ownerId: "profile:claimant",
  safetyStatus: "passed",
  safetyScore: 0.92,
  safetyReport: "accepted_for_structured_review",
  createdAt: "2026-07-07T04:00:00.000Z",
  updatedAt: "2026-07-07T04:00:00.000Z",
  createdForDay: "2026-07-07",
  metadata: {
    postulate: {
      receiptId: "receipt-public-1",
      receiptIssuedAt: "2026-07-07T04:00:00.000Z",
      receiptIntegrityHash: "hash-public-1",
      domain: "physics",
      promptLabel: "Send this postulate to be reviewed",
      congruenceScore: 0.93,
      constructivenessScore: 0.91,
      evidenceDepthScore: 0.88,
      calculatorCheckScore: 0.8,
      graphCongruenceScore: 0.86,
      uncertaintyReductionScore: 0.72,
      claimBoundaryScore: 0.96,
      evidenceContext: {
        evidenceSidecarRefs: ["scientific_image_sidecar:paper-page-2"],
        cropRefs: ["equation_crop:eq-2.1-row"],
        provenanceAuditRefs: ["provenance_audit:paper-page-2"],
      },
      rewardCreditStatus: "issued",
      submittedByAgentId: "helix-postulate-gate",
      originatingAnswerId: "answer-public-1",
      graphIntegration: "queued_for_developer_patch_review",
      graphPatchReviewTask: {
        status: "queued",
        kind: "developer_patch_review",
      },
      claimBoundary: "accepted means constructive review candidate, not proof or certification",
    },
  },
});

describe("PostulateBoardPanel", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows accepted postulate cards with public receipt, source, score, and review boundary", async () => {
    proposalMocks.fetchPostulateBoard.mockResolvedValue([acceptedPostulate()]);
    accountPolicyMocks.readCachedAccountCapabilityPolicy.mockReturnValue({ account_type: "user" });
    accountPolicyMocks.fetchAccountCapabilityPolicy.mockResolvedValue({ account_type: "user" });

    render(<PostulateBoardPanel />);

    await waitFor(() => expect(screen.getByText("Resolve unresolved badge graph locator")).toBeTruthy());

    expect(screen.getByText("high congruence")).toBeTruthy();
    expect(screen.getByText("92%")).toBeTruthy();
    expect(screen.getByText("88%")).toBeTruthy();
    expect(screen.getByText("receipt-public-1")).toBeTruthy();
    expect(screen.getByText(/accepted means constructive review candidate/i)).toBeTruthy();
    expect(screen.getByText("Source:")).toBeTruthy();
    expect(document.body.textContent).toContain("Helix final answer / answer answer-public-1");
    expect(screen.queryByText(/proposal=postulate-card-1/i)).toBeNull();
    expect(screen.queryByText(/Copy review packet/i)).toBeNull();
  });

  it("shows developer graph review details only for developer accounts", async () => {
    proposalMocks.fetchPostulateBoard.mockResolvedValue([acceptedPostulate()]);
    accountPolicyMocks.readCachedAccountCapabilityPolicy.mockReturnValue({ account_type: "developer" });
    accountPolicyMocks.fetchAccountCapabilityPolicy.mockResolvedValue({ account_type: "developer" });

    render(<PostulateBoardPanel />);

    await waitFor(() => expect(screen.getByText("Graph patch review task: queued")).toBeTruthy());

    expect(screen.getByText(/proposal=postulate-card-1/i)).toBeTruthy();
    expect(screen.getByText("scientific_image_sidecar:paper-page-2")).toBeTruthy();
    expect(screen.getByText("equation_crop:eq-2.1-row")).toBeTruthy();
    expect(screen.getByText("provenance_audit:paper-page-2")).toBeTruthy();
    expect(screen.getByText("Copy review packet")).toBeTruthy();
  });
});
