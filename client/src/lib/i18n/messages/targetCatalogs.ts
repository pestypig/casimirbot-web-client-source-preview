import type { InterfaceLanguageCode } from "@/lib/i18n/interfaceLanguage";
import { arMessages } from "@/lib/i18n/messages/ar";
import { deMessages } from "@/lib/i18n/messages/de";
import { enMessages } from "@/lib/i18n/messages/en";
import { esMessages } from "@/lib/i18n/messages/es";
import { frMessages } from "@/lib/i18n/messages/fr";
import { hawMessages } from "@/lib/i18n/messages/haw";
import { jaMessages } from "@/lib/i18n/messages/ja";
import { koMessages } from "@/lib/i18n/messages/ko";
import { ptMessages } from "@/lib/i18n/messages/pt";
import type { InterfaceMessageId, InterfaceTargetCatalog } from "@/lib/i18n/messages/types";
import { woMessages } from "@/lib/i18n/messages/wo";
import { zhMessages } from "@/lib/i18n/messages/zh";

export const interfaceMessageCatalogs = {
  en: enMessages,
  haw: hawMessages,
  es: esMessages,
  fr: frMessages,
  de: deMessages,
  pt: ptMessages,
  ja: jaMessages,
  ko: koMessages,
  zh: zhMessages,
  ar: arMessages,
  wo: woMessages,
} satisfies Record<InterfaceLanguageCode, InterfaceTargetCatalog<InterfaceMessageId>>;

export const INTERFACE_TARGET_CATALOGS = Object.entries(interfaceMessageCatalogs)
  .filter(([code]) => code !== "en")
  .map(([code, catalog]) => ({
    code: code as Exclude<InterfaceLanguageCode, "en">,
    catalog,
  }));

export function getInterfaceCatalogReviewedCount(code: InterfaceLanguageCode): number {
  return Object.keys(interfaceMessageCatalogs[code] ?? {}).length;
}
