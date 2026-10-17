import { useScientificCalculatorStore } from "@/store/useScientificCalculatorStore";
import { useScientificCalculatorLiveSourceStore } from "@/store/useScientificCalculatorLiveSourceStore";
import { useWorkstationSessionMemoryStore } from "@/store/useWorkstationSessionMemoryStore";
import type { ScientificCalculatorDebugEvent } from "@/store/useScientificCalculatorStore";

export const SCIENTIFIC_CALCULATOR_PANEL_ID = "scientific-calculator";
export const SCIENTIFIC_CALCULATOR_DRAFT_KEY = "scientific-calculator:input";
export const SCIENTIFIC_CALCULATOR_MATH_PICKED_EVENT = "helix:math-picked";

export type ScientificCalculatorMathPickedDetail = {
  latex: string;
  sourcePath: string | null;
  anchor: string | null;
  source: ScientificCalculatorDebugEvent["source"];
  ts: string;
};

export function dispatchScientificCalculatorMathPicked(detail: {
  latex: string;
  sourcePath?: string | null;
  anchor?: string | null;
  source?: ScientificCalculatorDebugEvent["source"];
}): ScientificCalculatorMathPickedDetail {
  const source = detail.source ?? (detail.sourcePath === "clipboard" ? "clipboard" : "doc_viewer");
  const normalized: ScientificCalculatorMathPickedDetail = {
    latex: detail.latex,
    sourcePath: detail.sourcePath ?? null,
    anchor: detail.anchor ?? null,
    source,
    ts: new Date().toISOString(),
  };
  useScientificCalculatorLiveSourceStore.getState().stopPrimeStream();
  if (useScientificCalculatorStore.getState().currentLatex !== normalized.latex) {
    useScientificCalculatorStore.getState().ingestLatex(normalized.latex, {
      sourcePath: normalized.sourcePath,
      anchor: normalized.anchor,
      source,
    });
  }
  useWorkstationSessionMemoryStore.getState().rememberDraft(SCIENTIFIC_CALCULATOR_DRAFT_KEY, normalized.latex);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<ScientificCalculatorMathPickedDetail>(
        SCIENTIFIC_CALCULATOR_MATH_PICKED_EVENT,
        { detail: normalized },
      ),
    );
  }
  return normalized;
}
