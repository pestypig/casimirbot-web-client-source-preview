import React from "react";
import { useState } from "react";
import { ExternalLink, Mic2, RefreshCw, ScrollText, VolumeX } from "lucide-react";
import type {
  LiveSituationArtifact,
  LiveSituationArtifactDelta,
} from "@shared/helix-live-situation-artifact";
import { LiveSituationDeltaTrace } from "@/components/helix/LiveSituationDeltaTrace";

const stripLabel = (value: string, labels: string[]): string => {
  let next = value.trim();
  for (const label of labels) {
    next = next.replace(new RegExp(`^${label}:\\s*`, "i"), "").trim();
  }
  return next;
};

export function LiveSituationArtifactCard({
  artifact,
  deltas = [],
  stale = false,
  speakable = false,
  onAskHelix,
  onOpenSituation,
  onGoToLog,
  onSpeak,
  onSuppress,
  onDismiss,
}: {
  artifact: LiveSituationArtifact;
  deltas?: LiveSituationArtifactDelta[];
  stale?: boolean;
  speakable?: boolean;
  onAskHelix?: (prompt: string) => void;
  onOpenSituation?: () => void;
  onGoToLog?: () => void;
  onSpeak?: () => void;
  onSuppress?: () => void;
  onDismiss?: () => void;
}) {
  const [traceOpen, setTraceOpen] = useState(false);
  const lines = artifact.current_state_lines;
  const speakAllowed = speakable && artifact.mode === "voice_on_confirm";

  return (
    <section className="mb-2 w-full rounded-lg border border-emerald-300/20 bg-emerald-950/15 px-3 py-2 text-left text-xs text-emerald-50">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-200">
            Minecraft Situation: {artifact.status} · {artifact.mode}
          </p>
          <p className="mt-1 break-words text-sm text-emerald-50">{artifact.objective}</p>
        </div>
        <span className="shrink-0 rounded border border-emerald-300/35 bg-emerald-400/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-emerald-100">
          {stale ? "stale" : "live"}
        </span>
      </div>

      <div className="mt-2 grid gap-1.5 text-[11px] text-emerald-50/90">
        <p><span className="text-emerald-200/80">Now: </span>{stripLabel(lines.now, ["Now"])}</p>
        <p><span className="text-emerald-200/80">Goal: </span>{stripLabel(lines.goal, ["Goal", "Likely goal"])}</p>
        <p><span className="text-emerald-200/80">Risk: </span>{stripLabel(lines.risk, ["Risk"])}</p>
        <p><span className="text-emerald-200/80">Progress: </span>{stripLabel(lines.progress, ["Progress", "Recent progress"])}</p>
        <p><span className="text-emerald-200/80">Unknowns: </span>{stripLabel(lines.unknowns, ["Unknowns", "Open question"])}</p>
        <p><span className="text-emerald-200/80">Last decision: </span>{stripLabel(lines.last_decision, ["Last decision", "Last"])}</p>
      </div>

      {artifact.subgoals.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {artifact.subgoals.slice(0, 4).map((subgoal) => (
            <span
              key={subgoal.subgoal_id}
              className="rounded border border-emerald-300/25 bg-black/20 px-2 py-0.5 text-[10px] text-emerald-100"
            >
              {subgoal.label}: {subgoal.status}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onGoToLog ?? onOpenSituation}
          className="inline-flex items-center gap-1 rounded border border-emerald-300/25 px-2 py-1 text-[11px] text-emerald-50 hover:bg-emerald-400/10"
        >
          <ScrollText className="h-3 w-3" aria-hidden />
          Go to log
        </button>
        <button
          type="button"
          onClick={() => onAskHelix?.("Run an agentic review of the latest interpreted Minecraft situation and update the present-state card.")}
          className="inline-flex items-center gap-1 rounded border border-emerald-300/25 px-2 py-1 text-[11px] text-emerald-50 hover:bg-emerald-400/10"
        >
          <RefreshCw className="h-3 w-3" aria-hidden />
          Run review
        </button>
        <button
          type="button"
          onClick={() => onAskHelix?.("Correction for the interpreted situation: ")}
          className="rounded border border-white/10 px-2 py-1 text-[11px] text-emerald-50 hover:bg-white/10"
        >
          Correct this
        </button>
        <button
          type="button"
          onClick={onOpenSituation}
          className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[11px] text-emerald-50 hover:bg-white/10"
        >
          <ExternalLink className="h-3 w-3" aria-hidden />
          Open Situation Room
        </button>
        <button
          type="button"
          onClick={() => setTraceOpen((value) => !value)}
          className="rounded border border-white/10 px-2 py-1 text-[11px] text-emerald-50 hover:bg-white/10"
        >
          {traceOpen ? "Hide trace" : "Show trace"}
        </button>
        {speakAllowed ? (
          <button
            type="button"
            onClick={onSpeak}
            className="inline-flex items-center gap-1 rounded border border-cyan-300/30 px-2 py-1 text-[11px] text-cyan-100 hover:bg-cyan-400/10"
          >
            <Mic2 className="h-3 w-3" aria-hidden />
            Speak latest
          </button>
        ) : null}
        <button
          type="button"
          onClick={onSuppress}
          className="inline-flex items-center gap-1 rounded border border-white/10 px-2 py-1 text-[11px] text-emerald-50 hover:bg-white/10"
        >
          <VolumeX className="h-3 w-3" aria-hidden />
          Keep silent
        </button>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded border border-white/10 px-2 py-1 text-[11px] text-emerald-50 hover:bg-white/10"
          >
            Dismiss card
          </button>
        ) : null}
      </div>

      {traceOpen ? (
        <div className="mt-3">
          <LiveSituationDeltaTrace deltas={deltas} />
        </div>
      ) : null}
    </section>
  );
}
