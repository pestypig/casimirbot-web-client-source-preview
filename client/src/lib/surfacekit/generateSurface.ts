import type { LumaMood } from "../luma-moods";
import type { SurfaceContext, SurfaceLayer, SurfaceOrientation, SurfaceRecipe } from "./types";
import { SURFACE_GRADIENTS, SURFACE_LAMINATES, SURFACE_MEANDERS, SURFACE_MICRO } from "./slates";
import { SURFACE_PALETTES, findSurfacePalette } from "./palettes";
import { createSurfaceRng, pickOne, pickRange, pickRotation } from "./seed";
import { buildSurfaceWorldMotion, findSurfaceWorldAsset } from "./worlds";

export type SurfaceDensity = "low" | "medium" | "high";

export type GenerateSurfaceOptions = {
  seed?: string;
  context: SurfaceContext;
  paletteId?: string;
  density?: SurfaceDensity;
  mood?: LumaMood;
  orientation?: SurfaceOrientation;
};

const DEFAULT_SEED = "helix-surface-v1";
const ROTATIONS = [0, 90, 180, 270];

const CONTEXT_TUNING: Record<SurfaceContext, {
  gradientOpacity: number;
  laminateOpacity: number;
  meanderOpacity: number;
  microOpacity: number;
  microChance: number;
}> = {
  "desktop-wallpaper": {
    gradientOpacity: 0.34,
    laminateOpacity: 0.28,
    meanderOpacity: 0.18,
    microOpacity: 0.12,
    microChance: 0.35,
  },
  "desktop-window": {
    gradientOpacity: 0.25,
    laminateOpacity: 0.22,
    meanderOpacity: 0.16,
    microOpacity: 0.1,
    microChance: 0.25,
  },
  "mobile-shell": {
    gradientOpacity: 0.3,
    laminateOpacity: 0.24,
    meanderOpacity: 0.16,
    microOpacity: 0.1,
    microChance: 0.3,
  },
  "mobile-panel": {
    gradientOpacity: 0.22,
    laminateOpacity: 0.2,
    meanderOpacity: 0.14,
    microOpacity: 0.08,
    microChance: 0.2,
  },
};

const DENSITY_MULTIPLIER: Record<SurfaceDensity, number> = {
  low: 0.8,
  medium: 1,
  high: 1.35,
};

const MOOD_PALETTE: Record<LumaMood, string> = {
  mad: "ember-copper",
  upset: "ember-copper",
  shock: "ember-copper",
  question: "ion-blue",
  happy: "verdant",
  friend: "halo-teal",
  love: "ember-copper",
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function buildTransform(
  rng: () => number,
  options: {
    minScale?: number;
    maxScale?: number;
    maxShift?: number;
    rotations?: number[];
  } = {},
) {
  const minScale = options.minScale ?? 1;
  const maxScale = options.maxScale ?? 1.08;
  const maxShift = options.maxShift ?? 4;
  const rotations = options.rotations ?? ROTATIONS;
  const scale = pickRange(rng, minScale, maxScale);
  const shiftX = pickRange(rng, -maxShift, maxShift);
  const shiftY = pickRange(rng, -maxShift, maxShift);
  const rotate = rotations.length ? pickRotation(rng, rotations) : 0;
  return `translate(${shiftX}%, ${shiftY}%) scale(${scale}) rotate(${rotate}deg)`;
}

function resolvePalette(paletteId: string | undefined, rng: () => number) {
  return findSurfacePalette(paletteId) ?? pickOne(SURFACE_PALETTES, rng);
}

export function generateSurfaceRecipe(options: GenerateSurfaceOptions): SurfaceRecipe {
  const seed = (options.seed ?? DEFAULT_SEED).trim() || DEFAULT_SEED;
  const context = options.context;
  const density = options.density ?? "low";
  const mood = options.mood ?? "question";
  const orientation = options.orientation ?? (context === "mobile-shell" || context === "mobile-panel" ? "mobile" : "desktop");
  const rng = createSurfaceRng(`${seed}:${context}:${mood}:${orientation}`);
  const palette = resolvePalette(options.paletteId ?? MOOD_PALETTE[mood], rng);
  const gradient = pickOne(SURFACE_GRADIENTS, rng);
  const laminate = pickOne(SURFACE_LAMINATES, rng);
  const meander = pickOne(SURFACE_MEANDERS, rng);
  const world = context === "desktop-wallpaper" || context === "mobile-shell"
    ? findSurfaceWorldAsset(mood, orientation, rng)
    : null;

  const tuning = CONTEXT_TUNING[context] ?? CONTEXT_TUNING["desktop-wallpaper"];
  const microChance = clamp01(tuning.microChance * DENSITY_MULTIPLIER[density]);
  const includeMicro = SURFACE_MICRO.length > 0 && rng() < microChance;
  const micro = includeMicro ? pickOne(SURFACE_MICRO, rng) : null;

  const layers: SurfaceLayer[] = [
    {
      id: "paper-base",
      kind: "base",
      opacity: 1,
      background: "var(--surface-page-fill)",
    },
  ];

  if (world) {
    layers.push({
      id: world.id,
      kind: "world",
      opacity: 0.9,
      imageUrl: world.src,
      motion: buildSurfaceWorldMotion(world, rng),
      mask: world.safeCenter ? "center-safe" : "none",
      source: "asset",
    });
    layers.push({
      id: `fixed-page-${meander.id}`,
      kind: "page",
      opacity: 1,
      background:
        "radial-gradient(ellipse at center, var(--surface-page-fill) 0%, var(--surface-page-fill) 43%, rgba(255, 255, 255, 0) 69%)",
    });
  }

  layers.push(
    {
      id: gradient.id,
      kind: "gradient",
      opacity: tuning.gradientOpacity,
      blendMode: world ? "soft-light" : "screen",
      transform: buildTransform(rng, { minScale: 1.02, maxScale: 1.1 }),
      svg: gradient.svg,
    },
    {
      id: laminate.id,
      kind: "laminate",
      opacity: tuning.laminateOpacity,
      blendMode: world ? "overlay" : "soft-light",
      transform: buildTransform(rng, { minScale: 1.01, maxScale: 1.08, maxShift: 3 }),
      svg: laminate.svg,
    },
    {
      id: meander.id,
      kind: world ? "page" : "meander",
      opacity: tuning.meanderOpacity,
      blendMode: "normal",
      transform: buildTransform(rng, { minScale: 1, maxScale: 1.05, maxShift: 2 }),
      svg: meander.svg,
    },
  );

  if (micro) {
    layers.push({
      id: micro.id,
      kind: "micro",
      opacity: tuning.microOpacity,
      blendMode: "overlay",
      transform: buildTransform(rng, { minScale: 1, maxScale: 1.02, maxShift: 1, rotations: [0, 90] }),
      svg: micro.svg,
    });
  }

  const vars = {
    "--surface-base": palette.base,
    "--surface-page-fill": palette.base,
    "--surface-ink": palette.ink,
    "--surface-ink-soft": palette.inkSoft,
    "--surface-laminate": palette.laminate,
    "--surface-laminate-soft": palette.laminateSoft,
    "--surface-glow": palette.glow,
  };

  return {
    id: `surface-${context}-${orientation}-${mood}-${palette.id}-${world?.id ?? "flat"}-${gradient.id}-${laminate.id}-${meander.id}-${micro?.id ?? "none"}`,
    seed,
    context,
    palette,
    vars,
    layers,
  };
}
