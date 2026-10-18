import { beforeEach, describe, expect, it } from "vitest";

(globalThis as Record<string, unknown>).__HELIX_ASK_JOB_TIMEOUT_MS__ = "1200000";

import { executeWorkstationActionWithLedger } from "@/lib/workstation/workstationActionExecutor";
import { useWorkstationActionExecutionStore } from "@/store/useWorkstationActionExecutionStore";

const context = {
  openPanel: () => undefined,
  focusPanel: () => undefined,
  closePanel: () => undefined,
  openSettings: () => undefined,
};

describe("workstationActionExecutor", () => {
  beforeEach(() => {
    useWorkstationActionExecutionStore.getState().reset();
  });

  it("does not mark an action completed until artifact or state proof exists", async () => {
    const execution = await executeWorkstationActionWithLedger({
      request: { panel_id: "scientific-calculator", action_id: "solve_with_steps", args: {} },
      context,
      handler: async () => ({
        ok: true,
        panel_id: "scientific-calculator",
        action_id: "solve_with_steps",
      }),
    });

    expect(execution.completed).toBe(false);
    expect(execution.receipt).toBeNull();
    expect(useWorkstationActionExecutionStore.getState().executions[execution.execution_id].status).toBe("dispatched");
  });

  it("records a receipt-backed completion when the handler returns an artifact", async () => {
    const execution = await executeWorkstationActionWithLedger({
      request: {
        panel_id: "scientific-calculator",
        action_id: "solve_with_steps",
        args: { expression: "x^2-4=0" },
      },
      context,
      thread_id: "helix-ask:desktop",
      turn_id: "turn:test",
      handler: async () => ({
        ok: true,
        panel_id: "scientific-calculator",
        action_id: "solve_with_steps",
        artifact: {
          normalized_expression: "x^2-4=0",
          result_text: "x = -2, 2",
          trace_id: "trace:calculator:test",
        },
      }),
    });

    expect(execution.completed).toBe(true);
    expect(execution.receipt).toEqual(
      expect.objectContaining({
        schema: "helix.workstation_action_receipt.v1",
        ok: true,
        panel_id: "scientific-calculator",
        action_id: "solve_with_steps",
        receipt_kind: "workspace_action_receipt",
        deterministic_content_role: "observation_not_assistant_answer",
      }),
    );
    const stored = useWorkstationActionExecutionStore.getState().executions[execution.execution_id];
    expect(stored.status).toBe("completed");
    expect(stored.state_observed).toBe(true);
  });
});
