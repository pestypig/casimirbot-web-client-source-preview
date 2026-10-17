import React from "react";
import {
  CircleAlert,
  Clock3,
  Eye,
  LoaderCircle,
  Lock,
  TriangleAlert,
  XCircle,
} from "lucide-react";

export const CASIMIR_GUIDE_ROW_STATES = [
  "available",
  "locked",
  "unavailable",
  "degraded",
  "stale",
  "pending",
  "failed",
  "planned",
  "read_only",
] as const;

export type CasimirGuideRowState = typeof CASIMIR_GUIDE_ROW_STATES[number];

export type CasimirGuideRowModel = {
  id: string;
  label: string;
  value?: string;
  description?: string;
  action?: () => void;
  state: CasimirGuideRowState;
};

const actionableStates = new Set<CasimirGuideRowState>([
  "available",
  "degraded",
  "stale",
  "failed",
]);

const stateClasses: Record<CasimirGuideRowState, string> = {
  available: "text-slate-100",
  locked: "text-amber-100",
  unavailable: "text-slate-400",
  degraded: "text-amber-100",
  stale: "text-amber-100",
  pending: "text-cyan-100",
  failed: "text-rose-100",
  planned: "text-violet-100",
  read_only: "text-sky-100",
};

function StateIcon({ state }: { state: CasimirGuideRowState }) {
  const className = "h-3.5 w-3.5 shrink-0";
  if (state === "locked") return <Lock className={`${className} text-amber-200`} aria-hidden="true" />;
  if (state === "unavailable") return <CircleAlert className={`${className} text-slate-400`} aria-hidden="true" />;
  if (state === "degraded") return <TriangleAlert className={`${className} text-amber-200`} aria-hidden="true" />;
  if (state === "stale") return <Clock3 className={`${className} text-amber-200`} aria-hidden="true" />;
  if (state === "pending") return <LoaderCircle className={`${className} animate-spin text-cyan-200 motion-reduce:animate-none`} aria-hidden="true" />;
  if (state === "failed") return <XCircle className={`${className} text-rose-300`} aria-hidden="true" />;
  if (state === "planned") return <Clock3 className={`${className} text-violet-200`} aria-hidden="true" />;
  if (state === "read_only") return <Eye className={`${className} text-sky-200`} aria-hidden="true" />;
  return null;
}

export function CasimirGuideRow({
  row,
  stateLabel,
}: {
  row: CasimirGuideRowModel;
  stateLabel: string;
}) {
  const selectable = Boolean(row.action) && actionableStates.has(row.state);
  const descriptionId = row.description ? `casimir-guide-row-description-${row.id}` : undefined;
  const stateId = `casimir-guide-row-state-${row.id}`;
  return (
    <button
      type="button"
      data-casimir-guide-row
      data-guide-row-state={row.state}
      disabled={!selectable}
      onClick={row.action}
      aria-describedby={[descriptionId, stateId].filter(Boolean).join(" ") || undefined}
      className={`flex min-h-11 w-full items-center justify-between gap-4 border-b border-white/10 px-4 py-3 text-left text-sm outline-none last:border-b-0 hover:bg-cyan-300/10 focus-visible:bg-cyan-300/15 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-65 ${stateClasses[row.state]}`}
    >
      <span className="min-w-0">
        <span className="inline-flex items-center gap-2">
          <StateIcon state={row.state} />
          <span>{row.label}</span>
        </span>
        {row.description ? <span id={descriptionId} className="block text-xs opacity-75">{row.description}</span> : null}
      </span>
      <span id={stateId} className="shrink-0 text-xs text-slate-400">
        {row.value ?? (row.state === "available" ? "›" : stateLabel)}
      </span>
    </button>
  );
}
