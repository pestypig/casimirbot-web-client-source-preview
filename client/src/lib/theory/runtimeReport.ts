import type { TheoryRuntimeJobSnapshotV1 } from "@shared/contracts/theory-runtime-job.v1";
import type { TheoryRuntimeReceiptV1 } from "@shared/contracts/theory-runtime-receipt.v1";

const scalarText = (value: number | string | boolean | null, unit: string | null | undefined) =>
  `${value === null ? "null" : String(value)}${unit ? ` ${unit}` : ""}`;

export function formatTheoryRuntimeReportMarkdown(input: {
  job: TheoryRuntimeJobSnapshotV1;
  receipt: TheoryRuntimeReceiptV1;
}): string {
  const { job, receipt } = input;
  const lines = [
    `# ${receipt.runtimeId} runtime report`,
    "",
    `- Request: ${job.jobId}`,
    `- Receipt: ${receipt.receiptId}`,
    `- Status: ${receipt.status}`,
    `- Command: ${receipt.command ?? "not recorded"}`,
    `- Duration: ${receipt.provenance.durationMs ?? "unknown"} ms`,
    `- Claim tier: ${receipt.claimBoundary.currentTier} (maximum ${receipt.claimBoundary.maximumTier})`,
    `- Claim promotion allowed: ${receipt.claimBoundary.promotionAllowed ? "yes" : "no"}`,
  ];
  const scalars = Object.entries(receipt.outputs.scalars);
  if (scalars.length) {
    lines.push("", "## Scalars", "");
    for (const [name, value] of scalars) lines.push(`- ${name}: ${scalarText(value, receipt.outputs.units[name])}`);
  }
  const gates = Object.entries(receipt.outputs.gates);
  if (gates.length) {
    lines.push("", "## Gates", "");
    for (const [name, status] of gates) lines.push(`- ${name}: ${status}`);
  }
  if (receipt.outputs.missingSignals.length) {
    lines.push("", "## Missing signals", "", ...receipt.outputs.missingSignals.map((item) => `- ${item}`));
  }
  if (receipt.outputs.warnings.length) {
    lines.push("", "## Warnings", "", ...receipt.outputs.warnings.map((item) => `- ${item}`));
  }
  if (receipt.outputs.artifacts.length) {
    lines.push("", "## Artifacts", "", ...receipt.outputs.artifacts.map((item) => `- ${item}`));
  }
  if (receipt.claimBoundary.promotionBlockedBy.length) {
    lines.push("", "## Claim boundary", "", ...receipt.claimBoundary.promotionBlockedBy.map((item) => `- ${item}`));
  }
  return lines.join("\n");
}

export function formatTheoryRuntimeReportJson(input: {
  job: TheoryRuntimeJobSnapshotV1;
  receipt: TheoryRuntimeReceiptV1;
}): string {
  return JSON.stringify({ job: input.job, receipt: input.receipt }, null, 2);
}
