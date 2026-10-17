import type { MirekAnchorInput, MirekReasoningArtifactV1 } from "@shared/helix-reasoning-mirek";
import { hash32 } from "@/lib/helix/ask-stable-hash";
import { asObjectRecord, clampNumber, dedupeStrings } from "@/lib/helix/ask-value-normalization";

const MIREK_EVIDENCE_PATH_KEYS = [
  "path",
  "source_path",
  "sourcePath",
  "file",
  "filePath",
  "href",
  "uri",
  "ref",
];

const MIREK_EVIDENCE_ARRAY_KEYS = [
  "context_files",
  "prompt_context_files",
  "evidence_refs",
  "selected_validation_refs",
  "contextFiles",
  "evidenceRefs",
  "sources",
  "citations",
  "retrieval_paths",
  "retrievalPaths",
];

export function isMirekEvidencePath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 260) return false;
  return (
    /[\\/]/.test(trimmed) ||
    /\.(?:md|mdx|txt|json|jsonl|ts|tsx|js|jsx|py|html|css|ya?ml|pdf|csv)$/i.test(trimmed) ||
    /^(?:client|server|shared|docs|tests|scripts|configs|public)\b/i.test(trimmed)
  );
}

export function collectMirekEvidencePathsFromValue(value: unknown, depth = 0): string[] {
  if (depth > 3 || value == null) return [];
  if (typeof value === "string") {
    return isMirekEvidencePath(value) ? [value.trim()] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectMirekEvidencePathsFromValue(entry, depth + 1));
  }
  const record = asObjectRecord(value);
  if (!record) return [];
  const paths: string[] = [];
  for (const key of MIREK_EVIDENCE_PATH_KEYS) {
    paths.push(...collectMirekEvidencePathsFromValue(record[key], depth + 1));
  }
  for (const key of MIREK_EVIDENCE_ARRAY_KEYS) {
    paths.push(...collectMirekEvidencePathsFromValue(record[key], depth + 1));
  }
  return paths;
}

export function collectMirekEvidencePathsFromLiveEvents(
  events: Array<{ meta?: unknown; text?: unknown }>,
): string[] {
  return dedupeStrings(
    events.flatMap((event) => [
      ...collectMirekEvidencePathsFromValue(event.meta),
      ...collectMirekEvidencePathsFromValue(event.text),
    ]),
  );
}

export function buildMirekEvidenceAnchors(paths: string[]): MirekAnchorInput[] {
  return dedupeStrings(paths)
    .slice(0, 12)
    .map((path, index) => ({
      id: `evidence:${hash32(path).toString(16)}:${index}`,
      role: "evidence",
      path,
      weight: clampNumber(1 - index * 0.045, 0, 1),
      exact: true,
    }));
}

export function calculateMirekSharedExactPathRatio(
  anchors: MirekAnchorInput[],
  previousArtifact: MirekReasoningArtifactV1 | null,
): number {
  const currentPaths = new Set(
    anchors
      .filter((anchor) => anchor.role === "evidence" && anchor.exact && anchor.path)
      .map((anchor) => anchor.path!.toLowerCase()),
  );
  if (currentPaths.size === 0 || !previousArtifact) return 0;
  const previousPaths = new Set(
    previousArtifact.anchors
      .filter((anchor) => anchor.role === "evidence" && anchor.exact && anchor.path)
      .map((anchor) => anchor.path!.toLowerCase()),
  );
  if (previousPaths.size === 0) return 0;
  let shared = 0;
  for (const path of currentPaths) {
    if (previousPaths.has(path)) shared += 1;
  }
  return clampNumber(shared / Math.max(1, currentPaths.size), 0, 1);
}
