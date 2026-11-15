import { describe, expect, it } from "vitest";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const sites: Array<{ name: string; code: string }> = [];
for (const [name, url] of [
  ["legacy", new URL("../HelixAskPill.tsx", import.meta.url)],
  ["minimal", new URL("../ask-console/HelixAskMinimalRuntimeShell.tsx", import.meta.url)],
] as const) {
  const source = fs.readFileSync(url, "utf8");
  const parsed = ts.createSourceFile(name + ".tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node: ts.Node): void => {
    if (ts.isIfStatement(node) && node.expression.getText(parsed).includes('delivery_state !== "pending"')) {
      if (!ts.isBlock(node.parent)) throw new Error("Unexpected steering guard scope");
      const index = node.parent.statements.indexOf(node);
      const previous = node.parent.statements[index - 1];
      if (!previous || !ts.isIfStatement(previous) || !previous.expression.getText(parsed).includes('delivery_state === "acknowledged"')) {
        throw new Error("Missing acknowledged-before-terminal guard");
      }
      const code = ts.transpileModule(`(() => { ${previous.getText(parsed)} ${node.getText(parsed)} })();`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
      }).outputText;
      sites.push({ name: name + (node.expression.getText(parsed).includes("event?") ? " dispatch" : " poll"), code });
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
}
if (sites.length !== 3) throw new Error("Expected both polling sites and minimal dispatch receipt guard");

describe.each(sites)("actual $name steering delivery branches", ({ code }) => {
  it.each(["pending", "picked_up", "acknowledged", "expired", "revoked", "superseded"])(
    "projects %s without confusing pickup and acknowledgement", delivery_state => {
      const bound: string[] = [], progress: string[] = [], messages: string[] = [];
      vm.runInNewContext(code, {
        event: { delivery_state }, current: { delivery_state }, clientEventRef: "test-event", progressTarget: {},
        setBoundAgentState: (state: string) => bound.push(state),
        setAskStatus: (status: string) => messages.push(status),
        setRuntimeState: (update: (state: object) => { askStatus: string }) => messages.push(update({}).askStatus),
        publishBoundAgentSteeringProgress: (_event: string, state: string) => progress.push(state),
      });
      if (delivery_state === "pending" || delivery_state === "picked_up") {
        expect(bound).toEqual([]); expect(progress).toEqual([]); expect(messages).toEqual([]);
      } else if (delivery_state === "acknowledged") {
        expect(bound).toEqual(["active"]); expect(progress).toEqual(["acknowledged"]);
        expect(messages[0]).toContain("not task completion");
      } else {
        expect(bound).toEqual(["unavailable"]); expect(progress).toEqual([delivery_state]);
        expect(messages[0]).toContain("no provider answer is claimed");
      }
    },
  );
});
