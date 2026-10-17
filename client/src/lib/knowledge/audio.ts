import type { KnowledgeFileRecord } from "@/lib/agi/knowledge-store";

const AUDIO_MIME_PREFIX = "audio/";

export const isAudioKnowledgeFile = (record: KnowledgeFileRecord): boolean =>
  record.kind === "audio" || record.mime?.startsWith(AUDIO_MIME_PREFIX) === true;

export const deriveKnowledgeTitle = (record: KnowledgeFileRecord): string => {
  const base = record.name.replace(/\.[^/.]+$/, "");
  const normalized = base.replace(/[_-]+/g, " ").trim();
  return normalized || base || record.name;
};

export const pseudoListenCount = (record: KnowledgeFileRecord): number => {
  const source = record.hashSlug || record.id;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  const base = 320;
  const spread = 2400;
  return base + (hash % spread);
};
