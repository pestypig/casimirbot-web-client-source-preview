import React from "react";
import { Badge } from "@/components/ui/badge";
import type { TheoryRuntimeJobSnapshotV1 } from "@shared/contracts/theory-runtime-job.v1";
import type { TheoryRuntimeReceiptV1 } from "@shared/contracts/theory-runtime-receipt.v1";
import { RuntimeReceiptStatusLamps } from "./RuntimeReceiptStatusLamps";

const displayValue = (value: unknown) => value === null ? "null" : String(value);

export function RuntimeResultReport({ job, receipt }: {
  job: TheoryRuntimeJobSnapshotV1;
  receipt: TheoryRuntimeReceiptV1;
}) {
  const stdoutSource = receipt.execution?.stdout ?? receipt.args.stdout;
  const stderrSource = receipt.execution?.stderr ?? receipt.args.stderr;
  const stdout = typeof stdoutSource === "string" ? stdoutSource.slice(0, 4000) : "";
  const stderr = typeof stderrSource === "string" ? stderrSource.slice(0, 4000) : "";
  return (
    <div className="space-y-3 rounded border border-violet-800/70 bg-slate-950/70 p-3" data-testid="theory-runtime-result-report">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-violet-300">Runtime result report</div>
          <div className="mt-1 font-semibold text-slate-100">{receipt.runtimeId}</div>
          <div className="mt-1 font-mono text-[11px] text-slate-400">{receipt.receiptId}</div>
        </div>
        <Badge variant="outline" className={receipt.status === "completed" ? "border-emerald-700 text-emerald-200" : "border-rose-700 text-rose-200"}>
          lifecycle: {receipt.status}
        </Badge>
      </div>
      <RuntimeReceiptStatusLamps
        receipt={receipt}
        aggregateStatus={receipt.status}
        aggregateLabel="Aggregate runtime result"
      />
      <div className="grid gap-2 text-[11px] md:grid-cols-2">
        <div className="rounded border border-slate-800 p-2"><span className="text-slate-500">request</span><div className="break-all font-mono">{job.jobId}</div></div>
        <div className="rounded border border-slate-800 p-2"><span className="text-slate-500">command</span><div className="break-all font-mono">{receipt.execution?.command ?? receipt.command ?? "not recorded"}</div></div>
        <div className="rounded border border-slate-800 p-2"><span className="text-slate-500">duration</span><div>{receipt.provenance.durationMs ?? "unknown"} ms</div></div>
        <div className="rounded border border-slate-800 p-2"><span className="text-slate-500">claim tier</span><div>{receipt.claimBoundary.currentTier} / max {receipt.claimBoundary.maximumTier}</div></div>
      </div>
      {Object.keys(receipt.outputs.scalars).length ? (
        <section>
          <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Scalars</div>
          <div className="grid gap-1 md:grid-cols-2">
            {Object.entries(receipt.outputs.scalars).map(([name, value]) => (
              <div key={name} className="rounded border border-cyan-900/60 bg-cyan-950/20 px-2 py-1 text-xs">
                <span className="font-mono text-cyan-100">{name}</span>: {displayValue(value)} {receipt.outputs.units[name] ?? ""}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {Object.keys(receipt.outputs.gates).length ? (
        <section>
          <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Gates</div>
          <div className="flex flex-wrap gap-1">
            {Object.entries(receipt.outputs.gates).map(([name, status]) => (
              <Badge key={name} variant="outline" className={status === "pass" ? "border-emerald-700 text-emerald-200" : status === "fail" ? "border-rose-700 text-rose-200" : "border-amber-700 text-amber-100"}>
                {name}: {status}
              </Badge>
            ))}
          </div>
        </section>
      ) : null}
      {receipt.outputs.missingSignals.length ? <ReportList title="Missing signals" items={receipt.outputs.missingSignals} tone="text-amber-100" /> : null}
      {receipt.outputs.warnings.length ? <ReportList title="Warnings" items={receipt.outputs.warnings} tone="text-amber-100" /> : null}
      {receipt.outputs.artifacts.length ? <ReportList title="Artifacts" items={receipt.outputs.artifacts} tone="text-slate-300" /> : null}
      {receipt.claimBoundary.promotionBlockedBy.length ? <ReportList title="Claim boundary" items={receipt.claimBoundary.promotionBlockedBy} tone="text-amber-100" /> : null}
      {stdout || stderr ? (
        <details className="rounded border border-slate-800 bg-slate-950/80 p-2 text-[11px]">
          <summary className="cursor-pointer text-slate-300">Bounded process output</summary>
          {stdout ? <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap text-slate-300">{stdout}</pre> : null}
          {stderr ? <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap text-amber-200">{stderr}</pre> : null}
        </details>
      ) : null}
    </div>
  );
}

function ReportList({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  return <section><div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">{title}</div><ul className={`list-disc space-y-1 pl-5 text-[11px] ${tone}`}>{items.map((item, index) => <li key={`${title}:${index}`}>{item}</li>)}</ul></section>;
}
