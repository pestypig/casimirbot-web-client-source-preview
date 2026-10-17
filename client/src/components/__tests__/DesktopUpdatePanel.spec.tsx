// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DESKTOP_UPDATE_STATE_SCHEMA_VERSION } from "@shared/desktop-update";
import DesktopUpdatePanel from "../DesktopUpdatePanel";

const runtimeState = vi.hoisted(() => ({ nativeBinaryUpdate: true }));

vi.mock("@/lib/runtime/RuntimeSurfaceProvider", () => ({
  useRuntimeSurface: () => ({
    surface: "desktop_native",
    nativeHandshake: "ready",
    capabilities: {
      get nativeBinaryUpdate() { return runtimeState.nativeBinaryUpdate; },
      localServiceControl: true,
      localWorkspaceAccess: false,
      codexMcpRegistration: false,
      secureCredentialVault: false,
      deviceAgentControl: false,
    },
  }),
}));

const available = {
  schemaVersion: DESKTOP_UPDATE_STATE_SCHEMA_VERSION,
  phase: "available",
  currentVersion: "0.1.0",
  availableVersion: "0.1.1",
  progressPercent: null,
  errorCode: null,
  canCheck: true,
  canDownload: true,
  canInstall: false,
} as const;

describe("DesktopUpdatePanel", () => {
  afterEach(() => {
    cleanup();
    delete window.casimirDesktop;
    runtimeState.nativeBinaryUpdate = true;
    vi.restoreAllMocks();
  });

  it("keeps a staged private build optional and explains the restart boundary", async () => {
    runtimeState.nativeBinaryUpdate = false;
    const restartIntoPrivateDevUpdate = vi.fn(async () => ({ phase: "restarting" }));
    window.casimirDesktop = Object.freeze({
      getPrivateDevUpdateState: vi.fn(async () => ({
        phase: "ready", runningBuild: "release-main-r55", selectedBuild: "release-main-r55",
        pendingBuild: "release-main-r56", rollbackBuild: "release-main-r54",
        profileSelected: true, lastHandoff: null, errorCode: null,
      })),
      restartIntoPrivateDevUpdate,
    });
    render(<DesktopUpdatePanel />);
    expect(await screen.findByText("Staged release-main-r56")).toBeDefined();
    expect(screen.getByText(/Full Harness must be enabled by its owner again/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(screen.getByText("Update ready for later")).toBeDefined();
    expect(restartIntoPrivateDevUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Review update" }));
    fireEvent.click(screen.getByRole("button", { name: "Restart into verified build" }));
    expect(restartIntoPrivateDevUpdate).toHaveBeenCalledTimes(1);
  });

  it("does not offer a private restart when verification failed", async () => {
    runtimeState.nativeBinaryUpdate = false;
    window.casimirDesktop = Object.freeze({
      getPrivateDevUpdateState: vi.fn(async () => ({
        phase: "error", runningBuild: "release-main-r55", selectedBuild: "release-main-r55",
        pendingBuild: "release-main-r56", rollbackBuild: "release-main-r54",
        profileSelected: true, lastHandoff: null, errorCode: "private_channel_verification_failed",
      })),
    });
    render(<DesktopUpdatePanel />);
    expect(await screen.findByText(/The private build could not be verified/)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Restart into verified build" })).toBeNull();
  });

  it("uses only the native bridge for an explicit update download", async () => {
    const downloadUpdate = vi.fn(async () => ({
      ...available,
      phase: "downloading",
      progressPercent: 0,
      canCheck: false,
      canDownload: false,
    }));
    window.casimirDesktop = Object.freeze({
      getRuntimeSnapshot: vi.fn(),
      getUpdateState: vi.fn(async () => available),
      checkForUpdates: vi.fn(async () => available),
      downloadUpdate,
      installUpdate: vi.fn(async () => available),
      onUpdateState: vi.fn(() => () => undefined),
    });

    render(<DesktopUpdatePanel />);
    expect(await screen.findByText("Available version 0.1.1")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Download update" }));
    expect(downloadUpdate).toHaveBeenCalledTimes(1);
  });

  it("requires an explicit restart to install a downloaded update", async () => {
    const installUpdate = vi.fn(async () => ({
      ...available,
      phase: "downloaded",
      canCheck: false,
      canDownload: false,
      canInstall: true,
    }));
    window.casimirDesktop = Object.freeze({
      getRuntimeSnapshot: vi.fn(),
      getUpdateState: vi.fn(async () => ({
        ...available,
        phase: "downloaded",
        canCheck: false,
        canDownload: false,
        canInstall: true,
      })),
      installUpdate,
      onUpdateState: vi.fn(() => () => undefined),
    });

    render(<DesktopUpdatePanel />);
    expect(await screen.findByText(/closing CasimirBot will not install it/i)).toBeDefined();
    expect(screen.getByRole("button", { name: "Restart and install" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Restart and install" }));
    expect(installUpdate).toHaveBeenCalledTimes(1);
  });
});
