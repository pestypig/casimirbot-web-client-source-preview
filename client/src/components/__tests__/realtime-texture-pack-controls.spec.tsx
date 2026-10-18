// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HELIX_DEVELOPER_ACCOUNT_POLICY,
  HELIX_USER_ACCOUNT_POLICY,
} from "@shared/helix-account-session";
import {
  buildRealtimeTexturePackSessionState,
  buildRealtimeTexturePackConfig,
  type RealtimeTexturePackProjectionFrameV1,
} from "@shared/realtime-texture-pack";

const mocks = vi.hoisted(() => ({
  policy: null as unknown,
  start: vi.fn(),
  stop: vi.fn(),
  getState: vi.fn(),
  updateDirection: vi.fn(),
  updateProvider: vi.fn(),
  createController: vi.fn(),
}));

vi.mock("@/lib/workstation/accountCapabilityPolicy", () => ({
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT: "helix:account-capability-policy",
  readCachedAccountCapabilityPolicy: () => mocks.policy,
  fetchAccountCapabilityPolicy: async () => mocks.policy,
}));

vi.mock("@/lib/helix/realtimeTexturePack", () => ({
  createRealtimeTexturePackPreviewController: (dependencies: {
    onState?: (state: unknown) => void;
    onFrame?: (frame: unknown) => void;
    onConfig?: (config: unknown) => void;
  }) => {
    mocks.createController(dependencies);
    const idle = buildRealtimeTexturePackSessionState({ sessionId: "texture-session:test" });
    mocks.getState.mockReturnValue(idle);
    mocks.start.mockImplementation(async () => {
      dependencies.onConfig?.(buildRealtimeTexturePackConfig({
        sessionId: "texture-session:test",
        sourceId: "texture-source:test",
        sourceSurface: "window",
      }));
      const projection = {
        schema: "casimir.realtime_texture_pack.projection_frame.v1",
        projection_frame_id: "projection:test",
        request_id: "request:test",
        session_id: "texture-session:test",
        source_frame_id: "source-frame:test",
        source_captured_at: "2026-08-27T18:00:00.000Z",
        projection_completed_at: "2026-08-27T18:00:00.010Z",
        projection_image_data_url: "data:image/jpeg;base64,cHJldmlldw==",
        provider_id: "local_passthrough",
        provider_model: "local_copy_v1",
        authoritative: false,
        authority_class: "non_authoritative_projection",
        interpolated: false,
      } satisfies RealtimeTexturePackProjectionFrameV1;
      const state = {
        ...idle,
        status: "previewing" as const,
        capture_active: true,
        last_source_frame_id: projection.source_frame_id,
        last_projection_frame_id: projection.projection_frame_id,
        frame_age_ms: 10,
      };
      dependencies.onFrame?.(projection);
      dependencies.onState?.(state);
      mocks.getState.mockReturnValue(state);
      return state;
    });
    mocks.stop.mockImplementation(() => ({ ...idle, status: "stopped" }));
    return {
      start: mocks.start,
      updateDirection: mocks.updateDirection,
      updateProvider: mocks.updateProvider,
      stop: mocks.stop,
      getState: mocks.getState,
    };
  },
}));

import RealtimeTexturePackControls from "../workstation/RealtimeTexturePackControls";

describe("RealtimeTexturePackControls", () => {
  beforeEach(() => {
    mocks.policy = HELIX_DEVELOPER_ACCOUNT_POLICY;
    mocks.start.mockReset();
    mocks.stop.mockReset();
    mocks.getState.mockReset();
    mocks.updateDirection.mockReset();
    mocks.updateProvider.mockReset();
    mocks.createController.mockReset();
    vi.stubGlobal("fetch", vi.fn(async (path) => ({
      ok: true,
      json: async () => String(path).endsWith("/fal/readiness")
        ? {
            ok: true,
            readiness: {
              runtime_enabled: false,
              credential_configured: false,
              sdk_available: false,
              ready_for_attended_arm: false,
              missing_requirements: ["provider_runtime_not_enabled", "provider_credential_not_configured", "provider_sdk_not_available"],
              duration_cap_seconds: 60,
              request_cap: 60,
              spend_cap_usd: 1,
              published_compute_rate_usd: 0.00194,
            },
          }
        : { ok: true, commands: [] },
    } as Response)));
    delete window.casimirDesktop;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the frozen local-only baseline and starts a consented preview", async () => {
    render(<RealtimeTexturePackControls />);

    expect(screen.getByText("Local passthrough — no image API connected")).toBeInTheDocument();
    expect(screen.getByText("1 fps")).toBeInTheDocument();
    expect(screen.getByText("512 × 288")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show overlay" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reveal original" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Texture style preset"), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText("Texture custom prompt"), { target: { value: "moonlit ink" } });
    fireEvent.click(screen.getByRole("button", { name: "Choose game/window" }));

    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith({
      presetId: "custom",
      customPrompt: "moonlit ink",
    }));
    expect(await screen.findByAltText("Realtime Texture Pack local preview")).toHaveAttribute(
      "src",
      "data:image/jpeg;base64,cHJldmlldw==",
    );
    expect(vi.mocked(fetch).mock.calls.some(([path]) => String(path).endsWith("/fal/transform"))).toBe(false);
    expect(vi.mocked(fetch).mock.calls.some(([path]) => String(path).endsWith("/fal/session/arm"))).toBe(false);
  });

  it("does not expose capture controls to public user accounts", async () => {
    mocks.policy = HELIX_USER_ACCOUNT_POLICY;
    render(<RealtimeTexturePackControls />);

    expect(await screen.findByTestId("realtime-texture-pack-locked")).toHaveTextContent(
      "reserved for developer mode",
    );
    expect(screen.queryByRole("button", { name: "Choose game/window" })).not.toBeInTheDocument();
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("stops the local controller when the panel unmounts", () => {
    const view = render(<RealtimeTexturePackControls />);
    view.unmount();
    expect(mocks.stop).toHaveBeenCalledWith("panel_unmounted");
  });

  it("sends the latest projection through the native overlay bridge", async () => {
    const showOverlay = vi.fn(async () => ({}));
    const updateFrame = vi.fn(async () => ({ overlay_visible: true }));
    const revealOriginal = vi.fn(async () => ({}));
    const stopOverlay = vi.fn(async () => ({}));
    window.casimirDesktop = {
      getRuntimeSnapshot: vi.fn(async () => ({})),
      showRealtimeTexturePackOverlay: showOverlay,
      updateRealtimeTexturePackFrame: updateFrame,
      revealRealtimeTexturePackOriginal: revealOriginal,
      stopRealtimeTexturePackOverlay: stopOverlay,
    };
    render(<RealtimeTexturePackControls />);

    fireEvent.click(screen.getByRole("button", { name: "Choose game/window" }));
    await screen.findByAltText("Realtime Texture Pack local preview");
    const showButton = screen.getByRole("button", { name: "Show overlay" });
    await waitFor(() => expect(showButton).toBeEnabled());
    fireEvent.click(showButton);

    await waitFor(() => expect(showOverlay).toHaveBeenCalledTimes(1));
    expect(updateFrame).toHaveBeenCalledWith(expect.objectContaining({
      authority_class: "non_authoritative_projection",
    }));
    expect(screen.getByRole("button", { name: "Reveal original" })).toBeEnabled();
  });

  it("keeps agent harness control off until the developer enables its session lease", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, commands: [] }),
    } as Response);
    render(<RealtimeTexturePackControls />);

    const harnessToggle = screen.getByLabelText("Enable agent harness control");
    expect(harnessToggle).toBeDisabled();
    expect(screen.getByTestId("realtime-texture-pack-agent-harness-status")).toHaveTextContent(
      "Off — user control only",
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose game/window" }));
    await screen.findByAltText("Realtime Texture Pack local preview");
    await waitFor(() => expect(harnessToggle).toBeEnabled());
    fireEvent.click(harnessToggle);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/agi/realtime-texture-pack/harness/poll",
      expect.objectContaining({ method: "POST" }),
    ));
    const pollCall = fetchMock.mock.calls.find(([path]) => String(path).endsWith("/harness/poll"));
    expect(JSON.parse(String((pollCall?.[1] as RequestInit)?.body))).toMatchObject({
      session_id: "texture-session:test",
      allowed_actions: ["show_overlay", "reveal_original", "stop"],
      client_state: { capture_active: true, overlay_visible: false },
    });
  });

  it("keeps visual-direction authority separate and acknowledges an exact revision", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (_path, init) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      if (String(_path).endsWith("/harness/poll")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            commands: [{
              command_id: "rtp-command:visual-test",
              action: "set_custom_visual_directive",
              expected_configuration_revision: 0,
              arguments: {
                command: "set_custom_visual_directive",
                custom_visual_directive: "luminous stained-glass caves",
              },
            }],
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({ ok: true, echoed: body }) } as Response;
    });
    render(<RealtimeTexturePackControls />);

    expect(screen.getByLabelText("Enable agent visual direction control")).toBeDisabled();
    expect(screen.getByText("Provider API is not armed.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Choose game/window" }));
    await screen.findByAltText("Realtime Texture Pack local preview");
    fireEvent.click(screen.getByLabelText("Enable agent visual direction control"));

    await waitFor(() => expect(mocks.updateDirection).toHaveBeenCalledWith({
      presetId: "playable",
      customPrompt: "luminous stained-glass caves",
    }));
    const ackCall = fetchMock.mock.calls.find(([path]) => String(path).endsWith("/harness/ack"));
    expect(JSON.parse(String((ackCall?.[1] as RequestInit)?.body))).toMatchObject({
      command_id: "rtp-command:visual-test",
      outcome: "completed",
      applied_configuration_revision: 1,
      client_state: {
        visual_direction: {
          control_enabled: true,
          configuration_revision: 1,
        },
      },
    });
  });

  it("shows attended provider readiness but keeps arm disabled when the server boundary is unavailable", async () => {
    render(<RealtimeTexturePackControls />);
    fireEvent.change(screen.getByLabelText("Realtime Texture Pack image provider"), {
      target: { value: "fal_flux2_klein_realtime" },
    });
    expect(await screen.findByTestId("realtime-texture-pack-fal-readiness")).toHaveTextContent(
      "provider_runtime_not_enabled",
    );
    expect(screen.getByRole("button", { name: "Arm attended API" })).toBeDisabled();
    expect(screen.getByText(/agent\/MCP harness cannot select this provider/i)).toBeInTheDocument();
  });

  it("arms only after both attended acknowledgements and sends the exact frozen ceilings", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (path) => {
      if (String(path).endsWith("/fal/readiness")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            readiness: {
              runtime_enabled: true,
              credential_configured: true,
              sdk_available: true,
              ready_for_attended_arm: true,
              missing_requirements: [],
              duration_cap_seconds: 60,
              request_cap: 60,
              spend_cap_usd: 1,
              published_compute_rate_usd: 0.00194,
            },
          }),
        } as Response;
      }
      if (String(path).endsWith("/fal/session/arm")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            session: {
              session_id: "texture-session:test",
              status: "armed",
              requests_started: 0,
              requests_accepted: 0,
              requests_failed: 0,
              request_cap: 60,
              spend_cap_usd: 1,
              estimated_cost_usd: 0,
              in_flight: false,
              cancellation_acknowledged: false,
              cancellation_reason: null,
            },
          }),
        } as Response;
      }
      return { ok: true, json: async () => ({ ok: true, commands: [] }) } as Response;
    });
    render(<RealtimeTexturePackControls />);
    fireEvent.change(screen.getByLabelText("Realtime Texture Pack image provider"), {
      target: { value: "fal_flux2_klein_realtime" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Choose game/window" }));
    await screen.findByAltText("Realtime Texture Pack local preview");
    const arm = screen.getByRole("button", { name: "Arm attended API" });
    expect(arm).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Acknowledge external frame egress"));
    expect(arm).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Acknowledge billable provider calls"));
    await waitFor(() => expect(arm).toBeEnabled());
    fireEvent.click(arm);

    await waitFor(() => expect(mocks.updateProvider).toHaveBeenCalledWith("fal_flux2_klein_realtime"));
    const armCall = fetchMock.mock.calls.find(([path]) => String(path).endsWith("/fal/session/arm"));
    expect(JSON.parse(String((armCall?.[1] as RequestInit)?.body))).toEqual({
      session_id: "texture-session:test",
      provider_id: "fal_flux2_klein_realtime",
      approval_version: "rtp-fal-attended-v1",
      duration_cap_seconds: 60,
      request_cap: 60,
      spend_cap_usd: 1,
      external_frame_egress_acknowledged: true,
      billable_calls_acknowledged: true,
    });
  });
});
