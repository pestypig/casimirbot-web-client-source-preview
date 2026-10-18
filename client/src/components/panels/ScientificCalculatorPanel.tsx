import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderToString as renderKatexToString } from "katex";
import "katex/dist/katex.min.css";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  SCIENTIFIC_CALCULATOR_DRAFT_KEY,
  SCIENTIFIC_CALCULATOR_MATH_PICKED_EVENT,
  type ScientificCalculatorMathPickedDetail,
} from "@/lib/scientific-calculator/events";
import { formatScientificCalculatorDebugLog } from "@/lib/scientific-calculator/debugLog";
import { runScientificSolve, type ScientificSolveTrace } from "@/lib/scientific-calculator/solver";
import { classifyScientificCalculatorExpression } from "@shared/scientific-calculator-workbench";
import { runTheoryCompoundRunNow, type TheoryCompoundRunSolveScope } from "@/lib/theory/runTheoryCompoundRunNow";
import { solveTheoryCalculatorLoadoutNow } from "@/lib/theory/theoryCalculatorLoadoutRunner";
import { useScientificCalculatorStore } from "@/store/useScientificCalculatorStore";
import {
  selectActiveTheoryRunRow,
  selectRuntimeTheoryRunRows,
  selectScalarTheoryRunRows,
  useTheoryCompoundRunStore,
} from "@/store/useTheoryCompoundRunStore";
import { useWorkstationSessionMemoryStore } from "@/store/useWorkstationSessionMemoryStore";
import { ScientificCalculatorLiveSourceControls } from "./ScientificCalculatorLiveSourceControls";
import { RuntimeWorkbenchSection } from "./scientific-calculator/RuntimeWorkbenchSection";
import { RuntimeReceiptStatusLamps } from "./scientific-calculator/RuntimeReceiptStatusLamps";
import { DOC_CALCULATOR_LAUNCH_EVENT } from "@/lib/docs/docCalculatorLaunch";
import type { DocCalculatorLaunchV1 } from "@shared/contracts/doc-calculator-launch.v1";
import { useTheoryRuntimeJobStore } from "@/store/useTheoryRuntimeJobStore";
import { useHelixStartSettings } from "@/hooks/useHelixStartSettings";
import { getInterfaceLanguageOption } from "@/lib/i18n/interfaceLanguage";
import { useInterfaceText, type InterfaceTextResolver } from "@/lib/i18n/interfaceText";
import type { InterfaceMessageId } from "@/lib/i18n/messages/types";
import type { HelixCalculatorSetupVariable } from "@shared/helix-calculator-setup-context";
import type { ScientificCalculatorDebugEvent, ScientificCalculatorHistoryEntry } from "@/store/useScientificCalculatorStore";
import type { ScientificCalculatorStepTraceArtifactV1 } from "@shared/contracts/scientific-calculator-step-schema.v1";
import type { TheoryCompoundRunRowV1 } from "@shared/contracts/theory-compound-run.v1";
import type { TheoryRuntimeScalarCutV1 } from "@shared/contracts/theory-runtime-math-trace.v1";

type ScientificCalculatorWorkbenchSection = "scalar" | "runtime" | "theory";
type Translate = InterfaceTextResolver["t"];

const WORKBENCH_SECTIONS: Array<{
  id: ScientificCalculatorWorkbenchSection;
  labelId: InterfaceMessageId;
}> = [
  { id: "scalar", labelId: "scientificCalculator.section.scalar" },
  { id: "runtime", labelId: "scientificCalculator.section.runtime" },
  { id: "theory", labelId: "scientificCalculator.section.theory" },
];

function isLiveRegisterSummary(value: string | null | undefined): boolean {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  return (
    /\bcandidate\s*=/.test(normalized) &&
    /\bisPrime\(candidate\)\s*=/.test(normalized) &&
    /\bpreviousPrime\s*=/.test(normalized) &&
    /\blatestPrime\s*=/.test(normalized) &&
    /\bprimeCount\s*=/.test(normalized) &&
    /\bnextCandidate\s*=/.test(normalized)
  );
}

function isGeneratedLiveEquation(value: string | null | undefined): boolean {
  return /^\s*\d+\s*\\bmod\s+\d+\s*=\s*-?\d+\s*$/i.test(String(value ?? "").trim());
}

function normalizeCalculatorInputDraft(value: string | null | undefined): string {
  const text = String(value ?? "").trim();
  return isLiveRegisterSummary(text) ? "" : text;
}

function resolveInitialCalculatorInput(draft: string | null | undefined, currentLatex: string): string {
  const draftInput = normalizeCalculatorInputDraft(draft);
  const currentInput = normalizeCalculatorInputDraft(currentLatex);
  if (draftInput && isGeneratedLiveEquation(draftInput) && currentInput && currentInput !== draftInput) {
    return currentInput;
  }
  return draftInput || currentInput;
}

function renderMathHtml(value: string, displayMode: boolean): string {
  const input = value.trim();
  if (!input) return "";
  try {
    return renderKatexToString(input, {
      displayMode,
      throwOnError: false,
      strict: "ignore",
      trust: false,
    });
  } catch {
    return "";
  }
}

function resolveSolveTrace(lastSolve: { trace?: ScientificSolveTrace; input_latex?: string } | null): ScientificSolveTrace {
  if (lastSolve?.trace) return lastSolve.trace;
  const traceId = `scicalc:legacy:${Date.now().toString(36)}`;
  return {
    traceId,
    runId: traceId,
    route: "scientific-calculator/legacy-result",
    engine: "nerdamer",
    sourceOfTruth: "scientific_calculator",
    capabilityClass: "symbolic_algebra",
    artifactPath: null,
    warnings: ["This result was restored from an older calculator state without trace metadata."],
  };
}

function setupVariableText(variable: { symbol: string; value: string; unit?: string | null; meaning?: string | null; dimension_signature?: string | null }): string {
  const unit = variable.unit ? ` ${variable.unit}` : "";
  const meaning = variable.meaning ? ` (${variable.meaning})` : "";
  const dimension = variable.dimension_signature ? ` [${variable.dimension_signature}]` : "";
  return `${variable.symbol} = ${variable.value}${unit}${meaning}${dimension}`;
}

function setupUnitOptionText(option: { symbol: string; quantity: string; si_factor: number }): string {
  return option.si_factor === 1 ? option.symbol : `${option.symbol} -> SI x ${option.si_factor}`;
}

function theoryRunRowTone(kind: string, status: string): string {
  if (status === "failed" || status === "blocked") return "border-rose-800/70 bg-rose-950/20";
  if (kind === "scalar") return "border-cyan-900/60 bg-cyan-950/20";
  if (kind === "tensor" || kind === "runtime") return "border-violet-900/60 bg-violet-950/20";
  if (kind === "gate" || kind === "boundary") return "border-amber-900/60 bg-amber-950/20";
  return "border-slate-800 bg-slate-950/60";
}

function theoryRunExecutionLabels(row: TheoryCompoundRunRowV1, t: Translate): string[] {
  const labels: string[] = [];
  if (row.runtimeRunRequestV1) labels.push("Manifest only");
  if (row.runtimeReceiptV1?.command) labels.push("Command recorded");
  if (row.runtimeReceiptV1 && row.runtimeReceiptV1.outputs.artifacts.length > 0 && !row.runtimeReceiptV1.command) {
    labels.push("Artifact referenced");
  }
  if (row.runtimeMathTraceV1 && !row.runtimeReceiptV1) labels.push("Static reference");
  if (
    row.status === "blocked" &&
    (row.runtimeReceiptV1?.outputs.missingSignals.length || row.warnings.some((warning) => /missing evidence/i.test(warning)))
  ) {
    labels.push("Blocked by missing evidence");
  }
  void t;
  return Array.from(new Set(labels));
}

function scalarCutExpression(cut: TheoryRuntimeScalarCutV1): string {
  return cut.expression || cut.displayLatex;
}

function formatArtifactStepsMarkdown(artifact: ScientificCalculatorStepTraceArtifactV1): string {
  const lines = [
    "# Scientific Calculator Steps",
    "",
    `Input: ${artifact.request.inputLatex}`,
    `Mode: ${artifact.request.mode}`,
    `Result: ${artifact.result.text}`,
    "",
  ];
  for (const step of artifact.steps) {
    lines.push(`${step.index}. ${step.title}`);
    lines.push(`   Stage: ${step.stage}`);
    lines.push(`   Text: ${step.text}`);
    if (step.latex) lines.push(`   LaTeX: ${step.latex}`);
    if (step.operation) lines.push(`   Operation: ${step.operation.kind} (${step.operation.rule})`);
    if (step.warnings.length > 0) lines.push(`   Warnings: ${step.warnings.join(", ")}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function formatSweepNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  const abs = Math.abs(value);
  if ((abs > 0 && abs < 0.001) || abs >= 1_000_000) return value.toExponential(4);
  return Number(value.toFixed(6)).toString();
}

export function resolveScientificCalculatorVisibleDebugEvents(
  debugEvents: ScientificCalculatorDebugEvent[],
  limit = 8,
): {
  currentCompoundRunId: string | null;
  visibleEvents: ScientificCalculatorDebugEvent[];
  visibleCompoundRunIds: string[];
  staleCompoundRunVisible: boolean;
} {
  const currentCompoundRunId = debugEvents.find((entry) => Boolean(entry.compound_run_id))?.compound_run_id ?? null;
  const visibleEvents = currentCompoundRunId
    ? debugEvents.filter((entry) => entry.compound_run_id === currentCompoundRunId).slice(0, limit)
    : debugEvents.slice(0, limit);
  const visibleCompoundRunIds = [
    ...new Set(visibleEvents.map((entry) => entry.compound_run_id).filter((value): value is string => Boolean(value))),
  ];
  return {
    currentCompoundRunId,
    visibleEvents,
    visibleCompoundRunIds,
    staleCompoundRunVisible: Boolean(
      currentCompoundRunId && visibleCompoundRunIds.some((runId) => runId !== currentCompoundRunId),
    ),
  };
}

export function resolveScientificCalculatorVisibleHistory(
  history: ScientificCalculatorHistoryEntry[],
  currentCompoundRunId: string | null,
  limit = 6,
): ScientificCalculatorHistoryEntry[] {
  if (!currentCompoundRunId) return history.slice(0, limit);
  return history.filter((entry) => entry.compound_run_id === currentCompoundRunId).slice(0, limit);
}

export default function ScientificCalculatorPanel() {
  const { currentLatex, history, lastSolve, lastArtifactV1, lastTheoryLoadout, activeTheoryLoadoutItemIndex, lastSetup, lastCalculatorReceipt, steps, debugEvents, ingestLatex, setSolveResult, setTheoryLoadout, loadTheoryLoadoutItem, recordDebugEvent, clear } =
    useScientificCalculatorStore();
  const { userSettings } = useHelixStartSettings();
  const interfaceLanguage = getInterfaceLanguageOption(userSettings.interfaceLanguage);
  const { t } = useInterfaceText(interfaceLanguage.code);
  const {
    activeTheoryRun,
    activeRuntimeTrace,
    selectedTheoryRunRowId,
    theoryRunStatus,
    loadTheoryRun,
    clearTheoryRun,
    selectTheoryRunRow,
    setTheoryRunStatus,
  } = useTheoryCompoundRunStore();
  const activeTheoryRunRow = useTheoryCompoundRunStore(selectActiveTheoryRunRow);
  const scalarTheoryRunRows = useTheoryCompoundRunStore(selectScalarTheoryRunRows);
  const runtimeTheoryRunRows = useTheoryCompoundRunStore(selectRuntimeTheoryRunRows);
  const rememberDraft = useWorkstationSessionMemoryStore((state) => state.rememberDraft);
  const readDraft = useWorkstationSessionMemoryStore((state) => state.readDraft);
  const clearDraft = useWorkstationSessionMemoryStore((state) => state.clearDraft);
  const selectedRuntimeSetup = useTheoryRuntimeJobStore((state) => state.selectedSetup);
  const [input, setInput] = useState(() =>
    resolveInitialCalculatorInput(readDraft(SCIENTIFIC_CALCULATOR_DRAFT_KEY), currentLatex),
  );
  const [activeSection, setActiveSection] = useState<ScientificCalculatorWorkbenchSection>("scalar");
  const [workbenchSectionOrder, setWorkbenchSectionOrder] = useState<ScientificCalculatorWorkbenchSection[]>(() =>
    WORKBENCH_SECTIONS.map((section) => section.id),
  );
  const lastStoredLatexRef = useRef(currentLatex);
  const lastTheoryRunIdRef = useRef<string | null>(null);
  const lastTheoryLoadoutIdRef = useRef<string | null>(null);
  const lastRuntimeTraceIdRef = useRef<string | null>(null);
  const lastStandaloneSolveDebugEventIdRef = useRef<string | null>(null);
  const skipNextScalarInputPromotionRef = useRef(false);
  const scalarSectionElementRef = useRef<HTMLDivElement | null>(null);
  const selectedTheoryRunRowElementRef = useRef<HTMLButtonElement | null>(null);

  const promoteWorkbenchSection = useCallback((sectionId: ScientificCalculatorWorkbenchSection) => {
    setActiveSection(sectionId);
    setWorkbenchSectionOrder((current) => [
      sectionId,
      ...current.filter((candidate) => candidate !== sectionId),
    ]);
  }, []);

  const workbenchSectionRank = useCallback(
    (sectionId: ScientificCalculatorWorkbenchSection) => {
      const index = workbenchSectionOrder.indexOf(sectionId);
      return index === -1 ? WORKBENCH_SECTIONS.length : index;
    },
    [workbenchSectionOrder],
  );

  useEffect(() => {
    if (isLiveRegisterSummary(readDraft(SCIENTIFIC_CALCULATOR_DRAFT_KEY))) {
      clearDraft(SCIENTIFIC_CALCULATOR_DRAFT_KEY);
    }
  }, [clearDraft, readDraft]);

  useEffect(() => {
    if (currentLatex === lastStoredLatexRef.current) return;
    lastStoredLatexRef.current = currentLatex;
    const nextInput = normalizeCalculatorInputDraft(currentLatex);
    setInput(nextInput);
    if (skipNextScalarInputPromotionRef.current) {
      skipNextScalarInputPromotionRef.current = false;
    } else {
      promoteWorkbenchSection("scalar");
    }
    if (nextInput) {
      rememberDraft(SCIENTIFIC_CALCULATOR_DRAFT_KEY, nextInput);
    } else {
      clearDraft(SCIENTIFIC_CALCULATOR_DRAFT_KEY);
    }
  }, [clearDraft, currentLatex, promoteWorkbenchSection, rememberDraft]);

  useEffect(() => {
    const nextRunId = activeTheoryRun?.runId ?? null;
    if (!nextRunId) {
      lastTheoryRunIdRef.current = null;
      if (!lastTheoryLoadout) promoteWorkbenchSection("scalar");
      return;
    }
    if (lastTheoryRunIdRef.current !== nextRunId) {
      lastTheoryRunIdRef.current = nextRunId;
      promoteWorkbenchSection("theory");
    }
  }, [activeTheoryRun?.runId, lastTheoryLoadout, promoteWorkbenchSection]);

  useEffect(() => {
    if (activeTheoryRun) return;
    const nextLoadoutId = lastTheoryLoadout?.loadoutId ?? null;
    if (!nextLoadoutId) {
      lastTheoryLoadoutIdRef.current = null;
      return;
    }
    if (lastTheoryLoadoutIdRef.current !== nextLoadoutId) {
      lastTheoryLoadoutIdRef.current = nextLoadoutId;
      promoteWorkbenchSection("theory");
    }
  }, [activeTheoryRun, lastTheoryLoadout?.loadoutId, promoteWorkbenchSection]);

  useEffect(() => {
    if (activeTheoryRun) return;
    const nextTraceId = activeRuntimeTrace?.traceId ?? null;
    if (!nextTraceId) {
      lastRuntimeTraceIdRef.current = null;
      return;
    }
    if (lastRuntimeTraceIdRef.current !== nextTraceId) {
      lastRuntimeTraceIdRef.current = nextTraceId;
      promoteWorkbenchSection("runtime");
    }
  }, [activeRuntimeTrace?.traceId, activeTheoryRun, promoteWorkbenchSection]);

  useEffect(() => {
    const latestEvent = debugEvents[0] ?? null;
    const targetWorkbench = latestEvent?.target_workbench ?? null;
    if (
      !latestEvent ||
      latestEvent.id === lastStandaloneSolveDebugEventIdRef.current ||
      (targetWorkbench !== "scalar" &&
        latestEvent.action_id !== "solve_expression" &&
        latestEvent.action_id !== "solve_with_steps") ||
      latestEvent.source !== "workstation_action" ||
      (targetWorkbench !== "scalar" && latestEvent.compound_run_id) ||
      !latestEvent.input_latex?.trim()
    ) {
      return;
    }
    lastStandaloneSolveDebugEventIdRef.current = latestEvent.id;
    const nextInput = normalizeCalculatorInputDraft(latestEvent.input_latex);
    if (!latestEvent.compound_run_id) {
      clearTheoryRun();
      setTheoryLoadout(null);
    }
    setInput(nextInput);
    if (nextInput) {
      rememberDraft(SCIENTIFIC_CALCULATOR_DRAFT_KEY, nextInput);
    } else {
      clearDraft(SCIENTIFIC_CALCULATOR_DRAFT_KEY);
    }
    promoteWorkbenchSection("scalar");
    const timeoutId = window.setTimeout(() => {
      const scalarElement = scalarSectionElementRef.current;
      if (typeof scalarElement?.scrollIntoView !== "function") return;
      scalarElement.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [clearDraft, clearTheoryRun, debugEvents, promoteWorkbenchSection, rememberDraft, setTheoryLoadout]);

  useEffect(() => {
    if (activeSection !== "theory" || !selectedTheoryRunRowId) return;
    const timeoutId = window.setTimeout(() => {
      const selectedElement = selectedTheoryRunRowElementRef.current;
      if (typeof selectedElement?.scrollIntoView !== "function") return;
      selectedElement.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [activeSection, activeTheoryRun?.runId, selectedTheoryRunRowId]);

  useEffect(() => {
    const onPicked = (event: Event) => {
      const detail = (event as CustomEvent<ScientificCalculatorMathPickedDetail>).detail;
      if (!detail?.latex) return;
      if (useScientificCalculatorStore.getState().currentLatex !== detail.latex) {
        ingestLatex(detail.latex, {
          sourcePath: detail.sourcePath,
          anchor: detail.anchor,
          source: detail.source,
        });
      }
      setInput(detail.latex);
      rememberDraft(SCIENTIFIC_CALCULATOR_DRAFT_KEY, detail.latex);
      promoteWorkbenchSection("scalar");
    };
    window.addEventListener(SCIENTIFIC_CALCULATOR_MATH_PICKED_EVENT, onPicked as EventListener);
    return () => {
      window.removeEventListener(SCIENTIFIC_CALCULATOR_MATH_PICKED_EVENT, onPicked as EventListener);
    };
  }, [ingestLatex, promoteWorkbenchSection, rememberDraft]);

  useEffect(() => {
    const onLaunch = (event: Event) => {
      const detail = (event as CustomEvent<DocCalculatorLaunchV1>).detail;
      if (detail?.kind === "runtime") promoteWorkbenchSection("runtime");
    };
    window.addEventListener(DOC_CALCULATOR_LAUNCH_EVENT, onLaunch as EventListener);
    return () => window.removeEventListener(DOC_CALCULATOR_LAUNCH_EVENT, onLaunch as EventListener);
  }, [promoteWorkbenchSection]);

  useEffect(() => {
    if (selectedRuntimeSetup) promoteWorkbenchSection("runtime");
  }, [promoteWorkbenchSection, selectedRuntimeSetup]);

  const handlePasteClipboard = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.readText) return;
    const text = await navigator.clipboard.readText();
    if (!text.trim()) return;
    ingestLatex(text, { sourcePath: "clipboard", anchor: null, source: "clipboard" });
    setInput(text);
    rememberDraft(SCIENTIFIC_CALCULATOR_DRAFT_KEY, text);
    promoteWorkbenchSection("scalar");
  };

  const handleInputChange = (value: string) => {
    setInput(value);
    rememberDraft(SCIENTIFIC_CALCULATOR_DRAFT_KEY, value);
    promoteWorkbenchSection("scalar");
  };

  const handleClear = () => {
    clear();
    clearDraft(SCIENTIFIC_CALCULATOR_DRAFT_KEY);
    setInput("");
    promoteWorkbenchSection("scalar");
  };

  const solve = (withSteps: boolean) => {
    const result = runScientificSolve(input, withSteps);
    setSolveResult(result, { actionId: withSteps ? "solve_with_steps" : "solve_expression", source: "panel" });
    promoteWorkbenchSection("scalar");
  };

  const handleLoadTheoryLoadoutItem = (index: number) => {
    skipNextScalarInputPromotionRef.current = true;
    const item = loadTheoryLoadoutItem(index);
    if (item?.solveExpression) {
      setInput(item.solveExpression);
      rememberDraft(SCIENTIFIC_CALCULATOR_DRAFT_KEY, item.solveExpression);
      promoteWorkbenchSection("theory");
    } else {
      skipNextScalarInputPromotionRef.current = false;
    }
  };

  const handleLoadScalarCut = (cut: TheoryRuntimeScalarCutV1, stepId: string) => {
    if (!activeRuntimeTrace) return;
    const expression = scalarCutExpression(cut);
    ingestLatex(expression, {
      sourcePath: `theory-runtime://${activeRuntimeTrace.traceId}/${stepId}/${cut.id}`,
      anchor: cut.id,
      source: "workstation_action",
      compoundRunId: activeTheoryRun?.runId ?? null,
      compoundSubgoalId: cut.id,
    });
    setInput(expression);
    rememberDraft(SCIENTIFIC_CALCULATOR_DRAFT_KEY, expression);
    promoteWorkbenchSection("scalar");
  };

  const handleRunTheoryCompoundRun = (scope: TheoryCompoundRunSolveScope) => {
    if (!activeTheoryRun) return;
    promoteWorkbenchSection(scope === "runtime_trace_only" ? "runtime" : "theory");
    setTheoryRunStatus("running");
    const solvedRun = runTheoryCompoundRunNow({
      run: activeTheoryRun,
      scope,
      onRow: (_row, partialRun) => {
        loadTheoryRun(partialRun);
        setTheoryRunStatus("running");
      },
    });
    loadTheoryRun(solvedRun);
    setTheoryRunStatus(solvedRun.summary.failedCount > 0 ? "failed" : "complete");
  };

  const handleSolveTheoryLoadout = () => {
    if (!lastTheoryLoadout) return;
    const solved = solveTheoryCalculatorLoadoutNow(lastTheoryLoadout);
    const firstSolved = solved.items.find((item) => item.kind === "calculator_payload" && item.solveExpression);
    if (firstSolved?.solveExpression) {
      setInput(firstSolved.solveExpression);
      rememberDraft(SCIENTIFIC_CALCULATOR_DRAFT_KEY, firstSolved.solveExpression);
      promoteWorkbenchSection("theory");
    }
  };

  const handleSolveTheoryLoadoutWithRuntime = () => {
    if (!lastTheoryLoadout) return;
    const solved = solveTheoryCalculatorLoadoutNow(lastTheoryLoadout, {
      solveScope: "all_scalar_and_runtime",
      runRuntime: true,
    });
    const firstSolved = solved.items.find((item) => item.kind === "calculator_payload" && item.solveExpression);
    if (firstSolved?.solveExpression) {
      setInput(firstSolved.solveExpression);
      rememberDraft(SCIENTIFIC_CALCULATOR_DRAFT_KEY, firstSolved.solveExpression);
      promoteWorkbenchSection("runtime");
    }
  };

  const handleCopyResult = () => {
    const text = lastSolve?.result_text;
    if (!text) {
      recordDebugEvent({
        action_id: "copy_result",
        source: "panel",
        ok: false,
        message: t("scientificCalculator.copy.noResult"),
      });
      return;
    }
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text);
    }
    recordDebugEvent({
      action_id: "copy_result",
      source: "panel",
      ok: true,
      result_text: text,
      input_latex: lastSolve.input_latex,
      normalized_expression: lastSolve.normalized_expression,
      trace_id: lastSolve.trace.traceId,
      route: lastSolve.trace.route,
      engine: lastSolve.trace.engine,
      message: "result_copied",
    });
  };

  const handleCopyDebugLog = () => {
    const payload = formatScientificCalculatorDebugLog(debugEvents);
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(payload);
    }
    recordDebugEvent({
      action_id: "copy_debug_log",
      source: "panel",
      ok: true,
      message: "debug_log_copied",
    });
  };

  const handleCopyStepsMarkdown = () => {
    if (!lastArtifactV1) {
      recordDebugEvent({
        action_id: "copy_steps_markdown",
        source: "panel",
        ok: false,
        message: t("scientificCalculator.copy.noSteps"),
      });
      return;
    }
    const payload = formatArtifactStepsMarkdown(lastArtifactV1);
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(payload);
    }
    recordDebugEvent({
      action_id: "copy_steps_markdown",
      source: "panel",
      ok: true,
      input_latex: lastArtifactV1.request.inputLatex,
      result_text: lastArtifactV1.result.text,
      normalized_expression: lastArtifactV1.normalization.canonicalText,
      trace_id: lastSolve?.trace.traceId ?? null,
      route: lastSolve?.trace.route ?? null,
      engine: lastArtifactV1.quality.engine,
      message: "steps_markdown_copied",
    });
  };

  const stepItems = useMemo(() => steps ?? [], [steps]);
  const schemaStepItems = useMemo(() => lastArtifactV1?.steps ?? [], [lastArtifactV1?.steps]);
  const resultMathHtml = useMemo(
    () => renderMathHtml(lastSolve?.result_latex ?? "", true),
    [lastSolve?.result_latex],
  );
  const inputPreviewHtml = useMemo(() => renderMathHtml(input, true), [input]);
  const intakeClassification = useMemo(() => classifyScientificCalculatorExpression(input), [input]);
  const solveTrace = useMemo(() => resolveSolveTrace(lastSolve), [lastSolve]);
  const compoundSolveEvents = useMemo(
    () => {
      const latestChain: typeof debugEvents = [];
      const seenSubgoals = new Set<string>();
      let newestSolveAtMs: number | null = null;
      let newestCompoundRunId: string | null = null;
      for (const entry of debugEvents) {
        if (
          entry.action_id !== "solve_expression" &&
          entry.action_id !== "solve_with_steps"
        ) {
          continue;
        }
        if (
          entry.source !== "workstation_action" ||
          !entry.input_latex ||
          !entry.result_text ||
          !entry.calculator_setup
        ) {
          continue;
        }
        if (newestCompoundRunId === null && entry.compound_run_id) {
          newestCompoundRunId = entry.compound_run_id;
        }
        if (
          newestCompoundRunId &&
          entry.compound_run_id &&
          entry.compound_run_id !== newestCompoundRunId
        ) {
          break;
        }
        const entryAtMs = Date.parse(entry.ts);
        if (Number.isFinite(entryAtMs)) {
          if (newestSolveAtMs === null) {
            newestSolveAtMs = entryAtMs;
          } else if (newestSolveAtMs - entryAtMs > 30_000) {
            break;
          }
        }
        const subgoalKey = [
          entry.calculator_setup.domain ?? "unknown",
          entry.calculator_setup.subgoal ?? entry.input_latex,
          entry.calculator_setup.result_unit ?? "",
        ].join("|");
        if (seenSubgoals.has(subgoalKey)) break;
        seenSubgoals.add(subgoalKey);
        latestChain.push(entry);
        if (latestChain.length >= 6) break;
      }
      return latestChain.reverse();
    },
    [debugEvents],
  );
  const visibleDebugState = useMemo(
    () => resolveScientificCalculatorVisibleDebugEvents(debugEvents),
    [debugEvents],
  );
  const visibleHistory = useMemo(
    () => resolveScientificCalculatorVisibleHistory(history, visibleDebugState.currentCompoundRunId),
    [history, visibleDebugState.currentCompoundRunId],
  );
  const activeTheoryLoadoutItem = useMemo(
    () => lastTheoryLoadout?.items.find((item) => item.index === activeTheoryLoadoutItemIndex) ?? null,
    [activeTheoryLoadoutItemIndex, lastTheoryLoadout],
  );
  const activeInputSource = useMemo(() => {
    if (activeTheoryLoadoutItem?.solveExpression && input.trim() === activeTheoryLoadoutItem.solveExpression.trim()) {
      return {
        label: `${activeTheoryLoadoutItem.badgeTitle} / ${activeTheoryLoadoutItem.payloadId ?? "context"}`,
        stale: false,
      };
    }
    if (lastSetup?.subgoal && input.trim()) {
      return {
        label: lastSetup.subgoal,
        stale: Boolean(activeTheoryLoadoutItem?.solveExpression),
      };
    }
      return {
      label: input.trim() ? t("scientificCalculator.input.sourceManual") : t("scientificCalculator.input.noScalarLoaded"),
      stale: Boolean(activeTheoryLoadoutItem?.solveExpression && input.trim()),
    };
  }, [activeTheoryLoadoutItem, input, lastSetup?.subgoal, t]);
  const showTheoryWorkbench = activeSection === "theory" || Boolean(activeTheoryRun || lastTheoryLoadout);
  const showRuntimeWorkbench = activeSection === "runtime" || Boolean(selectedRuntimeSetup || activeRuntimeTrace || runtimeTheoryRunRows.length > 0);

  return (
    <div className="h-full w-full overflow-auto bg-slate-950/90 p-4 text-slate-100">
      <div className="mb-3">
        <div className="text-xs uppercase tracking-wide text-cyan-300">{t("scientificCalculator.header.title")}</div>
        <div className="text-sm text-slate-300">{t("scientificCalculator.header.description")}</div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label={t("scientificCalculator.tabs.ariaLabel")}>
        {WORKBENCH_SECTIONS.map((section) => (
          <Button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.scientific-calculator.scientific-calculator-panel.promote-workbench-section-section-id"
            key={section.id}
            type="button"
            size="sm"
            variant={activeSection === section.id ? "secondary" : "outline"}
            onClick={() => promoteWorkbenchSection(section.id)}
            role="tab"
            aria-selected={activeSection === section.id}
          >
            {t(section.labelId)}
          </Button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
      {lastCalculatorReceipt ? (
        <div
          className="rounded-md border border-emerald-900/60 bg-emerald-950/20 p-3 text-xs"
          data-testid="scientific-calculator-receipt-card"
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-emerald-300">{t("scientificCalculator.receipt.title")}</div>
              <div className="break-all font-mono text-[11px] text-slate-300">{lastCalculatorReceipt.receipt_id}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-emerald-700/70 text-emerald-100">
                {lastCalculatorReceipt.status}
              </Badge>
              <Badge variant="outline" className="border-slate-700 text-slate-200">
                dimensions: {lastCalculatorReceipt.dimensional_check_status}
              </Badge>
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded border border-slate-800 bg-slate-950/60 p-2">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">{t("scientificCalculator.common.expression")}</div>
              <div className="break-all font-mono text-slate-100">{lastCalculatorReceipt.latex ?? lastCalculatorReceipt.expression}</div>
            </div>
            <div className="rounded border border-slate-800 bg-slate-950/60 p-2">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">{t("scientificCalculator.common.result")}</div>
              <div className="break-all font-mono text-slate-100">
                {lastCalculatorReceipt.result_text ?? lastCalculatorReceipt.result_value ?? "not solved"}
                {lastCalculatorReceipt.result_unit ? ` ${lastCalculatorReceipt.result_unit}` : ""}
              </div>
            </div>
          </div>
          {lastCalculatorReceipt.variables.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {lastCalculatorReceipt.variables.slice(0, 8).map((variable) => (
                <Badge key={`${lastCalculatorReceipt.receipt_id}:${variable.symbol}`} variant="outline" className="border-slate-700 text-slate-200">
                  {variable.symbol}={variable.value ?? "unbound"}{variable.unit ? ` ${variable.unit}` : ""}
                </Badge>
              ))}
            </div>
          ) : null}
          {lastCalculatorReceipt.missing_bindings.length > 0 || lastCalculatorReceipt.blockers.length > 0 ? (
            <div className="mt-2 rounded border border-amber-900/60 bg-amber-950/20 p-2 text-[11px] text-amber-100">
              {[...lastCalculatorReceipt.missing_bindings, ...lastCalculatorReceipt.blockers].join("; ")}
            </div>
          ) : null}
          <div className="mt-2 text-[11px] text-slate-400">{lastCalculatorReceipt.claim_boundary}</div>
        </div>
      ) : null}
      {showTheoryWorkbench ? (
        <div
          className="rounded-md border border-cyan-900/60 bg-cyan-950/20 p-3"
          data-testid="scientific-calculator-theory-run-section"
          style={{ order: workbenchSectionRank("theory") }}
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-cyan-300">{t("scientificCalculator.section.theory")}</div>
              <div className="text-xs text-slate-300">
                {activeTheoryRun
                  ? t("scientificCalculator.theory.summary.run", {
                      rows: activeTheoryRun.summary.rowCount,
                      scalar: activeTheoryRun.summary.scalarCount,
                      tensor: activeTheoryRun.summary.tensorCount,
                      status: theoryRunStatus,
                    })
                  : lastTheoryLoadout
                    ? t("scientificCalculator.theory.summary.loadout", {
                        label: lastTheoryLoadout.objectContext?.label ?? lastTheoryLoadout.mode,
                        scalar: lastTheoryLoadout.summary.scalarCount,
                        context: lastTheoryLoadout.summary.contextCount,
                      })
                    : t("scientificCalculator.theory.empty")}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {activeTheoryRun ? (
                <div className="flex items-center gap-1" data-testid="theory-run-aggregate-status">
                  <span className="text-[9px] uppercase tracking-wide text-slate-400">Aggregate theory run</span>
                  <Badge variant="outline" className="border-cyan-700/70 text-cyan-100">
                    {theoryRunStatus}
                  </Badge>
                </div>
              ) : null}
              {activeTheoryRunRow ? (
                <Badge variant="outline" className="border-cyan-700/70 text-cyan-100">
                  {t("scientificCalculator.theory.selected", { index: activeTheoryRunRow.index })}
                </Badge>
              ) : null}
            </div>
          </div>
          {activeTheoryRun ? (
            <div className="mb-3 flex flex-wrap gap-2">
              <Button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.scientific-calculator.scientific-calculator-panel.handle-run-theory-compound-run-scalar-only" size="sm" variant="secondary" onClick={() => handleRunTheoryCompoundRun("scalar_only")}>
                {t("scientificCalculator.action.solveScalarRows")}
              </Button>
              <Button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.scientific-calculator.scientific-calculator-panel.handle-run-theory-compound-run-runtime-trace-only" size="sm" variant="outline" onClick={() => handleRunTheoryCompoundRun("runtime_trace_only")}>
                {t("scientificCalculator.action.buildRuntimeTraces")}
              </Button>
              <Button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.scientific-calculator.scientific-calculator-panel.handle-run-theory-compound-run-all-available" size="sm" variant="outline" onClick={() => handleRunTheoryCompoundRun("all_available")}>
                {t("scientificCalculator.action.solveAvailable")}
              </Button>
            </div>
          ) : null}
          {!activeTheoryRun && lastTheoryLoadout ? (
            <div className="mb-3 flex flex-wrap gap-2">
              <Button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.scientific-calculator.scientific-calculator-panel.handle-solve-theory-loadout" size="sm" variant="secondary" onClick={handleSolveTheoryLoadout}>
                {t("scientificCalculator.action.solveAllScalar")}
              </Button>
              <Button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.scientific-calculator.scientific-calculator-panel.handle-solve-theory-loadout-with-runtime" size="sm" variant="outline" onClick={handleSolveTheoryLoadoutWithRuntime}>
                {t("scientificCalculator.action.solveRuntime")}
              </Button>
            </div>
          ) : null}
          {activeTheoryRun ? (
            <div className="space-y-2">
              {activeTheoryRun.rows
                .slice()
                .sort((left, right) => left.index - right.index)
                .map((row) => (
                  <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.scientific-calculator.scientific-calculator-panel.select-theory-run-row-row-id"
                    key={row.id}
                    ref={selectedTheoryRunRowId === row.id ? selectedTheoryRunRowElementRef : null}
                    type="button"
                    data-theory-run-row-id={row.id}
                    data-selected-theory-run-row={selectedTheoryRunRowId === row.id ? "true" : undefined}
                    onClick={() => selectTheoryRunRow(row.id)}
                    className={`w-full rounded border p-2 text-left text-xs ${theoryRunRowTone(row.kind, row.status)} ${
                      selectedTheoryRunRowId === row.id ? "ring-1 ring-cyan-300" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-slate-600 text-slate-200">
                        {row.index}
                      </Badge>
                      <span className="font-semibold text-slate-100">{row.badgeTitle}</span>
                      <Badge variant="outline" className="border-slate-600 text-[10px] text-slate-200">
                        {row.kind}
                      </Badge>
                      <Badge variant="outline" className="border-slate-600 text-[10px] text-slate-200">
                        {row.status}
                      </Badge>
                      <Badge variant="outline" className="border-slate-700 text-[10px] text-slate-300">
                        {row.solver}
                      </Badge>
                      {theoryRunExecutionLabels(row, t).map((label) => (
                        <Badge key={`${row.id}:execution-label:${label}`} variant="outline" className="border-emerald-800/70 text-[10px] text-emerald-100">
                          {label}
                        </Badge>
                      ))}
                    </div>
                    <div className="mt-2 break-all font-mono text-slate-100">
                      {row.displayLatex ?? row.expression ?? t("scientificCalculator.theory.contextRow")}
                    </div>
                    {row.evidenceRefs && row.evidenceRefs.length > 0 ? (
                      <div className="mt-2 rounded border border-slate-800 bg-slate-950/50 p-2 text-[11px] text-slate-300">
                        <div className="mb-1 font-semibold uppercase tracking-wide text-slate-400">{t("scientificCalculator.theory.evidenceRefs")}</div>
                        <div className="space-y-1">
                          {row.evidenceRefs.slice(0, 4).map((ref, index) => (
                            <div key={`${row.id}:evidence:${index}`} className="truncate" title={ref.path}>
                              {ref.kind}: {ref.path}
                              {ref.note ? ` - ${ref.note}` : ""}
                            </div>
                          ))}
                          {row.evidenceRefs.length > 4 ? (
                            <div className="text-slate-500">{t("scientificCalculator.theory.moreRefs", { count: row.evidenceRefs.length - 4 })}</div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {row.runtimeReceiptV1 ? (
                      <div className="mt-2 rounded border border-violet-900/60 bg-violet-950/20 p-2 text-[11px] text-violet-100">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{t("scientificCalculator.theory.runtimeReceipt")}</span>
                          <Badge variant="outline" className="border-violet-700/70 text-violet-100">
                            lifecycle: {row.runtimeReceiptV1.status}
                          </Badge>
                          <Badge variant="outline" className="border-slate-700 text-slate-300">
                            {row.runtimeReceiptV1.runtimeId}
                          </Badge>
                        </div>
                        <RuntimeReceiptStatusLamps
                          receipt={row.runtimeReceiptV1}
                          aggregateStatus={row.status}
                          aggregateLabel="Aggregate row / section"
                          className="mb-2"
                        />
                        <div className="grid gap-1 md:grid-cols-2">
                          <div>artifacts: {row.runtimeReceiptV1.outputs.artifacts.length}</div>
                          <div>{t("scientificCalculator.runtime.missingSignals")}: {row.runtimeReceiptV1.outputs.missingSignals.length}</div>
                          <div>gates: {Object.keys(row.runtimeReceiptV1.outputs.gates).length}</div>
                          <div>promotion: {row.runtimeReceiptV1.claimBoundary.promotionAllowed ? "allowed" : "blocked"}</div>
                        </div>
                        {row.runtimeReceiptV1.outputs.artifacts.length > 0 ? (
                          <div className="mt-2 space-y-1">
                            {row.runtimeReceiptV1.outputs.artifacts.slice(0, 3).map((artifact) => (
                              <div key={`${row.id}:artifact:${artifact}`} className="truncate" title={artifact}>
                                artifact: {artifact}
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {row.runtimeReceiptV1.outputs.warnings.length > 0 ? (
                          <div className="mt-2 text-amber-100">
                            {row.runtimeReceiptV1.outputs.warnings.slice(0, 3).join("; ")}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {row.runtimeRunRequestV1 ? (
                      <div className="mt-2 rounded border border-indigo-900/60 bg-indigo-950/20 p-2 text-[11px] text-indigo-100">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{t("scientificCalculator.theory.runtimeRequest")}</span>
                          <Badge variant="outline" className="border-indigo-700/70 text-indigo-100">
                            {row.runtimeRunRequestV1.status === "created" ? t("scientificCalculator.theory.manifestCreated") : row.runtimeRunRequestV1.status}
                          </Badge>
                          <Badge variant="outline" className="border-slate-700 text-slate-300">
                            {row.runtimeRunRequestV1.runtimeId}
                          </Badge>
                        </div>
                        <div className="grid gap-1 md:grid-cols-2">
                          <div>scope: {row.runtimeRunRequestV1.requestedScope}</div>
                          <div>stage: {row.runtimeRunRequestV1.heartbeat.stage ?? "n/a"}</div>
                          <div>{t("scientificCalculator.runtime.artifactsExpected")}: {row.runtimeRunRequestV1.outputArtifactGlobs.length}</div>
                          <div>promotion: {row.runtimeRunRequestV1.claimBoundary.promotionAllowed ? "allowed" : "blocked"}</div>
                        </div>
                        {row.runtimeRunRequestV1.heartbeat.message ? (
                          <div className="mt-2 text-amber-100">{row.runtimeRunRequestV1.heartbeat.message}</div>
                        ) : null}
                      </div>
                    ) : null}
                    {row.sweepRunV1 ? (
                      <div className="mt-2 rounded border border-emerald-900/60 bg-emerald-950/20 p-2 text-[11px] text-emerald-100">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{t("scientificCalculator.theory.sweepSummary")}</span>
                          <Badge variant="outline" className="border-emerald-700/70 text-emerald-100">
                            {row.sweepRunV1.samplePolicy.kind}
                          </Badge>
                          <Badge variant="outline" className="border-slate-700 text-slate-300">
                            ok: {row.sweepRunV1.aggregate.okCount}
                          </Badge>
                          <Badge variant="outline" className="border-slate-700 text-slate-300">
                            failed: {row.sweepRunV1.aggregate.failedCount}
                          </Badge>
                        </div>
                        <div className="grid gap-1 md:grid-cols-3">
                          <div>mean: {formatSweepNumber(row.sweepRunV1.aggregate.mean)}</div>
                          <div>median: {formatSweepNumber(row.sweepRunV1.aggregate.median)}</div>
                          <div>range: {formatSweepNumber(row.sweepRunV1.aggregate.min)} to {formatSweepNumber(row.sweepRunV1.aggregate.max)}</div>
                          <div>p05: {formatSweepNumber(row.sweepRunV1.aggregate.p05)}</div>
                          <div>p95: {formatSweepNumber(row.sweepRunV1.aggregate.p95)}</div>
                          <div>samples: {row.sweepRunV1.samples.length}</div>
                        </div>
                        {row.sweepRunV1.rateProjections.length > 0 ? (
                          <div className="mt-2 space-y-1">
                            {row.sweepRunV1.rateProjections.map((projection) => (
                              <div key={`${row.id}:projection:${projection.kind}:${projection.outputSymbol}`}>
                                {projection.kind}: {projection.outputSymbol} {t("scientificCalculator.runtime.mean")} {formatSweepNumber(projection.aggregate.mean)}
                                {projection.unit ? ` ${projection.unit}` : ""}
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {row.sweepRunV1.claimBoundary.notes.length > 0 ? (
                          <div className="mt-2 text-amber-100">
                            {row.sweepRunV1.claimBoundary.notes.slice(0, 3).join("; ")}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {row.claimBoundaryNotes.length > 0 ? (
                      <div className="mt-2 space-y-1 rounded border border-amber-900/60 bg-amber-950/20 p-2 text-[11px] text-amber-100">
                        {row.claimBoundaryNotes.slice(0, 4).map((note, index) => (
                          <div key={`${row.id}:claim:${index}`}>{note}</div>
                        ))}
                      </div>
                    ) : null}
                    {row.warnings.length > 0 ? (
                      <div className="mt-2 space-y-1 text-[11px] text-amber-200">
                        {row.warnings.map((warning, index) => (
                          <div key={`${row.id}:warning:${index}`}>{warning}</div>
                        ))}
                      </div>
                    ) : null}
                  </button>
                ))}
            </div>
          ) : lastTheoryLoadout ? (
            <div className="space-y-2">
              {lastTheoryLoadout.items.map((item) => (
                <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.scientific-calculator.scientific-calculator-panel.handle-load-theory-loadout-item-item-index"
                  key={item.id}
                  type="button"
                  onClick={() => handleLoadTheoryLoadoutItem(item.index)}
                  className={`w-full rounded border p-2 text-left text-xs ${
                    activeTheoryLoadoutItemIndex === item.index
                      ? "border-cyan-400 bg-cyan-950/50"
                      : "border-slate-800 bg-slate-950/60 hover:border-slate-600"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-cyan-700/70 text-cyan-100">
                      {item.index}
                    </Badge>
                    <span className="font-semibold text-slate-100">{item.badgeTitle}</span>
                    <Badge variant="outline" className="border-slate-700 text-[10px] text-slate-300">
                      {item.kind}
                    </Badge>
                    {item.calculatorArtifactV1 ? (
                      <Badge variant="outline" className="border-emerald-700/70 text-emerald-100">
                        {t("scientificCalculator.theory.solved")}
                      </Badge>
                    ) : null}
                    {item.runtimeReceiptV1 ? (
                      <Badge variant="outline" className="border-violet-700/70 text-violet-100">
                        {t("scientificCalculator.theory.runtimeCompleted")}
                      </Badge>
                    ) : null}
                  </div>
                  {item.solveExpression ? (
                    <div className="mt-2 break-all font-mono text-cyan-100">{item.solveExpression}</div>
                  ) : (
                    <div className="mt-2 break-all font-mono text-slate-500">{item.displayLatex ?? t("scientificCalculator.theory.contextRow")}</div>
                  )}
                  {Object.keys(item.usedBindings).length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {Object.entries(item.usedBindings).map(([symbol, value]) => (
                        <Badge key={`${item.id}:${symbol}`} variant="outline" className="border-slate-700 text-[10px] text-slate-300">
                          {symbol}={String(value)}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {item.resultText ? <div className="mt-2 font-mono text-slate-200">result: {item.resultText}</div> : null}
                  {item.runtimeReceiptV1 ? (
                    <div className="mt-2 grid gap-1 rounded border border-violet-900/60 bg-violet-950/20 p-2 text-[11px] text-violet-100 md:grid-cols-2">
                      <div>channel: {item.runtimeReceiptV1.outputSummary.dominantFusionChannel ?? "-"}</div>
                      <div>{t("scientificCalculator.runtime.fusionZone")}: {item.runtimeReceiptV1.outputSummary.fusionZoneMode ?? "-"}</div>
                      <div>active: {String(item.runtimeReceiptV1.outputSummary.fusionActive ?? "-")}</div>
                      <div>tunneling: {String(item.runtimeReceiptV1.outputSummary.tunnelingRequired ?? "-")}</div>
                      <div>qst: {item.runtimeReceiptV1.outputSummary.qstRole ?? "-"}</div>
                      <div>boundary: {item.runtimeReceiptV1.outputSummary.spacetimeCL ?? "proxy_only"}</div>
                    </div>
                  ) : null}
                  {item.warnings.length > 0 ? (
                    <div className="mt-2 text-[11px] text-amber-200">{item.warnings.join("; ")}</div>
                  ) : null}
                </button>
              ))}
              {lastTheoryLoadout.claimBoundaryNotes.length > 0 ? (
                <div className="rounded border border-amber-900/60 bg-amber-950/20 p-2 text-[11px] text-amber-100">
                  {lastTheoryLoadout.claimBoundaryNotes.slice(0, 4).join("; ")}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">
              {t("scientificCalculator.theory.presetsHelp")}
            </div>
          )}
        </div>
      ) : null}

      {showRuntimeWorkbench ? (
        <div
          className="rounded-md border border-violet-900/60 bg-violet-950/20 p-3"
          data-testid="scientific-calculator-runtime-section"
          style={{ order: workbenchSectionRank("runtime") }}
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-violet-300">{t("scientificCalculator.section.runtime")}</div>
              <div className="text-xs text-slate-300">
                {activeRuntimeTrace
                  ? t("scientificCalculator.runtime.summary.trace", {
                      steps: activeRuntimeTrace.summary.stepCount,
                      cuts: activeRuntimeTrace.summary.scalarCutCount,
                    })
                  : activeTheoryRun
                    ? t("scientificCalculator.runtime.summary.rows", { count: runtimeTheoryRunRows.length })
                    : t("scientificCalculator.runtime.empty")}
              </div>
            </div>
            {scalarTheoryRunRows.length > 0 ? (
              <Badge variant="outline" className="border-cyan-700/70 text-cyan-100">
                {t("scientificCalculator.runtime.scalarRows", { count: scalarTheoryRunRows.length })}
              </Badge>
            ) : null}
          </div>
          <RuntimeWorkbenchSection />
          {activeRuntimeTrace ? (
            <div className="mt-3 space-y-2">
              <div className="rounded border border-violet-900/50 bg-slate-950/60 p-2 text-xs">
                <div className="font-mono text-violet-100">{activeRuntimeTrace.traceId}</div>
                <div className="mt-1 text-slate-400">{activeRuntimeTrace.request.target}</div>
                {activeRuntimeTrace.summary.claimBoundaryNotes.length > 0 ? (
                  <div className="mt-2 text-[11px] text-amber-100">
                    {activeRuntimeTrace.summary.claimBoundaryNotes.join("; ")}
                  </div>
                ) : null}
              </div>
              {activeRuntimeTrace.steps.map((step) => (
                <div key={step.id} className="rounded border border-slate-800 bg-slate-950/60 p-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-violet-700/70 text-violet-100">
                      {step.index}
                    </Badge>
                    <span className="font-semibold text-slate-100">{step.title}</span>
                    <Badge variant="outline" className="border-slate-700 text-[10px] text-slate-300">
                      {step.operatorKind}
                    </Badge>
                    <Badge variant="outline" className="border-slate-700 text-[10px] text-slate-300">
                      {step.status}
                    </Badge>
                  </div>
                  <div className="mt-2 break-all font-mono text-slate-200">
                    {step.displayLatex ?? step.expression ?? t("scientificCalculator.runtime.referenceStep")}
                  </div>
                  {step.scalarCuts.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {step.scalarCuts.map((cut) => (
                        <div key={cut.id} className="rounded border border-cyan-900/50 bg-cyan-950/20 p-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="font-semibold text-cyan-100">{cut.label}</div>
                              <div className="mt-1 break-all font-mono text-cyan-50">
                                {scalarCutExpression(cut)}
                              </div>
                            </div>
                            <Button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.scientific-calculator.scientific-calculator-panel.handle-load-scalar-cut-cut-step-id" size="sm" variant="outline" onClick={() => handleLoadScalarCut(cut, step.id)}>
                              {t("scientificCalculator.action.loadScalarCut")}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {step.warnings.length > 0 ? (
                    <div className="mt-2 text-[11px] text-amber-200">{step.warnings.join("; ")}</div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">
              {t("scientificCalculator.runtime.help")}
            </div>
          )}
        </div>
      ) : null}

      <div
        ref={scalarSectionElementRef}
        className="space-y-3 rounded-md border border-slate-800 bg-slate-900/50 p-3"
        data-testid="scientific-calculator-scalar-section"
        style={{ order: workbenchSectionRank("scalar") }}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-cyan-300">{t("scientificCalculator.section.scalar")}</div>
            <Label className="text-xs text-slate-300">{t("scientificCalculator.input.label")}</Label>
          </div>
          <div className="flex max-w-full flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <span>{t("scientificCalculator.input.source")}</span>
            <Badge
              variant="outline"
              className={
                activeInputSource.stale
                  ? "max-w-[34rem] truncate border-amber-700/70 text-amber-100"
                  : "max-w-[34rem] truncate border-slate-700 text-slate-200"
              }
              title={activeInputSource.label}
            >
              {activeInputSource.label}
            </Badge>
          </div>
        </div>
        {activeInputSource.stale ? (
          <div className="rounded border border-amber-900/60 bg-amber-950/20 p-2 text-[11px] text-amber-100">
            {t("scientificCalculator.input.staleWarning")}
          </div>
        ) : null}
        <Textarea data-helix-control-id="workstation.panel.scientific-calculator.scientific-calculator-panel.textarea" data-helix-interaction-kind="configure" data-helix-authority-state="client_local"
          className="min-h-[130px] border-slate-700 bg-slate-900/70 font-mono text-xs text-slate-100"
          value={input}
          onChange={(event) => handleInputChange(event.target.value)}
          placeholder={t("scientificCalculator.input.placeholder")}
        />
        <div className="grid gap-2 lg:grid-cols-2">
          <div className="rounded-md border border-slate-800 bg-slate-950/50 p-2">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">{t("scientificCalculator.preview.title")}</div>
            {inputPreviewHtml ? (
              <div
                className="overflow-x-auto rounded border border-slate-800 bg-slate-900/70 px-2 py-2 text-slate-100"
                dangerouslySetInnerHTML={{ __html: inputPreviewHtml }}
              />
            ) : (
              <div className="text-xs text-slate-500">{t("scientificCalculator.preview.empty")}</div>
            )}
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-950/50 p-2">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">{t("scientificCalculator.normalized.title")}</div>
            <div className="break-words font-mono text-xs text-slate-200">
              {lastSolve?.normalized_expression || t("scientificCalculator.normalized.empty")}
            </div>
          </div>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-950/50 p-2 text-xs" data-testid="scientific-calculator-intake">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">{t("scientificCalculator.intake.title")}</div>
            <Badge variant="outline" className="border-slate-700 text-slate-200">
              parse: {intakeClassification.parse_status}
            </Badge>
            <Badge variant="outline" className="border-cyan-800/70 text-cyan-100">
              {intakeClassification.calculation_type}
            </Badge>
            {intakeClassification.blocked_reasons.length > 0 ? (
              <Badge variant="outline" className="border-amber-800/70 text-amber-100">
                {t("scientificCalculator.intake.blocked")}
              </Badge>
            ) : (
              <Badge variant="outline" className="border-emerald-800/70 text-emerald-100">
                {t("scientificCalculator.intake.routeReady")}
              </Badge>
            )}
          </div>
          <div className="grid gap-2 lg:grid-cols-3">
            <div className="rounded border border-slate-800 bg-slate-900/50 p-2">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">{t("scientificCalculator.intake.routes")}</div>
              <div className="flex flex-wrap gap-1">
                {intakeClassification.possible_routes.map((route) => (
                  <Badge key={`route:${route}`} variant="outline" className="border-slate-700 text-[10px] text-slate-300">
                    {route}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="rounded border border-slate-800 bg-slate-900/50 p-2">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">{t("scientificCalculator.intake.symbols")}</div>
              {intakeClassification.detected_symbols.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {intakeClassification.detected_symbols.map((symbol) => (
                    <Badge key={`symbol:${symbol}`} variant="outline" className="border-slate-700 text-[10px] text-slate-300">
                      {symbol}
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-slate-500">{t("scientificCalculator.common.none")}</div>
              )}
            </div>
            <div className="rounded border border-slate-800 bg-slate-900/50 p-2">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">{t("scientificCalculator.intake.blockedBy")}</div>
              {intakeClassification.blocked_reasons.length > 0 ? (
                <div className="space-y-1 text-[11px] text-amber-100">
                  {intakeClassification.blocked_reasons.map((reason) => (
                    <div key={`blocked:${reason}`}>{reason}</div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-slate-500">{t("scientificCalculator.common.none")}</div>
              )}
            </div>
          </div>
          {intakeClassification.missing_variables.length > 0 ? (
            <div className="mt-2 rounded border border-amber-900/60 bg-amber-950/20 p-2 text-[11px] text-amber-100">
              {t("scientificCalculator.intake.missingBindings", { variables: intakeClassification.missing_variables.join(", ") })}
            </div>
          ) : null}
          <div className="mt-2 rounded border border-slate-800 bg-slate-900/50 p-2">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">{t("scientificCalculator.intake.variableBinder")}</div>
            {intakeClassification.detected_symbols.length > 0 ? (
              <div className="grid gap-1">
                {intakeClassification.detected_symbols.map((symbol) => {
                  const setupVariable = lastSetup?.variables?.find((variable) => variable.symbol === symbol) ?? null;
                  return (
                    <div key={`binder:${symbol}`} className="grid gap-2 rounded border border-slate-800 bg-slate-950/60 px-2 py-1 md:grid-cols-[5rem_1fr_7rem]">
                      <div className="font-mono text-slate-100">{symbol}</div>
                      <div className="text-slate-300">
                        {setupVariable ? setupVariableText(setupVariable) : "No numeric evidence bound"}
                      </div>
                      <div className={setupVariable ? "text-emerald-300" : "text-amber-200"}>
                        {setupVariable ? "bound" : "missing"}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-[11px] text-slate-500">{t("scientificCalculator.intake.noVariables")}</div>
            )}
          </div>
        </div>
        {lastSetup ? (
          <div className="rounded-md border border-slate-800 bg-slate-950/50 p-2 text-xs">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">{t("scientificCalculator.setup.title")}</div>
            <div className="text-slate-200">{lastSetup.subgoal}</div>
            {lastSetup.equation ? <div className="mt-1 font-mono text-slate-300">{lastSetup.equation}</div> : null}
            {lastSetup.variables?.length ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {lastSetup.variables.map((variable: HelixCalculatorSetupVariable) => (
                  <Badge key={`${variable.symbol}:${variable.value}`} variant="outline" className="border-slate-600 text-slate-200">
                    {setupVariableText(variable)}
                  </Badge>
                ))}
              </div>
            ) : null}
            <div className="mt-3 rounded border border-slate-800 bg-slate-900/50 p-2">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">{t("scientificCalculator.setup.unitsTitle")}</div>
              <div className="flex flex-wrap gap-2">
                {lastSetup.unit_system ? (
                  <Badge variant="outline" className="border-cyan-700/70 text-cyan-100">
                    system: {lastSetup.unit_system}
                  </Badge>
                ) : null}
                {lastSetup.result_quantity ? (
                  <Badge variant="outline" className="border-slate-600 text-slate-200">
                    quantity: {lastSetup.result_quantity}
                  </Badge>
                ) : null}
                {lastSetup.result_unit ? (
                  <Badge variant="outline" className="border-slate-600 text-slate-200">
                    result: {lastSetup.result_unit}
                  </Badge>
                ) : null}
                {lastSetup.result_dimension_signature ? (
                  <Badge variant="outline" className="border-slate-600 text-slate-200">
                    dimension: {lastSetup.result_dimension_signature}
                  </Badge>
                ) : null}
              </div>
              {lastSetup.input_units && Object.keys(lastSetup.input_units).length > 0 ? (
                <div className="mt-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">{t("scientificCalculator.setup.inputUnits")}</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(lastSetup.input_units as Record<string, string>).map(([symbol, unit]: [string, string]) => (
                      <Badge key={`${symbol}:${unit}`} variant="outline" className="border-slate-700 text-slate-300">
                        {symbol}: {unit}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
              {lastSetup.unit_options?.length ? (
                <div className="mt-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">{t("scientificCalculator.setup.compatibleUnits")}</div>
                  <div className="flex flex-wrap gap-2">
                    {lastSetup.unit_options.slice(0, 8).map((option: { symbol: string; quantity: string; si_factor: number }) => (
                      <Badge key={option.symbol} variant="outline" className="border-slate-700 text-slate-300">
                        {setupUnitOptionText(option)}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
              {lastSetup.assumptions?.length ? (
                <div className="mt-2 space-y-1">
                  {lastSetup.assumptions.map((assumption: string, index: number) => (
                    <div key={`${assumption}:${index}`} className="text-[11px] text-slate-400">
                      {assumption}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.scientific-calculator.scientific-calculator-panel.handle-paste-clipboard" size="sm" variant="secondary" onClick={handlePasteClipboard}>
            {t("scientificCalculator.action.pasteClipboard")}
          </Button>
          <Button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.scientific-calculator.scientific-calculator-panel.solve-false" size="sm" className="bg-cyan-600 hover:bg-cyan-700" onClick={() => solve(false)}>
            {t("scientificCalculator.action.solve")}
          </Button>
          <Button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.scientific-calculator.scientific-calculator-panel.solve-true" size="sm" variant="outline" onClick={() => solve(true)}>
            {t("scientificCalculator.action.solveSteps")}
          </Button>
          <Button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.scientific-calculator.scientific-calculator-panel.handle-copy-result"
            size="sm"
            variant="outline"
            onClick={handleCopyResult}
          >
            {t("scientificCalculator.action.copyResult")}
          </Button>
          <Button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.scientific-calculator.scientific-calculator-panel.handle-copy-debug-log" size="sm" variant="outline" onClick={handleCopyDebugLog}>
            {t("scientificCalculator.action.copyDebugLog")}
          </Button>
          <Button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.scientific-calculator.scientific-calculator-panel.handle-clear" size="sm" variant="ghost" onClick={handleClear}>
            {t("scientificCalculator.action.clear")}
          </Button>
        </div>
      </div>
      </div>

      <ScientificCalculatorLiveSourceControls currentEquation={input} />

      {compoundSolveEvents.length >= 2 ? (
        <div className="mt-3 rounded-md border border-cyan-900/60 bg-cyan-950/20 p-3">
          <div className="mb-2 text-[10px] uppercase tracking-wide text-cyan-300">{t("scientificCalculator.compoundTrace.title")}</div>
          <div className="space-y-2">
            {compoundSolveEvents.map((entry, index) => (
              <div key={entry.id} className="rounded border border-cyan-900/40 bg-slate-950/60 p-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-cyan-700/70 text-cyan-100">
                    {index + 1}
                  </Badge>
                  <span className="text-slate-200">{entry.calculator_setup?.subgoal ?? t("scientificCalculator.compoundTrace.subgoalFallback")}</span>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">{t("scientificCalculator.common.expression")}</div>
                    <div className="break-all rounded border border-slate-800 bg-slate-900/60 px-2 py-1 font-mono text-slate-200">
                      {entry.input_latex}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">{t("scientificCalculator.common.result")}</div>
                    <div className="break-all rounded border border-slate-800 bg-slate-900/60 px-2 py-1 font-mono text-slate-100">
                      {entry.result_text}
                      {entry.calculator_setup?.result_unit ? ` ${entry.calculator_setup.result_unit}` : ""}
                    </div>
                  </div>
                </div>
                {entry.calculator_setup?.result_dimension_signature ? (
                  <div className="mt-2 text-[11px] text-slate-400">
                    dimension: {entry.calculator_setup.result_dimension_signature}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 space-y-3 rounded-md border border-slate-800 bg-slate-900/40 p-3">
        {lastSolve ? (
          <>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline" className="border-slate-600 text-slate-200">
                mode: {lastSolve.mode}
              </Badge>
              <Badge variant="outline" className="border-slate-600 text-slate-200">
                ok: {lastSolve.ok ? "true" : "false"}
              </Badge>
              {lastSolve.variable ? (
                <Badge variant="outline" className="border-slate-600 text-slate-200">
                  variable: {lastSolve.variable}
                </Badge>
              ) : null}
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-950/60 p-3 text-xs">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">{t("scientificCalculator.common.result")}</div>
              {resultMathHtml ? (
                <div
                  className="mb-2 overflow-x-auto rounded border border-slate-800 bg-slate-900/70 px-2 py-2 text-slate-100"
                  dangerouslySetInnerHTML={{ __html: resultMathHtml }}
                />
              ) : null}
              <div className="font-mono text-slate-100">{lastSolve.result_text || lastSolve.error || "n/a"}</div>
            </div>
            <div className="rounded-md border border-slate-800 bg-slate-950/50 p-3 text-xs">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">{t("scientificCalculator.result.trace")}</div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-slate-600 text-slate-200">
                  {solveTrace.route}
                </Badge>
                <Badge variant="outline" className="border-slate-600 text-slate-200">
                  {solveTrace.engine}
                </Badge>
                <Badge variant="outline" className="border-slate-600 text-slate-200">
                  {solveTrace.capabilityClass}
                </Badge>
              </div>
              <div className="mt-2 break-all font-mono text-[11px] text-slate-300">
                traceId: {solveTrace.traceId}
              </div>
              {solveTrace.delegatedTo ? (
                <div className="mt-1 font-mono text-[11px] text-cyan-200">
                  delegatedTo: {solveTrace.delegatedTo}
                </div>
              ) : null}
              {solveTrace.warnings.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {solveTrace.warnings.map((warning, index) => (
                    <div key={`${warning}:${index}`} className="text-[11px] text-amber-200">
                      {warning}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            {lastArtifactV1 ? (
              <details className="space-y-3 rounded-md border border-slate-800 bg-slate-950/50 p-3 text-xs">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-slate-400">
                  <span>{t("scientificCalculator.result.evidenceTrace")}</span>
                  <Button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.scientific-calculator.scientific-calculator-panel.event-event-prevent-default-handle-copy-steps-markdown" size="sm" variant="outline" onClick={(event) => {
                    event.preventDefault();
                    handleCopyStepsMarkdown();
                  }}>
                    {t("scientificCalculator.action.copyStepsMarkdown")}
                  </Button>
                </summary>
                <div className="grid gap-2 lg:grid-cols-2">
                  <div className="rounded border border-slate-800 bg-slate-950/50 p-2">
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">{t("scientificCalculator.result.method")}</div>
                    <div className="text-slate-200">{schemaStepItems.find((step) => step.stage === "method")?.text ?? "n/a"}</div>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-950/50 p-2">
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">{t("scientificCalculator.result.assumptions")}</div>
                    <div className="font-mono text-slate-200">
                      {t("scientificCalculator.result.assumptionSummary", {
                        domain: lastArtifactV1.request.assumptions.domain,
                        angle: lastArtifactV1.request.assumptions.angleMode,
                      })}
                    </div>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-950/50 p-2">
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">{t("scientificCalculator.result.verification")}</div>
                    <div className="text-slate-200">
                      {lastArtifactV1.result.verification?.status ?? "not_run"}: {lastArtifactV1.result.verification?.text ?? "n/a"}
                    </div>
                  </div>
                  <div className="rounded border border-slate-800 bg-slate-950/50 p-2">
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">{t("scientificCalculator.result.confidenceFallback")}</div>
                    <div className="font-mono text-slate-200">
                      {lastArtifactV1.quality.confidence.toFixed(2)} / {lastArtifactV1.quality.fallbackReason ?? "none"}
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">{t("scientificCalculator.result.schemaSteps")}</div>
                  {schemaStepItems.map((step) => (
                    <div key={step.id} className="rounded-md border border-slate-800 bg-slate-950/50 p-2">
                      <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-wide text-slate-500">
                        <span>{step.index}. {step.title}</span>
                        <span>{step.stage}</span>
                      </div>
                      {step.latex ? (
                        <div
                          className="mt-1 overflow-x-auto rounded border border-slate-800 bg-slate-900/70 px-2 py-2 text-slate-100"
                          dangerouslySetInnerHTML={{ __html: renderMathHtml(step.latex, true) }}
                        />
                      ) : null}
                      <div className="mt-1 font-mono text-slate-100">{step.text}</div>
                      {step.operation ? (
                        <div className="mt-1 font-mono text-[11px] text-slate-400">
                          {step.operation.kind}: {step.operation.rule}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </details>
            ) : stepItems.length > 0 ? (
              <div className="space-y-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">{t("scientificCalculator.result.steps")}</div>
                {stepItems.map((step, index) => (
                  <div key={`${step.id}:${index}`} className="rounded-md border border-slate-800 bg-slate-950/50 p-2 text-xs">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">{index + 1}. {step.label}</div>
                    {step.latex ? (
                      <div
                        className="mt-1 overflow-x-auto rounded border border-slate-800 bg-slate-900/70 px-2 py-2 text-slate-100"
                        dangerouslySetInnerHTML={{ __html: renderMathHtml(step.latex, true) }}
                      />
                    ) : null}
                    <div className="mt-1 font-mono text-slate-100">{step.value}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-xs text-slate-400">{t("scientificCalculator.result.empty")}</p>
        )}
      </div>

      <div className="mt-3 rounded-md border border-slate-800 bg-slate-900/30 p-3">
        <div className="text-[10px] uppercase tracking-wide text-slate-500">{t("scientificCalculator.history.title")}</div>
        <div className="mt-2 space-y-1">
          {visibleHistory.map((entry) => (
            <div
              key={entry.id}
              className="rounded border border-slate-800 bg-slate-950/50 px-2 py-1 text-[11px] text-slate-300"
              data-compound-run-id={entry.compound_run_id ?? ""}
              data-compound-subgoal-id={entry.compound_subgoal_id ?? ""}
            >
              <div className="font-mono text-slate-200">{entry.latex}</div>
              <div className="text-slate-500">{entry.sourcePath ?? "unknown"}{entry.anchor ? ` #${entry.anchor}` : ""}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 rounded-md border border-slate-800 bg-slate-900/30 p-3">
        <div className="text-[10px] uppercase tracking-wide text-slate-500">{t("scientificCalculator.events.title")}</div>
        <div
          className="mt-2 space-y-1"
          data-testid="scientific-calculator-debug-log"
          data-current-compound-run-id={visibleDebugState.currentCompoundRunId ?? ""}
          data-visible-compound-run-ids={visibleDebugState.visibleCompoundRunIds.join(",")}
          data-stale-compound-run-visible={visibleDebugState.staleCompoundRunVisible ? "true" : "false"}
        >
          {visibleDebugState.visibleEvents.map((entry) => (
            <div
              key={entry.id}
              className="rounded border border-slate-800 bg-slate-950/50 px-2 py-1 text-[11px] text-slate-300"
              data-testid="scientific-calculator-debug-event"
              data-compound-run-id={entry.compound_run_id ?? ""}
              data-compound-subgoal-id={entry.compound_subgoal_id ?? ""}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-slate-200">{entry.action_id}</span>
                <span className={entry.ok ? "text-emerald-300" : "text-amber-200"}>{entry.ok ? "ok" : "failed"}</span>
                <span className="text-slate-500">{entry.source}</span>
              </div>
              <div className="mt-1 break-all font-mono text-slate-400">
                {entry.trace_id ?? entry.source_path ?? entry.message ?? entry.id}
              </div>
              {entry.calculator_setup ? (
                <div className="mt-1 text-slate-400">
                  setup: {entry.calculator_setup.subgoal}
                </div>
              ) : null}
            </div>
          ))}
          {debugEvents.length === 0 ? <div className="text-xs text-slate-500">{t("scientificCalculator.events.empty")}</div> : null}
        </div>
      </div>
    </div>
  );
}
