import { create, type StateCreator } from "zustand";
import {
  buildEquationLiveSeriesWorkbenchSteps,
  buildPrimeSeriesWorkbenchExpression,
  buildPrimeSeriesWorkbenchSteps,
  createEquationLiveSeriesState,
  createPrimeSeriesState,
  nextEquationLiveSeriesTick,
  nextPrimeSeriesTick,
  type CalculatorLiveSeriesTick,
  type EquationLiveSeriesState,
  type PrimeSeriesWorkbenchStep,
  type PrimeSeriesState,
  type PrimeSeriesTick,
} from "@/lib/scientific-calculator/liveSeries";
import { runScientificSolve } from "@/lib/scientific-calculator/solver";
import { useScientificCalculatorStore } from "@/store/useScientificCalculatorStore";
import type { HelixCalculatorSetupContext } from "@shared/helix-calculator-setup-context";

type CalculatorLiveSourceMode = "current_equation" | "prime_trial_division";

type StartPrimeStreamInput = {
  environmentId?: string | null;
  sourceId?: string | null;
  tickRateMs?: number;
  maxTicks?: number;
  start?: number;
};

type StartEquationLiveSourceInput = {
  environmentId?: string | null;
  sourceId?: string | null;
  tickRateMs?: number;
  maxTicks?: number;
  equation?: string;
  equationContext?: string | null;
  calculatorSetup?: HelixCalculatorSetupContext | null;
  mode?: CalculatorLiveSourceMode;
  start?: number;
};

type CalculatorLiveSourceState = {
  status: "idle" | "active" | "stopped" | "error";
  mode: CalculatorLiveSourceMode;
  sourceId: string;
  environmentId: string | null;
  tickRateMs: number;
  maxTicks: number;
  state: PrimeSeriesState;
  equationState: EquationLiveSeriesState;
  sourceEquation: string;
  equationContext: string;
  calculatorSetup: HelixCalculatorSetupContext | null;
  latestTick: CalculatorLiveSeriesTick | null;
  liveWorkbenchExpression: string;
  liveSolveSteps: PrimeSeriesWorkbenchStep[];
  activeLiveStepId: string | null;
  debugLog: string[];
  startEquationLiveSource: (input?: StartEquationLiveSourceInput) => Promise<void>;
  startPrimeStream: (input?: StartPrimeStreamInput) => Promise<void>;
  stopPrimeStream: () => void;
  restartPrimeStream: () => Promise<void>;
  emitNextTick: () => Promise<void>;
  copyDebugLog: () => string;
};

let timer: ReturnType<typeof setInterval> | null = null;
let lastStartInput: StartEquationLiveSourceInput = {};

const DEFAULT_SOURCE_ID = "source:calculator-prime-stream";
const DEFAULT_EQUATION_SOURCE_ID = "source:calculator-equation-live";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => globalThis.setTimeout(resolve, ms));

const resolveEnvironmentId = async (attempts = 1): Promise<string | null> => {
  if (typeof fetch !== "function") return null;
  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    try {
      const response = await fetch("/api/agi/situation/live-answer-environment?thread_id=helix-ask:desktop&limit=1");
      if (response.ok) {
        const body = await response.json() as { environment?: { environment_id?: string; preset?: string } | null };
        const environmentId = body.environment?.environment_id ?? null;
        if (environmentId) return environmentId;
      }
    } catch {
      // Retry below; the setup action may still be creating the environment.
    }
    if (attempt < attempts - 1) await sleep(200);
  }
  return null;
};

const postTick = async (args: {
  sourceId: string;
  environmentId: string | null;
  tick: CalculatorLiveSeriesTick;
}) => {
  if (typeof fetch !== "function") return null;
  const payload = args.tick.payload as Record<string, unknown>;
  const candidate = typeof payload.candidate === "number" ? payload.candidate : null;
  const expression = typeof payload.expression === "string" ? payload.expression : null;
  const response = await fetch("/api/agi/situation/live-source/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_id: args.sourceId,
      environment_id: args.environmentId,
      kind: "calculator_series",
      source_family: "calculator_stream",
      panel_id: "scientific-calculator",
      event_type: args.tick.event_type,
      seq: args.tick.state.seq,
      tick_index: args.tick.state.seq,
      payload: args.tick.payload,
      trace: args.tick.trace,
      evidence_refs: [candidate !== null ? `calculator:prime:${candidate}` : `calculator:equation:${expression ?? "unknown"}`],
    }),
  });
  return response.ok ? response.json() : null;
};

const postSourceLifecycle = async (
  sourceId: string,
  action: "resume" | "stop" | "reset-counters" | "tick-rate",
  body?: Record<string, unknown>,
) => {
  if (typeof fetch !== "function") return null;
  try {
    const response = await fetch(`/api/agi/situation/live-source/${encodeURIComponent(sourceId)}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    return response.ok ? response.json() : null;
  } catch {
    return null;
  }
};

const createCalculatorLiveSourceState: StateCreator<CalculatorLiveSourceState> = (set, get) => ({
  status: "idle",
  mode: "current_equation",
  sourceId: DEFAULT_SOURCE_ID,
  environmentId: null,
  tickRateMs: 1000,
  maxTicks: 100,
  state: createPrimeSeriesState({ start: 2 }),
  equationState: createEquationLiveSeriesState(),
  sourceEquation: "",
  equationContext: "",
  calculatorSetup: null,
  latestTick: null,
  liveWorkbenchExpression: "",
  liveSolveSteps: [],
  activeLiveStepId: null,
  debugLog: [],
  startEquationLiveSource: async (input = {}) => {
    get().stopPrimeStream();
    lastStartInput = input;
    const environmentId = input.environmentId ?? await resolveEnvironmentId(input.environmentId ? 1 : 10);
    const tickRateMs = Math.max(250, Math.floor(input.tickRateMs ?? 1000));
    const mode = input.mode ?? "current_equation";
    const maxTicks = Math.max(1, Math.floor(input.maxTicks ?? (mode === "current_equation" ? 1 : 100)));
    const calculatorEquation = useScientificCalculatorStore.getState().currentLatex.trim();
    const sourceEquation = mode === "prime_trial_division"
      ? "n \\bmod d = r"
      : (input.equation?.trim() || calculatorEquation);
    const equationContext = mode === "prime_trial_division"
      ? "Trial division prime detection; each tick explains whether the candidate advances the prime sequence."
      : (input.equationContext?.trim() || "No equation use-context was supplied; interpret only the calculator relation and result.");
    if (!sourceEquation) {
      set((state: CalculatorLiveSourceState) => ({
        status: "error",
        mode,
        debugLog: ["Cannot start equation live source without a calculator equation.", ...state.debugLog].slice(0, 120),
      }));
      return;
    }
    const sourceId = input.sourceId ?? (mode === "prime_trial_division" ? DEFAULT_SOURCE_ID : DEFAULT_EQUATION_SOURCE_ID);
    void postSourceLifecycle(sourceId, "reset-counters");
    void postSourceLifecycle(sourceId, "tick-rate", { tick_rate_ms: tickRateMs });
    void postSourceLifecycle(sourceId, "resume");
    set({
      status: "active",
      mode,
      sourceId,
      environmentId,
      tickRateMs,
      maxTicks,
      state: createPrimeSeriesState({ start: input.start ?? 2 }),
      equationState: createEquationLiveSeriesState(),
      sourceEquation,
      equationContext,
      calculatorSetup: input.calculatorSetup ?? null,
      latestTick: null,
      liveWorkbenchExpression: sourceEquation,
      liveSolveSteps: [],
      activeLiveStepId: null,
      debugLog: [
        `${mode === "prime_trial_division" ? "Prime preset" : "Equation"} live source started at ${new Date().toISOString()}`,
        `source_equation=${sourceEquation}`,
        `equation_context=${equationContext}`,
      ],
    });
    await get().emitNextTick();
    timer = setInterval(() => {
      void get().emitNextTick();
    }, tickRateMs);
  },
  startPrimeStream: async (input = {}) => {
    await get().startEquationLiveSource({
      ...input,
      mode: "prime_trial_division",
      sourceId: input.sourceId ?? DEFAULT_SOURCE_ID,
      maxTicks: input.maxTicks ?? 100,
    });
  },
  stopPrimeStream: () => {
    if (timer) clearInterval(timer);
    timer = null;
    void postSourceLifecycle(get().sourceId, "stop");
    set((state: CalculatorLiveSourceState) => ({
      status: state.status === "active" ? "stopped" : state.status,
      debugLog: [`Live source stopped at ${new Date().toISOString()}`, ...state.debugLog].slice(0, 120),
    }));
  },
  restartPrimeStream: async () => {
    await get().startEquationLiveSource(lastStartInput);
  },
  emitNextTick: async () => {
    const current = get();
    if (current.status !== "active") return;
    const currentSeq = current.mode === "current_equation" ? current.equationState.seq : current.state.seq;
    if (currentSeq >= current.maxTicks) {
      get().stopPrimeStream();
      return;
    }
    const calculator = useScientificCalculatorStore.getState();
    if (current.mode === "current_equation") {
      const result = runScientificSolve(current.sourceEquation, true);
      const tick = nextEquationLiveSeriesTick({
        state: current.equationState,
        expression: current.sourceEquation,
        equationContext: current.equationContext,
        result,
      });
      const liveSolveSteps = buildEquationLiveSeriesWorkbenchSteps(tick);
      calculator.setLiveWorkbenchExpression(current.sourceEquation, {
        traceId: tick.trace.calculator_trace_id,
        message: `live_equation_tick_${tick.state.seq}`,
        source: "workstation_action",
        calculatorSetup: current.calculatorSetup,
      });
      calculator.setSolveResult(result, {
        actionId: "solve_with_steps",
        source: "workstation_action",
        calculatorSetup: current.calculatorSetup,
      });
      for (const step of liveSolveSteps) {
        calculator.recordDebugEvent({
          action_id: "live_solve_step",
          source: "workstation_action",
          ok: result.ok,
          input_latex: current.sourceEquation,
          result_text: step.value,
          normalized_expression: step.label,
          trace_id: tick.trace.calculator_trace_id,
          route: `scientific-calculator/live-workbench/${step.kind}`,
          engine: "scientific_solver",
          calculator_setup: current.calculatorSetup,
          message: step.id,
        });
      }
      set((state: CalculatorLiveSourceState) => ({
        equationState: tick.state,
        latestTick: tick,
        liveWorkbenchExpression: current.sourceEquation,
        liveSolveSteps,
        activeLiveStepId: liveSolveSteps.at(-1)?.id ?? null,
        debugLog: [
          `${tick.event_type} ok=${tick.payload.ok} result=${tick.payload.result_text || (tick.payload.error ?? "none")}`,
          ...state.debugLog,
        ].slice(0, 120),
      }));
      try {
        await postTick({
          sourceId: current.sourceId,
          environmentId: current.environmentId,
          tick,
        });
      } catch (error) {
        set((state: CalculatorLiveSourceState) => ({
          status: "error",
          debugLog: [`emit failed: ${error instanceof Error ? error.message : "unknown"}`, ...state.debugLog].slice(0, 120),
        }));
      }
      return;
    }

    const tick: PrimeSeriesTick = nextPrimeSeriesTick(current.state);
    const liveWorkbenchExpression = buildPrimeSeriesWorkbenchExpression(tick);
    const liveSolveSteps = buildPrimeSeriesWorkbenchSteps(tick);
    calculator.setLiveWorkbenchExpression(liveWorkbenchExpression, {
      traceId: tick.trace.calculator_trace_id,
      message: `live_tick_${tick.payload.candidate}`,
      source: "workstation_action",
    });
    for (const step of liveSolveSteps) {
      calculator.recordDebugEvent({
        action_id: "live_solve_step",
        source: "workstation_action",
        ok: true,
        input_latex: liveWorkbenchExpression,
        result_text: step.value,
        normalized_expression: step.label,
        trace_id: tick.trace.calculator_trace_id,
        route: `scientific-calculator/live-workbench/${step.kind}`,
        engine: "trial_division",
        message: step.id,
      });
    }
    set((state: CalculatorLiveSourceState) => ({
      state: tick.state,
      latestTick: tick,
      liveWorkbenchExpression,
      liveSolveSteps,
      activeLiveStepId: liveSolveSteps.at(-1)?.id ?? null,
      debugLog: [
        `${tick.event_type} candidate=${tick.payload.candidate} prime=${tick.payload.is_prime}`,
        ...state.debugLog,
      ].slice(0, 120),
    }));
    try {
      await postTick({
        sourceId: current.sourceId,
        environmentId: current.environmentId,
        tick,
      });
    } catch (error) {
      set((state: CalculatorLiveSourceState) => ({
        status: "error",
        debugLog: [`emit failed: ${error instanceof Error ? error.message : "unknown"}`, ...state.debugLog].slice(0, 120),
      }));
    }
  },
  copyDebugLog: () => get().debugLog.join("\n"),
});

export const useScientificCalculatorLiveSourceStore = create<CalculatorLiveSourceState>()(
  createCalculatorLiveSourceState,
);
