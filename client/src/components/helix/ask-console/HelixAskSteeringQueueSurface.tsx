import type { HelixAskSteeringQueueItem } from "@/lib/helix/ask-steering-queue-display";

import { HelixAskSteeringQueuePanel } from "./HelixAskSteeringQueuePanel";

export type HelixAskSteeringQueueSurfaceProps = {
  items?: HelixAskSteeringQueueItem[] | null;
  activeCount?: number;
  expanded?: boolean;
  onToggleExpanded?: (() => void) | null;
};

export function HelixAskSteeringQueueSurface({
  items,
  activeCount = 0,
  expanded = false,
  onToggleExpanded,
}: HelixAskSteeringQueueSurfaceProps) {
  if (!items || items.length === 0 || !onToggleExpanded) return null;

  return (
    <HelixAskSteeringQueuePanel
      items={items}
      activeCount={activeCount}
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
    />
  );
}
