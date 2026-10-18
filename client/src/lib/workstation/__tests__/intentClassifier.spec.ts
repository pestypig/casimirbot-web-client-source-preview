import { describe, expect, it } from "vitest";
import {
  buildWorkstationIntentClassifierPrompt,
  coerceWorkstationActionFromIntentDecision,
  inferDeterministicWorkstationIntentDecision,
  parseWorkstationIntentDecision,
  reconcileWorkstationIntentDecisionWithPrompt,
  shouldProbeWorkstationIntentClassifier,
} from "@/lib/workstation/intentClassifier";

describe("intentClassifier", () => {
  it("detects prompts worth classifier probing", () => {
    expect(shouldProbeWorkstationIntentClassifier("can you read a paper about nhm2")).toBe(true);
    expect(shouldProbeWorkstationIntentClassifier("close the current tab")).toBe(true);
    expect(shouldProbeWorkstationIntentClassifier("summarize this section")).toBe(true);
    expect(shouldProbeWorkstationIntentClassifier("can you shut this panel for me")).toBe(true);
    expect(shouldProbeWorkstationIntentClassifier("get rid of the current tab")).toBe(true);
    expect(shouldProbeWorkstationIntentClassifier("open the scientific calculator")).toBe(true);
    expect(shouldProbeWorkstationIntentClassifier("what is entropy")).toBe(false);
  });

  it("builds classifier prompts with strict json contract", () => {
    const prompt = buildWorkstationIntentClassifierPrompt("read a paper on nhm2");
    expect(prompt).toContain("Return ONLY JSON");
    expect(prompt).toContain('"intent"');
    expect(prompt).toContain("User prompt:");
  });

  it("parses fenced json classifier output", () => {
    const parsed = parseWorkstationIntentDecision(
      '```json\n{"intent":"docs_read_paper","confidence":0.91,"subgoal":"find a paper about NHM2 and read it","args":{"topic":"NHM2"}}\n```',
    );
    expect(parsed).toEqual({
      intent: "docs_read_paper",
      confidence: 0.91,
      subgoal: "find a paper about NHM2 and read it",
      args: { topic: "NHM2" },
      reason: undefined,
    });
  });

  it("returns null on malformed classifier payload", () => {
    expect(parseWorkstationIntentDecision("no-json-here")).toBeNull();
  });

  it("maps open_panel decisions into workstation actions", () => {
    const action = coerceWorkstationActionFromIntentDecision({
      intent: "open_panel",
      confidence: 0.8,
      subgoal: "open docs viewer",
      args: { panel_id: "docs-viewer" },
    });
    expect(action).toEqual({
      action: "open_panel",
      panel_id: "docs-viewer",
    });
  });

  it("maps docs_read_paper decisions into read actions", () => {
    const action = coerceWorkstationActionFromIntentDecision({
      intent: "docs_read_paper",
      confidence: 0.93,
      subgoal: "find a paper about the sun and read it",
      args: { topic: "sun" },
    });
    expect(action?.action).toBe("run_panel_action");
    expect(action?.panel_id).toBe("docs-viewer");
    expect(action?.action_id).toBe("open_doc_and_read");
    expect((action as { args?: { path?: string } } | null)?.args?.path).toBeTruthy();
  });

  it("maps docs summarize/explain intents into panel actions", () => {
    const summarizeDoc = coerceWorkstationActionFromIntentDecision({
      intent: "docs_summarize_doc",
      confidence: 0.86,
      subgoal: "summarize the current document",
      args: { path: "/docs/papers.md" },
    });
    expect(summarizeDoc).toEqual({
      action: "run_panel_action",
      panel_id: "docs-viewer",
      action_id: "summarize_doc",
      args: { path: "/docs/papers.md" },
    });

    const summarizeSection = coerceWorkstationActionFromIntentDecision({
      intent: "docs_summarize_section",
      confidence: 0.91,
      subgoal: "summarize this section",
      args: { anchor: "results" },
    });
    expect(summarizeSection).toEqual({
      action: "run_panel_action",
      panel_id: "docs-viewer",
      action_id: "summarize_section",
      args: { anchor: "results" },
    });

    const explainPaper = coerceWorkstationActionFromIntentDecision({
      intent: "docs_explain_paper",
      confidence: 0.9,
      subgoal: "explain this paper",
      args: { selected_text: "Abstract content" },
    });
    expect(explainPaper).toEqual({
      action: "run_panel_action",
      panel_id: "docs-viewer",
      action_id: "explain_paper",
      args: { selected_text: "Abstract content" },
    });
  });

  it("maps calculator intents into deterministic calculator actions", () => {
    expect(
      coerceWorkstationActionFromIntentDecision({
        intent: "calculator_open",
        confidence: 0.9,
        subgoal: "open scientific calculator",
      }),
    ).toEqual({
      action: "open_panel",
      panel_id: "scientific-calculator",
    });

    expect(
      coerceWorkstationActionFromIntentDecision({
        intent: "calculator_solve",
        confidence: 0.8,
        subgoal: "solve expression",
        args: { latex: "x^2-4=0" },
      }),
    ).toEqual({
      action: "run_panel_action",
      panel_id: "scientific-calculator",
      action_id: "solve_expression",
      args: { latex: "x^2-4=0" },
    });

    expect(
      coerceWorkstationActionFromIntentDecision(
        inferDeterministicWorkstationIntentDecision("Use the scientific calculator to solve x^2-4=0 with steps.")!,
      ),
    ).toEqual({
      action: "run_panel_action",
      panel_id: "scientific-calculator",
      action_id: "solve_with_steps",
      args: { latex: "x^2-4=0" },
    });

    expect(
      coerceWorkstationActionFromIntentDecision({
        intent: "calculator_solve_steps",
        confidence: 0.8,
        subgoal: "solve expression with steps",
      }),
    ).toEqual({
      action: "run_panel_action",
      panel_id: "scientific-calculator",
      action_id: "solve_with_steps",
      args: {},
    });

    expect(
      coerceWorkstationActionFromIntentDecision({
        intent: "calculator_ingest_clipboard",
        confidence: 0.8,
        subgoal: "paste clipboard into calculator",
      }),
    ).toEqual({
      action: "run_panel_action",
      panel_id: "scientific-calculator",
      action_id: "ingest_latex",
      args: { latex: "$clipboard", source_path: "clipboard" },
    });

    expect(inferDeterministicWorkstationIntentDecision("copy the calculator debug event log")?.intent).toBe(
      "calculator_copy_debug_log",
    );
    expect(
      coerceWorkstationActionFromIntentDecision({
        intent: "calculator_copy_debug_log",
        confidence: 0.88,
        subgoal: "copy calculator debug log",
      }),
    ).toEqual({
      action: "run_panel_action",
      panel_id: "scientific-calculator",
      action_id: "copy_debug_log",
      args: {},
    });

    expect(inferDeterministicWorkstationIntentDecision("copy the calculator result")?.intent).toBe(
      "calculator_copy_result",
    );
    expect(
      coerceWorkstationActionFromIntentDecision({
        intent: "calculator_copy_result",
        confidence: 0.86,
        subgoal: "copy calculator result",
      }),
    ).toEqual({
      action: "run_panel_action",
      panel_id: "scientific-calculator",
      action_id: "copy_result",
      args: {},
    });
  });

  it("does not treat contextual calculator mentions as executable UI actions", () => {
    const prompts = [
      "Do not open the scientific calculator; just explain what E = h * f means.",
      "Before I open the calculator, tell me what variables are missing from E = h * f.",
      "Why did the previous turn call scientific-calculator.solve_expression?",
      'The screen text says "open the calculator"; describe what is visible.',
      "If I later solve 2 + 2 in the calculator, what evidence would you need?",
    ];

    for (const prompt of prompts) {
      const deterministic = inferDeterministicWorkstationIntentDecision(prompt);
      expect(deterministic, prompt).toBeNull();

      const reconciled = reconcileWorkstationIntentDecisionWithPrompt(prompt, {
        intent: "calculator_open",
        confidence: 0.91,
        subgoal: "open scientific calculator",
        reason: "test_classifier_misfire",
      });
      expect(reconciled, prompt).toMatchObject({
        intent: "none",
        reason: expect.stringContaining("calculator_mention_not_action"),
      });
      expect(coerceWorkstationActionFromIntentDecision(reconciled), prompt).toBeNull();
    }
  });

  it("guards model-classified calculator panel actions when calculator wording is quoted or historical", () => {
    const quotedRunPanel = reconcileWorkstationIntentDecisionWithPrompt(
      'The visible label reads "solve with the calculator"; what does that label mean?',
      {
        intent: "run_panel_action",
        confidence: 0.87,
        subgoal: "solve with the calculator",
        args: {
          panel_id: "scientific-calculator",
          action_id: "solve_expression",
          args: { latex: "2+2" },
        },
        reason: "test_classifier_misfire",
      },
    );
    expect(quotedRunPanel.intent).toBe("none");
    expect(coerceWorkstationActionFromIntentDecision(quotedRunPanel)).toBeNull();

    const historicalOpenPanel = reconcileWorkstationIntentDecisionWithPrompt(
      "Why was the calculator opened last turn?",
      {
        intent: "open_panel",
        confidence: 0.84,
        subgoal: "open scientific calculator",
        args: { panel_id: "scientific-calculator" },
        reason: "test_classifier_misfire",
      },
    );
    expect(historicalOpenPanel.intent).toBe("none");
    expect(coerceWorkstationActionFromIntentDecision(historicalOpenPanel)).toBeNull();
  });

  it("reconciles classifier read intent into summarize/explain intent when prompt demands it", () => {
    const summarizeDecision = reconcileWorkstationIntentDecisionWithPrompt(
      "ok summarize a doc about the sun to me",
      {
        intent: "docs_read_paper",
        confidence: 0.88,
        subgoal: "find a paper about the sun and read it",
        args: { topic: "sun" },
      },
    );
    expect(summarizeDecision.intent).toBe("docs_summarize_doc");

    const explainDecision = reconcileWorkstationIntentDecisionWithPrompt(
      "what does this doc do?",
      {
        intent: "docs_read_paper",
        confidence: 0.8,
        subgoal: "open a paper and read it",
        args: { topic: "starsim" },
      },
    );
    expect(explainDecision.intent).toBe("docs_explain_paper");
  });

  it("maps active tab navigation intents into workstation actions", () => {
    expect(
      coerceWorkstationActionFromIntentDecision({
        intent: "close_active_panel",
        confidence: 0.9,
        subgoal: "close the active tab",
      }),
    ).toEqual({ action: "close_active_panel" });
    expect(
      coerceWorkstationActionFromIntentDecision({
        intent: "focus_next_panel",
        confidence: 0.9,
        subgoal: "focus the next tab",
      }),
    ).toEqual({ action: "focus_next_panel" });
    expect(
      coerceWorkstationActionFromIntentDecision({
        intent: "focus_previous_panel",
        confidence: 0.9,
        subgoal: "focus the previous tab",
      }),
    ).toEqual({ action: "focus_previous_panel" });
    expect(
      coerceWorkstationActionFromIntentDecision({
        intent: "reopen_last_closed_panel",
        confidence: 0.9,
        subgoal: "reopen the last closed tab",
      }),
    ).toEqual({ action: "reopen_last_closed_panel" });
  });
});
