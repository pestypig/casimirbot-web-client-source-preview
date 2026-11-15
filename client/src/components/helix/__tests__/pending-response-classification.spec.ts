// @vitest-environment node
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { isHelixCanceledPendingTurn, resolveHelixPendingInputRecord } from "@/lib/helix/ask-pending-input-readers";
import { coerceText } from "@/lib/helix/ask-value-normalization";

const source = fs.readFileSync(new URL("../HelixAskPill.tsx", import.meta.url), "utf8");
const parsed = ts.createSourceFile("HelixAskPill.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ["responseRouteReasonCode", "hasPendingServerRequest", "isClarifyTerminal"];
const declarations = new Map<string, string>();
const visit = (node: ts.Node): void => {
  if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(parsed))) {
    const name = node.name.getText(parsed);
    if (declarations.has(name) || !node.initializer) throw new Error(`Ambiguous classifier declaration: ${name}`);
    declarations.set(name, node.getText(parsed));
  }
  ts.forEachChild(node, visit);
};
visit(parsed);
if (declarations.size !== names.length) throw new Error("Missing actual response classifier");
const code = ts.transpileModule(`${names.map(n => `const ${declarations.get(n)};`).join("\n")}\nisClarifyTerminal;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const pending = { kind: "request_user_input", request_id: "pending:fixture", prompt: "Choose the test world", assistant_answer: false };
const classify = (local: Record<string, unknown> = {}, envelope: Record<string, unknown> = {}, debug?: Record<string, unknown>): boolean =>
  vm.runInNewContext(code, { localResponseRecord: local, responseEnvelope: envelope, responseEnvelopeRecord: envelope,
    responseDebugPayload: debug, isHelixCanceledPendingTurn, resolveHelixPendingInputRecord, coerceText }) as boolean;

describe("pending response classification in the actual chat", () => {
  it("recognizes the server top-level pending request", () => expect(classify({ pending_server_request: pending })).toBe(true));
  it("recognizes a pending request in response diagnostics", () => expect(classify({}, {}, { agent_loop_audit: { pending_request: pending } })).toBe(true));
  it("retains the supported envelope pending shape", () => expect(classify({}, { pending_server_request: pending })).toBe(true));
  it("does not resurrect a resolved envelope request", () => expect(classify({}, { pending_server_request: { ...pending, status: "resolved" } })).toBe(false));
  it("lets cancellation override a stale clarification route and request", () => expect(classify(
    { pending_status_after: "cancelled" }, { route_reason_code: "clarify:world", pending_server_request: pending },
  )).toBe(false));
  it("does not label an ordinary final response as awaiting input", () => expect(classify({ text: "A final answer" })).toBe(false));
  it("recognizes the top-level clarification route", () => expect(classify({ route_reason_code: "clarify:world" })).toBe(true));
  it("retains the legacy envelope clarification route", () => expect(classify({}, { route_reason_code: "clarify:world" })).toBe(true));
  it("prefers the top-level route over an older envelope route", () => expect(classify(
    { route_reason_code: "conversation:simple" }, { route_reason_code: "clarify:old" },
  )).toBe(false));
  it("ignores an empty pending object", () => expect(classify({}, { pending_server_request: {} })).toBe(false));
  it("ignores an array in place of a pending record", () => expect(classify({}, { pending_server_request: [pending] })).toBe(false));
  it("does not treat a response question alone as a pending request", () => expect(classify({ question: "Original user question" })).toBe(false));
});
