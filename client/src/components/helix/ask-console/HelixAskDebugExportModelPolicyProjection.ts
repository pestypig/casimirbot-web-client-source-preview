function coerceDebugText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readDebugRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function mergeRenderedLanguageModelPolicySummaryIntoDebugExport(
  exportPayload: string,
  clickedTurnScope: { modelPolicyDebugSummary?: string | null } | null | undefined,
): string {
  const summary = coerceDebugText(clickedTurnScope?.modelPolicyDebugSummary).trim();
  if (!/^AI:\s*/i.test(summary)) return exportPayload;
  try {
    const parsed = JSON.parse(exportPayload) as Record<string, unknown>;
    if (!coerceDebugText(parsed.language_model_debug_summary).trim()) {
      parsed.language_model_debug_summary = summary;
    }
    if (!coerceDebugText(parsed.model_policy_debug_summary).trim()) {
      parsed.model_policy_debug_summary = summary;
    }
    const debugRecord = readDebugRecord(parsed.debug);
    parsed.debug = {
      ...(debugRecord ?? {}),
      language_model_debug_summary:
        coerceDebugText(debugRecord?.language_model_debug_summary).trim() || summary,
      model_policy_debug_summary:
        coerceDebugText(debugRecord?.model_policy_debug_summary).trim() || summary,
    };
    return JSON.stringify(parsed, null, 2);
  } catch {
    return exportPayload;
  }
}
