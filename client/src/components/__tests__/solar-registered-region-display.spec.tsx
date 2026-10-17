// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SolarRegisteredRegionDisplay, type RegisteredRegionDisplay } from "../SolarRegisteredRegionDisplay";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const image = {
  imageUrl: "/api/star-watcher/active-regions/registered/image?sha256=" + "a".repeat(64),
  sourceUrl: "https://api.helioviewer.org/v2/downloadImage/?id=12345&width=512&type=jpg",
  sha256: "a".repeat(64), upstreamImageId: "12345",
  observationAt: "2026-10-10T12:00:00.000Z", widthPx: 512, heightPx: 512, stale: false,
};
const report = {
  sourceUrl: "https://services.swpc.noaa.gov/text/srs.txt", sourceSha256: "b".repeat(64),
  validAt: "2026-10-10T00:00:00Z", issuedAt: "2026-10-10T00:30:00Z",
};
const regions: RegisteredRegionDisplay[] = [
  { noaaNumber: 4545, location: "N18W46", category: "sunspot", spotCount: 5,
    spotClass: "CAO", magneticClass: "BETA", pixelX: 300, pixelY: 200, visible: true, omissionReason: null },
  { noaaNumber: 4548, location: "S15E99", category: "sunspot", spotCount: 1,
    spotClass: "HSX", magneticClass: "ALPHA", pixelX: null, pixelY: null, visible: false, omissionReason: "far side" },
  { noaaNumber: 4550, location: "S12E23", category: "plage", spotCount: null,
    spotClass: null, magneticClass: null, pixelX: 220, pixelY: 250, visible: true, omissionReason: null },
];

it("uses the exact paired image and synchronizes marker and catalog selection", () => {
  const onExit = vi.fn();
  const onRefresh = vi.fn();
  const onImageError = vi.fn();
  render(<SolarRegisteredRegionDisplay image={image} report={report} regions={regions}
    projectionLabel="Rigid Carrington rotation; 12-hour report-to-image offset." onExit={onExit} onRefresh={onRefresh} onImageError={onImageError} />);
  expect(screen.getByRole("img").getAttribute("src")).toBe(image.imageUrl);
  expect(screen.getByText(/Geometrically projected NOAA report locations/)).toBeTruthy();
  expect(screen.getByText(/1 of 2 numbered sunspot regions project/)).toBeTruthy();
  const marker = screen.getByRole("button", { name: "Projected NOAA 4545 on HMI image" });
  const row = screen.getByRole("button", { name: /NOAA 4545 N18W46 projected on image/ });
  expect(marker.getAttribute("style")).toContain("left: 58.59375%");
  expect(marker.getAttribute("style")).toContain("top: 39.0625%");
  fireEvent.click(marker);
  expect(marker.getAttribute("aria-pressed")).toBe("true");
  expect(row.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByRole("region", { name: "NOAA 4545 registered details" }).textContent).toContain("300.0, 200.0");
  fireEvent.click(screen.getByRole("button", { name: /NOAA 4548 S15E99 no image marker/ }));
  expect(marker.getAttribute("aria-pressed")).toBe("false");
  expect(screen.getByRole("region", { name: "NOAA 4548 registered details" }).textContent).toContain("far side");
  fireEvent.click(screen.getByRole("button", { name: "Return to latest image" }));
  expect(onExit).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Refresh registered view" }));
  expect(onRefresh).toHaveBeenCalledOnce();
  fireEvent.error(screen.getByRole("img"));
  expect(onImageError).toHaveBeenCalledOnce();
});

it("never places a marker for off-disk, invalid, or plage-only positions", () => {
  render(<SolarRegisteredRegionDisplay image={{...image,stale:true}} report={report}
    regions={[...regions, { ...regions[0], noaaNumber: 4551, pixelX: 520, pixelY: 30 }]}
    projectionLabel="Projection is illustrative." onExit={() => {}} onRefresh={() => {}} onImageError={() => {}} />);
  expect(screen.queryByRole("button", { name: "Projected NOAA 4548 on HMI image" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Projected NOAA 4550 on HMI image" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Projected NOAA 4551 on HMI image" })).toBeNull();
  expect(screen.queryByRole("button", { name: /NOAA 4550/ })).toBeNull();
  expect(screen.getByText(/Stale HMI image/)).toBeTruthy();
});
