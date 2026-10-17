import React from "react";
import { useLumaWhispers } from "@/lib/luma-whispers";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function LumaWhisperBubble() {
  const { active } = useLumaWhispers();
  if (!active.length) return null;
  const whisper = active[0];

  const severityClass =
    whisper.severity === "warn"
      ? "bg-amber-500/20 text-amber-900"
      : whisper.severity === "info"
        ? "bg-emerald-500/15 text-emerald-800"
        : "bg-sky-500/15 text-sky-800";

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 50,
        maxWidth: 360,
      }}
    >
      <Card className="shadow-xl border border-slate-700/60 backdrop-blur">
        <CardContent className="p-3 space-y-2">
          <div className="text-xs uppercase tracking-wide text-slate-400">Luma Whisper</div>
          <div className="text-[13px] leading-5">
            <div className="italic text-slate-200">{whisper.moral}</div>
            <div className="mt-1 text-slate-300">{whisper.body}</div>
            {whisper.action && <div className="mt-2 text-slate-400">{whisper.action}</div>}
          </div>
          <div className="flex gap-1 flex-wrap items-center">
            {whisper.tags.slice(0, 4).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px]">
                {tag}
              </Badge>
            ))}
            <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full capitalize ${severityClass}`}>
              {whisper.severity}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
