import type { HelixAskLegacySurfaceContentProps } from "./HelixAskLegacySurfaceContent";

export type HelixAskLegacySurfaceContentStateOptions = HelixAskLegacySurfaceContentProps;

export function buildHelixAskLegacySurfaceContentState({
  composer,
  supplement,
  reasoningTheater,
}: HelixAskLegacySurfaceContentStateOptions): HelixAskLegacySurfaceContentProps {
  return {
    composer,
    supplement,
    reasoningTheater,
  };
}
