import React from "react";
import { Button } from "@/components/ui/button";
import type { TheoryRuntimeJobRecord } from "@/store/useTheoryRuntimeJobStore";

export function RuntimeRunHistory({
  recentRequestIds,
  jobsByRequestId,
  selectedRequestId,
  onSelect,
}: {
  recentRequestIds: string[];
  jobsByRequestId: Record<string, TheoryRuntimeJobRecord>;
  selectedRequestId: string | null;
  onSelect: (requestId: string) => void;
}) {
  if (!recentRequestIds.length) return null;
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Recent runtime jobs</div>
      <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
        {recentRequestIds.map((requestId) => {
          const job = jobsByRequestId[requestId];
          if (!job) return null;
          return <Button data-helix-control-id="workstation.panel.scientific-calculator.runtime-run-history.button" data-helix-interaction-kind="act" data-helix-authority-state="client_local" key={requestId} size="sm" variant={selectedRequestId === requestId ? "secondary" : "outline"} className="shrink-0" onClick={() => onSelect(requestId)} title={requestId}>{job.snapshot.request.runtimeId} · {job.snapshot.request.status}</Button>;
        })}
      </div>
    </div>
  );
}
