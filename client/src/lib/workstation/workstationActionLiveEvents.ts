import { emitHelixAskLiveEvent } from "@/lib/helix/liveEventsBus";
import type { HelixWorkstationAction } from "@/lib/workstation/workstationActionContract";

export function createWorkstationActionTraceId(actionName: string): string {
  const safeAction = actionName.trim().toLowerCase() || "unknown";
  return `workstation-action:${safeAction}:${crypto.randomUUID()}`;
}

function summarizeAction(action: HelixWorkstationAction): string {
  switch (action.action) {
    case "open_panel":
      return `open panel ${action.panel_id}`;
    case "focus_panel":
      return `focus panel ${action.panel_id}`;
    case "close_panel":
      return `close panel ${action.panel_id}`;
    case "close_active_panel":
      return "close active panel";
    case "focus_next_panel":
      return "focus next panel";
    case "focus_previous_panel":
      return "focus previous panel";
    case "reopen_last_closed_panel":
      return "reopen last closed panel";
    case "open_settings":
      return `open settings${action.tab ? ` (${action.tab})` : ""}`;
    case "set_chat_dock":
      return "set chat dock";
    case "restore_view_state":
      return "restore workstation view state";
    case "toggle_mobile_drawer":
      return "toggle mobile drawer";
    case "run_panel_action":
      return `run panel action ${action.panel_id}.${action.action_id}`;
    case "run_job":
      return "run workstation job";
    default:
      return action.action;
  }
}

export function emitWorkstationActionLiveEvent(args: {
  contextId: string;
  traceId: string;
  action: HelixWorkstationAction;
  ok: boolean;
  kind?:
    | "workstation_action_receipt"
    | "workstation_procedural_step"
    | "workstation_view_state_restore"
    | "situation_room_setup_execution_receipt";
  message?: string;
  durationMs?: number;
  artifact?: Record<string, unknown> | null;
}): void {
  const summary = summarizeAction(args.action);
  const text = `${args.ok ? "ok" : "fail"}: ${summary}${args.message ? ` - ${args.message}` : ""}`;
  emitHelixAskLiveEvent({
    contextId: args.contextId,
    traceId: args.traceId,
    entry: {
      id: `${args.traceId}:${Date.now()}`,
      text,
      tool: "workstation.action_router",
      ts: new Date().toISOString(),
      durationMs: args.durationMs,
      meta: {
        kind: args.kind ?? "workstation_action_receipt",
        ok: args.ok,
        action: args.action,
        message: args.message ?? null,
        artifact: args.artifact ?? null,
      },
    },
  });
}
