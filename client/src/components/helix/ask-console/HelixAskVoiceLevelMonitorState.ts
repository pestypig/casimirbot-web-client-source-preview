import type { HelixAskVoiceLevelMonitorSurfaceProps } from "./HelixAskVoiceLevelMonitorSurface";

export type HelixAskVoiceLevelMonitorState = HelixAskVoiceLevelMonitorSurfaceProps;

export type HelixAskVoiceLevelMonitorStateOptions = Omit<
  HelixAskVoiceLevelMonitorSurfaceProps,
  "visible"
> & {
  micArmState: "off" | "on";
};

export function buildHelixAskVoiceLevelMonitorState({
  micArmState,
  maxHeightPx,
  level,
  signalState,
  anchorRef,
}: HelixAskVoiceLevelMonitorStateOptions): HelixAskVoiceLevelMonitorState {
  return {
    visible: micArmState === "on",
    maxHeightPx,
    level,
    signalState,
    anchorRef,
  };
}
