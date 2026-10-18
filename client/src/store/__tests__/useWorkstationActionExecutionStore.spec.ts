import { beforeEach, describe, expect, it } from "vitest";
import { executeWorkstationActionWithLedger } from "@/lib/workstation/workstationActionExecutor";
import { useWorkstationActionExecutionStore } from "@/store/useWorkstationActionExecutionStore";
import { useWorkstationNotesStore } from "@/store/useWorkstationNotesStore";

describe("useWorkstationActionExecutionStore", () => {
  beforeEach(() => {
    useWorkstationActionExecutionStore.getState().reset();
    useWorkstationNotesStore.setState({
      notes: {},
      order: [],
      active_note_id: undefined,
    });
  });

  it("records lifecycle status, receipt, and state observation", () => {
    const execution = useWorkstationActionExecutionStore.getState().startExecution({
      panel_id: "scientific-calculator",
      action_id: "solve_with_steps",
      affordance_id: "scientific-calculator.solve_with_steps",
      args: { expression: "x^2-4=0" },
    });

    useWorkstationActionExecutionStore.getState().markStatus(execution.execution_id, "dispatched");
    useWorkstationActionExecutionStore.getState().observeState(execution.execution_id, { proof: "artifact" });
    useWorkstationActionExecutionStore.getState().attachReceipt(execution.execution_id, {
      schema: "helix.workstation_action_receipt.v1",
      ok: true,
    });
    useWorkstationActionExecutionStore.getState().markStatus(execution.execution_id, "completed");

    const stored = useWorkstationActionExecutionStore.getState().executions[execution.execution_id];
    expect(stored.status).toBe("completed");
    expect(stored.state_observed).toBe(true);
    expect(stored.receipt).toEqual(expect.objectContaining({ ok: true }));
  });

  it("records a note_update_receipt after a create_note action persists the note", async () => {
    const result = await executeWorkstationActionWithLedger({
      request: {
        panel_id: "workstation-notes",
        action_id: "create_note",
        args: { body: "hh" },
      },
      context: {
        openPanel: () => undefined,
        focusPanel: () => undefined,
        closePanel: () => undefined,
        openSettings: () => undefined,
      },
      turn_id: "turn-create-note-receipt",
      handler: (request) => {
        const note = useWorkstationNotesStore.getState().createManualNote({
          body: String(request.args?.body ?? ""),
        });
        return {
          ok: true,
          panel_id: request.panel_id,
          action_id: request.action_id,
          artifact: {
            note_id: note.id,
            title: note.title,
            active_note_id: note.id,
            created: true,
          },
        };
      },
    });

    expect(result.completed).toBe(true);
    expect(result.receipt).toEqual(expect.objectContaining({
      panel_id: "workstation-notes",
      action_id: "create_note",
      receipt_kind: "note_update_receipt",
      ok: true,
    }));
    const noteId = result.receipt?.artifact?.note_id as string | undefined;
    expect(noteId).toBeTruthy();
    expect(useWorkstationNotesStore.getState().notes[noteId ?? ""]?.body).toBe("hh");
    const stored = useWorkstationActionExecutionStore.getState().executions[result.execution_id];
    expect(stored.status).toBe("completed");
    expect(stored.state_observed).toBe(true);
    expect(stored.receipt?.receipt_kind).toBe("note_update_receipt");
  });
});
