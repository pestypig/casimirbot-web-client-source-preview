/** @vitest-environment jsdom */

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  focus: vi.fn(),
  desktopState: {
    windows: {} as Record<string, { id: string; isOpen: boolean; isMinimized: boolean; z: number }>,
    pinned: {} as Record<string, boolean>,
    recentPanelIds: [] as string[],
  },
}));

vi.mock("@/store/useDesktopStore", () => ({
  useDesktopStore: () => ({
    open: mocks.open,
    focus: mocks.focus,
    windows: mocks.desktopState.windows,
    pinned: mocks.desktopState.pinned,
    recentPanelIds: mocks.desktopState.recentPanelIds,
  }),
}));

vi.mock("@/components/desktop/TaskbarPanel", () => ({
  TaskbarShelf: () => <div data-testid="taskbar-shelf" />,
}));

vi.mock("@/components/workstation/guide/CasimirGuideOverlay", () => ({
  CasimirGuideOverlay: ({ open, onClose, context }: { open: boolean; onClose(): void; context: unknown }) => open
    ? <div role="dialog" aria-label="Casimir Guide test" data-guide-context={JSON.stringify(context)}><button type="button" onClick={onClose}>Close test Guide</button></div>
    : null,
}));

import { DesktopTaskbar } from "../DesktopTaskbar";

describe("DesktopTaskbar Casimir Guide entry points", () => {
  beforeEach(() => {
    mocks.desktopState.windows = {};
    mocks.desktopState.pinned = {};
    mocks.desktopState.recentPanelIds = [];
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("toggles the Guide from its taskbar button", () => {
    render(<DesktopTaskbar showStart={false} showWindowTabs={false} />);

    const openButton = screen.getByRole("button", { name: "Open Casimir Guide" });
    expect(openButton.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(openButton);
    expect(screen.getByRole("dialog", { name: "Casimir Guide test" })).toBeTruthy();
    const closeButton = screen.getByRole("button", { name: "Close Casimir Guide" });
    expect(closeButton.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(closeButton);
    expect(screen.queryByRole("dialog", { name: "Casimir Guide test" })).toBeNull();
  });

  it("toggles the Guide with Ctrl+Shift+G and prevents the browser default", () => {
    render(<DesktopTaskbar showStart={false} showWindowTabs={false} />);

    const openEvent = new KeyboardEvent("keydown", {
      key: "g",
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    fireEvent(window, openEvent);
    expect(openEvent.defaultPrevented).toBe(true);
    expect(screen.getByRole("dialog", { name: "Casimir Guide test" })).toBeTruthy();

    fireEvent.keyDown(window, { key: "G", ctrlKey: true, shiftKey: true });
    expect(screen.queryByRole("dialog", { name: "Casimir Guide test" })).toBeNull();
  });

  it("projects active, recent, and favorite registered panels into the Guide", () => {
    mocks.desktopState.windows = {
      "docs-viewer": { id: "docs-viewer", isOpen: true, isMinimized: false, z: 40 },
      "workstation-notes": { id: "workstation-notes", isOpen: true, isMinimized: false, z: 50 },
      taskbar: { id: "taskbar", isOpen: true, isMinimized: false, z: 100 },
    };
    mocks.desktopState.recentPanelIds = ["workstation-notes", "docs-viewer", "taskbar"];
    mocks.desktopState.pinned = { "image-lens": true, taskbar: true };

    render(<DesktopTaskbar showStart={false} showWindowTabs={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Casimir Guide" }));
    const context = JSON.parse(
      screen.getByRole("dialog", { name: "Casimir Guide test" }).getAttribute("data-guide-context") ?? "{}",
    );

    expect(context).toEqual({
      activePanelId: "workstation-notes",
      recentPanelIds: ["docs-viewer"],
      favoritePanelIds: ["image-lens"],
    });
  });
});
