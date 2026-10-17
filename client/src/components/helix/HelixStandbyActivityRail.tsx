import { useEffect } from "react";
import { HelixStandbyCalloutCard } from "@/components/helix/HelixStandbyCalloutCard";
import { HelixStandbyQueueBadge } from "@/components/helix/HelixStandbyQueueBadge";
import {
  selectVisibleDockActivities,
  useHelixStandbyActivityStore,
  type HelixStandbyActivityItem,
  type HelixStandbyActivityState,
} from "@/store/useHelixStandbyActivityStore";

export function HelixStandbyActivityRail({
  threadId,
  onAskHelix,
}: {
  threadId: string;
  onAskHelix?: (prompt: string) => void;
}) {
  const activities = useHelixStandbyActivityStore((state: HelixStandbyActivityState) =>
    selectVisibleDockActivities(state, threadId),
  );
  const loadThreadActivities = useHelixStandbyActivityStore(
    (state: HelixStandbyActivityState) => state.loadThreadActivities,
  );
  const dismissActivity = useHelixStandbyActivityStore(
    (state: HelixStandbyActivityState) => state.dismissActivity,
  );
  const pinActivity = useHelixStandbyActivityStore((state: HelixStandbyActivityState) => state.pinActivity);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (!cancelled) void loadThreadActivities(threadId, 50);
    };
    load();
    const interval = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [loadThreadActivities, threadId]);

  if (activities.length === 0) return null;
  return (
    <section className="mb-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Standby Activity</div>
        <HelixStandbyQueueBadge label={`${activities.length} visible`} />
      </div>
      <div className="space-y-2">
        {activities.slice(0, 3).map((activity: HelixStandbyActivityItem) => (
          <HelixStandbyCalloutCard
            key={activity.activity_id}
            activity={activity}
            onDismiss={dismissActivity}
            onPin={(activityId: string) => pinActivity(threadId, activityId)}
            onAskHelix={onAskHelix}
          />
        ))}
      </div>
    </section>
  );
}
