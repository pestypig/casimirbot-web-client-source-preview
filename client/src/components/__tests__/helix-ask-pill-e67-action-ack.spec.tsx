import { describe, expect, it } from "vitest";

import { buildWorkspaceActionClientAckSnapshot } from "@/lib/agi/workspaceActionAck";

describe("helix ask pill E67 action ack precision", () => {
  it("keeps dispatched-only receipts as not yet applied without client visibility", () => {
    const ack = buildWorkspaceActionClientAckSnapshot({
      artifactLedger: [
        {
          kind: "workspace_action_receipt",
          turn_id: "turn-1",
          producer_item_id: "panel_control",
          payload: {
            kind: "workspace_action_receipt",
            turn_id: "turn-1",
            producer_item_id: "panel_control",
            action_key: "agi-essence-console.open",
            target_id: "agi-essence-console",
            action_id: "open",
            status: "dispatched",
          },
        },
      ],
      openPanels: ["docs-viewer"],
      createdAtMs: 1000,
    });

    expect(ack).toEqual([
      {
        turn_id: "turn-1",
        item_id: "panel_control",
        action_key: "agi-essence-console.open",
        target_id: "agi-essence-console",
        action_id: "open",
        applied: false,
        created_at_ms: 1000,
      },
    ]);
  });

  it("marks acknowledgement as applied only when the target panel is visible", () => {
    const ack = buildWorkspaceActionClientAckSnapshot({
      artifactLedger: [
        {
          kind: "workspace_action_receipt",
          turn_id: "turn-2",
          producer_item_id: "panel_control",
          payload: {
            action_key: "agi-essence-console.open",
            target_id: "agi-essence-console",
            action_id: "open",
          },
        },
      ],
      openPanels: ["docs-viewer", "agi-essence-console"],
      createdAtMs: 2000,
    });

    expect(ack[0]).toMatchObject({
      turn_id: "turn-2",
      item_id: "panel_control",
      action_key: "agi-essence-console.open",
      target_id: "agi-essence-console",
      action_id: "open",
      applied: true,
      visible_panel_id: "agi-essence-console",
    });
  });

  it("includes persisted executor receipts for note creation", () => {
    const ack = buildWorkspaceActionClientAckSnapshot({
      artifactLedger: [],
      openPanels: ["workstation-notes"],
      actionExecutions: {
        "workstation-action:note-1": {
          schema: "helix.workstation_action_execution.v1",
          execution_id: "workstation-action:note-1",
          turn_id: "turn-note-create",
          panel_id: "workstation-notes",
          action_id: "create_note",
          status: "completed",
          state_observed: true,
          receipt: {
            schema: "helix.workstation_action_receipt.v1",
            receipt_id: "workstation-receipt:note-1",
            turn_id: "turn-note-create",
            panel_id: "workstation-notes",
            action_id: "create_note",
            ok: true,
            receipt_kind: "note_update_receipt",
            artifact: {
              note_id: "note-1",
              created: true,
            },
          },
        },
      },
      createdAtMs: 3000,
    });

    expect(ack).toEqual([
      expect.objectContaining({
        turn_id: "turn-note-create",
        item_id: "workstation-receipt:note-1",
        action_key: "workstation-notes.create_note",
        target_id: "workstation-notes",
        action_id: "create_note",
        applied: true,
        persisted: true,
        state_observed: true,
        visible_panel_id: "workstation-notes",
        execution_id: "workstation-action:note-1",
        execution_status: "completed",
        receipt_id: "workstation-receipt:note-1",
        receipt_kind: "note_update_receipt",
        created_at_ms: 3000,
      }),
    ]);
  });
});
