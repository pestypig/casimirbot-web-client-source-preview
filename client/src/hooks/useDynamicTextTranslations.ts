import React from "react";
import { requestDocumentTranslationUnits } from "@/lib/docs/documentTranslationClient";
import { hashDocumentSource, type DocumentTranslationUnit } from "@shared/document-translation";

const DYNAMIC_TEXT_TRANSLATION_CACHE_PREFIX = "casimir:dynamic-text-translations:v1";
const DYNAMIC_TEXT_TRANSLATION_BATCH_SIZE = 8;
const DYNAMIC_TEXT_TRANSLATION_CACHE_LIMIT = 500;

type DynamicTextTranslationInput = {
  locale: string;
  docPath: string;
  title?: string;
  texts: string[];
  enabled?: boolean;
};

type DynamicTextTranslationState = {
  translate: (text: string | null | undefined) => string;
  status: "idle" | "loading" | "ready" | "unavailable";
};

const normalizeText = (text: string | null | undefined) => (typeof text === "string" ? text.trim() : "");

const cacheKeyForLocale = (locale: string) => `${DYNAMIC_TEXT_TRANSLATION_CACHE_PREFIX}:${locale}`;

const sourceKeyForText = (text: string) => hashDocumentSource(text);

function readCache(locale: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(cacheKeyForLocale(locale)) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(locale: string, entries: Record<string, string>) {
  if (typeof window === "undefined") return;
  const limited = Object.fromEntries(Object.entries(entries).slice(-DYNAMIC_TEXT_TRANSLATION_CACHE_LIMIT));
  try {
    window.localStorage.setItem(cacheKeyForLocale(locale), JSON.stringify(limited));
  } catch {
    // Local cache is an optimization; rendering should not depend on it.
  }
}

function buildTranslationUnits(texts: string[]): DocumentTranslationUnit[] {
  return texts.map((text, index) => ({
    unit_id: `dynamic_text_${String(index + 1).padStart(4, "0")}`,
    kind: text.length <= 90 ? "heading" : "paragraph",
    source_markdown: text,
    translatable: true,
    protected_spans: [],
  }));
}

export function useDynamicTextTranslations({
  locale,
  docPath,
  title,
  texts,
  enabled = true,
}: DynamicTextTranslationInput): DynamicTextTranslationState {
  const normalizedLocale = normalizeText(locale).toLowerCase();
  const shouldTranslate = enabled && normalizedLocale.length > 0 && normalizedLocale !== "en";
  const uniqueTexts = React.useMemo(() => {
    const seen = new Set<string>();
    const next: string[] = [];
    for (const text of texts) {
      const normalized = normalizeText(text);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      next.push(normalized);
    }
    return next;
  }, [texts]);
  const sourceHash = React.useMemo(() => hashDocumentSource(uniqueTexts.join("\n")), [uniqueTexts]);
  const [translations, setTranslations] = React.useState<Record<string, string>>(() =>
    shouldTranslate ? readCache(normalizedLocale) : {},
  );
  const [status, setStatus] = React.useState<DynamicTextTranslationState["status"]>("idle");

  React.useEffect(() => {
    if (!shouldTranslate) {
      setStatus("idle");
      setTranslations({});
      return;
    }
    setTranslations(readCache(normalizedLocale));
  }, [normalizedLocale, shouldTranslate]);

  React.useEffect(() => {
    if (!shouldTranslate || uniqueTexts.length === 0) {
      setStatus("idle");
      return;
    }
    const missing = uniqueTexts.filter((text) => !translations[sourceKeyForText(text)]);
    if (missing.length === 0) {
      setStatus("ready");
      return;
    }

    const controller = new AbortController();
    const batchTexts = missing.slice(0, DYNAMIC_TEXT_TRANSLATION_BATCH_SIZE);
    const units = buildTranslationUnits(batchTexts);
    const unitTextById = new Map(units.map((unit) => [unit.unit_id, unit.source_markdown] as const));
    setStatus("loading");

    requestDocumentTranslationUnits(
      {
        doc_path: docPath,
        locale: normalizedLocale,
        source_hash: sourceHash,
        title,
        units,
      },
      controller.signal,
    )
      .then((result) => {
        setTranslations((current) => {
          const next = { ...current };
          for (const [unitId, translated] of Object.entries(result.translations)) {
            const sourceText = unitTextById.get(unitId);
            const normalizedTranslation = normalizeText(translated);
            if (!sourceText || !normalizedTranslation) continue;
            next[sourceKeyForText(sourceText)] = normalizedTranslation;
          }
          writeCache(normalizedLocale, next);
          return next;
        });
        setStatus("ready");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("unavailable");
      });

    return () => controller.abort();
  }, [docPath, normalizedLocale, shouldTranslate, sourceHash, title, translations, uniqueTexts]);

  const translate = React.useCallback(
    (text: string | null | undefined) => {
      const normalized = normalizeText(text);
      if (!normalized || !shouldTranslate) return text ?? "";
      return translations[sourceKeyForText(normalized)] ?? text ?? "";
    },
    [shouldTranslate, translations],
  );

  return { translate, status };
}
