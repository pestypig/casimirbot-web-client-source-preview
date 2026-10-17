import React from "react";
import { Badge } from "@/components/ui/badge";
import type { TheoryRuntimeJobSnapshotV1 } from "@shared/contracts/theory-runtime-job.v1";

export function RuntimeJobProgressCard({ job }: { job: TheoryRuntimeJobSnapshotV1 }) {
  const progress = job.request.heartbeat.progress;
  const percent = progress === null ? null : Math.round(progress * 100);
  return (
    <div className="rounded border border-violet-800/70 bg-slate-950/60 p-3" data-testid="theory-runtime-progress">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-violet-300">Runtime status</div>
          <div className="mt-1 font-mono text-xs text-violet-100">{job.jobId}</div>
        </div>
        <Badge variant="outline" className="border-violet-700 text-violet-100">{job.request.status}</Badge>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded bg-slate-800" role="progressbar"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}
        aria-label={percent === null ? "Runtime progress is indeterminate" : `Runtime progress ${percent}%`}>
        <div
          className={percent === null ? "h-full w-1/3 animate-pulse rounded bg-violet-500" : "h-full rounded bg-violet-500 transition-[width]"}
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11px] text-slate-300">
        <span>{job.request.heartbeat.stage ?? "queued"}: {job.request.heartbeat.message ?? "Waiting for runtime heartbeat."}</span>
        <span>{percent === null ? "indeterminate" : `${percent}%`}</span>
      </div>
    </div>
  );
}
