import React from "react";

import type { LiveSituationArtifactDelta } from "@shared/helix-live-situation-artifact";

export function LiveSituationDeltaTrace({
  deltas,
}: {
  deltas: LiveSituationArtifactDelta[];
}) {
  if (deltas.length === 0) {
    return (
      <div className="rounded border border-white/10 bg-black/20 p-2 text-[11px] text-slate-400">
        No artifact deltas recorded yet.
      </div>
    );
  }

  return (
    <div className="space-y-1.5 rounded border border-white/10 bg-black/20 p-2 text-[11px] text-slate-300">
      {deltas.slice(-6).reverse().map((delta) => (
        <div key={delta.delta_id} className="rounded border border-white/10 bg-slate-950/50 p-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-slate-100">{delta.reason.replace(/_/g, " ")}</span>
            <span className="text-slate-500">{new Date(delta.ts).toLocaleTimeString()}</span>
          </div>
          <div className="mt-1 text-slate-400">
            Changed: {delta.changed_fields.join(", ") || "updated_at"}
          </div>
          <div className="mt-1 truncate text-slate-500">Hash: {delta.next_hash}</div>
          {delta.evidence_refs.length > 0 ? (
            <div className="mt-1 truncate text-slate-500">
              Evidence: {delta.evidence_refs.slice(0, 3).join(", ")}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
