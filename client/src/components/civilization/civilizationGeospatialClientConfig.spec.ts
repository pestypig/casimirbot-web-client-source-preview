import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CIVILIZATION_MAPS_BROWSER_KEY_STORAGE_KEY,
  loadCivilizationMapsBrowserKey,
} from "./civilizationGeospatialClientConfig";

const legacyKey = "AIza01234567890123456789";

const desktop = (read: () => Promise<unknown>, save = vi.fn(async () => ({ ok: true }))) => {
  const values = new Map([[CIVILIZATION_MAPS_BROWSER_KEY_STORAGE_KEY, legacyKey]]);
  vi.stubGlobal("window", {
    casimirDesktop: {
      readCivilizationMapsBrowserKey: read,
      saveCivilizationMapsBrowserKey: save,
    },
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
    },
  });
  return { save, values };
};

describe("desktop Maps key account boundary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("does not reveal a browser-origin key when native account access fails", async () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_BROWSER_API_KEY", "");
    const { save } = desktop(async () => ({ ok: false }));
    await expect(loadCivilizationMapsBrowserKey())
      .rejects.toThrow("desktop_maps_key_unavailable");
    expect(save).not.toHaveBeenCalled();
  });

  it("does not silently enroll an unowned browser key for a new profile", async () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_BROWSER_API_KEY", "");
    const { save } = desktop(async () => ({ ok: true, key: null, hasRecord: false }));
    expect(await loadCivilizationMapsBrowserKey()).toEqual({
      key: null, source: "none", migrationFailed: true,
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("prefers this account's saved key over a bundled public key", async () => {
    vi.stubEnv("VITE_GOOGLE_MAPS_BROWSER_API_KEY", "AIzaBundledKey0123456789012345");
    desktop(async () => ({ ok: true, key: legacyKey, hasRecord: true }));
    expect(await loadCivilizationMapsBrowserKey()).toEqual({
      key: legacyKey, source: "desktop-profile",
    });
  });
});
