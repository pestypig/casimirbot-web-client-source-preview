import React from "react";
import type {
  LivePipelineSinkSpec,
  LivePipelineTransformSpec,
  LiveWorkstationPipeline,
} from "@shared/helix-live-workstation-pipeline";
import { LivePipelineTransformCard } from "@/components/workstation/live-pipeline/LivePipelineTransformCard";
import { LivePipelineSinkCard } from "@/components/workstation/live-pipeline/LivePipelineSinkCard";

export function LivePipelineGraph({ pipeline }: { pipeline: LiveWorkstationPipeline }) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-slate-100">{pipeline.objective}</p>
          <p className="text-[10px] text-slate-400">
            {pipeline.pipeline_id} · {pipeline.status} · sources {pipeline.source_ids.length}
          </p>
        </div>
        <span className="rounded border border-cyan-300/25 bg-cyan-400/10 px-2 py-0.5 text-[10px] text-cyan-100">
          {pipeline.window_policy.mode}
        </span>
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-2">
        <div className="grid gap-1">
          {pipeline.transforms.map((transform: LivePipelineTransformSpec) => (
            <LivePipelineTransformCard key={transform.transform_id} transform={transform} />
          ))}
        </div>
        <div className="grid gap-1">
          {pipeline.sinks.map((sink: LivePipelineSinkSpec) => (
            <LivePipelineSinkCard key={sink.sink_id} sink={sink} />
          ))}
        </div>
      </div>
    </div>
  );
}
