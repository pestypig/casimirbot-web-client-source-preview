import {
  HelixAskProceduralTimeline,
  type HelixAskProceduralTimelineProps,
} from "./HelixAskProceduralTimeline";

export type HelixAskLegacyProceduralTimelineSlotProps = HelixAskProceduralTimelineProps;

export function HelixAskLegacyProceduralTimelineSlot(props: HelixAskLegacyProceduralTimelineSlotProps) {
  return <HelixAskProceduralTimeline {...props} />;
}
