import { describe, expect, it } from "vitest";
import { buildTheoryRuntimeJobSnapshotV1 } from "@shared/contracts/theory-runtime-job.v1";
import { buildTheoryRuntimeRunRequestV1 } from "@shared/contracts/theory-runtime-run-request.v1";
import { buildTheoryRuntimeReceiptV1 } from "@shared/contracts/theory-runtime-receipt.v1";
import { formatTheoryRuntimeReportJson, formatTheoryRuntimeReportMarkdown } from "../runtimeReport";

it("formats a copyable structured runtime report with gates and claim boundaries", () => {
  const now = "2026-07-14T12:00:00.000Z";
  const request = buildTheoryRuntimeRunRequestV1({ generatedAt: now, requestId: "req", runtimeId: "physics.validate", graphId: "graph", badgeIds: [], args: {}, requestedScope: "quick", status: "completed", createdAt: now, updatedAt: now, heartbeat: { updatedAt: now, stage: "completed", message: "done", progress: 1 }, outputArtifactGlobs: [], claimBoundary: { currentTier: "diagnostic", maximumTier: "diagnostic", promotionAllowed: false, promotionRequires: [] } });
  const job = buildTheoryRuntimeJobSnapshotV1({ jobId: "req", request, result: { available: true, receiptId: "receipt", errorCode: null, errorMessage: null } });
  const receipt = buildTheoryRuntimeReceiptV1({ generatedAt: now, receiptId: "receipt", runtimeId: "physics.validate", graphId: "graph", badgeIds: [], command: "npm run physics:validate", args: {}, status: "completed", outputs: { artifacts: ["a.json"], scalars: { residual: 0.2 }, units: { residual: "1" }, gates: { hard_gate: "fail" }, missingSignals: ["certificate"], warnings: ["diagnostic only"] }, provenance: { gitSha: null, startedAt: now, completedAt: now, durationMs: 10 }, claimBoundary: { currentTier: "diagnostic", maximumTier: "diagnostic", promotionAllowed: false, promotionBlockedBy: ["human_review"] } });
  const markdown = formatTheoryRuntimeReportMarkdown({ job, receipt });
  expect(markdown).toContain("residual: 0.2 1");
  expect(markdown).toContain("hard_gate: fail");
  expect(markdown).toContain("human_review");
  expect(JSON.parse(formatTheoryRuntimeReportJson({ job, receipt })).receipt.receiptId).toBe("receipt");
});
