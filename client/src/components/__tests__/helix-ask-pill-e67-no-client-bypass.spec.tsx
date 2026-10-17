import { describe, expect, it } from "vitest";

import { buildHelixAskClientBypassAudit } from "@/lib/agi/workspaceActionAck";

describe("helix ask pill E67 client bypass sentinel", () => {
  it("keeps Scientific Calculator open prompts on the backend receipt path", () => {
    const audit = buildHelixAskClientBypassAudit({
      prompt: "Open Scientific Calculator",
      activeTurnId: "turn-1",
      localActionFastPathAttempted: false,
      backendTurnStarted: true,
      actionKey: "scientific-calculator.open",
      selectedFinalAnswer: "Opening panel: Scientific Calculator.",
      hasWorkspaceActionReceipt: true,
    });

    expect(audit.verdict).toBe("clean");
    expect(audit.backend_turn_started).toBe(true);
    expect(audit.local_action_fast_path_attempted).toBe(false);
    expect(audit.violations).toEqual([]);
  });

  it("flags local action prose without a backend turn", () => {
    const audit = buildHelixAskClientBypassAudit({
      prompt: "Open Scientific Calculator",
      activeTurnId: null,
      localActionFastPathAttempted: true,
      backendTurnStarted: false,
      selectedFinalAnswer: "Executed workstation action.",
      hasWorkspaceActionReceipt: false,
    });

    expect(audit.verdict).toBe("violation");
    expect(audit.violations).toEqual(
      expect.arrayContaining(["local_fast_path_without_backend_turn", "generic_action_final_answer"]),
    );
  });
});
