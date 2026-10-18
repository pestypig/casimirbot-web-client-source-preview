import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ingestScientificCalculatorReceiptsFromAskPayload,
  runAskTurnStream,
} from "@/lib/agi/api";
import { useScientificCalculatorStore } from "@/store/useScientificCalculatorStore";

const calculatorInitialState = useScientificCalculatorStore.getState();

afterEach(() => {
  vi.unstubAllGlobals();
  useScientificCalculatorStore.setState(calculatorInitialState, true);
});

describe("Scientific Calculator receipt API ingestion", () => {
  it("records structured calculator receipts from Ask payloads without relying on final-answer text", () => {
    const applied = ingestScientificCalculatorReceiptsFromAskPayload({
      selected_final_answer: "The answer is available in the calculator receipt.",
      turn_id: "turn:calculator-direct",
      thread_id: "thread:calculator-direct",
      account_session: { account_id: "account:pesty" },
      current_turn_artifact_ledger: [
        {
          kind: "calculator_receipt",
          artifact_id: "ask:test:calculator_receipt",
          payload: {
            schema: "helix.calculator_receipt.v1",
            expression: "8*9",
            result_text: "72",
            capability_key: "scientific-calculator.solve_expression",
          },
        },
      ],
    });

    expect(applied).toHaveLength(1);
    expect(useScientificCalculatorStore.getState().lastCalculatorReceipt).toMatchObject({
      schema: "helix.scientific_calculator_receipt.v1",
      receipt_id: "ask:test:calculator_receipt",
      status: "solved",
      expression: "8*9",
      result_text: "72",
      context_keys: [
        "ask:turn:turn:calculator-direct",
        "ask:thread:thread:calculator-direct",
        "account:account:pesty",
      ],
      provenance_refs: [
        "ask:test:calculator_receipt",
        "scientific-calculator.solve_expression",
      ],
    });
    expect(useScientificCalculatorStore.getState().calculatorReceiptIdsByContextKey).toMatchObject({
      "ask:turn:turn:calculator-direct": "ask:test:calculator_receipt",
      "ask:thread:thread:calculator-direct": "ask:test:calculator_receipt",
      "account:account:pesty": "ask:test:calculator_receipt",
    });
  });

  it("dedupes repeated stream chunks while preserving the latest calculator receipt", async () => {
    const receipt = {
      schema: "helix.scientific_calculator_receipt.v1",
      receipt_id: "scientific-calculator-receipt:stream-blocked",
      expression_template_id: "rho-template",
      status: "blocked",
      expression: "rho = E / V",
      latex: "\\rho = E / V",
      variables: [],
      assumptions: [],
      source_refs: ["theory-badge-graph:diagnostic"],
      dimensional_check_status: "missing_units",
      result_value: null,
      result_unit: null,
      result_text: null,
      provenance_refs: ["ask:stream"],
      missing_bindings: ["variable:E", "variable:V", "unit:E", "unit:V"],
      blockers: ["missing_variable_bindings"],
      claim_boundary: "Calculator receipt is diagnostic evidence only.",
      created_at: "2026-07-08T00:00:00.000Z",
      updated_at: "2026-07-08T00:00:00.000Z",
    };
    const streamText = [
      "event: turn_transcript_event",
      `data: ${JSON.stringify({ debug: { calculator_receipt: receipt } })}`,
      "",
      "event: turn_transcript_event",
      `data: ${JSON.stringify({ debug: { calculator_receipt: receipt } })}`,
      "",
      "event: turn_final",
      `data: ${JSON.stringify({ ok: true, selected_final_answer: "done", debug: {} })}`,
      "",
    ].join("\n");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(streamText, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    ));

    await runAskTurnStream({
      turn_id: "turn:calculator-stream",
      question: "Use the calculator receipt.",
    });

    const state = useScientificCalculatorStore.getState();
    expect(state.lastCalculatorReceipt).toMatchObject({
      receipt_id: "scientific-calculator-receipt:stream-blocked",
      status: "blocked",
      expression: "rho = E / V",
      missing_bindings: ["variable:E", "variable:V", "unit:E", "unit:V"],
      blockers: ["missing_variable_bindings"],
    });
    expect(state.calculatorReceipts.filter((entry) => entry.receipt_id === "scientific-calculator-receipt:stream-blocked")).toHaveLength(1);
  });
});
