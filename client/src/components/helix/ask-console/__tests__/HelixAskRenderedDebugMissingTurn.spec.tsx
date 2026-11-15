// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildHelixAskReplyScopedDebugExportFromRenderedButton } from "../HelixAskRenderedReplyDebugExport";
import { extractHelixAskLegacyClickedTurnDebugScopeFromAncestor } from "../HelixAskLegacyTurnControls";

const renderExport = (resolvedId: string | null, replyId: string | null = "client:local-reply", attributes: Record<string, string> = {}) => {
  const button = document.createElement("button");
  button.setAttribute("data-turn-control-question", "What is in this saved reply?");
  button.setAttribute("data-turn-control-final-answer", "The visible saved answer.");
  for (const [key, value] of Object.entries(attributes)) button.setAttribute(key, value);
  const result = buildHelixAskReplyScopedDebugExportFromRenderedButton({
    reply: { id: replyId, question: "What is in this saved reply?", content: "The visible saved answer." },
    sourceElement: button,
    reason: "empty_payload",
    deps: {
      buildEnvelope: (_reply, payload) => JSON.stringify(payload),
      resolveVisibleTerminal: reply => ({ text: reply.content }),
      resolveReplyDebugTurnId: () => resolvedId,
    },
  });
  expect(result).not.toBeNull();
  return JSON.parse(result!);
};

describe("rendered reply debug export without a backend turn", () => {
  it("keeps the local reply identity when the backend turn resolver returns null", () => {
    expect(renderExport(null)).toMatchObject({
      active_turn_id: null, client_active_turn_id: "client:local-reply",
      selectedDebugFinalAnswer: "The visible saved answer.", backend_debug_response_status: "not_advertised",
      debug: null, debug_export_ref: null, backend_debug_response_ref: null,
    });
  });
  it("does not invent an identity when both reply and backend IDs are missing", () => {
    expect(renderExport(null, null)).toMatchObject({
      active_turn_id: null, client_active_turn_id: null, selectedDebugTurnId: null,
      selectedDebugFinalAnswer: "The visible saved answer.", debug: null,
    });
  });
  it("retains the empty-ID behavior", () => {
    expect(renderExport("")).toMatchObject({ active_turn_id: null, client_active_turn_id: "client:local-reply", backend_debug_response_status: "not_advertised" });
  });
  it("does not promote a resolver backend ID absent from the clicked button scope", () => {
    expect(renderExport("ask:unscoped")).toMatchObject({ active_turn_id: "client:local-reply", backend_debug_response_ref: null });
  });
  it("does not trust a button backend ID without matching reply diagnostics", () => {
    expect(renderExport("ask:untrusted", "client:local-reply", { "data-turn-control-active-turn-id": "ask:untrusted" }))
      .toMatchObject({ active_turn_id: "client:local-reply", debug: null, debug_export_ref: null });
  });
  it("returns no scope after walking detached ancestors with no reply", () => {
    const parent = document.createElement("div");
    const child = parent.appendChild(document.createElement("button"));
    expect(extractHelixAskLegacyClickedTurnDebugScopeFromAncestor(child)).toBeNull();
  });
});
