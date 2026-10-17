import { describe, expect, it } from "vitest";

import { buildMoralGraphCurrentAnswerBlockFromDebugExport } from "../currentAnswerBlock";

const buildDebugExport = () => ({
  schema: "helix.ask.debug_export.v1",
  active_turn_id: "ask:test-1",
  active_prompt: "Use MoralGraph to reflect a review bypass.",
  selected_final_answer: "MoralGraph applied reflection: do not bypass review; ask for evidence.",
  final_answer_source: "final_answer_draft",
  resolved_turn_summary: {
    terminal_artifact_kind: "model_synthesized_answer",
  },
  solver_controller_summary: {
    final_route: "moral_graph_reflection",
  },
  terminal_answer_authority: {
    route: "moral_graph_reflection",
    terminal_artifact_kind: "model_synthesized_answer",
    final_answer_source: "final_answer_draft",
  },
  current_turn_artifact_ledger: [
    {
      kind: "helix_moral_graph_reflection_tool_result",
      artifact_id: "artifact:moral-tool",
      payload: {
        kind: "helix_moral_graph_reflection_tool_result",
        reflection: {
          artifactId: "ideology_context_reflection",
          schemaVersion: "ideology_context_reflection/v1",
          graph: { rootId: "wisdom-first-principles" },
          matches: {
            exact: [
              {
                nodeId: "right-speech",
                label: "Right speech",
                pathToRoot: ["right-speech", "wisdom-first-principles"],
                reason: "The prompt asks how to respond.",
              },
            ],
            likely: [
              {
                nodeId: "two-key-review",
                label: "Two-key review",
                pathToRoot: ["two-key-review", "wisdom-first-principles"],
              },
            ],
            inferred_lenses: [],
          },
          activated_traits: [
            {
              nodeId: "direct-observation",
              label: "Direct observation",
              pathToRoot: ["direct-observation", "wisdom-first-principles"],
            },
          ],
          action_gate_warnings: [{ gateId: "review-required", label: "Review required" }],
        },
        objectiveBinding: {
          artifact: "moral_objective_binding",
          version: "v1",
          bindings: [
            {
              badgeId: "right-speech",
              role: "core",
              weight: 0.9,
              confidence: 0.8,
              source: "ideology_tree",
              pathToRoot: ["right-speech", "wisdom-first-principles"],
            },
          ],
          trace: [
            {
              step: "match_prompt_to_lenses",
              nodeIds: ["right-speech", "two-key-review"],
              badgeIds: ["right-speech"],
              reason: "Prompt contains response and review tension.",
            },
          ],
          authorityBoundary: {
            assistant_answer: false,
            raw_content_included: false,
            terminal_eligible: false,
            context_role: "tool_policy",
            ask_context_policy: "evidence_only",
            agent_executable: false,
          },
        },
      },
    },
    {
      kind: "final_answer_draft",
      artifact_id: "artifact:final-draft",
      payload: {
        schema: "helix.final_answer_draft.v1",
        text: "fallback final draft text",
      },
    },
  ],
});

describe("buildMoralGraphCurrentAnswerBlockFromDebugExport", () => {
  it("projects the current MoralGraph answer into a colored answer block model", () => {
    const block = buildMoralGraphCurrentAnswerBlockFromDebugExport(buildDebugExport(), { nowMs: 123 });

    expect(block).toMatchObject({
      schema: "moral_graph_current_answer_block/v1",
      blockId: "moral-current-answer:ask:test-1",
      turnId: "ask:test-1",
      finalAnswerSource: "final_answer_draft",
      terminalArtifactKind: "model_synthesized_answer",
      route: "moral_graph_reflection",
      toolReceiptRef: "artifact:moral-tool",
      finalAnswerDraftRef: "artifact:final-draft",
      evidenceOnly: true,
      agentExecutable: false,
      updatedAtMs: 123,
    });
    expect(block?.activatedNodeIds).toEqual(
      expect.arrayContaining(["wisdom-first-principles", "right-speech", "two-key-review", "direct-observation", "review-required"]),
    );
    expect(block?.activatedLabels).toEqual(expect.arrayContaining(["Right speech", "Two-key review", "Direct observation"]));
    expect(block?.trace).toEqual([
      {
        step: "match_prompt_to_lenses",
        nodeIds: ["right-speech", "two-key-review"],
        badgeIds: ["right-speech"],
        reason: "Prompt contains response and review tension.",
      },
    ]);
  });

  it("accepts serialized debug export text", () => {
    const block = buildMoralGraphCurrentAnswerBlockFromDebugExport(JSON.stringify(buildDebugExport()), { nowMs: 456 });

    expect(block?.turnId).toBe("ask:test-1");
    expect(block?.updatedAtMs).toBe(456);
  });

  it("ignores non-MoralGraph debug exports", () => {
    const block = buildMoralGraphCurrentAnswerBlockFromDebugExport({
      active_turn_id: "ask:plain",
      solver_controller_summary: { final_route: "model_only_direct" },
      current_turn_artifact_ledger: [],
    });

    expect(block).toBeNull();
  });
});
