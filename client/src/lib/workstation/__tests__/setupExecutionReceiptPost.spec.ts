import { beforeEach, describe, expect, it, vi } from "vitest";
import { postSituationRoomSetupExecutionReceipt } from "@/lib/workstation/setupExecutionReceiptPost";

describe("setup execution receipt posting", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts setup_from_prompt execution receipts to the workstation observation endpoint", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, appended: true, item_id: "item:receipt" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await postSituationRoomSetupExecutionReceipt({
      action: {
        schema_version: "helix.workstation.action/v1",
        action: "run_panel_action",
        panel_id: "situation-room-pipelines",
        action_id: "setup_from_prompt",
      },
      receipt: {
        kind: "situation_room_setup_execution_receipt",
        schema: "helix.situation_setup_receipt.v1",
        ok: true,
        correlation: {
          setup_call_id: "situation-setup:client:test",
          thread_id: "thread:client",
          turn_id: "turn:client",
        },
      },
    });

    expect(result).toEqual({ ok: true, appended: true, item_id: "item:receipt" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agi/workstation/tool-observation",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      schema: "helix.workstation.tool_observation.v1",
      thread_id: "thread:client",
      turn_id: "turn:client",
      setup_call_id: "situation-setup:client:test",
      action: {
        panel_id: "situation-room-pipelines",
        action_id: "setup_from_prompt",
      },
      ok: true,
    });
  });

  it("does not throw when the durable post fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 })));
    const result = await postSituationRoomSetupExecutionReceipt({
      action: {
        schema_version: "helix.workstation.action/v1",
        action: "run_panel_action",
        panel_id: "situation-room-pipelines",
        action_id: "setup_from_prompt",
      },
      receipt: {
        kind: "situation_room_setup_execution_receipt",
        ok: true,
        correlation: { setup_call_id: "situation-setup:client:failed" },
      },
    });
    expect(result).toEqual({ ok: false, error: "http_503" });
  });
});
