import type { NavigationPose } from "@shared/schema";
import type { EnergyPipelineState } from "@/hooks/use-energy-pipeline";
import { computeEffectiveLyPerHour } from "@/lib/nav/provisional-speed";
import { PROMOTED_WARP_PROFILE } from "@shared/warp-promoted-profile";

export const METERS_PER_LIGHTYEAR = 9.460_730_472_580_8e15;
const SECONDS_PER_HOUR = 3600;
const DEFAULT_LY_PER_HOUR = 0.22;

export type VizIntent = {
  planar: number;
  rise: number;
  /** Heading knob in [-1, 1] where 0 = +X axis. */
  yaw?: number;
};

export type Waypoint = {
  position_m: [number, number, number];
};

type FallbackArgs = {
  mode?: string | null;
  dutyCycle?: number | null;
  sectorStrobing?: number | null;
  zeta?: number | null;
  tsRatio?: number | null;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const clamp11 = (value: number) => Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
const wrap360 = (deg: number) => ((deg % 360) + 360) % 360;

const phaseToYawDeg = (yaw: number | null | undefined): number => {
  if (!Number.isFinite(yaw)) return 0;
  return wrap360(yaw! * 180);
};

const blendAnglesDeg = (a: number, b: number, tRaw: number): number => {
  const t = clamp01(tRaw);
  const aWrapped = wrap360(a);
  const bWrapped = wrap360(b);
  let diff = bWrapped - aWrapped;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return wrap360(aWrapped + diff * t);
};

const fallbackLyPerHour = (args: FallbackArgs): number => {
  const mode = String(args.mode || "transit").toLowerCase();
  const base =
    mode.includes("hover") ? 0.005 :
    mode.includes("taxi") ? 0.01 :
    mode.includes("near") ? 0.04 :
    mode.includes("cruise") ? 0.4 :
    mode.includes("emergency") ? 1.2 :
    mode.includes("burst") ? 2.0 :
    mode.includes("sustain") ? 0.18 :
    DEFAULT_LY_PER_HOUR;

  const sectors = Number.isFinite(args.sectorStrobing)
    ? Math.max(1, Number(args.sectorStrobing))
    : 4;
  const sectorBoost = Math.min(2, 0.75 + sectors / 4);

  const duty = clamp01(args.dutyCycle ?? 0.5);
  const zeta = clamp01(args.zeta ?? 0.6);
  const ts = Number.isFinite(args.tsRatio) ? Math.max(0, (args.tsRatio as number) / 100) : 1;
  const dutyFactor = duty > 0.85 ? Math.max(0.4, 1 - (duty - 0.85) / 0.3) : 1;
  const zetaFactor = zeta > 0.95 ? Math.max(0.4, 1 - (zeta - 0.95) / 0.2) : 1;
  const tsFactor = ts > 1.5 ? Math.max(0.4, 1 - (ts - 1.5) / 1) : 1;

  return base * sectorBoost * Math.min(dutyFactor, zetaFactor, tsFactor);
};

const lyPerHourFromPipeline = (pipeline?: EnergyPipelineState | null): number => {
  if (!pipeline) {
    return fallbackLyPerHour({});
  }

  const pipelineExtra = pipeline as unknown as Record<string, unknown>;
  const duty =
    pipeline.dutyCycle ??
    pipeline.dutyFR ??
    (pipelineExtra?.duty as number | null | undefined) ??
    null;
  const tsRatio = pipeline.TS_ratio ?? (pipelineExtra?.tsRatio as number | null | undefined) ?? null;

  try {
    const lyh = computeEffectiveLyPerHour(
      pipeline.currentMode ?? "hover",
      duty ?? 0,
      pipeline.gammaGeo ?? PROMOTED_WARP_PROFILE.gammaGeo,
      pipeline.qSpoilingFactor ?? pipeline.q ?? pipeline.qMechanical ?? PROMOTED_WARP_PROFILE.qCavity,
      pipeline.zeta ?? 0.6,
      tsRatio ?? 100,
    );
    if (Number.isFinite(lyh) && lyh > 0) {
      return lyh;
    }
  } catch {
    // swallow and fall back to heuristic
  }

  return fallbackLyPerHour({
    mode: pipeline.currentMode,
    dutyCycle: duty,
    sectorStrobing: pipeline.sectorStrobing ?? (pipelineExtra?.sectors as number | null | undefined),
    zeta: pipeline.zeta,
    tsRatio,
  });
};

export const resolveNavVector = ({
  viz,
  pipeline,
  currentPose,
  waypoint,
}: {
  viz: VizIntent;
  pipeline?: EnergyPipelineState | null;
  currentPose?: NavigationPose | null;
  waypoint?: Waypoint | null;
}) => {
  const baseLyPerHour = lyPerHourFromPipeline(pipeline);
  const baseSpeed = ((Number.isFinite(baseLyPerHour) ? baseLyPerHour : 0) * METERS_PER_LIGHTYEAR) / SECONDS_PER_HOUR;

  const planarMag = clamp01(viz.planar);
  const riseInput = clamp11(viz.rise);
  const intentMag = clamp01(Math.hypot(planarMag, riseInput));
  const speed_mps = baseSpeed * intentMag;

  const yawDeg = phaseToYawDeg(viz.yaw ?? 0);
  let heading_deg = yawDeg;

  if (waypoint && currentPose) {
    const [cx, cy] = currentPose.position_m;
    const [tx, ty] = waypoint.position_m;
    const targetHeading = (Math.atan2(ty - cy, tx - cx) * 180) / Math.PI;
    const blend = 0.5 * clamp01(Math.abs(planarMag));
    heading_deg = blendAnglesDeg(heading_deg, targetHeading, blend);
  }

  const vzFrac = clamp11(riseInput);
  const horizontalFrac = Math.sqrt(Math.max(0, 1 - Math.min(1, vzFrac * vzFrac)));
  const headingRad = (heading_deg * Math.PI) / 180;
  const dirX = Math.cos(headingRad) * horizontalFrac;
  const dirY = Math.sin(headingRad) * horizontalFrac;
  const dirZ = vzFrac;

  const velocity_mps: [number, number, number] = [
    dirX * speed_mps,
    dirY * speed_mps,
    dirZ * speed_mps,
  ];

  return {
    velocity_mps,
    speed_mps,
    heading_deg: wrap360(heading_deg),
  };
};


const fnv1a32 = (input: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

export const createDeterministicNavTraceId = (input: {
  seed: string;
  waypoint?: Waypoint | null;
  viz: VizIntent;
  frame?: string;
}): string => {
  const waypoint = input.waypoint?.position_m?.map((value) => Number(value).toFixed(3)).join(",") ?? "none";
  const raw = [
    input.seed,
    waypoint,
    Number(input.viz.planar).toFixed(4),
    Number(input.viz.rise).toFixed(4),
    Number(input.viz.yaw ?? 0).toFixed(4),
    input.frame ?? "heliocentric-ecliptic",
  ].join("|");
  return `nav:${fnv1a32(raw).toString(16).padStart(8, "0")}`;
};

const magnitude = (vector: [number, number, number]): number => {
  const [x, y, z] = vector;
  return Math.sqrt(x * x + y * y + z * z);
};

export const computeNavDelta = (input: {
  predictedVelocity: [number, number, number];
  actualVelocity: [number, number, number];
}): number => {
  const predicted = magnitude(input.predictedVelocity);
  const actual = magnitude(input.actualVelocity);
  return Math.abs(actual - predicted);
};

export const shouldRecordNavPhase = (tick: number, phase: "sense" | "premeditate" | "act"): boolean => {
  if (!Number.isFinite(tick) || tick <= 0) return false;
  const mod = tick % 10;
  if (phase === "sense") return mod === 1;
  if (phase === "premeditate") return mod === 2;
  return mod === 3;
};
