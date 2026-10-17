import { getShard, putShard } from "./idb-store";
import type { WeightManifest } from "./manifest";

async function sha256(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export type ShardProgress = { downloaded: number; total: number };

export async function ensureWeights(
  manifestUrl: string,
  onProgress?: (progress: ShardProgress) => void,
) {
  const manifestResponse = await fetch(manifestUrl);
  if (!manifestResponse.ok) {
    throw new Error(`Failed to fetch manifest: ${manifestResponse.status}`);
  }
  const manifest = (await manifestResponse.json()) as WeightManifest;

  let downloaded = 0;
  const total = manifest.shards.reduce((sum, shard) => sum + shard.size, 0);

  for (const shard of manifest.shards) {
    const key = `${manifest.modelName}/${shard.sha256}`;
    const cached = await getShard(key);
    if (!cached) {
      const shardResponse = await fetch(shard.url);
      if (!shardResponse.ok) {
        throw new Error(`Failed to fetch shard: ${shardResponse.status}`);
      }
      const buffer = await shardResponse.arrayBuffer();
      const sum = await sha256(buffer);
      if (sum !== shard.sha256) {
        throw new Error(`SHA mismatch for ${shard.url}`);
      }
      await putShard(key, buffer);
    }
    downloaded += shard.size;
    onProgress?.({ downloaded, total });
  }

  const vocabResponse = await fetch(manifest.vocabUrl);
  if (!vocabResponse.ok) {
    throw new Error(`Failed to fetch vocab: ${vocabResponse.status}`);
  }
  const vocab = await vocabResponse.arrayBuffer();

  return { manifest, vocab };
}

export async function loadShard(manifest: WeightManifest, index: number) {
  const shard = manifest.shards[index];
  if (!shard) throw new Error(`Shard index ${index} out of range`);
  const key = `${manifest.modelName}/${shard.sha256}`;
  const buffer = await getShard(key);
  if (!buffer) {
    throw new Error(`Missing shard ${index} (${shard.sha256})`);
  }
  return new Uint8Array(buffer);
}
