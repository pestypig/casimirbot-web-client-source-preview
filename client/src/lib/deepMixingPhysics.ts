// client/src/lib/deepMixingPhysics.ts
/**
 * Reduced-order ledgers for the controlled stellar composition transport
 * research program. These helpers are diagnostic scale checks, not a stellar
 * evolution solve or an intervention-feasibility result.
 */

export const SECONDS_PER_JULIAN_YEAR = 31_557_600;
export const R_SUN_METERS = 6.957e8;
export const R_TACH_METERS = 0.7 * R_SUN_METERS;
export const RHO_TACH_KG_M3 = 200;

/** Hydrogen-burning mass-processing reference used by the legacy toy model. */
export const SOLAR_HYDROGEN_BURN_REFERENCE_KG_S = 6.0e11;

export type DeepMixingLedgerInput = {
  epsilon: number;
  areaFraction: number;
  transportEfficiency: number;
  sourceHydrogenFraction: number;
  receiverHydrogenFraction: number;
  elapsedSeconds: number;
  envelopeHydrogenMassKg: number;
  hydrogenBurnReferenceKgS?: number;
  tachoclineRadiusM?: number;
  tachoclineDensityKgM3?: number;
};

export type DeepMixingLedgerResult = {
  maturity: "reduced_order_diagnostic";
  grossCirculationKgS: number;
  netHydrogenDeliveryKgS: number;
  compositionContrast: number;
  accessibleHydrogenMassKg: number;
  accessibleFuelFractionAlpha: number;
  radialSetpointMps: number;
  reservoirExceeded: boolean;
};

export type OneZoneAuditInput = {
  epsilon: number;
  targetExtensionMyr: number;
  coreHydrogenFraction: number;
  sourceHydrogenFraction: number;
  coreMassKg: number;
  hydrogenBurnReferenceKgS: number;
  areaFraction: number;
  transportEfficiency: number;
};

export type OneZoneAuditResult = {
  maturity: "reduced_order_diagnostic";
  grossCirculationKgS: number;
  netHydrogenDeliveryKgS: number;
  burnOffsetFraction: number;
  noMixDepletionMyr: number;
  mixedDepletionMyr: number;
  extensionMyr: number;
  requiredEpsilonForTarget: number;
  requiredGrossCirculationKgS: number;
  requiredRadialSetpointMps: number;
};

export const DEEP_MIXING_G0_AUDIT_INPUTS: Readonly<OneZoneAuditInput> = {
  epsilon: 0.01,
  targetExtensionMyr: 600,
  coreHydrogenFraction: 0.34,
  sourceHydrogenFraction: 0.7,
  coreMassKg: 3.5e29,
  hydrogenBurnReferenceKgS: SOLAR_HYDROGEN_BURN_REFERENCE_KG_S,
  areaFraction: 0.1,
  transportEfficiency: 1,
};

function requireFinite(name: string, value: number): number {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  return value;
}

function requirePositive(name: string, value: number): number {
  requireFinite(name, value);
  if (value <= 0) throw new RangeError(`${name} must be greater than zero`);
  return value;
}

function requireFraction(name: string, value: number): number {
  requireFinite(name, value);
  if (value < 0 || value > 1) throw new RangeError(`${name} must be in [0, 1]`);
  return value;
}

/**
 * Solve gross circulation closure for radial speed.
 *
 * dotM_circ = 4 pi r^2 rho f_area v_r
 */
export function radialSetpointForGrossCirculation(
  grossCirculationKgS: number,
  areaFraction = 0.1,
  tachoclineRadiusM = R_TACH_METERS,
  tachoclineDensityKgM3 = RHO_TACH_KG_M3,
): number {
  requireFinite("grossCirculationKgS", grossCirculationKgS);
  if (grossCirculationKgS < 0) throw new RangeError("grossCirculationKgS must be nonnegative");
  requireFraction("areaFraction", areaFraction);
  if (areaFraction === 0) throw new RangeError("areaFraction must be greater than zero");
  requirePositive("tachoclineRadiusM", tachoclineRadiusM);
  requirePositive("tachoclineDensityKgM3", tachoclineDensityKgM3);
  return grossCirculationKgS /
    (4 * Math.PI * tachoclineRadiusM ** 2 * tachoclineDensityKgM3 * areaFraction);
}

/**
 * Legacy UI migration wrapper. Epsilon remains a requested circulation
 * hypothesis; it is not derived from, and does not predict, a lifetime gain.
 */
export function vrSetpoint(epsilon: number, areaFraction = 0.1): number {
  requireFraction("epsilon", epsilon);
  return radialSetpointForGrossCirculation(
    epsilon * SOLAR_HYDROGEN_BURN_REFERENCE_KG_S,
    areaFraction,
  );
}

export function grossCirculationFromVr(vr: number, areaFraction = 0.1): number {
  requireFinite("vr", vr);
  if (vr < 0) throw new RangeError("vr must be nonnegative");
  requireFraction("areaFraction", areaFraction);
  if (areaFraction === 0) throw new RangeError("areaFraction must be greater than zero");
  return 4 * Math.PI * R_TACH_METERS ** 2 * RHO_TACH_KG_M3 * areaFraction * vr;
}

/** @deprecated Use grossCirculationFromVr; this is gross circulation, not net H delivery. */
export const dotMmixFromVr = grossCirculationFromVr;

export function calculateDeepMixingLedger(input: DeepMixingLedgerInput): DeepMixingLedgerResult {
  const epsilon = requireFraction("epsilon", input.epsilon);
  const areaFraction = requireFraction("areaFraction", input.areaFraction);
  if (areaFraction === 0) throw new RangeError("areaFraction must be greater than zero");
  const transportEfficiency = requireFraction("transportEfficiency", input.transportEfficiency);
  const sourceHydrogenFraction = requireFraction("sourceHydrogenFraction", input.sourceHydrogenFraction);
  const receiverHydrogenFraction = requireFraction("receiverHydrogenFraction", input.receiverHydrogenFraction);
  const elapsedSeconds = requireFinite("elapsedSeconds", input.elapsedSeconds);
  if (elapsedSeconds < 0) throw new RangeError("elapsedSeconds must be nonnegative");
  const envelopeHydrogenMassKg = requirePositive("envelopeHydrogenMassKg", input.envelopeHydrogenMassKg);
  const burnReference = requirePositive(
    "hydrogenBurnReferenceKgS",
    input.hydrogenBurnReferenceKgS ?? SOLAR_HYDROGEN_BURN_REFERENCE_KG_S,
  );
  const compositionContrast = sourceHydrogenFraction - receiverHydrogenFraction;
  if (compositionContrast < 0) {
    throw new RangeError("sourceHydrogenFraction must be at least receiverHydrogenFraction");
  }

  const grossCirculationKgS = epsilon * burnReference;
  const netHydrogenDeliveryKgS =
    transportEfficiency * grossCirculationKgS * compositionContrast;
  const accessibleHydrogenMassKg = netHydrogenDeliveryKgS * elapsedSeconds;
  const accessibleFuelFractionAlpha = accessibleHydrogenMassKg / envelopeHydrogenMassKg;

  return {
    maturity: "reduced_order_diagnostic",
    grossCirculationKgS,
    netHydrogenDeliveryKgS,
    compositionContrast,
    accessibleHydrogenMassKg,
    accessibleFuelFractionAlpha,
    radialSetpointMps: radialSetpointForGrossCirculation(
      grossCirculationKgS,
      areaFraction,
      input.tachoclineRadiusM,
      input.tachoclineDensityKgM3,
    ),
    reservoirExceeded: accessibleHydrogenMassKg > envelopeHydrogenMassKg,
  };
}

export function runOneZoneAudit(input: OneZoneAuditInput): OneZoneAuditResult {
  const epsilon = requireFraction("epsilon", input.epsilon);
  const targetExtensionMyr = requirePositive("targetExtensionMyr", input.targetExtensionMyr);
  const coreHydrogenFraction = requireFraction("coreHydrogenFraction", input.coreHydrogenFraction);
  const sourceHydrogenFraction = requireFraction("sourceHydrogenFraction", input.sourceHydrogenFraction);
  if (sourceHydrogenFraction < coreHydrogenFraction) {
    throw new RangeError("sourceHydrogenFraction must be at least coreHydrogenFraction");
  }
  const coreMassKg = requirePositive("coreMassKg", input.coreMassKg);
  const burnReference = requirePositive("hydrogenBurnReferenceKgS", input.hydrogenBurnReferenceKgS);
  const transportEfficiency = requireFraction("transportEfficiency", input.transportEfficiency);
  const compositionContrast = sourceHydrogenFraction - coreHydrogenFraction;
  if (compositionContrast === 0 || transportEfficiency === 0) {
    throw new RangeError("one-zone target backsolve requires positive composition contrast and transport efficiency");
  }

  const grossCirculationKgS = epsilon * burnReference;
  const netHydrogenDeliveryKgS =
    grossCirculationKgS * compositionContrast * transportEfficiency;
  const netDepletionKgS = burnReference - netHydrogenDeliveryKgS;
  if (netDepletionKgS <= 0) {
    throw new RangeError("one-zone model has nonpositive net depletion and no finite depletion time");
  }

  const hydrogenInventoryKg = coreHydrogenFraction * coreMassKg;
  const secondsPerMyr = SECONDS_PER_JULIAN_YEAR * 1e6;
  const noMixDepletionMyr = hydrogenInventoryKg / burnReference / secondsPerMyr;
  const mixedDepletionMyr = hydrogenInventoryKg / netDepletionKgS / secondsPerMyr;
  const targetMixedMyr = noMixDepletionMyr + targetExtensionMyr;
  const requiredOffsetFraction = 1 - noMixDepletionMyr / targetMixedMyr;
  const requiredEpsilonForTarget =
    requiredOffsetFraction / (compositionContrast * transportEfficiency);
  const requiredGrossCirculationKgS = requiredEpsilonForTarget * burnReference;

  return {
    maturity: "reduced_order_diagnostic",
    grossCirculationKgS,
    netHydrogenDeliveryKgS,
    burnOffsetFraction: netHydrogenDeliveryKgS / burnReference,
    noMixDepletionMyr,
    mixedDepletionMyr,
    extensionMyr: mixedDepletionMyr - noMixDepletionMyr,
    requiredEpsilonForTarget,
    requiredGrossCirculationKgS,
    requiredRadialSetpointMps: radialSetpointForGrossCirculation(
      requiredGrossCirculationKgS,
      input.areaFraction,
    ),
  };
}
