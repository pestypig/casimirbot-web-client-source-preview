import React from "react";

type RecordLike = Record<string, unknown>;

export type HelixAskProofTraceDetailsProps = {
  trace?: unknown;
  clipText: (text: string, limit: number) => string;
};

export type HelixAskJobReadyLinkStripProps = {
  links: RecordLike[];
  onRun: (link: RecordLike) => void;
};

export type HelixAskReplyStatusFooterProps = {
  visible: boolean;
  promptIngested?: boolean;
};

export type HelixAskRuntimeGoalProgressPanelProps = {
  summary?: RecordLike | null;
  isLatestReply: boolean;
};

export type HelixAskLiveBridgePill = {
  label: string;
  tone: "cyan" | "amber" | "emerald" | "slate";
};

export type HelixAskLiveBridgePillStripProps = {
  rowKey: string;
  pills?: HelixAskLiveBridgePill[];
  isLatestReply: boolean;
  status?: string | null;
  readPillClassName: (tone: HelixAskLiveBridgePill["tone"]) => string;
};

export type HelixAskStagePlayActionButtonsProps = {
  actions?: Array<"Run" | "Skip" | "Pause job">;
  rowKey: string;
  isLatestReply: boolean;
};

const readRecord = (value: unknown): RecordLike | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as RecordLike) : null;

const readString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const readBoolean = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

const readStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim()).map((entry) => entry.trim())
    : [];

const formatRefCount = (refs: string[], label: string): string | null =>
  refs.length > 0 ? `${refs.length} ${label}${refs.length === 1 ? "" : "s"}` : null;

const formatFreshness = (value: unknown): string | null =>
  typeof value === "number" && Number.isFinite(value)
    ? `${Math.max(0, Math.round(value))} ms`
    : null;

const formatTimer = (status: unknown, ms: unknown): string | null => {
  const statusText = readString(status);
  if (!statusText) return null;
  if (typeof ms === "number" && Number.isFinite(ms)) {
    return `${statusText} (${Math.max(0, Math.round(ms))} ms)`;
  }
  return statusText;
};

const buildRuntimeGoalProgressRows = (summary: RecordLike): Array<{ label: string; value: string }> => {
  const observationRefs = readStringArray(summary.latest_observation_refs);
  const receiptRefs = readStringArray(summary.latest_receipt_refs);
  const serverAuthoritative = readBoolean(summary.terminal_answer_server_authoritative);
  const refSummary = [
    formatRefCount(observationRefs, "observation"),
    formatRefCount(receiptRefs, "receipt"),
    readString(summary.provider_terminal_candidate_ref) ? "candidate recorded" : null,
  ].filter(Boolean).join(" | ");

  return [
    { label: "Goal", value: readString(summary.job_title) ?? readString(summary.goal_id) ?? "Runtime goal" },
    { label: "Runtime", value: readString(summary.runtime_agent_provider) ?? "runtime provider not reported" },
    { label: "Status", value: readString(summary.session_status) ?? readString(summary.status_reason) ?? "status not reported" },
    { label: "Last wake", value: readString(summary.last_wake_at) ?? readString(summary.session_updated_at) ?? "not woken yet" },
    { label: "Source", value: readString(summary.observed_source_label) ?? readString(summary.observed_source_doc_path) ?? "source not reported" },
    { label: "Source kind", value: readString(summary.observed_source_kind) ?? "source kind not reported" },
    { label: "Freshness", value: formatFreshness(summary.observed_source_freshness_ms) ?? "freshness not reported" },
    { label: "Tool", value: readString(summary.requested_observation_or_lane) ?? "tool/lane not reported" },
    { label: "Product", value: readString(summary.wake_expected_terminal_product) ?? "terminal product not reported" },
    { label: "Reason", value: readString(summary.wake_relevance_reason) ?? "wake reason not reported" },
    { label: "Wake", value: readString(summary.wake_candidate_event_kind) ?? readString(summary.wake_admission_reason) ?? "manual or not reported" },
    { label: "Admission", value: readString(summary.wake_admission_status) ?? "admission not reported" },
    { label: "Timer", value: formatTimer(summary.wake_timer_status, summary.wake_timer_ms) ?? "timer policy not reported" },
    { label: "Progress", value: readString(summary.current_progress_summary) ?? "progress not reported" },
    { label: "Next", value: readString(summary.next_wake_behavior) ?? readString(summary.session_status) ?? "waiting" },
    { label: "Authority", value: readString(summary.terminal_authority_status) ?? "authority not reported" },
    {
      label: "Server authority",
      value: serverAuthoritative === null ? "not reported" : serverAuthoritative ? "server-authorized" : "not server-authorized",
    },
    { label: "Evidence", value: refSummary || "evidence refs not reported" },
  ];
};

export function HelixAskProofTraceDetails({ trace, clipText }: HelixAskProofTraceDetailsProps) {
  const record = readRecord(trace);
  if (!record) return null;

  const steps = Array.isArray(record.compact_steps) ? record.compact_steps : [];
  const caveats = Array.isArray(record.caveats) ? record.caveats : [];

  return (
    <details className="mt-3 rounded-lg border border-amber-300/25 bg-amber-950/15 px-3 py-2 text-xs text-amber-50">
      <summary className="cursor-pointer select-none text-[10px] uppercase tracking-[0.2em] text-amber-200">
        Proof trace
        {typeof record.proof_status === "string" ? (
          <span className="ml-2 rounded border border-amber-300/30 bg-black/20 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em]">
            {record.proof_status}
          </span>
        ) : null}
      </summary>
      <div className="mt-2 space-y-1.5">
        {steps.slice(0, 6).map((step, stepIndex) => {
          const stepRecord = readRecord(step);
          return (
            <p key={`${String(stepRecord?.label ?? "step")}-${stepIndex}`} className="leading-relaxed">
              <span className="text-amber-200/80">{String(stepRecord?.label ?? `Step ${stepIndex + 1}`)}: </span>
              {clipText(String(stepRecord?.summary ?? ""), 260)}
            </p>
          );
        })}
        {typeof record.scope_match === "string" ? (
          <p className="text-[10px] uppercase tracking-[0.14em] text-amber-100/70">
            Scope: {String(record.requested_extraction_scope ?? "unknown")}{" -> "}
            {String(record.actual_extraction_scope ?? "unknown")} ({record.scope_match})
          </p>
        ) : null}
        {caveats.length > 0 ? (
          <p className="text-amber-100/80">Caveats: {caveats.slice(0, 3).map(String).join(" | ")}</p>
        ) : null}
      </div>
    </details>
  );
}

export function HelixAskJobReadyLinkStrip({ links, onRun }: HelixAskJobReadyLinkStripProps) {
  if (links.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {links.slice(0, 6).map((link, linkIndex) => {
        const label =
          typeof link.label === "string" && link.label.trim()
            ? link.label.trim()
            : `${String(link.panel_id)}.${String(link.action_id)}`;
        const source =
          typeof link.source_artifact_kind === "string" && link.source_artifact_kind.trim()
            ? link.source_artifact_kind.trim()
            : typeof link.source === "string"
              ? link.source
              : "artifact";
        return (
          <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-final-extras.on-run-link"
            key={`${String(link.type ?? "link")}-${String(link.panel_id)}-${String(link.action_id)}-${linkIndex}`}
            type="button"
            className="rounded-full border border-cyan-300/35 bg-cyan-400/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100 hover:border-cyan-200/60 hover:bg-cyan-300/15"
            onClick={() => onRun(link)}
            title={`From ${source}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function HelixAskRuntimeGoalProgressPanel({
  summary,
  isLatestReply,
}: HelixAskRuntimeGoalProgressPanelProps) {
  const record = readRecord(summary);
  if (!record) return null;

  const terminalStatus = readString(record.terminal_authority_status);
  const rows = buildRuntimeGoalProgressRows(record);

  return (
    <section
      className="mt-3 border-l border-cyan-300/35 bg-cyan-950/10 px-3 py-2 text-xs text-slate-200"
      data-testid={isLatestReply ? "helix-ask-latest-runtime-goal-progress" : "helix-ask-runtime-goal-progress"}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200">
          Goal progress
        </p>
        {terminalStatus ? (
          <span className="rounded border border-cyan-300/20 bg-black/20 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-cyan-100/80">
            {terminalStatus}
          </span>
        ) : null}
      </div>
      <dl className="mt-2 space-y-1.5">
        {rows.map((row) => (
          <div key={row.label} className="grid gap-1 sm:grid-cols-[5.5rem_minmax(0,1fr)]">
            <dt className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
              {row.label}
            </dt>
            <dd className="break-words text-slate-200 [overflow-wrap:anywhere]">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function HelixAskReplyStatusFooter({ visible, promptIngested = false }: HelixAskReplyStatusFooterProps) {
  if (!visible) return null;

  return (
    <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-slate-500">
      <span>
        In Helix Console
        {promptIngested ? " | Prompt ingested" : ""}
      </span>
    </div>
  );
}

export function HelixAskLiveBridgePillStrip({
  rowKey,
  pills,
  isLatestReply,
  status,
  readPillClassName,
}: HelixAskLiveBridgePillStripProps) {
  if (!pills?.length) return null;

  return (
    <div
      className="mt-2 flex max-w-full flex-wrap gap-1"
      data-testid={isLatestReply ? "helix-ask-latest-live-turn-bridge" : undefined}
      data-live-turn-bridge-status={status ?? undefined}
    >
      {pills.map((pill) => (
        <span
          key={`${rowKey}-${pill.label}`}
          className={`rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] ${readPillClassName(pill.tone)}`}
        >
          {pill.label}
        </span>
      ))}
    </div>
  );
}

export function HelixAskStagePlayActionButtons({
  actions,
  rowKey,
  isLatestReply,
}: HelixAskStagePlayActionButtonsProps) {
  if (!actions?.length) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {actions.map((action) => (
        <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-final-extras.use-the-stage-play-graph-checkpoint-controls-for-this-v1-action"
          key={`${rowKey}-${action}`}
          type="button"
          disabled
          title="Use the Stage Play graph checkpoint controls for this v1 action."
          className="rounded border border-amber-300/30 bg-black/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100/70 disabled:cursor-not-allowed disabled:opacity-70"
          data-testid={
            isLatestReply
              ? `helix-ask-latest-stage-play-${action.toLowerCase().replace(/\s+/g, "-")}`
              : undefined
          }
        >
          {action}
        </button>
      ))}
    </div>
  );
}
