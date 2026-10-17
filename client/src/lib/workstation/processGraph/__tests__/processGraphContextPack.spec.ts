import { describe, expect, it } from "vitest";
import {
  applyWorkstationProcessGraphEvent,
  createInitialWorkstationProcessGraphState,
} from "../processGraphReducer";
import { buildProcessGraphContextPack } from "../buildProcessGraphContextPack";
import {
  buildProcessGraphOverviewText,
  declineProcessGraphAskOverview,
  shouldUseProcessGraphContextPack,
} from "../processGraphAskOverview";

describe("workstation process graph context pack", () => {
  it("prioritizes active state, recent artifacts, warnings, and hard max counts", () => {
    let state = createInitialWorkstationProcessGraphState("session:test");
    state = applyWorkstationProcessGraphEvent(state, {
      type: "job.started",
      jobId: "job-active",
      label: "Active translation",
      traceId: "trace-active",
      panelId: "situation-room-pipelines",
      ts: "2026-05-15T10:00:00.000Z",
    });
    state = applyWorkstationProcessGraphEvent(state, {
      type: "tool.failed",
      tool: "docs-viewer.search_docs",
      traceId: "trace-failed",
      panelId: "docs-viewer",
      label: "Docs search failed",
      ts: "2026-05-15T10:01:00.000Z",
    });
    state = applyWorkstationProcessGraphEvent(state, {
      type: "tool.completed",
      tool: "workstation-notes.list_notes",
      traceId: "trace-notes",
      panelId: "workstation-notes",
      artifact: { kind: "notes_list", title: "Notes list" },
      ts: "2026-05-15T10:02:00.000Z",
    });

    const pack = buildProcessGraphContextPack(state, {
      maxActive: 2,
      maxArtifacts: 1,
      maxTimeline: 2,
    });

    expect(pack.kind).toBe("workstation_process_graph_context_pack");
    expect(pack.active).toHaveLength(2);
    expect(pack.active.some((node) => node.status === "failed")).toBe(true);
    expect(pack.recentArtifacts).toHaveLength(1);
    expect(pack.recentArtifacts[0]?.artifactKind).toBe("notes_list");
    expect(pack.recentTimeline).toHaveLength(2);
    expect(pack.warnings.some((warning) => warning.includes("failed"))).toBe(true);
  });

  it("drops hidden/scratch fields from compact context and overview text", () => {
    const state = applyWorkstationProcessGraphEvent(createInitialWorkstationProcessGraphState("session:test"), {
      type: "tool.completed",
      tool: "docs-viewer.inspect",
      traceId: "trace-hidden_reasoning",
      panelId: "docs-viewer",
      label: "chain_of_thought should not surface",
      artifact: {
        kind: "doc_context",
        title: "scratchpad should not surface",
        hidden_reasoning: "private",
      },
      ts: "2026-05-15T10:00:00.000Z",
    });
    const pack = buildProcessGraphContextPack(state);
    const serialized = JSON.stringify(pack);
    const overview = buildProcessGraphOverviewText(pack);

    expect(serialized).not.toContain("hidden_reasoning");
    expect(serialized).not.toContain("chain_of_thought");
    expect(serialized).not.toContain("scratchpad");
    expect(overview).not.toContain("chain_of_thought");
    expect(overview).toContain("observational");
  });

  it("detects workstation overview prompts without making them executable", () => {
    expect(shouldUseProcessGraphContextPack("what is happening in the workstation?")).toBe(true);
    expect(shouldUseProcessGraphContextPack("continue that active pipeline")).toBe(true);
    expect(shouldUseProcessGraphContextPack("What changed in the process graph?")).toBe(true);
    expect(shouldUseProcessGraphContextPack("What artifacts are active in the workstation overview?")).toBe(true);
    expect(shouldUseProcessGraphContextPack("summarize quantum vacuum pressure")).toBe(false);
  });

  it("does not capture procedure-memory prompts as workstation overview prompts", () => {
    expect(shouldUseProcessGraphContextPack("What changed in the last situation epoch?")).toBe(false);
    expect(shouldUseProcessGraphContextPack("Show the evidence for that.")).toBe(false);
    expect(shouldUseProcessGraphContextPack("Why did you say that?")).toBe(false);
    expect(shouldUseProcessGraphContextPack("What changed in the current screen?")).toBe(false);
    expect(shouldUseProcessGraphContextPack("Explain what I'm looking at in the visual capture.")).toBe(false);
    expect(shouldUseProcessGraphContextPack("What is happening in the live source?")).toBe(false);
    expect(shouldUseProcessGraphContextPack("Read the live-source mailbox and interpret what is happening across the unread visual summaries.")).toBe(false);
    expect(shouldUseProcessGraphContextPack("Read the visual mail and interpret what is happening. Say what should be watched next.")).toBe(false);
    expect(shouldUseProcessGraphContextPack("What is happening across the live source mail?")).toBe(false);
    expect(shouldUseProcessGraphContextPack("What changed in the latest visual update?")).toBe(false);
    expect(shouldUseProcessGraphContextPack("Review the new source mail and say what changed.")).toBe(false);
    expect(shouldUseProcessGraphContextPack("Okay, can you describe what changed since last scene?")).toBe(false);
    expect(shouldUseProcessGraphContextPack("What changed since the previous scene?")).toBe(false);
    expect(shouldUseProcessGraphContextPack("Compare this scene to the last scene.")).toBe(false);
    expect(shouldUseProcessGraphContextPack("Okay, what changed since last seen epoch?")).toBe(false);
    expect(shouldUseProcessGraphContextPack("What changed since the previous visual?")).toBe(false);
    expect(shouldUseProcessGraphContextPack("Compare current scene to last capture.")).toBe(false);
    expect(shouldUseProcessGraphContextPack("What changed in the visual epoch?")).toBe(false);
    expect(shouldUseProcessGraphContextPack("Replay the procedure memory.")).toBe(false);
    expect(shouldUseProcessGraphContextPack("Okay, so what is the difference between the last scene in the scene I'm looking at now")).toBe(false);
    expect(declineProcessGraphAskOverview("Compare the current scene to the previous visual")).toMatchObject({
      declined: true,
      reason: "procedure_epoch_replay_prompt_requires_backend_ask",
    });
  });
});
