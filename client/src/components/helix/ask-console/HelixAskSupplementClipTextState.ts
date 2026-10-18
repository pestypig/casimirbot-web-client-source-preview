import type { HelixAskConsoleSupplementSurfaceProps } from "./HelixAskConsoleSupplementSurface";

export type HelixAskSupplementClipTextState = Pick<
  HelixAskConsoleSupplementSurfaceProps,
  "clipText"
>;

export type HelixAskSupplementClipTextStateOptions = HelixAskSupplementClipTextState;

export function buildHelixAskSupplementClipTextState({
  clipText,
}: HelixAskSupplementClipTextStateOptions): HelixAskSupplementClipTextState {
  return {
    clipText,
  };
}
