import React, { type ReactNode, type Ref } from "react";

import {
  HelixAskComposerActionToolbarSurface,
  type HelixAskComposerActionToolbarSurfaceProps,
} from "./HelixAskComposerActionToolbarSurface";
import {
  HelixAskComposerTextareaSurface,
  type HelixAskComposerTextareaSurfaceProps,
} from "./HelixAskComposerTextareaSurface";
import {
  HelixAskMoodAvatarSurface,
  type HelixAskMoodAvatarSurfaceProps,
} from "./HelixAskMoodAvatarSurface";
import { HelixAskSurfaceComposerPanel } from "./HelixAskSurfaceComposerPanel";
import {
  HelixAskVoiceLevelMonitorSurface,
  type HelixAskVoiceLevelMonitorSurfaceProps,
} from "./HelixAskVoiceLevelMonitorSurface";

export type HelixAskLegacyComposerSurfaceProps = {
  destination?: ReactNode;
  voiceLevelMonitor: HelixAskVoiceLevelMonitorSurfaceProps;
  moodAvatar: HelixAskMoodAvatarSurfaceProps;
  actionToolbar: HelixAskComposerActionToolbarSurfaceProps;
  textarea: HelixAskComposerTextareaSurfaceProps;
  textareaRef?: Ref<HTMLTextAreaElement>;
  slashCommandMenu?: ReactNode;
};

export function HelixAskLegacyComposerSurface({
  destination,
  voiceLevelMonitor,
  moodAvatar,
  actionToolbar,
  textarea,
  textareaRef,
  slashCommandMenu,
}: HelixAskLegacyComposerSurfaceProps) {
  return (
    <HelixAskSurfaceComposerPanel
      destination={destination}
      voiceLevelMonitor={<HelixAskVoiceLevelMonitorSurface {...voiceLevelMonitor} />}
      moodAvatar={<HelixAskMoodAvatarSurface {...moodAvatar} />}
      actionToolbar={<HelixAskComposerActionToolbarSurface {...actionToolbar} />}
      textarea={<HelixAskComposerTextareaSurface {...textarea} ref={textareaRef} />}
      slashCommandMenu={slashCommandMenu}
    />
  );
}
