import React from "react";
import type { LivePipelineTransformSpec } from "@shared/helix-live-workstation-pipeline";

export function LivePipelineTransformCard({ transform }: { transform: LivePipelineTransformSpec }) {
  return (
    <div className="rounded border border-white/10 bg-black/20 p-2">
      <p className="font-medium text-slate-100">{transform.title}</p>
      <p className="text-[10px] text-slate-400">
        {transform.kind} · {transform.model_policy} · {transform.output_role}
      </p>
    </div>
  );
}
