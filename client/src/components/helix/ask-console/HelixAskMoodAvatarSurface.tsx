import React from "react";

import {
  HelixAskMoodAvatar,
  type HelixAskMoodAvatarProps,
} from "./HelixAskMoodAvatar";

export type HelixAskMoodAvatarSurfaceProps = HelixAskMoodAvatarProps;

export function HelixAskMoodAvatarSurface(props: HelixAskMoodAvatarSurfaceProps) {
  return <HelixAskMoodAvatar {...props} />;
}
