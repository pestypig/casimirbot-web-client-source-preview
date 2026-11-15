// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MinecraftLocalLifecycleCard, launchMinecraftLocalLifecycle } from "../MinecraftLocalLifecycleCard";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const server = { schema: "helix.minecraft.local_server_lifecycle.v1", status: "listening",
  server_process_id: 4321, process_started_at: "2026-09-14T00:00:00.000Z", observed_at: "2026-09-14T00:00:05.000Z",
  server_address: "127.0.0.1:25566", launcher_action: "launched_server", profile_digest: "a".repeat(64),
  credentials_exposed: false, authority_widened: false };
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const receipt = { schema: "helix.minecraft.workstation_launch_receipt.v1", status: "connected",
  profile_id: "fixture-client", profile_version: "1.21.8", isolated_game_directory: true,
  client_process_id: 4322, server_address: "127.0.0.1:25566", launcher_action: "launched_client",
  connection_action: "autojoin_staged", play_control_point: "fixture-play", mod_loaded: true,
  memory_used_percent: 40, credentials_exposed: false };

it.each([
  ["account", "headers"], ["account", "body"], ["unmount", "headers"], ["unmount", "body"],
])("does not launch after %s changes while selection %s are pending", async (change, delayed) => {
  let resolve!: (value: Response) => void;
  const selection = response({ ok: true, address: "127.0.0.1:25566" });
  const fetch = vi.fn().mockImplementationOnce(() => {
    if (delayed === "headers") return new Promise<Response>(done => { resolve = done; });
    const pending = response({});
    vi.spyOn(pending, "json").mockImplementation(() => new Promise(done => {
      resolve = value => { void value.json().then(done); };
    }));
    return Promise.resolve(pending);
  }).mockResolvedValue(response({ ok: true, receipt }));
  vi.stubGlobal("fetch", fetch);
  const view = render(<MinecraftLocalLifecycleCard />);
  fireEvent.click(screen.getByRole("button", { name: "Start saved Minecraft setup" }));
  await waitFor(() => expect(resolve).toBeTypeOf("function"));
  if (change === "account") act(() => window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
  else view.unmount();
  await act(async () => { resolve(selection); await Promise.resolve(); });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/Client setup completed/)).toBeNull();
});

it.each(["selection", "launch"])("rejects a decoded %s response after its deadline", async phase => {
  const deadline = new AbortController();
  vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
  let finish!: (value: unknown) => void;
  const pending = response({});
  vi.spyOn(pending, "json").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const fetch = vi.fn();
  if (phase === "launch") fetch.mockResolvedValueOnce(response({ ok: true, address: "127.0.0.1:25566" }));
  fetch.mockResolvedValueOnce(pending).mockResolvedValue(response({ ok: true, receipt }));
  vi.stubGlobal("fetch", fetch);
  const result = launchMinecraftLocalLifecycle().then(value => ({ value }), error => ({ error }));
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  deadline.abort(new DOMException("Request expired", "TimeoutError"));
  finish(phase === "selection" ? { ok: true, address: "127.0.0.1:25566" } : { ok: true, receipt });
  expect(await result).toHaveProperty("error");
  expect(fetch).toHaveBeenCalledTimes(phase === "selection" ? 1 : 2);
});

it.each(["selection", "launch"])("cancels a direct helper call on account change during %s", async phase => {
  let finish!: (value: Response) => void;
  const fetch = vi.fn();
  if (phase === "launch") fetch.mockResolvedValueOnce(response({ ok: true, address: "127.0.0.1:25566" }));
  fetch.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }))
    .mockResolvedValue(response({ ok: true, receipt }));
  vi.stubGlobal("fetch", fetch);
  const result = launchMinecraftLocalLifecycle().then(value => ({ value }), error => ({ error }));
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT));
  finish(response(phase === "selection" ? { ok: true, address: "127.0.0.1:25566" } : { ok: true, receipt }));
  expect(await result).toHaveProperty("error");
  expect(fetch).toHaveBeenCalledTimes(phase === "selection" ? 1 : 2);
});

it("clears an old account startup result and ignores its late response", async () => {
  let finish!: (value: Response) => void;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response({ ok: true, address: "127.0.0.1:25566" }))
    .mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; })));
  render(<MinecraftLocalLifecycleCard />);
  fireEvent.click(screen.getByRole("button", { name: "Start saved Minecraft setup" }));
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  act(() => window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
  await act(async () => { finish(response({ ok: true, receipt })); });
  expect(screen.queryByText(/Client setup completed/)).toBeNull();
  expect(screen.getByRole("button", { name: "Start saved Minecraft setup" })).toBeEnabled();
});

it("reports setup completion while still waiting for game observation", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response({ ok: true, address: "127.0.0.1:25566" }))
    .mockResolvedValueOnce(response({ ok: true, receipt })));
  render(<MinecraftLocalLifecycleCard />);
  fireEvent.click(screen.getByRole("button", { name: "Start saved Minecraft setup" }));
  await screen.findByText(/Client setup completed.*Waiting for game observation/);
  act(() => window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
  expect(screen.queryByText(/Client setup completed/)).toBeNull();
});
it("uses the saved address and displays the prior server effect when client setup fails", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response({ ok: true, address: "127.0.0.1:25566" }))
    .mockResolvedValueOnce(response({ ok: false, message: "Client profile needs selection.", server_lifecycle: server }, 409));
  vi.stubGlobal("fetch", fetch);
  render(<MinecraftLocalLifecycleCard />);
  fireEvent.click(screen.getByRole("button", { name: "Start saved Minecraft setup" }));
  await screen.findByText(/Server listening was observed at 2026-09-14T00:00:05.000Z; client setup did not complete/);
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ address: "127.0.0.1:25566", operator_confirmation: true });
  expect(screen.queryByText(/^Connected to/)).toBeNull();
});
it("does not launch when saved setup is unavailable", async () => {
  const fetch = vi.fn().mockResolvedValue(response({ ok: false, message: "Select saved setup." }, 409));
  vi.stubGlobal("fetch", fetch);
  await expect(launchMinecraftLocalLifecycle()).rejects.toThrow("Select saved setup.");
  expect(fetch).toHaveBeenCalledOnce();
});
it("rejects an empty success receipt instead of inventing a joined state", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response({ ok: true, address: "localhost:25565" }))
    .mockResolvedValueOnce(response({ ok: true })));
  await expect(launchMinecraftLocalLifecycle()).rejects.toThrow("incomplete startup receipt");
});
