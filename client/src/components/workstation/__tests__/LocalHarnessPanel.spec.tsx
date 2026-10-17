// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LocalHarnessPanel from "../LocalHarnessPanel";

const testState = vi.hoisted(() => ({
  runtime: {
    surface: "desktop_native",
    nativeHandshake: "ready",
    capabilities: {},
  },
  openPanel: vi.fn(),
}));

vi.mock("@/lib/runtime/RuntimeSurfaceProvider", () => ({
  useRuntimeSurface: () => testState.runtime,
}));

vi.mock("@/store/useWorkstationLayoutStore", () => ({
  useWorkstationLayoutStore: (selector: (state: unknown) => unknown) => selector({
    openPanelInActiveGroup: testState.openPanel,
  }),
}));

const supervisorStatus = {
  schema: "helix.local_supervisor_status.v1",
  service_instance_ref: "service_instance:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  workspace_ref: `workspace:${"b".repeat(64)}`,
  started_at: "2026-08-27T12:00:00.000Z",
  ready: true,
  supervisor_mode: "desktop_single_instance",
  one_instance_enforced: true,
  attach_supported: true,
  client_isolation_dimensions: [
    "account_session", "oauth_client", "conversation_thread", "room_participant",
    "run_turn", "environment_source_epoch", "execution_lease",
  ],
  concurrent_read_admission: "grant_scoped",
  mutation_admission: "serialized_execution_lease",
  credential_included: false,
  private_endpoint_included: false,
  workspace_path_included: false,
  process_identity_included: false,
  account_identity_included: false,
  content_role: "local_supervisor_status_not_authority",
  answer_authority: false,
  terminal_eligible: false,
} as const;

describe("LocalHarnessPanel", () => {
  beforeEach(() => {
    testState.runtime.surface = "desktop_native";
    testState.runtime.nativeHandshake = "ready";
    testState.openPanel.mockReset();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => supervisorStatus,
    })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the protected installed bootstrap without requiring sign-in", async () => {
    render(<LocalHarnessPanel />);

    expect(await screen.findByText("Ready")).toBeTruthy();
    expect(screen.getByText(/do not need an opaque launcher or a developer account/i)).toBeTruthy();
    expect(screen.getByText(/Supervisor readiness is device-local and does not require sign-in/i)).toBeTruthy();
    expect(screen.queryByLabelText(/private key|signed receipt|workspace path|process id/i)).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      "/api/local-supervisor/status",
      expect.objectContaining({ credentials: "same-origin", cache: "no-store" }),
    );
  });

  it("does not misrepresent an ordinary source process as protected", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        ...supervisorStatus,
        supervisor_mode: "external_process",
        one_instance_enforced: false,
      }),
    } as Response);

    render(<LocalHarnessPanel />);

    expect(await screen.findByText("Not protected")).toBeTruthy();
    expect(screen.getByText(/ordinary external process/i)).toBeTruthy();
    expect(screen.getByText(/child UI cannot upgrade its parent process/i)).toBeTruthy();
  });

  it("keeps website surfaces outside the local supervisor boundary", async () => {
    testState.runtime.surface = "web";
    testState.runtime.nativeHandshake = "not_available";

    render(<LocalHarnessPanel />);

    expect(screen.getByText("Installed app required")).toBeTruthy();
    await waitFor(() => expect(fetch).not.toHaveBeenCalled());
  });

  it("routes profile setup to Account and Sessions", async () => {
    render(<LocalHarnessPanel />);
    await screen.findByText("Ready");

    fireEvent.click(screen.getByRole("button", { name: "Open Account & Sessions" }));
    expect(testState.openPanel).toHaveBeenCalledWith("account-session");
  });
});
