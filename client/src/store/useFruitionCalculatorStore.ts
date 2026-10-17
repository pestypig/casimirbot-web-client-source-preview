import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FruitionProcedureExpressionV1 } from "@shared/fruition-procedure-expression";
import type { MoralBadgeLocatorV1 } from "@shared/moral-badge-locator";
import { buildFruitionFromMoralBadgeComparisonSeed } from "@shared/moral-graph/build-fruition-from-moral-badge-comparison-seed";

const FRUITION_CALCULATOR_STORAGE_KEY = "fruition-calculator:v1";

export type FruitionCalculatorHistoryEntry = {
  id: string;
  expression: FruitionProcedureExpressionV1;
  source: "moral_badge_graph" | "launch_demo" | "agent_tool" | "unknown";
  ts: string;
};

type FruitionCalculatorState = {
  currentExpression: FruitionProcedureExpressionV1 | null;
  history: FruitionCalculatorHistoryEntry[];
  loadExpression: (
    expression: FruitionProcedureExpressionV1,
    meta?: { source?: FruitionCalculatorHistoryEntry["source"] },
  ) => FruitionCalculatorHistoryEntry;
  loadLocatorSeed: (
    locator: MoralBadgeLocatorV1,
    meta?: { source?: FruitionCalculatorHistoryEntry["source"] },
  ) => FruitionCalculatorHistoryEntry;
  clear: () => void;
};

const MAX_HISTORY = 40;

export const useFruitionCalculatorStore = create<FruitionCalculatorState>()(
  persist(
    (set) => ({
      currentExpression: null,
      history: [],
      loadExpression: (expression, meta) => {
        const entry: FruitionCalculatorHistoryEntry = {
          id: `fruition-calc:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
          expression,
          source: meta?.source ?? "unknown",
          ts: new Date().toISOString(),
        };
        set((state) => ({
          currentExpression: expression,
          history: [entry, ...state.history].slice(0, MAX_HISTORY),
        }));
        return entry;
      },
      loadLocatorSeed: (locator, meta) => {
        const expression = buildFruitionFromMoralBadgeComparisonSeed({
          locator,
          objective: locator.input.summary,
        });
        const entry: FruitionCalculatorHistoryEntry = {
          id: `fruition-calc:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
          expression,
          source: meta?.source ?? "moral_badge_graph",
          ts: new Date().toISOString(),
        };
        set((state) => ({
          currentExpression: expression,
          history: [entry, ...state.history].slice(0, MAX_HISTORY),
        }));
        return entry;
      },
      clear: () => set({ currentExpression: null, history: [] }),
    }),
    {
      name: FRUITION_CALCULATOR_STORAGE_KEY,
      partialize: (state) => ({
        currentExpression: state.currentExpression,
        history: state.history,
      }),
    },
  ),
);
