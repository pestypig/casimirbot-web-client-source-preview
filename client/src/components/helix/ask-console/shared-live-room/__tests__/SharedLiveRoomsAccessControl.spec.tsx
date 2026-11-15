/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SharedLiveRoomsAccessControl } from "../SharedLiveRoomsAccessControl";
import { readCachedAccountCapabilityPolicy } from
  "@/lib/workstation/accountCapabilityPolicy";
import { buildHelixAccountCapabilityPolicy, buildHelixSharedRealtimeRoomsExperimentPolicy } from
  "@shared/helix-account-session";

const session = (available: boolean, optedIn: boolean) => ({
  account_policy: optedIn
    ? buildHelixSharedRealtimeRoomsExperimentPolicy("user")
    : buildHelixAccountCapabilityPolicy("user"),
  session: { profile: { profile_id: "auth0:guide" } },
  experimental_features: { shared_realtime_rooms: { available, enabled: optedIn, opted_in: optedIn } },
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("enables rooms from Helix Ask for an eligible account", async () => {
  let enabled = false;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/account/session/experimental-rooms" && init?.method === "POST") enabled = true;
    return new Response(JSON.stringify(init?.method === "POST"
      ? { status: session(true, enabled) } : session(true, enabled)),
    { status: 200, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<SharedLiveRoomsAccessControl />);
  const control = await screen.findByRole("switch", { name: "Shared Live Rooms" });
  await waitFor(() => expect(control).toBeEnabled());
  fireEvent.click(control);
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith("/api/account/session/experimental-rooms",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ enabled: true }) }));
    expect(control).toHaveAttribute("aria-checked", "true");
  });
});

it("keeps unavailable rooms off but permits revoking a saved opt-in", async () => {
  let enabled = true;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/account/session/experimental-rooms" && init?.method === "POST") enabled = false;
    return new Response(JSON.stringify(init?.method === "POST"
      ? { status: session(false, enabled) } : session(false, enabled)),
    { status: 200, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<SharedLiveRoomsAccessControl />);
  const control = await screen.findByRole("switch", { name: "Shared Live Rooms" });
  await waitFor(() => expect(control).toBeEnabled());
  fireEvent.click(control);
  await waitFor(() => {
    expect(fetchMock).toHaveBeenCalledWith("/api/account/session/experimental-rooms",
      expect.objectContaining({ body: JSON.stringify({ enabled: false }) }));
    expect(control).toHaveAttribute("aria-checked", "false");
    expect(control).toBeDisabled();
  });
});

it("refreshes eligibility when the owner returns from browser approval", async () => {
  let available = false;
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(session(available, false)),
    { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  render(<SharedLiveRoomsAccessControl />);
  const control = await screen.findByRole("switch", { name: "Shared Live Rooms" });
  await waitFor(() => expect(control).toBeDisabled());
  available = true;
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(control).toBeEnabled());
});

it("updates room toolbar policy when the owner opts in on the website", async () => {
  let optedIn = false;
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(session(true, optedIn)),
    { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  render(<SharedLiveRoomsAccessControl />);
  const control = await screen.findByRole("switch", { name: "Shared Live Rooms" });
  await waitFor(() => expect(control).toHaveAttribute("aria-checked", "false"));

  optedIn = true;
  fireEvent(window, new Event("focus"));
  await waitFor(() => {
    expect(control).toHaveAttribute("aria-checked", "true");
    expect(readCachedAccountCapabilityPolicy()?.feature_flags).toContain("shared_realtime_rooms");
  });
});
