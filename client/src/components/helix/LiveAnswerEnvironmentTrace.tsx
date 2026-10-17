import React from "react";
import type { LiveAnswerEnvironmentDelta } from "@shared/helix-live-answer-environment";

export function LiveAnswerEnvironmentTrace({ deltas = [] }: { deltas?: LiveAnswerEnvironmentDelta[] }) {
  if (deltas.length === 0) {
    return (
      <div className="rounded border border-white/10 bg-black/20 px-2 py-1.5 text-[11px] text-slate-400">
        No live line deltas yet.
      </div>
    );
  }
  return (
    <div className="space-y-1.5 rounded border border-white/10 bg-black/20 p-2">
      {deltas.slice(-6).reverse().map((delta: LiveAnswerEnvironmentDelta) => (
        <div key={delta.delta_id} className="rounded border border-white/10 bg-slate-950/60 px-2 py-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{delta.reason}</span>
            <span className="text-[10px] text-slate-500">{new Date(delta.ts).toLocaleTimeString()}</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-300">
            Changed: {(delta.changed_fields ?? delta.changed_line_keys).join(", ") || "line state"}
          </p>
          <p className="mt-1 text-[10px] text-slate-500">
            window {delta.window_id ?? "none"} / events {delta.source_event_count ?? "n/a"} / model {delta.model_invoked ? "yes" : "no"}
          </p>
          <p className="mt-1 text-[10px] text-slate-500">
            context {delta.context_policy ?? "compact_context_pack_only"} / raw logs false
          </p>
          <p className="mt-1 break-all text-[10px] text-slate-500">
            hash {delta.previous_hash ?? "none"} -&gt; {delta.next_hash}
          </p>
        </div>
      ))}
    </div>
  );
}
