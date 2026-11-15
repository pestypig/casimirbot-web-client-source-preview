// @vitest-environment node
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { coerceText } from "@/lib/helix/ask-value-normalization";
import { readAgentLoopAuditRecord } from "@/lib/helix/ask-runtime-authority-readers";

// Evaluate the actual final-answer classification expression, without mounting
// the console or opening a provider, microphone, room or game connection.
const source = fs.readFileSync(new URL("../HelixAskPill.tsx", import.meta.url), "utf8");
const parsed = ts.createSourceFile("HelixAskPill.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const expressions: string[] = [];
const visit = (node: ts.Node): void => {
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === "responseIsModelSynthesizedFinalDraft") {
    if (!node.initializer) throw new Error("final-answer classifier missing");
    expressions.push(node.initializer.getText(parsed));
  }
  ts.forEachChild(node, visit);
};
visit(parsed);
if (expressions.length !== 1) throw new Error("expected one final-answer classifier");
const code = ts.transpileModule(`(${expressions[0]})`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const classify = (overrides: Record<string, unknown> = {}): boolean => vm.runInNewContext(code, {
  hardPromptProjectionBlocked: false,
  terminalResolutionForFinal: { terminalArtifactKind: "model_synthesized_answer" },
  localResponseRecord: {},
  responseDebugPayload: undefined,
  responseCanonicalSelectedFinalAnswer: "A bounded answer",
  coerceText,
  readAgentLoopAuditRecord,
  ...overrides,
}) as boolean;
const draft = { terminal_artifact_kind: "model_synthesized_answer", final_answer_source: "final_answer_draft" };

describe("final-answer optional debug boundary", () => {
  it("does not throw or classify an unproven draft when diagnostics are absent", () => {
    expect(classify()).toBe(false);
  });
  it("does not infer a final draft from an artifact kind alone", () => {
    expect(classify({ localResponseRecord: { terminal_artifact_kind: "model_synthesized_answer" } })).toBe(false);
  });
  it("accepts complete response fields without requiring optional diagnostics", () => {
    expect(classify({ localResponseRecord: draft })).toBe(true);
  });
  it("accepts existing diagnostic evidence when the canonical terminal agrees", () => {
    expect(classify({ responseDebugPayload: draft })).toBe(true);
  });
  it("accepts a record-shaped resolved summary with the declared draft source", () => {
    expect(classify({ responseDebugPayload: {
      resolved_turn_summary: { terminal_artifact_kind: "model_synthesized_answer" },
      final_answer_source: "final_answer_draft",
    } })).toBe(true);
  });
  it.each([null, [], "model_synthesized_answer"])("rejects malformed resolved summary %j", (summary) => {
    expect(classify({ responseDebugPayload: { resolved_turn_summary: summary, final_answer_source: "final_answer_draft" } })).toBe(false);
  });
  it("preserves the prompt projection block even with complete diagnostics", () => {
    expect(classify({ hardPromptProjectionBlocked: true, responseDebugPayload: draft })).toBe(false);
  });
  it("does not promote a different canonical terminal from diagnostics", () => {
    expect(classify({ terminalResolutionForFinal: { terminalArtifactKind: "situation_context_pack" }, responseDebugPayload: draft })).toBe(false);
  });
  it("requires a selected final answer", () => {
    expect(classify({ localResponseRecord: draft, responseCanonicalSelectedFinalAnswer: "" })).toBe(false);
  });
});
