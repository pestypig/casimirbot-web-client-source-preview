import { describe, expect, it } from "vitest";
import { CARD_SIGNATURE_KEYS, buildCardExportSidecar } from "./card-export-sidecar";
import { buildCardSignatures, ensureCardRecipeSchemaVersion } from "./card-signatures";
import { CARD_RECIPE_SCHEMA_VERSION } from "@shared/schema";

describe("card export sidecar", () => {
  it("carries cardRecipe + replayPayload signatures into the JSON sidecar", async () => {
    const signatures = await buildCardSignatures({
      mesh: { meshHash: "mesh-hash", triangleCount: 16, vertexCount: 32, lod: "preview" },
      hull: {
        dims_m: { Lx_m: 3, Ly_m: 2, Lz_m: 1 },
        area_m2: 12,
        areaSource: "preview",
        source: "preview",
      },
      viz: { volumeViz: "theta_drive", volumeDomain: "wallBand" },
      profile: { profileTag: "card", volumeDomain: "wallBand" },
      geometry: {
        warpGeometryKind: "sdf",
        meshHash: "mesh-hash",
        lattice: { volumeHash: "vol-hash", sdfHash: "sdf-hash" },
      },
    });
    const cardRecipe = ensureCardRecipeSchemaVersion({
      hull: { Lx_m: 3, Ly_m: 2, Lz_m: 1 },
      area: {},
      blanket: {},
      viz: { volumeViz: "theta_drive", volumeDomain: "wallBand", gateSource: "schedule", gateView: true },
      geometry: {},
      mesh: { meshHash: "mesh-hash" },
      signatures,
    } as any)!;

    const sidecar = buildCardExportSidecar({
      timestampIso: "2024-01-01T00:00:00.000Z",
      canvas: { width: 100, height: 50, devicePixelRatio: 2 },
      overlayEnabled: true,
      pipeline: { mode: "hover" },
      hull: { Lx_m: 3, Ly_m: 2, Lz_m: 1 },
      overlayFrame: { TS: 1.23 },
      geometryUpdatePayload: { hull: { Lx_m: 3 } },
      mesh: { meshHash: "mesh-hash" } as any,
      renderedPath: {
        warpGeometryKind: "sdf",
        warpGeometryAssetId: "asset-1",
        meshHash: "mesh-hash",
        latticeHashes: { volume: "vol-hash", sdf: "sdf-hash" },
        geometrySource: "preview",
      },
      replayPayload: {
        pipelineUpdate: { hull: { Lx_m: 3 } },
        viewer: { camera: { preset: "threeQuarterFront" } },
        signatures,
        cardRecipe,
      },
      cardRecipe,
      signatures,
    });

    expect(sidecar.cardRecipe?.schemaVersion).toBe(CARD_RECIPE_SCHEMA_VERSION);
    expect(sidecar.replayPayload?.cardRecipe?.mesh?.meshHash).toBe("mesh-hash");
    expect(sidecar.replayPayload?.signatures?.meshHash).toBe("mesh-hash");
    expect(sidecar.replayPayload?.signatures?.geometrySignature).toBeDefined();
    for (const key of CARD_SIGNATURE_KEYS) {
      expect(sidecar.replayPayload?.signatures).toHaveProperty(key);
      expect(sidecar.cardRecipe?.signatures).toHaveProperty(key);
    }
  });

  it("backfills replay signatures when only a partial signature set is provided", () => {
    const sidecar = buildCardExportSidecar({
      timestampIso: "2024-01-01T00:00:00.000Z",
      canvas: { width: 1, height: 1, devicePixelRatio: 1 },
      overlayEnabled: false,
      pipeline: null,
      hull: null,
      overlayFrame: null,
      geometryUpdatePayload: null,
      mesh: null,
      replayPayload: {
        pipelineUpdate: null,
        viewer: {},
        signatures: null,
      },
      cardRecipe: null,
      signatures: { meshHash: "abc123" },
    });

    expect(sidecar.replayPayload?.signatures?.meshHash).toBe("abc123");
    for (const key of CARD_SIGNATURE_KEYS) {
      expect(sidecar.replayPayload?.signatures).toHaveProperty(key);
    }
  });

  it("threads lattice attachments into replayPayload when provided", () => {
    const sidecar = buildCardExportSidecar({
      timestampIso: "2024-01-01T00:00:00.000Z",
      canvas: { width: 1, height: 1, devicePixelRatio: 1 },
      overlayEnabled: false,
      pipeline: null,
      hull: null,
      overlayFrame: null,
      geometryUpdatePayload: null,
      mesh: null,
      lattice: {
        meta: { hashes: { volume: "vol-hash" }, enabled: true } as any,
        assets: {
          volumeRG16F: {
            filename: "vol.bin",
            byteLength: 16,
            sha256: "deadbeef",
            encoding: "rg16f-le",
          },
        },
      },
      replayPayload: {
        pipelineUpdate: null,
        viewer: {},
        signatures: null,
      },
      cardRecipe: null,
      signatures: null,
    });

    expect(sidecar.replayPayload?.lattice?.meta?.hashes?.volume).toBe("vol-hash");
    expect(sidecar.replayPayload?.lattice?.assets?.volumeRG16F?.filename).toBe("vol.bin");
  });
});
