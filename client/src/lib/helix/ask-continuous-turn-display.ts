import type {
  HelixContinuousTurnStreamRow,
  HelixContinuousTurnStreamTone,
} from "@/lib/helix/ask-active-turn-stream";
import type { HelixAskFinalAnswerPresentation } from "@/lib/helix/ask-terminal-projection";
import type { HelixTurnTranscriptRow } from "@/lib/helix/ask-turn-transcript";
import type { StagePlayChatLedgerEvent } from "@/lib/helix/ask-stage-play-ledger";
import {
  buildHelixMailLoopTurnStreamRows,
  type HelixMailLoopTranscriptRow,
} from "@/lib/helix/ask-live-source-display";

export type LiveAnswerTurnBridgeTone = "cyan" | "amber" | "emerald" | "slate";

export type LiveAnswerTurnBridgePill = {
  label: string;
  tone: LiveAnswerTurnBridgeTone;
};

export type LiveAnswerTurnBridgeState = {
  title: string;
  detail: string;
  meta: string;
  tone: LiveAnswerTurnBridgeTone;
  evidenceRefs: string[];
  pills: LiveAnswerTurnBridgePill[];
  status:
    | "answer_snapshot_ready"
    | "checkpoint_queued"
    | "checkpoint_waiting"
    | "receipt_fallback"
    | "live_state_available";
};

function clipText(value: string | undefined, limit: number): string {
  if (!value) return "";
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}...`;
}

function uniqueStagePlayLedgerStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function toneForHelixTranscriptRow(row: HelixTurnTranscriptRow): HelixContinuousTurnStreamTone {
  if (/\b(?:failed|blocked|error|mismatch)\b/i.test(row.status) || row.label === "Notice") return "warning";
  if (
    row.label === "Observation" ||
    row.label === "Recorded" ||
    row.label === "Lane Observation" ||
    row.label === "Lane Receipt" ||
    row.label === "Lane Re-entry" ||
    row.label === "UI Projection"
  ) return "observation";
  if (
    row.label === "Decision" ||
    row.label === "Gate" ||
    row.label === "Lane Request" ||
    row.label === "Lane Backend" ||
    row.label === "Lane Session" ||
    row.label === "Lane Mail" ||
    row.label === "Goal Lane" ||
    row.label === "Goal Dispatch" ||
    row.label === "Goal Admission" ||
    row.label === "Goal Readiness"
  ) return "checkpoint";
  if (row.label === "Final" || row.label === "Terminal") return "final";
  return "working";
}

function toneForStagePlayLedgerEvent(event: StagePlayChatLedgerEvent): HelixContinuousTurnStreamTone {
  if (event.kind === "checkpoint_request" || event.kind === "ask_checkpoint") return "checkpoint";
  if (event.kind === "answer_snapshot") return "final";
  if (event.kind === "debug_receipt" || event.kind === "source_observation" || event.kind === "live_output") return "observation";
  if (event.kind === "perturbation") return "warning";
  return "working";
}

export function buildHelixContinuousTurnStreamRows(args: {
  replyId: string;
  question?: string | null;
  turnTranscriptRows: HelixTurnTranscriptRow[];
  mailLoopRows?: HelixMailLoopTranscriptRow[];
  stagePlayEvents: StagePlayChatLedgerEvent[];
  liveAnswerTurnBridge: LiveAnswerTurnBridgeState | null;
  finalAnswerText: string;
  finalAnswerHeading: string;
  finalAnswerSourceLabel: string;
  terminalMismatch: boolean;
}): HelixContinuousTurnStreamRow[] {
  const rows: HelixContinuousTurnStreamRow[] = [];
  const question = (args.question ?? "").trim();
  if (question) {
    rows.push({
      key: `${args.replyId}-stream-question`,
      source: "question",
      label: "Question",
      text: question,
      meta: "user prompt",
      status: "submitted",
      tone: "question",
      evidenceRefs: [],
    });
  }
  args.turnTranscriptRows
    .filter((row) => row.label !== "Final")
    .forEach((row) => {
      rows.push({
        key: `${row.key}-stream`,
        source: "agent_work",
        label: row.label,
        text: row.text,
        meta: row.meta,
        status: row.status,
        tone: toneForHelixTranscriptRow(row),
        evidenceRefs: [],
      });
    });
  buildHelixMailLoopTurnStreamRows(args.replyId, args.mailLoopRows ?? []).forEach((row) => rows.push(row));
  args.stagePlayEvents.forEach((event) => {
    rows.push({
      key: `${event.key}-stream`,
      source: "stage_play",
      label: event.kind === "debug_receipt" ? "Stage Play Receipt" : event.title.replace(/\.$/, ""),
      text: event.detail,
      meta: event.meta,
      status: event.status ?? "observed",
      tone: toneForStagePlayLedgerEvent(event),
      evidenceRefs: event.evidenceRefs,
      actions: event.actions,
      detailLimit: event.kind === "debug_receipt" ? 1200 : 360,
    });
  });
  if (args.liveAnswerTurnBridge) {
    rows.push({
      key: `${args.replyId}-stream-live-bridge`,
      source: "live_bridge",
      label: "Live turn bridge",
      text: args.liveAnswerTurnBridge.detail,
      meta: args.liveAnswerTurnBridge.meta,
      status: args.liveAnswerTurnBridge.status,
      tone: args.liveAnswerTurnBridge.tone === "amber" ? "checkpoint" : args.liveAnswerTurnBridge.tone === "emerald" ? "final" : "bridge",
      evidenceRefs: args.liveAnswerTurnBridge.evidenceRefs,
      bridgePills: args.liveAnswerTurnBridge.pills,
    });
  }
  if (args.finalAnswerText.trim()) {
    rows.push({
      key: `${args.replyId}-stream-final-answer`,
      source: "final",
      label: args.finalAnswerHeading || "Final",
      text: args.finalAnswerText,
      meta: args.terminalMismatch ? "terminal mismatch" : args.finalAnswerSourceLabel,
      status: args.terminalMismatch ? "mismatch" : "terminal",
      tone: args.terminalMismatch ? "warning" : "final",
      evidenceRefs: [],
      detailLimit: 1600,
    });
  }
  return rows;
}

export function readHelixContinuousTurnStreamRowClass(tone: HelixContinuousTurnStreamTone): string {
  if (tone === "question") return "border-cyan-300/20 text-cyan-50";
  if (tone === "observation") return "border-emerald-300/20 text-emerald-50";
  if (tone === "checkpoint") return "border-amber-300/25 text-amber-50";
  if (tone === "bridge") return "border-sky-300/25 text-sky-50";
  if (tone === "final") return "border-violet-300/25 text-violet-50";
  if (tone === "warning") return "border-rose-300/30 text-rose-50";
  return "border-slate-500/25 text-slate-100";
}

export function readHelixContinuousTurnStreamDotClass(tone: HelixContinuousTurnStreamTone): string {
  if (tone === "question") return "border-cyan-200/70 bg-cyan-300";
  if (tone === "observation") return "border-emerald-200/70 bg-emerald-300";
  if (tone === "checkpoint") return "border-amber-200/70 bg-amber-300";
  if (tone === "bridge") return "border-sky-200/70 bg-sky-300";
  if (tone === "final") return "border-violet-200/70 bg-violet-300";
  if (tone === "warning") return "border-rose-200/70 bg-rose-300";
  return "border-slate-200/60 bg-slate-400";
}

export function buildLiveAnswerTurnBridgeState({
  hasLiveState,
  stagePlayEvents,
  finalAnswerPresentation,
}: {
  hasLiveState: boolean;
  stagePlayEvents: StagePlayChatLedgerEvent[];
  finalAnswerPresentation: HelixAskFinalAnswerPresentation;
}): LiveAnswerTurnBridgeState | null {
  const evidenceRefs = uniqueStagePlayLedgerStrings(stagePlayEvents.flatMap((event) => event.evidenceRefs));
  const checkpointRequest = stagePlayEvents.find((event) => event.kind === "checkpoint_request") ?? null;
  const askCheckpoint = stagePlayEvents.find((event) => event.kind === "ask_checkpoint") ?? null;
  const answerSnapshot = stagePlayEvents.find((event) => event.kind === "answer_snapshot") ?? null;
  const liveOutput = stagePlayEvents.find((event) => event.kind === "live_output") ?? null;
  const modelReviewed =
    askCheckpoint?.status === "model_reviewed" ||
    Boolean(answerSnapshot && !/\b(?:missing|stale|invalid|not_reviewed)\b/i.test(answerSnapshot.status ?? ""));
  const checkpointPill: LiveAnswerTurnBridgePill = modelReviewed
    ? { label: "checkpoint reviewed", tone: "emerald" }
    : checkpointRequest
      ? { label: "checkpoint queued", tone: "amber" }
      : { label: "checkpoint waiting", tone: "slate" };
  const snapshotPill: LiveAnswerTurnBridgePill = modelReviewed
    ? { label: "snapshot reviewed", tone: "emerald" }
    : { label: "snapshot pending", tone: "slate" };
  const voicePill: LiveAnswerTurnBridgePill = modelReviewed
    ? { label: "voice snapshot-bound", tone: "emerald" }
    : { label: "voice waiting", tone: "slate" };
  const pills: LiveAnswerTurnBridgePill[] = [
    { label: liveOutput || hasLiveState ? "live evidence" : "no live evidence", tone: hasLiveState ? "cyan" : "slate" },
    checkpointPill,
    snapshotPill,
    voicePill,
  ];

  if (modelReviewed) {
    return {
      title: "Answer snapshot ready",
      detail: "Live state was consumed by a model-reviewed checkpoint; terminal answer and voice lanes can bind to that snapshot.",
      meta: `refs ${evidenceRefs.length} | ${answerSnapshot?.meta ?? askCheckpoint?.meta ?? "checkpoint reviewed"}`,
      tone: "emerald",
      evidenceRefs,
      pills,
      status: "answer_snapshot_ready",
    };
  }

  if (checkpointRequest) {
    return {
      title: "Checkpoint queued",
      detail: clipText(checkpointRequest.detail, 240),
      meta: `refs ${evidenceRefs.length} | ${checkpointRequest.meta}`,
      tone: "amber",
      evidenceRefs,
      pills,
      status: "checkpoint_queued",
    };
  }

  if (askCheckpoint?.status === "missing_evidence") {
    return {
      title: "Waiting for model-reviewed checkpoint",
      detail: clipText(askCheckpoint.detail, 240),
      meta: `refs ${evidenceRefs.length} | ${askCheckpoint.meta}`,
      tone: "slate",
      evidenceRefs,
      pills,
      status: "checkpoint_waiting",
    };
  }

  if (finalAnswerPresentation.isDeterministicReceiptFallback) {
    return {
      title: "Receipt fallback is evidence",
      detail: "A deterministic receipt was produced for this turn; it is displayed as checkpoint bridge material until Ask creates a reviewed answer snapshot.",
      meta: `refs ${evidenceRefs.length} | not reviewed`,
      tone: "amber",
      evidenceRefs,
      pills,
      status: "receipt_fallback",
    };
  }

  if (hasLiveState || stagePlayEvents.length > 0) {
    return {
      title: "Live state available",
      detail: "Live interpretation lanes are present for this turn; no reviewed answer snapshot has been emitted yet.",
      meta: `refs ${evidenceRefs.length} | ${liveOutput?.meta ?? "staging"}`,
      tone: "cyan",
      evidenceRefs,
      pills,
      status: "live_state_available",
    };
  }

  return null;
}

export function readLiveAnswerTurnBridgeClassName(tone: LiveAnswerTurnBridgeTone): string {
  if (tone === "emerald") return "border-emerald-300/25 bg-emerald-950/15 text-emerald-50";
  if (tone === "amber") return "border-amber-300/25 bg-amber-950/20 text-amber-50";
  if (tone === "slate") return "border-slate-500/25 bg-slate-950/35 text-slate-100";
  return "border-cyan-300/25 bg-cyan-950/20 text-cyan-50";
}

export function readLiveAnswerTurnBridgePillClassName(tone: LiveAnswerTurnBridgeTone): string {
  if (tone === "emerald") return "border-emerald-300/35 bg-emerald-400/10 text-emerald-100";
  if (tone === "amber") return "border-amber-300/35 bg-amber-400/10 text-amber-100";
  if (tone === "slate") return "border-slate-400/25 bg-black/20 text-slate-200";
  return "border-cyan-300/35 bg-cyan-400/10 text-cyan-100";
}
