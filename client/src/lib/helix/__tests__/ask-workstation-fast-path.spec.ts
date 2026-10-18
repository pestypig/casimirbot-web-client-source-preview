import { describe, expect, it } from "vitest";
import type { HelixWorkstationAction } from "@/lib/workstation/workstationActionContract";
import {
  extractCalculatorFastPathExpressionFromPrompt,
  readWorkstationActionArgText,
  selectWorkstationFastPathReplyAction,
} from "../ask-workstation-fast-path";

describe("ask workstation fast-path helpers", () => {
  it("reads trimmed run-panel action arguments by priority", () => {
    const action: HelixWorkstationAction = {
      action: "run_panel_action",
      panel_id: "scientific-calculator",
      action_id: "solve_expression",
      args: {
        latex: "   ",
        expression: "  8*9  ",
        text: "ignored",
      },
    };
    expect(readWorkstationActionArgText(action, ["latex", "expression", "text"])).toBe("8*9");
    expect(readWorkstationActionArgText({ action: "open_panel", panel_id: "scientific-calculator" }, ["text"]))
      .toBeNull();
  });

  it("extracts calculator expressions from direct solve prompts", () => {
    expect(extractCalculatorFastPathExpressionFromPrompt("solve 8*9 and tell me the result")).toBe("8*9");
    expect(extractCalculatorFastPathExpressionFromPrompt("Evaluate the expression x^2 + 2*x + 1 with steps")).toBe(
      "x^2 + 2*x + 1",
    );
    expect(extractCalculatorFastPathExpressionFromPrompt("calculate sin(x) in the scientific calculator")).toBe(
      "sin(x)",
    );
    expect(extractCalculatorFastPathExpressionFromPrompt("please open the calculator")).toBeNull();
    expect(extractCalculatorFastPathExpressionFromPrompt("solve the concept")).toBeNull();
  });

  it("selects calculator solve actions before generic workstation actions", () => {
    const openPanel: HelixWorkstationAction = { action: "open_panel", panel_id: "docs-viewer" };
    const calculatorSolve: HelixWorkstationAction = {
      action: "run_panel_action",
      panel_id: "scientific-calculator",
      action_id: "solve_expression",
      args: { expression: "2+2" },
    };
    const calculatorWithoutArg: HelixWorkstationAction = {
      action: "run_panel_action",
      panel_id: "scientific-calculator",
      action_id: "solve_expression",
      args: {},
    };

    expect(selectWorkstationFastPathReplyAction([openPanel, calculatorSolve])).toBe(calculatorSolve);
    expect(selectWorkstationFastPathReplyAction([calculatorWithoutArg, openPanel])).toBe(calculatorWithoutArg);
    expect(selectWorkstationFastPathReplyAction([])).toBeNull();
  });
});
