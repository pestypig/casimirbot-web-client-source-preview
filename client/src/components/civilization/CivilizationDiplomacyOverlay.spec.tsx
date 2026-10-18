// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readUnga81CountryEvidence, readUnga81PairEvidence } from "../../../../server/services/civilization-diplomacy/unga81-evidence";
import { composeCivilizationRelationshipNetwork } from "../../../../server/services/civilization-diplomacy/relationship-network";
import { CivilizationDiplomacyOverlay } from "./CivilizationDiplomacyOverlay";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shows the signed framework timeline and dated legal status for a selected pair", async () => {
  const pair = readUnga81PairEvidence({ firstCountryIso3: "ARM", secondCountryIso3: "AZE" });
  const network = composeCivilizationRelationshipNetwork({
    firstCountryIso3: "ARM", secondCountryIso3: "AZE", year: 2024,
  }, pair, null);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const country = url.match(/\/unga81\/country\/(ARM|AZE)$/)?.[1];
    const data = country ? readUnga81CountryEvidence({ countryIso3: country })
      : url.includes("/unga81/pair/ARM/AZE") ? pair
      : url.includes("/diplomacy/relationships/ARM/AZE/2024") ? network : null;
    if (!data) throw new Error(`Unexpected Civilization request: ${url}`);
    return { ok: true, json: async () => data };
  }));

  render(<CivilizationDiplomacyOverlay hoveredIso3={null} selectedIso3s={["ARM", "AZE"]}
    onToggleCountry={() => {}} />);
  const frameworkHeading = await screen.findByText(/Related third-party framework/);
  fireEvent.click(frameworkHeading);
  const timelineHeading = await screen.findByText("Agreement and implementation timeline");
  fireEvent.click(timelineHeading);
  expect(screen.getByText(/2026-06-04 · both parties signed/)).toBeTruthy();
  expect(screen.getByText(/2026-09-24 · ratification pending reported/)).toBeTruthy();
  await waitFor(() => expect(screen.getAllByText(/entry into force unverified as of 2026-09-24/).length).toBeGreaterThan(0));
});
