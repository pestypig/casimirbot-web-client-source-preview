// @vitest-environment node
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../LiveAnswerEnvironmentPanel.tsx", import.meta.url), "utf8");
const tree = ts.createSourceFile("panel.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const initializers = new Map<string, string>();
const assignments = new Map<string, string>();
const visit = (node: ts.Node) => {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer &&
      ["readRecord", "goalContextBody"].includes(node.name.text)) {
    if (initializers.has(node.name.text)) throw new Error("Ambiguous panel initializer");
    initializers.set(node.name.text, node.initializer.getText(tree));
  }
  if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      ["setGoalContextUpdates", "setAgentGoalSessions"].includes(node.expression.expression.text)) {
    if (assignments.has(node.expression.expression.text)) throw new Error("Ambiguous panel assignment");
    assignments.set(node.expression.expression.text, node.getText(tree));
  }
  ts.forEachChild(node, visit);
};
visit(tree);
if (initializers.size !== 2 || assignments.size !== 2) throw new Error("Panel response statements missing");
const javascript = ts.transpileModule(`(async (fetch, threadId, setGoalContextUpdates, setAgentGoalSessions) => {
  const readRecord = ${initializers.get("readRecord")};
  const goalContextBody = ${initializers.get("goalContextBody")};
  ${assignments.get("setGoalContextUpdates")}
  ${assignments.get("setAgentGoalSessions")}
})`, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText;
const applyResponse = runInNewContext(javascript) as (
  fetch: unknown, threadId: string, updates: unknown, sessions: unknown,
) => Promise<void>;

describe("Live Answer goal-context response boundary", () => {
  it.each([null, [], "unexpected", 17, false, {}, { goalContextUpdates: null, agentGoalSessions: "invalid" }])(
    "clears context lists for a non-record or missing-list response %#", async body => {
      const updates = vi.fn(), sessions = vi.fn();
      await applyResponse(vi.fn(async () => ({ ok: true, json: async () => body })), "chat:one", updates, sessions);
      expect(updates).toHaveBeenCalledExactlyOnceWith([]);
      expect(sessions).toHaveBeenCalledExactlyOnceWith([]);
    },
  );
  it("preserves arrays from the current chat query without dispatching them", async () => {
    const body = { goalContextUpdates: [{ updateId: "update:one" }], agentGoalSessions: [{ goalId: "goal:one" }] };
    const fetch = vi.fn(async () => ({ ok: true, json: async () => body }));
    const updates = vi.fn(), sessions = vi.fn();
    await applyResponse(fetch, "chat:one/room", updates, sessions);
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/helix/stage-play/goal-context?threadId=chat%3Aone%2Froom&limit=24");
    expect(updates).toHaveBeenCalledExactlyOnceWith(body.goalContextUpdates);
    expect(sessions).toHaveBeenCalledExactlyOnceWith(body.agentGoalSessions);
  });
  it.each(["http", "json", "network"])("clears lists after %s failure", async failure => {
    const json = vi.fn(async () => { throw new Error("invalid JSON"); });
    const fetch = vi.fn(async () => {
      if (failure === "network") throw new Error("offline");
      return { ok: failure !== "http", json };
    });
    const updates = vi.fn(), sessions = vi.fn();
    await applyResponse(fetch, "chat:one", updates, sessions);
    expect(updates).toHaveBeenCalledExactlyOnceWith([]);
    expect(sessions).toHaveBeenCalledExactlyOnceWith([]);
    expect(json).toHaveBeenCalledTimes(failure === "json" ? 1 : 0);
  });
});
