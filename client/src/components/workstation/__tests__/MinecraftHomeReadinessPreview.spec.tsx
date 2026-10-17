// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MinecraftHomeReadinessPreview, { inspectMinecraftHomeSelection } from "../MinecraftHomeReadinessPreview";

const now = Date.parse("2026-09-30T12:00:00.000Z");
const observation = (observedAt = new Date(now).toISOString()) => ({
  schema: "helix.minecraft.local_selection_observation.v1",
  ok: true, address: "127.0.0.1:25566", observed_at: observedAt,
  credential_included: false, authority_granted: false,
  terminal_eligible: false, assistant_answer: false,
});
const reply = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const reader = (body: unknown, status = 200) => vi.fn(async () => reply(body, status)) as unknown as typeof fetch;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Minecraft Home read-only selection preview", () => {
  it("exposes one native, owner-confirmed shadow approval without sending a model or game request", async () => {
    const authorize = vi.fn(async () => ({ status: "approved" as const }));
    vi.stubGlobal("casimirDesktop", { authorizeResponsesActionChoiceOnce: authorize });
    const fetcher = vi.fn(async () => reply({ error: "minecraft_saved_loopback_selection_required" }, 409));
    vi.stubGlobal("fetch", fetcher);
    render(<MinecraftHomeReadinessPreview onClose={vi.fn()} onOpenLocalHarness={vi.fn()} onOpenAgentAccess={vi.fn()} />);
    await screen.findByText("No saved loopback address");
    expect(authorize).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Allow one shadow suggestion" }));
    await screen.findByText(/One shadow request is approved for up to two minutes; none was sent by this button/);
    expect(authorize).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("exposes a bounded multi-call session and a separate stop control", async () => {
    const session = vi.fn(async (action: string) => action === "state"
      ? { status: "inactive" as const }
      : action === "approve"
        ? { status: "approved" as const, remainingCalls: 5000, maxCalls: 5000,
          expiresAt: "2026-10-09T09:00:00.000Z" }
        : { status: "stopped" as const, remainingCalls: 0, maxCalls: 0,
          expiresAt: null });
    vi.stubGlobal("casimirDesktop", { responsesActionSession: session });
    vi.stubGlobal("fetch", reader({ error: "minecraft_saved_loopback_selection_required" }, 409));
    render(<MinecraftHomeReadinessPreview onClose={vi.fn()} onOpenLocalHarness={vi.fn()} onOpenAgentAccess={vi.fn()} />);
    await screen.findByText("No active Responses session.");
    fireEvent.click(screen.getByRole("button", { name: "Allow bounded session" }));
    await screen.findByText(/Active: 5000 of 5000 calls remain/);
    expect(session).toHaveBeenCalledWith("approve");
    fireEvent.click(screen.getByRole("button", { name: "Stop Responses session" }));
    await screen.findByText("Stopped; no more calls are authorized.");
    expect(session).toHaveBeenCalledWith("stop");
  });
  it("accepts only a fresh exact observation and never confuses it with gameplay readiness", async () => {
    const fetcher = reader(observation());
    expect(await inspectMinecraftHomeSelection(fetcher, now)).toEqual({
      status: "saved", address: "127.0.0.1:25566", observedAt: new Date(now).toISOString(),
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/agi/environment-connectors/local/minecraft/fabric-loopback/selection",
      { credentials: "same-origin", cache: "no-store" },
    );
  });
  it.each([
    ["old", observation(new Date(now - 31_000).toISOString())],
    ["future", observation(new Date(now + 6_000).toISOString())],
  ])("marks a %s observation stale", async (_label, body) => {
    expect(await inspectMinecraftHomeSelection(reader(body), now)).toEqual({ status: "stale" });
  });
  it("compares freshness at response arrival, not before a slow read", async () => {
    let clock = now;
    const observedAt = new Date(now + 10_000).toISOString();
    const fetcher = vi.fn(async () => { clock += 10_000; return reply(observation(observedAt)); }) as unknown as typeof fetch;
    expect(await inspectMinecraftHomeSelection(fetcher, () => clock)).toEqual({
      status: "saved", address: "127.0.0.1:25566", observedAt,
    });
  });
  it.each([
    ["extra credential field", { ...observation(), pairing_code: "should-not-appear" }],
    ["claimed grant", { ...observation(), authority_granted: true }],
    ["non-loopback address", { ...observation(), address: "example.com:25565" }],
  ])("rejects an %s rather than rendering it", async (_label, body) => {
    expect(await inspectMinecraftHomeSelection(reader(body), now)).toEqual({ status: "unavailable" });
  });
  it("distinguishes the exact missing-selection response from unrelated failures", async () => {
    expect(await inspectMinecraftHomeSelection(reader({ error: "minecraft_saved_loopback_selection_required" }, 409), now))
      .toEqual({ status: "missing" });
    expect(await inspectMinecraftHomeSelection(reader({ error: "other_failure" }, 409), now))
      .toEqual({ status: "unavailable" });
    expect(await inspectMinecraftHomeSelection(reader({}, 403), now))
      .toEqual({ status: "unavailable" });
  });
  it("shows saved selection without implying a running game or issuing an action", async () => {
    const fetcher = vi.fn(async () => reply(observation(new Date().toISOString())));
    vi.stubGlobal("fetch", fetcher);
    const openLocalHarness = vi.fn(), openAgentAccess = vi.fn(), close = vi.fn();
    render(<MinecraftHomeReadinessPreview onClose={close} onOpenLocalHarness={openLocalHarness} onOpenAgentAccess={openAgentAccess} />);
    await screen.findByText("Saved loopback address found");
    expect(screen.getByRole("region", { name: "Minecraft Adapter setup" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Minecraft Adapter output sources" })).toBeTruthy();
    for (const name of ["Codex conversation", "Helix activity", "Responses AI", "Live room", "Fabric controller"]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
    expect(screen.getByText(/not readiness checks; some are not connected in this build.*does not start a Codex task, forward room messages, or enable game control/i)).toBeTruthy();
    expect(screen.getByText(/Server ownership, selected client profile, Minecraft client, Fabric sensing/)).toBeTruthy();
    expect(screen.getByText(/Nothing was started or granted/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open local harness" }));
    fireEvent.click(screen.getByRole("button", { name: "Open Agent Access" }));
    fireEvent.click(screen.getByRole("button", { name: "Close Minecraft Adapter setup" }));
    expect(openLocalHarness).toHaveBeenCalledOnce();
    expect(openAgentAccess).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toContain("/selection");
    expect(fetcher.mock.calls[0][1].method).toBeUndefined();
  });
  it("refreshes only the saved selection after a missing result", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(reply({ error: "minecraft_saved_loopback_selection_required" }, 409))
      .mockResolvedValueOnce(reply(observation(new Date().toISOString())));
    vi.stubGlobal("fetch", fetcher);
    render(<MinecraftHomeReadinessPreview onClose={vi.fn()} onOpenLocalHarness={vi.fn()} onOpenAgentAccess={vi.fn()} />);
    await screen.findByText("No saved loopback address");
    fireEvent.click(screen.getByRole("button", { name: "Check setup" }));
    await waitFor(() => expect(screen.getByText("Saved loopback address found")).toBeTruthy());
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("aborts a superseded check and ignores its late result", async () => {
    let finishFirst: (value: ReturnType<typeof reply>) => void = () => {};
    const fetcher = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }))
      .mockResolvedValueOnce(reply({ error: "minecraft_saved_loopback_selection_required" }, 409));
    vi.stubGlobal("fetch", fetcher);
    render(<MinecraftHomeReadinessPreview onClose={vi.fn()} onOpenLocalHarness={vi.fn()} onOpenAgentAccess={vi.fn()} />);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    const firstSignal = fetcher.mock.calls[0][1].signal as AbortSignal;
    fireEvent.click(screen.getByRole("button", { name: "Check setup" }));
    expect(firstSignal.aborted).toBe(true);
    await screen.findByText("No saved loopback address");
    await act(async () => finishFirst(reply(observation(new Date().toISOString()))));
    expect(screen.getByText("No saved loopback address")).toBeTruthy();
  });
});
