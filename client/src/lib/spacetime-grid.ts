import type { HullSpacetimeGridStrengthMode } from "@/store/useHull3DSharedStore";

export type SpacetimeGridThetaNormParams = {
  warpStrengthMode?: HullSpacetimeGridStrengthMode | null;
  thetaFloorGR: number;
  thetaFloorDrive: number;
};

export const resolveSpacetimeGridThetaNorm = ({
  warpStrengthMode,
  thetaFloorGR,
  thetaFloorDrive,
}: SpacetimeGridThetaNormParams): number => {
  if (warpStrengthMode === "manual") return 1;
  if (warpStrengthMode === "autoThetaPk") return Math.max(thetaFloorGR, thetaFloorDrive);
  if (warpStrengthMode === "autoThetaScaleExpected") return Math.max(thetaFloorDrive, thetaFloorGR);
  return thetaFloorGR;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export const divergeThetaColor = (t: number): [number, number, number] => {
  const u = clamp01(0.5 + 0.5 * t);
  const cold: [number, number, number] = [0.20, 0.42, 0.85];
  const mid: [number, number, number] = [0.92, 0.95, 0.96];
  const warm: [number, number, number] = [0.95, 0.52, 0.18];
  if (u < 0.5) {
    const f = u / 0.5;
    return [
      cold[0] + (mid[0] - cold[0]) * f,
      cold[1] + (mid[1] - cold[1]) * f,
      cold[2] + (mid[2] - cold[2]) * f,
    ];
  }
  const f = (u - 0.5) / 0.5;
  return [
    mid[0] + (warm[0] - mid[0]) * f,
    mid[1] + (warm[1] - mid[1]) * f,
    mid[2] + (warm[2] - mid[2]) * f,
  ];
};
