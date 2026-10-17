import { describe, expect, it } from "vitest";

import {
  buildWorkstationInterpretingReceiptText,
  formatWorkstationIntentStageDetail,
  getWorkstationExecutedReplyText,
  getWorkstationExecutingStatusText,
  getWorkstationInterpretingStatusText,
  readProceduralActionLabel,
} from "@/lib/helix/ask-procedural-display";

describe("ask procedural display", () => {
  it("formats procedural action labels", () => {
    expect(readProceduralActionLabel({ panel_id: "docs-viewer", action_id: "open_doc" })).toBe(
      "docs-viewer.open_doc",
    );
    expect(readProceduralActionLabel({ action_id: "summarize" })).toBe("summarize");
    expect(readProceduralActionLabel(null)).toBe("model step");
  });

  it("formats workstation intent stage details", () => {
    expect(
      formatWorkstationIntentStageDetail({
        action: { panel_id: "scientific-calculator", action_id: "solve" },
        outcome: "command_parse",
      }),
    ).toBe("workstation_intent_stage | action_resolved | command_parse");
    expect(formatWorkstationIntentStageDetail({ outcome: "no_match_timeout" })).toBe(
      "workstation_intent_stage | no_action_match | timeout_fallback",
    );
    expect(
      formatWorkstationIntentStageDetail({
        action: { action_id: "open_panel" },
        outcome: "fallback_low_confidence_match",
      }),
    ).toBe("workstation_intent_stage | action_resolved | low_confidence_fallback");
  });

  it("formats workstation lifecycle receipt copy without taking dispatch authority", () => {
    expect(getWorkstationInterpretingStatusText(null)).toBe("Interpreting workstation request...");
    expect(getWorkstationInterpretingStatusText(" es-MX ")).toBe(
      "Interpretando solicitud del espacio de trabajo...",
    );
    expect(getWorkstationExecutingStatusText("unknown")).toBe("Executing workstation action...");
    expect(getWorkstationExecutingStatusText("de")).toBe("Arbeitsbereichsaktion wird ausgefÃ¼hrt...");
    expect(getWorkstationExecutedReplyText("auto")).toBe("Executed workstation action.");
    expect(getWorkstationExecutedReplyText("it")).toBe("Azione dell'area di lavoro eseguita.");
    expect(buildWorkstationInterpretingReceiptText("open the docs", "pt-BR")).toBe(
      "Interpretando solicitaÃ§Ã£o do espaÃ§o de trabalho: open the docs",
    );
  });
});
