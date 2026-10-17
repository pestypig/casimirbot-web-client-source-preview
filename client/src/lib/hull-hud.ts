import type { HullBasisResolved } from "@shared/hull-basis";

export type AxisName = "x" | "y" | "z";

export type AxisDirection = {
  axis: AxisName;
  sign: 1 | -1;
};

export type BasisFrontRightUp = {
  front: AxisDirection | null;
  right: AxisDirection | null;
  up: AxisDirection | null;
};

const axisIndex = (axis: AxisName): 0 | 1 | 2 => (axis === "x" ? 0 : axis === "y" ? 1 : 2);

const isFiniteVec3 = (vec: [number, number, number]) =>
  vec.length >= 3 && vec.every((v) => Number.isFinite(Number(v)));

export function axisDirectionFromVec3(
  vec: [number, number, number],
  opts?: { minComponent?: number },
): AxisDirection | null {
  if (!isFiniteVec3(vec)) return null;
  const minComponent = Math.max(0, opts?.minComponent ?? 1e-4);
  const x = Number(vec[0]);
  const y = Number(vec[1]);
  const z = Number(vec[2]);
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const az = Math.abs(z);
  const max = Math.max(ax, ay, az);
  if (!(max > minComponent)) return null;
  if (ay >= ax && ay >= az) return { axis: "y", sign: y < 0 ? -1 : 1 };
  if (az >= ax && az >= ay) return { axis: "z", sign: z < 0 ? -1 : 1 };
  return { axis: "x", sign: x < 0 ? -1 : 1 };
}

export function formatAxisDirection(dir: AxisDirection | null): string {
  if (!dir) return "--";
  return `${dir.sign < 0 ? "-" : "+"}${dir.axis.toUpperCase()}`;
}

export function resolveBasisFrontRightUp(basis: HullBasisResolved | null | undefined): BasisFrontRightUp {
  const forward = basis?.forward ?? null;
  const right = basis?.right ?? null;
  const up = basis?.up ?? null;
  return {
    front: forward ? axisDirectionFromVec3(forward) : null,
    right: right ? axisDirectionFromVec3(right) : null,
    up: up ? axisDirectionFromVec3(up) : null,
  };
}

export function remapXYZToFrontRightUp(
  valuesXYZ: [number, number, number],
  basis: HullBasisResolved | null | undefined,
): {
  values: [number, number, number];
  axes: BasisFrontRightUp;
  labels: { front: string; right: string; up: string };
} {
  const axes = resolveBasisFrontRightUp(basis);
  const defaultResult = {
    values: [...valuesXYZ] as [number, number, number],
    axes,
    labels: {
      front: formatAxisDirection(axes.front),
      right: formatAxisDirection(axes.right),
      up: formatAxisDirection(axes.up),
    },
  };

  if (!axes.front || !axes.right || !axes.up) return defaultResult;

  const frontIdx = axisIndex(axes.front.axis);
  const rightIdx = axisIndex(axes.right.axis);
  const upIdx = axisIndex(axes.up.axis);
  const values = [valuesXYZ[frontIdx], valuesXYZ[rightIdx], valuesXYZ[upIdx]] as [number, number, number];
  return { ...defaultResult, values };
}

export function formatTriplet(values: [number, number, number], digits = 1): string {
  const fixedDigits = Math.max(0, Math.min(6, Math.floor(digits)));
  return values
    .map((value) => (Number.isFinite(value) ? value.toFixed(fixedDigits) : "--"))
    .join("×");
}
