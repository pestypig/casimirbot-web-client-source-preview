/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/essence/activityReporter", () => ({ recordPanelActivity: vi.fn() }));
vi.mock("@/lib/luma-whispers-core", () => ({ whisperPanelOpen: vi.fn() }));

import { getPanelDef } from "@/lib/desktop/panelRegistry";
import { useDesktopStore } from "./useDesktopStore";

describe("useDesktopStore recent panel history", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useDesktopStore.setState({
      windows: {},
      pinned: {},
      recentPanelIds: [],
      zCounter: 10,
      topZCounter: 100000,
    });
    const definitions = ["docs-viewer", "workstation-notes", "image-lens"]
      .map((id) => getPanelDef(id))
      .filter((definition): definition is NonNullable<typeof definition> => Boolean(definition));
    useDesktopStore.getState().registerFromManifest(definitions, { allowDefaultOpen: false });
  });

  it("records open, focus, and restore in most-recent-first order without duplicates", () => {
    const store = useDesktopStore.getState();
    store.open("docs-viewer");
    store.open("workstation-notes");
    store.focus("docs-viewer");
    store.minimize("workstation-notes");
    store.restore("workstation-notes");

    expect(useDesktopStore.getState().recentPanelIds).toEqual([
      "workstation-notes",
      "docs-viewer",
    ]);
  });
});
