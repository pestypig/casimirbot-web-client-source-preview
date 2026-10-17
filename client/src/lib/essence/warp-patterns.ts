import { kappaDrive } from "@/lib/phoenixAveraging";
import type { EnergyPipelineState } from "@/hooks/use-energy-pipeline";

export type WarpPatternInputs = {
  kappa: number;
  kappaNorm: number;
  tauLC_ms?: number;
  tauNorm: number;
  dutyNorm: number;
  sectorFraction: number;
  guard: "ok" | "near" | "violation";
  mechStatus?: EnergyPipelineState["mechGuard"];
  palette: { line: string; accent: string; warning: string };
};

export type PatternRecipe = {
  contourLevels: number[];
  wiggle: number;
  stroke: number;
  paletteMode: WarpPatternInputs["guard"];
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const normalizeLogRange = (value: number, loExp: number, hiExp: number) => {
  const exp = Math.log10(Math.max(value, 1e-48));
  return clamp01((exp - loExp) / (hiExp - loExp));
};

const normalizeTau = (tauMs?: number) => {
  if (tauMs == null || !Number.isFinite(tauMs)) return 0.5;
  // Map 0.01 ms -> 1 (fast), 200 ms -> 0 (slow)
  const exp = Math.log10(Math.max(tauMs, 1e-3));
  return clamp01(1 - normalizeLogRange(Math.pow(10, exp), 1e-3, 200));
};

const pickGuard = (pipeline?: EnergyPipelineState | null): WarpPatternInputs["guard"] => {
  const qi = pipeline?.qiBadge;
  if (qi === "violation") return "violation";
  if (qi === "near") return "near";
  if (pipeline?.mechGuard?.status === "fail") return "violation";
  if (pipeline?.mechGuard?.status === "saturated") return "near";
  return "ok";
};

const deriveDuty = (p?: EnergyPipelineState | null): number => {
  const dutyEff =
    typeof (p as any)?.dutyEffectiveFR === "number"
      ? (p as any).dutyEffectiveFR
      : typeof (p as any)?.dutyEff === "number"
        ? (p as any).dutyEff
        : typeof p?.dutyCycle === "number" && typeof p?.sectorCount === "number"
          ? p.dutyCycle / Math.max(1, p.sectorCount)
          : 0.01;
  return clamp01(dutyEff);
};

export function buildWarpPatternInputs(pipeline?: EnergyPipelineState | null): WarpPatternInputs {
  const p: Partial<EnergyPipelineState> = pipeline ?? {};

  const dutyNorm = deriveDuty(pipeline);
  const geometryGain = Number.isFinite((p as any)?.gammaGeo) ? Math.max(0, (p as any).gammaGeo as number) : 6.5;
  const sectorTotal =
    (p as any).sectorCount ??
    (p as any).sectorsTotal ??
    (p as any).sectors ??
    (p as any)?.phaseSchedule?.sectorCount ??
    1;
  const sectorLive =
    (p as any).sectorsConcurrent ??
    (p as any).concurrentSectors ??
    (p as any)?.phaseSchedule?.sectorsConcurrent ??
    (p as any)?.phaseSchedule?.sectorsLive ??
    1;
  const sectorFraction = clamp01(sectorLive / Math.max(1, sectorTotal));

  const tileArea_cm2 =
    (p as any)?.tiles?.tileArea_cm2 != null ? Number((p as any).tiles.tileArea_cm2) : (p as any).tileArea_cm2;
  const tileArea_m2 = tileArea_cm2 != null && Number.isFinite(tileArea_cm2) ? tileArea_cm2 / 1e4 : undefined;
  const activeTiles =
    (p as any)?.tiles?.active != null ? Number((p as any).tiles.active) : (p as any).activeTiles ?? undefined;
  const hullArea =
    (p as any)?.tiles?.hullArea_m2 ??
    ((p as any)?.hull?.wallWidth_m && (p as any)?.hull?.Lx_m
      ? (p as any).hull.wallWidth_m * (p as any).hull.Lx_m
      : undefined);

  const powerPerTile =
    (p as any)?.tiles?.power_W_per_tile ??
    (p as any)?.tiles?.power_per_tile_W ??
    (p as any)?.tiles?.P_tile_W ??
    undefined;
  const powerAvgW = (p as any).P_avg_W ?? (p as any).P_avg;

  let powerDensityBase = 5e7;
  if (powerPerTile != null && tileArea_m2) {
    powerDensityBase = powerPerTile / Math.max(1e-9, tileArea_m2);
  } else if (powerAvgW != null && hullArea != null) {
    powerDensityBase = powerAvgW / Math.max(1e-9, hullArea);
  } else if (powerAvgW != null) {
    powerDensityBase = powerAvgW;
  }

  const tauLC_ms =
    (p as any)?.tau_LC_ms ??
    (p as any)?.tauLC_ms ??
    (p as any)?.lightCrossing?.tauLC_ms ??
    (p as any)?.clocking?.tauLC_ms ??
    (p as any)?.lc?.tauLC_ms ??
    undefined;

  const kappa = kappaDrive({
    powerDensityWPerM2: Math.max(0, powerDensityBase),
    dutyEffective: dutyNorm,
    geometryGain,
  });

  const kappaNorm = normalizeLogRange(kappa, -42, -26);

  const guard = pickGuard(pipeline);
  const palette =
    guard === "violation"
      ? { line: "#f97316", accent: "#fca5a5", warning: "#f97316" }
      : guard === "near"
        ? { line: "#f59e0b", accent: "#fde68a", warning: "#f59e0b" }
        : { line: "#38bdf8", accent: "#f1c40f", warning: "#38bdf8" };

  return {
    kappa,
    kappaNorm,
    tauLC_ms,
    tauNorm: normalizeTau(tauLC_ms),
    dutyNorm,
    sectorFraction,
    guard,
    mechStatus: (p as any).mechGuard,
    palette,
  };
}

export function buildPatternRecipe(inputs: WarpPatternInputs): PatternRecipe {
  const densityBase = clamp01(inputs.kappaNorm * 0.6 + inputs.sectorFraction * 0.4);
  const guardClamp = inputs.guard === "violation" ? 0.35 : inputs.guard === "near" ? 0.72 : 1;
  const contourCount = Math.max(3, Math.round(4 + densityBase * 6 * guardClamp));
  const contourLevels = Array.from({ length: contourCount }, (_v, idx) => (idx + 1) / (contourCount + 1));
  const wiggle = 0.4 + inputs.kappaNorm * 0.8 + (1 - inputs.tauNorm) * 0.4;
  const stroke = 1 + inputs.kappaNorm * 2;
  return {
    contourLevels,
    wiggle: wiggle * guardClamp,
    stroke: stroke * guardClamp,
    paletteMode: inputs.guard,
  };
}
