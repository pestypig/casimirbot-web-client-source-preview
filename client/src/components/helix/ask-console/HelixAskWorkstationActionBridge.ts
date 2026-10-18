import { coerceHelixWorkstationActions } from "@/lib/workstation/workstationActionContract";
import type { HelixAskMinimalRuntimeTransportResult } from "./HelixAskMinimalRuntimeTransport";
import {
  resolveHelixAskWorkstationReceiptTerminal,
  runHelixAskWorkstationActionWithReceiptLedger,
  type HelixAskWorkstationActionDispatchResult,
} from "./HelixAskWorkstationActionDispatch";

const readRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const readString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const readActionEnvelope = (result: HelixAskMinimalRuntimeTransportResult): unknown => {
  const debug = readRecord(result.debug);
  return result.action_envelope ?? debug?.action_envelope ?? null;
};

export function isBackendAuthorizedWorkstationReceiptTerminal(
  result: unknown,
  receiptKind: string,
): boolean {
  if (!receiptKind.trim()) return false;
  const record = readRecord(result);
  const debug = readRecord(record?.debug);
  const candidates = [
    readRecord(record?.terminal_answer_authority),
    readRecord(debug?.terminal_answer_authority),
    readRecord(record?.terminal_answer_envelope),
    readRecord(debug?.terminal_answer_envelope),
  ];
  return candidates.some((candidate) =>
    candidate?.server_authoritative === true &&
    candidate?.terminal_artifact_kind === receiptKind &&
    candidate?.terminal_kind !== "failure" &&
    candidate?.final_answer_source !== "typed_failure",
  );
}

const buildClientAck = (
  result: HelixAskWorkstationActionDispatchResult,
  createdAtMs: number,
): Record<string, unknown> | null => {
  const action = result.action;
  const receipt = result.execution?.receipt;
  if (action.action !== "run_panel_action" || !receipt) return null;
  return {
    turn_id: readString(receipt.turn_id),
    item_id: readString(receipt.receipt_id) ?? readString(result.execution?.execution_id),
    action_key: `${action.panel_id}.${action.action_id}`,
    target_id: action.panel_id,
    action_id: action.action_id,
    applied: receipt.ok === true,
    execution_id: readString(result.execution?.execution_id),
    execution_status: result.execution?.completed ? "completed" : "dispatched",
    receipt_id: readString(receipt.receipt_id),
    receipt_kind: readString(receipt.receipt_kind),
    state_observed: result.execution?.completed === true && receipt.ok === true,
    persisted: result.execution?.completed === true && receipt.ok === true,
    created_at_ms: createdAtMs,
  };
};

export async function applyHelixAskWorkstationActionsFromResult(args: {
  result: HelixAskMinimalRuntimeTransportResult;
  turnId: string;
  traceId: string;
}): Promise<HelixAskMinimalRuntimeTransportResult> {
  const actions = coerceHelixWorkstationActions(readActionEnvelope(args.result));
  if (actions.length === 0) return args.result;

  const backendTurnId = readString(args.result.turn_id) ?? args.turnId;
  const dispatchResults: HelixAskWorkstationActionDispatchResult[] = [];
  for (const action of actions) {
    dispatchResults.push(
      await runHelixAskWorkstationActionWithReceiptLedger({
        action,
        turnId: backendTurnId,
        traceId: args.traceId,
      }),
    );
  }

  const clientAck = dispatchResults
    .map((entry) => buildClientAck(entry, Date.now()))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  const receiptTerminal = resolveHelixAskWorkstationReceiptTerminal(dispatchResults);
  const receiptTerminalIsBackendAuthorized = Boolean(
    receiptTerminal &&
    isBackendAuthorizedWorkstationReceiptTerminal(args.result, receiptTerminal.receipt_kind),
  );
  const debug = {
    ...(readRecord(args.result.debug) ?? {}),
    workspace_action_client_ack: clientAck,
    ...(receiptTerminal
      ? {
        client_receipt_terminal: receiptTerminal,
        ...(receiptTerminalIsBackendAuthorized
          ? {}
          : { client_receipt_terminal_authority: "observation_only" }),
      }
      : {}),
  };

  if (!receiptTerminal || !receiptTerminalIsBackendAuthorized) {
    return {
      ...args.result,
      ...(receiptTerminal ? { client_receipt_terminal: receiptTerminal } : {}),
      debug,
      workspace_action_client_ack: clientAck,
    };
  }

  return {
    ...args.result,
    client_receipt_terminal: receiptTerminal,
    workspace_action_client_ack: clientAck,
    debug,
  };
}
