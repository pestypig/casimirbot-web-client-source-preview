import React from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

export default function StatusBanner({
  items,
  showOk = true,
}: {
  items: { kind: "fail" | "warn" | "info" | "ok"; text: string }[];
  /** Hide purely OK rows (only show fail/warn/info). */
  showOk?: boolean;
}) {
  if (!items?.length) return null;
  const filtered = showOk ? items : items.filter(i=>i.kind !== 'ok');
  if (!filtered.length) return null;
  const tone = filtered.some(i=>i.kind==="fail") ? "fail" :
               filtered.some(i=>i.kind==="warn") ? "warn" :
               filtered.some(i=>i.kind==="info") ? "info" : "ok";
  const cls =
    tone === "fail" ? "border-rose-700/60 bg-rose-950/40" :
    tone === "warn" ? "border-amber-600/60 bg-amber-950/40" :
    tone === "info" ? "border-sky-700/60 bg-sky-950/40" :
    "border-emerald-700/60 bg-emerald-950/40";
  const Icon = tone === "fail" ? AlertTriangle :
               tone === "warn" ? AlertTriangle :
               tone === "info" ? Info : CheckCircle2;
  return (
  <div className={`rounded-xl border px-3 py-2 text-sm ${cls} select-text`}>
      <div className="flex items-start gap-2">
        <Icon className="w-4 h-4 mt-0.5" />
        <div className="space-y-1">
          <ul className="list-none m-0 p-0 space-y-0.5">
            {filtered.map((i,idx)=>(
              <li key={idx} className="leading-5 flex flex-wrap items-baseline gap-2">
                <span className="uppercase text-[10px] tracking-wide font-semibold px-1.5 py-0.5 rounded bg-slate-800/60 border border-slate-700">
                  {i.kind}
                </span>
                <span className="text-slate-200 whitespace-pre-line">{i.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}