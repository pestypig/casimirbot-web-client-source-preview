import { describe, expect, it } from "vitest";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { inferAskMode } from "@/lib/helix/ask-exploration-policy";
import { isSimpleDirectPromptLaneCandidate } from "@/lib/helix/ask-voice-reasoning-dispatch-prompt";

const source = fs.readFileSync(new URL("../HelixAskPill.tsx", import.meta.url), "utf8");
const parsed = ts.createSourceFile("HelixAskPill.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ["simpleDirectPromptLane", "detailMode"];
const expressions = new Map<string, string>();
const visit = (node: ts.Node): void => {
  if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(parsed))) {
    const name = node.name.getText(parsed);
    if (expressions.has(name) || !node.initializer) throw new Error(`Ambiguous manual mode expression: ${name}`);
    expressions.set(name, node.initializer.getText(parsed));
  }
  ts.forEachChild(node, visit);
};
visit(parsed);
if (expressions.size !== names.length) throw new Error("Missing actual manual mode expressions");
const evaluate = (name: string, context: Record<string, unknown>): unknown => {
  const expression = expressions.get(name);
  if (!expression) throw new Error("Missing expression");
  const code = ts.transpileModule(`(${expression});`, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText;
  return vm.runInNewContext(code, context);
};
const direct = (question: string, blockers: Record<string, boolean> = {}): unknown => evaluate("simpleDirectPromptLane", {
  trimmed: question, inferredMode: inferAskMode(question), isSimpleDirectPromptLaneCandidate,
  hardBackendEntrypointRequired: false, backendOwnedPastedTextResumeRecall: false,
  repoCodeEvidencePrompt: false, docsViewerWorkstationLane: false, simpleConversationTurnLane: false,
  forceReasoningDispatchForTurn: false, ...blockers,
});
const detail = (responseMode?: string, inferredMode?: string): unknown => evaluate("detailMode", { responseMode, inferredMode });

describe("actual manual Ask mode defaults", () => {
  it.each(["What is the title of this paper?", "Tell me what this current document is about."])(
    "admits an otherwise eligible simple document question: %s", question => {
      expect(inferAskMode(question)).toBeUndefined();
      expect(direct(question)).toBe(true);
    },
  );
  it.each(["hardBackendEntrypointRequired", "backendOwnedPastedTextResumeRecall", "repoCodeEvidencePrompt", "forceReasoningDispatchForTurn"])(
    "preserves the %s guard", blocker => {
      expect(direct("What is the title of this paper?", { [blocker]: true })).toBe(false);
    },
  );
  it.each(["Inspect the title of this paper", "Open the title of this paper", "Check the title of this paper"])(
    "does not downgrade an explicit operation: %s", question => {
      expect(inferAskMode(question)).toBeDefined();
      expect(isSimpleDirectPromptLaneCandidate(question)).toBe(true);
      expect(direct(question)).toBe(false);
    },
  );
  it("does not turn an arbitrary unclassified prompt into a direct document question", () => {
    expect(direct("hello")).toBe(false);
  });
  it("uses the existing observation display default when both modes are absent", () => {
    expect(detail()).toBe("observe");
  });
  it.each([["read", "observe"], ["observe", "observe"], ["act", "act"], ["verify", "verify"]])(
    "retains response mode %s as display mode %s", (response, expected) => {
      expect(detail(response, "verify")).toBe(expected);
    },
  );
  it.each(["observe", "act", "verify"])("retains inferred %s when the response supplies no mode", mode => {
    expect(detail(undefined, mode)).toBe(mode);
  });
});
