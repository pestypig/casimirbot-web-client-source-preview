export type DebateRole = "proponent" | "skeptic" | "referee";

export type ToolLogEvent = {
  id: number | string;
  at: string;
  traceId?: string;
  stepId?: string;
  tool: string;
  status: "ok" | "error" | "info";
  text: string;
  essenceIds: string[];
  latency_ms?: number;
  debateId?: string;
  stage?: string;
  detail?: string;
  message?: string;
  meta?: Record<string, unknown>;
};

export function roleFromTool(tool?: string): DebateRole {
  const t = (tool || "").toLowerCase();
  // Skeptic = explicit verification / checkers
  if (t.includes("skeptic")) return "skeptic";
  if (t.startsWith("verifier:")) return "skeptic";
  if (t.includes("verify") || t.includes("checker") || t.includes("sympy")) return "skeptic";
  // Proponent = proposing/creating/generating evidence
  if (t.includes("proponent")) return "proponent";
  if (t.startsWith("solver:")) return "proponent";
  if (
    t.startsWith("llm.") ||
    t.startsWith("luma.") ||
    t.startsWith("noise.") ||
    t.startsWith("docs.readme")
  )
    return "proponent";
  if (t.startsWith("stt.") || t.startsWith("ingest")) return "proponent";
  // Unknown / orchestration / approvals → referee
  return "referee";
}

export function normalizeEvent(e: any, activeTraceId?: string): ToolLogEvent | null {
  // Supports current tool-log SSE shape: {time, traceId, tool, status, text, essenceIds?, stepId?, latency_ms?}
  if (activeTraceId && e?.traceId && e.traceId !== activeTraceId) return null;
  const message =
    typeof e?.message === "string" && e.message.trim()
      ? e.message
      : typeof e?.text === "string" && e.text.trim()
        ? e.text
        : e?.stage
          ? e.detail
            ? `${e.stage}: ${e.detail}`
            : e.stage
          : JSON.stringify(e);
  return {
    id: e?.id ?? Date.now(),
    at: e?.time ?? new Date().toISOString(),
    traceId: e?.traceId,
    stepId: e?.stepId,
    tool: e?.tool ?? "tool",
    status: (e?.status === "ok" || e?.ok) ? "ok" : (e?.status === "error" ? "error" : "info"),
    text: message,
    essenceIds: Array.isArray(e?.essenceIds) ? e.essenceIds : [],
    latency_ms: e?.latency_ms,
    debateId: typeof e?.debateId === "string" ? e.debateId : undefined,
    stage: e?.stage,
    detail: e?.detail,
    message: e?.message,
    meta: e?.meta,
  };
}
