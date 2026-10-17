// client/src/lib/warp-proof-math.ts

import { kappa_drive } from "@shared/curvature-proxy";

// Core physical constants
const PI = Math.PI;
const HBAR_C = 3.16152677e-26; // ħc [J·m] (matches pipeline)
const EPSILON_0 = 8.8541878128e-12; // F/m
const NM_TO_M = 1e-9;
const PM_TO_M = 1e-12;

// Planck + warp-pocket guard (matches guardGammaVdB)
const PLANCK_LENGTH_M = 1.616255e-35; // m
const PLANCK_SAFETY_MULT = 1e6; // keep pocket >> l_P
const POCKET_WALL_FLOOR_FRAC = 0.01; // pocket >= 1% of wall thickness
const DEFAULT_WALL_THICKNESS_M = 299_792_458 / 15e9; // c/(15 GHz) ≈ 0.02 m

// Mechanical defaults (match mechanicalFeasibility in server)
const MECH_ELASTIC_MODULUS_PA = 170e9; // silicon-ish
const MECH_POISSON = 0.27;
const MECH_DEFLECTION_COEFF = 0.0138; // clamped square plate
const MECH_ROUGHNESS_RMS_NM = 0.2;
const MECH_ROUGHNESS_SIGMA = 5; // 5σ separation guard
const MECH_PATCH_V_RMS = 0.05; // 50 mV patch noise

export type GammaVdBGuardInput = {
  Lx_m: number;
  Ly_m: number;
  Lz_m: number;
  wallThickness_m?: number;
  gammaRequested: number;
};

export type GammaVdBGuardResult = {
  limit: number;
  gammaClamped: number;
  pocketRadius_m: number;
  pocketThickness_m: number;
  planckMargin: number;
  admissible: boolean;
  pocketFloor_m: number;
  minRadius_m: number;
};

export function computeGammaVdBGuard(
  params: GammaVdBGuardInput,
): GammaVdBGuardResult {
  const halfAxes = [
    Math.max(1e-9, params.Lx_m / 2),
    Math.max(1e-9, params.Ly_m / 2),
    Math.max(1e-9, params.Lz_m / 2),
  ];
  const minRadius = Math.min(...halfAxes);

  const wall = Math.max(
    PLANCK_LENGTH_M,
    Number.isFinite(params.wallThickness_m as number)
      ? (params.wallThickness_m as number)
      : DEFAULT_WALL_THICKNESS_M,
  );

  const pocketFloor = Math.max(
    wall * POCKET_WALL_FLOOR_FRAC,
    PLANCK_LENGTH_M * PLANCK_SAFETY_MULT,
  );

  const limitWall = minRadius / pocketFloor;
  const limitPlanck = minRadius / (PLANCK_LENGTH_M * PLANCK_SAFETY_MULT);
  const limit = Math.max(1, Math.min(limitWall, limitPlanck, 1e16));

  const gammaClamped = Math.max(0, Math.min(params.gammaRequested, limit));
  const pocketRadius_m = minRadius / Math.max(1, gammaClamped);
  const pocketThickness_m = wall / Math.max(1, gammaClamped);
  const planckMargin = pocketRadius_m / PLANCK_LENGTH_M;
  const admissible = params.gammaRequested <= limit;

  return {
    limit,
    gammaClamped,
    pocketRadius_m,
    pocketThickness_m,
    planckMargin,
    admissible,
    pocketFloor_m: pocketFloor,
    minRadius_m: minRadius,
  };
}

// ---- Mechanical Casimir tile guard -----------------------------------------

export type MechanicalGuardInput = {
  tileArea_cm2: number;
  tileThickness_m: number;
  gap_nm: number;
  strokeAmplitude_pm: number;
  roughnessGuard_nm: number;
};

export type MechanicalGuardResult = {
  casimirPressure_Pa: number;
  electrostaticPressure_Pa: number;
  totalLoad_Pa: number;
  restoringPressure_Pa: number;
  margin_Pa: number;
  feasible: boolean;
  strokeFeasible: boolean;
  maxStroke_pm: number;
  clearance_m: number;
};

export function computeMechanicalGuard(
  input: MechanicalGuardInput,
): MechanicalGuardResult {
  const area_m2 = Math.max(1e-9, input.tileArea_cm2 * 1e-4);
  const span_m = Math.sqrt(area_m2); // equivalent square side

  const gap_m = Math.max(1e-12, input.gap_nm * NM_TO_M);
  const stroke_m = Math.max(0, input.strokeAmplitude_pm * PM_TO_M);

  // This sits on top of RMS*σ roughness separation.
  const roughnessGuard_nm = Math.max(
    input.roughnessGuard_nm,
    MECH_ROUGHNESS_RMS_NM * MECH_ROUGHNESS_SIGMA,
  );
  const roughnessGuard_m = roughnessGuard_nm * NM_TO_M;

  // Plate stiffness
  const thickness_m = Math.max(1e-6, input.tileThickness_m);
  const D =
    (MECH_ELASTIC_MODULUS_PA * Math.pow(thickness_m, 3)) /
    (12 * (1 - MECH_POISSON * MECH_POISSON));

  // Loads
  const casimirPressure_Pa =
    (PI * PI * HBAR_C) / (240 * Math.pow(gap_m, 4));
  const electrostaticPressure_Pa =
    0.5 * EPSILON_0 * Math.pow(MECH_PATCH_V_RMS / gap_m, 2);
  const totalLoad_Pa = casimirPressure_Pa + electrostaticPressure_Pa;

  // Restoring pressure from elastic plate, given remaining clearance
  const clearance_m = Math.max(0, gap_m - roughnessGuard_m - stroke_m);
  const restoringPressure_Pa =
    clearance_m > 0 && D > 0
      ? (D * clearance_m) /
        (MECH_DEFLECTION_COEFF * Math.pow(span_m, 4))
      : 0;

  const margin_Pa = restoringPressure_Pa - totalLoad_Pa;

  // Max stroke budget before collapse:
  const deflectionForLoad_m =
    (totalLoad_Pa * MECH_DEFLECTION_COEFF * Math.pow(span_m, 4)) /
    Math.max(D, 1e-30);
  const strokeBudget_m = Math.max(
    0,
    gap_m - roughnessGuard_m - deflectionForLoad_m,
  );
  const maxStroke_pm = strokeBudget_m * 1e12;
  const strokeFeasible = input.strokeAmplitude_pm <= maxStroke_pm + 1e-9;

  const feasible = clearance_m > 0 && margin_Pa > 0;

  return {
    casimirPressure_Pa,
    electrostaticPressure_Pa,
    totalLoad_Pa,
    restoringPressure_Pa,
    margin_Pa,
    feasible,
    strokeFeasible,
    maxStroke_pm,
    clearance_m,
  };
}

// Optional: Phoenix curvature proxy (kappa_drive) for display only
// kappa_drive ~ (8*pi*G/c^5) * (P/A) * d_eff * G_geom

export function kappaDriveProxy(params: {
  power_W: number;
  area_m2: number;
  d_eff: number;
  gammaGeo: number;
}): number {
  const { power_W, area_m2, d_eff, gammaGeo } = params;
  const PbyA = power_W / Math.max(1e-9, area_m2);
  const geomGain = Math.max(1e-12, gammaGeo);
  return kappa_drive(PbyA, d_eff, geomGain);
}

// Small helpers
export function fmtSci(v: number | null | undefined, digits = 3): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs === 0) return "0";
  if (abs >= 1e-2 && abs < 1e4) return v.toPrecision(digits);
  return v.toExponential(digits - 1);
}
