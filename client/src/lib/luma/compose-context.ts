import { atlasSearch } from "../code-index/search";
import { rank as rankDocs } from "../rag/local-rag";
import { getAllChunks } from "../rag/store";
import type { RagChunk } from "../rag/types";

type RankedDoc = Awaited<ReturnType<typeof rankDocs>>[number];

let docChunkCache: RagChunk[] | null = null;

async function loadDocChunks() {
  if (!docChunkCache) {
    docChunkCache = await getAllChunks();
  }
  return docChunkCache;
}

function normalizeReference(text: string | undefined) {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim();
}

export async function buildContext(query: string, kDoc = 4, kCode = 4) {
  const [chunks, codeHits] = await Promise.all([
    loadDocChunks().then((all) => rankDocs(query, all, kDoc)),
    atlasSearch(query, { topK: kCode, includeEquations: true }),
  ]);

  const docSection = chunks.map((entry, index) => {
    const text = entry.chunk.text.trim();
    return `[D${index + 1}] ${text}`;
  });

  const codeSection = codeHits.map((hit, index) => {
    const doc = hit.symbol.doc ? `${hit.symbol.doc.trim()}\n` : "";
    const snippet = hit.symbol.text.trim();
    return `[C${index + 1}] ${doc}${snippet}`;
  });

  const refs = [
    ...chunks.map((entry, index) => {
      const label = entry.chunk.title || entry.chunk.docId;
      const section = normalizeReference(entry.chunk.sectionPath);
      const suffix = section ? ` ${section}` : "";
      return `[D${index + 1}] ${label}${suffix}`.trim();
    }),
    ...codeHits.map((hit, index) => {
      const commit = hit.symbol.commit ? `@${hit.symbol.commit}` : "";
      return `[C${index + 1}] ${hit.symbol.path}#${hit.symbol.symbol}${commit}`;
    }),
  ].join("\n");

  const context = [
    "DOCUMENTS:",
    ...docSection,
    "CODE:",
    ...codeSection,
    "References:",
    refs,
  ].join("\n\n");

  return {
    context,
    refsMeta: {
      docIds: chunks.map((entry: RankedDoc) => entry.chunk.docId),
      codeChunks: codeHits.map((hit) => hit.symbol.chunkId),
    },
  };
}

export function resetComposeContextCache() {
  docChunkCache = null;
}
