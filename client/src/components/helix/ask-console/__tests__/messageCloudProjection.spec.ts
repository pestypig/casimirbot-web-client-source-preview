import { describe, expect, it } from "vitest";
import { projectMessageCloudFrame } from "../messageCloudProjection";

describe("Message Codex cloud projection", () => {
  it("shows only the last three owner turns and their task-report state", () => {
    const messages = Array.from({ length: 4 }, (_, index) => ({
      id: `turn:${index}`, at: "2026-09-30T12:00:00Z", content: `Question ${index}`,
      traceId: `typed:${index}`,
    }));
    const frame = projectMessageCloudFrame("chat:owner", messages, {
      "typed:3": { delivery: "acknowledged", report: {
        status: "completed", text: "Read-only evidence", evidenceRefs: ["private:ref"],
      } },
      "typed:2": { delivery: "acknowledged" },
    });
    expect(frame.turns.map(turn => turn.id)).toEqual(["turn:1", "turn:2", "turn:3"]);
    expect(frame.turns.map(turn => turn.delivery)).toEqual(["queued", "picked_up", "reported"]);
    expect(frame.turns[2].prompt).toBe("");
    expect(frame.turns[2].report?.text).toBe("Read-only evidence");
    expect(JSON.stringify(frame)).not.toContain("private:ref");
  });

  it("puts the readable finding first and leaves raw receipts in the full chat", () => {
    const frame = projectMessageCloudFrame("chat:owner", [{
      id: "turn:one", at: "2026-09-30T12:00:00Z", traceId: "typed:one",
      content: "Read the CasimirBot public UI catalog through MCP. Report one current public-surface count and its evidence reference.",
    }], { "typed:one": { delivery: "acknowledged", report: {
      status: "completed",
      text: "Read-only harness observation: the current public UI catalog reports 20 public surfaces, observed 2026-09-30T05:24:35.712Z. Evidence: mcp_evidence_observation:helix.public_ui.catalog.inspect:1bf5e2fe-886e-4560-b041-e502f5878431. No program action was performed.",
      evidenceRefs: ["mcp_evidence_observation:helix.public_ui.catalog.inspect:1bf5e2fe-886e-4560-b041-e502f5878431"],
    } } });
    expect(frame.turns[0].prompt).toBe("");
    expect(frame.turns[0].report?.text).toBe(
      "Read-only harness observation: the current public UI catalog reports 20 public surfaces. No program action was performed.");
    expect(JSON.stringify(frame)).not.toContain("mcp_evidence_observation");
    expect(JSON.stringify(frame)).not.toContain("2026-09-30T05:24");
  });
});
