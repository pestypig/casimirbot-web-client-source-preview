import { fetchAccountCapabilityPolicy, readCachedAccountProfileIdentity } from "@/lib/workstation/accountCapabilityPolicy";

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

// The first session discovery may establish an unknown identity. Once observed,
// an identity/revision change retires the operation, including A -> B -> A.
const captureMapsAccount = () => {
  const started = readCachedAccountProfileIdentity();
  return () => {
    const current = readCachedAccountProfileIdentity();
    if (current.revision !== started.revision ||
      (started.profileId !== undefined && current.profileId !== started.profileId))
      throw new Error("maps_account_changed");
  };
};

const accountBrowserKeyStorageKey = async (): Promise<string | null> => {
  if (readCachedAccountProfileIdentity().profileId === undefined) {
    await fetchAccountCapabilityPolicy().catch(() => undefined);
  }
  const profileId = readCachedAccountProfileIdentity().profileId;
  return profileId ? `${CIVILIZATION_MAPS_BROWSER_KEY_STORAGE_KEY}:profile:${encodeURIComponent(profileId)}` : null;
};

const readAccountBrowserKey = async (): Promise<string | null> => {
  const storageKey = await accountBrowserKeyStorageKey();
  if (!storageKey) return null;
  try { return window.localStorage.getItem(storageKey)?.trim() || null; }
  catch { return null; }
};

export async function loadCivilizationMapsBrowserKey(): Promise<CivilizationMapsKeyState> {
  const assertAccountCurrent = captureMapsAccount();
  const bundledKey = import.meta.env.VITE_GOOGLE_MAPS_BROWSER_API_KEY?.trim();
  const native = desktopMapsBridge();
  if (native?.readCivilizationMapsBrowserKey) {
    let result: { ok?: boolean; key?: unknown; hasRecord?: boolean };
    try {
      result = await native.readCivilizationMapsBrowserKey() as typeof result;
    } catch {
      throw new Error("desktop_maps_key_unavailable");
    }
    assertAccountCurrent();
    if (!result?.ok || (result.key !== null && typeof result.key !== "string")) {
      throw new Error("desktop_maps_key_unavailable");
    }
    if (result.hasRecord) {
      removeLegacyKey();
      return result.key
        ? { key: result.key, source: "desktop-profile" }
        : { key: null, source: "none" };
    }
    return bundledKey
      ? { key: bundledKey, source: "bundled" }
      : { key: null, source: "none", migrationFailed: Boolean(readLegacyKey()) };
  }
  if (bundledKey) return { key: bundledKey, source: "bundled" };
  const key = await readAccountBrowserKey();
  assertAccountCurrent();
  return { key, source: key ? "browser-origin" : "none" };
}

export async function saveCivilizationMapsBrowserKey(key: string): Promise<CivilizationMapsKeyState> {
  const assertAccountCurrent = captureMapsAccount();
  const native = desktopMapsBridge();
  if (native?.saveCivilizationMapsBrowserKey) {
    const result = await native.saveCivilizationMapsBrowserKey(key) as { ok?: boolean };
    assertAccountCurrent();
    if (!result?.ok) throw new Error("desktop_maps_key_save_failed");
    removeLegacyKey();
    return { key, source: "desktop-profile" };
  }
  const storageKey = await accountBrowserKeyStorageKey();
  assertAccountCurrent();
  if (!storageKey) throw new Error("account_required");
  window.localStorage.setItem(storageKey, key);
  removeLegacyKey();
  return { key, source: "browser-origin" };
}

export async function clearCivilizationMapsBrowserKey(): Promise<void> {
  const assertAccountCurrent = captureMapsAccount();
  const native = desktopMapsBridge();
  if (native?.clearCivilizationMapsBrowserKey) {
    const result = await native.clearCivilizationMapsBrowserKey() as { ok?: boolean };
    assertAccountCurrent();
    if (!result?.ok) throw new Error("desktop_maps_key_clear_failed");
    removeLegacyKey();
    return;
  }
  const storageKey = await accountBrowserKeyStorageKey();
  assertAccountCurrent();
  if (!storageKey) throw new Error("account_required");
  window.localStorage.removeItem(storageKey);
  removeLegacyKey();
}
