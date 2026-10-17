import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ScientificSolveResult } from "@/lib/scientific-calculator/solver";
import type { HelixCalculatorSetupContext } from "@shared/helix-calculator-setup-context";
import type { ScientificCalculatorStepTraceArtifactV1 } from "@shared/contracts/scientific-calculator-step-schema.v1";
import type {
  TheoryCalculatorLoadoutItemV1,
  TheoryCalculatorLoadoutV1,
} from "@shared/contracts/theory-calculator-loadout.v1";
import {
  SCIENTIFIC_CALCULATOR_RECEIPT_CLAIM_BOUNDARY,
  type ScientificCalculatorReceiptV1,
} from "@shared/contracts/scientific-calculator-receipt.v1";

const SCIENTIFIC_CALCULATOR_STORAGE_KEY = "scientific-calculator:v1";

export type ScientificCalculatorWorkbenchTarget = "scalar" | "runtime" | "theory";

export type ScientificCalculatorHistoryEntry = {
  id: string;
  latex: string;
  sourcePath: string | null;
  anchor: string | null;
  calculatorSetup?: HelixCalculatorSetupContext | null;
  compound_run_id?: string | null;
  compound_subgoal_id?: string | null;
  ts: string;
};

export type ScientificCalculatorDebugAction =
  | "ingest_latex"
  | "prefill_expression"
  | "classify_expression"
  | "live_workbench_update"
  | "live_solve_step"
  | "solve_expression"
  | "solve_with_steps"
  | "copy_result"
  | "copy_steps_markdown"
  | "copy_debug_log"
  | "clear_workspace";

export type ScientificCalculatorDebugEvent = {
  id: string;
  ts: string;
  panel_id: "scientific-calculator";
  action_id: ScientificCalculatorDebugAction;
  source: "panel" | "workstation_action" | "doc_viewer" | "clipboard" | "unknown";
  ok: boolean;
  input_latex?: string;
  source_path?: string | null;
  anchor?: string | null;
  result_text?: string;
  normalized_expression?: string;
  trace_id?: string | null;
  route?: string | null;
  engine?: string | null;
  message?: string;
  calculator_setup?: HelixCalculatorSetupContext | null;
  compound_run_id?: string | null;
  compound_subgoal_id?: string | null;
  target_workbench?: ScientificCalculatorWorkbenchTarget;
};

type ScientificCalculatorState = {
  currentLatex: string;
  history: ScientificCalculatorHistoryEntry[];
  lastSolve: ScientificSolveResult | null;
  lastArtifactV1: ScientificCalculatorStepTraceArtifactV1 | null;
  lastTheoryLoadout: TheoryCalculatorLoadoutV1 | null;
  activeTheoryLoadoutItemIndex: number | null;
  lastSetup: HelixCalculatorSetupContext | null;
  calculatorReceipts: ScientificCalculatorReceiptV1[];
  calculatorReceiptIdsByContextKey: Record<string, string>;
  lastCalculatorReceipt: ScientificCalculatorReceiptV1 | null;
  steps: ScientificSolveResult["steps"];
  debugEvents: ScientificCalculatorDebugEvent[];
  ingestLatex: (
    latex: string,
    meta?: {
      actionId?: Extract<ScientificCalculatorDebugAction, "ingest_latex" | "prefill_expression">;
      sourcePath?: string | null;
      anchor?: string | null;
      source?: ScientificCalculatorDebugEvent["source"];
      calculatorSetup?: HelixCalculatorSetupContext | null;
      compoundRunId?: string | null;
      compoundSubgoalId?: string | null;
      targetWorkbench?: ScientificCalculatorWorkbenchTarget;
    },
  ) => ScientificCalculatorHistoryEntry;
  setSolveResult: (
    result: ScientificSolveResult,
    meta?: {
      actionId?: Extract<ScientificCalculatorDebugAction, "solve_expression" | "solve_with_steps">;
      source?: ScientificCalculatorDebugEvent["source"];
      calculatorSetup?: HelixCalculatorSetupContext | null;
      compoundRunId?: string | null;
      compoundSubgoalId?: string | null;
      targetWorkbench?: ScientificCalculatorWorkbenchTarget;
    },
  ) => void;
  setTheoryLoadout: (loadout: TheoryCalculatorLoadoutV1 | null) => void;
  loadTheoryLoadoutItem: (index: number) => TheoryCalculatorLoadoutItemV1 | null;
  updateTheoryLoadout: (loadout: TheoryCalculatorLoadoutV1) => void;
  recordDebugEvent: (
    event: Omit<ScientificCalculatorDebugEvent, "id" | "ts" | "panel_id">,
  ) => ScientificCalculatorDebugEvent;
  recordCalculatorReceipt: (
    receipt: Partial<ScientificCalculatorReceiptV1> & {
      expression: string;
      status: ScientificCalculatorReceiptV1["status"];
    },
  ) => ScientificCalculatorReceiptV1;
  setLiveWorkbenchExpression: (
    latex: string,
    meta?: {
      traceId?: string | null;
      message?: string;
      source?: ScientificCalculatorDebugEvent["source"];
      calculatorSetup?: HelixCalculatorSetupContext | null;
    },
  ) => void;
  clear: (meta?: { source?: ScientificCalculatorDebugEvent["source"] }) => void;
};

const MAX_HISTORY = 80;
const MAX_DEBUG_EVENTS = 160;
const MAX_CALCULATOR_RECEIPTS = 80;

const indexCalculatorReceiptContextKeys = (
  receipt: ScientificCalculatorReceiptV1,
): Record<string, string> =>
  Object.fromEntries((receipt.context_keys ?? []).map((key) => [key, receipt.receipt_id]));

function makeDebugEvent(
  event: Omit<ScientificCalculatorDebugEvent, "id" | "ts" | "panel_id">,
): ScientificCalculatorDebugEvent {
  const ts = new Date().toISOString();
  return {
    ...event,
    id: `scicalc-debug:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
    ts,
    panel_id: "scientific-calculator",
  };
}

const makeReceiptId = (): string =>
  `scientific-calculator-receipt:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

const buildReceiptFromSolve = (
  result: ScientificSolveResult,
  meta?: {
    calculatorSetup?: HelixCalculatorSetupContext | null;
    compoundRunId?: string | null;
    compoundSubgoalId?: string | null;
  },
): ScientificCalculatorReceiptV1 => {
  const now = new Date().toISOString();
  const setup = meta?.calculatorSetup ?? null;
  return {
    schema: "helix.scientific_calculator_receipt.v1",
    receipt_id: `scientific-calculator-receipt:${result.trace.traceId}`,
    expression_template_id: meta?.compoundSubgoalId ?? setup?.subgoal ?? null,
    status: result.ok ? "solved" : "blocked",
    expression: result.normalized_expression || result.input_latex,
    latex: result.input_latex,
    variables: (setup?.variables ?? []).map((variable) => ({
      symbol: variable.symbol,
      value: variable.value,
      unit: variable.unit ?? setup?.input_units?.[variable.symbol] ?? null,
      meaning: variable.meaning ?? null,
      dimension_signature: variable.dimension_signature ?? null,
      source_refs: [],
    })),
    assumptions: setup?.assumptions ?? [],
    source_refs: [
      result.trace.traceId,
      result.trace.route,
      ...(meta?.compoundRunId ? [`compound_run:${meta.compoundRunId}`] : []),
      ...(meta?.compoundSubgoalId ? [`compound_subgoal:${meta.compoundSubgoalId}`] : []),
    ],
    context_keys: [
      `calculator_trace:${result.trace.traceId}`,
      ...(meta?.compoundRunId ? [`compound_run:${meta.compoundRunId}`] : []),
      ...(meta?.compoundSubgoalId ? [`compound_subgoal:${meta.compoundSubgoalId}`] : []),
    ],
    dimensional_check_status: setup?.result_dimension_signature
      ? "passed"
      : setup?.input_units && Object.keys(setup.input_units).length > 0
        ? "not_run"
        : "missing_units",
    result_value: result.ok ? result.result_text : null,
    result_unit: setup?.result_unit ?? null,
    result_text: result.ok ? result.result_text : result.error ?? null,
    provenance_refs: [
      `calculator_trace:${result.trace.traceId}`,
      `calculator_engine:${result.trace.engine}`,
      ...(result.artifact_v1?.artifactId ? [`calculator_artifact:${result.artifact_v1.artifactId}`] : []),
    ],
    missing_bindings: result.ok ? [] : ["calculator_result"],
    blockers: result.ok ? [] : [result.error ?? "solve_failed"],
    claim_boundary: SCIENTIFIC_CALCULATOR_RECEIPT_CLAIM_BOUNDARY,
    created_at: now,
    updated_at: now,
  };
};

export const useScientificCalculatorStore = create<ScientificCalculatorState>()(
  persist(
    (set) => ({
      currentLatex: "",
      history: [],
      lastSolve: null,
      lastArtifactV1: null,
      lastTheoryLoadout: null,
      activeTheoryLoadoutItemIndex: null,
      lastSetup: null,
      calculatorReceipts: [],
      calculatorReceiptIdsByContextKey: {},
      lastCalculatorReceipt: null,
      steps: [],
      debugEvents: [],
      ingestLatex: (latex, meta) => {
        const trimmed = latex.trim();
        const entry: ScientificCalculatorHistoryEntry = {
          id: `scicalc:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
          latex: trimmed,
          sourcePath: meta?.sourcePath ?? null,
          anchor: meta?.anchor ?? null,
          calculatorSetup: meta?.calculatorSetup ?? null,
          compound_run_id: meta?.compoundRunId ?? null,
          compound_subgoal_id: meta?.compoundSubgoalId ?? null,
          ts: new Date().toISOString(),
        };
        const debugEvent = makeDebugEvent({
          action_id: meta?.actionId ?? "ingest_latex",
          source: meta?.source ?? (entry.sourcePath === "clipboard" ? "clipboard" : "unknown"),
          ok: Boolean(trimmed),
          input_latex: trimmed,
          source_path: entry.sourcePath,
          anchor: entry.anchor,
          calculator_setup: entry.calculatorSetup,
          compound_run_id: meta?.compoundRunId ?? null,
          compound_subgoal_id: meta?.compoundSubgoalId ?? null,
          target_workbench: meta?.targetWorkbench ?? (meta?.compoundRunId ? "theory" : "scalar"),
          message: trimmed ? "latex_ingested" : "empty_latex",
        });
        set((state) => ({
          currentLatex: trimmed,
          lastSetup: entry.calculatorSetup ?? null,
          history: [entry, ...state.history].slice(0, MAX_HISTORY),
          debugEvents: [debugEvent, ...state.debugEvents].slice(0, MAX_DEBUG_EVENTS),
        }));
        return entry;
      },
      setSolveResult: (result, meta) => {
        const debugEvent = makeDebugEvent({
          action_id: meta?.actionId ?? "solve_expression",
          source: meta?.source ?? "panel",
          ok: result.ok,
          input_latex: result.input_latex,
          result_text: result.result_text,
          normalized_expression: result.normalized_expression,
          trace_id: result.trace.traceId,
          route: result.trace.route,
          engine: result.trace.engine,
          calculator_setup: meta?.calculatorSetup ?? null,
          compound_run_id: meta?.compoundRunId ?? null,
          compound_subgoal_id: meta?.compoundSubgoalId ?? null,
          target_workbench: meta?.targetWorkbench ?? (meta?.compoundRunId ? "theory" : "scalar"),
          message: result.ok ? "solve_completed" : result.error ?? "solve_failed",
        });
        const receipt = buildReceiptFromSolve(result, {
          calculatorSetup: meta?.calculatorSetup ?? null,
          compoundRunId: meta?.compoundRunId ?? null,
          compoundSubgoalId: meta?.compoundSubgoalId ?? null,
        });
        set((state) => ({
          lastSolve: result,
          lastArtifactV1: result.artifact_v1 ?? null,
          lastSetup: meta && "calculatorSetup" in meta ? (meta.calculatorSetup ?? null) : state.lastSetup,
          lastCalculatorReceipt: receipt,
          calculatorReceipts: [receipt, ...state.calculatorReceipts].slice(0, MAX_CALCULATOR_RECEIPTS),
          calculatorReceiptIdsByContextKey: {
            ...state.calculatorReceiptIdsByContextKey,
            ...indexCalculatorReceiptContextKeys(receipt),
          },
          steps: result.steps,
          debugEvents: [debugEvent, ...state.debugEvents].slice(0, MAX_DEBUG_EVENTS),
        }));
      },
      setTheoryLoadout: (loadout) =>
        set({
          lastTheoryLoadout: loadout,
          activeTheoryLoadoutItemIndex: loadout?.items.find((item) => item.kind === "calculator_payload")?.index ?? null,
        }),
      loadTheoryLoadoutItem: (index) => {
        let selectedItem: TheoryCalculatorLoadoutItemV1 | null = null;
        set((state) => {
          selectedItem = state.lastTheoryLoadout?.items.find((item) => item.index === index) ?? null;
          if (!selectedItem || selectedItem.kind !== "calculator_payload" || !selectedItem.solveExpression) {
            return {
              activeTheoryLoadoutItemIndex: index,
            };
          }
          const debugEvent = makeDebugEvent({
            action_id: "ingest_latex",
            source: "workstation_action",
            ok: true,
            input_latex: selectedItem.solveExpression,
            source_path: selectedItem.sourcePath,
            anchor: selectedItem.payloadId,
            calculator_setup: selectedItem.setupContext,
            compound_run_id: state.lastTheoryLoadout?.loadoutId ?? null,
            compound_subgoal_id: selectedItem.id,
            target_workbench: "theory",
            message: "theory_loadout_item_loaded",
          });
          const entry: ScientificCalculatorHistoryEntry = {
            id: `scicalc:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
            latex: selectedItem.solveExpression,
            sourcePath: selectedItem.sourcePath,
            anchor: selectedItem.payloadId,
            calculatorSetup: selectedItem.setupContext,
            compound_run_id: state.lastTheoryLoadout?.loadoutId ?? null,
            compound_subgoal_id: selectedItem.id,
            ts: new Date().toISOString(),
          };
          return {
            activeTheoryLoadoutItemIndex: index,
            currentLatex: selectedItem.solveExpression,
            lastSetup: selectedItem.setupContext,
            history: [entry, ...state.history].slice(0, MAX_HISTORY),
            debugEvents: [debugEvent, ...state.debugEvents].slice(0, MAX_DEBUG_EVENTS),
          };
        });
        return selectedItem;
      },
      updateTheoryLoadout: (loadout) =>
        set((state) => ({
          lastTheoryLoadout: loadout,
          activeTheoryLoadoutItemIndex:
            state.activeTheoryLoadoutItemIndex ??
            loadout.items.find((item) => item.kind === "calculator_payload")?.index ??
            null,
        })),
      recordDebugEvent: (event) => {
        const debugEvent = makeDebugEvent(event);
        set((state) => ({
          debugEvents: [debugEvent, ...state.debugEvents].slice(0, MAX_DEBUG_EVENTS),
        }));
        return debugEvent;
      },
      recordCalculatorReceipt: (receiptInput) => {
        const now = new Date().toISOString();
        const receipt: ScientificCalculatorReceiptV1 = {
          schema: "helix.scientific_calculator_receipt.v1",
          receipt_id: receiptInput.receipt_id ?? makeReceiptId(),
          expression_template_id: receiptInput.expression_template_id ?? null,
          status: receiptInput.status,
          expression: receiptInput.expression.trim(),
          latex: receiptInput.latex ?? receiptInput.expression.trim(),
          variables: receiptInput.variables ?? [],
          assumptions: receiptInput.assumptions ?? [],
          source_refs: receiptInput.source_refs ?? [],
          context_keys: receiptInput.context_keys ?? [],
          dimensional_check_status: receiptInput.dimensional_check_status ?? "not_run",
          result_value: receiptInput.result_value ?? null,
          result_unit: receiptInput.result_unit ?? null,
          result_text: receiptInput.result_text ?? null,
          provenance_refs: receiptInput.provenance_refs ?? [],
          missing_bindings: receiptInput.missing_bindings ?? [],
          blockers: receiptInput.blockers ?? [],
          claim_boundary: receiptInput.claim_boundary ?? SCIENTIFIC_CALCULATOR_RECEIPT_CLAIM_BOUNDARY,
          created_at: receiptInput.created_at ?? now,
          updated_at: now,
        };
        const debugEvent = makeDebugEvent({
          action_id: receipt.status === "solved" ? "solve_expression" : "classify_expression",
          source: "workstation_action",
          ok: receipt.status === "solved" || receipt.status === "calculation_ready",
          input_latex: receipt.latex ?? receipt.expression,
          result_text: receipt.result_text ?? undefined,
          normalized_expression: receipt.expression,
          trace_id: receipt.receipt_id,
          route: "scientific-calculator/receipt",
          engine: "nerdamer",
          message: `calculator_receipt_${receipt.status}`,
        });
        set((state) => ({
          currentLatex: receipt.latex ?? receipt.expression,
          lastCalculatorReceipt: receipt,
          calculatorReceipts: [receipt, ...state.calculatorReceipts].slice(0, MAX_CALCULATOR_RECEIPTS),
          calculatorReceiptIdsByContextKey: {
            ...state.calculatorReceiptIdsByContextKey,
            ...indexCalculatorReceiptContextKeys(receipt),
          },
          debugEvents: [debugEvent, ...state.debugEvents].slice(0, MAX_DEBUG_EVENTS),
        }));
        return receipt;
      },
      setLiveWorkbenchExpression: (latex, meta) => {
        const trimmed = latex.trim();
        const debugEvent = makeDebugEvent({
          action_id: "live_workbench_update",
          source: meta?.source ?? "workstation_action",
          ok: Boolean(trimmed),
          input_latex: trimmed,
          source_path: "scientific-calculator:live-source",
          trace_id: meta?.traceId ?? null,
          route: "scientific-calculator/live-workbench",
          engine: "trial_division",
          calculator_setup: meta?.calculatorSetup ?? null,
          message: meta?.message ?? "live_workbench_expression_updated",
        });
        set((state) => ({
          currentLatex: trimmed,
          lastSetup: meta?.calculatorSetup ?? null,
          debugEvents: [debugEvent, ...state.debugEvents].slice(0, MAX_DEBUG_EVENTS),
        }));
      },
      clear: (meta) =>
        set((state) => ({
          currentLatex: "",
          lastSolve: null,
          lastArtifactV1: null,
          lastTheoryLoadout: null,
          activeTheoryLoadoutItemIndex: null,
          lastSetup: null,
          lastCalculatorReceipt: null,
          steps: [],
          debugEvents: [
            makeDebugEvent({
              action_id: "clear_workspace",
              source: meta?.source ?? "panel",
              ok: true,
              message: "workspace_cleared",
            }),
            ...state.debugEvents,
          ].slice(0, MAX_DEBUG_EVENTS),
        })),
    }),
    {
      name: SCIENTIFIC_CALCULATOR_STORAGE_KEY,
      partialize: (state) => ({
        currentLatex: state.currentLatex,
        history: state.history,
        lastSolve: state.lastSolve,
        lastArtifactV1: state.lastArtifactV1,
        lastTheoryLoadout: state.lastTheoryLoadout,
        activeTheoryLoadoutItemIndex: state.activeTheoryLoadoutItemIndex,
        lastSetup: state.lastSetup,
        calculatorReceipts: state.calculatorReceipts,
        calculatorReceiptIdsByContextKey: state.calculatorReceiptIdsByContextKey,
        lastCalculatorReceipt: state.lastCalculatorReceipt,
        steps: state.steps,
        debugEvents: state.debugEvents,
      }),
    },
  ),
);
