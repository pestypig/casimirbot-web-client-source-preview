import React from "react";

import {
  HelixAskSurfaceFrame,
  type HelixAskSurfaceFrameProps,
} from "./HelixAskSurfaceFrame";

export type HelixAskSurfaceFrameSurfaceProps = HelixAskSurfaceFrameProps;

export function HelixAskSurfaceFrameSurface(props: HelixAskSurfaceFrameSurfaceProps) {
  return <HelixAskSurfaceFrame {...props} />;
}
