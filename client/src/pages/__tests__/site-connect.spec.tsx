// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SiteConnectPage } from "../../../site/site-connect";

vi.mock("../../components/auth/GoogleSignInButton", () => ({
  GoogleSignInButton: () => <button type="button">Google sign-in</button>,
}));

const REQUEST = "link_95ad9f25-e4bb-4630-9ae4-4ba5f4de5103";
const json = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200, headers: { "Content-Type": "application/json" },
});

afterEach(() => {
  cleanup(); vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/account/connect");
});

describe("publisher installation consent", () => {
  it("keeps managed text unchecked until this owner explicitly selects it", async () => {
    window.history.replaceState(null, "", `/account/connect?request=${REQUEST}`);
    let approved = false;
    let submitted: unknown = null;
    vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
      if (url === `/api/managed-ai/device-links/${REQUEST}`) return json({
        request_id: REQUEST, installation_label: "Dan's laptop",
        key_fingerprint: "a".repeat(64), expires_at: "2030-01-01T00:00:00Z",
        state: approved ? "approved" : "pending",
        text_authorization_available: true,
        managed_text_authorized: approved,
      });
      if (url === "/api/account/session") return json({ session: { profile: {
        display_name: "Owner", auth_mode: "web_auth",
      } } });
      if (url.endsWith("/approve")) {
        submitted = JSON.parse(String(options?.body));
        approved = true;
        return json({ state: "approved" });
      }
      throw Error(`unexpected ${url}`);
    }));
    render(<SiteConnectPage />);
    const checkbox = await screen.findByRole("checkbox", {
      name: /Allow this installation to use my included AI allowance/u,
    });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "Approve this installation" }));
    await waitFor(() => expect(submitted).toEqual({ managed_text_authorized: true }));
    expect(await screen.findByText(/also approved for managed text requests/u))
      .toBeInTheDocument();
  });

  it("does not offer text consent when the domain has not admitted it", async () => {
    window.history.replaceState(null, "", `/account/connect?request=${REQUEST}`);
    let submitted: unknown = null;
    vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
      if (url === `/api/managed-ai/device-links/${REQUEST}`) return json({
        request_id: REQUEST, installation_label: "Dan's laptop",
        key_fingerprint: "a".repeat(64), expires_at: "2030-01-01T00:00:00Z",
        state: "pending", text_authorization_available: false,
      });
      if (url === "/api/account/session") return json({ session: { profile: {
        display_name: "Owner", auth_mode: "web_auth",
      } } });
      if (url.endsWith("/approve")) {
        submitted = JSON.parse(String(options?.body));
        return json({ state: "approved" });
      }
      throw Error(`unexpected ${url}`);
    }));
    render(<SiteConnectPage />);
    expect(await screen.findByText(/Dan's laptop/u)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Approve this installation" }));
    await waitFor(() => expect(submitted).toEqual({ managed_text_authorized: false }));
  });
});
