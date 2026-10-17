import React, { useState } from "react";
import type { AgentRunObserverBinding } from "./AgentRunObserverContracts";
import type {
  AgentRunObserverController,
  AgentRunObserverPhase,
} from "./useAgentRunObserver";

const PHASE_LABELS: Record<AgentRunObserverPhase, string> = {
  idle: "Not observing",
  observing: "Agent working",
  waiting: "Agent waiting",
  completed: "Completed",
  completed_without_terminal: "Completed without an authorized answer",
  blocked: "Blocked",
  failed: "Failed",
  cancelled: "Cancelled",
  error: "Observer error",
};

const EVENT_LABELS: Record<string, string> = {
  run_started: "Run started",
  runtime_recovered: "Runtime recovered",
  continuation_received: "Continuation received",
  evidence_reentered: "Evidence re-entered",
  issues_resolved: "Issues resolved",
  input_requested: "Input requested",
  terminal_authority_evaluated: "Terminal authority evaluated",
  run_waiting: "Run waiting",
  run_completed: "Run completed",
  run_blocked: "Run blocked",
  run_failed: "Run failed",
  run_cancelled: "Run cancelled",
  budget_exhausted: "Budget exhausted",
};

const safeCount = (value: unknown): number | null =>
  Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;

const safeFailureCode = (value: unknown): string | null => {
  if (
    typeof value !== "string" ||
    !/^[a-z0-9_.:-]{1,80}$/iu.test(value) ||
    /(?:bearer|claim|credential|secret|token)/iu.test(value)
  ) {
    return null;
  }
  return value;
};

type ObserverStatusRow = {
  kind: "observation" | "evidence" | "receipt";
  statusRef: string;
};

const statusRows = (
  event: AgentRunObserverController["events"][number],
): ObserverStatusRow[] => {
  const raw = event.payload.status_rows;
  if (!Array.isArray(raw)) return [];
  const rows: ObserverStatusRow[] = [];
  for (const candidate of raw.slice(0, 24)) {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      continue;
    }
    const row = candidate as Record<string, unknown>;
    const kind =
      row.kind === "observation" ||
      row.kind === "evidence" ||
      row.kind === "receipt"
        ? row.kind
        : null;
    if (
      !kind ||
      row.status !== "reentered" ||
      typeof row.status_ref !== "string" ||
      !new RegExp(`^observer-${kind}:sha256:[a-f0-9]{64}$`, "u").test(
        row.status_ref,
      ) ||
      row.answer_authority !== false ||
      row.assistant_answer !== false ||
      row.terminal_eligible !== false ||
      row.raw_content_included !== false
    ) {
      continue;
    }
    rows.push({ kind, statusRef: row.status_ref });
  }
  return rows;
};

const STATUS_ROW_LABELS: Record<ObserverStatusRow["kind"], string> = {
  observation: "Tool observation re-entered",
  evidence: "Evidence re-entered",
  receipt: "Receipt re-entered",
};

const eventStatus = (
  event: AgentRunObserverController["events"][number],
): string | null => {
  if (event.event_type === "evidence_reentered") {
    const observations = safeCount(event.payload.observation_ref_count) ?? 0;
    const evidence = safeCount(event.payload.evidence_ref_count) ?? 0;
    const receipts = safeCount(event.payload.receipt_ref_count) ?? 0;
    return `${observations + evidence} tool/evidence observations; ${receipts} receipts`;
  }
  if (event.event_type === "input_requested") {
    const questions = safeCount(event.payload.question_count);
    return event.payload.pending_input !== true || questions === null
      ? null
      : `Pending input required; ${questions} ${
          questions === 1 ? "question" : "questions"
        }`;
  }
  const failureCode = safeFailureCode(event.payload.failure_code);
  return failureCode ? `Typed failure: ${failureCode}` : null;
};

export type AgentRunObserverLaneProps = {
  controller: AgentRunObserverController;
  binding?: AgentRunObserverBinding | null;
  claimHandle?: string | null;
  onCopyClaimHandle?: (claimHandle: string) => void | Promise<void>;
  disconnecting?: boolean;
  onDisconnect?: () => void | Promise<void>;
  className?: string;
};

export function AgentRunObserverLane({
  controller,
  binding = null,
  claimHandle = null,
  onCopyClaimHandle,
  disconnecting = false,
  onDisconnect,
  className = "",
}: AgentRunObserverLaneProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const recentEvents = controller.events.slice(-12).reverse();

  const copyClaimHandle = async (): Promise<void> => {
    if (!claimHandle) return;
    try {
      if (onCopyClaimHandle) {
        await onCopyClaimHandle(claimHandle);
      } else {
        await navigator.clipboard.writeText(claimHandle);
      }
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <section
      aria-label="External agent run"
      className={[
        "rounded-lg border border-slate-700/70 bg-slate-950/50 p-3",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-agent-run-observer-phase={controller.phase}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-200">
            External agent run
          </h3>
          <p aria-live="polite" className="mt-1 text-xs text-slate-400">
            {PHASE_LABELS[controller.phase]}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {binding ? (
            <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400">
              {binding.status.replace("_", " ")}
            </span>
          ) : null}
          {onDisconnect ? (
            <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.agent-run-observer-lane.void-on-disconnect"
              className="rounded border border-rose-800 px-2 py-1 text-[11px] text-rose-200 disabled:opacity-40"
              disabled={disconnecting}
              onClick={() => void onDisconnect()}
              type="button"
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          ) : null}
        </div>
      </div>

      {claimHandle ? (
        <div className="mt-3 rounded-md border border-cyan-800/60 bg-cyan-950/20 p-2">
          <p className="text-[11px] text-cyan-100">One-time agent claim link</p>
          <code className="mt-1 block break-all text-[10px] text-cyan-300">
            {claimHandle}
          </code>
          <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.agent-run-observer-lane.void-copy-claim-handle"
            className="mt-2 rounded border border-cyan-700 px-2 py-1 text-[11px] text-cyan-100"
            onClick={() => void copyClaimHandle()}
            type="button"
          >
            {copyState === "copied"
              ? "Copied"
              : copyState === "failed"
                ? "Copy failed"
                : "Copy link"}
          </button>
        </div>
      ) : null}

      {controller.error ? (
        <p
          className="mt-3 rounded-md border border-rose-900/70 bg-rose-950/30 p-2 text-xs text-rose-200"
          role="alert"
        >
          {controller.error.message}
        </p>
      ) : null}

      {controller.terminalMessageId ? (
        <p className="mt-3 text-xs text-emerald-300">
          Verified answer added to the selected chat.
        </p>
      ) : null}

      {recentEvents.length > 0 ? (
        <ol className="mt-3 space-y-1.5" aria-label="Agent run events">
          {recentEvents.map((event) => {
            const rows = statusRows(event);
            return (
              <li
                className="flex items-start justify-between gap-3 text-[11px]"
                key={event.event_id}
              >
                <span className="min-w-0 text-slate-300">
                  <span className="block">
                    {EVENT_LABELS[event.event_type] ?? "Run update"}
                  </span>
                  {eventStatus(event) ? (
                    <span className="mt-0.5 block text-[10px] text-slate-500">
                      {eventStatus(event)}
                    </span>
                  ) : null}
                  {rows.length > 0 ? (
                    <span
                      aria-label="Non-authoritative run status"
                      className="mt-1 block space-y-1"
                    >
                      {rows.map((row) => (
                        <span
                          className="block rounded border border-slate-800 px-1.5 py-1 text-[10px] text-slate-400"
                          key={`${row.kind}:${row.statusRef}`}
                        >
                          <span className="block">
                            {STATUS_ROW_LABELS[row.kind]}
                          </span>
                          <code className="block break-all text-[9px] text-slate-500">
                            {row.statusRef}
                          </code>
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
                <time
                  className="shrink-0 text-slate-500"
                  dateTime={event.created_at}
                >
                  #{event.seq}
                </time>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-3 text-xs text-slate-500">No run events yet.</p>
      )}
    </section>
  );
}
