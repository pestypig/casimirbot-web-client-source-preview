import type { CardLatticeMetadata, CardMeshMetadata, CardRecipe, CardRecipeSignatures } from "@shared/schema";
import type { LatticeTextureAssetRef } from "@/lib/lattice-export";

export const CARD_SIGNATURE_KEYS: Array<keyof CardRecipeSignatures> = [
  "meshHash",
  "meshSignature",
  "basisSignature",
  "hullSignature",
  "blanketSignature",
  "vizSignature",
  "profileSignature",
  "geometrySignature",
];

export function normalizeCardSignatures(
  signatures?: Partial<CardRecipeSignatures> | null,
): CardRecipeSignatures | null {
  if (!signatures) return null;
  return CARD_SIGNATURE_KEYS.reduce<CardRecipeSignatures>(
    (acc, key) => {
      acc[key] = signatures[key];
      return acc;
    },
    {
      meshHash: undefined,
      meshSignature: undefined,
      basisSignature: undefined,
      hullSignature: undefined,
      blanketSignature: undefined,
      vizSignature: undefined,
      profileSignature: undefined,
      geometrySignature: undefined,
    },
  );
}

type LatticeAttachment = {
  meta: CardLatticeMetadata | null;
  assets?: {
    volumeRG16F?: LatticeTextureAssetRef;
    sdfR8?: LatticeTextureAssetRef;
  } | null;
} | null;

export type CardExportSidecar = {
  capturedAt: string;
  canvas: { width: number; height: number; devicePixelRatio: number };
  overlayEnabled: boolean;
  pipeline: unknown;
  hull: unknown;
  overlayFrame: unknown;
  geometryUpdatePayload: unknown;
  mesh: CardMeshMetadata | null;
  lattice?: LatticeAttachment;
  renderedPath?: {
    warpGeometryKind?: CardRecipe["geometry"]["warpGeometryKind"];
    warpGeometryAssetId?: string | null;
    meshHash?: string | null;
    meshSignature?: string | null;
    basisSignature?: string | null;
    latticeHashes?: CardLatticeMetadata["hashes"];
    latticeEnabled?: boolean | null;
    geometrySource?: CardMeshMetadata["geometrySource"];
    fallback?: {
      mode?: string | null;
      resolvedKind?: string | null;
      requestedKind?: string | null;
      applied?: boolean | null;
      blocked?: boolean | null;
      reasons?: string[] | null;
    } | null;
  } | null;
  replayPayload: {
    pipelineUpdate: unknown;
    viewer: unknown;
    signatures?: CardRecipeSignatures | null;
    cardRecipe?: CardRecipe | null;
    lattice?: LatticeAttachment;
  } | null;
  cardRecipe: CardRecipe | null;
  cardProfile?: unknown;
};

type CardExportSidecarInput = {
  timestampIso: string;
  canvas: { width: number; height: number; devicePixelRatio: number };
  overlayEnabled: boolean;
  pipeline: unknown;
  hull: unknown;
  overlayFrame: unknown;
  geometryUpdatePayload: unknown;
  mesh: CardMeshMetadata | null;
  lattice?: LatticeAttachment;
  renderedPath?: CardExportSidecar["renderedPath"] | null;
  replayPayload?: {
    pipelineUpdate: unknown;
    viewer: unknown;
    signatures?: Partial<CardRecipeSignatures> | null;
    cardRecipe?: CardRecipe | null;
    lattice?: LatticeAttachment;
  } | null;
  cardRecipe?: CardRecipe | null;
  cardProfile?: unknown;
  signatures?: Partial<CardRecipeSignatures> | null;
};

export function buildCardExportSidecar(input: CardExportSidecarInput): CardExportSidecar {
  const normalizedSignatures = normalizeCardSignatures(
    input.signatures ?? input.replayPayload?.signatures ?? input.cardRecipe?.signatures ?? null,
  );

  const latticeNormalized: LatticeAttachment =
    input.lattice ??
    input.replayPayload?.lattice ??
    (input.cardRecipe?.lattice
      ? { meta: input.cardRecipe.lattice, assets: null }
      : null);

  const replayPayload = input.replayPayload
    ? {
        ...input.replayPayload,
        signatures: normalizeCardSignatures(input.replayPayload.signatures ?? normalizedSignatures),
        cardRecipe: input.replayPayload.cardRecipe ?? input.cardRecipe ?? undefined,
        lattice: input.replayPayload.lattice ?? latticeNormalized ?? undefined,
      }
    : input.cardRecipe || normalizedSignatures
      ? {
          pipelineUpdate: null,
          viewer: null,
          signatures: normalizeCardSignatures(normalizedSignatures),
          cardRecipe: input.cardRecipe ?? undefined,
          lattice: latticeNormalized ?? undefined,
        }
      : null;

  return {
    capturedAt: input.timestampIso,
    canvas: input.canvas,
    overlayEnabled: input.overlayEnabled,
    pipeline: input.pipeline ?? null,
    hull: input.hull ?? null,
    overlayFrame: input.overlayFrame ?? null,
    geometryUpdatePayload: input.geometryUpdatePayload ?? null,
    mesh: input.mesh ?? null,
    ...(latticeNormalized
      ? {
          lattice: {
            meta: latticeNormalized.meta ?? null,
            assets: latticeNormalized.assets ?? null,
          },
        }
      : {}),
    ...(input.renderedPath ? { renderedPath: input.renderedPath } : {}),
    replayPayload,
    cardRecipe: input.cardRecipe ?? null,
    cardProfile: input.cardProfile ?? undefined,
  };
}
