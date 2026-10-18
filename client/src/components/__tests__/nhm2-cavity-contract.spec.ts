import { describe, expect, it } from "vitest";
import {
  NHM2_CAVITY_CONTRACT,
  NHM2_CAVITY_VIEW_GEOMETRY,
  resolveNeedleHullMark2CavityViewGeometry,
} from "@shared/needle-hull-mark2-cavity-contract";

describe("NHM2 cavity contract", () => {
  it("parses the shared NHM2 contract and exposes canonical view geometry", () => {
    expect(NHM2_CAVITY_CONTRACT.status).toBe("geometry_freeze");
    expect(NHM2_CAVITY_VIEW_GEOMETRY.pocketDiameter_um).toBe(
      NHM2_CAVITY_CONTRACT.geometry.pocketDiameter_um,
    );
    expect(NHM2_CAVITY_VIEW_GEOMETRY.tileWidth_mm).toBe(
      NHM2_CAVITY_CONTRACT.geometry.tileWidth_mm,
    );
  });

  it("allows runtime overrides while preserving the shared NHM2 defaults", () => {
    const resolved = resolveNeedleHullMark2CavityViewGeometry(
      NHM2_CAVITY_CONTRACT,
      {
        gap_nm: 9.5,
      },
    );
    expect(resolved.gap_nm).toBe(9.5);
    expect(resolved.pocketDiameter_um).toBe(
      NHM2_CAVITY_CONTRACT.geometry.pocketDiameter_um,
    );
  });
});
