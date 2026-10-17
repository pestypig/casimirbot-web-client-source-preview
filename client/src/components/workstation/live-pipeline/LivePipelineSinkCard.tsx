import React from "react";
import type { LivePipelineSinkSpec } from "@shared/helix-live-workstation-pipeline";

export function LivePipelineSinkCard({ sink }: { sink: LivePipelineSinkSpec }) {
  return (
    <div className="rounded border border-white/10 bg-black/20 p-2">
      <p className="font-medium text-slate-100">{sink.title}</p>
      <p className="text-[10px] text-slate-400">
        {sink.kind} · {sink.write_policy} · {sink.target_id ?? "pending target"}
      </p>
    </div>
  );
}
