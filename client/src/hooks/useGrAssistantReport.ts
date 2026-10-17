import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEnergyPipeline, type EnergyPipelineState } from "@/hooks/use-energy-pipeline";
import { useHullPreviewPayload } from "@/hooks/use-hull-preview-payload";
import { useGrBrick, type UseGrBrickOptions } from "@/hooks/useGrBrick";
import { fetchGrAssistantReport } from "@/lib/gr-assistant-report";
import type { GrAssistantReportRequest } from "@shared/schema";
import type { GrEvolveBrickChannel, GrEvolveBrickDecoded } from "@/lib/gr-evolve-brick";

type Vec3 = [number, number, number];
type Bounds = { min: Vec3; max: Vec3; axes: Vec3 };
type BrickSample = { dims: Vec3; data: Float32Array; bounds: Bounds };

const DEFAULT_GRID_SCALE = 1.2;
const DEFAULT_GRID_DIV = 12;
const DEFAULT_WALL_THICKNESS = 0.45;

const toFinite = (value: unknown): number | undefined => {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const clampVec3 = (value: Vec3, bounds: Bounds): Vec3 => [
  clamp(value[0], bounds.min[0], bounds.max[0]),
  clamp(value[1], bounds.min[1], bounds.max[1]),
  clamp(value[2], bounds.min[2], bounds.max[2]),
];

const normalizeDir = (dir?: Vec3 | null): Vec3 => {
  if (!dir) return [1, 0, 0];
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  if (!Number.isFinite(len) || len <= 1e-6) return [1, 0, 0];
  return [dir[0] / len, dir[1] / len, dir[2] / len];
};

const resolveBoundsFromBrick = (brick: GrEvolveBrickDecoded | null): Bounds | null => {
  if (!brick?.bounds) return null;
  const min = brick.bounds.min as Vec3;
  const max = brick.bounds.max as Vec3;
  const axes: Vec3 = [
    Math.max(1e-6, (max[0] - min[0]) / 2),
    Math.max(1e-6, (max[1] - min[1]) / 2),
    Math.max(1e-6, (max[2] - min[2]) / 2),
  ];
  return { min, max, axes };
};

const resolveBoundsFromPipeline = (pipeline?: EnergyPipelineState | null): Bounds => {
  const hull = pipeline?.hull ?? {};
  const Lx = toFinite((hull as any).Lx_m ?? (hull as any).Lx) ?? 1007;
  const Ly = toFinite((hull as any).Ly_m ?? (hull as any).Ly) ?? 264;
  const Lz = toFinite((hull as any).Lz_m ?? (hull as any).Lz) ?? 173;
  const axes: Vec3 = [Lx / 2, Ly / 2, Lz / 2];
  return {
    axes,
    min: [-axes[0], -axes[1], -axes[2]],
    max: [axes[0], axes[1], axes[2]],
  };
};

const resolveHullWall = (pipeline?: EnergyPipelineState | null): number => {
  const hull = pipeline?.hull ?? {};
  const wall =
    toFinite((hull as any).wallThickness_m) ??
    toFinite((hull as any).wallWidth_m) ??
    toFinite((pipeline as any)?.wallThickness_m) ??
    toFinite((pipeline as any)?.wallWidth_m);
  return Math.max(1e-4, wall ?? DEFAULT_WALL_THICKNESS);
};

const brickIndex = (x: number, y: number, z: number, nx: number, ny: number) =>
  z * nx * ny + y * nx + x;

const sampleBrickScalar = (sample: BrickSample, pos: Vec3, outside = 1) => {
  const [nx, ny, nz] = sample.dims;
  if (nx < 2 || ny < 2 || nz < 2) return outside;
  const { min, max } = sample.bounds;
  const spanX = max[0] - min[0];
  const spanY = max[1] - min[1];
  const spanZ = max[2] - min[2];
  if (!(spanX > 0 && spanY > 0 && spanZ > 0)) return outside;
  const ux = (pos[0] - min[0]) / spanX;
  const uy = (pos[1] - min[1]) / spanY;
  const uz = (pos[2] - min[2]) / spanZ;
  if (ux < 0 || ux > 1 || uy < 0 || uy > 1 || uz < 0 || uz > 1) return outside;
  const fx = Math.min(Math.max(ux * (nx - 1), 0), nx - 1 - 1e-6);
  const fy = Math.min(Math.max(uy * (ny - 1), 0), ny - 1 - 1e-6);
  const fz = Math.min(Math.max(uz * (nz - 1), 0), nz - 1 - 1e-6);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const z0 = Math.floor(fz);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const z1 = z0 + 1;
  const tx = fx - x0;
  const ty = fy - y0;
  const tz = fz - z0;
  const data = sample.data;
  const i000 = data[brickIndex(x0, y0, z0, nx, ny)] ?? 0;
  const i100 = data[brickIndex(x1, y0, z0, nx, ny)] ?? 0;
  const i010 = data[brickIndex(x0, y1, z0, nx, ny)] ?? 0;
  const i110 = data[brickIndex(x1, y1, z0, nx, ny)] ?? 0;
  const i001 = data[brickIndex(x0, y0, z1, nx, ny)] ?? 0;
  const i101 = data[brickIndex(x1, y0, z1, nx, ny)] ?? 0;
  const i011 = data[brickIndex(x0, y1, z1, nx, ny)] ?? 0;
  const i111 = data[brickIndex(x1, y1, z1, nx, ny)] ?? 0;
  const ix00 = i000 * (1 - tx) + i100 * tx;
  const ix10 = i010 * (1 - tx) + i110 * tx;
  const ix01 = i001 * (1 - tx) + i101 * tx;
  const ix11 = i011 * (1 - tx) + i111 * tx;
  const ixy0 = ix00 * (1 - ty) + ix10 * ty;
  const ixy1 = ix01 * (1 - ty) + ix11 * ty;
  return ixy0 * (1 - tz) + ixy1 * tz;
};

const getChannel = (
  brick: GrEvolveBrickDecoded | null,
  key: string,
): GrEvolveBrickChannel | undefined => {
  if (!brick) return undefined;
  const channels = brick.channels as Record<string, GrEvolveBrickChannel | undefined>;
  if (channels && channels[key]) return channels[key];
  const extra = (brick as any).extraChannels as Record<string, GrEvolveBrickChannel | undefined> | undefined;
  if (extra && extra[key]) return extra[key];
  return undefined;
};

const buildBrickSample = (
  brick: GrEvolveBrickDecoded | null,
  bounds: Bounds,
  channel: string,
): BrickSample | null => {
  if (!brick) return null;
  const dims = brick.dims;
  const total = dims[0] * dims[1] * dims[2];
  if (!Number.isFinite(total) || total <= 0) return null;
  const channelData = getChannel(brick, channel)?.data;
  if (!channelData || channelData.length < total) return null;
  return { dims, data: channelData, bounds };
};

const buildWarpConfig = (
  pipeline: EnergyPipelineState | null,
  bounds: Bounds,
  wallThickness: number,
) => {
  if (!pipeline) return undefined;
  const config: Record<string, number> = {};
  const axisMax = Math.max(bounds.axes[0], bounds.axes[1], bounds.axes[2]);
  const bubbleRadius =
    toFinite((pipeline as any)?.bubble?.R) ??
    toFinite((pipeline as any)?.R) ??
    toFinite((pipeline as any)?.radius) ??
    axisMax;
  if (Number.isFinite(bubbleRadius)) config.bubbleRadius_m = bubbleRadius as number;
  const dutyCycle =
    toFinite((pipeline as any)?.dutyCycle) ??
    toFinite((pipeline as any)?.dutyEffective_FR) ??
    toFinite((pipeline as any)?.dutyEffectiveFR) ??
    toFinite((pipeline as any)?.dutyShip) ??
    toFinite((pipeline as any)?.dutyEff);
  if (Number.isFinite(dutyCycle)) config.dutyCycle = dutyCycle as number;
  const tileCount =
    toFinite((pipeline as any)?.N_tiles) ??
    toFinite((pipeline as any)?.tiles?.N_tiles) ??
    toFinite((pipeline as any)?.tiles?.total);
  if (Number.isFinite(tileCount)) config.tileCount = tileCount as number;
  const gammaGeo =
    toFinite((pipeline as any)?.gammaGeo) ??
    toFinite((pipeline as any)?.ampFactors?.gammaGeo);
  if (Number.isFinite(gammaGeo)) config.gammaGeoOverride = gammaGeo as number;
  const targetVelocity =
    toFinite((pipeline as any)?.targetVelocity_c) ??
    toFinite((pipeline as any)?.velocity_c) ??
    toFinite((pipeline as any)?.vShip_c);
  if (Number.isFinite(targetVelocity)) {
    config.targetVelocity_c = targetVelocity as number;
  }
  if (Number.isFinite(wallThickness)) {
    config.wallThickness_m = wallThickness;
  }
  return Object.keys(config).length ? config : undefined;
};

const buildVacuumSamplePoints = (args: {
  bounds: Bounds;
  brick: GrEvolveBrickDecoded;
  driveDir: Vec3;
  wallThickness: number;
  gridScale: number;
  gridDiv: number;
}): Array<{ t: number; x: number; y: number; z: number }> => {
  const { bounds, brick, driveDir, wallThickness, gridScale, gridDiv } = args;
  const center: Vec3 = [
    (bounds.min[0] + bounds.max[0]) * 0.5,
    (bounds.min[1] + bounds.max[1]) * 0.5,
    (bounds.min[2] + bounds.max[2]) * 0.5,
  ];
  const axisMax = Math.max(bounds.axes[0], bounds.axes[1], bounds.axes[2]);
  const gridStep =
    axisMax > 0 && gridDiv > 0 ? (axisMax * gridScale * 2) / gridDiv : 0;
  const snap = (value: number) =>
    gridStep > 0 ? Math.round(value / gridStep) * gridStep : value;
  const wallOffset = snap(Math.max(axisMax - wallThickness * 0.5, 0));
  const edgeOffset = snap(Math.max(axisMax * 0.98, wallOffset));
  const candidates: Vec3[] = [
    center,
    [
      center[0] + driveDir[0] * wallOffset,
      center[1] + driveDir[1] * wallOffset,
      center[2] + driveDir[2] * wallOffset,
    ],
    [
      center[0] + driveDir[0] * edgeOffset,
      center[1] + driveDir[1] * edgeOffset,
      center[2] + driveDir[2] * edgeOffset,
    ],
  ];

  const hullMask = buildBrickSample(brick, bounds, "hullMask");
  const hullDist = buildBrickSample(brick, bounds, "hullDist");
  const valid = candidates.filter((pos) => {
    const clamped = clampVec3(pos, bounds);
    if (hullMask) {
      const mask = sampleBrickScalar(hullMask, clamped, 0);
      if (Number.isFinite(mask) && mask <= 0.1) return false;
    }
    if (hullDist) {
      const dist = sampleBrickScalar(hullDist, clamped, Number.NaN);
      if (!Number.isFinite(dist)) return false;
    }
    return true;
  });
  const output = valid.length ? valid : [center];
  const t = Number.isFinite(brick.time_s) ? brick.time_s : 0;
  return output.map((pos) => ({
    t,
    x: clamp(pos[0], bounds.min[0], bounds.max[0]),
    y: clamp(pos[1], bounds.min[1], bounds.max[1]),
    z: clamp(pos[2], bounds.min[2], bounds.max[2]),
  }));
};

const buildSampleBrick = (args: {
  brick: GrEvolveBrickDecoded;
  bounds: Bounds;
  sample: Vec3;
}): Record<string, unknown> | null => {
  const { brick, bounds, sample } = args;
  const requiredChannels = [
    "alpha",
    "beta_x",
    "beta_y",
    "beta_z",
    "gamma_xx",
    "gamma_yy",
    "gamma_zz",
    "H_constraint",
    "M_constraint_x",
    "M_constraint_y",
    "M_constraint_z",
  ];
  const optionalChannels = ["g_tt"];
  const outputChannels: Record<string, { data: number[]; min: number; max: number }> = {};
  for (const name of [...requiredChannels, ...optionalChannels]) {
    const channel = getChannel(brick, name);
    if (!channel) continue;
    const sampleView = buildBrickSample(brick, bounds, name);
    if (!sampleView) return null;
    const value = sampleBrickScalar(sampleView, sample, Number.NaN);
    outputChannels[name] = {
      data: [Number.isFinite(value) ? value : 0],
      min: Number.isFinite(channel.min) ? channel.min : value,
      max: Number.isFinite(channel.max) ? channel.max : value,
    };
  }
  for (const name of requiredChannels) {
    if (!outputChannels[name]) return null;
  }
  const voxelSize = brick.voxelSize_m ?? [
    (bounds.max[0] - bounds.min[0]) / Math.max(1, brick.dims[0]),
    (bounds.max[1] - bounds.min[1]) / Math.max(1, brick.dims[1]),
    (bounds.max[2] - bounds.min[2]) / Math.max(1, brick.dims[2]),
  ];
  const half = [
    Math.max(1e-6, voxelSize[0] / 2),
    Math.max(1e-6, voxelSize[1] / 2),
    Math.max(1e-6, voxelSize[2] / 2),
  ];
  return {
    dims: [1, 1, 1],
    bounds: {
      min: [sample[0] - half[0], sample[1] - half[1], sample[2] - half[2]],
      max: [sample[0] + half[0], sample[1] + half[1], sample[2] + half[2]],
    },
    voxelSize_m: voxelSize,
    time_s: brick.time_s,
    dt_s: brick.dt_s,
    channels: outputChannels,
    stats: brick.stats,
    meta: brick.meta,
  };
};

export type UseGrAssistantReportOptions = {
  brick?: GrEvolveBrickDecoded | null;
  brickRequest?: UseGrBrickOptions;
  pipeline?: EnergyPipelineState | null;
  enabled?: boolean;
  refetchMs?: number;
  runArtifacts?: boolean;
  runChecks?: boolean;
  runInvariants?: boolean;
  vacuumEpsilon?: number;
  gridScale?: number;
  gridDiv?: number;
};

export function useGrAssistantReport(options: UseGrAssistantReportOptions = {}) {
  const {
    brick,
    brickRequest,
    pipeline,
    enabled = true,
    refetchMs = 5000,
    runArtifacts = false,
    runChecks = true,
    runInvariants = true,
    vacuumEpsilon,
    gridScale = DEFAULT_GRID_SCALE,
    gridDiv = DEFAULT_GRID_DIV,
  } = options;
  const pipelineQuery = useEnergyPipeline({
    staleTime: 5000,
    refetchOnWindowFocus: false,
  });
  const pipelineState = pipeline ?? pipelineQuery.data ?? null;
  useHullPreviewPayload();
  const shouldFetchBrick = Boolean(brickRequest) && !brick && enabled;
  const grQuery = useGrBrick({
    ...(brickRequest ?? {}),
    enabled: shouldFetchBrick,
    refetchMs: brickRequest?.refetchMs ?? refetchMs,
  });
  const brickResolved = brick ?? grQuery.data ?? null;
  const bounds = useMemo(
    () => resolveBoundsFromBrick(brickResolved) ?? resolveBoundsFromPipeline(pipelineState),
    [brickResolved, pipelineState],
  );
  const driveDir = useMemo(
    () => normalizeDir((pipelineState as any)?.driveDir),
    [pipelineState],
  );
  const wallThickness = useMemo(() => resolveHullWall(pipelineState), [pipelineState]);

  const request = useMemo<GrAssistantReportRequest | null>(() => {
    if (!brickResolved) return null;
    const samples = buildVacuumSamplePoints({
      bounds,
      brick: brickResolved,
      driveDir,
      wallThickness,
      gridScale,
      gridDiv,
    });
    const primary = samples[0];
    if (!primary) return null;
    const sampleVec: Vec3 = [primary.x, primary.y, primary.z];
    const sampleBrick = buildSampleBrick({
      brick: brickResolved,
      bounds,
      sample: sampleVec,
    });
    if (!sampleBrick) return null;
    const warpConfig = buildWarpConfig(pipelineState, bounds, wallThickness);
    return {
      brick: sampleBrick,
      vacuum_sample_points: samples,
      ...(vacuumEpsilon !== undefined ? { vacuum_epsilon: vacuumEpsilon } : {}),
      run_artifacts: runArtifacts,
      run_checks: runChecks,
      run_invariants: runInvariants,
      ...(warpConfig ? { warpConfig } : {}),
      useLiveSnapshot: true,
    };
  }, [
    bounds,
    brickResolved,
    driveDir,
    gridDiv,
    gridScale,
    pipelineState,
    runArtifacts,
    runChecks,
    runInvariants,
    vacuumEpsilon,
    wallThickness,
  ]);

  const queryKey = useMemo(() => {
    if (!brickResolved) return ["helix:gr-assistant-report", "missing"];
    const stamp =
      (pipelineState as any)?.seq ??
      brickResolved.time_s ??
      brickResolved.stats?.steps ??
      0;
    return ["helix:gr-assistant-report", stamp];
  }, [brickResolved, pipelineState]);

  const enabledResolved = enabled && Boolean(request);
  const refetchInterval =
    Number.isFinite(refetchMs) && (refetchMs as number) > 0 ? refetchMs : false;
  const staleTime =
    Number.isFinite(refetchMs) && (refetchMs as number) > 0 ? refetchMs : 0;

  return useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchGrAssistantReport(request as GrAssistantReportRequest, signal),
    enabled: enabledResolved,
    refetchInterval,
    staleTime,
  });
}
