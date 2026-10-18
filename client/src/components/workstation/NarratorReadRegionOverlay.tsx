import React from "react";
import { useNarratorStore } from "@/store/useNarratorStore";

function phaseLabel(phase: string): string {
  if (phase === "hover_pending") return "Hover";
  if (phase === "voice_loading") return "Voice";
  if (phase === "speaking") return "Speaking";
  if (phase === "tool_loading") return "Tool";
  return "Narrator";
}

export default function NarratorReadRegionOverlay() {
  const readRegion = useNarratorStore((state) => state.readRegion);
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    if (!readRegion.visible) {
      setProgress(0);
      return undefined;
    }
    let frameId = 0;
    const tick = () => {
      const duration = Math.max(1, readRegion.durationMs || 1);
      const elapsed = Math.max(0, Date.now() - readRegion.startedAtMs);
      setProgress(Math.max(0, Math.min(1, elapsed / duration)));
      frameId = window.requestAnimationFrame(tick);
    };
    tick();
    return () => window.cancelAnimationFrame(frameId);
  }, [readRegion.durationMs, readRegion.startedAtMs, readRegion.visible]);

  if (!readRegion.visible || !readRegion.rect || typeof window === "undefined") return null;

  const rect = readRegion.rect;
  const cursorX = readRegion.pointer?.x ?? rect.left + rect.width + 18;
  const cursorY = readRegion.pointer?.y ?? rect.top + 18;
  const ringX = Math.max(18, Math.min(window.innerWidth - 18, cursorX + 18));
  const ringY = Math.max(18, Math.min(window.innerHeight - 18, cursorY + 18));
  const circumference = 2 * Math.PI * 13;
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999]" aria-hidden="true">
      <div
        className="absolute rounded-[6px] border-2 border-dotted border-cyan-200/90 bg-cyan-300/[0.04] shadow-[0_0_0_1px_rgba(8,145,178,0.25),0_0_24px_rgba(34,211,238,0.18)]"
        style={{
          left: rect.left - 4,
          top: rect.top - 4,
          width: rect.width + 8,
          height: rect.height + 8,
        }}
      />
      <div
        className="absolute flex h-10 w-10 items-center justify-center rounded-full border border-cyan-200/40 bg-zinc-950/85 text-[8px] font-semibold uppercase tracking-normal text-cyan-100 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
        style={{
          left: ringX - 20,
          top: ringY - 20,
        }}
      >
        <svg className="absolute inset-1 h-8 w-8 -rotate-90" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="13" fill="none" stroke="rgba(148,163,184,0.35)" strokeWidth="3" />
          <circle
            cx="16"
            cy="16"
            r="13"
            fill="none"
            stroke="rgb(103,232,249)"
            strokeLinecap="round"
            strokeWidth="3"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <span className="relative max-w-[32px] truncate">{phaseLabel(readRegion.phase)}</span>
      </div>
    </div>
  );
}
