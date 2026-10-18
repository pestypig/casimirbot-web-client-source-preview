import { useHelixWorkflowDemoStore } from "@/store/useHelixWorkflowDemoStore";
import {
  buildHelixWorkflowDemoDebugExport,
} from "@/lib/helix/workflow-demos/workflow-demo-debug";
import type {
  HelixWorkflowDemoDebugEventV1,
  HelixWorkflowDemoDebugExportV1,
  HelixWorkflowDemoDebugTargetV1,
  HelixWorkflowDemoSessionV1,
} from "@shared/contracts/helix-workflow-demo.v1";
import { boundHelixDebugExportTextForUi } from "./HelixAskDebugExportSizeControl";
import { mergeRenderedLanguageModelPolicySummaryIntoDebugExport } from "./HelixAskDebugExportModelPolicyProjection";
import { mergeHelixAskLiveRuntimeClientDebugIntoExport } from "./HelixAskLiveRuntimeDebugState";
import { mergeSharedLiveRoomDebugIntoExport } from
  "./shared-live-room/SharedLiveRoomDebugArtifact";

export type HelixAskWorkflowDemoDebugState = {
  session: HelixWorkflowDemoSessionV1 | null;
  events: readonly HelixWorkflowDemoDebugEventV1[];
};

export type HelixAskWorkflowDemoDebugRow = {
  index: number;
  channel: "workflow_demo";
  id: string;
  tsMs: number | null;
  tool: "helix.workflow_demo";
  traceId: string | null;
  turnKey: string | null;
  attemptId: null;
  stage: string;
  detail: string | null;
  text: string;
};

export function useHelixAskWorkflowDemoDebugState(): HelixAskWorkflowDemoDebugState {
  return {
    session: useHelixWorkflowDemoStore((state) => state.session),
    events: useHelixWorkflowDemoStore((state) => state.debugEvents),
  };
}

export function buildHelixAskWorkflowDemoReplyDebug(args: {
  state: HelixAskWorkflowDemoDebugState;
  target: HelixWorkflowDemoDebugTargetV1;
}): HelixWorkflowDemoDebugExportV1 {
  return buildHelixWorkflowDemoDebugExport({
    session: args.state.session,
    events: args.state.events,
    target: args.target,
  });
}

export function buildHelixAskWorkflowDemoDebugRows(args: {
  debug: HelixWorkflowDemoDebugExportV1 | null | undefined;
  summarizeText: (text: string, limit: number) => string;
}): {
  rows: HelixAskWorkflowDemoDebugRow[];
  traceIds: string[];
  turnKeys: string[];
} {
  const traceIds = new Set<string>();
  const turnKeys = new Set<string>();
  const events = Array.isArray(args.debug?.current_turn_events)
    ? args.debug.current_turn_events.slice(-120)
    : [];
  const rows = events.map((event, index): HelixAskWorkflowDemoDebugRow => {
    if (event.source_trace_id) traceIds.add(event.source_trace_id);
    if (event.source_turn_id) turnKeys.add(event.source_turn_id);
    const parsedAtMs = Date.parse(event.at);
    return {
      index: index + 1,
      channel: "workflow_demo",
      id: event.event_id,
      tsMs: Number.isFinite(parsedAtMs) ? parsedAtMs : null,
      tool: "helix.workflow_demo",
      traceId: event.source_trace_id,
      turnKey: event.source_turn_id,
      attemptId: null,
      stage: event.event_kind,
      detail: [
        event.reason,
        event.before_step_id || event.after_step_id
          ? `step:${event.before_step_id ?? "none"}->${event.after_step_id ?? "none"}`
          : null,
        event.new_artifact_refs.length > 0 ? `new_refs:${event.new_artifact_refs.length}` : null,
        event.amends_debug_for_turn_id ? `amends:${event.amends_debug_for_turn_id}` : null,
      ].filter(Boolean).join(" | ") || null,
      text: args.summarizeText(
        event.qte_step_id
          ? `workflow QTE ${event.event_kind}: ${event.qte_step_id}`
          : `workflow demo ${event.event_kind}`,
        280,
      ),
    };
  });
  return {
    rows,
    traceIds: [...traceIds],
    turnKeys: [...turnKeys],
  };
}

export function mergeHelixAskClientWorkflowDemoDebugIntoExport(
  payload: string,
  workflowDemoDebug: HelixWorkflowDemoDebugExportV1 | Record<string, unknown> | null | undefined,
): string {
  if (!workflowDemoDebug || typeof workflowDemoDebug !== "object" || Array.isArray(workflowDemoDebug)) {
    return payload;
  }
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    return JSON.stringify({
      ...parsed,
      workflow_demo_debug: workflowDemoDebug,
    }, null, 2);
  } catch {
    return payload;
  }
}

export function finalizeHelixAskWorkflowDebugCopyExport(args: {
  payload: string;
  clickedTurnScope: { modelPolicyDebugSummary?: string | null } | null | undefined;
  workflowDemoDebug: HelixWorkflowDemoDebugExportV1 | null | undefined;
}): string {
  return boundHelixDebugExportTextForUi(
    mergeSharedLiveRoomDebugIntoExport(
      mergeHelixAskLiveRuntimeClientDebugIntoExport(
        mergeRenderedLanguageModelPolicySummaryIntoDebugExport(
          mergeHelixAskClientWorkflowDemoDebugIntoExport(args.payload, args.workflowDemoDebug),
          args.clickedTurnScope,
        ),
      ),
    ),
  );
}

export type { HelixWorkflowDemoDebugExportV1 };
