import { useEffect, useState } from "react";
import { Bug, ExternalLink, MessageSquare } from "lucide-react";
import {
  useHelixMissionMemoryStore,
  type HelixMissionMemoryState,
} from "@/store/useHelixMissionMemoryStore";

export function HelixMissionReadoutCard({
  threadId,
  onOpenSituation,
  onAskHelix,
}: {
  threadId: string;
  onOpenSituation?: () => void;
  onAskHelix?: (prompt: string) => void;
}) {
  const [debugOpen, setDebugOpen] = useState(false);
  const memory = useHelixMissionMemoryStore(
    (state: HelixMissionMemoryState) => state.memoryByThread[threadId] ?? null,
  );
  const diagnostics = useHelixMissionMemoryStore(
    (state: HelixMissionMemoryState) => state.diagnosticsByThread[threadId] ?? null,
  );
  const loadMissionMemory = useHelixMissionMemoryStore(
    (state: HelixMissionMemoryState) => state.loadMissionMemory,
  );

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (!cancelled) void loadMissionMemory(threadId);
    };
    load();
    const interval = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [loadMissionMemory, threadId]);

  if (!memory || memory.status !== "active") return null;

  return (
    <section className="mb-2 rounded-lg border border-cyan-300/20 bg-slate-900/80 p-3 text-xs text-slate-100 shadow-lg shadow-black/20">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-200">
            Minecraft Situation: Active · {memory.mode}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">{memory.objective}</div>
        </div>
        <button
          type="button"
          onClick={() => setDebugOpen((value: boolean) => !value)}
          className="inline-flex h-8 w-8 items-center justify-center rounded border border-white/10 text-slate-300 hover:bg-white/10"
          aria-label="Toggle mission memory diagnostics"
        >
          <Bug className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <div className="mt-3 space-y-1.5">
        <p><span className="text-slate-400">Now:</span> {memory.now_line}</p>
        <p><span className="text-slate-400">Goal:</span> {memory.goal_line.replace(/^Goal:\s*/i, "")}</p>
        <p><span className="text-slate-400">Risk:</span> {memory.risk_line.replace(/^Risk:\s*/i, "")}</p>
        <p><span className="text-slate-400">Last:</span> {memory.last_decision_line.replace(/^Last decision:\s*/i, "")}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onOpenSituation}
          className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[11px] text-slate-200 hover:bg-white/10"
        >
          <ExternalLink className="h-3 w-3" aria-hidden />
          Open Situation
        </button>
        <button
          type="button"
          onClick={() => onAskHelix?.("What is my current Minecraft situation, and what should I watch next?")}
          className="inline-flex items-center gap-1 rounded border border-cyan-300/25 px-2 py-1 text-[11px] text-cyan-100 hover:bg-cyan-400/10"
        >
          <MessageSquare className="h-3 w-3" aria-hidden />
          Ask about this
        </button>
      </div>
      {debugOpen ? (
        <div className="mt-3 rounded border border-white/10 bg-black/20 p-2 text-[11px] text-slate-400">
          <div>Updated: {memory.updated_at}</div>
          <div>Thread: {memory.thread_id}</div>
          <div>Session: {memory.session_id}</div>
          <div>Load: {diagnostics?.last_fetch_error ?? diagnostics?.last_loaded_at ?? "pending"}</div>
          <div>{memory.unknowns_line}</div>
        </div>
      ) : null}
    </section>
  );
}
