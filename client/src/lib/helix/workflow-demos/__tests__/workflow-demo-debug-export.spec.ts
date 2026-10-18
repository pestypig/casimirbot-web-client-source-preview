import { describe, expect, it } from "vitest";
import { buildHelixDebugExportEnvelopeFromMasterPayload } from "@/lib/agi/debugExport";
import { buildHelixWorkflowDemoDebugExport } from "@/lib/helix/workflow-demos/workflow-demo-debug";
import {
  HELIX_WORKFLOW_DEMO_SESSION_SCHEMA,
  RESEARCH_PAPER_TO_PROPOSAL_DEMO_ID,
  createEmptyHelixWorkflowDemoEvidence,
  type HelixWorkflowDemoSessionV1,
} from "@shared/contracts/helix-workflow-demo.v1";
import { createHelixWorkflowDemoCustomBinding } from "@/lib/helix/workflow-demos/workflow-demo-context";

const privateObjective = "private operator objective about quantum inequalities";

const session: HelixWorkflowDemoSessionV1 = {
  schema: HELIX_WORKFLOW_DEMO_SESSION_SCHEMA,
  runId: "workflow-demo:debug-export",
  demoId: RESEARCH_PAPER_TO_PROPOSAL_DEMO_ID,
  status: "active",
  startedAt: "2026-07-15T12:00:00.000Z",
  updatedAt: "2026-07-15T12:00:01.000Z",
  evidence: createEmptyHelixWorkflowDemoEvidence(),
  dismissedStepId: null,
  contextBinding: createHelixWorkflowDemoCustomBinding(privateObjective, "2026-07-15T12:00:00.000Z"),
};

describe("workflow demo debug export projection", () => {
  it("preserves the observation-only workflow channel in Debug Copy", () => {
    const workflowDemo = buildHelixWorkflowDemoDebugExport({
      session,
      events: [],
      target: {
        client_reply_id: "reply:debug-export",
        turn_id: "turn:debug-export",
        trace_id: "trace:debug-export",
        reply_created_at_ms: Date.parse("2026-07-15T12:00:00.000Z"),
      },
      exportedAt: "2026-07-15T12:00:02.000Z",
    });
    const exported = JSON.parse(buildHelixDebugExportEnvelopeFromMasterPayload(
      {
        id: "reply:debug-export",
        question: "What is next?",
        content: "A final answer that remains unchanged.",
      },
      {
        active_turn_id: "turn:debug-export",
        client_active_turn_id: "reply:debug-export",
        selectedDebugQuestion: "What is next?",
        selectedDebugFinalAnswer: "A final answer that remains unchanged.",
        channels: { workflowDemo },
        debug: {},
        agentLoop: {},
      },
    ));

    expect(exported.workflow_demo_debug).toMatchObject({
      schema: "helix.workflow_demo_debug.v1",
      target_reply: {
        client_reply_id: "reply:debug-export",
        turn_id: "turn:debug-export",
      },
      runtime_goal_lane_attached: false,
      answer_authority: false,
      assistant_answer: false,
      terminal_eligible: false,
      raw_content_included: false,
      session: {
        contextBinding: {
          sourceKind: "custom",
          objective_included: false,
          objectiveHash: expect.stringMatching(/^fnv1a32:/),
        },
      },
    });
    expect(JSON.stringify(exported.workflow_demo_debug)).not.toContain(privateObjective);
    expect(exported.selected_final_answer).toBe("A final answer that remains unchanged.");
  });
});
