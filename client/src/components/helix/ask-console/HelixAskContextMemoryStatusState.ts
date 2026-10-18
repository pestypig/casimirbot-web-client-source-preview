import type { HelixAskConsoleSupplementSurfaceProps } from "./HelixAskConsoleSupplementSurface";

export type HelixAskContextMemoryStatusState = Pick<
  HelixAskConsoleSupplementSurfaceProps,
  "contextMemoryStatusText"
>;

export type HelixAskContextMemoryStatusStateOptions = HelixAskContextMemoryStatusState;

export function buildHelixAskContextMemoryStatusState({
  contextMemoryStatusText,
}: HelixAskContextMemoryStatusStateOptions): HelixAskContextMemoryStatusState {
  return {
    contextMemoryStatusText,
  };
}
