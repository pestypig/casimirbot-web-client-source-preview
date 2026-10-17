import React from "react";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";

type KPI = { label: string; value: string };

function Sparkline({ points, color = "#60a5fa" }: { points: number[]; color?: string }) {
  const w = 160, h = 40, pad = 4;
  if (!points.length) return <svg width={w} height={h} />;
  const min = Math.min(...points), max = Math.max(...points);
  const span = Math.max(1e-12, max - min);
  const xs = points.map((_, i) => pad + (i * (w - 2 * pad)) / Math.max(1, points.length - 1));
  const ys = points.map(v => h - pad - ((v - min) / span) * (h - 2 * pad));
  const d = xs.map((x, i) => `${i ? 'L' : 'M'}${x},${ys[i]}`).join(" ");
  return (
    <svg width={w} height={h} className="block">
      <rect x={0} y={0} width={w} height={h} rx={6} className="fill-slate-900/40 stroke-slate-800" />
      <path d={d} fill="none" stroke={color} strokeWidth={2} />
    </svg>
  );
}

export default function ResultViewer({
  title,
  equation,
  value,
  unit,
  details,
  color = "#60a5fa",
  history,
  status = "ok",
  badges,
  onClick,
}: {
  title: string;
  equation: string;
  value: string;
  unit?: string;
  details?: KPI[];
  color?: string;
  history?: number[];
  status?: "ok" | "warn" | "fail";
  badges?: string[];
  onClick?: () => void;
}) {
  const borderCls =
    status === "ok" ? "border-emerald-600/50" :
    status === "warn" ? "border-amber-500/50" :
    "border-rose-600/60";
  const ringCls =
    status === "ok" ? "hover:ring-emerald-600/30" :
    status === "warn" ? "hover:ring-amber-500/30" :
    "hover:ring-rose-600/30";
  return (
    <Card
      onClick={onClick}
      className={`bg-slate-900/50 border ${borderCls} transition ring-0 hover:ring-2`}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-slate-100 text-sm flex items-center gap-2">
          {title}
          {!!badges?.length && (
            <span className="flex flex-wrap gap-1">
              {badges.map((b,i)=>(
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200">
                  {b}
                </span>
              ))}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className={`space-y-3 ${ringCls}`}>
        <div className="text-[11px] font-mono text-slate-300 break-words leading-snug">{equation}</div>
        <div className="flex items-baseline gap-2">
          <div className="text-xl font-semibold text-slate-100">{value}</div>
          {unit && <div className="text-xs text-slate-400">{unit}</div>}
        </div>
        {history && history.length > 1 && <Sparkline points={history} color={color} />}
        {!!details?.length && (
          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
            {details.map((d, i) => (
              <div key={i} className="px-2 py-1 rounded bg-slate-800/50 border border-slate-700">
                <span className="opacity-60 mr-1">{d.label}:</span>
                <span className="text-slate-200">{d.value}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}