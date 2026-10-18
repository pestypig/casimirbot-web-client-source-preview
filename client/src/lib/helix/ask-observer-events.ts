import type { HelixWorkstationAction } from "@/lib/workstation/workstationActionContract";

export type AskLiveEventEntry = {
  id: string;
  text: string;
  tool?: string;
  ts?: string | number;
  tsMs?: number;
  seq?: number;
  durationMs?: number;
  meta?: Record<string, unknown>;
};

export type ObserverIntentType =
  | "chat_only"
  | "chat_plus_workspace"
  | "chat_plus_reasoning"
  | "chat_plus_workspace_plus_reasoning";

export type ObserverDispatchPlan = {
  intent_type: ObserverIntentType;
  should_dispatch_workspace: boolean;
  should_dispatch_reasoning: boolean;
  should_stay_conversational: boolean;
  dispatch_plan: "chat_only" | "workspace" | "reasoning" | "workspace+reasoning";
  observer_ack: string;
};

export type ObserverPlanEventSource = "run_ask" | "external_prompt" | "submit" | "voice_dispatch";
export type ObserverPlanItemKey = "workspace_dispatched" | "reasoning_queued";
export type ObserverFinalizationMode = "read" | "observe" | "act" | "verify";
export type ObserverFinalizationCertainty = "confirmed" | "reasoned" | "hypothesis" | "unknown";

type ObserverHandoffRecommendation = {
  panel_id: string;
  action_id: string;
  rationale: string;
};

function clipText(value: string | undefined, limit: number): string {
  if (!value) return "";
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}...`;
}

export function buildObserverPlanDeltaEvent(args: {
  source: ObserverPlanEventSource;
  dispatchPlan: ObserverDispatchPlan;
  question: string;
  traceId?: string | null;
}): AskLiveEventEntry {
  const tsMs = Date.now();
  return {
    id: `observer-plan-delta:${crypto.randomUUID()}`,
    text: `observer plan update: ${args.dispatchPlan.dispatch_plan}`,
    tool: "helix.observer.plan",
    ts: new Date(tsMs).toISOString(),
    tsMs,
    meta: {
      kind: "observer_plan_delta",
      source: args.source,
      intent_type: args.dispatchPlan.intent_type,
      dispatch_plan: args.dispatchPlan.dispatch_plan,
      question: clipText(args.question.trim(), 220),
      trace_id: args.traceId ?? null,
    },
  };
}

export function buildObserverPlanItemCompletedEvent(args: {
  source: ObserverPlanEventSource;
  dispatchPlan: ObserverDispatchPlan;
  item: ObserverPlanItemKey;
  question: string;
  action?: HelixWorkstationAction | null;
  traceId?: string | null;
}): AskLiveEventEntry {
  const tsMs = Date.now();
  const itemLabel = args.item === "workspace_dispatched" ? "workspace dispatched" : "reasoning queued";
  return {
    id: `observer-plan-item-completed:${crypto.randomUUID()}`,
    text: `observer plan step complete: ${itemLabel}`,
    tool: "helix.observer.plan",
    ts: new Date(tsMs).toISOString(),
    tsMs,
    meta: {
      kind: "observer_plan_item_completed",
      item: args.item,
      source: args.source,
      intent_type: args.dispatchPlan.intent_type,
      dispatch_plan: args.dispatchPlan.dispatch_plan,
      question: clipText(args.question.trim(), 220),
      action: args.action ?? null,
      trace_id: args.traceId ?? null,
    },
  };
}

export function buildObserverFinalizationEvent(args: {
  source: ObserverPlanEventSource;
  question: string;
  mode: ObserverFinalizationMode;
  certaintyClass: ObserverFinalizationCertainty;
  evidence_refs: string[];
  needs_retrieval: boolean;
  final_source: "normal_reasoning" | "strict_gate_override";
  answer_id: string;
  attempt_id?: string | null;
  traceId?: string | null;
  live_event_count?: number;
  debug_context?: Record<string, unknown> | null;
  pending_server_requests?: number;
  turn_id?: string | null;
}): AskLiveEventEntry {
  const tsMs = Date.now();
  return {
    id: `observer-finalization:${crypto.randomUUID()}`,
    text: `observer finalization: ${args.mode} (${args.certaintyClass})`,
    tool: "helix.observer.finalization",
    ts: new Date(tsMs).toISOString(),
    tsMs,
    meta: {
      kind: "observer_finalization",
      source: args.source,
      question: clipText(args.question.trim(), 220),
      mode: args.mode,
      certainty_class: args.certaintyClass,
      needs_retrieval: args.needs_retrieval,
      evidence_refs: args.evidence_refs.slice(0, 16),
      final_source: args.final_source,
      answer_id: args.answer_id,
      attempt_id: args.attempt_id ?? null,
      trace_id: args.traceId ?? null,
      turn_id: args.turn_id ?? args.traceId ?? null,
      pending_server_requests:
        typeof args.pending_server_requests === "number" && Number.isFinite(args.pending_server_requests)
          ? Math.max(0, Math.floor(args.pending_server_requests))
          : 0,
      live_event_count:
        typeof args.live_event_count === "number" && Number.isFinite(args.live_event_count)
          ? Math.max(0, Math.floor(args.live_event_count))
          : 0,
      debug_context: args.debug_context ?? null,
    },
  };
}

function deriveObserverHandoffRecommendations(input: {
  mode: ObserverFinalizationMode;
  certaintyClass: ObserverFinalizationCertainty;
  needsRetrieval: boolean;
  evidenceRefs: string[];
}): { recommended_workspace_actions: ObserverHandoffRecommendation[]; reasoning_followups: string[] } {
  const workspaceActions: ObserverHandoffRecommendation[] = [];
  const reasoningFollowups: string[] = [];
  if (input.needsRetrieval) {
    workspaceActions.push({
      panel_id: "docs-viewer",
      action_id: "open_doc",
      rationale: "Reopen source docs and gather grounded passages for the blocked claim.",
    });
    workspaceActions.push({
      panel_id: "workstation-notes",
      action_id: "append_to_note",
      rationale: "Capture unresolved claim text in notes before continuing retrieval.",
    });
    reasoningFollowups.push("Run retrieval pass for explicit evidence refs before final claim.");
  } else {
    workspaceActions.push({
      panel_id: "workstation-notes",
      action_id: "append_to_note",
      rationale: "Capture final answer and key takeaways in note workspace.",
    });
    workspaceActions.push({
      panel_id: "workstation-clipboard-history",
      action_id: "copy_receipt_to_clipboard",
      rationale: "Copy completion receipt for reuse in follow-up prompts.",
    });
    if (input.mode === "observe" || input.mode === "verify") {
      workspaceActions.push({
        panel_id: "docs-viewer",
        action_id: "summarize_doc",
        rationale: "Generate condensed doc summary aligned with the finalized response.",
      });
    }
    if (input.certaintyClass !== "confirmed") {
      reasoningFollowups.push("Queue verify lane follow-up to increase certainty class.");
    }
    if (input.evidenceRefs.length > 0) {
      reasoningFollowups.push("Cross-check evidence refs against the final answer for citation alignment.");
    }
  }
  return {
    recommended_workspace_actions: workspaceActions.slice(0, 4),
    reasoning_followups: reasoningFollowups.slice(0, 4),
  };
}

export function buildObserverHandoffEvent(args: {
  source: ObserverPlanEventSource;
  question: string;
  mode: ObserverFinalizationMode;
  certaintyClass: ObserverFinalizationCertainty;
  evidence_refs: string[];
  needs_retrieval: boolean;
  answer_id: string;
  attempt_id?: string | null;
  traceId?: string | null;
}): AskLiveEventEntry {
  const tsMs = Date.now();
  const handoff = deriveObserverHandoffRecommendations({
    mode: args.mode,
    certaintyClass: args.certaintyClass,
    needsRetrieval: args.needs_retrieval,
    evidenceRefs: args.evidence_refs,
  });
  return {
    id: `observer-handoff:${crypto.randomUUID()}`,
    text: `observer handoff: ${handoff.recommended_workspace_actions.length} workspace actions, ${handoff.reasoning_followups.length} reasoning follow-ups`,
    tool: "helix.observer.handoff",
    ts: new Date(tsMs).toISOString(),
    tsMs,
    meta: {
      kind: "observer_handoff",
      source: args.source,
      question: clipText(args.question.trim(), 220),
      mode: args.mode,
      certainty_class: args.certaintyClass,
      needs_retrieval: args.needs_retrieval,
      answer_id: args.answer_id,
      attempt_id: args.attempt_id ?? null,
      trace_id: args.traceId ?? null,
      recommended_workspace_actions: handoff.recommended_workspace_actions,
      reasoning_followups: handoff.reasoning_followups,
    },
  };
}

function summarizeWorkstationActionForStep(action: HelixWorkstationAction): string {
  if (action.action === "run_panel_action") {
    return `${action.panel_id}.${action.action_id}`;
  }
  if (action.action === "run_job") {
    return `run_job:${action.payload.workflow ?? "custom"}`;
  }
  return action.action;
}

export function buildWorkstationProceduralStepEvent(args: {
  source: ObserverPlanEventSource;
  step: number;
  total: number;
  action: HelixWorkstationAction;
  question: string;
  traceId?: string | null;
}): AskLiveEventEntry {
  const tsMs = Date.now();
  return {
    id: `workstation-procedural-step:${crypto.randomUUID()}`,
    text: `workstation step ${args.step}/${args.total}: ${summarizeWorkstationActionForStep(args.action)}`,
    tool: "helix.workstation.chain",
    ts: new Date(tsMs).toISOString(),
    tsMs,
    meta: {
      kind: "workstation_procedural_step",
      source: args.source,
      step: args.step,
      total_steps: args.total,
      action: args.action,
      question: clipText(args.question.trim(), 220),
      trace_id: args.traceId ?? null,
    },
  };
}

export function buildNeedsRetrievalPlanEvent(args: {
  source: ObserverPlanEventSource;
  question: string;
  reason: string;
  evidence_refs: string[];
  traceId?: string | null;
}): AskLiveEventEntry {
  const tsMs = Date.now();
  return {
    id: `observer-plan-needs-retrieval:${crypto.randomUUID()}`,
    text: "observer plan update: needs_retrieval",
    tool: "helix.observer.plan",
    ts: new Date(tsMs).toISOString(),
    tsMs,
    meta: {
      kind: "observer_plan_delta",
      source: args.source,
      dispatch_plan: "reasoning",
      intent_type: "chat_plus_reasoning",
      plan_step: "needs_retrieval",
      reason: args.reason,
      evidence_refs: args.evidence_refs,
      question: clipText(args.question.trim(), 220),
      trace_id: args.traceId ?? null,
    },
  };
}
