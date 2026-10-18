import type { HelixWorkstationAction } from "@/lib/workstation/workstationActionContract";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown): string | null => {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : null;
};

export type SetupExecutionReceiptPostResult =
  | { ok: true; appended?: boolean; item_id?: string | null }
  | { ok: false; error: string };

export const postSituationRoomSetupExecutionReceipt = async (args: {
  action: HelixWorkstationAction;
  receipt: Record<string, unknown>;
  traceId?: string | null;
}): Promise<SetupExecutionReceiptPostResult> => {
  const correlation = asRecord(args.receipt.correlation);
  const setupCallId = asString(correlation?.setup_call_id ?? args.receipt.setup_call_id);
  if (!setupCallId) return { ok: false, error: "missing_setup_call_id" };
  const body = {
    schema: "helix.workstation.tool_observation.v1",
    thread_id: asString(correlation?.thread_id),
    turn_id: asString(correlation?.turn_id),
    session_id: asString(correlation?.session_id),
    trace_id: asString(correlation?.trace_id) ?? args.traceId ?? null,
    setup_call_id: setupCallId,
    action: {
      panel_id: args.action.panel_id,
      action_id: args.action.action_id ?? "setup_from_prompt",
    },
    receipt: args.receipt,
    ok: args.receipt.ok === true,
    error: asString(args.receipt.error),
  };
  try {
    const response = await fetch("/api/agi/workstation/tool-observation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) return { ok: false, error: `http_${response.status}` };
    const parsed = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    return {
      ok: true,
      appended: parsed?.appended === true,
      item_id: asString(parsed?.item_id),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "post_failed",
    };
  }
};

export const maybePostSituationRoomSetupExecutionReceipt = (args: {
  action: HelixWorkstationAction;
  artifact?: Record<string, unknown> | null;
  traceId?: string | null;
}): void => {
  if (args.artifact?.kind !== "situation_room_setup_execution_receipt") return;
  void postSituationRoomSetupExecutionReceipt({
    action: args.action,
    receipt: args.artifact,
    traceId: args.traceId ?? null,
  });
};
