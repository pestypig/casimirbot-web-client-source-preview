// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HUD_SURFACE_SCHEMA, type HudScene, type SurfaceFrame, type SurfaceSourceBinding } from "@shared/helix-hud-surface";
import HudSurfaceHost from "../HudSurfaceHost";

const binding: SurfaceSourceBinding = {
  schema: HUD_SURFACE_SCHEMA,
  profileId: "test-profile",
  runId: "run-1",
  sourceId: "synthetic-source",
  producerEpoch: "epoch-1",
  sourceKind: "simulator",
  locatorRef: "fixture:surface",
  permission: "not_required",
  retention: "none",
};

const frame: SurfaceFrame = {
  schema: HUD_SURFACE_SCHEMA,
  frameId: "frame-1",
  sourceId: binding.sourceId,
  producerEpoch: binding.producerEpoch,
  sequence: 1,
  capturedAtMs: 100,
  freshnessDeadlineMs: 200,
  width: 1280,
  height: 720,
  colorSpace: "srgb",
  alphaMode: "opaque",
  provenanceRef: "fixture:surface:1",
  contentClass: "synthetic_fixture",
};

const scene: HudScene = {
  schema: HUD_SURFACE_SCHEMA,
  sceneId: "scene-1",
  profileId: binding.profileId,
  producerEpoch: binding.producerEpoch,
  revision: 1,
  authoredAtMs: 100,
  freshnessDeadlineMs: 200,
  normalizedViewport: "unit_rect_top_left_v1",
  primitives: [{
    primitiveId: "profile-layer",
    kind: "profile_surface",
    xNorm: 0,
    yNorm: 0,
    widthNorm: 1,
    heightNorm: 1,
    rotationDeg: 0,
    opacity: 1,
    styleToken: "test",
    semanticRef: "test:scene",
  }],
};

describe("HudSurfaceHost", () => {
  afterEach(cleanup);

  it("stacks a synthetic source below profile HUD content with a chrome-free feed subtree", () => {
    render(<HudSurfaceHost profileLabel="Test HUD" atMs={100} binding={binding} frame={frame} scene={scene} initialMode="hud_over_source"><div>profile hud</div></HudSurfaceHost>);

    expect(screen.getByTestId("hud-synthetic-underlay")).toBeTruthy();
    expect(screen.getByText("profile hud")).toBeTruthy();
    const cleanFeed = screen.getByTestId("hud-clean-feed");
    expect(cleanFeed.dataset.chrome).toBe("excluded");
    expect(within(cleanFeed).queryByRole("button")).toBeNull();
    expect(screen.getByLabelText("HUD surface receipt summary").textContent).toMatch(/fnv1a32:/i);
    expect(screen.getByText(/program input authority: false/i)).toBeTruthy();
  });

  it("switches between alpha, black, composed, and source-only modes without changing profiles", () => {
    render(<HudSurfaceHost profileLabel="Test HUD" atMs={100} binding={binding} frame={frame} scene={scene} initialMode="hud_over_source"><div>profile hud</div></HudSurfaceHost>);

    fireEvent.click(screen.getByRole("button", { name: "Source only" }));
    expect(screen.queryByText("profile hud")).toBeNull();
    expect(screen.getByTestId("hud-clean-feed").dataset.compositionMode).toBe("source_only");

    fireEvent.click(screen.getByRole("button", { name: "HUD alpha" }));
    expect(screen.getByText("profile hud")).toBeTruthy();
    expect(screen.queryByTestId("hud-synthetic-underlay")).toBeNull();
  });

  it("opens a fullscreen clean feed with no controls and restores the same tab state on Escape", () => {
    render(<HudSurfaceHost profileLabel="Test HUD" atMs={100} binding={binding} frame={frame} scene={scene} initialMode="hud_over_source"><div>profile hud</div></HudSurfaceHost>);

    fireEvent.click(screen.getByRole("button", { name: "Open clean feed fullscreen" }));
    expect(screen.getByTestId("hud-clean-feed-fullscreen")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "HUD alpha" })).toBeNull();
    expect(screen.getByTestId("hud-clean-feed").dataset.outputTarget).toBe("clean_feed");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("hud-clean-feed-fullscreen")).toBeNull();
    expect(screen.getByRole("button", { name: "HUD + source" })).toHaveAttribute("aria-pressed", "true");
  });

  it("fails closed when a required source frame is stale", () => {
    render(<HudSurfaceHost profileLabel="Test HUD" atMs={201} binding={binding} frame={frame} scene={{ ...scene, freshnessDeadlineMs: 300 }} initialMode="hud_over_source"><div>profile hud</div></HudSurfaceHost>);

    expect(screen.getByTestId("hud-surface-blank").textContent).toMatch(/source stale/i);
    expect(screen.queryByText("profile hud")).toBeNull();
  });
});
