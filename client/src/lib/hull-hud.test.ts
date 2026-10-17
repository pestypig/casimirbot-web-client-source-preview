import { describe, expect, it } from "vitest";
import { HULL_BASIS_IDENTITY, resolveHullBasis } from "@shared/hull-basis";
import type { BasisTransform } from "@shared/schema";
import { remapXYZToFrontRightUp } from "./hull-hud";

describe("hull HUD basis labels", () => {
  const dimsXYZ: [number, number, number] = [1007, 264, 173];

  const NEEDLE_BASIS_TRANSFORM: BasisTransform = {
    swap: { x: "z", y: "y", z: "x" },
    flip: { x: false, y: true, z: false },
    scale: [1, 0.8, 2],
  };

  it("labels identity basis as front=+Z right=+X up=+Y", () => {
    const mapped = remapXYZToFrontRightUp(dimsXYZ, HULL_BASIS_IDENTITY);
    expect(mapped.labels).toEqual({ front: "+Z", right: "+X", up: "+Y" });
    expect(mapped.values[0]).toBeCloseTo(173);
    expect(mapped.values[1]).toBeCloseTo(1007);
    expect(mapped.values[2]).toBeCloseTo(264);
  });

  it("labels swapped basis as front=+X right=+Z up=-Y and remaps dims", () => {
    const basisResolved = resolveHullBasis(NEEDLE_BASIS_TRANSFORM);
    const mapped = remapXYZToFrontRightUp(dimsXYZ, basisResolved);
    expect(mapped.labels).toEqual({ front: "+X", right: "+Z", up: "-Y" });
    expect(mapped.values[0]).toBeCloseTo(1007);
    expect(mapped.values[1]).toBeCloseTo(173);
    expect(mapped.values[2]).toBeCloseTo(264);
  });

  it("remaps bubbleBox bounds sizes consistently across basis variants", () => {
    const scale = 1.08;
    const boundsXYZ: [number, number, number] = [dimsXYZ[0] * scale, dimsXYZ[1] * scale, dimsXYZ[2] * scale];

    const id = remapXYZToFrontRightUp(boundsXYZ, HULL_BASIS_IDENTITY);
    expect(id.values[0]).toBeCloseTo(dimsXYZ[2] * scale, 6);
    expect(id.values[1]).toBeCloseTo(dimsXYZ[0] * scale, 6);
    expect(id.values[2]).toBeCloseTo(dimsXYZ[1] * scale, 6);

    const swapped = remapXYZToFrontRightUp(boundsXYZ, resolveHullBasis(NEEDLE_BASIS_TRANSFORM));
    expect(swapped.values[0]).toBeCloseTo(dimsXYZ[0] * scale, 6);
    expect(swapped.values[1]).toBeCloseTo(dimsXYZ[2] * scale, 6);
    expect(swapped.values[2]).toBeCloseTo(dimsXYZ[1] * scale, 6);
  });
});

