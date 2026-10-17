import type { HelixStandbyActivityItem } from "@shared/helix-standby-activity";

export function HelixStandbyCalloutCard({
  activity,
  onDismiss,
  onPin,
  onAskHelix,
}: {
  activity: HelixStandbyActivityItem;
  onDismiss: (activityId: string) => void;
  onPin: (activityId: string) => void;
  onAskHelix?: (prompt: string) => void;
}) {
  const priorityTone =
    activity.priority === "critical" || activity.priority === "action"
      ? "border-red-300/35 bg-red-950/25 text-red-50"
      : activity.priority === "warn"
        ? "border-amber-300/35 bg-amber-950/25 text-amber-50"
        : "border-sky-300/30 bg-sky-950/20 text-sky-50";

  return (
    <article className={`rounded border p-2 text-xs ${priorityTone}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wide opacity-70">
            {activity.kind.replace(/_/g, " ")} / {activity.priority}
          </div>
          <p className="mt-1 font-semibold leading-snug">{activity.summary}</p>
          <p className="mt-1 text-[11px] opacity-75">
            Source: {activity.provenance.model_invoked ? "standby micro reasoner" : "deterministic standby observation"}
          </p>
        </div>
        <span className="shrink-0 rounded border border-white/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
          {activity.decision ?? "observed"}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => onDismiss(activity.activity_id)}
          className="rounded border border-white/15 px-2 py-1 text-[11px] hover:bg-white/10"
        >
          Keep silent
        </button>
        <button
          type="button"
          onClick={() => onPin(activity.activity_id)}
          className="rounded border border-white/15 px-2 py-1 text-[11px] hover:bg-white/10"
        >
          Pin
        </button>
        <button
          type="button"
          onClick={() => onAskHelix?.(`Review this standby activity with explicit context: ${activity.summary}`)}
          className="rounded border border-white/15 px-2 py-1 text-[11px] hover:bg-white/10"
        >
          Ask Helix about this
        </button>
      </div>
      {activity.evidence_refs.length > 0 ? (
        <div className="mt-2 truncate text-[10px] opacity-70">
          Evidence: {activity.evidence_refs.slice(0, 2).join(", ")}
        </div>
      ) : null}
    </article>
  );
}
