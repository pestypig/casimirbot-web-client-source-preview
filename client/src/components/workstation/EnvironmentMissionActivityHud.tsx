import React from "react";
import {
  helixEnvironmentMissionActivityProjectionSchema,
  type HelixEnvironmentMissionActivityProjection,
} from "@shared/helix-environment-mission-activity-projection";

/** Read-only presentation. The host must supply exact-scope projections. */
export default function EnvironmentMissionActivityHud({
  missionLabel, runId, projections,
}: {
  missionLabel: string;
  runId: string;
  projections: unknown[];
}) {
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  React.useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);
  const safeEvents = projections
    .map(item => helixEnvironmentMissionActivityProjectionSchema.safeParse(item))
    .filter((result): result is { success: true; data: HelixEnvironmentMissionActivityProjection } => result.success)
    .map(result => result.data)
    .filter(item => {
      const ageMs = nowMs - Date.parse(item.observed_at);
      return item.surface === "overlay" && item.run_id === runId &&
        ageMs >= -5_000 && ageMs <= 60_000;
    })
    .sort((left, right) => right.projection_sequence - left.projection_sequence)
    .slice(0, 3);

  return <aside aria-label="Mission activity overlay" data-content-role="mission_activity_not_assistant_answer"
    className="pointer-events-none max-w-sm rounded-xl border border-white/20 bg-slate-950/80 p-3 text-sm text-white shadow-lg">
    <div className="flex items-center justify-between gap-2 border-b border-white/15 pb-2">
      <span className="font-medium">{missionLabel}</span>
      <span className="text-xs text-slate-300">Published activity</span>
    </div>
    {safeEvents.length ? <ol className="mt-2 space-y-2">
      {safeEvents.map(item => <li key={item.activity_event_id}>
        <span className="text-xs text-cyan-200">{item.label} · {item.outcome}</span>
        <p className="text-slate-100">{item.summary}</p>
      </li>)}
    </ol> : <p className="mt-2 text-slate-300">Waiting for verified mission activity.</p>}
    <p className="mt-2 text-[11px] text-slate-400">Public receipts, not private reasoning or permission to act.</p>
  </aside>;
}
