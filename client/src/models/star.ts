export type HRCategory =
  | "brown-dwarf"
  | "ms-m"
  | "ms-k"
  | "ms-g"
  | "ms-f"
  | "ms-a"
  | "ms-b"
  | "ms-o"
  | "subgiant"
  | "red-giant"
  | "supergiant"
  | "white-dwarf";

export type SolverMode = "polytrope" | "hydro-lite";

export interface DrivePackInputs {
  powerPerArea: number; // W/m^2
  duty: number; // 0..1
  gain: number;
  dEff: number;
}

export type IgnitionNetwork = "pp" | "cno";

export interface IgnitionPack {
  enabled: boolean;
  network: IgnitionNetwork;
  coreTemperatureK: number;
}

export interface StarInputs {
  category: HRCategory;
  M: number; // kg
  R: number; // m
  X: number; // hydrogen mass fraction
  Z: number; // metallicity mass fraction
  rotation: number; // Ω/Ω_crit
  polytropeN: 1.5 | 3;
  solver: SolverMode;
  drive: DrivePackInputs;
  ignition: IgnitionPack;
}

export interface RadialProfile {
  r: Float64Array;
  rho: Float64Array;
  P: Float64Array;
  T?: Float64Array;
  Menc: Float64Array;
}

export interface CurvatureSummary {
  kappaBodyCore: number;
  kappaBodyMean: number;
  kappaDrive: number;
  ePotatoCore: number;
  ePotatoMean: number;
}

export interface HydrostaticDiagnostics {
  meanDensity: number;
  coreDensity: number;
  betaCore: number; // gas pressure fraction
  surfaceGravity: number; // m/s^2
}

export type ResearchOverlayKey = "p-modes" | "coherence" | "multifractal";

export type ResearchOverlays = Record<ResearchOverlayKey, boolean>;
