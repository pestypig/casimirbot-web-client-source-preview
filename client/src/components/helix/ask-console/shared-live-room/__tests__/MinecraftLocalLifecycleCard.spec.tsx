// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MinecraftLocalLifecycleCard, launchMinecraftLocalLifecycle } from "../MinecraftLocalLifecycleCard";
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const server = { schema: "helix.minecraft.local_server_lifecycle.v1", status: "listening",
  server_process_id: 4321, process_started_at: "2026-09-14T00:00:00.000Z", observed_at: "2026-09-14T00:00:05.000Z",
  server_address: "127.0.0.1:25566", launcher_action: "launched_server", profile_digest: "a".repeat(64),
  credentials_exposed: false, authority_widened: false };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
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
