import type { HelixAskLegacyComposerSurfaceProps } from "./HelixAskLegacyComposerSurface";

export type HelixAskLegacyComposerStateOptions = HelixAskLegacyComposerSurfaceProps;

export function buildHelixAskLegacyComposerState({
  destination,
  voiceLevelMonitor,
  moodAvatar,
  actionToolbar,
  textarea,
  textareaRef,
  slashCommandMenu,
}: HelixAskLegacyComposerStateOptions): HelixAskLegacyComposerSurfaceProps {
  return {
    destination,
    voiceLevelMonitor,
    moodAvatar,
    actionToolbar,
    textarea,
    textareaRef,
    slashCommandMenu,
  };
}
