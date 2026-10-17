import React from "react";

export type MoralGraphNodeProps = {
  title: string;
  subtitle?: string;
  tone?: "lens" | "root" | "safeguard" | "missing" | "neutral";
};

const toneClass: Record<NonNullable<MoralGraphNodeProps["tone"]>, string> = {
  lens: "border-teal-500 bg-teal-950/35 text-teal-50",
  root: "border-sky-500 bg-sky-950/35 text-sky-50",
  safeguard: "border-amber-500 bg-amber-950/35 text-amber-50",
  missing: "border-rose-500 bg-rose-950/35 text-rose-50",
  neutral: "border-zinc-700 bg-zinc-900/70 text-zinc-100",
};

export function MoralGraphNode({ title, subtitle, tone = "neutral" }: MoralGraphNodeProps) {
  return (
    <div className={`rounded border px-3 py-2 ${toneClass[tone]}`}>
      <div className="text-sm font-semibold leading-snug">{title}</div>
      {subtitle ? <div className="mt-1 text-xs leading-snug opacity-75">{subtitle}</div> : null}
    </div>
  );
}

export default MoralGraphNode;
