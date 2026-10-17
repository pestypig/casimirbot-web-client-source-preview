import React from "react";
import {
  reasoningBattleBeatPrimitive,
  reasoningBattleBeatClassName,
  type ReasoningBattleAmbientState,
  type ReasoningBattleBeat,
} from "@/lib/helix/reasoning-battle-stage";
import {
  reasoningBattleAmbientClassName,
  reasoningBattleAmbientMarkerClassName,
  reasoningBattleBeatHeightPx,
  reasoningBattleBeatPositionPct,
  reasoningBattlePrimitiveClassName,
  reasoningBattlePrimitiveStyle,
} from "@/lib/helix/ask-reasoning-battle-display";
import { hash32 } from "@/lib/helix/ask-stable-hash";

export type HelixAskReasoningBattleStageProps = {
  beats: ReasoningBattleBeat[];
  pressurePct: number;
  reducedMotion: boolean;
  ambient?: ReasoningBattleAmbientState | null;
  replay?: boolean;
  className?: string;
  testId?: string;
};

function clampPercent(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function HelixAskReasoningBattleStage({
  beats,
  pressurePct,
  reducedMotion,
  ambient: ambientInput,
  replay,
  className,
  testId,
}: HelixAskReasoningBattleStageProps) {
  if (beats.length === 0 && !ambientInput) return null;
  const visibleBeats = beats.slice(-8);
  const staticMotion = Boolean(replay || reducedMotion);
  const positiveImpact = visibleBeats.reduce((total, beat) => total + Math.max(0, beat.progress_delta), 0);
  const negativeImpact = visibleBeats.reduce((total, beat) => total + Math.max(0, beat.pressure_delta), 0);
  const orbPct = clampPercent(34 + positiveImpact * 6 - negativeImpact * 3, 18, 82);
  const ambient = ambientInput ?? null;
  const ambientPct =
    ambient?.lane === "ambiguity"
      ? 86
      : ambient?.lane === "terminal"
        ? 94
        : ambient?.lane === "orb"
          ? clampPercent(orbPct, 18, 78)
          : 50;
  const ambientElapsedLabel =
    ambient && !replay && ambient.elapsed_ms >= 1000 ? ` ${Math.floor(ambient.elapsed_ms / 1000)}s` : "";

  return (
    <div
      data-testid={testId ?? "helix-ask-reasoning-battle-stage"}
      className={className}
      aria-hidden="true"
    >
      <div className="relative h-2 overflow-visible rounded-full bg-black/45">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-300/40 via-cyan-200/28 to-transparent"
          style={{ width: `${orbPct}%` }}
        />
        <div
          data-testid="helix-ask-reasoning-battle-pressure"
          className="absolute inset-y-0 right-0 rounded-full bg-gradient-to-l from-rose-400/35 via-fuchsia-300/15 to-transparent"
          style={{ width: `${pressurePct}%` }}
        />
        {ambient ? (
          <span
            data-testid="helix-ask-reasoning-battle-ambient-marker"
            className={`pointer-events-none absolute top-1/2 z-[3] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${reasoningBattleAmbientMarkerClassName(ambient, staticMotion)}`}
            style={{ left: `${ambientPct}%`, opacity: 0.42 + ambient.intensity * 0.14 }}
          />
        ) : null}
        <div className="pointer-events-none absolute -inset-x-2 -bottom-5 -top-7 z-[5] overflow-visible">
          {visibleBeats.map((beat) => {
            const primitive = reasoningBattleBeatPrimitive(beat);
            const driftPx = ((hash32(`${beat.id}:drift`) % 17) - 8) * (beat.lane === "ambiguity" ? -1 : 1);
            const yPx = reasoningBattleBeatHeightPx(beat);
            const displayLabel = `${beat.impact > 0 ? "+" : beat.impact < 0 ? "-" : ""}${beat.label}`;
            return (
              <React.Fragment key={beat.id}>
                <span
                  data-testid="helix-ask-reasoning-battle-primitive"
                  className={`pointer-events-none absolute top-1/2 z-[4] block border ${reasoningBattlePrimitiveClassName(primitive)}`}
                  style={reasoningBattlePrimitiveStyle({ beat, primitive, reducedMotion: staticMotion })}
                />
                <span
                  data-testid="helix-ask-reasoning-battle-beat"
                  className={`pointer-events-none absolute top-1/2 z-[5] rounded border px-1.5 py-0.5 text-[9px] font-medium uppercase leading-none tracking-[0.12em] shadow-[0_0_12px_rgba(255,255,255,0.12)] backdrop-blur-sm ${reasoningBattleBeatClassName(beat, staticMotion)}`}
                  style={
                    {
                      left: `${reasoningBattleBeatPositionPct(beat)}%`,
                      transform: staticMotion
                        ? `translate3d(-50%, ${yPx}px, 0)`
                        : "translate3d(-50%, 0, 0)",
                      animation: staticMotion ? undefined : `helixReasoningBattleBeat ${beat.ttl_ms}ms ease-out forwards`,
                      "--beat-drift": `${driftPx}px`,
                      "--beat-y": `${yPx}px`,
                    } as React.CSSProperties & Record<string, string | undefined>
                  }
                >
                  {displayLabel}
                </span>
              </React.Fragment>
            );
          })}
        </div>
        {ambient ? (
          <span
            data-testid="helix-ask-reasoning-battle-ambient"
            className={`pointer-events-none absolute right-0 top-4 z-[6] rounded border px-1.5 py-0.5 text-[9px] font-medium uppercase leading-none tracking-[0.12em] ${reasoningBattleAmbientClassName(ambient, staticMotion)}`}
            title={ambient.stage}
          >
            {ambient.label}
            {ambientElapsedLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
