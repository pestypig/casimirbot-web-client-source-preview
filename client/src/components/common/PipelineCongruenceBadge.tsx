import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { buildCongruenceBadge, resolveCongruenceMeta, type CongruenceMetaLike } from "@/lib/congruence-meta";

type PipelineCongruenceBadgeProps = {
  label?: string;
  meta?: CongruenceMetaLike | null;
  className?: string;
};

export function PipelineCongruenceBadge({
  label = "telemetry",
  meta,
  className,
}: PipelineCongruenceBadgeProps) {
  const resolved = resolveCongruenceMeta(meta);
  const badge = buildCongruenceBadge(resolved);

  return (
    <div className={cn("flex flex-wrap items-center gap-2 text-[10px] text-slate-400", className)}>
      <span className="uppercase tracking-wide">{label}</span>
      <Badge className={cn("border bg-slate-900/60", badge.toneClass)}>{badge.label}</Badge>
      <span className="font-mono">source={resolved.source}</span>
      <span className="font-mono">congruence={resolved.congruence}</span>
      <span className="font-mono">proxy={badge.proxy ? "true" : "false"}</span>
    </div>
  );
}

export default PipelineCongruenceBadge;
