/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SharedLiveRoomsAccessControl } from "../SharedLiveRoomsAccessControl";
import { cacheAccountCapabilityPolicy, readCachedAccountProfileIdentity } from
  "@/lib/workstation/accountCapabilityPolicy";
import { buildHelixAccountCapabilityPolicy, buildHelixSharedRealtimeRoomsExperimentPolicy } from
  "@shared/helix-account-session";

const base = buildHelixAccountCapabilityPolicy("user");
const status = (profile: string, optedIn = false) => ({
  account_policy: optedIn ? buildHelixSharedRealtimeRoomsExperimentPolicy("user") : base,
  session: { profile: { profile_id: profile } },
  experimental_features: { shared_realtime_rooms: { available: true, enabled: optedIn, opted_in: optedIn } },
});
const response = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const deferred = () => {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
};
const waiting = () => new Promise<Response>(() => {});
beforeEach(() => cacheAccountCapabilityPolicy(base, "profile:one"));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("does not restore an old profile when its status read finishes after an account switch", async () => {
  const old = deferred();
  vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(old.promise).mockImplementation(waiting));
  render(<SharedLiveRoomsAccessControl />);
  act(() => { cacheAccountCapabilityPolicy(base, "profile:two"); });
  await act(async () => { old.resolve(response(status("profile:one", true))); });
  expect(readCachedAccountProfileIdentity().profileId).toBe("profile:two");
  expect(screen.getByRole("switch")).toBeDisabled();
  expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
});

it("does not publish a late status read after unmount", async () => {
  const old = deferred(); vi.stubGlobal("fetch", vi.fn(() => old.promise));
  const view = render(<SharedLiveRoomsAccessControl />);
  view.unmount();
  cacheAccountCapabilityPolicy(base, "profile:two");
  await act(async () => { old.resolve(response(status("profile:one"))); });
  expect(readCachedAccountProfileIdentity().profileId).toBe("profile:two");
});

it("retires a pending opt-in result when its account changes", async () => {
  const pending = deferred(); let reads = 0;
  vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => {
    if (init?.method === "POST") return pending.promise;
    return ++reads === 1 ? Promise.resolve(response(status("profile:one"))) : waiting();
  }));
  render(<SharedLiveRoomsAccessControl />);
  const control = screen.getByRole("switch");
  await waitFor(() => expect(control).toBeEnabled());
  fireEvent.click(control);
  act(() => { cacheAccountCapabilityPolicy(base, "profile:two"); });
  await act(async () => { pending.resolve(response({ status: status("profile:one", true) })); });
  expect(readCachedAccountProfileIdentity().profileId).toBe("profile:two");
  expect(control).toBeDisabled();
  expect(control).toHaveAttribute("aria-checked", "false");
});

it("keeps the newest eligibility read when an older focus read finishes later", async () => {
  const old = deferred(); let reads = 0;
  vi.stubGlobal("fetch", vi.fn(() => {
    ++reads;
    if (reads === 1) return old.promise;
    if (reads === 2) return Promise.resolve(response(status("profile:one", true)));
    return waiting();
  }));
  render(<SharedLiveRoomsAccessControl />);
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true"));
  await act(async () => { old.resolve(response(status("profile:one", false))); });
  expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
});

it("keeps an opt-in pending across focus and discards an older status response", async () => {
  const old = deferred(), pending = deferred(); let reads = 0;
  const fetcher = vi.fn((_url: string, init?: RequestInit) => {
    if (init?.method === "POST") return pending.promise;
    return ++reads === 1 ? Promise.resolve(response(status("profile:one"))) : old.promise;
  });
  vi.stubGlobal("fetch", fetcher);
  render(<SharedLiveRoomsAccessControl />);
  const control = screen.getByRole("switch");
  await waitFor(() => expect(control).toBeEnabled());
  fireEvent(window, new Event("focus"));
  expect(reads).toBe(2);
  fireEvent.click(control);
  expect(control).toBeDisabled();
  fireEvent(window, new Event("focus"));
  expect(reads).toBe(2);
  await act(async () => { pending.resolve(response({ status: status("profile:one", true) })); });
  expect(control).toBeEnabled();
  expect(control).toHaveAttribute("aria-checked", "true");
  await act(async () => { old.resolve(response(status("profile:one", false))); });
  expect(control).toHaveAttribute("aria-checked", "true");
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
});

it("does not publish a pending opt-in result after the control unmounts", async () => {
  const pending = deferred();
  vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => init?.method === "POST"
    ? pending.promise : Promise.resolve(response(status("profile:one")))));
  const view = render(<SharedLiveRoomsAccessControl />);
  await waitFor(() => expect(screen.getByRole("switch")).toBeEnabled());
  fireEvent.click(screen.getByRole("switch"));
  view.unmount();
  cacheAccountCapabilityPolicy(base, "profile:two");
  await act(async () => { pending.resolve(response({ status: status("profile:one", true) })); });
  expect(readCachedAccountProfileIdentity().profileId).toBe("profile:two");
});
