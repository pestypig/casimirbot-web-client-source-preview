import type { HelixAskConsoleErrorLineSurfaceProps } from "./HelixAskConsoleErrorLineSurface";

export type HelixAskConsoleErrorLineStateOptions = HelixAskConsoleErrorLineSurfaceProps;

export function buildHelixAskConsoleErrorLineState({
  message,
}: HelixAskConsoleErrorLineStateOptions): HelixAskConsoleErrorLineSurfaceProps {
  return {
    message,
  };
}
