import { useEffect, useMemo, useRef } from "react";
import { useEnergyPipeline, type EnergyPipelineState } from "@/hooks/use-energy-pipeline";
import { useDriveSyncStore } from "@/store/useDriveSyncStore";
import { publishVacuumContract } from "@/lib/vacuum-contract";
import {
  resolvePipelineBubbleRadiusM,
  resolvePipelineHullReferenceRadiusM,
} from "@/lib/pipeline-geometry";
import type {
  VacuumContract,
  VacuumContractSpec,
  VacuumContractExports,
  VacuumContractField,
  VacuumContractStatus,
  SweepPoint,
  SweepRuntime,
} from "@shared/schema";

const C = 299_792_458; // speed of light (m/s)
const FIELDS = ["geometry", "boundary", "thermal", "loss", "drive", "readout"] as const satisfies readonly VacuumContractField[];

const round = (value: unknown, precision = 6): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const factor = Math.pow(10, precision);
  return Math.round(num * factor) / factor;
};

const sanitizeString = (value: unknown, fallback?: string): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return fallback ?? null;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

type EnergyPipelineStateExtras = {
  env?: {
    temperature_K?: number | null;
    T_K?: number | null;
    ambient_K?: number | null;
  };
  curvatureRadius_m?: number | null;
  boundaryMaterial?: string | null;
  boundaryModel?: string | null;
  surfacePrep?: string | null;
  patchMap?: string | null;
  patchMapId?: string | null;
  patchProfileId?: string | null;
  material?: string | null;
  kappaFloor_MHz?: number | null;
};

type ExtendedEnergyState = EnergyPipelineState & Partial<EnergyPipelineStateExtras>;
type SweepPointExtras = SweepPoint & {
  noiseTemp_K?: number | null;
};
type SweepRuntimeExtras = SweepRuntime & {
  last?: SweepPointExtras | null;
  top?: SweepPointExtras[] | null;
};

const stableStringify = (input: unknown): string => {
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map((item) => normalize(item));
    }
    if (isPlainObject(value)) {
      const entries = Object.entries(value) as Array<[string, unknown]>;
      const normalizedEntries = entries
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, val]) => [key, normalize(val)]);
      return normalizedEntries.reduce<Record<string, unknown>>((acc, entry) => {
        const [key, val] = entry as [string, unknown];
        acc[key] = val;
        return acc;
      }, {});
    }
    if (typeof value === "number") {
      return round(value);
    }
    if (value === undefined) {
      return null;
    }
    return value;
  };
  return JSON.stringify(normalize(input));
};

const diffSpec = (previous: VacuumContractSpec | null, next: VacuumContractSpec): VacuumContractField[] => {
  if (!previous) return [];
  const changed: VacuumContractField[] = [];
  for (const field of FIELDS) {
    const key = field as keyof VacuumContractSpec;
    const prevValue = previous[key];
    const nextValue = next[key];
    if (stableStringify(prevValue) !== stableStringify(nextValue)) {
      changed.push(field);
    }
  }
  return changed;
};

const classifyStatus = (value: number | null, amber: number, red: number): VacuumContractStatus => {
  if (!Number.isFinite(value ?? NaN)) return "amber";
  if ((value ?? 0) >= red) return "red";
  if ((value ?? 0) >= amber) return "amber";
  return "green";
};

const hasMissingCoreFields = (spec: VacuumContractSpec): boolean => {
  const finite = (val: number | null) => Number.isFinite(val ?? NaN);
  if (!finite(spec.geometry.gap_nm)) return true;
  if (!spec.boundary.material) return true;
  if (!finite(spec.thermal.cavity_K)) return true;
  if (!finite(spec.loss.qCavity)) return true;
  if (!finite(spec.drive.modulationFreq_GHz)) return true;
  if (!finite(spec.readout.coupling_zeta)) return true;
  return false;
};

const buildSpec = (state: EnergyPipelineState, pumpPhaseDeg: number | null): VacuumContractSpec => {
  const extended = state as ExtendedEnergyState;
  const sweepRuntime = state.sweep as (SweepRuntimeExtras | null | undefined);
  const sweepLast = sweepRuntime?.last ?? null;
  const sectorsConcurrentRaw = Number(
    state.sectorsConcurrent ?? state.sectorStrobing ?? state.concurrentSectors ?? state.activeSectors,
  );
  const sectorsTotalRaw = Number(state.sectorsTotal ?? state.sectorCount ?? state.tiles?.total);
  const localBurstRaw = Number(state.localBurstFrac ?? state.dutyBurst);
  const sectorDutyRaw =
    Number.isFinite(localBurstRaw) &&
    Number.isFinite(sectorsConcurrentRaw) &&
    Number.isFinite(sectorsTotalRaw) &&
    sectorsTotalRaw > 0
      ? localBurstRaw * (sectorsConcurrentRaw / sectorsTotalRaw)
      : null;

  const materialFallback = "Nb3Sn (superconducting)";
  const modelFallback = "Drude-superconducting";
  const surfaceFallback = "electropolished <=0.4 nm";

  const cavityK = round(state.temperature_K, 2);
  const env = extended.env;
  const environmentK = round(env?.temperature_K ?? env?.T_K ?? env?.ambient_K, 2);
  const thermalGradient =
    cavityK != null && environmentK != null ? round(cavityK - environmentK, 2) : null;

  const modulationDepthPct = sweepLast?.m != null ? round(sweepLast.m * 100, 3) : null;
  const detune = round(sweepLast?.detune_MHz, 3);
  const dutyRaw = (
    state.dutyCycle ??
    state.dutyShip ??
    state.dutyEffectiveFR ??
    state.dutyEffective_FR ??
    state.dutyFR ??
    state.dutyBurst ??
    state.dutyEff ??
    state.dutyGate ??
    state.dutyFR_slice ??
    state.dutyFR_ship ??
    null
  );
  const dutyCycle = round(dutyRaw, 6);

  const pumpPhase = round(pumpPhaseDeg ?? state.pumpPhase_deg ?? null, 3);
  const modulationFreq = round(state.modulationFreq_GHz, 6);
  const zetaSource = state.zeta ?? state.deltaAOverA ?? null;
  const hullReferenceRadiusM = round(resolvePipelineHullReferenceRadiusM(state), 3);
  const bubbleRadiusM = round(resolvePipelineBubbleRadiusM(state), 3);

  const driveLawParts: string[] = ["sector-strobe"];
  if (Number.isFinite(sectorsConcurrentRaw) && Number.isFinite(sectorsTotalRaw) && sectorsTotalRaw > 0) {
    driveLawParts.push(`A-${Math.round(sectorsConcurrentRaw)}/${Math.round(sectorsTotalRaw)}`);
  }
  if (modulationFreq != null) {
    driveLawParts.push(`@ ${modulationFreq.toFixed(3)} GHz`);
  }
  const driveLaw = driveLawParts.join(" ");

  return {
    geometry: {
      gap_nm: round(state.gap_nm, 3),
      tileArea_cm2: round(state.tileArea_cm2, 3),
      hullReferenceRadius_m: hullReferenceRadiusM,
      bubbleRadius_m: bubbleRadiusM,
      sectorCount: round(sectorsTotalRaw, 0),
      sectorsConcurrent: round(sectorsConcurrentRaw, 0),
      curvatureRadius_m: round(extended.curvatureRadius_m, 3),
    },
    boundary: {
      material: sanitizeString(extended.boundaryMaterial ?? extended.material, materialFallback),
      model: sanitizeString(extended.boundaryModel, modelFallback),
      surface: sanitizeString(extended.surfacePrep, surfaceFallback),
      patchMap: sanitizeString(extended.patchMap ?? extended.patchMapId ?? extended.patchProfileId),
    },
    thermal: {
      cavity_K: cavityK,
      environment_K: environmentK,
      gradient_K: thermalGradient,
    },
    loss: {
      qCavity: round(state.qCavity, 0),
      qMechanical: round(state.qMechanical, 0),
      zeta: round(zetaSource, 3),
      qSpoiling: round(state.qSpoilingFactor ?? state.deltaAOverA ?? null, 3),
      kappaFloor_MHz: round(extended.kappaFloor_MHz, 3),
    },
    drive: {
      modulationFreq_GHz: modulationFreq,
      modulationDepth_pct: modulationDepthPct,
      detune_MHz: detune,
      dutyCycle,
      sectorDuty: round(sectorDutyRaw, 6),
      pumpPhase_deg: pumpPhase,
      driveLaw,
    },
    readout: {
      coupling_zeta: round(zetaSource, 3),
      amplifierNoiseTemp_K: round(sweepLast?.noiseTemp_K ?? null, 2),
      effectiveBandwidth_MHz: round(sweepLast?.kappaEff_MHz ?? sweepLast?.kappa_MHz, 3),
    },
  };
};
const buildExports = (state: EnergyPipelineState, spec: VacuumContractSpec): VacuumContractExports => {
  const gapNm = spec.geometry.gap_nm;
  const gap_m = typeof gapNm === "number" ? gapNm * 1e-9 : null;
  const modeDensity =
    gap_m != null && gap_m > 0 ? round((2 * gap_m * 1e9) / C, 6) : null; // modes per GHz for parallel plates

  const sweepRuntime = state.sweep as (SweepRuntimeExtras | null | undefined);
  const sweepLast = sweepRuntime?.last ?? null;
  const sweepTop = Array.isArray(sweepRuntime?.top) && sweepRuntime.top.length ? sweepRuntime.top[0] : null;

  const effectiveTemp = round(sweepLast?.noiseTemp_K ?? state.temperature_K, 2);
  const kappaEff = round(
    sweepLast?.kappaEff_MHz ??
      sweepLast?.kappa_MHz ??
      sweepTop?.kappaEff_MHz ??
      sweepTop?.kappa_MHz,
    3,
  );
  const dceGain = round(sweepTop?.G ?? sweepLast?.G, 3);
  const pumpRatio = round(sweepLast?.pumpRatio ?? sweepTop?.pumpRatio, 3);
  const zetaVal = round(state.zeta ?? state.deltaAOverA ?? null, 3);
  const dutyRaw = (
    state.dutyCycle ??
    state.dutyEffectiveFR ??
    state.dutyEffective_FR ??
    state.dutyShip ??
    state.dutyFR ??
    state.dutyBurst ??
    state.dutyEff ??
    state.dutyGate ??
    state.dutyFR_slice ??
    state.dutyFR_ship ??
    null
  );
  const dutyVal = round(dutyRaw, 6);

  return {
    modeDensity_perGHz: modeDensity,
    effectiveTemp_K: effectiveTemp,
    kappaEff_MHz: kappaEff,
    dceGain_dB: dceGain,
    pumpRatio,
    qiGuards: {
      // Allow slight headroom above unity so FR-baseline (~0.84) scenarios do not trip red
      // while still flagging clearly supercritical coupling.
      zeta: { value: zetaVal, status: classifyStatus(zetaVal, 1.05, 1.25) },
      duty: { value: dutyVal, status: classifyStatus(dutyVal, 0.2, 0.4) },
    },
  };
};
const computeFingerprint = (spec: VacuumContractSpec, exportsData: VacuumContractExports): string => {
  return stableStringify({ spec, exports: exportsData });
};

const computeStatus = (
  spec: VacuumContractSpec,
  exportsData: VacuumContractExports,
  changed: VacuumContractField[],
): VacuumContractStatus => {
  if (hasMissingCoreFields(spec)) {
    return "red";
  }
  const guardStatuses = [
    exportsData.qiGuards?.zeta.status,
    exportsData.qiGuards?.duty.status,
  ].filter((status): status is VacuumContractStatus => Boolean(status));

  if (guardStatuses.includes("red")) return "red";
  if (changed.length > 0 || guardStatuses.includes("amber")) return "amber";
  return "green";
};

type UseVacuumContractOptions = {
  id?: string;
  label?: string;
  autoPublish?: boolean;
};

export function useVacuumContract(options?: UseVacuumContractOptions) {
  const { data } = useEnergyPipeline();
  const pumpPhaseDeg = useDriveSyncStore((state) => state.pumpPhaseDeg);
  const previous = useRef<{ spec: VacuumContractSpec; fingerprint: string; updatedAt: number } | null>(null);
  const lastPublished = useRef<string | null>(null);

  const contract = useMemo(() => {
    const state = data as EnergyPipelineState | undefined;
    if (!state) return null;

    const spec = buildSpec(state, pumpPhaseDeg ?? null);
    const exportsData = buildExports(state, spec);
    const fingerprint = computeFingerprint(spec, exportsData);
    const prev = previous.current;
    const prevSpec = prev?.spec ?? null;
    const changed = diffSpec(prevSpec, spec);
    const status = computeStatus(spec, exportsData, changed);
    const sameFingerprint = prev?.fingerprint === fingerprint;
    const updatedAt = sameFingerprint ? prev.updatedAt : Date.now();

    const id = options?.id ?? "helix-core:vacuum";
    const label = options?.label ?? "Vacuum Stack";

    const contract: VacuumContract = {
      id,
      label,
      spec,
      exports: exportsData,
      status,
      fingerprint,
      updatedAt,
      changed,
      rule:
        "Changing geometry, boundary, thermal, loss, drive, or readout assumptions invalidates the vacuum contract.",
    };
    return contract;
  }, [data, pumpPhaseDeg, options?.id, options?.label]);

  useEffect(() => {
    if (!contract) return;
    previous.current = {
      spec: contract.spec,
      fingerprint: contract.fingerprint,
      updatedAt: contract.updatedAt,
    };
  }, [contract?.fingerprint, contract?.spec]);

  useEffect(() => {
    if (!contract) return;
    if (options?.autoPublish === false) return;
    const publishKey = `${contract.fingerprint}|${contract.status}|${contract.updatedAt}`;
    if (lastPublished.current === publishKey) return;
    publishVacuumContract(contract);
    lastPublished.current = publishKey;
  }, [contract, options?.autoPublish]);

  return contract;
}
