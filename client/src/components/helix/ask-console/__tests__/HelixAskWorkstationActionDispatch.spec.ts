import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeWorkstationActionWithLedger } from "@/lib/workstation/workstationActionExecutor";
import {
  resolveHelixAskWorkstationReceiptTerminal,
  runHelixAskWorkstationActionWithReceiptLedger,
} from "@/components/helix/ask-console/HelixAskWorkstationActionDispatch";
import {
  applyHelixAskWorkstationActionsFromResult,
  isBackendAuthorizedWorkstationReceiptTerminal,
} from "@/components/helix/ask-console/HelixAskWorkstationActionBridge";

vi.mock("@/lib/workstation/workstationActionExecutor", () => ({
  executeWorkstationActionWithLedger: vi.fn(),
}));

const mockedExecuteWorkstationActionWithLedger = vi.mocked(executeWorkstationActionWithLedger);

describe("HelixAskWorkstationActionDispatch", () => {
  beforeEach(() => {
    mockedExecuteWorkstationActionWithLedger.mockReset();
  });

  it("requires backend terminal authority before a receipt can become a terminal product", () => {
    expect(
      isBackendAuthorizedWorkstationReceiptTerminal(
        { debug: { client_receipt_terminal: { receipt_kind: "note_update_receipt" } } },
        "note_update_receipt",
      ),
    ).toBe(false);
    expect(
      isBackendAuthorizedWorkstationReceiptTerminal(
        {
          terminal_answer_authority: {
            server_authoritative: true,
            terminal_kind: "answer",
            terminal_artifact_kind: "note_update_receipt",
            final_answer_source: "note_update_receipt",
          },
        },
        "note_update_receipt",
      ),
    ).toBe(true);
  });

  it("projects note create terminal text only from a persisted note receipt", () => {
    expect(resolveHelixAskWorkstationReceiptTerminal([
      {
        action: { action: "run_panel_action", panel_id: "workstation-notes", action_id: "create_note", args: { body: "hh" } },
        execution: {
          execution_id: "workstation-action:note",
          completed: true,
          result: { ok: true, panel_id: "workstation-notes", action_id: "create_note" },
          receipt: {
            schema: "helix.workstation_action_receipt.v1",
            receipt_id: "workstation-receipt:note",
            execution_id: "workstation-action:note",
            turn_id: "turn-note",
            panel_id: "workstation-notes",
            action_id: "create_note",
            ok: true,
            receipt_kind: "note_update_receipt",
            artifact: { note_id: "note-1", created: true },
            evidence_refs: ["note:note-1"],
            deterministic: true,
            model_invoked: false,
            context_policy: "compact_context_only",
            deterministic_content_role: "observation_not_assistant_answer",
            created_at: "2026-07-08T00:00:00.000Z",
          },
        },
      },
    ])).toEqual({
      turn_id: "turn-note",
      text: "Note saved.",
      receipt_kind: "note_update_receipt",
      panel_id: "workstation-notes",
      action_id: "create_note",
      note_id: "note-1",
    });
  });

  it("uses the ledger before falling back to a parent action callback", async () => {
    mockedExecuteWorkstationActionWithLedger.mockResolvedValue({
      execution_id: "workstation-action:note",
      completed: true,
      result: { ok: true, panel_id: "workstation-notes", action_id: "create_note" },
      receipt: {
        schema: "helix.workstation_action_receipt.v1",
        receipt_id: "workstation-receipt:note",
        execution_id: "workstation-action:note",
        turn_id: "turn-note",
        panel_id: "workstation-notes",
        action_id: "create_note",
        ok: true,
        receipt_kind: "note_update_receipt",
        artifact: { note_id: "note-1", created: true },
        evidence_refs: ["note:note-1"],
        deterministic: true,
        model_invoked: false,
        context_policy: "compact_context_only",
        deterministic_content_role: "observation_not_assistant_answer",
        created_at: "2026-07-08T00:00:00.000Z",
      },
    });
    const parentDispatch = vi.fn();

    const result = await runHelixAskWorkstationActionWithReceiptLedger({
      action: { action: "run_panel_action", panel_id: "workstation-notes", action_id: "create_note", args: { body: "hh" } },
      onRunWorkstationAction: parentDispatch,
      turnId: "turn-note",
      traceId: "trace-note",
    });

    expect(parentDispatch).not.toHaveBeenCalled();
    expect(mockedExecuteWorkstationActionWithLedger).toHaveBeenCalledWith(expect.objectContaining({
      request: {
        panel_id: "workstation-notes",
        action_id: "create_note",
        args: { body: "hh" },
      },
      turn_id: "turn-note",
      trace_id: "trace-note",
    }));
    expect(result.execution?.receipt?.receipt_kind).toBe("note_update_receipt");
  });

  it("rewrites recrowned runtime results from persisted create-note receipts", async () => {
    mockedExecuteWorkstationActionWithLedger.mockResolvedValue({
      execution_id: "workstation-action:note",
      completed: true,
      result: { ok: true, panel_id: "workstation-notes", action_id: "create_note" },
      receipt: {
        schema: "helix.workstation_action_receipt.v1",
        receipt_id: "workstation-receipt:note",
        execution_id: "workstation-action:note",
        turn_id: "turn-note",
        panel_id: "workstation-notes",
        action_id: "create_note",
        ok: true,
        receipt_kind: "note_update_receipt",
        artifact: { note_id: "note-1", created: true },
        evidence_refs: ["note:note-1"],
        deterministic: true,
        model_invoked: false,
        context_policy: "compact_context_only",
        deterministic_content_role: "observation_not_assistant_answer",
        created_at: "2026-07-08T00:00:00.000Z",
      },
    });

    const result = await applyHelixAskWorkstationActionsFromResult({
      turnId: "turn-note",
      traceId: "trace-note",
      result: {
        turn_id: "turn-note",
        text: "I created the note.",
        selected_final_answer: "I created the note.",
        action_envelope: {
          schema: "helix.ask.action_envelope.v1",
          workstation_actions: [
            {
              panel_id: "workstation-notes",
              action_id: "create_note",
              args: { body: "hh" },
            },
          ],
        },
        debug: {
          action_envelope: {
            schema: "helix.ask.action_envelope.v1",
            workstation_actions: [
              {
                panel_id: "workstation-notes",
                action_id: "create_note",
                args: { body: "hh" },
              },
            ],
          },
        },
      },
    });

    expect(result.selected_final_answer).toBe("I created the note.");
    expect(result.final_answer_source).toBeUndefined();
    expect(result.terminal_artifact_kind).toBeUndefined();
    expect(result.client_receipt_terminal).toMatchObject({
      turn_id: "turn-note",
      receipt_kind: "note_update_receipt",
      panel_id: "workstation-notes",
      action_id: "create_note",
      note_id: "note-1",
    });
    expect(result.workspace_action_client_ack).toEqual([
      expect.objectContaining({
        turn_id: "turn-note",
        action_key: "workstation-notes.create_note",
        receipt_kind: "note_update_receipt",
        persisted: true,
        state_observed: true,
      }),
    ]);
    expect(result.debug).toMatchObject({
      client_receipt_terminal: {
        receipt_kind: "note_update_receipt",
      },
      client_receipt_terminal_authority: "observation_only",
    });
  });
});
