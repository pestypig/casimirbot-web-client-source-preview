import React, { forwardRef } from "react";

import {
  HelixAskComposerTextarea,
  type HelixAskComposerTextareaProps,
} from "./HelixAskComposer";

export type HelixAskComposerTextareaSurfaceProps = HelixAskComposerTextareaProps;

export const HelixAskComposerTextareaSurface = forwardRef<
  HTMLTextAreaElement,
  HelixAskComposerTextareaSurfaceProps
>(function HelixAskComposerTextareaSurface(props, ref) {
  return <HelixAskComposerTextarea {...props} ref={ref} />;
});
