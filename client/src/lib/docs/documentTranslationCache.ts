import {
  DOCUMENT_TRANSLATION_GLOSSARY_VERSION,
  DOCUMENT_TRANSLATION_MODEL_POLICY_VERSION,
  type DocumentTranslationResult,
} from "@shared/document-translation";

const CACHE_KEY = "casimir:document-translations:v1";
const MAX_CACHE_ENTRIES = 24;

type CacheStore = {
  entries: DocumentTranslationResult[];
};

export function readCachedDocumentTranslation(params: {
  docPath: string;
  locale: string;
  sourceHash: string;
}): DocumentTranslationResult | null {
  if (typeof window === "undefined") return null;
  const store = readStore();
  return (
    store.entries.find(
      (entry) =>
        entry.doc_path === params.docPath &&
        entry.locale === params.locale &&
        entry.source_hash === params.sourceHash &&
        entry.glossary_version === DOCUMENT_TRANSLATION_GLOSSARY_VERSION &&
        entry.model_policy_version === DOCUMENT_TRANSLATION_MODEL_POLICY_VERSION,
    ) ?? null
  );
}

export function writeCachedDocumentTranslation(result: DocumentTranslationResult): void {
  if (typeof window === "undefined") return;
  const store = readStore();
  const nextEntries = [
    result,
    ...store.entries.filter(
      (entry) =>
        !(
          entry.doc_path === result.doc_path &&
          entry.locale === result.locale &&
          entry.source_hash === result.source_hash
        ),
    ),
  ].slice(0, MAX_CACHE_ENTRIES);
  window.localStorage.setItem(CACHE_KEY, JSON.stringify({ entries: nextEntries } satisfies CacheStore));
}

function readStore(): CacheStore {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return { entries: [] };
    const parsed = JSON.parse(raw) as Partial<CacheStore>;
    return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
  } catch {
    return { entries: [] };
  }
}
