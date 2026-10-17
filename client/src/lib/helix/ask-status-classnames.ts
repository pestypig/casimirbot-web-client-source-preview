import type { HelixTurnTranscriptRow } from "@/lib/helix/ask-turn-transcript";

export function readProceduralStatusClass(status: string): string {
  if (status === "completed") return "border-emerald-300/35 bg-emerald-400/10 text-emerald-50";
  if (status === "canceled") return "border-slate-300/25 bg-slate-400/10 text-slate-200";
  if (status === "running") return "animate-pulse border-sky-300/35 bg-sky-400/10 text-sky-50";
  if (status === "suppressed") return "border-amber-300/35 bg-amber-400/10 text-amber-50";
  if (status === "failed") return "border-rose-300/35 bg-rose-400/10 text-rose-50";
  if (status === "pending_input") return "border-blue-300/35 bg-blue-400/10 text-blue-50";
  if (status === "planned") return "border-white/10 bg-white/5 text-slate-300";
  return "border-white/10 bg-white/5 text-slate-300";
}

export function readHelixCausalTraceRowClass(row: Pick<HelixTurnTranscriptRow, "label" | "status">): string {
  if (/\b(?:failed|blocked)\b/i.test(row.status)) {
    return "border-amber-300/30 bg-amber-950/20 text-amber-50";
  }
  if (row.label === "Final" || row.label === "Terminal") {
    return "border-violet-300/25 bg-violet-950/15 text-violet-50";
  }
  if (row.label === "Observation") {
    return "border-emerald-300/25 bg-emerald-950/15 text-emerald-50";
  }
  if (row.label === "Gate") {
    return "border-cyan-300/25 bg-cyan-950/15 text-cyan-50";
  }
  return "border-slate-600/30 bg-black/15 text-slate-100";
}
