import React from "react";
import type {
  LivePipelineSinkSpec,
  LivePipelineTransformSpec,
  LiveWorkstationPipeline,
} from "@shared/helix-live-workstation-pipeline";

export function LivePipelineDebugTrace({ pipeline }: { pipeline: LiveWorkstationPipeline }) {
  return (
    <details className="mt-2 text-[10px] text-slate-400">
      <summary className="cursor-pointer text-slate-300">Debug</summary>
      <pre className="mt-1 max-h-40 overflow-auto rounded bg-black/30 p-2">
        {JSON.stringify({
          pipeline_id: pipeline.pipeline_id,
          environment_id: pipeline.environment_id ?? null,
          source_ids: pipeline.source_ids,
          transforms: pipeline.transforms.map((transform: LivePipelineTransformSpec) => transform.transform_id),
          sinks: pipeline.sinks.map((sink: LivePipelineSinkSpec) => sink.sink_id),
          raw_logs_included: false,
          raw_transcript_included: false,
          deterministic_content_role: pipeline.deterministic_content_role,
        }, null, 2)}
      </pre>
    </details>
  );
}
