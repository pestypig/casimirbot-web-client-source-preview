export const CIVILIZATION_MAPS_BROWSER_KEY_STORAGE_KEY =
  "casimirbot:civilization:maps-browser-key:v1";
export const CIVILIZATION_GEOSPATIAL_CONFIG_CHANGED_EVENT =
  "casimirbot:civilization:geospatial-config-changed";

type DesktopMapsBridge = {
  readCivilizationMapsBrowserKey?: () => Promise<unknown>;
  saveCivilizationMapsBrowserKey?: (key: string) => Promise<unknown>;
  clearCivilizationMapsBrowserKey?: () => Promise<unknown>;
};

export type CivilizationMapsKeyState = {
  key: string | null;
  source: "bundled" | "desktop-profile" | "browser-origin" | "none";
  migrationFailed?: boolean;
};

const desktopMapsBridge = (): DesktopMapsBridge | undefined =>
  (window as Window & { casimirDesktop?: DesktopMapsBridge }).casimirDesktop;

const readLegacyKey = (): string | null => {
  try {
    return window.localStorage.getItem(CIVILIZATION_MAPS_BROWSER_KEY_STORAGE_KEY)?.trim() || null;
  } catch {
    return null;
  }
};

const removeLegacyKey = (): void => {
  try { window.localStorage.removeItem(CIVILIZATION_MAPS_BROWSER_KEY_STORAGE_KEY); }
  catch { /* Profile storage remains authoritative after a successful native save. */ }
};

export async function loadCivilizationMapsBrowserKey(): Promise<CivilizationMapsKeyState> {
  const bundledKey = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_API_KEY?.trim();
  if (bundledKey) return { key: bundledKey, source: "bundled" };

  const native = desktopMapsBridge();
  if (native?.readCivilizationMapsBrowserKey) {
    let result: { ok?: boolean; key?: unknown; hasRecord?: boolean };
    try {
      result = await native.readCivilizationMapsBrowserKey() as typeof result;
    } catch {
      const legacyKey = readLegacyKey();
      if (legacyKey) return { key: legacyKey, source: "browser-origin", migrationFailed: true };
      throw new Error("desktop_maps_key_unavailable");
    }
    if (!result?.ok || (result.key !== null && typeof result.key !== "string")) {
      const legacyKey = readLegacyKey();
      if (legacyKey) return { key: legacyKey, source: "browser-origin", migrationFailed: true };
      throw new Error("desktop_maps_key_unavailable");
    }
    if (result.hasRecord) {
      removeLegacyKey();
      return result.key
        ? { key: result.key, source: "desktop-profile" }
        : { key: null, source: "none" };
    }
    const legacyKey = readLegacyKey();
    if (!legacyKey) return { key: null, source: "none" };
    if (native.saveCivilizationMapsBrowserKey) {
      try {
        const migrated = await native.saveCivilizationMapsBrowserKey(legacyKey) as { ok?: boolean };
        if (migrated?.ok) {
          removeLegacyKey();
          return { key: legacyKey, source: "desktop-profile" };
        }
      } catch { /* The old origin can still use its key until migration succeeds. */ }
    }
    return { key: legacyKey, source: "browser-origin", migrationFailed: true };
  }
  const key = readLegacyKey();
  return { key, source: key ? "browser-origin" : "none" };
}

export async function saveCivilizationMapsBrowserKey(key: string): Promise<CivilizationMapsKeyState> {
  const native = desktopMapsBridge();
  if (native?.saveCivilizationMapsBrowserKey) {
    const result = await native.saveCivilizationMapsBrowserKey(key) as { ok?: boolean };
    if (!result?.ok) throw new Error("desktop_maps_key_save_failed");
    removeLegacyKey();
    return { key, source: "desktop-profile" };
  }
  window.localStorage.setItem(CIVILIZATION_MAPS_BROWSER_KEY_STORAGE_KEY, key);
  return { key, source: "browser-origin" };
}

export async function clearCivilizationMapsBrowserKey(): Promise<void> {
  const native = desktopMapsBridge();
  if (native?.clearCivilizationMapsBrowserKey) {
    const result = await native.clearCivilizationMapsBrowserKey() as { ok?: boolean };
    if (!result?.ok) throw new Error("desktop_maps_key_clear_failed");
    removeLegacyKey();
    return;
  }
  window.localStorage.removeItem(CIVILIZATION_MAPS_BROWSER_KEY_STORAGE_KEY);
}
