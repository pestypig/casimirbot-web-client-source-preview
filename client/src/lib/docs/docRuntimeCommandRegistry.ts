import {
  DOC_CALCULATOR_LAUNCH_SCHEMA,
  type DocRuntimeCalculatorLaunchV1,
} from "@shared/contracts/doc-calculator-launch.v1";
import { THEORY_RUNTIME_ENTRYPOINTS } from "@shared/theory/runtime-entrypoints";
import {
  getTheoryRuntimeExecutionClass,
  isTheoryRuntimeExecutableId,
  THEORY_RUNTIME_WORKSTATION_GRAPH_ID,
} from "@shared/theory/runtime-execution-policy";

const executableEntrypoints = THEORY_RUNTIME_ENTRYPOINTS.filter(
  (entrypoint) => entrypoint.command && isTheoryRuntimeExecutableId(entrypoint.runtimeId),
);

export function findRegisteredDocRuntimeCommand(commandText: string) {
  const normalized = commandText.trim();
  if (!normalized || normalized.includes("\n")) return null;
  return executableEntrypoints.find((entrypoint) => entrypoint.command === normalized) ?? null;
}

export function findRegisteredDocRuntimeReference(referenceText: string) {
  const normalized = referenceText.trim();
  if (!normalized || normalized.includes("\n")) return null;
  return executableEntrypoints.find(
    (entrypoint) => entrypoint.runtimeId === normalized || entrypoint.command === normalized,
  ) ?? null;
}

export function buildDocRuntimeCalculatorLaunch(input: {
  commandText: string;
  docPath?: string | null;
  anchor?: string | null;
}): DocRuntimeCalculatorLaunchV1 | null {
  const entrypoint = findRegisteredDocRuntimeReference(input.commandText);
  if (!entrypoint?.command) return null;
  const executionClass = getTheoryRuntimeExecutionClass(entrypoint.runtimeId);
  if (!executionClass) return null;
  return {
    schema: DOC_CALCULATOR_LAUNCH_SCHEMA,
    kind: "runtime",
    source: {
      docPath: input.docPath?.trim() || "docs/unknown.md",
      anchor: input.anchor?.trim() || null,
      label: entrypoint.label,
    },
    runtime: {
      runtimeId: entrypoint.runtimeId,
      label: entrypoint.label,
      description: entrypoint.description,
      command: entrypoint.command,
      args: {},
      requestedScope: executionClass === "long_execution" ? "full" : "quick",
      graphId: THEORY_RUNTIME_WORKSTATION_GRAPH_ID,
      badgeIds: [...entrypoint.ownedBadgeIds],
      outputArtifactGlobs: [...entrypoint.outputArtifactGlobs],
      claimBoundary: { ...entrypoint.claimBoundary, promotionRequires: [...entrypoint.claimBoundary.promotionRequires] },
    },
  };
}
