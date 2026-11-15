// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { HELIX_USER_ACCOUNT_POLICY } from "@shared/helix-account-session";
import { cacheAccountCapabilityPolicy } from "@/lib/workstation/accountCapabilityPolicy";
import {
  CIVILIZATION_MAPS_BROWSER_KEY_STORAGE_KEY,
  loadCivilizationMapsBrowserKey,
  saveCivilizationMapsBrowserKey,
} from "./civilizationGeospatialClientConfig";

const firstKey = "AIza01234567890123456789";
const secondKey = "AIza98765432109876543210";

afterEach(() => {
  cacheAccountCapabilityPolicy(null, null);
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("keeps browser-origin Maps keys with their verified website account", async () => {
  vi.stubEnv("VITE_GOOGLE_MAPS_BROWSER_API_KEY", "");
  window.localStorage.setItem(CIVILIZATION_MAPS_BROWSER_KEY_STORAGE_KEY, firstKey);
  cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile:first");
  expect(await loadCivilizationMapsBrowserKey()).toEqual({ key: null, source: "none" });
  await saveCivilizationMapsBrowserKey(firstKey);
  expect(window.localStorage.getItem(CIVILIZATION_MAPS_BROWSER_KEY_STORAGE_KEY)).toBeNull();

  cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile:second");
  expect(await loadCivilizationMapsBrowserKey()).toEqual({ key: null, source: "none" });
  await saveCivilizationMapsBrowserKey(secondKey);
  expect(await loadCivilizationMapsBrowserKey()).toEqual({ key: secondKey, source: "browser-origin" });

  cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile:first");
  expect(await loadCivilizationMapsBrowserKey()).toEqual({ key: firstKey, source: "browser-origin" });
  cacheAccountCapabilityPolicy(null, null);
  expect(await loadCivilizationMapsBrowserKey()).toEqual({ key: null, source: "none" });
  await expect(saveCivilizationMapsBrowserKey(secondKey)).rejects.toThrow("account_required");
});

it("resolves the website session before reading a saved account key on first load", async () => {
  vi.stubEnv("VITE_GOOGLE_MAPS_BROWSER_API_KEY", "");
  window.sessionStorage.clear();
  window.localStorage.setItem(`${CIVILIZATION_MAPS_BROWSER_KEY_STORAGE_KEY}:profile:profile%3Afresh`, firstKey);
  const fetchSession = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      session: { profile: { profile_id: "profile:fresh" }, account_policy: HELIX_USER_ACCOUNT_POLICY },
      account_policy: HELIX_USER_ACCOUNT_POLICY,
    }),
  }));
  vi.stubGlobal("fetch", fetchSession);
  vi.resetModules();
  const fresh = await import("./civilizationGeospatialClientConfig");
  expect(await fresh.loadCivilizationMapsBrowserKey())
    .toEqual({ key: firstKey, source: "browser-origin" });
  expect(fetchSession).toHaveBeenCalledOnce();
});
