import {
  hash01,
  probabilityTerrainNoise2D,
} from "@/lib/probability/probabilityTerrainField";

export function biomeNoise2D(seed: string, x: number, y: number, octaveCount = 4): number {
  return probabilityTerrainNoise2D(seed, x, y, octaveCount);
}

export { hash01 };
