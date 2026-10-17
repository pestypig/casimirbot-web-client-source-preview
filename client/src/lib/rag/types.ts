export type DocMeta = {
  docId: string;
  sha256: string;
  title: string;
  url?: string;
  licenseApproved: boolean;
  bytes: number;
  createdAt: number;
};

export type ChunkRec = {
  chunkId: string;
  docId: string;
  page?: number;
  offset: number;
  sectionPath?: string;
  text: string;
  embed?: Float32Array;
  createdAt: number;
};

export type RagChunk = ChunkRec & {
  meta?: DocMeta;
  title?: string;
  url?: string;
};

export type RankedChunk = { chunk: RagChunk; score: number };
