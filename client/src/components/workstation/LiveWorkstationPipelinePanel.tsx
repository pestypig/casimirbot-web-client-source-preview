import React, { useEffect } from "react";
import {
  selectActiveLiveWorkstationPipelines,
  useLiveWorkstationPipelineStore,
} from "@/store/useLiveWorkstationPipelineStore";
import { LivePipelineGraph } from "@/components/workstation/live-pipeline/LivePipelineGraph";
import { LivePipelineDebugTrace } from "@/components/workstation/live-pipeline/LivePipelineDebugTrace";

export function LiveWorkstationPipelinePanel() {
  const pipelines = useLiveWorkstationPipelineStore(selectActiveLiveWorkstationPipelines);
  const allPipelines = useLiveWorkstationPipelineStore((state) => state.pipelines);
  const lastError = useLiveWorkstationPipelineStore((state) => state.last_fetch_error);
  const load = useLiveWorkstationPipelineStore((state) => state.loadPipelines);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/50 p-3 text-xs text-slate-100">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Live Workstation Pipelines</h3>
          <p className="text-[11px] text-slate-400">Transforms and sinks for live sources.</p>
        </div>
        <span className="rounded border border-white/10 px-2 py-1 text-[10px] text-slate-300">
          active {pipelines.length}
        </span>
      </div>
      {lastError ? <p className="mt-2 text-[11px] text-rose-300">{lastError}</p> : null}
      <div className="mt-3 grid gap-2">
        {allPipelines.length === 0 ? (
          <p className="text-[11px] text-slate-400">No live workstation pipelines yet.</p>
        ) : (
          allPipelines.map((pipeline) => (
            <div key={pipeline.pipeline_id} className="rounded border border-white/10 bg-white/[0.03] p-2">
              <LivePipelineGraph pipeline={pipeline} />
              <LivePipelineDebugTrace pipeline={pipeline} />
            </div>
          ))
        )}
      </div>
    </section>
  );
}
