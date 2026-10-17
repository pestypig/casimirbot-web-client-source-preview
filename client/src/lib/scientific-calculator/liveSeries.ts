import type { ScientificSolveResult } from "./solver";

export type PrimeSeriesState = {
  nextCandidate: number;
  latestPrime: number | null;
  primeCount: number;
  lastPrime: number | null;
  seq: number;
};

export type EquationLiveSeriesState = {
  seq: number;
};

export type PrimeSeriesTick = {
  previousState: PrimeSeriesState;
  state: PrimeSeriesState;
  event_type: "prime_candidate_checked" | "prime_found";
  payload: {
    candidate: number;
    is_prime: boolean;
    latest_prime?: number;
    prime_count: number;
    gap?: number;
    divisor_checked?: number | null;
    remainder?: number | null;
    divisor_range?: string | null;
  };
  trace: {
    calculator_trace_id: string;
    algorithm: "trial_division";
    deterministic: true;
  };
};

export type EquationLiveSeriesTick = {
  state: EquationLiveSeriesState;
  event_type: "equation_evaluated";
  payload: {
    expression: string;
    equation_context?: string | null;
    ok: boolean;
    mode: ScientificSolveResult["mode"];
    normalized_expression: string;
    result_text: string;
    variable?: string | null;
    error?: string | null;
  };
  trace: {
    calculator_trace_id: string;
    algorithm: "scientific_solver";
    deterministic: true;
  };
};

export type CalculatorLiveSeriesTick = PrimeSeriesTick | EquationLiveSeriesTick;

export type PrimeSeriesWorkbenchStep = {
  id: string;
  label: string;
  value: string;
  kind: "variable" | "button" | "solve" | "emit";
};

export function isPrimeTrialDivision(value: number): boolean {
  if (!Number.isInteger(value) || value < 2) return false;
  if (value === 2) return true;
  if (value % 2 === 0) return false;
  const max = Math.floor(Math.sqrt(value));
  for (let divisor = 3; divisor <= max; divisor += 2) {
    if (value % divisor === 0) return false;
  }
  return true;
}

function trialDivisionWitness(value: number): {
  divisorChecked: number | null;
  remainder: number | null;
  divisorRange: string | null;
} {
  if (!Number.isInteger(value) || value < 2) {
    return { divisorChecked: null, remainder: null, divisorRange: null };
  }
  if (value === 2) {
    return { divisorChecked: 2, remainder: 0, divisorRange: "{2}" };
  }
  if (value % 2 === 0) {
    return { divisorChecked: 2, remainder: 0, divisorRange: "{2}" };
  }
  const max = Math.floor(Math.sqrt(value));
  let lastDivisor = 3;
  for (let divisor = 3; divisor <= max; divisor += 2) {
    lastDivisor = divisor;
    const remainder = value % divisor;
    if (remainder === 0) {
      return {
        divisorChecked: divisor,
        remainder,
        divisorRange: `{3,5,...,${max}}`,
      };
    }
  }
  return {
    divisorChecked: max >= 3 ? lastDivisor : 2,
    remainder: max >= 3 ? value % lastDivisor : value % 2,
    divisorRange: max >= 3 ? `{3,5,...,${max}}` : "{2}",
  };
}

export function createPrimeSeriesState(input?: { start?: number }): PrimeSeriesState {
  const start = typeof input?.start === "number" && Number.isFinite(input.start)
    ? Math.max(2, Math.floor(input.start))
    : 2;
  return {
    nextCandidate: start,
    latestPrime: null,
    primeCount: 0,
    lastPrime: null,
    seq: 0,
  };
}

export function createEquationLiveSeriesState(): EquationLiveSeriesState {
  return { seq: 0 };
}

function stableToken(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

export function nextPrimeSeriesTick(state: PrimeSeriesState): PrimeSeriesTick {
  const candidate = state.nextCandidate;
  const isPrime = isPrimeTrialDivision(candidate);
  const witness = trialDivisionWitness(candidate);
  const latestPrime = isPrime ? candidate : state.latestPrime;
  const gap = isPrime && state.lastPrime !== null ? candidate - state.lastPrime : undefined;
  const nextState: PrimeSeriesState = {
    nextCandidate: candidate + 1,
    latestPrime,
    lastPrime: isPrime ? candidate : state.lastPrime,
    primeCount: state.primeCount + (isPrime ? 1 : 0),
    seq: state.seq + 1,
  };
  return {
    previousState: state,
    state: nextState,
    event_type: isPrime ? "prime_found" : "prime_candidate_checked",
    payload: {
      candidate,
      is_prime: isPrime,
      latest_prime: latestPrime ?? undefined,
      prime_count: nextState.primeCount,
      gap,
      divisor_checked: witness.divisorChecked,
      remainder: witness.remainder,
      divisor_range: witness.divisorRange,
    },
    trace: {
      calculator_trace_id: `scicalc-prime:${nextState.seq}:${candidate}`,
      algorithm: "trial_division",
      deterministic: true,
    },
  };
}

export function buildPrimeSeriesWorkbenchExpression(tick: PrimeSeriesTick): string {
  const divisor = tick.payload.divisor_checked ?? 2;
  const remainder = tick.payload.remainder ?? tick.payload.candidate % divisor;
  return `${tick.payload.candidate} \\bmod ${divisor} = ${remainder}`;
}

export function buildPrimeSeriesWorkbenchSteps(tick: PrimeSeriesTick): PrimeSeriesWorkbenchStep[] {
  const previousPrime = tick.previousState.lastPrime;
  const latestPrime = tick.payload.latest_prime ?? tick.previousState.latestPrime;
  const gap = tick.payload.gap ?? "unchanged";
  return [
    {
      id: "set_candidate",
      label: "Set candidate",
      value: `n = ${tick.payload.candidate}`,
      kind: "variable",
    },
    {
      id: "press_solve",
      label: "Press solve",
      value: `Evaluate ${buildPrimeSeriesWorkbenchExpression(tick)}.`,
      kind: "button",
    },
    {
      id: "evaluate_prime",
      label: "Evaluate primality",
      value: `${tick.payload.candidate} is ${tick.payload.is_prime ? "" : "not "}prime using trial division over ${tick.payload.divisor_range ?? "the configured divisor range"}.`,
      kind: "solve",
    },
    {
      id: "update_registers",
      label: "Update registers",
      value: `previous=${previousPrime ?? "none"}, latest=${latestPrime ?? "none"}, gap=${gap}`,
      kind: "variable",
    },
    {
      id: "emit_live_event",
      label: "Emit live source event",
      value: `${tick.event_type} -> ${tick.trace.calculator_trace_id}`,
      kind: "emit",
    },
  ];
}

export function nextEquationLiveSeriesTick(input: {
  state: EquationLiveSeriesState;
  expression: string;
  equationContext?: string | null;
  result: ScientificSolveResult;
}): EquationLiveSeriesTick {
  const nextSeq = input.state.seq + 1;
  return {
    state: { seq: nextSeq },
    event_type: "equation_evaluated",
    payload: {
      expression: input.expression,
      equation_context: input.equationContext?.trim() || null,
      ok: input.result.ok,
      mode: input.result.mode,
      normalized_expression: input.result.normalized_expression,
      result_text: input.result.result_text,
      variable: input.result.variable,
      error: input.result.error ?? null,
    },
    trace: {
      calculator_trace_id: `scicalc-equation:${nextSeq}:${stableToken(input.expression)}`,
      algorithm: "scientific_solver",
      deterministic: true,
    },
  };
}

export function buildEquationLiveSeriesWorkbenchSteps(tick: EquationLiveSeriesTick): PrimeSeriesWorkbenchStep[] {
  return [
    {
      id: "set_equation",
      label: "Set equation",
      value: tick.payload.expression,
      kind: "variable",
    },
    {
      id: "press_solve",
      label: "Press solve",
      value: "Evaluate the calculator equation as the live source tick.",
      kind: "button",
    },
    {
      id: "evaluate_equation",
      label: "Evaluate equation",
      value: tick.payload.ok
        ? tick.payload.result_text || tick.payload.normalized_expression
        : tick.payload.error ?? "Unable to solve this equation in the calculator panel.",
      kind: "solve",
    },
    {
      id: "emit_live_event",
      label: "Emit live source event",
      value: `${tick.event_type} -> ${tick.trace.calculator_trace_id}`,
      kind: "emit",
    },
  ];
}
