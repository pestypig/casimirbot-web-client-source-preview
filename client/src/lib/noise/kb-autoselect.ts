import type { BarWindow, KBMatch, KBTexture, Original } from "@/types/noise-gens";

export type AutoMatchContext = {
  original: Original | null;
  textures: KBTexture[];
  window?: BarWindow | null;
};

export function autoMatchTexture({ original, textures, window }: AutoMatchContext): KBMatch | null {
  if (!original || !textures.length) return null;
  const indexSeed = hashDeterministicSeed(original, window ?? undefined);
  const textureIndex = Math.abs(indexSeed) % textures.length;
  const fallbackIndex = textures.length > 1 ? (textureIndex + 1) % textures.length : textureIndex;
  const baseScore = 0.55 + ((Math.abs(indexSeed) % 37) / 100);
  const separation = textures.length > 1 ? Math.abs(textureIndex - fallbackIndex) / textures.length : 0.5;
  const confidence = clamp01(baseScore - 0.25 + separation);
  const score = clamp01(baseScore);
  return {
    kb: textures[textureIndex],
    score,
    confidence,
  };
}

export function hashDeterministicSeed(original: Original, window?: BarWindow): number {
  const windowKey = window ? `${window.startBar}:${window.endBar}` : "default";
  const value = `${original.id}|${windowKey}|${Math.round(original.duration ?? 0)}`;
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    const chr = value.charCodeAt(index);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

export function resolveTextureById(textures: KBTexture[], id: string | null | undefined): KBTexture | undefined {
  if (!id) return undefined;
  return textures.find((texture) => texture.id === id);
}
