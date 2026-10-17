import { buildTheoryCalculatorLoadoutV1, type TheoryCalculatorLoadoutV1 } from "@shared/contracts/theory-calculator-loadout.v1";
import { runStarSimRuntimeBadge } from "@shared/theory/starsim-runtime-adapter";
import { runScientificSolve } from "@/lib/scientific-calculator/solver";
import { useScientificCalculatorStore } from "@/store/useScientificCalculatorStore";

export function solveTheoryCalculatorLoadoutNow(
  loadout: TheoryCalculatorLoadoutV1,
  options?: {
    solveScope?: "all_scalar" | "first_scalar" | "active_item" | "all_scalar_and_runtime";
    runRuntime?: boolean;
  },
): TheoryCalculatorLoadoutV1 {
  const scientificState = useScientificCalculatorStore.getState();
  const solveScope = options?.solveScope ?? "all_scalar";
  const shouldRunRuntime = Boolean(options?.runRuntime || solveScope === "all_scalar_and_runtime");
  const solvedItems = loadout.items.map((item) => {
    if (
      shouldRunRuntime &&
      item.kind === "runtime_context" &&
      loadout.objectContext &&
      (item.badgeId === "starsim.runtime.evaluate_fusion_microphysics" ||
        item.badgeId === "starsim.runtime.build_star_map_fusion_graph")
    ) {
      try {
        const receipt = runStarSimRuntimeBadge({
          badgeId: item.badgeId,
          objectContext: loadout.objectContext,
        });
        return {
          ...item,
          resultText:
            item.badgeId === "starsim.runtime.evaluate_fusion_microphysics"
              ? `${receipt.outputSummary.dominantFusionChannel ?? "unknown"} / ${receipt.outputSummary.fusionZoneMode ?? "unknown"}`
              : receipt.outputSummary.qstRole ?? "runtime completed",
          resultKind: "runtime_receipt",
          runtimeReceiptV1: receipt,
          warnings: item.warnings.filter((warning) => !/not solved by the scalar calculator/i.test(warning)),
        };
      } catch (err) {
        return {
          ...item,
          warnings: [...item.warnings, err instanceof Error ? err.message : "StarSim runtime receipt failed"],
        };
      }
    }
    if (item.kind !== "calculator_payload" || !item.solveExpression) return item;
    scientificState.ingestLatex(item.solveExpression, {
      sourcePath: item.sourcePath,
      anchor: item.payloadId,
      source: "workstation_action",
      calculatorSetup: item.setupContext,
      compoundRunId: loadout.loadoutId,
      compoundSubgoalId: item.id,
      targetWorkbench: "theory",
    });
    const result = runScientificSolve(item.solveExpression, true);
    scientificState.setSolveResult(result, {
      actionId: "solve_with_steps",
      source: "workstation_action",
      calculatorSetup: item.setupContext,
      compoundRunId: loadout.loadoutId,
      compoundSubgoalId: item.id,
      targetWorkbench: "theory",
    });
    return {
      ...item,
      resultText: result.result_text,
      resultLatex: result.result_latex ?? null,
      resultKind: result.artifact_v1?.result.kind ?? null,
      confidence: result.artifact_v1?.quality.confidence ?? null,
      fallbackReason: result.artifact_v1?.quality.fallbackReason ?? null,
      calculatorArtifactV1: result.artifact_v1 ?? null,
      runtimeReceiptV1: null,
      warnings: result.ok ? item.warnings : [...item.warnings, result.error ?? "calculator solve failed"],
    };
  });

  const solvedLoadout = buildTheoryCalculatorLoadoutV1({
    loadoutId: loadout.loadoutId,
    graphId: loadout.graphId,
    source: loadout.source,
    mode: loadout.mode,
    targetBadgeIds: loadout.targetBadgeIds,
    objectContext: loadout.objectContext,
    items: solvedItems,
    claimBoundaryNotes: loadout.claimBoundaryNotes,
    generatedAt: loadout.generatedAt,
  });
  scientificState.updateTheoryLoadout(solvedLoadout);
  return solvedLoadout;
}
