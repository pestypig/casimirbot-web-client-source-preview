import {
  findWorkstationAffordance,
  resolveWorkstationToolTerminalArtifactKind,
} from "@shared/workstation-dynamic-tools";
import {
  HELIX_WORKSTATION_ACTION_RECEIPT_SCHEMA,
  type HelixWorkstationActionReceipt,
} from "@shared/helix-workstation-affordance";
import type {
  HelixPanelActionExecutionContext,
  HelixPanelActionExecutionResult,
  HelixPanelActionRequest,
} from "@/lib/workstation/panelActionAdapters";
import { useWorkstationActionExecutionStore } from "@/store/useWorkstationActionExecutionStore";

type WorkstationActionExecutorInput = {
  request: HelixPanelActionRequest;
  context: HelixPanelActionExecutionContext;
  thread_id?: string | null;
  turn_id?: string | null;
  trace_id?: string | null;
  handler?: (
    request: HelixPanelActionRequest,
    context: HelixPanelActionExecutionContext,
  ) => HelixPanelActionExecutionResult | Promise<HelixPanelActionExecutionResult>;
};

export type WorkstationActionExecutorResult = {
  execution_id: string;
  result: HelixPanelActionExecutionResult;
  receipt?: HelixWorkstationActionReceipt | null;
  completed: boolean;
};

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${random}`;
}

function isPanelStateProofAction(actionId: string): boolean {
  return actionId === "open" || actionId === "focus" || actionId === "close";
}

function buildReceipt(args: {
  executionId: string;
  threadId?: string | null;
  turnId?: string | null;
  panelId: string;
  actionId: string;
  affordanceId?: string | null;
  receiptKind: string;
  contextPolicy: HelixWorkstationActionReceipt["context_policy"];
  result: HelixPanelActionExecutionResult;
}): HelixWorkstationActionReceipt {
  const artifact = args.result.artifact && typeof args.result.artifact === "object"
    ? (args.result.artifact as Record<string, unknown>)
    : null;
  const evidenceRefs = [
    `workstation:${args.panelId}.${args.actionId}`,
    args.affordanceId ? `affordance:${args.affordanceId}` : null,
    artifact?.trace_id ? `trace:${String(artifact.trace_id)}` : null,
    artifact?.note_id ? `note:${String(artifact.note_id)}` : null,
    artifact?.environment_id ? `live_environment:${String(artifact.environment_id)}` : null,
  ].filter((entry): entry is string => Boolean(entry));

  return {
    schema: HELIX_WORKSTATION_ACTION_RECEIPT_SCHEMA,
    receipt_id: newId("workstation-receipt"),
    execution_id: args.executionId,
    thread_id: args.threadId ?? null,
    turn_id: args.turnId ?? null,
    panel_id: args.panelId,
    action_id: args.actionId,
    affordance_id: args.affordanceId ?? null,
    ok: args.result.ok,
    receipt_kind: args.receiptKind,
    artifact,
    message: args.result.message ?? null,
    evidence_refs: evidenceRefs,
    deterministic: true,
    model_invoked: false,
    context_policy: args.contextPolicy,
    deterministic_content_role: "observation_not_assistant_answer",
    created_at: nowIso(),
  };
}

export async function executeWorkstationActionWithLedger(
  input: WorkstationActionExecutorInput,
): Promise<WorkstationActionExecutorResult> {
  const panelId = input.request.panel_id;
  const actionId = input.request.action_id;
  const affordance = findWorkstationAffordance(panelId, actionId);
  const store = useWorkstationActionExecutionStore.getState();
  const execution = store.startExecution({
    thread_id: input.thread_id ?? null,
    turn_id: input.turn_id ?? null,
    trace_id: input.trace_id ?? null,
    panel_id: panelId,
    action_id: actionId,
    affordance_id: affordance?.affordance_id ?? null,
    args: input.request.args ?? {},
  });

  store.markStatus(execution.execution_id, "rendered");
  store.markStatus(
    execution.execution_id,
    affordance?.confirmation_policy === "always" ? "confirmed" : "skipped_confirmation",
  );
  store.markStatus(execution.execution_id, "dispatched");

  try {
    const handler = input.handler ?? (await import("@/lib/workstation/panelActionAdapters")).executeHelixPanelActionAsync;
    const result = await handler(input.request, input.context);
    if (!result.ok) {
      store.failExecution(execution.execution_id, result.message ?? "Workstation action failed.");
      return { execution_id: execution.execution_id, result, receipt: null, completed: false };
    }

    const artifact = result.artifact && typeof result.artifact === "object" ? result.artifact as Record<string, unknown> : null;
    const stateObserved = Boolean(artifact) || isPanelStateProofAction(actionId);
    if (stateObserved) {
      store.markStatus(execution.execution_id, "backend_acknowledged");
      store.observeState(execution.execution_id, {
        panel_id: panelId,
        action_id: actionId,
        proof: artifact ? "artifact" : "panel_state",
      });
    }

    if (!stateObserved) {
      return { execution_id: execution.execution_id, result, receipt: null, completed: false };
    }

    const receipt = buildReceipt({
      executionId: execution.execution_id,
      threadId: input.thread_id ?? null,
      turnId: input.turn_id ?? null,
      panelId,
      actionId,
      affordanceId: affordance?.affordance_id ?? null,
      receiptKind: affordance?.expected_receipt_kind ?? resolveWorkstationToolTerminalArtifactKind(panelId, actionId) ?? "workspace_action_receipt",
      contextPolicy: affordance?.context_policy ?? "compact_context_only",
      result,
    });
    useWorkstationActionExecutionStore.getState().attachReceipt(execution.execution_id, receipt as unknown as Record<string, unknown>);
    useWorkstationActionExecutionStore.getState().markStatus(execution.execution_id, "completed");
    return { execution_id: execution.execution_id, result, receipt, completed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    useWorkstationActionExecutionStore.getState().failExecution(execution.execution_id, message);
    return {
      execution_id: execution.execution_id,
      result: {
        ok: false,
        panel_id: panelId,
        action_id: actionId,
        message,
      },
      receipt: null,
      completed: false,
    };
  }
}
