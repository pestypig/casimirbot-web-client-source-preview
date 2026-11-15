// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Auth0SignInButton, auth0AccountStartHref } from "./Auth0SignInButton";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("Auth0SignInButton", () => {
  it("uses the same-origin start route with an encoded local return path", () => {
    const href = auth0AccountStartHref(
      "/desktop?panels=account-session&focus=account-session",
    );
    expect(href).toBe(
      "/api/auth/auth0/start?return_to=%2Fdesktop%3Fpanels%3Daccount-session%26focus%3Daccount-session",
    );
    expect(href).not.toContain("access_token");
    expect(href).not.toContain("client_secret");
  });

  it("does not treat a stale callback marker as an active desktop session", () => {
    window.history.replaceState({}, "", "/desktop?auth0_account=linked");
    vi.stubGlobal("casimirDesktop", { openAuth0ProfileSignIn: vi.fn() });
    render(<Auth0SignInButton />);
    expect(screen.getByRole("button", { name: /Sign in with Auth0/ })).toBeTruthy();
    expect(screen.queryByText("Auth0 profile session connected.")).toBeNull();
  });

  it("replaces an old expiry warning while a new browser sign-in is pending", async () => {
    window.history.replaceState({}, "", "/desktop?auth0_account=login_intent_expired&panels=account-session");
    const openAuth0ProfileSignIn = vi.fn().mockResolvedValue({ opened: true });
    vi.stubGlobal("casimirDesktop", { openAuth0ProfileSignIn });
    render(<Auth0SignInButton />);

    expect(screen.getByRole("alert").textContent).toContain("expired");
    fireEvent.click(screen.getByRole("button", { name: /Sign in with Auth0/ }));
    await waitFor(() => expect(openAuth0ProfileSignIn).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("browser"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(window.location.search).toBe("?panels=account-session");
  });

  it("retains the expiry marker when a new browser request cannot open", async () => {
    window.history.replaceState({}, "", "/desktop?auth0_account=login_intent_expired");
    vi.stubGlobal("casimirDesktop", {
      openAuth0ProfileSignIn: vi.fn().mockRejectedValue(new Error("unavailable")),
    });
    render(<Auth0SignInButton />);
    fireEvent.click(screen.getByRole("button", { name: /Sign in with Auth0/ }));

    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(2));
    expect(window.location.search).toBe("?auth0_account=login_intent_expired");
    expect(screen.queryByRole("status")).toBeNull();
  });
});
