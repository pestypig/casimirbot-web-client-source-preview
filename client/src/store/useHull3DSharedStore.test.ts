import { afterEach, describe, expect, it } from "vitest";
import { defaultOverlayPrefsForProfile, useHull3DSharedStore } from "./useHull3DSharedStore";

const initialState = useHull3DSharedStore.getState();

afterEach(() => {
  useHull3DSharedStore.setState(initialState, true);
});

describe("spacetime grid overlay prefs", () => {
  it("clamps spacing, warp strength, and falloff to their allowed ranges", () => {
    const profile = "auto";
    const base = defaultOverlayPrefsForProfile(profile);
    useHull3DSharedStore.getState().setOverlayPrefs(profile, {
      spacetimeGrid: {
        ...base.spacetimeGrid,
        spacing_m: 0.001,
        warpStrength: -2,
        falloff_m: 0,
      },
    });

    let grid = useHull3DSharedStore.getState().overlayPrefs[profile].spacetimeGrid;
    expect(grid.spacing_m).toBe(0.05);
    expect(grid.warpStrength).toBe(0);
    expect(grid.falloff_m).toBe(0.05);

    useHull3DSharedStore.getState().setOverlayPrefs(profile, {
      spacetimeGrid: {
        ...grid,
        spacing_m: 50,
        warpStrength: 12,
        falloff_m: 20,
      },
    });

    grid = useHull3DSharedStore.getState().overlayPrefs[profile].spacetimeGrid;
    expect(grid.spacing_m).toBe(5);
    expect(grid.warpStrength).toBe(5);
    expect(grid.falloff_m).toBe(6);
  });
});
