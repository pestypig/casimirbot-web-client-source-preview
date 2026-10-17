import type { HelixAskReasoningTheaterSurfaceProps } from "./HelixAskReasoningTheaterSurface";

export type HelixAskReasoningTheaterStateOptions = HelixAskReasoningTheaterSurfaceProps;

export function buildHelixAskReasoningTheaterState({
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
}: HelixAskReasoningTheaterStateOptions): HelixAskReasoningTheaterSurfaceProps {
  return {
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
  };
}
