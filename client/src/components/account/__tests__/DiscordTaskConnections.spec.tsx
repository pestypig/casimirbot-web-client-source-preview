// @vitest-environment jsdom
import React from "react";
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiscordTaskConnections } from "../DiscordTaskConnections";
import { taskConfigurationFixture } from "@shared/__tests__/discord-task-configuration-fixture";
import { AGENT_CONNECTION_INVALIDATED_EVENT } from "@/lib/agent-access/connectionObservation";

const owner = "profile:configuration-owner", session = "session:configuration", configuration = taskConfigurationFixture(owner);
const response = (value: unknown = configuration, code = 200) => new Response(JSON.stringify({ ok: code === 200, configuration: value }),
  { status: code, headers: { "Content-Type": "application/json" } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete window.casimirDesktop; });
describe("website Captain Keyes saved setup", () => {
  it("loads only the current website session, renders observed setup, and starts no authorization or action", async () => {
    const fetchMock = vi.fn(async () => response()); vi.stubGlobal("fetch", fetchMock);
    render(<DiscordTaskConnections profileRef={owner} accountSessionRef={session} />);
    expect(await screen.findByText(/Remembered for task proposals/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage remembered links" })).toHaveAttribute("href", "/discord/account-links");
    expect(fetchMock).toHaveBeenCalledOnce(); expect(fetchMock).toHaveBeenCalledWith("/api/discord/task-configuration",
      expect.objectContaining({ credentials: "same-origin", cache: "no-store" }));
    expect(screen.queryByRole("button", { name: /approve|authorize|start/i })).toBeNull();
  });
  it("clears immediately on account switch and ignores an old account's delayed response", async () => {
    let release!: (r: Response) => void;
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise(resolve => { release = resolve; }))
      .mockResolvedValueOnce(response(taskConfigurationFixture("profile:other")));
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<DiscordTaskConnections profileRef={owner} accountSessionRef={session} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    view.rerender(<DiscordTaskConnections profileRef="profile:other" accountSessionRef="session:other" />);
    expect(await screen.findByText("CasimirBot account: profile:other")).toBeInTheDocument();
    await act(async () => { release(response()); });
    expect(screen.queryByText(`CasimirBot account: ${owner}`)).toBeNull();
    view.rerender(<DiscordTaskConnections profileRef={null} accountSessionRef={null} />);
    expect(screen.queryByRole("region")).toBeNull();
  });
  it("invalidates a displayed record before a replacement read completes", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response()).mockImplementationOnce(() => new Promise(() => {})); vi.stubGlobal("fetch", fetchMock);
    render(<DiscordTaskConnections profileRef={owner} accountSessionRef={session} />); await screen.findByText(/Remembered for task proposals/);
    act(() => window.dispatchEvent(new Event(AGENT_CONNECTION_INVALIDATED_EVENT)));
    expect(screen.queryByText(/Remembered for task proposals/)).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
  it.each([401, 403, 404])("hides unavailable or signed-out capability %s", async code => {
    const fetchMock = vi.fn(async () => response(null, code)); vi.stubGlobal("fetch", fetchMock);
    render(<DiscordTaskConnections profileRef={owner} accountSessionRef={session} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce()); expect(screen.queryByRole("region")).toBeNull();
  });
  it("keeps a failed source distinct from an empty observation and supports an explicit retry", async () => {
    const partial = { ...configuration, state: "partial", relay_destinations: { state: "unavailable", reason: "source_unavailable", items: [], truncated: false } };
    const fetchMock = vi.fn().mockResolvedValueOnce(response(partial)).mockResolvedValueOnce(response()); vi.stubGlobal("fetch", fetchMock);
    render(<DiscordTaskConnections profileRef={owner} accountSessionRef={session} />);
    expect(await screen.findByText("Some saved setup is unavailable.")).toBeInTheDocument();
    expect(screen.queryByText(/No active subscriber bot/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Refresh saved setup" }));
    expect(await screen.findByText(/Bot 123456789012345680/)).toBeInTheDocument(); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it.each(["foreign", "secret"])("rejects %s projections and does not render their fields", async mode => {
    vi.stubGlobal("fetch", vi.fn(async () => response(mode === "foreign" ? { ...configuration, owner_profile_ref: "profile:other" } : { ...configuration, token: "PRIVATE_TOKEN" })));
    render(<DiscordTaskConnections profileRef={owner} accountSessionRef={session} />);
    await screen.findByText("Saved Discord setup could not be loaded."); expect(screen.queryByText(/PRIVATE_TOKEN|profile:other/)).toBeNull();
  });
  it("does not borrow a website cookie for a native account or a signed-out page", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); window.casimirDesktop = {} as never;
    const view = render(<DiscordTaskConnections profileRef={owner} accountSessionRef={session} />);
    expect(screen.queryByRole("region")).toBeNull(); expect(fetchMock).not.toHaveBeenCalled();
    delete window.casimirDesktop; view.rerender(<DiscordTaskConnections profileRef={null} accountSessionRef={null} />);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
