import {
  DOC_CALCULATOR_LAUNCH_SCHEMA,
  isDocCalculatorLaunchV1,
  type DocCalculatorLaunchV1,
  type DocScalarCalculatorLaunchV1,
} from "@shared/contracts/doc-calculator-launch.v1";
import { dispatchScientificCalculatorMathPicked } from "@/lib/scientific-calculator/events";
import { useTheoryRuntimeJobStore } from "@/store/useTheoryRuntimeJobStore";
import { useWorkstationLayoutStore } from "@/store/useWorkstationLayoutStore";

export const DOC_CALCULATOR_LAUNCH_EVENT = "helix:doc-calculator-launch";

export function buildDocScalarCalculatorLaunch(input: {
  latex: string;
  docPath?: string | null;
  anchor?: string | null;
  label?: string | null;
  claimBoundaryNotes?: string[];
}): DocScalarCalculatorLaunchV1 {
  return {
    schema: DOC_CALCULATOR_LAUNCH_SCHEMA,
    kind: "scalar",
    source: {
      docPath: input.docPath?.trim() || "docs/unknown.md",
      anchor: input.anchor?.trim() || null,
      label: input.label?.trim() || null,
    },
    latex: input.latex.trim(),
    claimBoundaryNotes: input.claimBoundaryNotes ?? [],
  };
}

export function dispatchDocCalculatorLaunch(launch: DocCalculatorLaunchV1): DocCalculatorLaunchV1 {
  if (!isDocCalculatorLaunchV1(launch)) throw new Error("Invalid Docs calculator launch payload.");
  if (launch.kind === "scalar") {
    dispatchScientificCalculatorMathPicked({
      latex: launch.latex,
      sourcePath: launch.source.docPath,
      anchor: launch.source.anchor,
      source: "doc_viewer",
    });
  } else {
    useTheoryRuntimeJobStore.getState().loadRuntimeLaunch(launch);
  }
  useWorkstationLayoutStore.getState().openPanelInActiveGroup("scientific-calculator");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<DocCalculatorLaunchV1>(DOC_CALCULATOR_LAUNCH_EVENT, { detail: launch }));
  }
  return launch;
}
