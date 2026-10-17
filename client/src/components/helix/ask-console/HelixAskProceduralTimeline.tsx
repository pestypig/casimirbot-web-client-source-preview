import React from "react";

import { readProceduralStatusClass } from "@/lib/helix/ask-status-classnames";

export type HelixAskProceduralTimelineRow = {
  key: string;
  label: string;
  detail: string;
  status: string;
};

export type HelixAskProceduralTimelineProps = {
  rows: HelixAskProceduralTimelineRow[];
  truthMatchesVisible: boolean;
  route: string;
  toolLabel?: string | null;
  runtimeStopReason?: string | null;
  runtimePath?: string | null;
  apiTransport?: string | null;
  runtimeDowngradeReason?: string | null;
  defaultVisibleLimit?: number | null;
  runtimeBudgetSummary?: string | null;
  modelPolicySummary?: string | null;
};

export function HelixAskProceduralTimeline({
  rows,
  truthMatchesVisible,
  route,
  toolLabel,
  runtimeStopReason,
  runtimePath,
  apiTransport,
  runtimeDowngradeReason,
  defaultVisibleLimit: declaredDefaultVisibleLimit,
  runtimeBudgetSummary,
  modelPolicySummary,
}: HelixAskProceduralTimelineProps) {
  if (rows.length === 0) return null;

  const defaultVisibleLimit =
    typeof declaredDefaultVisibleLimit === "number" && Number.isFinite(declaredDefaultVisibleLimit)
      ? Math.max(1, Math.min(100, Math.floor(declaredDefaultVisibleLimit)))
      : 18;
  const visibleRows = rows.slice(0, defaultVisibleLimit);
  const overflowRows = rows.slice(defaultVisibleLimit);

  const renderRow = (row: HelixAskProceduralTimelineRow, index: number) => (
    <div key={row.key} className={`rounded-lg border px-2 py-1.5 ${readProceduralStatusClass(row.status)}`}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] tabular-nums">
          {index + 1}
        </span>
        <div className="min-w-0">
          <p className="font-medium">{row.label}</p>
          <p className="mt-0.5 break-words text-[11px] opacity-80">
            {row.detail} [{row.status}]
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="mt-3 rounded-xl border border-cyan-300/20 bg-cyan-950/15 px-3 py-2 text-xs text-cyan-50">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-200">Procedural workspace timeline</p>
        <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-100/70">
          Truth: {truthMatchesVisible ? "backend terminal == visible answer" : "backend terminal != visible answer"}
        </p>
      </div>
      <p className="mt-1 text-[11px] text-cyan-100/80">
        Route: {route}
        {toolLabel ? ` | Tool: ${toolLabel}` : ""}
        {runtimeStopReason ? ` | Runtime: ${runtimeStopReason}` : ""}
        {runtimePath ? ` | Path: ${runtimePath}` : ""}
        {apiTransport ? ` | Transport: ${apiTransport}` : ""}
        {runtimeDowngradeReason ? ` | Downgrade: ${runtimeDowngradeReason}` : ""}
      </p>
      <p className="mt-1 text-[10px] text-cyan-100/65">
        Showing {visibleRows.length} of {rows.length} public lifecycle rows
        {overflowRows.length > 0 ? "; the remainder is expandable below" : "; no presentation truncation"}.
      </p>
      <p className="mt-1 text-[10px] text-cyan-100/65">
        Presentation limit: {defaultVisibleLimit} rows by default; this is not a runtime execution limit.
      </p>
      {runtimeBudgetSummary ? (
        <p className="mt-1 break-words text-[10px] text-cyan-100/70">
          Runtime budget: {runtimeBudgetSummary}
        </p>
      ) : null}
      {modelPolicySummary ? (
        <p className="mt-1 break-words text-[10px] text-cyan-100/70">
          Model policy: {modelPolicySummary}
        </p>
      ) : null}
      <div className="mt-2 space-y-1.5">
        {visibleRows.map(renderRow)}
      </div>
      {overflowRows.length > 0 ? (
        <details className="mt-2 rounded-lg border border-cyan-300/15 bg-black/10 px-2 py-1.5">
          <summary className="cursor-pointer text-[10px] uppercase tracking-[0.14em] text-cyan-100/75">
            Show remaining {overflowRows.length} lifecycle rows
          </summary>
          <div className="mt-2 space-y-1.5">
            {overflowRows.map((row, index) => renderRow(row, index + defaultVisibleLimit))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
