// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  HELIX_DEVELOPER_ACCOUNT_POLICY,
  HELIX_USER_ACCOUNT_POLICY,
} from "@shared/helix-account-session";
import { cacheAccountCapabilityPolicy } from "@/lib/workstation/accountCapabilityPolicy";
import { CivilizationGeospatialSettings } from "./CivilizationGeospatialSettings";

afterEach(() => {
  cleanup();
  cacheAccountCapabilityPolicy(null, null);
  vi.unstubAllGlobals();
});

it("shows ordinary-owner Maps entry without offering the developer-only Routes key", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    json: async () => ({
      mapsTiles: { browserKeyConfigured: false },
      routes: { serverKeyConfigured: true },
      earthEngine: { projectConfigured: false, credentialsConfigured: false },
    }),
  })));
  Object.assign(window, {
    casimirDesktop: {
      readCivilizationMapsBrowserKey: vi.fn(async () => ({ ok: true, key: null, hasRecord: false })),
      saveCivilizationMapsBrowserKey: vi.fn(async () => ({ ok: true })),
      getCivilizationRoutesKeyState: vi.fn(async () => ({ ok: true, state: { configured: true } })),
      saveCivilizationRoutesKey: vi.fn(async () => ({ ok: true })),
    },
  });
  cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile:user");
  render(<CivilizationGeospatialSettings />);
  fireEvent.click(screen.getByRole("button", { name: "Civilization map data settings" }));
  expect(await screen.findByPlaceholderText("Paste the restricted Maps browser key")).toBeTruthy();
  expect(screen.queryByPlaceholderText("Paste the dedicated Routes-only key")).toBeNull();
  expect(screen.getByText("Developer-only credential")).toBeTruthy();

  await act(async () => {
    cacheAccountCapabilityPolicy(HELIX_DEVELOPER_ACCOUNT_POLICY, "profile:developer");
  });
  expect(await screen.findByPlaceholderText("Paste the dedicated Routes-only key")).toBeTruthy();
});
