import { afterEach, describe, expect, it, vi } from "vitest";
import { runAskTurn, runAskTurnStream } from "../api";
import { setPhysicsGlyphAskConnection } from "@/lib/workstation/physicsGlyphAskContext";
const identity = vi.hoisted(() => ({ profileId: "alice" as string | null }));
vi.mock("@/lib/workstation/accountCapabilityPolicy", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/workstation/accountCapabilityPolicy")>(),
  readCachedAccountProfileIdentity: () => identity,
}));
afterEach(() => { setPhysicsGlyphAskConnection(null, false); identity.profileId = "alice"; vi.unstubAllGlobals(); });
const peerId = "00000000-0000-4000-8000-000000000001";

describe("physics scenario context at both Ask request boundaries", () => {
  it.each([false, true])("attaches only the connected public peer, preserving the original question (stream=%s)", async stream => {
    setPhysicsGlyphAskConnection(peerId, true);
    const question = "Why can't my hand go through the table?";
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => stream
      ? new Response('event: turn_final\ndata: {"ok":true,"text":"fixture answer"}\n\n', { headers: { "Content-Type": "text/event-stream" } })
      : new Response('{"ok":true,"text":"fixture answer"}', { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    await (stream ? runAskTurnStream : runAskTurn)({ question, turnId: "ask:physics-context", agentRuntime: "codex",
      workspaceContextSnapshot: { activePanel: "physics-glyphs" } });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.question).toBe(question);
    expect(body.workspace_context_snapshot).toEqual({ activePanel: "physics-glyphs", physicsGlyphs: {
      schema: "helix.physics_glyph_ask_context.v1", automaticScenarios: true, peerId,
    } });
    expect(body).not.toHaveProperty("workstation_actions");
    expect(body).not.toHaveProperty("mandatory_next_tool");
  });
  it.each([false, true].flatMap(stream => ["isolated", "changed_profile", "disabled"].map(condition => ({ stream, condition }))))("omits automatic presentation after $condition (stream=$stream)", async ({ stream, condition }) => {
    setPhysicsGlyphAskConnection(peerId, condition !== "disabled");
    if (condition === "changed_profile") identity.profileId = "bob";
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => stream
      ? new Response('event: turn_final\ndata: {"ok":true,"text":"fixture"}\n\n', { headers: { "Content-Type": "text/event-stream" } })
      : new Response('{"ok":true,"text":"fixture"}', { headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    await (stream ? runAskTurnStream : runAskTurn)({ question: "Explain contact", contextMode: condition === "isolated" ? "isolated" : "attached",
      workspaceContextSnapshot: { physicsGlyphs: { stale: true } } });
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).workspace_context_snapshot).toEqual({});
  });
});
