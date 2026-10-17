import type { EnergyPipelineState } from "@/hooks/use-energy-pipeline";
import type { QiStats } from "@shared/schema";
import { clamp } from "@/lib/utils";

export interface QiAutoTuneConstraints {
  gapMin_nm: number;
  gapMax_nm: number;
  dutyMin: number;
  dutyMax: number;
  marginFrac: number;
  maxGapStep_nm: number;
  maxDutyStep: number;
}

export interface QiAutoTuneSetpoint {
  currentGap_nm: number;
  currentDuty: number;
  candidateGap_nm: number;
  candidateDuty: number;
  tau_ms: number;
  guardMargin: number;
  targetAvg: number;
  predictedAvg: number;
  predictedMargin: number;
  bound: number;
  avg: number;
  margin: number;
  dwell_ms?: number;
  pulse_ms?: number;
  needsAdjust: boolean;
  saturated: boolean;
  notes: string[];
}

export const DEFAULT_QI_AUTO_CONSTRAINTS: QiAutoTuneConstraints = {
  gapMin_nm: 30,
  gapMax_nm: 360,
  dutyMin: 0.0005,
  dutyMax: 0.15,
  marginFrac: 0.2,
  maxGapStep_nm: 4,
  maxDutyStep: 0.01,
};

const GAP_TOL_NM = 0.25;
const DUTY_TOL = 1e-4;

const safeNumber = (value: unknown, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeConstraints = (
  overrides?: Partial<QiAutoTuneConstraints>,
): QiAutoTuneConstraints => {
  const merged = { ...DEFAULT_QI_AUTO_CONSTRAINTS, ...(overrides ?? {}) };
  merged.gapMin_nm = Math.max(1, merged.gapMin_nm);
  merged.gapMax_nm = Math.max(merged.gapMin_nm, merged.gapMax_nm);
  merged.dutyMin = clamp(merged.dutyMin, 0, 1);
  merged.dutyMax = clamp(merged.dutyMax, merged.dutyMin, 1);
  merged.marginFrac = clamp(merged.marginFrac, 0.01, 0.5);
  merged.maxGapStep_nm = Math.max(0.1, merged.maxGapStep_nm);
  merged.maxDutyStep = clamp(merged.maxDutyStep, 0.001, 0.25);
  return merged;
};

const resolveDuty = (state?: EnergyPipelineState) => {
  const burst = safeNumber(state?.localBurstFrac);
  const duty = safeNumber(state?.dutyCycle);
  if (burst > 0) return burst;
  if (duty > 0) return duty;
  return safeNumber(state?.dutyEffectiveFR, duty);
};

const deriveGuardMargin = (qi: QiStats, constraints: QiAutoTuneConstraints) => {
  const boundMag = Math.abs(safeNumber(qi.bound, -1));
  return Math.max(boundMag * constraints.marginFrac, boundMag * 0.02);
};

/**
 * Predicts a safe Ford–Roman-compliant setpoint that respects actuator limits.
 * - Uses live ρ_avg, τ, and duty/gap telemetry to build a local scaling model.
 * - Prefers duty reduction before pushing the plate stack.
 * - Enforces slew caps so commands stay compatible with the existing pump/gap drivers.
 */
export function solveQiAutoSetpoint(
  state: EnergyPipelineState | undefined,
  options?: Partial<QiAutoTuneConstraints>,
): QiAutoTuneSetpoint | null {
  if (!state || !state.qi) return null;
  const qi = state.qi;
  const constraints = normalizeConstraints(options);

  const gap = safeNumber(state.gap_nm);
  const duty = resolveDuty(state);
  const bound = safeNumber(qi.bound);
  const avg = safeNumber(qi.avg);
  const margin = safeNumber(qi.margin);
  const tau_ms = safeNumber(qi.tau_s_ms);

  if (!(gap > 0) || !(duty > 0) || !Number.isFinite(bound) || !Number.isFinite(avg)) {
    return null;
  }

  const guardMargin = deriveGuardMargin(qi, constraints);
  const targetAvg = bound + guardMargin;
  const needsMargin = margin < guardMargin;

  const notes: string[] = [];
  if (needsMargin) {
    notes.push(
      `Margin ${margin.toFixed(4)} is below guard ${
        guardMargin.toFixed(4)
      }; nudging duty/gap.`,
    );
  } else {
    notes.push(
      `Margin ${margin.toFixed(4)} ≥ guard ${guardMargin.toFixed(4)}; monitoring only.`,
    );
    const dwell_ms = safeNumber(
      state.lightCrossing && typeof state.lightCrossing === "object"
        ? (state.lightCrossing as any).dwell_ms
        : state.dwell_ms ?? state.sectorPeriod_ms,
    );
    const pulse_ms = dwell_ms > 0 ? dwell_ms * duty : undefined;
    return {
      currentGap_nm: gap,
      currentDuty: duty,
      candidateGap_nm: gap,
      candidateDuty: duty,
      tau_ms,
      guardMargin,
      targetAvg,
      predictedAvg: avg,
      predictedMargin: margin,
      bound,
      avg,
      margin,
      dwell_ms: dwell_ms > 0 ? dwell_ms : undefined,
      pulse_ms,
      needsAdjust: false,
      saturated: false,
      notes,
    };
  }

  let candidateDuty = duty;
  let candidateGap = gap;
  let saturated = false;

  const targetMag = Math.abs(targetAvg);
  const baseMag = Math.abs(avg);
  if (baseMag <= 1e-12 || targetMag <= 1e-12) {
    return {
      currentGap_nm: gap,
      currentDuty: duty,
      candidateGap_nm: gap,
      candidateDuty: duty,
      tau_ms,
      guardMargin,
      targetAvg,
      predictedAvg: avg,
      predictedMargin: margin,
      bound,
      avg,
      margin,
      dwell_ms: safeNumber(state.sectorPeriod_ms ?? (state.lightCrossing as any)?.dwell_ms),
      pulse_ms: undefined,
      needsAdjust: needsMargin,
      saturated: true,
      notes: notes.concat("Insufficient telemetry to solve a new setpoint."),
    };
  }

  // Step 1: duty scaling (linear with ρ_avg)
  const dutyRatio = targetMag / baseMag;
  const dutyProposal = clamp(
    duty * dutyRatio,
    constraints.dutyMin,
    constraints.dutyMax,
  );
  const dutyStepLimited = clamp(
    dutyProposal,
    duty - constraints.maxDutyStep,
    duty + constraints.maxDutyStep,
  );
  candidateDuty = dutyStepLimited;

  let predictedAvg = avg;
  if (duty > 1e-9) {
    predictedAvg = avg * (candidateDuty / duty);
  }

  // Step 2: stretch/shrink the gap if duty reduction was insufficient
  if (predictedAvg - bound < guardMargin) {
    const remainingMag = Math.abs(predictedAvg);
    const residualRatio = remainingMag > 0 ? remainingMag / targetMag : 1;
    const rawGap = gap * Math.pow(residualRatio, 0.25);
    const boundedGap = clamp(rawGap, constraints.gapMin_nm, constraints.gapMax_nm);
    candidateGap = clamp(
      boundedGap,
      gap - constraints.maxGapStep_nm,
      gap + constraints.maxGapStep_nm,
    );
    saturated ||= boundedGap !== rawGap || candidateGap !== boundedGap;
    if (candidateGap > 0) {
      const gapScale = Math.pow(gap / candidateGap, 4);
      predictedAvg *= gapScale;
    }
  }

  const predictedMargin = predictedAvg - bound;
  const needsAdjust =
    needsMargin ||
    Math.abs(candidateGap - gap) > GAP_TOL_NM ||
    Math.abs(candidateDuty - duty) > DUTY_TOL;

  const dwell_ms = safeNumber(
    state.lightCrossing && typeof state.lightCrossing === "object"
      ? (state.lightCrossing as any).dwell_ms
      : state.dwell_ms ?? state.sectorPeriod_ms,
  );
  const pulse_ms = dwell_ms > 0 ? dwell_ms * candidateDuty : undefined;

  if (candidateGap === constraints.gapMax_nm || candidateDuty === constraints.dutyMin) {
    saturated = true;
  }

  if (predictedMargin < guardMargin - 1e-5) {
    notes.push(
      "Limits reached before achieving requested guard band; consider widening actuator bounds.",
    );
    saturated = true;
  }

  return {
    currentGap_nm: gap,
    currentDuty: duty,
    candidateGap_nm: candidateGap,
    candidateDuty,
    tau_ms,
    guardMargin,
    targetAvg,
    predictedAvg,
    predictedMargin,
    bound,
    avg,
    margin,
    dwell_ms: dwell_ms > 0 ? dwell_ms : undefined,
    pulse_ms,
    needsAdjust,
    saturated,
    notes,
  };
}
