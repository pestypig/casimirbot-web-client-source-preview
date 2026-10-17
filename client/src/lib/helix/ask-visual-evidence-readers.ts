export const HELIX_VISUAL_DIAGNOSTIC_SUMMARY_PATTERN =
  /\b(?:visual\s+frame\s+was\s+recorded|no\s+configured\s+vision\s+provider|configured\s+vision\s+provider\s+did\s+not\s+return|did\s+not\s+return\s+an?\s+image\s+description|did\s+not\s+produce\s+usable\s+visual\s+evidence|waiting\s+for\s+image\s+recognition|vision_provider_[a-z_]+|provider\s+(?:missing|failed|unavailable)|analysis_failed|capture\s+(?:and\s+analyze\s+)?(?:a\s+)?fresh\s+frame|recover\s+the\s+vision\s+provider)\b/i;

export function readVisualEvidenceSummary(record: Record<string, unknown> | null | undefined): string | null {
  const evidence = record?.evidence;
  const evidenceRecord = evidence && typeof evidence === "object" ? (evidence as Record<string, unknown>) : null;
  const directSummary = typeof record?.summary === "string" ? record.summary.trim() : "";
  const nestedSummary = typeof evidenceRecord?.summary === "string" ? evidenceRecord.summary.trim() : "";
  return directSummary || nestedSummary || null;
}

export function isDiagnosticVisualEvidence(record: Record<string, unknown> | null | undefined): boolean {
  const summary = readVisualEvidenceSummary(record);
  return Boolean(summary && HELIX_VISUAL_DIAGNOSTIC_SUMMARY_PATTERN.test(summary));
}
