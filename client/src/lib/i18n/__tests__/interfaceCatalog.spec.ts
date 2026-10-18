// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
  getInterfaceLanguageOptionsForAccount,
  getInterfaceLanguageReadiness,
  INTERFACE_LANGUAGE_OPTIONS,
} from "@/lib/i18n/interfaceLanguage";
import { createInterfaceTextResolver } from "@/lib/i18n/interfaceText";
import { getInterfacePanelTitle } from "@/lib/i18n/panelTitles";
import { enMessages } from "@/lib/i18n/messages/en";
import { hawMessages } from "@/lib/i18n/messages/haw";
import { INTERFACE_TARGET_CATALOGS } from "@/lib/i18n/messages/targetCatalogs";
import {
  INTERFACE_CATALOG_REVIEWED_COUNTS,
  INTERFACE_MESSAGE_COUNT,
} from "@/lib/i18n/messages/catalogMetadata";
import {
  INTERFACE_MESSAGE_IDS,
  interfaceSourceMessages,
  type InterfaceMessageId,
} from "@/lib/i18n/messages/types";
import {
  clearWorkstationDebugEvents,
  getWorkstationDebugSnapshot,
  setWorkstationDebugEnabled,
} from "@/lib/helix/workstation-debug";

const placeholderPattern = /\{([a-zA-Z0-9_]+)\}/g;

function placeholders(text: string): string[] {
  return [...text.matchAll(placeholderPattern)].map((match) => match[1]).sort();
}

describe("interface catalog integrity", () => {
  afterEach(() => {
    clearWorkstationDebugEvents();
    setWorkstationDebugEnabled(false);
    localStorage.clear();
  });

  it("derives the message ID list from source metadata and keeps English complete", () => {
    const sourceIds = Object.keys(interfaceSourceMessages).sort();
    expect([...INTERFACE_MESSAGE_IDS].sort()).toEqual(sourceIds);
    expect(INTERFACE_MESSAGE_COUNT).toBe(INTERFACE_MESSAGE_IDS.length);
    expect(INTERFACE_CATALOG_REVIEWED_COUNTS.en).toBe(INTERFACE_MESSAGE_IDS.length);

    for (const id of INTERFACE_MESSAGE_IDS) {
      expect(interfaceSourceMessages[id].id).toBe(id);
      expect(interfaceSourceMessages[id].defaultMessage.trim()).not.toBe("");
      expect(enMessages[id]).toBe(interfaceSourceMessages[id].defaultMessage);
    }
  });

  it("exposes the same interface language catalogs to user and developer accounts", () => {
    expect(getInterfaceLanguageOptionsForAccount("user")).toEqual(INTERFACE_LANGUAGE_OPTIONS);
    expect(getInterfaceLanguageOptionsForAccount("developer")).toEqual(INTERFACE_LANGUAGE_OPTIONS);
  });

  it("keeps target catalogs schema-bound and placeholder-compatible while partial", () => {
    const sourceIds = new Set<InterfaceMessageId>(INTERFACE_MESSAGE_IDS);

    for (const { code, catalog } of INTERFACE_TARGET_CATALOGS) {
      const option = INTERFACE_LANGUAGE_OPTIONS.find((entry) => entry.code === code);
      expect(option?.translationMode).toBe("procedural_catalog");
      expect(Object.keys(catalog).length).toBeLessThanOrEqual(INTERFACE_MESSAGE_IDS.length);
      expect(INTERFACE_CATALOG_REVIEWED_COUNTS[code]).toBe(Object.keys(catalog).length);
      expect(option ? getInterfaceLanguageReadiness(option) : "").toBe(
        `${Object.keys(catalog).length}/${INTERFACE_MESSAGE_IDS.length} catalog strings`,
      );

      for (const [id, message] of Object.entries(catalog)) {
        expect(sourceIds.has(id as InterfaceMessageId)).toBe(true);
        expect(message.trim()).not.toBe("");
        expect(message, `${code} ${id} should not contain mojibake question marks`).not.toMatch(/\?{3,}|(?:\?\s*){2,}/);
        expect(placeholders(message)).toEqual(placeholders(enMessages[id as InterfaceMessageId]));
        if (id.startsWith("panel.title.")) {
          expect(message, `${code} ${id} should not be identical to English`).not.toBe(
            enMessages[id as InterfaceMessageId],
          );
        }
      }
    }
    expect(Object.keys(hawMessages).length).toBeGreaterThan(0);
  });

  it("does not emit fallback debug for unknown IDs without source fallback text", () => {
    setWorkstationDebugEnabled(true);
    clearWorkstationDebugEvents();

    const resolver = createInterfaceTextResolver("haw", hawMessages);
    expect(resolver.t("missing.id" as never)).toBe("missing.id");

    expect(getWorkstationDebugSnapshot().events).toHaveLength(0);
  });

  it("does not emit fallback debug for reviewed Hawaiian entries", () => {
    setWorkstationDebugEnabled(true);
    clearWorkstationDebugEvents();

    const resolver = createInterfaceTextResolver("haw", hawMessages);
    expect(resolver.t("account.language.title")).toBe("ʻŌlelo");
    expect(resolver.t("account.header.title")).toBe("Moʻokāki a me nā kau");
    expect(resolver.t("account.usage.threads")).toBe("Nā thread");

    expect(getWorkstationDebugSnapshot().events).toHaveLength(0);
  });

  it("routes representative workstation panel titles through the interface catalog", () => {
    const resolver = createInterfaceTextResolver("haw", hawMessages);

    expect(getInterfacePanelTitle(resolver.t, "account-session", "Account & Sessions")).toBe(
      "Mo\u02bbok\u0101ki a me n\u0101 kau",
    );
    expect(getInterfacePanelTitle(resolver.t, "theory-badge-graph", "Theory Badge Graph")).toBe(
      "Pakuhi Badge Kumumana\u02bbo",
    );
  });
});
