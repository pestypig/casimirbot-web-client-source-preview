import { describe, expect, it } from "vitest";
import {
  buildEquationLiveSeriesWorkbenchSteps,
  buildPrimeSeriesWorkbenchExpression,
  buildPrimeSeriesWorkbenchSteps,
  createEquationLiveSeriesState,
  createPrimeSeriesState,
  isPrimeTrialDivision,
  nextEquationLiveSeriesTick,
  nextPrimeSeriesTick,
} from "../liveSeries";
import { runScientificSolve } from "../solver";

describe("scientific calculator live prime series", () => {
  it("uses deterministic trial division", () => {
    expect(isPrimeTrialDivision(2)).toBe(true);
    expect(isPrimeTrialDivision(3)).toBe(true);
    expect(isPrimeTrialDivision(4)).toBe(false);
    expect(isPrimeTrialDivision(29)).toBe(true);
  });

  it("emits deterministic prime stream ticks", () => {
    let state = createPrimeSeriesState({ start: 2 });
    const ticks = [];
    for (let index = 0; index < 6; index += 1) {
      const tick = nextPrimeSeriesTick(state);
      ticks.push(tick);
      state = tick.state;
    }
    expect(ticks.map((tick) => tick.payload.candidate)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(ticks.filter((tick) => tick.event_type === "prime_found").map((tick) => tick.payload.latest_prime)).toEqual([2, 3, 5, 7]);
    expect(state.primeCount).toBe(4);
  });

  it("projects each tick into visible calculator workbench variables and steps", () => {
    let state = createPrimeSeriesState({ start: 10 });
    const first = nextPrimeSeriesTick(state);
    state = first.state;
    const second = nextPrimeSeriesTick(state);

    expect(first.payload).toMatchObject({ candidate: 10, is_prime: false });
    expect(second.payload).toMatchObject({ candidate: 11, is_prime: true, latest_prime: 11 });

    const expression = buildPrimeSeriesWorkbenchExpression(second);
    expect(expression).toBe("11 \\bmod 3 = 2");
    expect(expression).not.toContain("latestPrime");
    expect(expression).not.toContain("primeCount");

    const steps = buildPrimeSeriesWorkbenchSteps(second);
    expect(steps.map((step) => step.id)).toEqual([
      "set_candidate",
      "press_solve",
      "evaluate_prime",
      "update_registers",
      "emit_live_event",
    ]);
    expect(steps.some((step) => step.value.includes("Evaluate 11 \\bmod 3 = 2"))).toBe(true);
    expect(steps.some((step) => step.value.includes("11 is prime"))).toBe(true);
  });

  it("projects the current calculator equation as a live source tick", () => {
    const result = runScientificSolve("x^2 - 4 = 0", true);
    const tick = nextEquationLiveSeriesTick({
      state: createEquationLiveSeriesState(),
      expression: "x^2 - 4 = 0",
      equationContext: "Finding roots for a simple quadratic.",
      result,
    });

    expect(tick.event_type).toBe("equation_evaluated");
    expect(tick.payload.expression).toBe("x^2 - 4 = 0");
    expect(tick.payload.equation_context).toBe("Finding roots for a simple quadratic.");
    expect(tick.payload.result_text).toContain("2");
    expect(tick.trace.calculator_trace_id).toBe("scicalc-equation:1:1w61eu2");

    const steps = buildEquationLiveSeriesWorkbenchSteps(tick);
    expect(steps.map((step) => step.id)).toEqual([
      "set_equation",
      "press_solve",
      "evaluate_equation",
      "emit_live_event",
    ]);
    expect(steps[0]?.value).toBe("x^2 - 4 = 0");
  });

  it("preserves tiny scientific-notation arithmetic instead of rounding to zero", () => {
    const result = runScientificSolve("6.62607015e-34*5e14", false);

    expect(result.ok).toBe(true);
    expect(result.result_text).toBe("3.313035e-19");
    expect(result.result_text).not.toBe("0.000000000000000000");
  });

  it("evaluates scientific-notation ratios without treating e as a symbol", () => {
    const result = runScientificSolve("(656.35e-9-656.28e-9)/656.28e-9", false);

    expect(result.ok).toBe(true);
    expect(Number(result.result_text)).toBeCloseTo(0.00010666178, 10);
    expect(result.result_text).not.toBe("65628");
  });
});
