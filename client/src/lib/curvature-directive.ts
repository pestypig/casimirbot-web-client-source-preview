import { C as speedOfLight } from "@/lib/physics-const";

const STANDARD_GRAVITY = 9.80665; // m/s^2
const DEFAULT_EPSILON_CEILING = 5e-7;
const DEFAULT_G_TARGET_CEILING = 0.15 * STANDARD_GRAVITY;
const DRIVE_NORM_EPS = 1e-4;

export const CURVATURE_GAIN_RANGE: [number, number] = [0.6, 3.0];
export const CURVATURE_ALPHA_RANGE: [number, number] = [0.25, 0.7];
export const CURVATURE_MARGIN_THRESHOLD = 0.55;

export type CurvaturePalette = "cool" | "warm" | "diverging";
export type CurvatureCompositeMode = "composite" | "signedMIP";

export type CurvatureDirective =
  | {
      enabled: false;
      source?: string;
    }
  | {
      enabled: true;
      gain: number;
      alpha: number;
      palette: CurvaturePalette;
      mode?: CurvatureCompositeMode;
      source?: string;
      showQIMargin?: boolean;
    };

export type EnabledCurvatureDirective = Extract<CurvatureDirective, { enabled: true }>;

export interface CurvatureDriveInputs {
  tiltMagnitude: number;
  epsilonTilt?: number;
  epsilonCeiling?: number;
  gTarget?: number;
  gCeiling?: number;
}

export interface CurvatureDirectiveOptions {
  palette?: CurvaturePalette;
  marginThreshold?: number;
  showQIMargin?: boolean;
  source?: string;
  mode?: CurvatureCompositeMode;
  minDrive?: number;
}

export interface SectorShellEnvelope {
  shellR0: number;
  shellR1: number;
  rInner: number;
  rOuter: number;
  halfHeight: number;
}

export interface SectorShellOptions {
  minDrive?: number;
  innerPull?: number;
  outerPush?: number;
  heightBoost?: number;
}

export const DEFAULT_SECTOR_SHELL_BASE: SectorShellEnvelope = {
  shellR0: 1.0,
  shellR1: 1.035,
  rInner: 0.985,
  rOuter: 1.045,
  halfHeight: 0.055,
};

export const CURVATURE_PALETTES: CurvaturePalette[] = ["cool", "warm", "diverging"];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const curvaturePaletteIndex = (palette?: CurvaturePalette) => {
  const order: Record<CurvaturePalette, number> = {
    cool: 0,
    warm: 2,
    diverging: 1,
  };
  return order[palette ?? "diverging"];
};

export const normalizeCurvaturePalette = (
  value: unknown,
  fallback: CurvaturePalette = "diverging"
): CurvaturePalette => {
  if (value === "cool" || value === "warm" || value === "diverging") {
    return value;
  }
  if (value === 0 || value === "0") return "cool";
  if (value === 1 || value === "1") return "diverging";
  if (value === 2 || value === "2") return "warm";
  return fallback;
};

export const isCurvatureDirectiveEnabled = (
  directive?: CurvatureDirective | null
): directive is EnabledCurvatureDirective => Boolean(directive && directive.enabled);

export function computeDriveNorm({
  tiltMagnitude,
  epsilonTilt,
  epsilonCeiling = DEFAULT_EPSILON_CEILING,
  gTarget,
  gCeiling = DEFAULT_G_TARGET_CEILING,
}: CurvatureDriveInputs): number {
  const tiltNorm = clamp01(Math.abs(Number.isFinite(tiltMagnitude) ? tiltMagnitude : 0));
  const epsilonNorm = clamp01(
    epsilonTilt && Number.isFinite(epsilonTilt) ? Math.abs(epsilonTilt) / epsilonCeiling : 0
  );
  const gNorm = clamp01(
    gTarget && Number.isFinite(gTarget) ? Math.abs(gTarget) / gCeiling : 0
  );
  return Math.max(tiltNorm, epsilonNorm, gNorm);
}

export function mapDriveToCurvatureDirective(
  driveNorm: number,
  {
    palette = "diverging",
    marginThreshold = CURVATURE_MARGIN_THRESHOLD,
    showQIMargin,
    source,
    mode,
    minDrive = DRIVE_NORM_EPS,
  }: CurvatureDirectiveOptions = {}
): CurvatureDirective {
  if (driveNorm <= minDrive || !Number.isFinite(driveNorm)) {
    return { enabled: false, source };
  }

  const gain = lerp(CURVATURE_GAIN_RANGE[0], CURVATURE_GAIN_RANGE[1], clamp01(driveNorm));
  const alpha = lerp(CURVATURE_ALPHA_RANGE[0], CURVATURE_ALPHA_RANGE[1], clamp01(driveNorm));

  return {
    enabled: true,
    gain: Number(Math.fround(gain)),
    alpha: Number(Math.fround(alpha)),
    palette,
    mode,
    source,
    showQIMargin: typeof showQIMargin === "boolean" ? showQIMargin : driveNorm >= marginThreshold,
  };
}

export function curvatureDirectiveChanged(
  previous: CurvatureDirective | null | undefined,
  next: CurvatureDirective,
  epsilon = 1e-3
): boolean {
  if (!previous) return true;
  if (previous.enabled !== next.enabled) return true;
  if (!next.enabled) return false;
  if (!("gain" in previous) || !previous.enabled) return true;

  return (
    Math.abs(previous.gain - next.gain) > epsilon ||
    Math.abs(previous.alpha - next.alpha) > epsilon ||
    previous.palette !== next.palette ||
    Boolean(previous.showQIMargin) !== Boolean(next.showQIMargin) ||
    (previous.mode ?? null) !== (next.mode ?? null)
  );
}

export function mapDriveToSectorShell(
  driveNorm: number,
  base: SectorShellEnvelope = DEFAULT_SECTOR_SHELL_BASE,
  { minDrive = DRIVE_NORM_EPS, innerPull = 0.1, outerPush = 0.2, heightBoost = 0.25 }: SectorShellOptions = {}
): SectorShellEnvelope | null {
  if (driveNorm <= minDrive) {
    return null;
  }
  const t = clamp01(driveNorm);
  const shrink = 1 - innerPull * t;
  const swell = 1 + outerPush * t;
  const height = 1 + heightBoost * t;

  return {
    shellR0: base.shellR0 * shrink,
    shellR1: base.shellR1 * swell,
    rInner: base.rInner * shrink,
    rOuter: base.rOuter * swell,
    halfHeight: base.halfHeight * height,
  };
}

export function sectorShellChanged(
  previous: SectorShellEnvelope | null | undefined,
  next: SectorShellEnvelope,
  epsilon = 1e-3
): boolean {
  if (!previous) return true;
  return (
    Math.abs(previous.shellR0 - next.shellR0) > epsilon ||
    Math.abs(previous.shellR1 - next.shellR1) > epsilon ||
    Math.abs(previous.rInner - next.rInner) > epsilon ||
    Math.abs(previous.rOuter - next.rOuter) > epsilon ||
    Math.abs(previous.halfHeight - next.halfHeight) > epsilon
  );
}

export const deriveEpsilonTilt = ({
  gTarget,
  R_geom,
}: {
  gTarget: number;
  R_geom: number;
}) => {
  if (!Number.isFinite(gTarget) || !Number.isFinite(R_geom) || R_geom <= 0) {
    return 0;
  }
  const numerator = gTarget * R_geom;
  return Math.min(DEFAULT_EPSILON_CEILING, Math.max(0, numerator / (speedOfLight * speedOfLight)));
};
