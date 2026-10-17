import { describe, expect, it } from "vitest";
import {
  createHelixWorkflowDemoCurrentChatBinding,
  selectHelixWorkflowDemoContextCandidate,
} from "@/lib/helix/workflow-demos/workflow-demo-context";

describe("workflow demo context binding", () => {
  it("selects the latest substantive research objective and skips smoke/debug turns", () => {
    const candidate = selectHelixWorkflowDemoContextCandidate({
      activeId: "chat:active",
      sessions: {
        "chat:active": {
          id: "chat:active",
          contextId: "helix-ask:desktop",
          updatedAt: "2026-07-15T12:03:00.000Z",
          messages: [
            {
              id: "message:research",
              role: "user",
              at: "2026-07-15T12:01:00.000Z",
              traceId: "turn:research",
              content: "Find primary papers on quantum-energy-inequality constraints involving negative energy, traversable wormholes, or warp drives.",
            },
            {
              id: "message:debug",
              role: "user",
              at: "2026-07-15T12:02:00.000Z",
              traceId: "turn:debug",
              content: "Explain the terminal_authority classifier defect in this debug export.",
            },
            {
              id: "message:smoke",
              role: "user",
              at: "2026-07-15T12:03:00.000Z",
              traceId: "turn:smoke",
              content: "LOOKUP_SMOKE_03 — Search arXiv for a quantum paper.",
            },
          ],
        },
      },
    });

    expect(candidate).toMatchObject({
      sourceSessionId: "chat:active",
      sourceMessageId: "message:research",
      sourceTraceId: "turn:research",
      confidence: "high",
    });
    expect(candidate?.objective).toContain("quantum-energy-inequality");
  });

  it("returns no candidate when the active chats contain no bounded scientific research intent", () => {
    const candidate = selectHelixWorkflowDemoContextCandidate({
      activeId: "chat:active",
      sessions: {
        "chat:active": {
          id: "chat:active",
          contextId: "helix-ask:desktop",
          messages: [{ id: "message:hello", role: "user", content: "Help me rearrange these panels." }],
        },
      },
    });
    expect(candidate).toBeNull();
  });

  it("does not borrow a stale objective from another chat when the active chat is blank", () => {
    const candidate = selectHelixWorkflowDemoContextCandidate({
      activeId: "chat:new",
      sessions: {
        "chat:new": {
          id: "chat:new",
          contextId: "helix-ask:desktop:new",
          updatedAt: "2026-07-15T12:05:00.000Z",
          messages: [],
        },
        "chat:old": {
          id: "chat:old",
          contextId: "helix-ask:desktop:old",
          updatedAt: "2026-07-15T12:04:00.000Z",
          messages: [{
            id: "message:old",
            role: "user",
            content: "Find scholarly papers about Casimir scalar field geometry and negative energy.",
          }],
        },
      },
    });
    expect(candidate).toBeNull();
  });

  it("pins source identity and a hash without copying the surrounding chat", () => {
    const binding = createHelixWorkflowDemoCurrentChatBinding({
      objective: "Find primary papers about Casimir scalar-field geometry.",
      sourceSessionId: "chat:active",
      sourceMessageId: "message:research",
      sourceTraceId: "turn:research",
      sourceMessageAt: "2026-07-15T12:01:00.000Z",
      confidence: "high",
      reason: "test",
    }, "2026-07-15T12:04:00.000Z");

    expect(binding).toMatchObject({
      schema: "helix.workflow_demo_context.v1",
      sourceKind: "current_chat",
      sourceMessageId: "message:research",
      sourceTraceId: "turn:research",
      confirmedByOperator: true,
    });
    expect(binding.objectiveHash).toMatch(/^fnv1a32:/);
    expect(binding).not.toHaveProperty("messages");
  });
});
