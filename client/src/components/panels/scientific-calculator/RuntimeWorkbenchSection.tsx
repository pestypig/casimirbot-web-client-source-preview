import React, { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTheoryRuntimeJobStore } from "@/store/useTheoryRuntimeJobStore";
import {
  readTheoryRuntimeJobResult,
  readTheoryRuntimeJobStatus,
  startTheoryRuntimeJobFromLaunch,
} from "@/lib/theory/runtimeJobsApi";
import { RuntimeJobProgressCard } from "./RuntimeJobProgressCard";
import { RuntimeResultReport } from "./RuntimeResultReport";
import { RuntimeResultActions } from "./RuntimeResultActions";
import { RuntimeRunHistory } from "./RuntimeRunHistory";

export function RuntimeWorkbenchSection() {
  const {
    selectedSetup,
    selectedSource,
    selectedRequestId,
    recentRequestIds,
    jobsByRequestId,
    upsertJob,
    attachReceipt,
    selectRequest,
  } = useTheoryRuntimeJobStore();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const selected = selectedRequestId ? jobsByRequestId[selectedRequestId] ?? null : null;
  const pollable = selected && (
    !["completed", "failed", "timeout", "cancelled"].includes(selected.snapshot.request.status) ||
    (!selected.snapshot.result.available && !selected.snapshot.result.errorCode)
  );

  useEffect(() => {
    if (!selectedRequestId || !pollable) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const snapshot = await readTheoryRuntimeJobStatus(selectedRequestId);
        if (cancelled) return;
        setError(null);
        upsertJob(snapshot);
        if (snapshot.result.available) {
          const result = await readTheoryRuntimeJobResult(selectedRequestId);
          if (!cancelled) {
            setError(null);
            upsertJob(result.job);
            attachReceipt(selectedRequestId, result.receipt);
          }
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Runtime status failed.");
      }
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 1200);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [attachReceipt, pollable, selectedRequestId, upsertJob]);

  useEffect(() => {
    if (!selectedRequestId || !selected?.snapshot.result.available || selected.receipt) return;
    let cancelled = false;
    void readTheoryRuntimeJobResult(selectedRequestId).then((result) => {
      if (!cancelled) {
        setError(null);
        upsertJob(result.job);
        attachReceipt(selectedRequestId, result.receipt);
      }
    }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Runtime result failed."); });
    return () => { cancelled = true; };
  }, [attachReceipt, selected?.receipt, selected?.snapshot.result.available, selectedRequestId, upsertJob]);

  const outputGlobs = useMemo(() => selectedSetup?.outputArtifactGlobs.slice(0, 4) ?? [], [selectedSetup]);
  const start = async () => {
    if (!selectedSetup) return;
    setError(null);
    setStarting(true);
    try {
      upsertJob(await startTheoryRuntimeJobFromLaunch(selectedSetup));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Runtime start failed.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="scientific-calculator-runtime-job-workbench">
      {selectedSetup ? (
        <div className="rounded border border-violet-800/70 bg-slate-950/60 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-violet-300">Loaded runtime command</div>
              <div className="mt-1 font-semibold text-slate-100">{selectedSetup.label}</div>
              <div className="mt-1 break-all font-mono text-xs text-violet-100">{selectedSetup.command}</div>
            </div>
            <Badge variant="outline" className="border-violet-700 text-violet-100">{selectedSetup.requestedScope}</Badge>
          </div>
          <p className="mt-2 text-xs text-slate-300">{selectedSetup.description}</p>
          <div className="mt-2 text-[11px] text-slate-400">Source: {selectedSource?.docPath ?? "unknown"}{selectedSource?.anchor ? `#${selectedSource.anchor}` : ""}</div>
          {outputGlobs.length ? <div className="mt-2 text-[11px] text-slate-400">Expected outputs: {outputGlobs.join(", ")}</div> : null}
          <div className="mt-2 rounded border border-amber-900/60 bg-amber-950/20 p-2 text-[11px] text-amber-100">
            Claim boundary: {selectedSetup.claimBoundary.currentTier}; promotion is not automatic. {selectedSetup.claimBoundary.promotionRequires.join("; ")}
          </div>
          <Button data-helix-control-id="workstation.panel.scientific-calculator.runtime-workbench-section.void-start" data-helix-interaction-kind="act" data-helix-authority-state="client_local" className="mt-3 bg-violet-600 hover:bg-violet-700" size="sm" onClick={() => void start()} disabled={starting || Boolean(selected && ["queued", "running"].includes(selected.snapshot.request.status))}>
            {starting ? "Starting…" : "Run registered command"}
          </Button>
        </div>
      ) : (
        <div className="rounded border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">Open a registered runtime command from Docs to load it here.</div>
      )}
      {error ? <div className="rounded border border-rose-800/70 bg-rose-950/20 p-2 text-xs text-rose-100" role="alert">{error}</div> : null}
      {selected ? <RuntimeJobProgressCard job={selected.snapshot} /> : null}
      {selected?.receipt ? <><RuntimeResultReport job={selected.snapshot} receipt={selected.receipt} /><RuntimeResultActions job={selected.snapshot} receipt={selected.receipt} /></> : null}
      <RuntimeRunHistory recentRequestIds={recentRequestIds} jobsByRequestId={jobsByRequestId} selectedRequestId={selectedRequestId} onSelect={selectRequest} />
    </div>
  );
}
