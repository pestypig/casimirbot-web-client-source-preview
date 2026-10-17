import { describe, expect, it } from "vitest";
import {
  buildCardSignatures,
  ensureCardRecipeSchemaVersion,
  hashSignature,
  stableStringify,
  SIGNATURE_HASH_LENGTH,
} from "./card-signatures";
import { CARD_RECIPE_SCHEMA_VERSION, type BasisTransform } from "@shared/schema";

describe("card signature determinism", () => {
  it("produces stable hashes for equivalent payloads", async () => {
    const payloadA = { foo: "bar", nested: { a: 1, b: [2, { c: 3 }] } };
    const payloadB = { nested: { b: [2, { c: 3, extra: undefined }], a: 1 }, foo: "bar" };
    const hashA = await hashSignature(payloadA);
    const hashB = await hashSignature(payloadB);
    expect(hashA).toHaveLength(SIGNATURE_HASH_LENGTH);
    expect(hashB).toBe(hashA);
    expect(stableStringify(payloadA)).toBe(stableStringify(payloadB));
  });

  it("covers mesh/basis/hull/blanket/viz/profile signatures consistently", async () => {
    const mesh = {
      meshHash: "mesh-hash-123",
      triangleCount: 12,
      vertexCount: 18,
      lod: "preview",
      decimation: { targetTris: 20 },
    };
    const basis: BasisTransform = {
      swap: { x: "z", y: "x", z: "y" },
      flip: { y: true },
      scale: [1.2, 0.8, 0.5],
    };
    const hull = {
      dims_m: { Lx_m: 10, Ly_m: 4, Lz_m: 2 },
      area_m2: 12.5,
      areaSource: "preview",
      source: "preview",
    };
    const vizA = {
      volumeViz: "theta_drive",
      volumeDomain: "bubbleBox",
      planarVizMode: 2,
      vizFloors: { thetaDrive: 0.1 },
      gate: { source: "schedule", viewEnabled: true, forceFlat: false },
      opacityWindow: [0.1, 0.9] as [number, number],
      bounds: { domainScale: 1.4 },
      boundsProfile: "wide",
      palette: { id: "diverging" },
    };
    const vizB = {
      gate: { forceFlat: false, viewEnabled: true, source: "schedule" },
      boundsProfile: "wide",
      opacityWindow: [0.1, 0.9] as [number, number],
      volumeDomain: "bubbleBox",
      palette: { id: "diverging" },
      planarVizMode: 2,
      vizFloors: { thetaDrive: 0.1 },
      volumeViz: "theta_drive",
      bounds: { domainScale: 1.4 },
    };
    const geometry = {
      warpGeometryKind: "sdf",
      warpGeometryAssetId: "asset-123",
      meshHash: mesh.meshHash,
      geometrySource: "preview",
      lattice: {
        enabled: true,
        preset: "high",
        profileTag: "preview",
        volumeHash: "vol-hash",
        sdfHash: "sdf-hash",
        strobeHash: "strobe-hash",
        weightsHash: "weights-hash",
        clampReasons: [],
        updatedAt: 12345,
      },
    };
    const profile = {
      profileTag: "card",
      qualityPreset: "high",
      qualityOverrides: { voxelDensity: "high", raySteps: 96 },
      volumeDomain: "bubbleBox",
    };
    const blanket = [1, 3, 5, 7];
    const sigA = await buildCardSignatures({
      mesh,
      basis,
      hull,
      blanketTiles: blanket,
      viz: vizA,
      profile,
      geometry,
    });
    const sigB = await buildCardSignatures({
      mesh: { ...mesh },
      basis: { ...basis },
      hull: { ...hull },
      blanketTiles: blanket.slice(),
      viz: vizB,
      profile: { ...profile },
      geometry: { ...geometry },
    });

    expect(sigA.meshHash).toBe(mesh.meshHash);
    expect(sigA.meshSignature).toBeDefined();
    expect(sigA.basisSignature).toBeDefined();
    expect(sigA.hullSignature).toBeDefined();
    expect(sigA.blanketSignature).toBeDefined();
    expect(sigA.vizSignature).toBeDefined();
    expect(sigA.profileSignature).toBeDefined();
    expect(sigA.geometrySignature).toBeDefined();
    expect(sigA.meshSignature).toHaveLength(SIGNATURE_HASH_LENGTH);
    expect(sigA.vizSignature).toHaveLength(SIGNATURE_HASH_LENGTH);
    expect(sigA.geometrySignature).toHaveLength(SIGNATURE_HASH_LENGTH);

    expect(sigA.meshSignature).toBe(sigB.meshSignature);
    expect(sigA.basisSignature).toBe(sigB.basisSignature);
    expect(sigA.blanketSignature).toBe(sigB.blanketSignature);
    expect(sigA.vizSignature).toBe(sigB.vizSignature);
    expect(sigA.profileSignature).toBe(sigB.profileSignature);
    expect(sigA.geometrySignature).toBe(sigB.geometrySignature);
  });

  it("stamps schemaVersion when missing on cardRecipe fragments", () => {
    const recipe = ensureCardRecipeSchemaVersion({
      hull: { Lx_m: 3, Ly_m: 2, Lz_m: 1 },
      area: {},
      blanket: {},
      viz: { volumeViz: "theta_drive", volumeDomain: "wallBand", gateSource: "schedule", gateView: true },
      geometry: {},
      mesh: { meshHash: "abc123" },
    } as any);
    expect(recipe?.schemaVersion).toBe(CARD_RECIPE_SCHEMA_VERSION);
  });
});
