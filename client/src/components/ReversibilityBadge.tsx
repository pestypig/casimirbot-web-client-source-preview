import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GateAnalytics } from "@shared/schema";

type ReversibilityBadgeProps = {
  analytics?: GateAnalytics | null;
  className?: string;
};

const FALLBACK = "--";

function formatPercent(value?: number | null): string {
  if (!Number.isFinite(value ?? NaN)) return FALLBACK;
  const pct = Math.max(0, Math.min(1, Number(value)));
  return `${(pct * 100).toFixed(1)}%`;
}

function formatEnergy(value?: number | null): string {
  if (!Number.isFinite(value ?? NaN) || !value) return "0 J";
  const v = Number(value);
  const abs = Math.abs(v);
  if (abs >= 1) return `${v.toFixed(2)} J`;
  if (abs >= 1e-3) return `${(v * 1e3).toFixed(2)} mJ`;
  if (abs >= 1e-6) return `${(v * 1e6).toFixed(2)} µJ`;
  if (abs >= 1e-9) return `${(v * 1e9).toFixed(2)} nJ`;
  return `${(v * 1e12).toFixed(2)} pJ`;
}

function formatBits(value?: number | null): string {
  if (!Number.isFinite(value ?? NaN) || (value ?? 0) <= 0) return FALLBACK;
  const bits = Number(value);
  if (bits >= 1e6) return `${(bits / 1e6).toFixed(2)} Mbit`;
  if (bits >= 1e3) return `${(bits / 1e3).toFixed(2)} kbit`;
  return `${bits.toFixed(1)} bit`;
}

function badgeTone(fraction?: number | null): string {
  if (!Number.isFinite(fraction ?? NaN)) {
    return "border-slate-700 text-slate-300 bg-slate-900/40";
  }
  const value = Number(fraction);
  if (value >= 0.8) {
    return "border-emerald-400/40 text-emerald-200 bg-emerald-500/15";
  }
  if (value >= 0.5) {
    return "border-amber-400/40 text-amber-200 bg-amber-500/15";
  }
  return "border-rose-400/40 text-rose-200 bg-rose-500/15";
}

export function ReversibilityBadge({ analytics, className }: ReversibilityBadgeProps) {
  const fraction = analytics?.reversibleFraction;
  const reversibleLabel = formatPercent(fraction);
  const busEnergy = analytics ? formatEnergy(analytics.busJoules) : "0 J";
  const sinkEnergy = analytics ? formatEnergy(analytics.sinkJoules) : "0 J";
  const bitLabel = analytics ? formatBits(analytics.totalBits) : FALLBACK;
  const badgeClass = badgeTone(fraction);

  return (
    <div className={cn("flex flex-col gap-1 text-[11px]", className)}>
      <Badge className={cn("w-fit px-2 py-1 font-semibold uppercase tracking-wide", badgeClass)}>
        Reversible {reversibleLabel}
      </Badge>
      <div className="text-slate-400 font-mono">
        bus {busEnergy} • sink {sinkEnergy} • {bitLabel}
      </div>
    </div>
  );
}

export default ReversibilityBadge;
