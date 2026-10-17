export const HULL_DIM_MIN_M = 1e-3;
export const HULL_DIM_MAX_M = 20_000;
export const HULL_AREA_MIN_M2 = 1e-9;   // open interval at 0; keep positive
export const HULL_AREA_UNCERTAINTY_MIN_M2 = 0; // allow exact zero for sigma inputs
export const HULL_AREA_MAX_M2 = 1e8;

export type HullDims = { Lx_m?: number; Ly_m?: number; Lz_m?: number };

const clampRange = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const clampDim = (value?: number) => {
  if (!Number.isFinite(value as number)) return undefined;
  const v = Math.abs(value as number);
  return clampRange(v, HULL_DIM_MIN_M, HULL_DIM_MAX_M);
};

const clampArea = (value?: number | null, min = HULL_AREA_MIN_M2) => {
  if (!Number.isFinite(value as number)) return undefined;
  const v = Math.abs(value as number);
  return clampRange(v, min, HULL_AREA_MAX_M2);
};

export const clampHullDims = (dims: HullDims) => ({
  Lx_m: clampDim(dims.Lx_m),
  Ly_m: clampDim(dims.Ly_m),
  Lz_m: clampDim(dims.Lz_m),
});

export const clampHullArea = (area?: number | null, allowZero = false) =>
  clampArea(area, allowZero ? HULL_AREA_UNCERTAINTY_MIN_M2 : HULL_AREA_MIN_M2);

export const clampHullAxis = (axis?: number) => {
  if (!Number.isFinite(axis as number)) return undefined;
  const v = Math.abs(axis as number);
  return clampRange(v, HULL_DIM_MIN_M * 0.5, HULL_DIM_MAX_M * 0.5);
};

export const clampHullThickness = (thickness?: number | null) => clampDim(thickness as number | undefined);
