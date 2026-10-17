import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildTheoryRuntimeJobSnapshotV1 } from "@shared/contracts/theory-runtime-job.v1";
import { buildTheoryRuntimeRunRequestV1 } from "@shared/contracts/theory-runtime-run-request.v1";
import { RuntimeJobProgressCard } from "../RuntimeJobProgressCard";

const job = (progress: number | null) => buildTheoryRuntimeJobSnapshotV1({
  jobId: "req",
  request: buildTheoryRuntimeRunRequestV1({ requestId: "req", runtimeId: "solar.manifest", graphId: "graph", badgeIds: [], args: {}, requestedScope: "quick", status: "running", createdAt: "2026-07-14T00:00:00.000Z", updatedAt: "2026-07-14T00:00:00.000Z", heartbeat: { updatedAt: "2026-07-14T00:00:00.000Z", stage: "running", message: "working", progress }, outputArtifactGlobs: [], claimBoundary: { currentTier: "diagnostic", maximumTier: "diagnostic", promotionAllowed: false, promotionRequires: [] } }),
  result: { available: false, receiptId: null, errorCode: null, errorMessage: null },
});

describe("RuntimeJobProgressCard", () => {
  it("renders indeterminate progress without inventing a percentage", () => {
    const html = renderToStaticMarkup(<RuntimeJobProgressCard job={job(null)} />);
    expect(html).toContain("Runtime progress is indeterminate");
    expect(html).toContain("indeterminate");
    expect(html).not.toContain("aria-valuenow");
  });
  it("renders a real reported percentage", () => {
    const html = renderToStaticMarkup(<RuntimeJobProgressCard job={job(0.5)} />);
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain("50%");
  });
});
