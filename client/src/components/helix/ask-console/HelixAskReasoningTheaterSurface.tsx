import type { Ref, RefObject } from "react";
import {
  mirekCellParticleClassName,
  type MirekReasoningDisplayGrid,
  type ReasoningTheaterFrontierParticleNode,
  type ReasoningTheaterParticle,
} from "@/lib/helix/ask-reasoning-theater-display";
import type { ReasoningTheaterFloatingActionText } from "@/lib/helix/ask-reasoning-frontier-display";
import type {
  ReasoningBattleAmbientState,
  ReasoningBattleBeat,
} from "@/lib/helix/reasoning-battle-stage";
import { HelixAskBusyReasoningPanel } from "./HelixAskBusyReasoningPanel";
import { HelixAskReasoningMeterSurface } from "./HelixAskReasoningMeterSurface";
import { HelixAskReasoningMirekField } from "./HelixAskReasoningMirekField";
import {
  HelixAskReasoningStatusMedalStrip,
  type HelixAskReasoningLatestMedalView,
  type HelixAskReasoningMedalPulseView,
} from "./HelixAskReasoningStatusMedalStrip";

export type HelixAskReasoningTheaterSurfaceProps = {
  visible: boolean;
  liveBorderClassName: string;
  replyTintClassName: string;
  active: boolean;
  mirekGrid: MirekReasoningDisplayGrid | null;
  fogOpacity: number;
  fieldStrength: number;
  particles: ReasoningTheaterParticle[];
  status: {
    stanceBadgeClassName: string;
    stanceLabel: string;
    archetypeLabel: string;
    phaseLabel: string;
    certaintyLabel: string;
    medals: HelixAskReasoningMedalPulseView[];
    latestMedal: HelixAskReasoningLatestMedalView | null;
    onMedalImageError: (token: string, currentSrc: string | null) => void;
  };
  meter: {
    beats: ReasoningBattleBeat[];
    pressurePct: number;
    reducedMotion: boolean;
    ambient: ReasoningBattleAmbientState | null;
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
};

export function HelixAskReasoningTheaterSurface({
  visible,
  liveBorderClassName,
  replyTintClassName,
  active,
  mirekGrid,
  fogOpacity,
  fieldStrength,
  particles,
  status,
  meter,
}: HelixAskReasoningTheaterSurfaceProps) {
  return (
    <HelixAskBusyReasoningPanel
      visible={visible}
      liveBorderClassName={liveBorderClassName}
      replyTintClassName={replyTintClassName}
    >
      <HelixAskReasoningMirekField
        grid={active ? mirekGrid : null}
        fogOpacity={fogOpacity}
        fieldStrength={fieldStrength}
      />
      <div className="relative">
        {active ? (
          <div className="relative mb-2 overflow-hidden px-1 py-1">
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              <div className="absolute inset-0">
                {particles.map((particle) => (
                  <span
                    key={particle.id}
                    className={`absolute rounded-full animate-pulse ${mirekCellParticleClassName(particle.kind)}`}
                    style={{
                      left: `${particle.leftPct}%`,
                      top: `${particle.topPct}%`,
                      width: `${particle.sizePx}px`,
                      height: `${particle.sizePx}px`,
                      opacity:
                        particle.opacity *
                        (0.35 + fogOpacity * 0.35) *
                        fieldStrength,
                      animationDelay: `${particle.delayS}s`,
                      animationDuration: `${particle.durationS}s`,
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="relative">
              <HelixAskReasoningStatusMedalStrip
                stanceBadgeClassName={status.stanceBadgeClassName}
                stanceLabel={status.stanceLabel}
                archetypeLabel={status.archetypeLabel}
                phaseLabel={status.phaseLabel}
                certaintyLabel={status.certaintyLabel}
                medals={status.medals}
                latestMedal={status.latestMedal}
                onMedalImageError={status.onMedalImageError}
              />
              <HelixAskReasoningMeterSurface
                beats={meter.beats}
                pressurePct={meter.pressurePct}
                reducedMotion={meter.reducedMotion}
                ambient={meter.ambient}
                particles={particles}
                fogOpacity={fogOpacity}
                fieldStrength={fieldStrength}
                stanceBarClassName={meter.stanceBarClassName}
                meterTargetPct={meter.meterTargetPct}
                meterFillRef={meter.meterFillRef}
                meterPatternRef={meter.meterPatternRef}
                frontierEnabled={meter.frontierEnabled}
                frontierCursorRef={meter.frontierCursorRef}
                frontierBurstRef={meter.frontierBurstRef}
                frontierIconRef={meter.frontierIconRef}
                frontierTextRef={meter.frontierTextRef}
                frontierParticleRefs={meter.frontierParticleRefs}
                frontierIconBroken={meter.frontierIconBroken}
                frontierIconPath={meter.frontierIconPath}
                frontierIconAlt={meter.frontierIconAlt}
                onFrontierIconError={meter.onFrontierIconError}
                frontierParticles={meter.frontierParticles}
                floatingActionTexts={meter.floatingActionTexts}
              />
            </div>
          </div>
        ) : null}
      </div>
    </HelixAskBusyReasoningPanel>
  );
}
