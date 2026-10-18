import type { HelixAskLegacyConsoleViewProps } from "./HelixAskLegacyConsoleView";

export type HelixAskLegacyConsoleViewState = Pick<
  HelixAskLegacyConsoleViewProps,
  | "className"
  | "layoutVariant"
  | "surfaceFrameState"
  | "surfaceContentState"
  | "goalPillState"
  | "errorLineState"
  | "turnListState"
>;

export type HelixAskLegacyConsoleViewStateOptions = HelixAskLegacyConsoleViewState;

export function buildHelixAskLegacyConsoleViewState({
  className,
  layoutVariant,
  surfaceFrameState,
  surfaceContentState,
  goalPillState,
  errorLineState,
  turnListState,
}: HelixAskLegacyConsoleViewStateOptions): HelixAskLegacyConsoleViewState {
  return {
    className,
    layoutVariant,
    surfaceFrameState,
    surfaceContentState,
    goalPillState,
    errorLineState,
    turnListState,
  };
}
