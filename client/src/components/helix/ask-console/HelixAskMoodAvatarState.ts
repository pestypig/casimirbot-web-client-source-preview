import type { HelixAskMoodAvatarSurfaceProps } from "./HelixAskMoodAvatarSurface";

export type HelixAskMoodAvatarState = HelixAskMoodAvatarSurfaceProps;

export type HelixAskMoodAvatarStateOptions = HelixAskMoodAvatarSurfaceProps;

export function buildHelixAskMoodAvatarState({
  auraClassName,
  ringClassName,
  moodSrc,
  moodLabel,
  onImageError,
}: HelixAskMoodAvatarStateOptions): HelixAskMoodAvatarState {
  return {
    auraClassName,
    ringClassName,
    moodSrc,
    moodLabel,
    onImageError,
  };
}
