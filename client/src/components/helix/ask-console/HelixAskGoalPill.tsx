import React from "react";
import { ChevronDown, PauseCircle, Pencil, PlayCircle, Trash2 } from "lucide-react";
import type { AgentGoalSessionV1 } from "@shared/contracts/workstation-goal-context.v1";
import {
  formatGoalPillCadence,
  labelizeGoalPillValue,
} from "@/lib/helix/ask-goal-pill-display";

export type StagePlayGoalSessionAction =
  | "pause"
  | "resume"
  | "edit_objective"
  | "archive"
  | "stop"
  | "mark_satisfied";

export type HelixAskGoalPillProps = {
  session: AgentGoalSessionV1;
  expanded: boolean;
  busyAction: StagePlayGoalSessionAction | null;
  error: string | null;
  onToggleExpanded: () => void;
  onAction: (action: StagePlayGoalSessionAction) => void;
};

function clipGoalPillText(value: string | undefined, limit: number): string {
  if (!value) return "";
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}...`;
}

export function HelixAskGoalPill({
  session,
  expanded,
  busyAction,
  error,
  onToggleExpanded,
  onAction,
}: HelixAskGoalPillProps) {
  const isPaused = session.status === "paused";
  const latestCheckpoint = session.checkpoints.at(-1);
  const statusTone =
    session.status === "blocked"
      ? "border-amber-300/35 bg-amber-400/10 text-amber-100"
      : session.status === "paused"
        ? "border-slate-300/20 bg-slate-300/10 text-slate-100"
        : "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  const controlsDisabled = Boolean(busyAction);

  return (
    <section
      className="mt-2 rounded-2xl border border-white/10 bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-100 shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
      aria-label="Helix Ask goal session"
      data-testid="helix-ask-goal-pill"
      data-goal-status={session.status}
      data-expanded={expanded ? "true" : "false"}
    >
      <div className="flex items-center gap-2">
        <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-goal-pill.on-toggle-expanded"
          type="button"
          aria-expanded={expanded}
          aria-controls="helix-ask-goal-pill-details"
          onClick={onToggleExpanded}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1 py-0.5 text-left hover:bg-white/5"
        >
          <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-slate-300">
            {labelizeGoalPillValue(session.status)} goal
          </span>
          <span className="min-w-0 truncate text-[11px] font-semibold text-slate-200">
            {clipGoalPillText(session.userVisibleSummary || session.objective, 112)}
          </span>
          <span className={`hidden shrink-0 rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] sm:inline-flex ${statusTone}`}>
            {formatGoalPillCadence(session.cadence)}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-goal-pill.edit-goal-prompt"
            type="button"
            aria-label="Edit goal prompt"
            title="Edit goal prompt"
            disabled={controlsDisabled}
            onClick={() => onAction("edit_objective")}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-goal-pill.on-action-is-paused-resume-pause"
            type="button"
            aria-label={isPaused ? "Resume goal" : "Pause goal"}
            title={isPaused ? "Resume goal" : "Pause goal"}
            disabled={controlsDisabled}
            onClick={() => onAction(isPaused ? "resume" : "pause")}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isPaused ? <PlayCircle className="h-3.5 w-3.5" aria-hidden /> : <PauseCircle className="h-3.5 w-3.5" aria-hidden />}
          </button>
          <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-goal-pill.archive-goal"
            type="button"
            aria-label="Archive goal"
            title="Archive goal"
            disabled={controlsDisabled}
            onClick={() => onAction("archive")}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-goal-pill.on-toggle-expanded.2"
            type="button"
            aria-label={expanded ? "Collapse goal details" : "Expand goal details"}
            title={expanded ? "Collapse goal details" : "Expand goal details"}
            onClick={onToggleExpanded}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden />
          </button>
        </div>
      </div>
      {expanded ? (
        <div id="helix-ask-goal-pill-details" className="mt-2 grid gap-1.5 rounded-xl border border-white/10 bg-black/20 p-2 text-[11px] text-slate-300">
          <div className="break-words leading-4 text-slate-200">{session.objective}</div>
          <div className="grid gap-1 font-mono text-[9px] text-slate-500 sm:grid-cols-2">
            <div>feeds={session.contextFeeds.map((feed) => labelizeGoalPillValue(feed.sourceKind)).join(", ") || "none"}</div>
            <div>actuators={session.allowedActuators.slice(0, 8).map(labelizeGoalPillValue).join(", ") || "none"}</div>
            <div>loops={session.loopRefs.slice(0, 4).join(", ") || "none"}</div>
            <div>checkpoint={latestCheckpoint?.summary ?? "none"}</div>
            <div>terminal_authority={String(session.authority.finalReportsRequireTerminalAuthority)}</div>
            <div>stop={session.stopConditions.slice(0, 2).join(" | ") || "none"}</div>
          </div>
        </div>
      ) : null}
      {busyAction || error ? (
        <p className={`mt-1 px-1 text-[10px] ${error ? "text-rose-200" : "text-slate-400"}`}>
          {error ?? `${labelizeGoalPillValue(busyAction)}...`}
        </p>
      ) : null}
    </section>
  );
}
