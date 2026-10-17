import React, { useEffect, useMemo, useState } from "react";
import type {
  LiveAnswerEnvironment,
  LiveAnswerEnvironmentDelta,
  LiveAnswerLineState,
} from "@shared/helix-live-answer-environment";
import {
  buildRehearsalSpaceCatalog,
  type HelixRehearsalSpace,
  type HelixRehearsalSpaceAvailabilityInput,
  type HelixRehearsalSpaceId,
} from "@shared/helix-rehearsal-space";
import type { HelixPresentStateCard, HelixPresentStateCardLine } from "@shared/helix-present-state-card";
import { LiveAnswerEnvironmentTrace } from "@/components/helix/LiveAnswerEnvironmentTrace";

const cleanLine = (line: LiveAnswerLineState): string => {
  const value = String(line.value ?? "").trim();
  return value.replace(new RegExp(`^${line.label}:\\s*`, "i"), "").trim();
};

const postEnvironmentAction = (environmentId: string, action: "pause" | "resume" | "stop") => {
  if (typeof fetch !== "function") return;
  void fetch(`/api/agi/situation/live-answer-environment/${encodeURIComponent(environmentId)}/${action}`, {
    method: "POST",
  }).catch(() => undefined);
};

const lineValue = (lines: LiveAnswerLineState[], key: string): string =>
  cleanLine(lines.find((line: LiveAnswerLineState) => line.key === key) ?? { key, label: key, value: "" } as LiveAnswerLineState).toLowerCase();

const STAGE_PLAY_LINE_ORDER = [
  "situation",
  "actor_state",
  "resources",
  "affordances",
  "risk",
  "possibilities",
  "unknowns",
  "next_check",
  "answer_snapshot",
  "voice_output",
] as const;

const STAGE_PLAY_SPECIFIC_LINE_KEYS = new Set<string>([
  "situation",
  "actor_state",
  "resources",
  "affordances",
  "possibilities",
  "unknowns",
  "answer_snapshot",
  "voice_output",
]);

const lineStateToPresentLine = (entry: LiveAnswerLineState): HelixPresentStateCardLine => ({
  key: entry.key,
  label: entry.label,
  value: cleanLine(entry),
  evidence_refs: entry.evidence_refs,
  confidence: null,
  updated_at: entry.updated_at,
});

const isStagePlayBackedEnvironment = (environment: LiveAnswerEnvironment, lines: LiveAnswerLineState[]): boolean => {
  const graphId = String(environment.graph_id ?? "");
  const stagePlayText = [
    environment.objective,
    environment.preset,
    environment.latest_summary,
    graphId,
  ].join("\n");
  if (/stage[_\s-]*play/i.test(stagePlayText)) return true;
  const schemaKeys = Array.isArray(environment.line_schema)
    ? environment.line_schema
        .map((entry: unknown) =>
          entry && typeof entry === "object" && !Array.isArray(entry)
            ? String((entry as { key?: unknown }).key ?? "")
            : "",
        )
        .filter(Boolean)
    : [];
  const keys = Array.from(new Set([
    ...lines.map((line: LiveAnswerLineState) => line.key),
    ...schemaKeys,
  ]));
  return keys.filter((key: string) => STAGE_PLAY_SPECIFIC_LINE_KEYS.has(key)).length >= 2;
};

const stagePlayPreferredLines = (answerLines: LiveAnswerLineState[]): HelixPresentStateCardLine[] => {
  const byKey = new Map(answerLines.map((line: LiveAnswerLineState) => [line.key, line]));
  return STAGE_PLAY_LINE_ORDER
    .map((key) => byKey.get(key))
    .filter((line): line is LiveAnswerLineState => Boolean(line))
    .map(lineStateToPresentLine);
};

const environmentPolicyBadges = (environment: LiveAnswerEnvironment): Array<{ label: string; value: string }> => {
  const lines = Array.isArray(environment.lines) ? environment.lines : [];
  const sourceIds = Array.isArray(environment.source_ids) ? environment.source_ids : [];
  const sourceKinds = new Set<string>();
  if (lines.some((line: LiveAnswerLineState) => ["situation", "actor_state", "resources", "affordances"].includes(line.key))) {
    sourceKinds.add("environment_state");
  }
  if (lines.some((line: LiveAnswerLineState) => ["possibilities", "rehearsal", "recommendation"].includes(line.key))) {
    sourceKinds.add("procedure_graph");
  }
  if (sourceIds.some((sourceId: string) => /visual|frame|screen/i.test(sourceId))) sourceKinds.add("visual_frame");
  if (sourceIds.some((sourceId: string) => /audio|voice|transcript/i.test(sourceId))) sourceKinds.add("audio");
  if (sourceIds.some((sourceId: string) => /simulation|sim/i.test(sourceId))) sourceKinds.add("simulation");

  const possibility = lineValue(lines, "possibilities");
  const rehearsal = lineValue(lines, "rehearsal");
  const recommendation = lineValue(lines, "recommendation");
  return [
    { label: "Source", value: Array.from(sourceKinds).join(" / ") || "none" },
    {
      label: "Possibility",
      value: /stale/.test(possibility) ? "stale" : /candidate|possible|retrieve|visible affordance/.test(possibility) ? "candidate exists" : "none",
    },
    {
      label: "Rehearsal",
      value: /blocked/.test(rehearsal) ? "blocked" : /partial|caveat/.test(rehearsal) ? "partial" : /risky/.test(rehearsal) ? "risky" : /passed|feasible/.test(rehearsal) ? "feasible" : "not run",
    },
    {
      label: "Recommendation",
      value: /confirmation/.test(recommendation) ? "needs confirmation" : /caveat|recheck/.test(recommendation) ? "suggested with caveat" : recommendation.trim() ? "safe to suggest" : "hidden",
    },
  ];
};

const liveAnswerAuthorityBadges = (environment: LiveAnswerEnvironment): Array<{ label: string; value: string }> => [
  {
    label: "Authority",
    value: environment.context_role === "observation_not_assistant_answer" ||
      environment.deterministic_content_role === "observation_not_assistant_answer"
      ? "observation-only"
      : "unknown",
  },
  { label: "assistant", value: environment.assistant_answer === false ? "false" : "unknown" },
  { label: "terminal", value: environment.terminal_eligible === false ? "false" : "unknown" },
  { label: "raw", value: environment.raw_content_included === false ? "false" : "unknown" },
  { label: "model step", value: environment.post_tool_model_step_required === true ? "required" : "unknown" },
];

const copyDebugSummary = (environment: LiveAnswerEnvironment, deltas: LiveAnswerEnvironmentDelta[]) => {
  const lines = Array.isArray(environment.lines) ? environment.lines : [];
  const text = JSON.stringify({
    environment_id: environment.environment_id,
    status: environment.status,
    mode: environment.mode,
    objective: environment.objective,
    latest_summary: environment.latest_summary,
    latest_evaluation: environment.latest_evaluation ?? null,
    lines: lines.map((line: LiveAnswerLineState) => ({
      key: line.key,
      value: line.value,
      updated_at: line.updated_at,
      model_invoked: line.model_invoked,
      deterministic: line.deterministic !== false,
    })),
    deltas: deltas.slice(-6).map((delta: LiveAnswerEnvironmentDelta) => ({
      delta_id: delta.delta_id,
      reason: delta.reason,
      changed_fields: delta.changed_fields ?? delta.changed_line_keys,
      window_id: delta.window_id ?? null,
      source_event_count: delta.source_event_count ?? null,
      raw_logs_included: false,
    })),
    raw_logs_included: false,
    context_policy: "compact_context_pack_only",
  }, null, 2);
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text).catch(() => undefined);
  }
};

export function LiveAnswerEnvironmentCard({
  environment,
  deltas = [],
  stale = false,
  onAskHelix,
  onOpenSituation,
  onDismiss,
}: {
  environment: LiveAnswerEnvironment;
  deltas?: LiveAnswerEnvironmentDelta[];
  stale?: boolean;
  onAskHelix?: (prompt: string) => void;
  onOpenSituation?: () => void;
  onDismiss?: () => void;
}) {
  const [traceOpen, setTraceOpen] = useState(false);
  const [presentStateCard, setPresentStateCard] = useState<HelixPresentStateCard | null>(null);
  const sourceIds = useMemo(
    () => Array.isArray(environment.source_ids) ? environment.source_ids : [],
    [environment.source_ids],
  );
  const lines = useMemo(
    () => Array.isArray(environment.lines) ? environment.lines : [],
    [environment.lines],
  );
  const sourceIdsKey = useMemo(() => sourceIds.join("\u001f"), [sourceIds]);
  const lineKeysKey = useMemo(
    () => lines.map((line: LiveAnswerLineState) => line.key).join("\u001f"),
    [lines],
  );
  const [sourceAvailabilities, setSourceAvailabilities] = useState<HelixRehearsalSpaceAvailabilityInput[]>([]);
  const rehearsalCatalog = useMemo(() => buildRehearsalSpaceCatalog({
    sourceIds,
    lineKeys: lines.map((line: LiveAnswerLineState) => line.key),
    objective: environment.objective,
    preset: environment.preset,
    sourceAvailabilities,
  }), [environment.objective, environment.preset, lineKeysKey, sourceAvailabilities, sourceIdsKey]);
  const [selectedRehearsalSpaceId, setSelectedRehearsalSpaceId] = useState<HelixRehearsalSpaceId | null>(
    rehearsalCatalog.selected_space_id,
  );
  useEffect(() => {
    if (!selectedRehearsalSpaceId || !rehearsalCatalog.spaces.some((space: HelixRehearsalSpace) => space.space_id === selectedRehearsalSpaceId)) {
      setSelectedRehearsalSpaceId(rehearsalCatalog.selected_space_id);
    }
  }, [rehearsalCatalog.selected_space_id, rehearsalCatalog.spaces, selectedRehearsalSpaceId]);
  useEffect(() => {
    let cancelled = false;
    const roomQuery = environment.room_id ? `&room_id=${encodeURIComponent(environment.room_id)}` : "";
    fetch(`/api/agi/situation/present-state-card?thread_id=${encodeURIComponent(environment.thread_id)}${roomQuery}`)
      .then((response) => response.ok ? response.json() : null)
      .then((body) => {
        if (!cancelled) setPresentStateCard(body?.card ?? null);
      })
      .catch(() => {
        if (!cancelled) setPresentStateCard(null);
      });
    return () => {
      cancelled = true;
    };
  }, [environment.environment_id, environment.room_id, environment.thread_id, environment.updated_at]);
  useEffect(() => {
    let cancelled = false;
    const availableSourceIds = sourceIds.filter((sourceId: string) => sourceId.startsWith("source:"));
    if (availableSourceIds.length === 0) {
      setSourceAvailabilities([]);
      return () => {
        cancelled = true;
      };
    }
    Promise.all(availableSourceIds.map((sourceId: string) =>
      fetch(`/api/agi/environment/sources/${encodeURIComponent(sourceId)}/status`)
        .then((response) => response.ok ? response.json() : null)
        .catch(() => null)
    )).then((bodies) => {
      if (cancelled) return;
      setSourceAvailabilities(
        bodies
          .map((body) => body?.status)
          .filter((status): status is HelixRehearsalSpaceAvailabilityInput => Boolean(status?.source_id && status?.domain_adapter && status?.availability)),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [environment.updated_at, sourceIdsKey]);
  const answerLines = lines.filter((line: LiveAnswerLineState) => line.visibility === "answer_card");
  const presentLines = presentStateCard?.lines ?? [];
  const preferredStagePlayLines = isStagePlayBackedEnvironment(environment, lines)
    ? stagePlayPreferredLines(answerLines)
    : [];
  const visibleLines = preferredStagePlayLines.length > 0
    ? preferredStagePlayLines
    : presentLines.length > 0
      ? presentLines
      : answerLines.map(lineStateToPresentLine);
  const procedureLines = lines.filter((line: LiveAnswerLineState) =>
    line.key === "possibilities" ||
    line.key === "rehearsal" ||
    line.key === "recommendation" ||
    line.key === "unknowns"
  );
  const sourceSummary = [
    sourceIds.length ? `Sources ${sourceIds.length}` : "No bound source",
    environment.context_policy,
    "raw payloads excluded",
  ].join(" / ");
  const policyBadges = environmentPolicyBadges(environment);
  const authorityBadges = liveAnswerAuthorityBadges(environment);
  const selectedRehearsalSpace = rehearsalCatalog.spaces.find((space: HelixRehearsalSpace) => space.space_id === selectedRehearsalSpaceId) ??
    rehearsalCatalog.spaces.find((space: HelixRehearsalSpace) => space.space_id === rehearsalCatalog.selected_space_id) ??
    null;
  const pendingQuestion = presentStateCard?.pending_request_input?.question ?? null;
  return (
    <section className="mb-2 w-full rounded-lg border border-cyan-300/20 bg-cyan-950/15 px-3 py-2 text-left text-xs text-cyan-50">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-200">Live Answer Environment</p>
          <p className="mt-1 break-words text-sm font-semibold text-cyan-50">
            {environment.objective}
          </p>
        </div>
        <span className="shrink-0 rounded border border-cyan-300/35 bg-cyan-400/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-cyan-100">
          {environment.status} / {environment.mode}{stale ? " / stale" : ""}
        </span>
      </div>
      <div className="mt-2 grid gap-1.5 text-[11px] text-cyan-50/90">
        <p>
          <span className="text-cyan-200/80">Sources: </span>
          {sourceSummary}
        </p>
        <div className="flex flex-wrap gap-1">
          {policyBadges.map((badge: { label: string; value: string }) => (
            <span key={badge.label} className="rounded border border-cyan-300/20 bg-black/15 px-1.5 py-0.5 text-[10px] text-cyan-100">
              {badge.label}: {badge.value}
            </span>
          ))}
        </div>
        <div
          className="rounded border border-cyan-300/15 bg-black/10 px-2 py-1"
          data-testid="live-answer-card-authority"
        >
          <div className="flex flex-wrap gap-1">
            {authorityBadges.map((badge: { label: string; value: string }) => (
              <span key={badge.label} className="rounded border border-cyan-300/20 bg-cyan-300/5 px-1.5 py-0.5 text-[10px] text-cyan-100">
                {badge.label}: {badge.value}
              </span>
            ))}
          </div>
          <p className="mt-1 text-[10px] text-cyan-50/65">
            Live Answer projections are goal-context evidence until terminal authority selects a final answer.
          </p>
        </div>
        {visibleLines.map((line: HelixPresentStateCardLine) => (
          <p key={line.key}>
            <span className="text-cyan-200/80">{line.label}: </span>
            {String(line.value ?? "").trim()}
            {typeof line.confidence === "number" ? (
              <span className="ml-1 text-cyan-200/60">({Math.round(line.confidence * 100)}%)</span>
            ) : null}
          </p>
        ))}
        {pendingQuestion ? (
          <p>
            <span className="text-cyan-200/80">Question: </span>
            {pendingQuestion}
          </p>
        ) : null}
      </div>
      <div className="mt-2 rounded border border-cyan-300/15 bg-cyan-950/20 px-2 py-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-cyan-200">Rehearsal spaces</p>
          {selectedRehearsalSpace ? (
            <span className="rounded border border-cyan-300/20 px-1.5 py-0.5 text-[10px] text-cyan-100">
              fidelity +{Math.round(selectedRehearsalSpace.additive_fidelity_hint * 100)}%
            </span>
          ) : null}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {rehearsalCatalog.spaces.map((space: HelixRehearsalSpace) => (
            <button
              key={space.space_id}
              type="button"
              onClick={() => setSelectedRehearsalSpaceId(space.space_id)}
              disabled={space.status === "future"}
              title={`${space.summary} Adapter: ${space.domain_adapter}. Execution disabled.`}
              className={`rounded border px-2 py-1 text-[10px] ${
                selectedRehearsalSpaceId === space.space_id
                  ? "border-cyan-200/50 bg-cyan-300/15 text-cyan-50"
                    : space.status === "available"
                    ? "border-emerald-300/25 text-emerald-100 hover:bg-emerald-400/10"
                    : space.status === "limited" || space.status === "partial"
                      ? "border-amber-300/25 text-amber-100 hover:bg-amber-400/10"
                      : space.status === "stale"
                        ? "border-orange-300/25 text-orange-100 hover:bg-orange-400/10"
                        : space.status === "policy_blocked"
                          ? "border-rose-300/25 text-rose-100"
                      : "border-white/10 text-slate-500"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {space.label} / {space.availability_label ?? space.status}
            </button>
          ))}
        </div>
        {selectedRehearsalSpace ? (
          <div className="mt-1.5 grid gap-1 text-[10px] text-cyan-50/70">
            <p>
              {selectedRehearsalSpace.summary} Modes: {selectedRehearsalSpace.supported_rehearsal_modes.join(", ")}. Live actions disabled.
            </p>
            {selectedRehearsalSpace.diagnostics ? (
              <details className="rounded border border-cyan-300/10 bg-black/10 px-2 py-1">
                <summary className="cursor-pointer text-cyan-100">Source diagnostics</summary>
                <div className="mt-1 grid gap-0.5">
                  <p>Availability: {selectedRehearsalSpace.availability_label ?? selectedRehearsalSpace.status}</p>
                  <p>Manifest: {selectedRehearsalSpace.diagnostics.manifest ?? "unknown"}</p>
                  <p>Heartbeat: {selectedRehearsalSpace.diagnostics.heartbeat ?? "unknown"}</p>
                  <p>Snapshot: {selectedRehearsalSpace.diagnostics.snapshot ?? "unknown"}</p>
                  <p>Probes: {(selectedRehearsalSpace.diagnostics.probes ?? []).join(", ") || "none"}</p>
                  <p>Rehearsal: read-only only</p>
                  <p>Execution: {selectedRehearsalSpace.diagnostics.execution ?? "disabled"}</p>
                  <p>Sensor scope: {selectedRehearsalSpace.diagnostics.sensor_scope ?? "unknown"}</p>
                  {selectedRehearsalSpace.diagnostics.reason ? <p>Reason: {selectedRehearsalSpace.diagnostics.reason}</p> : null}
                  {selectedRehearsalSpace.diagnostics.last_error ? <p>Last error: {selectedRehearsalSpace.diagnostics.last_error}</p> : null}
                  {selectedRehearsalSpace.diagnostics.suggested_fix ? <p>Suggested fix: {selectedRehearsalSpace.diagnostics.suggested_fix}</p> : null}
                </div>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
      {procedureLines.length > 0 ? (
        <details className="mt-2 rounded border border-cyan-300/15 bg-cyan-950/20 px-2 py-1 text-[11px] text-cyan-50/90">
          <summary className="cursor-pointer text-cyan-100">Procedure / rehearsal trace</summary>
          <div className="mt-1 grid gap-1">
            {procedureLines.map((line: LiveAnswerLineState) => (
              <p key={line.key}>
                <span className="text-cyan-200/80">{line.label}: </span>
                {cleanLine(line)}
              </p>
            ))}
          </div>
        </details>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onAskHelix?.(`Use the live answer environment "${environment.objective}" and tell me what changed.`)}
          className="rounded border border-cyan-300/30 bg-cyan-400/10 px-2 py-1 text-[11px] text-cyan-100 hover:bg-cyan-400/20"
        >
          Ask about this
        </button>
        <button
          type="button"
          onClick={onOpenSituation}
          className="rounded border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-slate-100 hover:bg-white/10"
        >
          Open Situation Room
        </button>
        <button
          type="button"
          onClick={() => setTraceOpen((value: boolean) => !value)}
          className="rounded border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-slate-100 hover:bg-white/10"
        >
          {traceOpen ? "Hide trace" : "Show trace"}
        </button>
        <button
          type="button"
          onClick={() => postEnvironmentAction(environment.environment_id, "pause")}
          className="rounded border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-slate-100 hover:bg-white/10"
        >
          Pause
        </button>
        <button
          type="button"
          onClick={() => postEnvironmentAction(environment.environment_id, "resume")}
          className="rounded border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-slate-100 hover:bg-white/10"
        >
          Resume
        </button>
        <button
          type="button"
          onClick={() => postEnvironmentAction(environment.environment_id, "stop")}
          className="rounded border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-slate-100 hover:bg-white/10"
        >
          Stop
        </button>
        <button
          type="button"
          onClick={() => copyDebugSummary(environment, deltas)}
          className="rounded border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-slate-100 hover:bg-white/10"
        >
          Copy debug summary
        </button>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/10"
          >
            Dismiss card
          </button>
        ) : null}
      </div>
      {traceOpen ? (
        <div className="mt-2">
          <LiveAnswerEnvironmentTrace deltas={deltas} />
        </div>
      ) : null}
    </section>
  );
}
