export type SurfaceRng = () => number;

function xmur3(input: string) {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(seed: number): SurfaceRng {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSurfaceRng(seed: string): SurfaceRng {
  const seedFn = xmur3(seed);
  return mulberry32(seedFn());
}

export function pickOne<T>(items: T[], rng: SurfaceRng): T {
  const index = Math.floor(rng() * items.length);
  return items[Math.min(Math.max(index, 0), items.length - 1)];
}

export function pickRotation(rng: SurfaceRng, options: number[]): number {
  return pickOne(options, rng);
}

export function pickRange(rng: SurfaceRng, min: number, max: number): number {
  if (min === max) return min;
  return min + (max - min) * rng();
}
