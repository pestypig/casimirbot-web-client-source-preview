import type { HelixAskLegacyConsoleViewProps } from "./HelixAskLegacyConsoleView";

export type HelixAskLegacyConsoleRootState = Pick<
  HelixAskLegacyConsoleViewProps,
  "className" | "layoutVariant"
>;

export type HelixAskLegacyConsoleRootStateOptions = HelixAskLegacyConsoleRootState;

export function buildHelixAskLegacyConsoleRootState({
  className,
  layoutVariant,
}: HelixAskLegacyConsoleRootStateOptions): HelixAskLegacyConsoleRootState {
  return {
    className,
    layoutVariant,
  };
}
