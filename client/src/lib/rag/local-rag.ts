import { cosineSimilarity, hashEmbed } from "@/lib/embeddings/hash-embed";
import type { RagChunk, RankedChunk } from "./types";

function ensureEmbeddings(chunks: RagChunk[], dim = 512) {
  return chunks.map((chunk) => {
    if (chunk.embed) return chunk;
    const embed = hashEmbed(chunk.text, dim);
    return { ...chunk, embed };
  });
}

export function rank(query: string, chunks: RagChunk[], topK = 6): RankedChunk[] {
  if (!query.trim()) return [];

  const q = hashEmbed(query);
  const withEmbeds = ensureEmbeddings(chunks);
  const scored = withEmbeds.map((chunk) => ({
    chunk,
    score: cosineSimilarity(q, chunk.embed!),
  }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.chunk.chunkId < b.chunk.chunkId ? -1 : a.chunk.chunkId > b.chunk.chunkId ? 1 : 0;
  });
  return scored.slice(0, Math.max(1, topK));
}

export type { RagChunk, RankedChunk } from "./types";
