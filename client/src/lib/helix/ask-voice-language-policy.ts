const UNKNOWN_LANGUAGE_TAGS = new Set(["unknown", "auto", "und", "none", "null"]);

export type HelixAskVoiceSourceLanguageInput = {
  sourceLanguage: string | null | undefined;
  languageDetected: string | null | undefined;
  sourceText: string | null | undefined;
  translated: boolean;
  sessionLockedLanguage: string | null | undefined;
};

export type HelixAskVoiceResponseLanguageInput = {
  preferredResponseLanguage: string | undefined;
  sourceLanguage: string | null | undefined;
  languageDetected: string | null | undefined;
  sessionLockedLanguage: string | null | undefined;
};

export type HelixAskHighRiskTranslationContextInput = {
  translationUncertain: boolean;
  sourceLanguage?: string | null;
  sourceText?: string | null;
  translated?: boolean;
};

export const normalizeVoiceLanguageTag = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (!trimmed || UNKNOWN_LANGUAGE_TAGS.has(trimmed)) return null;
  return trimmed;
};

export const isEnglishLikeLanguageTag = (value: string | null | undefined): boolean => {
  const normalized = normalizeVoiceLanguageTag(value);
  if (!normalized) return false;
  return normalized === "en" || normalized.startsWith("en-");
};

export const inferLanguageTagFromSourceText = (text: string): string | null => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (/[\u3040-\u30ff]/u.test(trimmed)) return "ja";
  if (/[\uac00-\ud7af]/u.test(trimmed)) return "ko";
  if (/[\u4e00-\u9fff\u3400-\u4dbf]/u.test(trimmed)) return "zh-hans";
  if (/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/u.test(trimmed)) return "ar";
  if (/[\u0400-\u04ff]/u.test(trimmed)) return "ru";
  return null;
};

export const resolveVoiceSourceLanguage = (args: HelixAskVoiceSourceLanguageInput): string | null => {
  const source = normalizeVoiceLanguageTag(args.sourceLanguage);
  const detected = normalizeVoiceLanguageTag(args.languageDetected);
  const locked = normalizeVoiceLanguageTag(args.sessionLockedLanguage);
  const candidate = source ?? detected;
  if (candidate && !isEnglishLikeLanguageTag(candidate)) return candidate;
  if (args.translated) {
    const inferred = inferLanguageTagFromSourceText(args.sourceText ?? "");
    if (inferred && !isEnglishLikeLanguageTag(inferred)) return inferred;
  }
  if (locked && !isEnglishLikeLanguageTag(locked)) return locked;
  return candidate ?? locked ?? null;
};

export const resolveVoiceResponseLanguage = (args: HelixAskVoiceResponseLanguageInput): string | undefined => {
  const preferred = normalizeVoiceLanguageTag(args.preferredResponseLanguage ?? null);
  if (preferred) return preferred;
  const locked = normalizeVoiceLanguageTag(args.sessionLockedLanguage);
  if (locked) return locked;
  const source = normalizeVoiceLanguageTag(args.sourceLanguage);
  if (source) return source;
  const detected = normalizeVoiceLanguageTag(args.languageDetected);
  if (detected) return detected;
  return undefined;
};

export function isHighRiskTranslationContext(args: HelixAskHighRiskTranslationContextInput): boolean {
  if (!args.translationUncertain && !args.translated) return false;
  const normalizedSourceLanguage = normalizeVoiceLanguageTag(args.sourceLanguage ?? null);
  if (normalizedSourceLanguage && !isEnglishLikeLanguageTag(normalizedSourceLanguage)) {
    return true;
  }
  const inferredSourceLanguage = inferLanguageTagFromSourceText(args.sourceText ?? "");
  return Boolean(inferredSourceLanguage && !isEnglishLikeLanguageTag(inferredSourceLanguage));
}
