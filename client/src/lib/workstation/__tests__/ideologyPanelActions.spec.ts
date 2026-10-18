import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeIdeologyPanelAction } from "@/lib/workstation/ideologyPanelActions";
import {
  HELIX_IDEOLOGY_CONTEXT_RECEIPT_SCHEMA,
  HELIX_IDEOLOGY_MOTIVE_COMPARISON_RECEIPT_SCHEMA,
} from "@shared/helix-ideology-workstation";

const ideologyDoc = {
  version: 1,
  rootId: "mission-ethos",
  nodes: [
    {
      id: "mission-ethos",
      slug: "mission-ethos",
      title: "Mission Ethos",
      excerpt: "Physics with compassion.",
      tags: ["ethos", "root"],
      children: ["beginners-mind", "right-speech-infrastructure", "capture-resistance"],
    },
    {
      id: "beginners-mind",
      slug: "beginners-mind",
      title: "Beginner's Mind",
      excerpt: "Hold a hypothesis lightly.",
      tags: ["moral", "uncertainty"],
      children: [],
    },
    {
      id: "right-speech-infrastructure",
      slug: "right-speech",
      title: "Right Speech Infrastructure",
      excerpt: "Route communication toward clarity and care.",
      tags: ["moral", "speech"],
      children: [],
    },
    {
      id: "capture-resistance",
      slug: "capture-resistance",
      title: "Capture Resistance",
      excerpt: "Check urgency, secrecy, and authority pressure before acting.",
      tags: ["guardrail", "motive"],
      children: [],
    },
  ],
};

const context = {
  openPanel: vi.fn(),
  focusPanel: vi.fn(),
  closePanel: vi.fn(),
  openSettings: vi.fn(),
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ideology panel actions", () => {
  beforeEach(() => {
    context.openPanel.mockClear();
    context.focusPanel.mockClear();
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => {
      const target = String(url);
      if (target.includes("/api/ethos/ideology/guidance")) {
        return jsonResponse({
          invariant: "system advises, user decides.",
          detectedBundles: ["urgency_scarcity"],
          recommendedNodeIds: ["capture-resistance"],
          warnings: ["Urgency pressure detected."],
          recommendedArtifacts: [],
          suggestedVerificationSteps: ["Slow down and verify source authority."],
        });
      }
      if (target.includes("/api/ethos/ideology")) {
        return jsonResponse(ideologyDoc);
      }
      return new Response("not found", { status: 404 });
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns compact search receipts without raw ideology tree injection", async () => {
    const result = await executeIdeologyPanelAction({
      panel_id: "mission-ethos",
      action_id: "search_nodes",
      args: { query: "moral clarity", limit: 3 },
    }, context);

    expect(result.ok).toBe(true);
    expect(context.openPanel).toHaveBeenCalledWith("mission-ethos");
    expect(result.artifact).toMatchObject({
      schema: HELIX_IDEOLOGY_CONTEXT_RECEIPT_SCHEMA,
      kind: "ideology_context_receipt",
      panel_id: "mission-ethos",
      query: "moral clarity",
      raw_tree_included: false,
      deterministic_content_role: "observation_not_assistant_answer",
    });
    expect(result.artifact?.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          node_id: "beginners-mind",
          evidence_refs: expect.arrayContaining(["ideology:beginners-mind"]),
        }),
      ]),
    );
  });

  it("prepares motive comparison evidence as a tool receipt, not an answer", async () => {
    const result = await executeIdeologyPanelAction({
      panel_id: "mission-ethos",
      action_id: "compare_motive_to_zen",
      args: {
        motive: "They say we must decide immediately because an expert promised profit.",
        framework: "moral",
      },
    }, context);

    expect(result.ok).toBe(true);
    expect(result.artifact).toMatchObject({
      schema: HELIX_IDEOLOGY_MOTIVE_COMPARISON_RECEIPT_SCHEMA,
      kind: "ideology_motive_comparison_receipt",
      panel_id: "mission-ethos",
      framework: "moral",
      raw_tree_included: false,
      model_invoked: false,
      deterministic_content_role: "observation_not_assistant_answer",
      boundary: {
        advisory_only: true,
        user_decides: true,
        not_action_authority: true,
      },
    });
    expect(result.artifact?.pressure_signals).toEqual(
      expect.arrayContaining(["urgency_scarcity", "financial_ask", "authority_claim"]),
    );
    expect(String(result.artifact?.comparison_prompt)).toContain("Treat the framework as advisory evidence");
  });
});
