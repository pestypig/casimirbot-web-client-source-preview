import {
  INTERFACE_CATALOG_REVIEWED_COUNTS,
  INTERFACE_MESSAGE_COUNT,
} from "@/lib/i18n/messages/catalogMetadata";
import {
  SHARED_INTERFACE_LANGUAGE_CODES,
  type SharedInterfaceLanguageCode,
} from "@shared/interface-language-codes";
import type { HelixAccountType } from "@shared/helix-account-session";

export type InterfaceLanguageCode = SharedInterfaceLanguageCode;

export type InterfaceLanguageTranslationMode = "source" | "procedural_catalog";

export type InterfaceLanguageOption = {
  code: InterfaceLanguageCode;
  label: string;
  nativeLabel: string;
  bcp47: string;
  writingSystem: "Latn" | "Jpan" | "Kore" | "Hans" | "Arab";
  direction: "ltr" | "rtl";
  translationMode: InterfaceLanguageTranslationMode;
  releaseStatus: "public" | "developer_preview";
  readiness: string;
};

export const DEFAULT_INTERFACE_LANGUAGE: InterfaceLanguageCode = "en";

export const INTERFACE_LANGUAGE_OPTIONS: InterfaceLanguageOption[] = [
  {
    code: "en",
    label: "English",
    nativeLabel: "English",
    bcp47: "en",
    writingSystem: "Latn",
    direction: "ltr",
    translationMode: "source",
    releaseStatus: "public",
    readiness: "Source UI language",
  },
  {
    code: "haw",
    label: "Hawaiian",
    nativeLabel: "\u02bb\u014clelo Hawai\u02bbi",
    bcp47: "haw",
    writingSystem: "Latn",
    direction: "ltr",
    translationMode: "procedural_catalog",
    releaseStatus: "developer_preview",
    readiness: "Procedural localization seed",
  },
  {
    code: "es",
    label: "Spanish",
    nativeLabel: "Espa\u00f1ol",
    bcp47: "es",
    writingSystem: "Latn",
    direction: "ltr",
    translationMode: "procedural_catalog",
    releaseStatus: "developer_preview",
    readiness: "Catalog shell; English fallback observable",
  },
  {
    code: "fr",
    label: "French",
    nativeLabel: "Fran\u00e7ais",
    bcp47: "fr",
    writingSystem: "Latn",
    direction: "ltr",
    translationMode: "procedural_catalog",
    releaseStatus: "developer_preview",
    readiness: "Catalog shell; English fallback observable",
  },
  {
    code: "de",
    label: "German",
    nativeLabel: "Deutsch",
    bcp47: "de",
    writingSystem: "Latn",
    direction: "ltr",
    translationMode: "procedural_catalog",
    releaseStatus: "public",
    readiness: "Catalog shell; English fallback observable",
  },
  {
    code: "pt",
    label: "Portuguese",
    nativeLabel: "Portugu\u00eas",
    bcp47: "pt-BR",
    writingSystem: "Latn",
    direction: "ltr",
    translationMode: "procedural_catalog",
    releaseStatus: "developer_preview",
    readiness: "Catalog shell; English fallback observable",
  },
  {
    code: "ja",
    label: "Japanese",
    nativeLabel: "\u65e5\u672c\u8a9e",
    bcp47: "ja",
    writingSystem: "Jpan",
    direction: "ltr",
    translationMode: "procedural_catalog",
    releaseStatus: "developer_preview",
    readiness: "Catalog shell; English fallback observable",
  },
  {
    code: "ko",
    label: "Korean",
    nativeLabel: "\ud55c\uad6d\uc5b4",
    bcp47: "ko",
    writingSystem: "Kore",
    direction: "ltr",
    translationMode: "procedural_catalog",
    releaseStatus: "developer_preview",
    readiness: "Catalog shell; English fallback observable",
  },
  {
    code: "zh",
    label: "Chinese (Simplified)",
    nativeLabel: "\u7b80\u4f53\u4e2d\u6587",
    bcp47: "zh-Hans",
    writingSystem: "Hans",
    direction: "ltr",
    translationMode: "procedural_catalog",
    releaseStatus: "developer_preview",
    readiness: "Catalog shell; English fallback observable",
  },
  {
    code: "ar",
    label: "Arabic",
    nativeLabel: "\u0627\u0644\u0639\u0631\u0628\u064a\u0629",
    bcp47: "ar",
    writingSystem: "Arab",
    direction: "rtl",
    translationMode: "procedural_catalog",
    releaseStatus: "public",
    readiness: "Catalog shell; English fallback observable",
  },
  {
    code: "wo",
    label: "Wolof",
    nativeLabel: "Wolof làkk",
    bcp47: "wo",
    writingSystem: "Latn",
    direction: "ltr",
    translationMode: "procedural_catalog",
    releaseStatus: "developer_preview",
    readiness: "Catalog shell; English fallback observable",
  },
];

const interfaceLanguageCodes = new Set<InterfaceLanguageCode>(
  SHARED_INTERFACE_LANGUAGE_CODES,
);

export function normalizeInterfaceLanguageCode(value: unknown): InterfaceLanguageCode {
  if (typeof value !== "string") return DEFAULT_INTERFACE_LANGUAGE;
  const normalized = value.trim().toLowerCase().replace("_", "-");
  const primary = normalized.split("-")[0] as InterfaceLanguageCode;
  return interfaceLanguageCodes.has(primary) ? primary : DEFAULT_INTERFACE_LANGUAGE;
}

export function isInterfaceLanguageCode(value: unknown): value is InterfaceLanguageCode {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase().replace("_", "-");
  const primary = normalized.split("-")[0] as InterfaceLanguageCode;
  return interfaceLanguageCodes.has(primary);
}

export function getInterfaceLanguageOption(value: unknown): InterfaceLanguageOption {
  const code = normalizeInterfaceLanguageCode(value);
  return INTERFACE_LANGUAGE_OPTIONS.find((option) => option.code === code) ?? INTERFACE_LANGUAGE_OPTIONS[0];
}

export function getInterfaceLanguageOptionsForAccount(
  _accountType: HelixAccountType | null | undefined,
): InterfaceLanguageOption[] {
  return INTERFACE_LANGUAGE_OPTIONS;
}

export function getInterfaceLanguageReadiness(option: InterfaceLanguageOption): string {
  if (option.translationMode === "source") return option.readiness;
  return `${INTERFACE_CATALOG_REVIEWED_COUNTS[option.code]}/${INTERFACE_MESSAGE_COUNT} catalog strings`;
}
