import type { CivilizationProvisioningLensV1 } from "@shared/civilization-provisioning-network";
import type {
  CivilizationNationParameterScope,
  CivilizationNationStateVector,
} from "@/data/civilizationNationStateVectors";

export type CivilizationLensOption = {
  id: CivilizationProvisioningLensV1;
  label: string;
  sourceScope: CivilizationNationParameterScope | null;
  direction: "capacity" | "pressure" | "missing_evidence";
};

export type CivilizationLensReading = {
  lens: CivilizationProvisioningLensV1;
  label: string;
  value: number | null;
  sourceScope: CivilizationNationParameterScope | null;
  evidenceState: "bound" | "unbound" | "missing";
  missingCount: number;
};

export const CIVILIZATION_LENS_OPTIONS: readonly CivilizationLensOption[] = [
  { id: "need_coverage", label: "Need coverage", sourceScope: null, direction: "capacity" },
  { id: "resource_flow", label: "Resource flow", sourceScope: "material_base", direction: "capacity" },
  { id: "transport_energy", label: "Transport energy", sourceScope: null, direction: "pressure" },
  { id: "dependency_resilience", label: "Dependency resilience", sourceScope: "security_exposure", direction: "pressure" },
  { id: "collective_investment", label: "Collective investment", sourceScope: null, direction: "capacity" },
  { id: "role_delegation", label: "Role delegation", sourceScope: null, direction: "capacity" },
  { id: "research_cooperation", label: "Research cooperation", sourceScope: null, direction: "capacity" },
  { id: "rights_and_review", label: "Rights and review", sourceScope: null, direction: "capacity" },
  { id: "missing_evidence", label: "Missing evidence", sourceScope: null, direction: "missing_evidence" },
] as const;

export const DEFAULT_CIVILIZATION_LENS: CivilizationProvisioningLensV1 = "resource_flow";

export function getCivilizationLensOption(
  lens: CivilizationProvisioningLensV1,
): CivilizationLensOption {
  return CIVILIZATION_LENS_OPTIONS.find((option) => option.id === lens) ?? CIVILIZATION_LENS_OPTIONS[0];
}

export function readCivilizationLens(
  vector: CivilizationNationStateVector,
  lens: CivilizationProvisioningLensV1,
): CivilizationLensReading {
  const option = getCivilizationLensOption(lens);
  const missingCount = vector.missingObservations.length;
  if (option.direction === "missing_evidence") {
    return {
      lens,
      label: option.label,
      value: null,
      sourceScope: null,
      evidenceState: missingCount > 0 ? "missing" : "bound",
      missingCount,
    };
  }
  if (!option.sourceScope) {
    return {
      lens,
      label: option.label,
      value: null,
      sourceScope: null,
      evidenceState: "unbound",
      missingCount,
    };
  }
  const value = vector.parameters[option.sourceScope];
  return {
    lens,
    label: option.label,
    value,
    sourceScope: option.sourceScope,
    evidenceState: value === null ? "missing" : "bound",
    missingCount,
  };
}

export function civilizationLensColor(reading: CivilizationLensReading): string {
  const option = getCivilizationLensOption(reading.lens);
  if (option.direction === "missing_evidence") {
    if (reading.missingCount >= 3) return "#ef4444";
    if (reading.missingCount >= 1) return "#f59e0b";
    return "#22c55e";
  }
  if (reading.value === null) return "#64748b";
  const pressure = option.direction === "pressure";
  if (pressure) {
    if (reading.value >= 0.7) return "#ef4444";
    if (reading.value >= 0.45) return "#f97316";
    if (reading.value >= 0.25) return "#eab308";
    return "#22c55e";
  }
  if (reading.value >= 0.7) return "#22c55e";
  if (reading.value >= 0.45) return "#eab308";
  if (reading.value >= 0.25) return "#f97316";
  return "#ef4444";
}

export function formatCivilizationLensReading(reading: CivilizationLensReading): string {
  if (reading.lens === "missing_evidence") return `${reading.missingCount} missing`;
  if (reading.value === null) return reading.evidenceState === "unbound" ? "unbound" : "missing";
  return reading.value.toFixed(2);
}
