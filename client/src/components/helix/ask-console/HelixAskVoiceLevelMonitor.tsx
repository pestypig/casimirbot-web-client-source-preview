import React, { type RefObject } from "react";

export type HelixAskVoiceSignalState = "speech" | "low" | string;

export type HelixAskVoiceLevelMonitorProps = {
  visible: boolean;
  maxHeightPx: number;
  level: number;
  signalState: HelixAskVoiceSignalState;
  anchorRef?: RefObject<HTMLDivElement>;
};

export function HelixAskVoiceLevelMonitor({
  visible,
  maxHeightPx,
  level,
  signalState,
  anchorRef,
}: HelixAskVoiceLevelMonitorProps) {
  return (
    <div
      ref={anchorRef}
      aria-hidden={!visible}
      className={`absolute inset-x-4 bottom-full z-20 overflow-hidden transition-all duration-300 ease-out ${
        visible
          ? "mb-2 translate-y-0 opacity-100"
          : "pointer-events-none mb-0 max-h-0 translate-y-1 opacity-0"
      }`}
      style={visible ? { maxHeight: `${Math.max(0, maxHeightPx)}px` } : undefined}
    >
      <div className="rounded-2xl border border-cyan-200/15 bg-slate-950/55 px-2 py-1.5 shadow-[0_10px_32px_rgba(8,47,73,0.34)] backdrop-blur-xl">
        <div
          className="grid gap-0.5 rounded-xl border border-white/10 bg-black/35 p-1 shadow-inner shadow-cyan-950/40"
          style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}
          aria-label={`Voice input level meter: ${
            signalState === "speech"
              ? "speech-level signal"
              : signalState === "low"
                ? "low-level signal"
                : "waiting for device audio"
          }`}
        >
          {Array.from({ length: 16 }).map((_, index) => {
            const threshold = (index + 1) / 16;
            const active = level >= threshold;
            return (
              <span
                key={`voice-level-${index}`}
                className={`h-2.5 rounded-full transition-colors duration-150 ${
                  active
                    ? level >= 0.75
                      ? "bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.85)]"
                      : level >= 0.45
                        ? "bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.72)]"
                        : "bg-sky-300 shadow-[0_0_8px_rgba(125,211,252,0.62)]"
                    : "bg-slate-700/60"
                }`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
