import { describe, expect, it } from "vitest";

import { buildHelixDebugExportEnvelopeFromMasterPayload } from "@/lib/agi/debugExport";

describe("HelixAskPill E69 composite debug export", () => {
  it("preserves composite debug fields in the export envelope", () => {
    const payload = {
      selectedDebugQuestion: "Open Situation Room Sources and show the docs directory",
      selectedDebugFinalAnswer: "Completed:\n- Opening panel: Situation Room Sources.\n- Opening docs directory.",
      debug: {
        turn_id: "ask:e69",
        terminal_artifact_kind: "composite_turn_receipt",
        canonical_goal_frame: { goal_kind: "composite_goal" },
        composite_goal_frame: {
          goal_kind: "composite_goal",
          subgoals: [{ subgoal_id: "sg1" }, { subgoal_id: "sg2" }],
        },
        composite_turn_receipt: {
          kind: "composite_turn_receipt",
          completed_count: 2,
          failed_count: 0,
        },
        subgoal_artifact_map: [
          { subgoal_id: "sg1", artifact_kind: "workspace_action_receipt" },
          { subgoal_id: "sg2", artifact_kind: "workspace_action_receipt" },
        ],
        composite_anti_determinism_audit: { verdict: "clean" },
      },
      agentLoop: {
        final_answer_source: "artifact_synthesis",
      },
    };

    const exported = JSON.parse(
      buildHelixDebugExportEnvelopeFromMasterPayload(
        {
          id: "ask:e69",
          question: "Open Situation Room Sources and show the docs directory",
          content: "Completed:\n- Opening panel: Situation Room Sources.\n- Opening docs directory.",
        },
        payload,
      ),
    );

    expect(exported.schema).toBe("helix.ask.debug_export.v1");
    expect(exported.composite_goal_frame?.goal_kind).toBe("composite_goal");
    expect(exported.composite_turn_receipt?.kind).toBe("composite_turn_receipt");
    expect(exported.subgoal_artifact_map).toHaveLength(2);
    expect(exported.composite_anti_determinism_audit?.verdict).toBe("clean");
  });
});
