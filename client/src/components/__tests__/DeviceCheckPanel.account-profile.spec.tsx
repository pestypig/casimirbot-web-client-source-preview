// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HELIX_USER_ACCOUNT_POLICY } from "@shared/helix-account-session";
import { DESKTOP_MINECRAFT_INTEGRATED_WORLD_SCHEMA } from "@shared/desktop-minecraft-integrated-world";
import { cacheAccountCapabilityPolicy, clearCachedAccountCapabilityPolicy,
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";

vi.mock("@/lib/runtime/RuntimeSurfaceProvider", () => ({
  useRuntimeSurface: () => ({ surface: "desktop_native", capabilities: { codexMcpRegistration: false } }),
}));

import DeviceCheckPanel from "../DeviceCheckPanel";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const world = (name: string) => ({
  schema: DESKTOP_MINECRAFT_INTEGRATED_WORLD_SCHEMA,
  configured: true, worldFolder: name, gameDirectory: "C:\\Games\\FixtureMinecraft",
});

describe("Device Check account profile isolation", () => {
  beforeEach(() => {
    cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile:device-a");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      schema: "helix.environment_connector.device_check_list.v1",
      generated_at: "2026-11-13T00:00:00.000Z", devices: [],
      content_role: "device_health_observations_not_assistant_answer",
      credential_included: false, answer_authority: false,
      assistant_answer: false, terminal_eligible: false, raw_content_included: false,
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
  });

  afterEach(() => {
    cleanup();
    clearCachedAccountCapabilityPolicy();
    vi.unstubAllGlobals();
    delete window.casimirDesktop;
  });

  it("clears old world and setup availability while the next ordinary profile is inspected", async () => {
    const nextWorld = deferred<ReturnType<typeof world>>();
    const nextPersonal = deferred<{ available: boolean; phase: string }>();
    const inspectWorld = vi.fn().mockResolvedValueOnce(world("World A")).mockReturnValue(nextWorld.promise);
    const inspectPersonal = vi.fn().mockResolvedValueOnce({ available: true, phase: "ready" }).mockReturnValue(nextPersonal.promise);
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), getMinecraftIntegratedWorld: inspectWorld, personalMcpP1Connection: inspectPersonal };
    render(<DeviceCheckPanel />);
    expect(await screen.findByText(/Integrated world: World A/)).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Set up Full Harness" })).toBeTruthy();

    act(() => cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile:device-b"));
    expect(screen.queryByText(/Integrated world: World A/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Set up Full Harness" })).toBeNull();
    await waitFor(() => expect(inspectWorld).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(inspectPersonal).toHaveBeenCalledTimes(2));
    await act(async () => {
      nextWorld.resolve(world("World B"));
      nextPersonal.resolve({ available: false, phase: "build_unavailable" });
    });
    expect(await screen.findByText(/Integrated world: World B/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Set up Full Harness" })).toBeNull();
  });

  it("discards a world-picker result from the previous profile", async () => {
    const picker = deferred<ReturnType<typeof world>>();
    const inspectWorld = vi.fn().mockResolvedValueOnce(world("World A")).mockResolvedValue(world("World B"));
    const selectWorld = vi.fn(() => picker.promise);
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), getMinecraftIntegratedWorld: inspectWorld, selectMinecraftIntegratedWorld: selectWorld };
    render(<DeviceCheckPanel />);
    expect(await screen.findByText(/Integrated world: World A/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Change integrated world" }));
    expect(selectWorld).toHaveBeenCalledOnce();
    act(() => cacheAccountCapabilityPolicy(HELIX_USER_ACCOUNT_POLICY, "profile:device-b"));
    expect(await screen.findByText(/Integrated world: World B/)).toBeTruthy();
    await act(async () => picker.resolve(world("Late world A")));
    expect(screen.queryByText(/Late world A/)).toBeNull();
    expect(screen.getByText(/Integrated world: World B/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change integrated world" })).not.toBeDisabled();
  });

  it("retains the world during a routine policy refresh for the same profile", async () => {
    const inspectWorld = vi.fn(async () => world("World A"));
    window.casimirDesktop = { getRuntimeSnapshot: vi.fn(), getMinecraftIntegratedWorld: inspectWorld };
    render(<DeviceCheckPanel />);
    expect(await screen.findByText(/Integrated world: World A/)).toBeTruthy();
    act(() => window.dispatchEvent(new CustomEvent(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,
      { detail: { account_policy: HELIX_USER_ACCOUNT_POLICY, account_profile_changed: false } })));
    expect(screen.getByText(/Integrated world: World A/)).toBeTruthy();
    expect(inspectWorld).toHaveBeenCalledOnce();
  });
});
