import {
  getInterfaceLanguageOption,
  isInterfaceLanguageCode,
  type InterfaceLanguageCode,
  type InterfaceLanguageOption,
} from "@/lib/i18n/interfaceLanguage";

export const SETTINGS_STORAGE_KEY = "helix-start-settings";
export const PROFILE_STORAGE_KEY = "helix-start-profile";
export const INTERFACE_LANGUAGE_CHANGED_EVENT = "helix:interface-language-changed";

export type InterfaceLanguageChangedDetail = {
  language: InterfaceLanguageCode;
  bcp47: string;
  label: string;
  nativeLabel: string;
  source: "account_session_panel" | "workstation_action" | "storage_sync";
};

export type InterfaceLanguagePreferenceWriteResult =
  | {
      ok: true;
      option: InterfaceLanguageOption;
      settings: Record<string, unknown>;
    }
  | {
      ok: false;
      reason: "unsupported_language";
      language: string | null;
    };

function parseStoredSettings(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function resolveInterfaceLanguagePreference(value: unknown): InterfaceLanguageOption | null {
  if (!isInterfaceLanguageCode(value)) return null;
  return getInterfaceLanguageOption(value);
}

export function writeInterfaceLanguagePreference(
  language: unknown,
  source: InterfaceLanguageChangedDetail["source"] = "workstation_action",
): InterfaceLanguagePreferenceWriteResult {
  const option = resolveInterfaceLanguagePreference(language);
  if (!option) {
    return {
      ok: false,
      reason: "unsupported_language",
      language: typeof language === "string" ? language : null,
    };
  }

  const settings = {
    ...parseStoredSettings(),
    interfaceLanguage: option.code,
  };

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Preference writes are observable through the receipt even when storage is unavailable.
    }
    window.dispatchEvent(
      new CustomEvent<InterfaceLanguageChangedDetail>(INTERFACE_LANGUAGE_CHANGED_EVENT, {
        detail: {
          language: option.code,
          bcp47: option.bcp47,
          label: option.label,
          nativeLabel: option.nativeLabel,
          source,
        },
      }),
    );
  }

  return { ok: true, option, settings };
}
