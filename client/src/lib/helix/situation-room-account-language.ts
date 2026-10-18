import { getInterfaceLanguageOption } from "@/lib/i18n/interfaceLanguage";
import { resolveDocumentTranslationTargetLanguage } from "@/lib/docs/documentTranslationClient";

function normalizeTargetLanguage(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

export function resolveSituationRoomAccountTargetLanguage(interfaceLanguageValue: unknown): string {
  const option = getInterfaceLanguageOption(interfaceLanguageValue);
  return resolveDocumentTranslationTargetLanguage(option.bcp47) || option.code;
}

export function shouldAdoptSituationRoomAccountTargetLanguage(args: {
  currentTargetLanguage: string;
  previousAccountTargetLanguage: string;
  nextAccountTargetLanguage: string;
}): boolean {
  const current = normalizeTargetLanguage(args.currentTargetLanguage);
  if (!current) return true;
  return current === normalizeTargetLanguage(args.previousAccountTargetLanguage) &&
    current !== normalizeTargetLanguage(args.nextAccountTargetLanguage);
}
