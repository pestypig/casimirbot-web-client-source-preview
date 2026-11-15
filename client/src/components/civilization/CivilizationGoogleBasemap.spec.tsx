// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ loadKey: vi.fn(async () => null) }));
vi.mock("./civilizationGeospatialClientConfig", () => ({
  CIVILIZATION_GEOSPATIAL_CONFIG_CHANGED_EVENT: "fixture:maps-config",
  loadCivilizationMapsBrowserKey: mocks.loadKey,
}));
vi.mock("./CivilizationDiplomacyOverlay", () => ({ CivilizationDiplomacyOverlay: () => null }));
import { CivilizationGoogleBasemap } from "./CivilizationGoogleBasemap";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ affiliations: [] }), {
    status: 200, headers: { "Content-Type": "application/json" },
  })));
});
afterEach(() => { cleanup(); delete window.google; vi.unstubAllGlobals(); });

it.each(["absent", "identity only", "empty"])("renders without a Maps SDK when Google is %s", async state => {
  const initialize = vi.fn(), renderButton = vi.fn(), prompt = vi.fn();
  if (state === "identity only") window.google = { accounts: { id: { initialize, renderButton, prompt } } };
  else if (state === "empty") window.google = {};
  else delete window.google;
  render(<CivilizationGoogleBasemap selectedIso3s={[]} onToggleCountry={vi.fn()} />);
  await waitFor(() => expect(mocks.loadKey).toHaveBeenCalled());
  expect(screen.getByLabelText("Google Maps basemap with civilization overlays")).toBeTruthy();
  expect(document.querySelector("script[data-casimirbot-google-maps]")).toBeNull();
  expect(initialize).not.toHaveBeenCalled();
  expect(renderButton).not.toHaveBeenCalled();
  expect(prompt).not.toHaveBeenCalled();
});
