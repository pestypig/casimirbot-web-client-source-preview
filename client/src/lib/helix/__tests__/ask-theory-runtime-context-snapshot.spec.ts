import { describe, expect, it } from "vitest";
import { buildAskTurnWorkspaceContextSnapshotFromState } from "../ask-workspace-context-snapshot";

it("projects an explicitly bound runtime result as non-terminal Ask context", () => {
  const context = { schema: "helix.theory_run_context_observation.v1", requestId: "req", receiptId: "receipt", runtimeId: "solar.manifest", outputRole: "evidence_for_synthesis", terminalEligible: false, postToolModelStepRequired: true };
  const snapshot = buildAskTurnWorkspaceContextSnapshotFromState({
    sessionId: null,
    layoutState: { activeGroupId: "main", groups: { main: { activePanelId: "scientific-calculator", panelIds: ["scientific-calculator"] } } },
    notesState: { notes: {}, order: [] }, calculatorState: {}, theoryRuntimeContext: context,
    docContext: { path: null, source: "none" }, lastUpdatedAtMs: 1,
  });
  expect(snapshot).toMatchObject({ hasTheoryRuntimeContext: true, activeTheoryRuntimeContext: { requestId: "req", receiptId: "receipt", output_role: "evidence_for_synthesis", terminal_eligible: false, post_tool_model_step_required: true, assistant_answer: false, raw_content_included: false } });
});
