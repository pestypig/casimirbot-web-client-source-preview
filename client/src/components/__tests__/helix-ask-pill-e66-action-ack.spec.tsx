import { describe, expect, it } from "vitest";

import { buildWorkspaceActionClientAckSnapshot } from "@/lib/agi/workspaceActionAck";

describe("helix ask pill E66 action ack", () => {
  it("marks a workspace action receipt as applied when the target panel is visible", () => {
    const ack = buildWorkspaceActionClientAckSnapshot({
      artifactLedger: [
        {
          kind: "workspace_action_receipt",
          turn_id: "turn-1",
          payload: {
            kind: "workspace_action_receipt",
            turn_id: "turn-1",
            producer_item_id: "panel_control",
            action_key: "scientific-calculator.open",
            target_id: "scientific-calculator",
            action_id: "open",
          },
        },
      ],
      openPanels: ["docs-viewer", "scientific-calculator"],
      createdAtMs: 123,
    });

    expect(ack).toEqual([
      {
        turn_id: "turn-1",
        item_id: "panel_control",
        action_key: "scientific-calculator.open",
        target_id: "scientific-calculator",
        action_id: "open",
        applied: true,
        visible_panel_id: "scientific-calculator",
        created_at_ms: 123,
      },
    ]);
  });

  it("keeps dispatched-only receipts explicit when the panel is not visible", () => {
    const ack = buildWorkspaceActionClientAckSnapshot({
      artifactLedger: [
        {
          kind: "workspace_action_receipt",
          payload: {
            target_id: "agi-task-history",
            action_id: "open",
          },
        },
      ],
      openPanels: ["docs-viewer"],
      createdAtMs: 456,
    });

    expect(ack).toEqual([
      {
        turn_id: null,
        item_id: null,
        action_key: "agi-task-history.open",
        target_id: "agi-task-history",
        action_id: "open",
        applied: false,
        created_at_ms: 456,
      },
    ]);
  });
});
