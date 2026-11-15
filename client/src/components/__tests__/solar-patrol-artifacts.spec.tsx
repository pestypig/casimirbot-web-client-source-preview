// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const account = vi.hoisted(() => ({ profileId: "owner-a" as string | null, revision: 1 }));
vi.mock("@/lib/workstation/accountCapabilityPolicy", () => ({
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT: "test-account-change", readCachedAccountProfileIdentity: () => ({ ...account }),
}));
import { SolarPatrolArtifacts, parsePatrolViewed } from "../SolarPatrolArtifacts";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); account.profileId = "owner-a"; account.revision = 1; });
it("shows source attribution and keeps new-since-viewed cursors separate on account switch", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, schema:"casimir.public_solar_patrol.v1", window:{start:"2026-10-26T00:00:00.000Z",end:"2026-10-27T00:00:00.000Z"},
    coverage: { status: "retained_only", fetchedAt: null }, reels: [], reports: [{
      source:"NASA_DONKI", fetchedAt:"2026-10-27T18:00:00Z", instruments:[], linkedEvents:[], id: "donki:2026-10-26T20:48:00-CME-001", nativeId: "2026-10-26T20:48:00-CME-001", revisionSha256: "a".repeat(64), version: 3,
      occurredAt: "2026-10-26T20:48:00Z", submittedAt: "2026-10-27T11:27:00Z", firstSeenAt: "2026-10-27T18:00:00Z",
      note: "Eastern-limb filament report.", activeRegion: null, sourceLocation: null, analysis: null,
      citation: "https://ccmc.gsfc.nasa.gov/DONKI/view/CME/49282/-1" }] }))));
  render(<SolarPatrolArtifacts dayUtc="2026-10-26" />);
  await waitFor(() => expect(screen.getByRole("button").textContent).toContain("1 new or revised"));
  expect(screen.getByText(/NOAA region: unassigned/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button"));
  expect(screen.getByRole("button").textContent).toContain("0 new or revised");
  act(() => { account.profileId = "owner-b"; account.revision++; window.dispatchEvent(new Event("test-account-change")); });
  await waitFor(() => expect(screen.getByRole("button").textContent).toContain("1 new or revised"));
  expect(window.localStorage.getItem("casimir.solar-patrol.viewed.v1:owner-b")).toBeNull();
});
it("treats corrupted or unbounded view state as untrusted local presentation data", () => {
  expect(parsePatrolViewed("null")).toEqual({}); expect(parsePatrolViewed("[]")).toEqual({});
  expect(parsePatrolViewed('{"donki:one":"unsafe"}')).toEqual({});
  expect(Object.keys(parsePatrolViewed(JSON.stringify(Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`donki:${i}`, "a".repeat(64)])))))).toHaveLength(256);
});
it("defaults to distributed domain artifacts and switches local reads and media explicitly", async () => {
  const id = "a".repeat(64);
  const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ ok: true, schema:"casimir.public_solar_patrol.v1", window:{start:"2026-10-26T00:00:00.000Z",end:"2026-10-27T00:00:00.000Z"}, reports: [],
    coverage: { status: "retained_only" }, reels: [{ reelId: id, outputSha256: "b".repeat(64),
      windowStartUtc: "2026-10-26T00:00:00Z", windowEndUtc: "2026-10-27T00:00:00Z",
      patrol: { schema:"casimir.solar_patrol.v1", frames: [], unavailable: [], excludedReportIds: [] } }] })));
  vi.stubGlobal("fetch", fetcher);
  render(<SolarPatrolArtifacts dayUtc="2026-10-26" />);
  await waitFor(() => expect(screen.getByLabelText("Retained solar patrol sequence").getAttribute("src"))
    .toBe(`https://casimirbot.com/api/star-watcher/hek-reel/${id}.mp4`));
  expect(fetcher.mock.calls[0][0]).toContain("/api/star-watcher/patrol/domain?");
  fireEvent.change(screen.getByRole("combobox", { name: "Patrol artifact catalog" }), { target: { value: "installation" } });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByLabelText("Retained solar patrol sequence").getAttribute("src"))
    .toBe(`/api/star-watcher/hek-reel/${id}.mp4`));
  expect(fetcher.mock.calls[1][0]).toContain("/api/star-watcher/patrol?");
});
