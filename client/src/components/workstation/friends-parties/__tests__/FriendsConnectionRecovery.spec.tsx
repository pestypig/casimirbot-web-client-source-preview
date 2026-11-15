/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FriendsConnectionRecovery } from "../FriendsConnectionRecovery";
let completion: (value: unknown) => void;
const open = vi.fn(async () => undefined);
const unsubscribe = vi.fn();
const receipt = () => ({ schema: "casimir_desktop_auth0_account_link_start/1", ok: true,
  authorization_url: "https://example.auth0.com/authorize?state=private-state", expires_at: new Date(Date.now() + 60_000).toISOString(),
  provider: "auth0", pkce: "S256", client_secret_used: false, bearer_included: false, subject_included: false });
beforeEach(() => {
  vi.clearAllMocks();
  window.casimirDesktop = { openAuth0AccountLink: open, onAuth0AccountLinkCompletion: (listener: typeof completion) => { completion = listener; return unsubscribe; } } as never;
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(receipt()))));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); delete window.casimirDesktop; });
const done = (ok: boolean, error?: string) => completion({ schema: "casimir_desktop_auth0_account_link_completion/1", ok, error,
  authorization_purpose: "account_link", bearer_included: false, subject_included: false });
describe("Friends connection recovery", () => {
  it("lets the owner recheck a completed browser handoff when the native callback is missed", async () => {
    const connected = vi.fn();
    render(<FriendsConnectionRecovery onConnected={connected} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect Friends & Parties" }));
    await waitFor(() => expect(open).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Check connection" }));
    expect(connected).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledOnce();
    expect((screen.getByRole("button", { name: "Waiting for Friends authorization…" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("opens native PKCE only after the user requests it and reloads after the account callback", async () => {
    const connected = vi.fn();
    render(<FriendsConnectionRecovery onConnected={connected} />);
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Connect Friends & Parties" }));
    await waitFor(() => expect(open).toHaveBeenCalledOnce());
    expect(document.body.textContent).not.toContain("private-state");
    act(() => done(true));
    expect(connected).toHaveBeenCalledOnce();
  });
  it("does not mistake a room callback or missing Friends scope for successful social connection", async () => {
    const connected = vi.fn();
    render(<FriendsConnectionRecovery onConnected={connected} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect Friends & Parties" }));
    await waitFor(() => expect(open).toHaveBeenCalledOnce());
    act(() => completion({ schema: "casimir_desktop_auth0_account_link_completion/1", ok: true, authorization_purpose: "shared_live_rooms", bearer_included: false, subject_included: false }));
    expect(connected).not.toHaveBeenCalled();
    act(() => done(false, "friends_authorization_insufficient"));
    expect(screen.getByRole("status").textContent).toContain("Your account is signed in");
    expect(screen.getByRole("status").textContent).toContain("configuration needs to be checked by its maintainer");
    expect(screen.getByRole("status").textContent).toContain("You do not need to sign out or log in to the Auth0 dashboard");
    expect(screen.getByRole("status").textContent).not.toMatch(/try connecting|reconnect friends/i);
    expect(open).toHaveBeenCalledOnce();
    expect(connected).not.toHaveBeenCalled();
  });
  it("keeps retry guidance for a transient Friends connection failure", async () => {
    const connected = vi.fn();
    render(<FriendsConnectionRecovery onConnected={connected} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect Friends & Parties" }));
    await waitFor(() => expect(open).toHaveBeenCalledOnce());
    act(() => done(false, "friends_connection_failed"));
    expect(screen.getByRole("status").textContent).toContain("Your existing sign-in has not changed. Try again.");
    expect(connected).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Connect Friends & Parties" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("ignores a late start response after account-boundary unmount", async () => {
    let finish!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { finish = resolve; })));
    const { unmount } = render(<FriendsConnectionRecovery onConnected={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect Friends & Parties" }));
    unmount();
    await act(async () => { finish(new Response(JSON.stringify(receipt()))); });
    expect(open).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("allows recovery when the browser bridge never settles", async () => {
    vi.useFakeTimers();
    open.mockImplementationOnce(() => new Promise(() => {}));
    render(<FriendsConnectionRecovery onConnected={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect Friends & Parties" }));
    await act(async () => {});
    expect(open).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_001); });
    expect(screen.getByRole("status").textContent).toContain("timed out");
    expect((screen.getByRole("button", { name: "Connect Friends & Parties" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
