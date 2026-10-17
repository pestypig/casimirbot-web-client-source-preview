import { sha256Hex } from "@/utils/sha";
import { resolveHullBasis, type HullBasisResolved } from "@shared/hull-basis";
import { CARD_RECIPE_SCHEMA_VERSION, type BasisTransform, type CardRecipeSignatures } from "@shared/schema";

export const SIGNATURE_HASH_LENGTH = 16;

export function stableStringify(value: any): string {
  const normalize = (val: any): any => {
    if (val === null || typeof val !== "object") return val;
    if (Array.isArray(val)) return val.map(normalize);
    const entries = Object.entries(val as Record<string, any>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const out: Record<string, any> = {};
    for (const [k, v] of entries) out[k] = normalize(v);
    return out;
  };
  return JSON.stringify(normalize(value));
}

export async function hashSignature(value: any) {
  return (await sha256Hex(stableStringify(value))).slice(0, SIGNATURE_HASH_LENGTH);
}

export function normalizeBasisForSignature(basis: BasisTransform | HullBasisResolved | null | undefined, extraScale?: ArrayLike<number> | null) {
  const resolved = resolveHullBasis(basis ?? undefined, extraScale);
  return {
    swap: resolved.swap,
    flip: resolved.flip,
    scale: resolved.scale,
    forward: resolved.forward,
    up: resolved.up,
    right: resolved.right,
  };
}

export function normalizeTilesForSignature(tiles?: ArrayLike<number> | null): number[] | null {
  if (!tiles) return null;
  const arr = Array.from(tiles as ArrayLike<number>)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v >= 0);
  if (!arr.length) return null;
  const max = Math.max(...arr, 1e-9);
  return arr.map((v) => v / max);
}

type VizSignatureInput = {
  volumeViz?: unknown;
  volumeDomain?: unknown;
  volumeSource?: unknown;
  planarVizMode?: unknown;
  vizFloors?: unknown;
  gate?: unknown;
  opacityWindow?: [number, number] | null;
  bounds?: { domainScale?: number } | null;
  boundsProfile?: unknown;
  palette?: unknown;
  spacetimeGrid?: unknown;
};

type ProfileSignatureInput = {
  profileTag?: string | null;
  qualityPreset?: unknown;
  qualityOverrides?: unknown;
  volumeDomain?: unknown;
};

type GeometrySignatureInput = {
  warpGeometryKind?: unknown;
  warpGeometryAssetId?: unknown;
  meshHash?: string | null;
  geometrySource?: unknown;
  fallback?: {
    mode?: unknown;
    applied?: unknown;
    resolvedKind?: unknown;
    requestedKind?: unknown;
    reasons?: unknown;
    blocked?: unknown;
  } | null;
  lattice?: {
    enabled?: boolean | null;
    preset?: unknown;
    profileTag?: unknown;
    volumeHash?: string | null;
    sdfHash?: string | null;
    strobeHash?: string | null;
    weightsHash?: string | null;
    clampReasons?: string[] | null;
    updatedAt?: number | null;
  } | null;
};

type HullSignatureInput = {
  dims_m: { Lx_m: number; Ly_m: number; Lz_m: number };
  area_m2?: number | null;
  areaSource?: unknown;
  source?: unknown;
};

type MeshSignatureInput = {
  meshHash?: string | null;
  decimation?: unknown;
  fitBounds?: unknown;
  triangleCount?: number | null;
  vertexCount?: number | null;
  lod?: unknown;
  lodTag?: unknown;
};

export interface CardSignatureInputs {
  mesh?: MeshSignatureInput | null;
  basis?: BasisTransform | HullBasisResolved | null;
  basisScale?: ArrayLike<number> | null;
  hull?: HullSignatureInput | null;
  blanketTiles?: ArrayLike<number> | null;
  viz?: VizSignatureInput | null;
  profile?: ProfileSignatureInput | null;
  geometry?: GeometrySignatureInput | null;
}

export async function buildCardSignatures(input: CardSignatureInputs): Promise<CardRecipeSignatures> {
  const signatures: CardRecipeSignatures = {
    meshHash: input.mesh?.meshHash ?? undefined,
    meshSignature: undefined,
    basisSignature: undefined,
    hullSignature: undefined,
    blanketSignature: undefined,
    vizSignature: undefined,
    profileSignature: undefined,
    geometrySignature: undefined,
  };

  if (input.mesh) {
    signatures.meshSignature = await hashSignature({
      meshHash: input.mesh.meshHash,
      decimation: input.mesh.decimation,
      fitBounds: input.mesh.fitBounds,
      triangleCount: input.mesh.triangleCount,
      vertexCount: input.mesh.vertexCount,
      lod: input.mesh.lod ?? input.mesh.lodTag,
    });
  }

  const basis = input.basis ?? undefined;
  if (basis) {
    signatures.basisSignature = await hashSignature(normalizeBasisForSignature(basis, input.basisScale));
  }

  if (input.hull) {
    signatures.hullSignature = await hashSignature({
      dims_m: input.hull.dims_m,
      area_m2: input.hull.area_m2,
      areaSource: input.hull.areaSource,
      source: input.hull.source,
    });
  }

  const blanketNormalized = normalizeTilesForSignature(input.blanketTiles);
  if (blanketNormalized) {
    signatures.blanketSignature = await hashSignature({ tiles: blanketNormalized });
  }

  if (input.viz) {
    signatures.vizSignature = await hashSignature({
      volumeViz: input.viz.volumeViz,
      volumeDomain: input.viz.volumeDomain,
      volumeSource: input.viz.volumeSource,
      planarVizMode: input.viz.planarVizMode,
      vizFloors: input.viz.vizFloors,
      gate: input.viz.gate,
      opacityWindow: input.viz.opacityWindow,
      bounds: input.viz.bounds ? { domainScale: input.viz.bounds.domainScale } : undefined,
      boundsProfile: input.viz.boundsProfile,
      palette: input.viz.palette,
      spacetimeGrid: input.viz.spacetimeGrid,
    });
  }

  if (input.profile) {
    signatures.profileSignature = await hashSignature({
      profileTag: input.profile.profileTag,
      qualityPreset: input.profile.qualityPreset,
      qualityOverrides: input.profile.qualityOverrides,
      volumeDomain: input.profile.volumeDomain,
    });
  }

  if (input.geometry) {
    signatures.geometrySignature = await hashSignature({
      warpGeometryKind: input.geometry.warpGeometryKind,
      warpGeometryAssetId: input.geometry.warpGeometryAssetId,
      meshHash: input.geometry.meshHash,
      geometrySource: input.geometry.geometrySource,
      fallback: input.geometry.fallback
        ? {
            mode: input.geometry.fallback.mode,
            applied: input.geometry.fallback.applied,
            resolvedKind: input.geometry.fallback.resolvedKind,
            requestedKind: input.geometry.fallback.requestedKind,
            reasons: input.geometry.fallback.reasons,
            blocked: input.geometry.fallback.blocked,
          }
        : null,
      lattice: input.geometry.lattice
        ? {
            enabled: input.geometry.lattice.enabled,
            preset: input.geometry.lattice.preset,
            profileTag: input.geometry.lattice.profileTag,
            volumeHash: input.geometry.lattice.volumeHash,
            sdfHash: input.geometry.lattice.sdfHash,
            strobeHash: input.geometry.lattice.strobeHash,
            weightsHash: input.geometry.lattice.weightsHash,
            clampReasons: input.geometry.lattice.clampReasons,
            updatedAt: input.geometry.lattice.updatedAt,
          }
        : null,
    });
  }

  return signatures;
}

export function ensureCardRecipeSchemaVersion<T extends { schemaVersion?: number }>(
  cardRecipe: T | null | undefined,
  fallback = CARD_RECIPE_SCHEMA_VERSION,
): (T & { schemaVersion: number }) | null {
  if (!cardRecipe) return null;
  return {
    ...cardRecipe,
    schemaVersion: cardRecipe.schemaVersion ?? fallback,
  };
}
