import type { CivilizationBoundsRoadmapV1 } from "@shared/civilization-bounds-roadmap";
import {
  buildNeedleCivilizationBoundsScenario,
  NEEDLE_CIVILIZATION_BOUNDS_SCENARIO_ID,
} from "./civilizationBoundsNeedleScenario";

export const DEFAULT_CIVILIZATION_BOUNDS_SCENARIO_ID =
  NEEDLE_CIVILIZATION_BOUNDS_SCENARIO_ID;

export function buildCivilizationBoundsScenario(
  scenarioId: string = DEFAULT_CIVILIZATION_BOUNDS_SCENARIO_ID,
): CivilizationBoundsRoadmapV1 {
  if (scenarioId === NEEDLE_CIVILIZATION_BOUNDS_SCENARIO_ID) {
    return buildNeedleCivilizationBoundsScenario();
  }
  return buildNeedleCivilizationBoundsScenario();
}
