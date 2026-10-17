import { describe, expect, it } from "vitest";
import { buildObserverCommentaryForRow } from "@/lib/helix/ask-observer-commentary-display";

describe("Helix Ask observer commentary display", () => {
  it("returns null for non-workstation rows and empty workstation text", () => {
    expect(
      buildObserverCommentaryForRow({
        tool: "helix.ask.route",
        text: "opening selected document",
        detail: "route",
      }),
    ).toBeNull();
    expect(
      buildObserverCommentaryForRow({
        tool: "workstation.action",
        text: "   ",
        detail: "workstation_intent_stage",
      }),
    ).toBeNull();
  });

  it("builds user-perspective restatements for recognized workstation actions", () => {
    const commentary = buildObserverCommentaryForRow(
      {
        tool: "workstation.action",
        text: "summarizing current document",
        detail: "workstation_intent_stage",
      },
      {
        userPrompt: "okay open up a doc about the sun and summarize what it means",
      },
    );

    expect(commentary).toContain("From your request");
    expect(commentary).toContain("summarized in plain language");
    expect(commentary).toContain("Summarize-doc action dispatched");
  });

  it("keeps commentary deterministic when no user prompt is available", () => {
    expect(
      buildObserverCommentaryForRow({
        tool: "workstation.action",
        text: "closed active panel docs-viewer",
        detail: "workstation_intent_stage",
      }),
    ).toBe("Observer: Close-panel action completed and active workspace panel was removed.");
  });

  it("covers observer plan, action receipt, and fallback text branches", () => {
    expect(
      buildObserverCommentaryForRow({
        tool: "helix.observer.plan",
        text: "observer plan step complete: needs retrieval",
        detail: "observer_plan_step",
      }),
    ).toBe("Observer: Observer marked a planned execution step as complete.");
    expect(
      buildObserverCommentaryForRow({
        tool: "workstation.action",
        text: "ok: selected document opened",
        detail: "workstation_receipt",
      }),
    ).toBe("Observer: Action receipt confirmed - selected document opened");
    expect(
      buildObserverCommentaryForRow({
        tool: "workstation.action",
        text: "custom workstation step",
        detail: "job_receipt",
      }),
    ).toBe("Observer: Interpreted workstation event - custom workstation step");
  });
});
