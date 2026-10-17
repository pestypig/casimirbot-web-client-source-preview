import React, { type Ref, type RefObject } from "react";
import type {
  ReasoningBattleAmbientState,
  ReasoningBattleBeat,
} from "@/lib/helix/reasoning-battle-stage";
import {
  reasoningTheaterFloatingActionTextClassName,
  type ReasoningTheaterFloatingActionText,
} from "@/lib/helix/ask-reasoning-frontier-display";
import {
  mirekCellParticleClassName,
  type ReasoningTheaterFrontierParticleNode,
  type ReasoningTheaterParticle,
} from "@/lib/helix/ask-reasoning-theater-display";
import { HelixAskReasoningBattleStage } from "./HelixAskReasoningBattleStage";

export type HelixAskReasoningMeterSurfaceProps = {
  beats: ReasoningBattleBeat[];
  pressurePct: number;
  reducedMotion: boolean;
  ambient: ReasoningBattleAmbientState | null;
  particles: ReasoningTheaterParticle[];
  fogOpacity: number;
  fieldStrength: number;
  stanceBarClassName: string;
  meterTargetPct: number;
  meterFillRef: Ref<HTMLDivElement>;
  meterPatternRef: Ref<HTMLDivElement>;
  frontierEnabled: boolean;
  frontierCursorRef: Ref<HTMLDivElement>;
  frontierBurstRef: Ref<HTMLDivElement>;
  frontierIconRef: Ref<HTMLImageElement>;
  frontierTextRef: Ref<HTMLSpanElement>;
  frontierParticleRefs: RefObject<Array<HTMLSpanElement | null>>;
  frontierIconBroken: boolean;
  frontierIconPath: string;
  frontierIconAlt: string;
  onFrontierIconError: (currentSrc: string | null) => void;
  frontierParticles: readonly ReasoningTheaterFrontierParticleNode[];
  floatingActionTexts: readonly ReasoningTheaterFloatingActionText[];
};

export function HelixAskReasoningMeterSurface({
  beats,
  pressurePct,
  reducedMotion,
  ambient,
  particles,
  fogOpacity,
  fieldStrength,
  stanceBarClassName,
  meterTargetPct,
  meterFillRef,
  meterPatternRef,
  frontierEnabled,
  frontierCursorRef,
  frontierBurstRef,
  frontierIconRef,
  frontierTextRef,
  frontierParticleRefs,
  frontierIconBroken,
  frontierIconPath,
  frontierIconAlt,
  onFrontierIconError,
  frontierParticles,
  floatingActionTexts,
}: HelixAskReasoningMeterSurfaceProps) {
  return (
    <div className="mt-2 relative h-1.5 overflow-visible rounded-full bg-black/45">
      <HelixAskReasoningBattleStage
        beats={beats}
        pressurePct={pressurePct}
        reducedMotion={reducedMotion}
        ambient={ambient}
        className="pointer-events-none absolute inset-x-0 top-0 z-[5]"
      />
      <div
        className="pointer-events-none absolute -inset-x-2 -bottom-5 -top-5 overflow-hidden rounded-md"
        aria-hidden
      >
        <div
          className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.16),rgba(15,23,42,0)_62%)]"
          style={{ opacity: 0.22 + fieldStrength * 0.18 }}
        />
        {particles.map((particle) => (
          <span
            key={`mirek-bar-${particle.id}`}
            className={`absolute rounded-full animate-pulse ${mirekCellParticleClassName(particle.kind)}`}
            style={{
              left: `${particle.leftPct}%`,
              top: `${particle.topPct}%`,
              width: `${particle.sizePx * 1.35}px`,
              height: `${particle.sizePx * 1.35}px`,
              opacity:
                Math.max(0.2, particle.opacity) *
                (0.48 + fogOpacity * 0.22) *
                fieldStrength,
              animationDelay: `${particle.delayS}s`,
              animationDuration: `${particle.durationS}s`,
            }}
          />
        ))}
      </div>
      <div className="absolute inset-0 z-[1] overflow-hidden rounded-full">
        {pressurePct > 0 ? (
          <div
            data-testid="helix-ask-reasoning-battle-pressure"
            className="pointer-events-none absolute inset-y-0 right-0 z-[2] rounded-full bg-[repeating-linear-gradient(120deg,rgba(251,113,133,0.0)_0px,rgba(251,113,133,0.0)_5px,rgba(251,113,133,0.55)_7px,rgba(251,113,133,0.08)_12px)]"
            style={{
              width: `${pressurePct}%`,
              opacity: 0.34 + Math.min(0.34, pressurePct / 100),
            }}
          />
        ) : null}
        <div
          ref={meterFillRef}
          className={`relative h-full rounded-full ${stanceBarClassName}`}
          style={{ width: `${meterTargetPct}%` }}
        >
          <div
            ref={meterPatternRef}
            className="pointer-events-none absolute inset-y-0 -left-12 w-[160%] bg-[repeating-linear-gradient(120deg,rgba(255,255,255,0.0)_0px,rgba(255,255,255,0.0)_8px,rgba(255,255,255,0.3)_10px,rgba(255,255,255,0.0)_16px)] mix-blend-screen"
            style={{ opacity: 0.3, transform: "translate3d(0,0,0)" }}
          />
        </div>
      </div>
      {frontierEnabled ? (
        <div
          ref={frontierCursorRef}
          className="pointer-events-none absolute top-1/2 z-[2] will-change-transform"
          style={{ left: "50%", transform: "translate3d(-50%,-50%,0)" }}
        >
          <div
            ref={frontierBurstRef}
            className="absolute left-1/2 top-1/2 h-7 w-7 rounded-full border border-cyan-200/70 opacity-0"
            style={{ transform: "translate3d(-50%,-50%,0) scale(0.7)" }}
          />
          {!frontierIconBroken ? (
            <img
              ref={frontierIconRef}
              src={frontierIconPath}
              alt={frontierIconAlt}
              className="relative z-[3] h-6 w-6 object-contain mix-blend-screen drop-shadow-[0_0_16px_rgba(148,163,184,0.6)]"
              loading="lazy"
              onError={(event) => {
                onFrontierIconError(event.currentTarget?.currentSrc?.trim() || null);
              }}
            />
          ) : null}
          <span
            ref={frontierTextRef}
            className="relative z-[3] hidden min-w-[56px] rounded-sm border border-white/25 bg-black/50 px-1 py-0.5 text-[8px] uppercase tracking-[0.16em]"
          />
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-[2]">
            {frontierParticles.map((particle, index) => (
              <span
                key={particle.id}
                ref={(node) => {
                  frontierParticleRefs.current[index] = node;
                }}
                className="absolute left-0 top-0 block rounded-full"
                style={{ opacity: 0, transform: "translate3d(0,0,0)" }}
              />
            ))}
          </div>
        </div>
      ) : null}
      {floatingActionTexts.map((pop) => (
        <span
          key={pop.id}
          data-testid="helix-ask-reasoning-floating-action-text"
          className={`pointer-events-none absolute top-1/2 z-[4] rounded border px-1.5 py-0.5 text-[9px] font-medium uppercase leading-none tracking-[0.12em] shadow-[0_0_12px_rgba(255,255,255,0.12)] backdrop-blur-sm ${reasoningTheaterFloatingActionTextClassName(pop.tone)}`}
          style={
            {
              left: `${pop.leftPct}%`,
              animation: `helixReasoningFloatingText ${pop.durationMs}ms ease-out forwards`,
              "--helix-pop-drift": `${pop.driftPx}px`,
              "--helix-pop-y": `${pop.yPx}px`,
            } as React.CSSProperties & Record<string, string>
          }
        >
          {pop.text}
        </span>
      ))}
    </div>
  );
}
