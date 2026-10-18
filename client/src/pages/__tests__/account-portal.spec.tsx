// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccountPortalPage from "../account-portal";

vi.mock("@/components/auth/GoogleSignInButton", () => ({
  GoogleSignInButton: () => <button type="button">Google sign-in</button>,
}));

const response = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { "Content-Type": "application/json" },
});

describe("download-first account portal", () => {
  afterEach(() => {
    cleanup(); vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/account");
    window.sessionStorage.removeItem("casimirbot:managed-ai-checkout-session:v1");
    window.sessionStorage.removeItem("casimirbot:managed-ai-test-checkout-request:v1");
  });

  it("verifies a returned Checkout with the signed-in account before showing allowance", async () => {
    window.history.replaceState(null, "",
      "/account?managed_ai_checkout=returned&managed_ai_checkout_session=cs_test_aiPlan123");
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/account/session") return response({ session: { profile: {
        profile_id: "profile:owner", display_name: "Owner", auth_mode: "web_auth",
      } } });
      if (url === "/api/managed-ai/status")
        return response({ available: false, reason: "offer_not_admitted" });
      if (url === "/api/managed-ai/usage") return response({ terms: [] });
      if (url === "/api/managed-ai/device-grants") return response({ grants: [] });
      if (url === "/api/managed-ai/checkout/reconcile")
        return response({ entitlement_state: "active" });
      throw Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AccountPortalPage />);
    expect(await screen.findByText(/Stripe test payment verified/))
      .toBeInTheDocument();
    expect(window.location.search).toBe("");
    expect(window.sessionStorage.getItem("casimirbot:managed-ai-checkout-session:v1"))
      .toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/managed-ai/checkout/reconcile",
      expect.objectContaining({ method: "POST", credentials: "same-origin",
        body: JSON.stringify({ checkout_session_id: "cs_test_aiPlan123" }) }),
    );
  });

  it("keeps a returned Checkout for later verification when the buyer is signed out", async () => {
    window.history.replaceState(null, "",
      "/account?managed_ai_checkout=returned&managed_ai_checkout_session=cs_test_aiPlan123");
    const fetchMock = vi.fn(async () => response({ session: null }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AccountPortalPage />);
    expect(await screen.findByText("Sign in with the purchasing account to check it."))
      .toBeInTheDocument();
    expect(window.sessionStorage.getItem("casimirbot:managed-ai-checkout-session:v1"))
      .toBe("cs_test_aiPlan123");
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/managed-ai/checkout/reconcile", expect.anything());
  });

  it("confirms an emailed one-use token and removes it from the URL", async () => {
    window.history.replaceState(null, "", "/account?token=acct_verify_test");
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/account/session") return response({ ok: true, session: null });
      if (url === "/api/account/session/email-verification/confirm") return response({ ok: true });
      throw Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AccountPortalPage />);
    expect(await screen.findByText("Email verified. Your account status is updating.")).toBeInTheDocument();
    expect(window.location.search).toBe("");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/account/session/email-verification/confirm",
      expect.objectContaining({ method: "POST", credentials: "same-origin",
        body: JSON.stringify({ token_value: "acct_verify_test" }) }),
    );
  });

  it("shows the real sign-in choices without presenting managed checkout", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ ok: true, session: null })));
    render(<AccountPortalPage />);

    expect(await screen.findByRole("link", { name: /Continue with CasimirBot sign-in/ })).toHaveAttribute(
      "href", "/api/auth/auth0/start?return_to=%2Faccount",
    );
    expect(screen.getByText("Choose Google or email on the CasimirBot sign-in page.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Google sign-in" })).not.toBeInTheDocument();
    expect(screen.getByText(/Public enrollment and managed provider calls are not available yet/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open app/i })).not.toBeInTheDocument();
  });

  it("shows a verified account and signs out only the website session", async () => {
    const signedIn = { ok: true, session: { profile: {
      display_name: "Owner", email: "owner@example.com", auth_mode: "web_auth",
    } } };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(signedIn))
      .mockResolvedValueOnce(response({ available: false, reason: "offer_not_admitted" }))
      .mockResolvedValueOnce(response({ terms: [] }))
      .mockResolvedValueOnce(response({ grants: [] }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(response({ ok: true }))
      .mockResolvedValueOnce(response({ ok: true, session: null }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AccountPortalPage />);

    expect(await screen.findByText("owner@example.com")).toBeInTheDocument();
    expect(await screen.findByText(/Managed AI allowance has not been launched/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign out of website" }));
    await waitFor(() => expect(screen.getByText("Signed out on this website.")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/managed-ai/status", expect.objectContaining({ credentials: "same-origin" }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/managed-ai/usage", expect.objectContaining({ credentials: "same-origin" }));
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/managed-ai/device-grants", expect.objectContaining({ credentials: "same-origin" }));
    expect(fetchMock).toHaveBeenNthCalledWith(5, "/api/managed-ai/checkout/private-test-offer", expect.objectContaining({ credentials: "same-origin" }));
    expect(fetchMock).toHaveBeenNthCalledWith(6, "/api/account/session/sign-out", expect.objectContaining({ method: "POST" }));
    expect(screen.getByRole("link", { name: /Continue with CasimirBot sign-in/ })).toBeInTheDocument();
  });

  it("lets the website owner disconnect an approved installation", async () => {
    const session = { ok: true, session: { profile: {
      display_name: "Owner", auth_mode: "web_auth",
    } } };
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/account/session") return response(session);
      if (url === "/api/managed-ai/status") return response({ available: false, reason: "offer_not_admitted" });
      if (url === "/api/managed-ai/usage") return response({ terms: [] });
      if (url === "/api/managed-ai/device-grants") return response({ grants: fetchMock.mock.calls.some(
        ([calledUrl]) => calledUrl === "/api/managed-ai/device-grants/grant_test/revoke") ? [] : [{
          grantId: "grant_test", installationLabel: "CasimirBot on this computer",
          keyThumbprint: "a".repeat(64), expiresAt: "2026-10-10T12:00:00.000Z",
          lastUsedAt: null,
        }] });
      if (url === "/api/managed-ai/device-grants/grant_test/revoke") return response({ state: "revoked" });
      throw Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AccountPortalPage />);
    expect(await screen.findByText("CasimirBot on this computer")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await screen.findByText("Installation disconnected. Its CasimirBot device credential is revoked.");
    expect(screen.getByText("No installations connected.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/managed-ai/device-grants/grant_test/revoke",
      expect.objectContaining({ method: "POST", credentials: "same-origin" }),
    );
  });

  it("labels included reservations separately from own-key usage", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/account/session") return response({ session: { profile: {
        display_name: "Owner", auth_mode: "web_auth",
      } } });
      if (url === "/api/managed-ai/status") return response({ available: false, reason: "offer_not_admitted" });
      if (url === "/api/managed-ai/device-grants") return response({ grants: [] });
      if (url === "/api/managed-ai/usage") return response({
        as_of: "2026-10-01T00:00:00.000Z", payer: "casimirbot_managed",
        own_key_usage_included: false, terms: [{
          termId: "term:test", sourceKind: "subscription",
          planTier: "ai_5", processorLivemode: false, state: "active",
          periodEndsAt: "2026-10-08T00:00:00.000Z", budgetMicros: 1_000_000,
          committedMicros: 200_000, remainingMicros: 800_000,
          observedEstimateMicros: 40_000, observedInputTokens: 120,
          observedOutputTokens: 30, observedRequests: 1,
          pendingRequests: 1, uncertainRequests: 0,
        }],
      });
      throw Error(`unexpected ${url}`);
    }));
    render(<AccountPortalPage />);
    expect(await screen.findByText(/Own-key calls are separate/)).toBeInTheDocument();
    expect(screen.getByText(/\$5 AI plan/)).toBeInTheDocument();
    expect(screen.getByText(/Stripe test · \$5 AI plan/)).toBeInTheDocument();
    expect(screen.getByText(/Reserved \$0\.2000 of \$1\.0000/)).toBeInTheDocument();
    expect(screen.getByText(/120 input, 30 output/)).toBeInTheDocument();
  });

  it("shows private test checkout only when the server admits this owner", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/account/session") return response({ session: { profile: {
        profile_id: "profile:owner", display_name: "Owner", auth_mode: "web_auth",
      } } });
      if (url === "/api/managed-ai/status")
        return response({ available: false, reason: "offer_not_admitted" });
      if (url === "/api/managed-ai/usage") return response({ terms: [] });
      if (url === "/api/managed-ai/device-grants") return response({ grants: [] });
      if (url === "/api/managed-ai/checkout/private-test-offer") return response({
        test_mode: true, provider_calls_enabled: false, tiers: ["ai_5", "ai_10"],
      });
      throw Error(`unexpected ${url}`);
    }));
    render(<AccountPortalPage />);
    expect(await screen.findByText("Owner-only Stripe test checkout")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start $5 test checkout" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start $10 test checkout" })).toBeInTheDocument();
    expect(screen.getByText(/do not enable managed model calls or a hosted room/)).toBeInTheDocument();
  });

  it("reuses an uncertain test Checkout request instead of creating another", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "00000000-0000-4000-8000-000000000001") });
    const checkoutBodies: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
      if (url === "/api/account/session") return response({ session: { profile: {
        profile_id: "profile:owner", display_name: "Owner", auth_mode: "web_auth",
      } } });
      if (url === "/api/managed-ai/status")
        return response({ available: false, reason: "offer_not_admitted" });
      if (url === "/api/managed-ai/usage") return response({ terms: [] });
      if (url === "/api/managed-ai/device-grants") return response({ grants: [] });
      if (url === "/api/managed-ai/checkout/private-test-offer") return response({
        test_mode: true, provider_calls_enabled: false, tiers: ["ai_5", "ai_10"],
      });
      if (url === "/api/managed-ai/checkout") {
        checkoutBodies.push(String(options?.body));
        throw new Error("network response lost");
      }
      throw Error(`unexpected ${url}`);
    }));
    render(<AccountPortalPage />);
    const button = await screen.findByRole("button", { name: "Start $5 test checkout" });
    fireEvent.click(button);
    await screen.findByText(/Retry will use the same request/);
    fireEvent.click(button);
    await waitFor(() => expect(checkoutBodies).toHaveLength(2));
    expect(JSON.parse(checkoutBodies[0])).toEqual(JSON.parse(checkoutBodies[1]));
    expect(JSON.parse(checkoutBodies[0])).toEqual({
      tier: "ai_5", request_id: "00000000-0000-4000-8000-000000000001",
    });
  });
});
