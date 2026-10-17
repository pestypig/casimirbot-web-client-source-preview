import type { LumaMood } from "../luma-moods";
import type { SurfaceLayerMotion, SurfaceOrientation, SurfaceWorldAsset } from "./types";

const WORLD_ASSETS: SurfaceWorldAsset[] = [
  {
    id: "canyon-360-01",
    mood: "mad",
    orientation: "desktop",
    src: "/surfacekit/worlds/desktop/mad/canyon-360-01.svg",
    mode: "wander",
    safeCenter: true,
  },
  {
    id: "ember-vertical-01",
    mood: "mad",
    orientation: "mobile",
    src: "/surfacekit/worlds/mobile/mad/ember-vertical-01.svg",
    mode: "wander",
    safeCenter: true,
  },
  {
    id: "fog-360-01",
    mood: "upset",
    orientation: "desktop",
    src: "/surfacekit/worlds/desktop/upset/fog-360-01.svg",
    mode: "wander",
    safeCenter: true,
  },
  {
    id: "fog-vertical-01",
    mood: "upset",
    orientation: "mobile",
    src: "/surfacekit/worlds/mobile/upset/fog-vertical-01.svg",
    mode: "wander",
    safeCenter: true,
  },
  {
    id: "storm-360-01",
    mood: "shock",
    orientation: "desktop",
    src: "/surfacekit/worlds/desktop/shock/storm-360-01.svg",
    mode: "wander",
    safeCenter: true,
  },
  {
    id: "storm-vertical-01",
    mood: "shock",
    orientation: "mobile",
    src: "/surfacekit/worlds/mobile/shock/storm-vertical-01.svg",
    mode: "wander",
    safeCenter: true,
  },
  {
    id: "river-360-01",
    mood: "question",
    orientation: "desktop",
    src: "/surfacekit/worlds/desktop/question/river-360-01.svg",
    mode: "wander",
    safeCenter: true,
  },
  {
    id: "river-vertical-01",
    mood: "question",
    orientation: "mobile",
    src: "/surfacekit/worlds/mobile/question/river-vertical-01.svg",
    mode: "wander",
    safeCenter: true,
  },
  {
    id: "meadow-360-01",
    mood: "happy",
    orientation: "desktop",
    src: "/surfacekit/worlds/desktop/happy/meadow-360-01.svg",
    mode: "wander",
    safeCenter: true,
  },
  {
    id: "meadow-vertical-01",
    mood: "happy",
    orientation: "mobile",
    src: "/surfacekit/worlds/mobile/happy/meadow-vertical-01.svg",
    mode: "wander",
    safeCenter: true,
  },
  {
    id: "harbor-360-01",
    mood: "friend",
    orientation: "desktop",
    src: "/surfacekit/worlds/desktop/friend/harbor-360-01.svg",
    mode: "wander",
    safeCenter: true,
  },
  {
    id: "harbor-vertical-01",
    mood: "friend",
    orientation: "mobile",
    src: "/surfacekit/worlds/mobile/friend/harbor-vertical-01.svg",
    mode: "wander",
    safeCenter: true,
  },
  {
    id: "garden-360-01",
    mood: "love",
    orientation: "desktop",
    src: "/surfacekit/worlds/desktop/love/garden-360-01.svg",
    mode: "wander",
    safeCenter: true,
  },
  {
    id: "garden-vertical-01",
    mood: "love",
    orientation: "mobile",
    src: "/surfacekit/worlds/mobile/love/garden-vertical-01.svg",
    mode: "wander",
    safeCenter: true,
  },
];

const MOOD_MOTION: Record<LumaMood, { durationMs: number; xPct: number; yPct: number; scale: number }> = {
  mad: { durationMs: 72000, xPct: 2.6, yPct: 1.8, scale: 1.11 },
  upset: { durationMs: 128000, xPct: 1.6, yPct: 1.4, scale: 1.08 },
  shock: { durationMs: 64000, xPct: 2.8, yPct: 2.1, scale: 1.12 },
  question: { durationMs: 98000, xPct: 2.1, yPct: 1.7, scale: 1.09 },
  happy: { durationMs: 104000, xPct: 1.9, yPct: 1.6, scale: 1.08 },
  friend: { durationMs: 108000, xPct: 2, yPct: 1.5, scale: 1.08 },
  love: { durationMs: 136000, xPct: 1.5, yPct: 1.3, scale: 1.07 },
};

export function findSurfaceWorldAsset(
  mood: LumaMood,
  orientation: SurfaceOrientation,
  rng: () => number,
) {
  const candidates = WORLD_ASSETS.filter(
    (world) => world.mood === mood && world.orientation === orientation,
  );
  const fallback = WORLD_ASSETS.filter(
    (world) => world.mood === "question" && world.orientation === orientation,
  );
  const pool = candidates.length > 0 ? candidates : fallback;
  return pool[Math.floor(rng() * pool.length)] ?? null;
}

export function buildSurfaceWorldMotion(
  world: SurfaceWorldAsset,
  rng: () => number,
): SurfaceLayerMotion {
  if (world.mode === "scroll-x") {
    return {
      type: "scroll-x",
      durationMs: 150000 + Math.round(rng() * 30000),
      direction: rng() > 0.5 ? "right" : "left",
    };
  }

  const tuning = MOOD_MOTION[world.mood] ?? MOOD_MOTION.question;
  const mobileMultiplier = world.orientation === "mobile" ? 1.12 : 1;
  return {
    type: "wander",
    durationMs: Math.round(tuning.durationMs * mobileMultiplier + rng() * 12000),
    scale: Number((tuning.scale + rng() * 0.018).toFixed(3)),
    xPct: Number((tuning.xPct * (world.orientation === "mobile" ? 0.62 : 1)).toFixed(2)),
    yPct: Number((tuning.yPct * (world.orientation === "mobile" ? 1.28 : 1)).toFixed(2)),
  };
}
