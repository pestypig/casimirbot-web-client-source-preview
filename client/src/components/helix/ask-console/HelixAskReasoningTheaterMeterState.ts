import type { HelixAskReasoningTheaterSurfaceProps } from "./HelixAskReasoningTheaterSurface";

export type HelixAskReasoningTheaterMeterState = HelixAskReasoningTheaterSurfaceProps["meter"];

export type HelixAskReasoningTheaterMeterStateOptions = HelixAskReasoningTheaterMeterState;

export function buildHelixAskReasoningTheaterMeterState({
  beats,
  pressurePct,
  reducedMotion,
  ambient,
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
}: HelixAskReasoningTheaterMeterStateOptions): HelixAskReasoningTheaterMeterState {
  return {
    beats,
    pressurePct,
    reducedMotion,
    ambient,
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
  };
}
