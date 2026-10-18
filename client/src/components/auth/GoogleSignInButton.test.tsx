// @vitest-environment jsdom

import React from "react";
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleSignInButton, readGoogleCsrfCookie } from "./GoogleSignInButton";

describe("GoogleSignInButton", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    document.cookie = "g_csrf_token=; Max-Age=0; path=/";
    delete window.google;
  });

  it("posts Google credential and CSRF token to the backend auth route", async () => {
    let callback: ((response: { credential?: string }) => Promise<void>) | undefined;
    const initialize = vi.fn((config: Record<string, unknown>) => {
      callback = config.callback as (response: { credential?: string }) => Promise<void>;
    });
    const renderButton = vi.fn((parent: HTMLElement) => {
      const button = document.createElement("button");
      button.textContent = "Sign in with Google";
      parent.appendChild(button);
    });
    const prompt = vi.fn();
    window.google = {
      accounts: {
        id: {
          initialize,
          renderButton,
          prompt,
        },
      },
    };
    document.cookie = "g_csrf_token=csrf";
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          session: {
            profile: {
              profile_id: "google:sub-123",
              display_name: "DatDamPig",
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onSignedIn = vi.fn();

    render(<GoogleSignInButton clientId="client-id" redirectTarget={null} onSignedIn={onSignedIn} />);

    await waitFor(() => expect(renderButton).toHaveBeenCalled());
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: "client-id",
        use_fedcm_for_button: true,
        button_auto_select: true,
      }),
    );
    expect(prompt).toHaveBeenCalled();
    expect(readGoogleCsrfCookie()).toBe("csrf");

    await act(async () => {
      await callback?.({ credential: "google-jwt" });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/google",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          credential: "google-jwt",
          g_csrf_token: "csrf",
        }),
      }),
    );
    expect(localStorage.getItem("helix:demo-user")).toContain("google:sub-123");
    expect(onSignedIn).toHaveBeenCalledOnce();
  });

  it("does not write a local profile when Google client id is missing", async () => {
    const initialize = vi.fn();
    window.google = {
      accounts: {
        id: {
          initialize,
          renderButton: vi.fn(),
          prompt: vi.fn(),
        },
      },
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<GoogleSignInButton clientId="" redirectTarget="/desktop" />);

    await waitFor(() => expect(document.body).toHaveTextContent("Google sign-in is not configured."));
    expect(initialize).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem("helix:demo-user")).toBeNull();
  });

  it("shows a Google choice on the website without opening a sign-in prompt automatically", async () => {
    const initialize = vi.fn();
    const renderButton = vi.fn();
    const prompt = vi.fn();
    window.google = { accounts: { id: { initialize, renderButton, prompt } } };

    render(<GoogleSignInButton clientId="client-id" redirectTarget={null} promptOnLoad={false} />);

    await waitFor(() => expect(renderButton).toHaveBeenCalled());
    expect(initialize).toHaveBeenCalledWith(expect.objectContaining({
      auto_select: false,
      button_auto_select: false,
    }));
    expect(prompt).not.toHaveBeenCalled();
  });
});
