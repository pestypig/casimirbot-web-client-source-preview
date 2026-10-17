import React, { type ReactNode } from "react";

export type HelixAskSurfaceComposerPanelProps = {
  destination?: ReactNode;
  voiceLevelMonitor?: ReactNode;
  moodAvatar: ReactNode;
  actionToolbar: ReactNode;
  textarea: ReactNode;
  slashCommandMenu?: ReactNode;
};

export function HelixAskSurfaceComposerPanel({
  destination = null,
  voiceLevelMonitor = null,
  moodAvatar,
  actionToolbar,
  textarea,
  slashCommandMenu = null,
}: HelixAskSurfaceComposerPanelProps) {
  return (
    <>
      {voiceLevelMonitor}
      <div className="relative z-[80] flex flex-col gap-2 px-4 py-3">
        {destination}
        <div className="flex flex-wrap items-center gap-3">
          {moodAvatar}
          {actionToolbar}
        </div>
        <div className="relative z-[90] min-w-0 overflow-visible">
          {textarea}
          {slashCommandMenu}
        </div>
      </div>
    </>
  );
}
