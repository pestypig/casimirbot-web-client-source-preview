import {
  extractContextCapsuleIdsFromText,
  renderContextCapsuleStampLines,
  type ContextCapsuleSummary,
} from "@shared/helix-context-capsule";
import type { ConvergenceStripState } from "@/lib/helix/reasoning-theater-convergence";

export type SessionCapsuleConfidenceBand = "reinforcing" | "building" | "uncertain";

export const SESSION_CAPSULE_CONFIDENCE_LABEL: Record<SessionCapsuleConfidenceBand, string> = {
  reinforcing: "reinforcing",
  building: "building",
  uncertain: "uncertain",
};

export function resolveSessionCapsuleConfidenceBand(
  summary: ContextCapsuleSummary,
): SessionCapsuleConfidenceBand {
  if (
    summary.convergence.proofPosture === "fail_closed" ||
    summary.commit.proof_verdict === "FAIL" ||
    summary.commit.certificate_integrity_ok === false
  ) {
    return "uncertain";
  }
  if (summary.convergence.proofPosture === "confirmed") {
    return "reinforcing";
  }
  if (
    summary.convergence.proofPosture === "reasoned" &&
    (summary.commit.proof_verdict === "PASS" || summary.convergence.maturity === "certified")
  ) {
    return "reinforcing";
  }
  if (
    summary.convergence.proofPosture === "reasoned" ||
    summary.convergence.proofPosture === "hypothesis" ||
    summary.convergence.maturity === "diagnostic" ||
    summary.convergence.maturity === "certified"
  ) {
    return "building";
  }
  return "uncertain";
}

export function stripContextCapsuleTokensFromText(value: string): string {
  const ids = extractContextCapsuleIdsFromText(value);
  if (ids.length === 0) return value.trim();
  let next = value;
  for (const id of ids) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(new RegExp(`\\b${escaped}\\b`, "gi"), " ");
  }
  return next.replace(/\s{2,}/g, " ").trim();
}

export function resolveContextCapsulePalette(state: ConvergenceStripState): {
  r: number;
  g: number;
  b: number;
} {
  if (state.proof === "fail_closed") return { r: 239, g: 68, b: 68 };
  if (state.source === "open_world") return { r: 244, g: 114, b: 182 };
  if (state.source === "atlas_exact") return { r: 34, g: 211, b: 238 };
  if (state.source === "repo_exact") return { r: 56, g: 189, b: 248 };
  return { r: 148, g: 163, b: 184 };
}

export function buildContextCapsuleCopyText(summary: ContextCapsuleSummary): string {
  const proofTag = summary.commit.proof_verdict ?? "UNKNOWN";
  const sourceTag = summary.convergence.source;
  const stampLines = renderContextCapsuleStampLines({
    bits: summary.stamp.finalBits,
    width: summary.stamp.gridW,
    height: summary.stamp.gridH,
    targetWidth: 10,
    targetHeight: 3,
  });
  return [
    ...stampLines,
    `proof:${proofTag}  src:${sourceTag}`,
  ].join("\n");
}

export function buildContextCapsuleStampDataUri(
  stamp: ContextCapsuleSummary["stamp"],
  options?: { onColor?: string; offColor?: string },
): string {
  const width = Math.max(1, Math.floor(stamp.gridW));
  const height = Math.max(1, Math.floor(stamp.gridH));
  const bits = typeof stamp.finalBits === "string" ? stamp.finalBits : "";
  const total = width * height;
  const onColor = options?.onColor ?? "#D4F4FF";
  const offColor = options?.offColor ?? "#071525";
  const rects: string[] = [];
  for (let i = 0; i < total; i += 1) {
    if (bits[i] !== "1") continue;
    const x = i % width;
    const y = Math.floor(i / width);
    rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${onColor}" />`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges"><rect width="${width}" height="${height}" fill="${offColor}" />${rects.join("")}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
