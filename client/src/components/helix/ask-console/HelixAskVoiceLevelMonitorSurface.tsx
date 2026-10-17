import React from "react";

import {
  HelixAskVoiceLevelMonitor,
  type HelixAskVoiceLevelMonitorProps,
} from "./HelixAskVoiceLevelMonitor";

export type HelixAskVoiceLevelMonitorSurfaceProps = HelixAskVoiceLevelMonitorProps;

export function HelixAskVoiceLevelMonitorSurface(props: HelixAskVoiceLevelMonitorSurfaceProps) {
  return <HelixAskVoiceLevelMonitor {...props} />;
}
