import React from "react";
import { ListTree, Trash2 } from "lucide-react";
import { useWorkstationWorkflowTimelineStore } from "@/store/useWorkstationWorkflowTimelineStore";

function formatWhen(value: string): string {
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleTimeString();
}

function laneTone(lane: string): string {
  switch (lane) {
    case "procedural":
      return "border-cyan-300/35 bg-cyan-500/10 text-cyan-100";
    case "clipboard":
      return "border-emerald-300/35 bg-emerald-500/10 text-emerald-100";
    case "notes":
      return "border-amber-300/35 bg-amber-500/10 text-amber-100";
    case "chat":
    default:
      return "border-indigo-300/35 bg-indigo-500/10 text-indigo-100";
  }
}

export default function WorkstationWorkflowTimelinePanel() {
  const entries = useWorkstationWorkflowTimelineStore((state) => state.entries);
  const clear = useWorkstationWorkflowTimelineStore((state) => state.clear);

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-100">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ListTree className="h-4 w-4" />
          Workflow Timeline
        </div>
        <button
          type="button"
          onClick={clear}
          className="inline-flex items-center gap-1 rounded border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-xs text-rose-200 hover:bg-rose-500/20"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {entries.length === 0 ? (
          <p className="p-3 text-xs text-slate-400">No workflow events yet.</p>
        ) : (
          <div className="space-y-2 p-3">
            {entries.map((entry) => (
              <div key={entry.id} className="rounded border border-white/10 bg-black/20 p-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] ${laneTone(entry.lane)}`}>
                    {entry.lane}
                  </span>
                  <span className="text-[11px] text-slate-400">{formatWhen(entry.ts)}</span>
                  {entry.step ? <span className="text-[10px] text-slate-500">step={entry.step}</span> : null}
                </div>
                <p className="mt-1 text-slate-100">{entry.label}</p>
                {entry.detail ? <p className="mt-1 break-words text-[11px] text-slate-400">{entry.detail}</p> : null}
                {(entry.traceId || entry.panelId) ? (
                  <p className="mt-1 break-words text-[10px] text-slate-500">
                    {entry.traceId ? `trace=${entry.traceId}` : ""}
                    {entry.traceId && entry.panelId ? " · " : ""}
                    {entry.panelId ? `panel=${entry.panelId}` : ""}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
