import * as React from "react";
import {
  DEFAULT_INTERFACE_LANGUAGE,
  normalizeInterfaceLanguageCode,
  type InterfaceLanguageCode,
} from "@/lib/i18n/interfaceLanguage";
import { pushWorkstationDebugEvent } from "@/lib/helix/workstation-debug";
import {
  getEnglishInterfaceCatalog,
  getLoadedInterfaceCatalog,
  loadInterfaceCatalog,
} from "@/lib/i18n/messages/runtimeCatalogs";
import type {
  InterfaceMessageCatalog,
  InterfaceMessageId,
  InterfaceMessageValues,
  InterfaceTargetCatalog,
} from "@/lib/i18n/messages/types";

const interpolationPattern = /\{([a-zA-Z0-9_]+)\}/g;

export type InterfaceTextResolver = {
  language: InterfaceLanguageCode;
  t: (id: InterfaceMessageId, values?: InterfaceMessageValues) => string;
};

function formatMessage(template: string, values?: InterfaceMessageValues): string {
  if (!values) return template;
  return template.replace(interpolationPattern, (match, key: string) => {
    const value = values[key];
    return value === null || value === undefined ? match : String(value);
  });
}

type RuntimeInterfaceCatalog = InterfaceMessageCatalog | InterfaceTargetCatalog;

export function createInterfaceTextResolver(
  languageValue: unknown,
  catalogOverride?: RuntimeInterfaceCatalog,
): InterfaceTextResolver {
  const language = normalizeInterfaceLanguageCode(languageValue);
  const fallbackCatalog = getEnglishInterfaceCatalog();
  const catalog = catalogOverride ?? getLoadedInterfaceCatalog(language) ?? fallbackCatalog;
  return {
    language,
    t: (id, values) => {
      const localized = catalog[id];
      if (localized !== undefined) return formatMessage(localized, values);
      const fallback = fallbackCatalog[id];
      if (fallback !== undefined && language !== DEFAULT_INTERFACE_LANGUAGE) {
        pushWorkstationDebugEvent({
          channel: "interface_i18n",
          action: "message.fallback_used",
          detail: {
            language,
            message_id: id,
            fallback_language: DEFAULT_INTERFACE_LANGUAGE,
            source_surface: "account-session",
          },
        });
        return formatMessage(fallback, values);
      }
      return formatMessage(id, values);
    },
  };
}

export function useInterfaceText(languageValue: unknown): InterfaceTextResolver {
  const language = normalizeInterfaceLanguageCode(languageValue);
  const [catalogState, setCatalogState] = React.useState<{
    language: InterfaceLanguageCode;
    catalog: RuntimeInterfaceCatalog;
  }>(() => ({
    language,
    catalog: getLoadedInterfaceCatalog(language) ?? getEnglishInterfaceCatalog(),
  }));

  React.useEffect(() => {
    let active = true;
    const loaded = getLoadedInterfaceCatalog(language);
    if (loaded) {
      setCatalogState({ language, catalog: loaded });
      return () => {
        active = false;
      };
    }

    setCatalogState({ language, catalog: getEnglishInterfaceCatalog() });
    void loadInterfaceCatalog(language).then((nextCatalog) => {
      if (active) setCatalogState({ language, catalog: nextCatalog });
    });
    return () => {
      active = false;
    };
  }, [language]);

  const catalog = catalogState.language === language
    ? catalogState.catalog
    : getLoadedInterfaceCatalog(language) ?? getEnglishInterfaceCatalog();

  return React.useMemo(
    () => createInterfaceTextResolver(language, catalog),
    [catalog, language],
  );
}
