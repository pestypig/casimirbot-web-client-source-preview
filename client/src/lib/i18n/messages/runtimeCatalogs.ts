import type { InterfaceLanguageCode } from "@shared/interface-language-codes";
import { enMessages } from "@/lib/i18n/messages/en";
import type { InterfaceMessageCatalog, InterfaceTargetCatalog } from "@/lib/i18n/messages/types";

type RuntimeInterfaceCatalog = InterfaceMessageCatalog | InterfaceTargetCatalog;
type TargetLanguageCode = Exclude<InterfaceLanguageCode, "en">;

const targetCatalogLoaders: Record<TargetLanguageCode, () => Promise<RuntimeInterfaceCatalog>> = {
  haw: () => import("@/lib/i18n/messages/haw").then((module) => module.hawMessages),
  es: () => import("@/lib/i18n/messages/es").then((module) => module.esMessages),
  fr: () => import("@/lib/i18n/messages/fr").then((module) => module.frMessages),
  de: () => import("@/lib/i18n/messages/de").then((module) => module.deMessages),
  pt: () => import("@/lib/i18n/messages/pt").then((module) => module.ptMessages),
  ja: () => import("@/lib/i18n/messages/ja").then((module) => module.jaMessages),
  ko: () => import("@/lib/i18n/messages/ko").then((module) => module.koMessages),
  zh: () => import("@/lib/i18n/messages/zh").then((module) => module.zhMessages),
  ar: () => import("@/lib/i18n/messages/ar").then((module) => module.arMessages),
  wo: () => import("@/lib/i18n/messages/wo").then((module) => module.woMessages),
};

const loadedCatalogs = new Map<InterfaceLanguageCode, RuntimeInterfaceCatalog>([["en", enMessages]]);
const pendingCatalogs = new Map<InterfaceLanguageCode, Promise<RuntimeInterfaceCatalog>>();

export function getLoadedInterfaceCatalog(code: InterfaceLanguageCode): RuntimeInterfaceCatalog | undefined {
  return loadedCatalogs.get(code);
}

export function getEnglishInterfaceCatalog(): InterfaceMessageCatalog {
  return enMessages;
}

export function loadInterfaceCatalog(code: InterfaceLanguageCode): Promise<RuntimeInterfaceCatalog> {
  const loaded = loadedCatalogs.get(code);
  if (loaded) return Promise.resolve(loaded);

  const pending = pendingCatalogs.get(code);
  if (pending) return pending;

  const loader = targetCatalogLoaders[code as TargetLanguageCode];
  if (!loader) return Promise.resolve(enMessages);

  const request = loader()
    .then((catalog) => {
      loadedCatalogs.set(code, catalog);
      return catalog;
    })
    .finally(() => {
      pendingCatalogs.delete(code);
    });
  pendingCatalogs.set(code, request);
  return request;
}
