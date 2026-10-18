import type { HelixAskConsoleSupplementSurfaceProps } from "./HelixAskConsoleSupplementSurface";

export type HelixAskContextChooserStateOptions =
  HelixAskConsoleSupplementSurfaceProps["contextChooser"];

export function buildHelixAskContextChooserState({
  visible,
  autoContextMode,
  countdownSec,
  onRunAttached,
  onRunIsolated,
  onCancel,
}: HelixAskContextChooserStateOptions): HelixAskConsoleSupplementSurfaceProps["contextChooser"] {
  return {
    visible,
    autoContextMode,
    countdownSec,
    onRunAttached,
    onRunIsolated,
    onCancel,
  };
}
