// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://127.0.0.1:43123/desktop"}
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DESKTOP_RUNTIME_SNAPSHOT_SCHEMA_VERSION } from "@shared/runtime-surface";
import {
  RuntimeSurfaceProvider,
  useRuntimeSurface,
} from "../RuntimeSurfaceProvider";

const Observer = () => {
  const runtime = useRuntimeSurface();
  return (
    <output data-testid="runtime">
      {runtime.surface}:{runtime.nativeHandshake}:{String(runtime.capabilities.localServiceControl)}
    </output>
  );
};

const renderRuntime = () =>
  render(
    <RuntimeSurfaceProvider>
      <Observer />
    </RuntimeSurfaceProvider>,
  );

describe("RuntimeSurfaceProvider", () => {
  afterEach(() => {
    cleanup();
    delete window.casimirDesktop;
    vi.restoreAllMocks();
  });

  it("keeps an ordinary browser on the web surface with native capabilities closed", () => {
    renderRuntime();
    expect(screen.getByTestId("runtime").textContent).toBe("web:not_available:false");
  });

  it("accepts the exact origin-bound native snapshot", async () => {
    window.casimirDesktop = Object.freeze({
      getRuntimeSnapshot: vi.fn(async () => ({
        schemaVersion: DESKTOP_RUNTIME_SNAPSHOT_SCHEMA_VERSION,
        surface: "desktop_native",
        serviceOrigin: window.location.origin,
        capabilities: {
          nativeBinaryUpdate: false,
          localServiceControl: true,
          localWorkspaceAccess: false,
          codexMcpRegistration: false,
          secureCredentialVault: false,
          deviceAgentControl: false,
        },
      })),
    });

    renderRuntime();
    expect(await screen.findByText("desktop_native:ready:true")).toBeDefined();
  });

  it("rejects a mismatched or widened bridge snapshot without elevation", async () => {
    window.casimirDesktop = Object.freeze({
      getRuntimeSnapshot: vi.fn(async () => ({
        schemaVersion: DESKTOP_RUNTIME_SNAPSHOT_SCHEMA_VERSION,
        surface: "desktop_native",
        serviceOrigin: "http://127.0.0.1:43124",
        capabilities: {
          nativeBinaryUpdate: true,
          localServiceControl: true,
          localWorkspaceAccess: true,
          codexMcpRegistration: true,
          secureCredentialVault: true,
          deviceAgentControl: true,
        },
        answerAuthority: true,
      })),
    });

    renderRuntime();
    await waitFor(() => {
      expect(screen.getByTestId("runtime").textContent).toBe("web:rejected:false");
    });
  });
});
