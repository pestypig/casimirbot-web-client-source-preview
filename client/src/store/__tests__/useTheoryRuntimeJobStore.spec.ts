import { beforeEach, describe, expect, it } from "vitest";
import { buildTheoryRuntimeJobSnapshotV1 } from "@shared/contracts/theory-runtime-job.v1";
import { buildTheoryRuntimeRunRequestV1 } from "@shared/contracts/theory-runtime-run-request.v1";
import { useTheoryRuntimeJobStore } from "../useTheoryRuntimeJobStore";

const snapshot = (index: number) => buildTheoryRuntimeJobSnapshotV1({
  jobId: `req:${index}`,
  request: buildTheoryRuntimeRunRequestV1({ requestId: `req:${index}`, runtimeId: "solar.manifest", graphId: "graph", badgeIds: [], args: {}, requestedScope: "quick", status: "queued", createdAt: "2026-07-14T00:00:00.000Z", updatedAt: "2026-07-14T00:00:00.000Z", heartbeat: { updatedAt: "2026-07-14T00:00:00.000Z", stage: "queued", message: "queued", progress: 0 }, outputArtifactGlobs: [], claimBoundary: { currentTier: "diagnostic", maximumTier: "diagnostic", promotionAllowed: false, promotionRequires: [] } }),
  result: { available: false, receiptId: null, errorCode: null, errorMessage: null },
});

describe("useTheoryRuntimeJobStore", () => {
  beforeEach(() => useTheoryRuntimeJobStore.setState({ selectedSetup: null, selectedSource: null, selectedRequestId: null, recentRequestIds: [], jobsByRequestId: {}, activeContext: null }));
  it("caps persisted runtime history at twenty exact request references", () => {
    for (let index = 0; index < 25; index += 1) useTheoryRuntimeJobStore.getState().upsertJob(snapshot(index));
    expect(useTheoryRuntimeJobStore.getState().recentRequestIds).toHaveLength(20);
    expect(Object.keys(useTheoryRuntimeJobStore.getState().jobsByRequestId)).toHaveLength(20);
    expect(useTheoryRuntimeJobStore.getState().selectedRequestId).toBe("req:24");
  });
});
