import { hashEmbed } from "../embeddings/hash-embed";
import { putChunks } from "./store";
import { deriveSectionPath } from "./section-path";
import type { ChunkRec } from "./types";

type ChunkDraft = {
  text: string;
  offset: number;
  lines: string[];
  page?: number;
};

const paragraphSplit = /\n{2,}/;

export function makeChunks(text: string, target = 800, overlap = 120) {
  const paragraphs = text.split(paragraphSplit).map((part) => part.trim()).filter(Boolean);
  const chunks: ChunkDraft[] = [];

  const spacer = "\n\n";
  let current: string[] = [];
  let carryOnly = false;
  let startOffset = 0;
  let offset = 0;

  for (const para of paragraphs) {
    if (!current.length) startOffset = offset;
    const candidateParts = [...current, para];
    const candidate = candidateParts.join(spacer);
    if (candidate.length >= target && candidateParts.length) {
      chunks.push({
        text: candidate,
        offset: startOffset,
        lines: candidate.split(/\n/),
        page: 0,
      });
      const keepChars = Math.max(0, candidate.length - overlap);
      const carry = candidate.slice(keepChars);
      startOffset += keepChars;
      current = carry ? [carry] : [];
      carryOnly = current.length > 0;
    } else {
      current = candidateParts;
      carryOnly = false;
    }
    offset += para.length + spacer.length;
  }

  if (current.length && !carryOnly) {
    const block = current.join(spacer);
    chunks.push({
      text: block,
      offset: startOffset,
      lines: block.split(/\n/),
      page: 0,
    });
  }

  return chunks;
}

async function readText(file: File) {
  if (file.type.includes("pdf")) {
    const { extractTextFromPDF } = await import("./ingest-pdf");
    return extractTextFromPDF(file);
  }
  return file.text();
}

type IngestDocParams = {
  file: File;
  docId: string;
  targetChunkSize?: number;
  overlap?: number;
  maxDocMB?: number;
};

export async function ingestDoc({
  file,
  docId,
  targetChunkSize = 800,
  overlap = 120,
  maxDocMB,
}: IngestDocParams) {
  const raw = await readText(file);
  const drafts = makeChunks(raw, targetChunkSize, overlap);
  const now = Date.now();

  const chunks: ChunkRec[] = drafts.map(({ text, offset, lines, page }) => ({
    chunkId: `${docId}:${page ?? 0}:${offset}`,
    docId,
    page,
    offset,
    sectionPath: deriveSectionPath(lines),
    text,
    embed: hashEmbed(text),
    createdAt: now,
  }));

  await putChunks(chunks, maxDocMB);
  return chunks;
}
