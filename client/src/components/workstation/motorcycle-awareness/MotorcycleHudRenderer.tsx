import React from "react";
import type { HudCue, HudBlankReason } from "@shared/helix-motorcycle-awareness";

export type MotorcycleHudDisplayMode = "transparent" | "projector_black";

const SECTOR_LAYOUT: Record<number, { left: string; top: string; transform: string; label: string }> = {
  0: { left: "50%", top: "7%", transform: "translate(-50%, 0)", label: "front" },
  1: { left: "83%", top: "20%", transform: "translate(-50%, -50%) rotate(45deg)", label: "front right" },
  2: { left: "93%", top: "50%", transform: "translate(-50%, -50%) rotate(90deg)", label: "right" },
  3: { left: "83%", top: "80%", transform: "translate(-50%, -50%) rotate(135deg)", label: "rear right" },
  4: { left: "50%", top: "93%", transform: "translate(-50%, -100%)", label: "rear" },
  5: { left: "17%", top: "80%", transform: "translate(-50%, -50%) rotate(45deg)", label: "rear left" },
  6: { left: "7%", top: "50%", transform: "translate(-50%, -50%) rotate(90deg)", label: "left" },
  7: { left: "17%", top: "20%", transform: "translate(-50%, -50%) rotate(135deg)", label: "front left" },
};

const severityClass: Record<HudCue["severity"], string> = {
  dim: "bg-cyan-300 shadow-[0_0_12px_rgba(103,232,249,0.7)]",
  moderate: "bg-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.85)]",
  urgent: "bg-orange-400 shadow-[0_0_24px_rgba(251,146,60,0.95)]",
  urgent_pulse: "bg-red-400 shadow-[0_0_30px_rgba(248,113,113,1)] animate-pulse",
};

export function MotorcycleHudRenderer({
  cues,
  blankReason,
  mode = "transparent",
  className = "",
}: {
  cues: HudCue[];
  blankReason: HudBlankReason;
  mode?: MotorcycleHudDisplayMode;
  className?: string;
}) {
  const background = mode === "projector_black"
    ? "bg-black"
    : "bg-gradient-to-b from-sky-950/25 via-slate-950/5 to-slate-950/40";

  return (
    <div
      className={`relative isolate aspect-[16/7] min-h-[220px] overflow-hidden rounded-[42%_42%_25%_25%] border border-cyan-300/25 ${background} ${className}`}
      data-testid="motorcycle-hud-renderer"
      aria-label="Eight-sector motorcycle HUD preview"
    >
      <div className="absolute inset-[14%_20%] rounded-[45%] border border-dashed border-cyan-200/10" />
      <div className="absolute left-1/2 top-1/2 h-[52%] w-[46%] -translate-x-1/2 -translate-y-1/2 rounded-[45%] border border-cyan-100/10" />
      <div className="absolute left-1/2 top-1/2 h-px w-8 -translate-x-1/2 bg-cyan-100/20" />
      <div className="absolute left-1/2 top-1/2 h-8 w-px -translate-y-1/2 bg-cyan-100/20" />

      {Array.from({ length: 8 }, (_, sector) => {
        const cue = cues.find((candidate) => candidate.sector === sector);
        const layout = SECTOR_LAYOUT[sector];
        return (
          <div
            key={sector}
            className="absolute flex flex-col items-center gap-1"
            style={{ left: layout.left, top: layout.top, transform: layout.transform }}
            data-sector={sector}
            aria-label={`sector ${sector}, ${layout.label}${cue ? `, ${cue.severity} ${cue.kind}` : ", off"}`}
          >
            <div
              className={`h-2.5 rounded-full transition-all duration-150 ${cue ? severityClass[cue.severity] : "bg-cyan-100/10"}`}
              style={{ width: cue ? `${28 + cue.intensity * 42}px` : "22px", opacity: cue?.intensity ?? 0.28 }}
            />
            <span className="font-mono text-[9px] text-cyan-100/40">{sector}</span>
          </div>
        );
      })}

      {blankReason !== "none" ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/90" data-testid="hud-blank-overlay">
          <div className="rounded border border-red-400/40 bg-red-950/50 px-3 py-2 font-mono text-xs uppercase tracking-[0.18em] text-red-200">
            HUD blank · {blankReason.replaceAll("_", " ")}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default MotorcycleHudRenderer;
