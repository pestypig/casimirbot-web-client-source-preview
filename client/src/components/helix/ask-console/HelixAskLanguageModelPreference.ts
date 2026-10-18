import {
  isHelixPinnedLanguageModelId,
  type HelixLanguageModelProfileId,
  type HelixPinnedLanguageModelId,
} from "@shared/helix-language-model-policy";

export const HELIX_ASK_LANGUAGE_MODEL_PROFILE_STORAGE_KEY = "helix.ask.languageModelProfile.v1";
export const HELIX_ASK_PINNED_LANGUAGE_MODEL_STORAGE_KEY = "helix.ask.pinnedLanguageModel.v1";

export type HelixAskLanguageModelPreferenceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function resolveHelixAskLanguageModelPreferenceStorage(): HelixAskLanguageModelPreferenceStorage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

export function isHelixLanguageModelProfileId(value: unknown): value is HelixLanguageModelProfileId {
  return value === "auto" || value === "fast" || value === "balanced" || value === "deep";
}

export function readStoredHelixAskLanguageModelProfile(
  storage: HelixAskLanguageModelPreferenceStorage | null = resolveHelixAskLanguageModelPreferenceStorage(),
): HelixLanguageModelProfileId {
  if (!storage) return "auto";
  try {
    const value = storage.getItem(HELIX_ASK_LANGUAGE_MODEL_PROFILE_STORAGE_KEY);
    return isHelixLanguageModelProfileId(value) ? value : "auto";
  } catch {
    return "auto";
  }
}

export function persistHelixAskLanguageModelProfile(
  value: HelixLanguageModelProfileId,
  storage: HelixAskLanguageModelPreferenceStorage | null = resolveHelixAskLanguageModelPreferenceStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(HELIX_ASK_LANGUAGE_MODEL_PROFILE_STORAGE_KEY, value);
  } catch {
    // Local storage can be unavailable in embedded or test contexts.
  }
}

export function readStoredHelixAskPinnedLanguageModel(
  storage: HelixAskLanguageModelPreferenceStorage | null = resolveHelixAskLanguageModelPreferenceStorage(),
): HelixPinnedLanguageModelId | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(HELIX_ASK_PINNED_LANGUAGE_MODEL_STORAGE_KEY);
    return isHelixPinnedLanguageModelId(value) ? value : null;
  } catch {
    return null;
  }
}

export function persistHelixAskPinnedLanguageModel(
  value: HelixPinnedLanguageModelId | null,
  storage: HelixAskLanguageModelPreferenceStorage | null = resolveHelixAskLanguageModelPreferenceStorage(),
): void {
  if (!storage) return;
  try {
    if (value) storage.setItem(HELIX_ASK_PINNED_LANGUAGE_MODEL_STORAGE_KEY, value);
    else storage.removeItem(HELIX_ASK_PINNED_LANGUAGE_MODEL_STORAGE_KEY);
  } catch {
    // Local storage can be unavailable in embedded or test contexts.
  }
}
