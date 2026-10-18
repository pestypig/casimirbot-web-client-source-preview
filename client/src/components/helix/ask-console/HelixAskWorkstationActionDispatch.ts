import { getPanelDef, type PanelDefinition } from "@/lib/desktop/panelRegistry";
import {
  dispatchHelixWorkstationAction,
  type HelixWorkstationAction,
} from "@/lib/workstation/workstationActionContract";
import {
  executeWorkstationActionWithLedger,
  type WorkstationActionExecutorResult,
} from "@/lib/workstation/workstationActionExecutor";
import { useWorkstationLayoutStore } from "@/store/useWorkstationLayoutStore";

type RunHelixAskWorkstationActionInput = {
  action: HelixWorkstationAction;
  onOpenPanel?: (panelId: PanelDefinition["id"]) => void;
  onRunWorkstationAction?: (action: HelixWorkstationAction) => void;
  turnId?: string | null;
  traceId?: string | null;
};

export type HelixAskWorkstationActionDispatchResult = {
  action: HelixWorkstationAction;
  execution: WorkstationActionExecutorResult | null;
};

export type HelixAskWorkstationReceiptTerminal = {
  turn_id: string | null;
  text: string;
  receipt_kind: string;
  panel_id: string;
  action_id: string;
  note_id?: string;
};

function fallbackDispatch(input: RunHelixAskWorkstationActionInput): HelixAskWorkstationActionDispatchResult {
  if (input.onRunWorkstationAction) {
    input.onRunWorkstationAction(input.action);
    return { action: input.action, execution: null };
  }
  dispatchHelixWorkstationAction(input.action);
  return { action: input.action, execution: null };
}

function openPanel(panelId: string, groupId?: string, onOpenPanel?: (panelId: PanelDefinition["id"]) => void): void {
  const layout = useWorkstationLayoutStore.getState();
  if (groupId) {
    layout.openPanelInGroup(groupId, panelId);
  } else {
    layout.openPanelInActiveGroup(panelId);
  }
  if (getPanelDef(panelId as PanelDefinition["id"])) {
    onOpenPanel?.(panelId as PanelDefinition["id"]);
  }
}

function focusPanel(panelId: string, groupId?: string): void {
  const layout = useWorkstationLayoutStore.getState();
  if (groupId) {
    layout.openPanelInGroup(groupId, panelId);
    layout.setActivePanel(groupId, panelId);
    return;
  }
  layout.openPanelInActiveGroup(panelId);
}

function closePanel(panelId: string, groupId?: string): void {
  const layout = useWorkstationLayoutStore.getState();
  const targetGroupId =
    groupId ??
    Object.values(layout.groups).find((group) => group.panelIds.includes(panelId))?.id ??
    layout.activeGroupId;
  layout.closePanelFromGroup(targetGroupId, panelId);
}

function readReceiptTurnId(receipt: unknown): string | null {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return null;
  const value = (receipt as { turn_id?: unknown }).turn_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function runHelixAskWorkstationActionWithReceiptLedger(
  input: RunHelixAskWorkstationActionInput,
): Promise<HelixAskWorkstationActionDispatchResult> {
  const { action } = input;
  if (action.action !== "run_panel_action") {
    return fallbackDispatch(input);
  }

  const execution = await executeWorkstationActionWithLedger({
    request: {
      panel_id: action.panel_id,
      action_id: action.action_id,
      args: action.args ?? {},
    },
    context: {
      openPanel: (panelId, groupId) => openPanel(panelId, groupId, input.onOpenPanel),
      focusPanel,
      closePanel,
      openSettings: (tab) => {
        if (typeof window === "undefined") return;
        window.dispatchEvent(new CustomEvent("open-desktop-settings", { detail: { tab } }));
      },
    },
    thread_id: "helix-ask:desktop",
    turn_id: input.turnId ?? null,
    trace_id: input.traceId ?? null,
  });
  if (!execution.completed) return fallbackDispatch(input);
  return { action, execution };
}

export function resolveHelixAskWorkstationReceiptTerminal(
  results: HelixAskWorkstationActionDispatchResult[],
): HelixAskWorkstationReceiptTerminal | null {
  for (const result of results) {
    const receipt = result.execution?.receipt;
    if (
      result.action.action === "run_panel_action" &&
      result.action.panel_id === "workstation-notes" &&
      result.action.action_id === "create_note" &&
      receipt?.ok === true &&
      receipt.receipt_kind === "note_update_receipt"
    ) {
      const noteId = typeof receipt.artifact?.note_id === "string" ? receipt.artifact.note_id : undefined;
      return {
        turn_id: readReceiptTurnId(receipt),
        text: "Note saved.",
        receipt_kind: receipt.receipt_kind,
        panel_id: result.action.panel_id,
        action_id: result.action.action_id,
        ...(noteId ? { note_id: noteId } : {}),
      };
    }
  }
  return null;
}
