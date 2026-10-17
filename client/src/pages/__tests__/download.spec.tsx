// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DESKTOP_RELEASE_STATUS_SCHEMA_VERSION,
  type DesktopReleaseStatus,
} from "@shared/desktop-release";
import { DownloadPageView, shouldQueryDesktopRelease } from "../download";

const approvedStatus: DesktopReleaseStatus = {
  schemaVersion: DESKTOP_RELEASE_STATUS_SCHEMA_VERSION,
  available: true,
  approved: true,
  release: {
    platform: "windows",
    arch: "x64",
    version: "0.1.0-alpha.1",
    installerFileName: "CasimirBot-0.1.0-alpha.1-x64-setup.exe",
    downloadUrl:
      "https://github.com/pestypig/casimirbot-/releases/download/desktop-v0.1.0-alpha.1/CasimirBot-0.1.0-alpha.1-x64-setup.exe",
    sha256: "a".repeat(64),
    publisher: "CasimirBot LLC",
    publishedAt: "2026-08-11T12:00:00.000Z",
    casimirGate: {
      verdict: "PASS",
      certificateHash: "b".repeat(64),
      integrity: "OK",
    },
  },
};

const callbacks = () => ({
  onBack: vi.fn(),
  onOpenDesktopUpdates: vi.fn(),
  onRetry: vi.fn(),
});

afterEach(() => cleanup());

describe("DownloadPageView", () => {
  it("suppresses release lookup whenever a native preload bridge is present", () => {
    expect(shouldQueryDesktopRelease("web", true)).toBe(false);
    expect(shouldQueryDesktopRelease("desktop_native", true)).toBe(false);
    expect(shouldQueryDesktopRelease("web", false)).toBe(true);
    expect(shouldQueryDesktopRelease("pwa", false)).toBe(true);
  });

  it("shows only the in-app updater on the native runtime", () => {
    const actions = callbacks();
    render(<DownloadPageView surface="desktop_native" status={approvedStatus} {...actions} />);

    expect(screen.getByTestId("native-update-card")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /download/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Desktop Updates" }));
    expect(actions.onOpenDesktopUpdates).toHaveBeenCalledOnce();
  });

  it("shows a validated immutable installer to web callers", () => {
    render(<DownloadPageView surface="web" status={approvedStatus} {...callbacks()} />);

    const link = screen.getByRole("link", { name: /Download CasimirBot-0.1.0-alpha.1-x64-setup.exe/i });
    expect(link).toHaveAttribute("href", approvedStatus.available ? approvedStatus.release.downloadUrl : "");
    expect(screen.getByText("CasimirBot LLC")).toBeInTheDocument();
    expect(screen.getByText(/integrity OK/i)).toBeInTheDocument();
  });

  it("fails closed when release verification errors", () => {
    const actions = callbacks();
    render(<DownloadPageView surface="pwa" failed {...actions} />);

    expect(screen.getByRole("alert")).toHaveTextContent("not presenting an installer");
    expect(screen.queryByRole("link", { name: /download/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry verification/i }));
    expect(actions.onRetry).toHaveBeenCalledOnce();
  });
});
