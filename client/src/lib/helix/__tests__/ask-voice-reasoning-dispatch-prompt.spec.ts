import { describe, expect, it } from "vitest";

import {
  buildVoiceReasoningDispatchPrompt,
  deriveObserverDispatchPlan,
  extractPriorUserContext,
  isLikelyContextDependentTurn,
  isSimpleDirectPromptLaneCandidate,
  isSimpleTitleOrPathOnlyPrompt,
  normalizeConversationModeForDispatch,
  shouldQueueWorkspaceBackgroundReasoning,
} from "@/lib/helix/ask-voice-reasoning-dispatch-prompt";

describe("ask-voice-reasoning-dispatch-prompt", () => {
  it("derives observer dispatch plans for chat/workspace/reasoning combinations", () => {
    expect(
      deriveObserverDispatchPlan({
        question: "close the docs",
        workstationAction: { action: "close_active_panel" },
      }),
    ).toMatchObject({
      intent_type: "chat_plus_workspace",
      dispatch_plan: "workspace",
      should_dispatch_workspace: true,
      should_dispatch_reasoning: false,
      should_stay_conversational: true,
    });
    expect(
      deriveObserverDispatchPlan({
        question: "open the latest nhm2 doc and explain it in plain language",
        workstationAction: {
          action: "run_panel_action",
          panel_id: "docs-viewer",
          action_id: "open_doc",
        },
      }),
    ).toMatchObject({
      intent_type: "chat_plus_workspace_plus_reasoning",
      dispatch_plan: "workspace+reasoning",
      should_dispatch_workspace: true,
      should_dispatch_reasoning: true,
    });
    expect(
      deriveObserverDispatchPlan({
        question: "explain this section in simpler terms",
        workstationAction: null,
      }),
    ).toMatchObject({
      intent_type: "chat_plus_reasoning",
      dispatch_plan: "reasoning",
      should_dispatch_workspace: false,
      should_dispatch_reasoning: true,
    });
    expect(
      deriveObserverDispatchPlan({
        question: "hello",
        workstationAction: null,
      }),
    ).toMatchObject({
      intent_type: "chat_only",
      dispatch_plan: "chat_only",
      should_dispatch_workspace: false,
      should_dispatch_reasoning: false,
    });
  });

  it("normalizes conversation dispatch modes without admitting clarify as a dispatch mode", () => {
    expect(normalizeConversationModeForDispatch("observe")).toBe("observe");
    expect(normalizeConversationModeForDispatch("act")).toBe("act");
    expect(normalizeConversationModeForDispatch("verify")).toBe("verify");
    expect(normalizeConversationModeForDispatch("clarify")).toBeUndefined();
    expect(normalizeConversationModeForDispatch(undefined)).toBeUndefined();
  });

  it("identifies simple current-document prompts for the direct prompt lane", () => {
    expect(isSimpleDirectPromptLaneCandidate("What is the title of this paper?")).toBe(true);
    expect(isSimpleDirectPromptLaneCandidate("Tell me what this current document is about.")).toBe(true);
    expect(isSimpleDirectPromptLaneCandidate("Compare the architecture and audit the implementation.")).toBe(false);
    expect(isSimpleDirectPromptLaneCandidate("hello")).toBe(false);
  });

  it("identifies title/path-only prompts that should not queue background reasoning", () => {
    expect(isSimpleTitleOrPathOnlyPrompt("What is the path of this current document?")).toBe(true);
    expect(isSimpleTitleOrPathOnlyPrompt("Show the title of this paper.")).toBe(true);
    expect(isSimpleTitleOrPathOnlyPrompt("Verify the core claim in this paper.")).toBe(false);
  });

  it("queues background workspace reasoning only for explicit or hard workspace prompts", () => {
    expect(
      shouldQueueWorkspaceBackgroundReasoning({
        transcript: "Verify the main claim in this current paper.",
      }),
    ).toBe(true);
    expect(
      shouldQueueWorkspaceBackgroundReasoning({
        transcript: "Please compare these findings while you continue.",
      }),
    ).toBe(true);
    expect(
      shouldQueueWorkspaceBackgroundReasoning({
        transcript: "What is the title of this paper?",
        docsViewerAnchorPath: "docs/research/example.md",
      }),
    ).toBe(false);
    expect(
      shouldQueueWorkspaceBackgroundReasoning({
        transcript: "Verify the main claim.",
        docsViewerAnchorPath: "docs/research/example.md",
      }),
    ).toBe(true);
  });

  it("classifies short deictic follow-up turns as context dependent", () => {
    expect(isLikelyContextDependentTurn("where is that coming from?")).toBe(true);
    expect(isLikelyContextDependentTurn("And how does that affect propulsion?")).toBe(true);
    expect(isLikelyContextDependentTurn("Explain negative energy density in quantum field theory.")).toBe(false);
  });

  it("selects the latest prior user turn without echoing the current transcript", () => {
    expect(
      extractPriorUserContext(
        [
          "user: what is negative energy",
          "dottie: Negative energy can refer to effective energy-density terms in GR.",
          "user: where is that coming from?",
        ],
        "where is that coming from?",
      ),
    ).toBe("what is negative energy");
    expect(extractPriorUserContext(["dottie: hello"], "hello")).toBeNull();
  });

  it("builds a context-anchored dispatch prompt for follow-up turns", () => {
    const prompt = buildVoiceReasoningDispatchPrompt({
      transcript: "Where is that coming from?",
      recentTurns: [
        "user: what is negative energy",
        "dottie: Negative energy can refer to effective energy-density terms in GR.",
        "user: where is that coming from?",
      ],
      explorationPacket: null,
    });
    expect(prompt).toContain("Follow-up turn: Where is that coming from?");
    expect(prompt).toContain("Immediate anchor: what is negative energy");
    expect(prompt).toContain("Prior user turn: what is negative energy");
    expect(prompt).not.toContain("Recent turns:");
    expect(prompt).not.toContain("Immediate anchor: Where is that coming from?");
  });

  it("preserves topic-shift turns without context injection", () => {
    expect(
      buildVoiceReasoningDispatchPrompt({
        transcript: "Now explain electron spin statistics from scratch.",
        recentTurns: [
          "user: where is that coming from?",
          "dottie: It came from Casimir field constraints.",
        ],
        explorationPacket: null,
      }),
    ).toBe("Now explain electron spin statistics from scratch.");
  });
});
