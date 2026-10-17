import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type CongruenceLegendProps = {
  className?: string;
  compact?: boolean;
  showProxyBadge?: boolean;
};

export function CongruenceLegend({
  className,
  compact = false,
  showProxyBadge = true,
}: CongruenceLegendProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 text-[10px] text-slate-400", className)}>
      <span className="uppercase tracking-wide">Congruence</span>
      <Badge className="border border-emerald-400/60 bg-emerald-500/10 text-emerald-200">
        geometry-derived
      </Badge>
      <Badge className="border border-amber-400/60 bg-amber-500/10 text-amber-200">
        proxy-only
      </Badge>
      <Badge className="border border-slate-500/60 bg-slate-800/60 text-slate-300">
        unknown
      </Badge>
      {showProxyBadge ? (
        <Badge
          className="bg-slate-800 text-slate-300"
          title="Fallback or stage-gated telemetry"
        >
          PROXY
        </Badge>
      ) : null}
      {compact ? null : (
        <span className="text-slate-500">
          Labels apply to the row or badge they sit next to.
        </span>
      )}
    </div>
  );
}

export default CongruenceLegend;
