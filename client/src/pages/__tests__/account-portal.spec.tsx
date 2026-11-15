// @vitest-environment jsdom

import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AccountPortalPage from "../account-portal";

vi.mock("@/components/auth/GoogleSignInButton", () => ({
  GoogleSignInButton: () => <button type="button">Google sign-in</button>,
}));

vi.mock("@/components/account/PersonalTotpEnrollment", () => ({
  PersonalTotpEnrollment: ({ profileId }: { profileId: string }) =>
    <div data-testid="personal-totp-enrollment">{profileId}</div>,
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

  it("shows the owner's ledger-backed cap only for an active paid period", async () => {
    let signedOut = false;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/account/session" && signedOut)
        return response({ session: null });
      if (url === "/api/account/session") return response({ session: {
        profile: { profile_id: "auth0:auth0|owner",
          display_name: "Owner", auth_mode: "web_auth" },
      } });
      if (url === "/api/account/session/sign-out") {
        signedOut = true; return response({ ok: true });
      }
      if (url === "/api/managed-ai/status")
        return response({ available: false, reason: "offer_not_admitted" });
      if (url === "/api/managed-ai/checkout/private-test-offer")
        return response({ test_mode: true, provider_calls_enabled: false,
          tiers: ["ai_5", "ai_10"] });
      if (url === "/api/capped-membership/cap/status") return response({
        schema: "casimirbot.capped_membership_status.v1",
        state: "active", period_id: "capped:period:test",
        currency: "USD", period_ends_at: "2026-11-28T00:00:00Z",
        base_minor: 500, cap_minor: 500, maximum_cap_minor: 10_000,
        accrued_overage_minor: 0, reserved_minor: 0,
        remaining_cap_minor: 0,
        included_provider_remaining_micros_usd: 1_000_000,
        settled_provider_micros_usd: 0,
        reserved_provider_micros_usd: 0,
      });
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AccountPortalPage />);
    expect(await screen.findByText("Capped membership · active"))
      .toBeInTheDocument();
    expect(screen.getByText(/Included provider cost remaining: \$1\.00 USD/))
      .toBeInTheDocument();
    expect(screen.getByText(/additional cap remaining: \$0\.00/))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", {
      name: "Prepare $5 sandbox checkout" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {
      name: "Start $5 test checkout" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Managed AI allowance has not been launched/))
      .not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/capped-membership/cap/status",
      expect.objectContaining({ credentials: "same-origin",
        cache: "no-store" }));
    fireEvent.click(screen.getByRole("button", {
      name: "Sign out of website" }));
    await waitFor(() => expect(screen.queryByText("Capped membership · active"))
      .not.toBeInTheDocument());
  });

  it("does not restore a signed-out account's cap after a delayed ledger refresh", async () => {
    let signedOut = false, capReads = 0;
    let finishCapRead!: (result: Response) => void;
    const capped = {
      schema: "casimirbot.capped_membership_status.v1", state: "active",
      period_id: "capped:period:test", currency: "USD",
      period_ends_at: "2026-11-28T00:00:00Z", base_minor: 500,
      cap_minor: 500, maximum_cap_minor: 10_000, accrued_overage_minor: 0,
      reserved_minor: 0, remaining_cap_minor: 0,
      included_provider_remaining_micros_usd: 1_000_000,
      settled_provider_micros_usd: 0, reserved_provider_micros_usd: 0,
    };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/account/session") return response({ session: signedOut ? null : {
        profile: { profile_id: "auth0:fixture-owner", display_name: "Fixture owner", auth_mode: "web_auth" },
      } });
      if (url === "/api/account/session/sign-out") {
        signedOut = true; return response({ ok: true });
      }
      if (url === "/api/capped-membership/cap/status") {
        if (++capReads === 1) return response(capped);
        return new Promise<Response>(resolve => { finishCapRead = resolve; });
      }
      if (url === "/api/capped-membership/cap") return response({ cap_minor: 1_000 });
      return new Response(null, { status: 404 });
    }));
    render(<AccountPortalPage />);
    fireEvent.change(await screen.findByLabelText(
      "Set a higher total cap for this paid period (USD)"), { target: { value: "10.00" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Authorize higher cap" }));
    await waitFor(() => expect(finishCapRead).toBeTypeOf("function"));
    fireEvent.click(screen.getByRole("button", { name: "Sign out of website" }));
    await screen.findByText("Signed out on this website.");
    await act(async () => finishCapRead(response({ ...capped,
      cap_minor: 1_000, remaining_cap_minor: 500 })));
    expect(screen.queryByText("Capped membership · active")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Authorize higher cap" })).not.toBeInTheDocument();
  });

  it("explains an authoritative inactive capped period without showing cap controls", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/account/session") return response({ session: {
        profile: { profile_id: "auth0:auth0|owner",
          display_name: "Owner", auth_mode: "web_auth" },
      } });
      if (url === "/api/managed-ai/status") return response({
        available: false, reason: "offer_not_admitted" });
      if (url === "/api/capped-membership/cap/status") return response({
        schema: "casimirbot.capped_membership_status.v1",
        state: "inactive",
      });
      return new Response(null, { status: 404 });
    }));
    render(<AccountPortalPage />);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "No active capped membership for this account");
    expect(screen.queryByText("Capped membership · active"))
      .not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cap/i }))
      .not.toBeInTheDocument();
  });

  it("does not offer a second checkout when membership status cannot be verified", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/account/session") return response({ session: {
        profile: { profile_id: "auth0:auth0|owner",
          display_name: "Owner", auth_mode: "web_auth" },
      } });
      if (url === "/api/capped-membership/cap/status")
        return new Response(null, { status: 503 });
      if (url === "/api/capped-membership/checkout/offer")
        return response({ schema: "casimirbot.capped_membership_offer.v1" });
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AccountPortalPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/capped-membership/cap/status", expect.anything()));
    expect(screen.queryByRole("button", {
      name: "Prepare $5 sandbox checkout" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/capped-membership/checkout/offer", expect.anything());
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
    expect(await screen.findByText(/Stripe test payment verified.*Managed text still requires an approved installation, text permission, and available service capacity/))
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

  it("offers exact sandbox subscription management only when configured", async () => {
    const termId = "managed_ai:stripe_invoice:in_aiPaid123";
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/account/session") return response({ session: { profile: {
        profile_id: "profile:owner", display_name: "Owner", auth_mode: "web_auth",
      } } });
      if (url === "/api/managed-ai/status")
        return response({ available: false, reason: "offer_not_admitted" });
      if (url === "/api/managed-ai/usage") return response({
        as_of: "2026-10-10T12:00:00Z", terms: [],
      });
      if (url === "/api/managed-ai/device-grants")
        return response({ grants: [] });
      if (url === "/api/managed-ai/checkout/private-test-offer")
        return new Response(null, { status: 404 });
      if (url === "/api/managed-ai/checkout/management-status")
        return response({ test_mode: true, available: true, subscriptions: [{
          termId, subscriptionSuffix: "ner123",
          periodEndsAt: "2026-10-09T00:00:00.000Z",
        }] });
      if (url === "/api/managed-ai/checkout/manage")
        return response({ hosted_url:
          "https://billing.stripe.com/p/session/test_owner123" });
      throw Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AccountPortalPage />);
    expect(await screen.findByText(/last paid period ends/)).toBeInTheDocument();
    expect(screen.getByText(/A paid allowance may continue until then/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", {
      name: "Manage test subscription" }));
    expect(await screen.findByRole("link", {
      name: "Continue to Stripe cancellation" })).toHaveAttribute("href",
      "https://billing.stripe.com/p/session/test_owner123");
    expect(fetchMock).toHaveBeenCalledWith("/api/managed-ai/checkout/manage",
      expect.objectContaining({ method: "POST", credentials: "same-origin",
        body: JSON.stringify({ term_id: termId }) }));
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

    expect(await screen.findByRole("link", { name: /Create account/ })).toHaveAttribute(
      "href", "/api/auth/auth0/start?return_to=%2Faccount&signup=1",
    );
    expect(screen.getByRole("link", { name: /^Sign in$/ })).toHaveAttribute(
      "href", "/api/auth/auth0/start?return_to=%2Faccount",
    );
    expect(screen.getByText("Choose Google or email on the CasimirBot sign-in page.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Google sign-in" })).not.toBeInTheDocument();
    expect(screen.getByText(/This offer and managed GPT Live and agent API funding are not available publicly yet/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open app/i })).not.toBeInTheDocument();
  });

  it("does not recommend a provider retry when website session creation fails", async () => {
    window.history.replaceState(null, "", "/account?auth0_account=session_creation_failed");
    vi.stubGlobal("fetch", vi.fn(async () => response({ ok: true, session: null })));
    render(<AccountPortalPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "CasimirBot could not create your website session.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("use Google sign-in");
  });

  it("shows a verified account and signs out only the website session", async () => {
    const signedIn = { ok: true, session: { profile: {
      display_name: "Owner", email: "owner@example.com", auth_mode: "web_auth",
    } } };
    let signedOut=false;
    const fetchMock = vi.fn(async(url:string,options?:RequestInit)=>{
      if(url==="/api/account/session")return response(signedOut?{ok:true,session:null}:signedIn);
      if(url==="/api/managed-ai/status")return response({available:false,reason:"offer_not_admitted"});
      if(url==="/api/managed-ai/usage")return response({terms:[]});
      if(url==="/api/managed-ai/device-grants")return response({grants:[]});
      if(url==="/api/account/session/sign-out"&&options?.method==="POST"){signedOut=true;return response({ok:true});}
      return new Response(null,{status:404});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AccountPortalPage />);

    expect(await screen.findByText("owner@example.com")).toBeInTheDocument();
    expect(await screen.findByText(/Managed AI allowance has not been launched/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign out of website" }));
    await waitFor(() => expect(screen.getByText("Signed out on this website.")).toBeInTheDocument());
    for (const path of ["/api/managed-ai/status", "/api/managed-ai/usage",
      "/api/managed-ai/device-grants", "/api/managed-ai/checkout/private-test-offer",
      "/api/managed-ai/checkout/management-status",
      "/api/capped-membership/cap/status"]) {
      expect(fetchMock).toHaveBeenCalledWith(path,
        expect.objectContaining({ credentials: "same-origin" }));
    }
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/capped-membership/checkout/offer", expect.anything());
    expect(fetchMock.mock.calls.filter(([,options])=>options?.method==="POST")).toEqual([
      ["/api/account/session/sign-out",expect.objectContaining({method:"POST"})],
    ]);
    expect(screen.queryByRole("region",{name:"GCN account connection"})).toBeNull();
    expect(screen.getByRole("link", { name: /Create account/ })).toBeInTheDocument();
  });

  it.each([
    ["user", "User"],
    ["developer", "Developer"],
  ] as const)("shows the server-assigned %s account type", async (accountType, label) => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/account/session") return response({
        session: { profile: { display_name: "Owner", auth_mode: "web_auth" } },
        account_policy: { account_type: accountType },
      });
      if (url === "/api/managed-ai/status")
        return response({ available: false, reason: "offer_not_admitted" });
      if (url === "/api/managed-ai/usage") return response({ terms: [] });
      if (url === "/api/managed-ai/device-grants") return response({ grants: [] });
      if (url === "/api/managed-ai/checkout/private-test-offer")
        return new Response(null, { status: 404 });
      throw Error(`unexpected ${url}`);
    }));
    render(<AccountPortalPage />);
    expect(await screen.findByText(`Account type: ${label}`)).toBeInTheDocument();
  });

  it.each([
    ["verified Auth0 user", "user", "external_oauth", "2026-10-15T12:00:00.000Z", true],
    ["unverified Auth0 user", "user", "external_oauth", null, false],
    ["developer", "developer", "external_oauth", "2026-10-15T12:00:00.000Z", false],
    ["other provider", "user", "google", "2026-10-15T12:00:00.000Z", false],
  ] as const)("offers first-party factor setup only to a %s when eligible",
    async (_label, accountType, provider, emailVerifiedAt, expected) => {
      vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        if (url === "/api/account/session") return response({
          session: { profile: {
            profile_id: "profile:owner", display_name: "Owner",
            auth_mode: "web_auth", provider,
            email_verified_at: emailVerifiedAt,
          } },
          account_policy: { account_type: accountType },
        });
        if (url === "/api/managed-ai/status")
          return response({ available: false, reason: "offer_not_admitted" });
        if (url === "/api/managed-ai/usage") return response({ terms: [] });
        if (url === "/api/managed-ai/device-grants") return response({ grants: [] });
        if (url === "/api/managed-ai/checkout/private-test-offer")
          return new Response(null, { status: 404 });
        throw Error(`unexpected ${url}`);
      }));
      render(<AccountPortalPage />);
      await screen.findByText(`Account type: ${accountType === "developer" ? "Developer" : "User"}`);
      expect(Boolean(screen.queryByTestId("personal-totp-enrollment"))).toBe(expected);
      if (expected) expect(screen.getByTestId("personal-totp-enrollment"))
        .toHaveTextContent("profile:owner");
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
    expect(screen.getByText(/subject to installation approval, text permission, and available capacity/)).toBeInTheDocument();
    expect(screen.getByText(/Checkout alone starts no model call or hosted-room access/)).toBeInTheDocument();
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
