import type { SettingsTab } from "@/hooks/useHelixStartSettings";
import {
  coerceWorkstationViewState,
  type WorkstationViewState,
} from "@/lib/workstation/workstationDeepLink";

export const HELIX_WORKSTATION_ACTION_SCHEMA_VERSION = "helix.workstation.action/v1";
export const HELIX_WORKSTATION_ACTION_EVENT = "helix-workstation-action";

type WorkstationDrawerSnap = "peek" | "half" | "full";
type WorkstationJobWorkflow = "observable_research_pipeline";
type WorkstationJobPayload = {
  job_id?: string;
  title?: string;
  objective?: string;
  preferred_panels?: string[];
  max_steps?: number;
  workflow?: WorkstationJobWorkflow;
  workflow_args?: Record<string, unknown>;
};

export type HelixWorkstationAction =
  | {
      schema_version?: typeof HELIX_WORKSTATION_ACTION_SCHEMA_VERSION;
      action: "open_panel";
      panel_id: string;
      group_id?: string;
    }
  | {
      schema_version?: typeof HELIX_WORKSTATION_ACTION_SCHEMA_VERSION;
      action: "focus_panel";
      panel_id: string;
      group_id?: string;
    }
  | {
      schema_version?: typeof HELIX_WORKSTATION_ACTION_SCHEMA_VERSION;
      action: "close_panel";
      panel_id: string;
      group_id?: string;
    }
  | {
      schema_version?: typeof HELIX_WORKSTATION_ACTION_SCHEMA_VERSION;
      action: "close_active_panel";
    }
  | {
      schema_version?: typeof HELIX_WORKSTATION_ACTION_SCHEMA_VERSION;
      action: "focus_next_panel";
    }
  | {
      schema_version?: typeof HELIX_WORKSTATION_ACTION_SCHEMA_VERSION;
      action: "focus_previous_panel";
    }
  | {
      schema_version?: typeof HELIX_WORKSTATION_ACTION_SCHEMA_VERSION;
      action: "reopen_last_closed_panel";
    }
  | {
      schema_version?: typeof HELIX_WORKSTATION_ACTION_SCHEMA_VERSION;
      action: "open_settings";
      tab?: SettingsTab;
    }
  | {
      schema_version?: typeof HELIX_WORKSTATION_ACTION_SCHEMA_VERSION;
      action: "set_chat_dock";
      width_px?: number;
      collapsed?: boolean;
    }
  | {
      schema_version?: typeof HELIX_WORKSTATION_ACTION_SCHEMA_VERSION;
      action: "restore_view_state";
      view_state: WorkstationViewState;
    }
  | {
      schema_version?: typeof HELIX_WORKSTATION_ACTION_SCHEMA_VERSION;
      action: "toggle_mobile_drawer";
      open?: boolean;
      snap?: WorkstationDrawerSnap;
    }
  | {
      schema_version?: typeof HELIX_WORKSTATION_ACTION_SCHEMA_VERSION;
      action: "run_panel_action";
      panel_id: string;
      action_id: string;
      args?: Record<string, unknown>;
    }
  | {
      schema_version?: typeof HELIX_WORKSTATION_ACTION_SCHEMA_VERSION;
      action: "run_job";
      payload: WorkstationJobPayload;
    };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asBool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeActionName(value: unknown): string | null {
  const text = asNonEmptyString(value);
  if (!text) return null;
  return text.trim().toLowerCase();
}

function coerceAction(value: unknown): HelixWorkstationAction | null {
  const record = asRecord(value);
  if (!record) return null;
  let action = normalizeActionName(record.action ?? record.kind ?? record.type);
  if (!action && asNonEmptyString(record.panel_id ?? record.panelId ?? record.id) && asNonEmptyString(record.action_id ?? record.actionId)) {
    action = "run_panel_action";
  }
  if (!action) return null;

  if (action === "open_panel" || action === "focus_panel" || action === "close_panel") {
    const panelId = asNonEmptyString(record.panel_id ?? record.panelId ?? record.id);
    if (!panelId) return null;
    const groupId = asNonEmptyString(record.group_id ?? record.groupId) ?? undefined;
    return {
      schema_version: HELIX_WORKSTATION_ACTION_SCHEMA_VERSION,
      action,
      panel_id: panelId,
      group_id: groupId,
    };
  }

  if (
    action === "close_active_panel" ||
    action === "focus_next_panel" ||
    action === "focus_previous_panel" ||
    action === "reopen_last_closed_panel"
  ) {
    return {
      schema_version: HELIX_WORKSTATION_ACTION_SCHEMA_VERSION,
      action,
    };
  }

  if (action === "open_settings") {
    const tabRaw = asNonEmptyString(record.tab);
    const tab = tabRaw === "knowledge" ? "knowledge" : tabRaw === "preferences" ? "preferences" : undefined;
    return {
      schema_version: HELIX_WORKSTATION_ACTION_SCHEMA_VERSION,
      action,
      tab,
    };
  }

  if (action === "set_chat_dock") {
    const collapsed = asBool(record.collapsed) ?? undefined;
    const widthPx = asFiniteNumber(record.width_px ?? record.widthPx) ?? undefined;
    if (collapsed === undefined && widthPx === undefined) return null;
    return {
      schema_version: HELIX_WORKSTATION_ACTION_SCHEMA_VERSION,
      action,
      collapsed,
      width_px: widthPx,
    };
  }

  if (action === "restore_view_state") {
    const viewState = coerceWorkstationViewState(record.view_state ?? record.viewState ?? record.args);
    if (!viewState) return null;
    return {
      schema_version: HELIX_WORKSTATION_ACTION_SCHEMA_VERSION,
      action,
      view_state: viewState,
    };
  }

  if (action === "toggle_mobile_drawer") {
    const open = asBool(record.open) ?? undefined;
    const snapRaw = normalizeActionName(record.snap);
    const snap: WorkstationDrawerSnap | undefined =
      snapRaw === "peek" || snapRaw === "half" || snapRaw === "full" ? snapRaw : undefined;
    return {
      schema_version: HELIX_WORKSTATION_ACTION_SCHEMA_VERSION,
      action,
      open,
      snap,
    };
  }

  if (action === "run_panel_action") {
    const panelId = asNonEmptyString(record.panel_id ?? record.panelId ?? record.id);
    const actionId = asNonEmptyString(record.action_id ?? record.actionId);
    if (!panelId || !actionId) return null;
    const args = asRecord(record.args) ?? undefined;
    return {
      schema_version: HELIX_WORKSTATION_ACTION_SCHEMA_VERSION,
      action,
      panel_id: panelId,
      action_id: actionId,
      args,
    };
  }

  if (action === "run_job") {
    const payloadRecord = asRecord(record.payload ?? record.args ?? record.job);
    const preferredPanels = Array.isArray(payloadRecord?.preferred_panels)
      ? payloadRecord?.preferred_panels
          .map((value) => asNonEmptyString(value))
          .filter((value): value is string => Boolean(value))
      : [];
    const maxSteps = asFiniteNumber(payloadRecord?.max_steps);
    const workflowRaw = asNonEmptyString(payloadRecord?.workflow);
    const workflow: WorkstationJobWorkflow | undefined =
      workflowRaw === "observable_research_pipeline" ? workflowRaw : undefined;
    const workflowArgs = asRecord(payloadRecord?.workflow_args ?? payloadRecord?.workflowArgs) ?? undefined;
    return {
      schema_version: HELIX_WORKSTATION_ACTION_SCHEMA_VERSION,
      action,
      payload: {
        job_id: asNonEmptyString(payloadRecord?.job_id),
        title: asNonEmptyString(payloadRecord?.title),
        objective: asNonEmptyString(payloadRecord?.objective),
        preferred_panels: preferredPanels.length > 0 ? preferredPanels : undefined,
        max_steps:
          typeof maxSteps === "number" && Number.isFinite(maxSteps) ? Math.max(1, Math.floor(maxSteps)) : undefined,
        workflow,
        workflow_args: workflowArgs,
      },
    };
  }

  return null;
}

function collectActionCandidates(value: unknown): unknown[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (!record) return [value];
  if (Array.isArray(record.actions)) return record.actions;
  if (Array.isArray(record.workstation_actions)) return record.workstation_actions;
  if (Array.isArray(record.ui_actions)) return record.ui_actions;
  if (Array.isArray(record.panel_actions)) return record.panel_actions;
  return [value];
}

export function coerceHelixWorkstationActions(value: unknown): HelixWorkstationAction[] {
  const candidates = collectActionCandidates(value);
  const parsed: HelixWorkstationAction[] = [];
  for (const candidate of candidates) {
    const action = coerceAction(candidate);
    if (action) parsed.push(action);
  }
  return parsed;
}

export function extractHelixWorkstationActionBlocks(raw: string): {
  cleanedText: string;
  actions: HelixWorkstationAction[];
} {
  if (!raw) {
    return { cleanedText: "", actions: [] };
  }

  const pattern = /```(?:json|helix-workstation-action|workstation-action)\s*([\s\S]*?)```/gi;
  const actions: HelixWorkstationAction[] = [];
  let cleanedText = raw;
  let match: RegExpExecArray | null = null;
  while ((match = pattern.exec(raw)) !== null) {
    const block = match[1]?.trim();
    if (!block) continue;
    try {
      const parsed = JSON.parse(block) as unknown;
      actions.push(...coerceHelixWorkstationActions(parsed));
      cleanedText = cleanedText.replace(match[0], "").trim();
    } catch {
      // Ignore non-JSON fenced blocks.
    }
  }
  return { cleanedText, actions };
}

export function dispatchHelixWorkstationAction(action: HelixWorkstationAction): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(HELIX_WORKSTATION_ACTION_EVENT, {
      detail: action,
    }),
  );
}

export function dispatchHelixWorkstationActions(actions: HelixWorkstationAction[]): void {
  for (const action of actions) {
    dispatchHelixWorkstationAction(action);
  }
}
