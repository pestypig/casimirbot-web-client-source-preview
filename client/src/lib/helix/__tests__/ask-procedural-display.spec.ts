import { describe, expect, it } from "vitest";
import {
  buildObservationGroundedReplyText,
  isWorkstationLifecycleEvent,
  readProceduralActionLabel,
} from "@/lib/helix/ask-procedural-display";

describe("Helix Ask procedural display", () => {
  it("formats panel action labels for timeline and debug-copy text", () => {
    expect(readProceduralActionLabel({ panel_id: "docs-viewer", action_id: "summarize_doc" })).toBe(
      "docs-viewer.summarize_doc",
    );
    expect(readProceduralActionLabel({ panel_id: "   docs-viewer   ", action_id: "   search_docs   " })).toBe(
      "docs-viewer.search_docs",
    );
  });

  it("falls back to action id or model step without taking behavior authority", () => {
    expect(readProceduralActionLabel({ action_id: "solve_expression" })).toBe("solve_expression");
    expect(readProceduralActionLabel({ panel_id: "scientific-calculator" })).toBe("model step");
    expect(readProceduralActionLabel(null)).toBe("model step");
    expect(readProceduralActionLabel(["not", "a", "record"])).toBe("model step");
  });

  it("classifies workstation lifecycle events from structured tool and metadata fields", () => {
    expect(isWorkstationLifecycleEvent({ id: "e1", text: "", tool: "workstation.docs-viewer" })).toBe(true);
    expect(isWorkstationLifecycleEvent({ id: "e2", text: "", tool: "helix.ask.fast_path" })).toBe(true);
    expect(isWorkstationLifecycleEvent({ id: "e3", text: "", tool: "helix.observer.plan" })).toBe(true);
    expect(isWorkstationLifecycleEvent({ id: "e4", text: "", tool: "helix.ask.event", meta: { kind: "job_ready" } })).toBe(
      true,
    );
    expect(
      isWorkstationLifecycleEvent({
        id: "e5",
        text: "",
        tool: "helix.ask.event",
        meta: { kind: "observer_plan_delta" },
      }),
    ).toBe(true);
    expect(isWorkstationLifecycleEvent({ id: "e6", text: "", tool: "helix.ask.event", meta: { kind: "debug" } })).toBe(
      false,
    );
    expect(isWorkstationLifecycleEvent({ id: "e7", text: "" })).toBe(false);
  });

  it("builds observation-grounded reply text without inferring from final prose", () => {
    expect(
      buildObservationGroundedReplyText({
        id: "success",
        text: "ok: run panel action scientific-calculator.solve_expression - Result: 72",
      }),
    ).toEqual({ text: "Result: 72", ok: true });
    expect(
      buildObservationGroundedReplyText({
        id: "failure",
        text: "fail: run panel action docs-viewer.open - missing doc path",
      }),
    ).toEqual({ text: "Could not complete that workspace action: missing doc path", ok: false });
    expect(
      buildObservationGroundedReplyText({
        id: "failure-default",
        text: "fail: run panel action docs-viewer.open",
      }),
    ).toEqual({ text: "Could not complete that workspace action: The workspace action failed.", ok: false });
    expect(
      buildObservationGroundedReplyText({
        id: "prose-only",
        text: "Observed expression: 8*9\nResult: 72",
      }),
    ).toBeNull();
  });
});
