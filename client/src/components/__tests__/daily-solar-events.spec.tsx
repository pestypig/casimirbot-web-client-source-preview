// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { DailySolarEvents } from "../DailySolarEvents";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows a retained reel, source movie and only reports with positions on the catalog disk", async () => {
  const reelId = "a".repeat(64);
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true,
    mode: "rolling24h", windowStartUtc: "2026-10-20T12:00:00.000Z",
    windowEndUtc: "2026-10-21T12:00:00.000Z", complete: true, refreshFailed: false,
    events: [
      { ivorn: "ivo://hek/located", event_type: "FL", start: "2026-10-21T09:00:00Z",
        u: 0.3, v: -0.2, hpc_x: 300, hpc_y: -200,
        references: [{ name: "SDO Movie", type: "movie",
          url: "https://sdowww.lmsal.com/sdomedia/ssw/located.mp4" }] },
      { ivorn: "ivo://hek/missing-position", event_type: "ER",
        start: "2026-10-21T10:00:00Z", references: [] },
    ],
    reel: { reelId, windowStartUtc: "2026-10-20T12:00:00.000Z",
      windowEndUtc: "2026-10-21T12:00:00.000Z",
      sources: [{ ivorn: "ivo://hek/located" }] },
  }), { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchImpl);
  render(<DailySolarEvents />);
  await waitFor(() => expect(screen.getByText(/1 of 2 reports have on-disk coordinates/)).toBeTruthy());
  const disk = screen.getByRole("img", { name: /2D catalog disk/ });
  expect(disk.querySelectorAll("circle")).toHaveLength(2);
  expect((screen.getByLabelText("Last daily solar event highlight reel") as HTMLVideoElement).src)
    .toContain(`${reelId}.mp4`);
  expect((screen.getByLabelText("Selected HEK linked event movie") as HTMLVideoElement).src)
    .toContain("/sdomedia/ssw/located.mp4");
});
