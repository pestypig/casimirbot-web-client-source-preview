import React, { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, Pin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import useFractionalCoherence, {
  FractionalCoherenceState,
  FractionalGridCellState,
} from "@/hooks/useFractionalCoherence";

const HARMONIC_BELTS = [
  { label: "1:1", ratio: 1, tolerance: 0.025 },
  { label: "2:1", ratio: 2, tolerance: 0.03 },
  { label: "3:2", ratio: 1.5, tolerance: 0.02 },
  { label: "4:3", ratio: 1.3333, tolerance: 0.018 },
] as const;

function formatRatio(cell: FractionalGridCellState) {
  return `${cell.p}:${cell.q}`;
}

function formatFrequency(fHz: number) {
  if (!Number.isFinite(fHz) || fHz <= 0) return "--";
  if (fHz >= 1e9) return `${(fHz / 1e9).toFixed(3)} GHz`;
  if (fHz >= 1e6) return `${(fHz / 1e6).toFixed(2)} MHz`;
  if (fHz >= 1e3) return `${(fHz / 1e3).toFixed(1)} kHz`;
  return `${fHz.toFixed(0)} Hz`;
}

function formatCoherence(value: number) {
  if (!Number.isFinite(value)) return "--";
  return `${Math.round(value * 100)}%`;
}

function cellFill(value: number) {
  const clamped = Math.max(0, Math.min(1, value));
  const hue = 200 - clamped * 160;
  const saturation = 75;
  const lightness = 18 + (1 - clamped) * 14;
  return `hsl(${hue}deg ${saturation}% ${lightness}%)`;
}

function sparklineBarHeight(value: number) {
  const clamped = Math.max(0, Math.min(1, value));
  return `${Math.max(2, Math.round(clamped * 16))}px`;
}

function getBeltLabel(ratio: number) {
  for (const belt of HARMONIC_BELTS) {
    if (Math.abs(ratio - belt.ratio) <= belt.tolerance) return belt.label;
  }
  return null;
}

function renderDriftIndicator(drift: number) {
  const threshold = 0.01;
  if (!Number.isFinite(drift) || Math.abs(drift) < threshold) {
    return <Minus className="h-3 w-3 text-slate-400/60" strokeWidth={2} />;
  }
  if (drift > 0) {
    return <ArrowUpRight className="h-3 w-3 text-emerald-300/80" strokeWidth={2} />;
  }
  return <ArrowDownRight className="h-3 w-3 text-rose-300/80" strokeWidth={2} />;
}

export interface FractionalCoherenceGridProps {
  state: FractionalCoherenceState;
  className?: string;
  maxPins?: number;
  minCoherence?: number;
  onSendToPump?: (
    cells: FractionalGridCellState[],
    meta: { f0: number; fs: number },
  ) => Promise<void> | void;
}

export const FractionalCoherenceGrid: React.FC<FractionalCoherenceGridProps> = ({
  state,
  className,
  maxPins = 3,
  minCoherence = 0.05,
  onSendToPump,
}) => {
  const { grid } = state;
  const [sending, setSending] = useState(false);

  const sortedCells = useMemo(() => {
    if (!grid) return [];
    return [...grid.cells].sort((a, b) => b.coherenceEff - a.coherenceEff);
  }, [grid]);

  const pinnedCells = useMemo(
    () => sortedCells.filter((cell) => cell.pinned),
    [sortedCells],
  );

  const preferredCells = useMemo(() => {
    const viablePinned = pinnedCells.filter((cell) => cell.coherenceEff >= minCoherence);
    if (viablePinned.length > 0) {
      return viablePinned.slice(0, maxPins);
    }
    return sortedCells.filter((cell) => cell.coherenceEff >= minCoherence).slice(0, maxPins);
  }, [pinnedCells, sortedCells, maxPins, minCoherence]);

  const highlightKeys = useMemo(
    () => new Set(preferredCells.map((cell) => cell.key)),
    [preferredCells],
  );

  const sendToPump = async () => {
    if (!onSendToPump || !grid || !preferredCells.length) return;
    setSending(true);
    try {
      await onSendToPump(preferredCells, { f0: grid.f0, fs: grid.fs });
    } finally {
      setSending(false);
    }
  };

  if (!grid) {
    return (
      <div
        className={cn(
          "rounded-lg border border-slate-800/70 bg-slate-900/70 p-4 text-sm text-slate-400",
          className,
        )}
      >
        Fractional coherence frames have not arrived yet. Drive-bus samples or the local synthetic
        fallback may populate this diagnostic grid. No selected-run NHM2 evidence is produced.
      </div>
    );
  }

  const displayF0 = Number.isFinite(grid.f0Display) && grid.f0Display > 0 ? grid.f0Display : grid.f0;
  const aliasing =
    Math.abs(displayF0 - grid.f0) > Math.max(1, 0.001 * Math.max(displayF0, grid.f0));

  return (
    <TooltipProvider delayDuration={120} skipDelayDuration={250}>
      <div
        className={cn(
          "rounded-lg border border-slate-800/70 bg-slate-950/70 p-4 shadow-inner shadow-slate-900/40",
          className,
        )}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
          <div className="flex items-center gap-2 font-medium text-slate-100">
            <span>Fractional Coherence - {grid.rows}x{grid.cols}</span>
            <span className="rounded-full bg-slate-800/70 px-2 py-[2px] text-[11px] text-slate-300">
              f0 ~ {formatFrequency(displayF0)}
            </span>
            {aliasing && (
              <span className="rounded-full bg-slate-800/70 px-2 py-[2px] text-[11px] text-slate-400">
                baseband ~ {formatFrequency(grid.f0)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">
              Highlighting {preferredCells.length}{" "}
              {preferredCells.length === 1 ? "diagnostic cell" : "diagnostic cells"}
            </span>
            {onSendToPump && (
              <Button
                size="sm"
                variant="outline"
                disabled={!preferredCells.length || sending}
                onClick={sendToPump}
              >
                {sending ? "Sending..." : "Send to Pump"}
              </Button>
            )}
          </div>
        </div>
        <div className="mb-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {state.sampleSource === "drive_bus" ? "Drive-bus samples" : state.sampleSource === "synthetic_fallback" ? "Synthetic fallback samples" : "No sample source yet"}
          {" · "}Client DSP diagnostic; no selected-run NHM2, QEI, or hardware receipt.
          <span className="ml-2 font-mono text-slate-200">
            CP {state.CP?.toFixed(1) ?? "—"} · IFC {state.IFC?.toFixed(3) ?? "—"} · SS {state.SS?.toFixed(3) ?? "—"}
          </span>
        </div>

        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))` }}
        >
          {grid.cells.map((cell) => {
            const ratioLabel = formatRatio(cell);
            const beltLabel = getBeltLabel(cell.ratio);
            const sparkline = cell.sparkline ?? [];
            const drift = Number.isFinite(cell.drift) ? cell.drift : 0;
            const isHighlighted = highlightKeys.has(cell.key);
            return (
              <Tooltip key={cell.key}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-pressed={cell.pinned}
                    onClick={() => state.togglePin(cell.key)}
                    className={cn(
                      "relative flex h-20 flex-col rounded-md border px-2 py-1 text-left transition",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80",
                      cell.pinned
                        ? "border-cyan-300/70 shadow-[0_0_0_1px_rgba(34,211,238,0.55)]"
                        : "border-slate-800/70 hover:border-cyan-300/40",
                      isHighlighted ? "ring-1 ring-cyan-400/70" : "",
                    )}
                    style={{ backgroundColor: cellFill(cell.coherenceEff) }}
                  >
                    <div className="flex items-start justify-between text-[11px] font-semibold text-slate-100">
                      <span className="font-mono">{ratioLabel}</span>
                      <span>{formatCoherence(cell.coherenceEff)}</span>
                    </div>
                    <div className="mt-1 flex items-end gap-[2px]">
                      {sparkline.length ? (
                        sparkline.map((value, idx) => (
                          <span
                            key={idx}
                            className="w-[3px] rounded-sm bg-cyan-200/70"
                            style={{ height: sparklineBarHeight(value) }}
                          />
                        ))
                      ) : (
                        <div className="h-[12px] w-full rounded-sm bg-slate-700/40" />
                      )}
                    </div>
                    <div className="mt-auto flex items-center justify-between text-[10px] text-slate-200/80">
                      <span className="flex items-center gap-1">
                        {renderDriftIndicator(drift)}
                        {beltLabel && (
                          <Badge
                            variant="secondary"
                            className="h-4 rounded-sm bg-amber-500/20 px-1 text-[10px] font-semibold text-amber-200/90"
                          >
                            {beltLabel}
                          </Badge>
                        )}
                      </span>
                      {cell.pinned && <Pin className="h-3 w-3 text-cyan-200" strokeWidth={2} />}
                    </div>
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-[12px] leading-snug text-black">
                  <div className="font-semibold">{ratioLabel}</div>
                  <div className="text-black/80">f ~ {formatFrequency(cell.fHz)}</div>
                  {aliasing && (
                    <div className="text-black/70">baseband ~ {formatFrequency(cell.basebandHz)}</div>
                  )}
                  <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-black/80">
                    <span>Coherence</span>
                    <span className="text-right font-mono text-black">
                      {formatCoherence(cell.coherence)}
                    </span>
                    <span>Effective</span>
                    <span className="text-right font-mono text-black">
                      {formatCoherence(cell.coherenceEff)}
                    </span>
                    <span>Stability</span>
                    <span className="text-right font-mono text-black">
                      {formatCoherence(cell.stability)}
                    </span>
                    <span>Drift</span>
                    <span className="text-right font-mono text-black">
                      {cell.drift >= 0 ? "+" : ""}
                      {(cell.drift * 100).toFixed(1)}%
                    </span>
                    <span>SNR</span>
                    <span className="text-right font-mono text-black">
                      {Number.isFinite(cell.snr) ? cell.snr.toFixed(2) : "--"}
                    </span>
                    <span>Phase</span>
                    <span className="text-right font-mono text-black">
                      {Number.isFinite(cell.phase)
                        ? `${(cell.phase * 180) / Math.PI >= 0 ? "+" : ""}${((cell.phase * 180) / Math.PI).toFixed(1)} deg`
                        : "--"}
                    </span>
                  </div>
                  {beltLabel && (
                    <div className="mt-2 text-black/70">
                      Near harmonic belt <span className="font-semibold text-amber-200">{beltLabel}</span>
                    </div>
                  )}
                  <div className="mt-2 text-black/70">
                    Click to {cell.pinned ? "release pin" : "pin"} this local diagnostic selection.
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-200/90">
          <span className="text-slate-400">Pins</span>
          {pinnedCells.length ? (
            pinnedCells.map((cell) => (
              <Badge
                key={cell.key}
                variant="secondary"
                className="flex items-center gap-1 rounded-sm bg-cyan-500/15 px-2 py-[2px] text-[11px] text-cyan-100"
              >
                <Pin className="h-3 w-3" strokeWidth={2} />
                {formatRatio(cell)} | {formatCoherence(cell.coherenceEff)}
              </Badge>
            ))
          ) : (
            <span className="text-slate-500">None</span>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};

export interface FractionalCoherenceGridLiveProps
  extends Omit<FractionalCoherenceGridProps, "state"> {}

export const FractionalCoherenceGridLive: React.FC<FractionalCoherenceGridLiveProps> = (props) => {
  const state = useFractionalCoherence();
  return <FractionalCoherenceGrid {...props} state={state} />;
};

export default FractionalCoherenceGridLive;
