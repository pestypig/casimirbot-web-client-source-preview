// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CappedMembershipSandboxCheckout } from
  "../CappedMembershipSandboxCheckout";

const offer = {
  schema: "casimirbot.capped_membership_offer.v1", test_mode: true,
  provider_calls_enabled: false, currency: "USD", base_minor: 500,
  initial_cap_minor: 500, maximum_first_period_cap_minor: 10_000,
  included_provider_micros_usd: 1_000_000, overage_multiplier: 2,
  disclosure_revision: "capped-membership-initial-cap-v1",
  cap_increase_available: false,
};
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("private capped membership customer review", () => {
  afterEach(() => {
    cleanup(); vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/account");
    window.sessionStorage.clear();
  });

  it("requires the exact review before creating one saved sandbox intent", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/offer")) return ok(offer);
      if (url.endsWith("/checkout/pending")) return ok({
        schema: "casimirbot.capped_checkout_pending.v1", state: "none" });
      if (url.endsWith("/checkout")) return ok({
        checkout_session_id: "cs_test_capped12345",
        hosted_url: "https://checkout.stripe.com/c/pay/cs_test_capped12345",
      });
      throw Error(`unexpected ${url} ${init?.method}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CappedMembershipSandboxCheckout verifiedIdentity />);
    const start = await screen.findByRole("button", {
      name: "Prepare $5 sandbox checkout" });
    expect(start).toBeDisabled();
    expect(screen.getByText(/renews monthly until canceled/)).toBeInTheDocument();
    expect(screen.getByText(/an increase you authorize for one month does not carry/))
      .toBeInTheDocument();
    expect(screen.getByText(/automatic renewal, and cancellation path/))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(start);
    await screen.findByRole("link", { name: "Continue to Stripe test checkout" });
    const call = fetchMock.mock.calls.find(([url]) => url.endsWith("/checkout"));
    const body = JSON.parse(String(call?.[1]?.body));
    expect(body).toEqual({ intent_id: expect.stringMatching(/^capped_intent:/),
      accepted_all_in_cap_minor: 500,
      accepted_included_provider_micros_usd: 1_000_000,
      accepted_overage_multiplier: 2,
      accepted_terms_revision: offer.disclosure_revision });
    expect(window.sessionStorage.getItem("casimirbot:capped-membership-intent:v1"))
      .toBe(body.intent_id);
  });

  it("restores a verified open Checkout without dispatching a second one", async () => {
    const sessionId = "cs_test_cappedResume123";
    const hostedUrl = `https://checkout.stripe.com/c/pay/${sessionId}#secret`;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/offer")) return ok(offer);
      if (url.endsWith("/checkout/pending")) return ok({
        schema: "casimirbot.capped_checkout_pending.v1", state: "open",
        checkout_session_id: sessionId, hosted_url: hostedUrl });
      throw Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CappedMembershipSandboxCheckout verifiedIdentity />);
    const link = await screen.findByRole("link", {
      name: "Continue to Stripe test checkout" });
    expect(link).toHaveAttribute("href", hostedUrl);
    expect(window.sessionStorage.getItem("casimirbot:capped-membership-session:v1"))
      .toBe(sessionId);
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/capped-membership/checkout", expect.anything());
  });

  it("explains the available higher-cap review without implying provider access", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) =>
      url.endsWith("/offer") ? ok({ ...offer,
        cap_increase_available: true }) : ok({
        schema: "casimirbot.capped_checkout_pending.v1", state: "none" })));
    render(<CappedMembershipSandboxCheckout verifiedIdentity />);
    expect(await screen.findByText(/After payment is verified, you can review and authorize/))
      .toBeInTheDocument();
    expect(screen.getByText(/Managed GPT Live and agent funding are not enabled/))
      .toBeInTheDocument();
  });

  it("does not treat a return selector as payment proof", async () => {
    window.history.replaceState(null, "",
      "/account?capped_membership=returned&session=cs_test_capped12345");
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/offer")) return ok(offer);
      if (url.endsWith("/checkout/pending")) return ok({
        schema: "casimirbot.capped_checkout_pending.v1", state: "none" });
      if (url.endsWith("/reconcile"))
        return new Response(JSON.stringify({ error: "unverified" }), { status: 503 });
      throw Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CappedMembershipSandboxCheckout verifiedIdentity />);
    expect(await screen.findByText(/It does not prove payment/)).toBeInTheDocument();
    expect(window.location.search).toBe("");
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/capped-membership/checkout/reconcile", expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Check Stripe test payment" }));
    await screen.findByText(/Payment is not verified for this account yet/);
    expect(window.sessionStorage.getItem("casimirbot:capped-membership-session:v1"))
      .toBe("cs_test_capped12345");
  });

  it("records success only after an owner-bound server receipt", async () => {
    window.sessionStorage.setItem("casimirbot:capped-membership-session:v1",
      "cs_test_capped12345");
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/offer")) return ok(offer);
      if (url.endsWith("/checkout/pending")) return ok({
        schema: "casimirbot.capped_checkout_pending.v1", state: "none" });
      if (url.endsWith("/reconcile"))
        return ok({ state: "paid_period_recorded" });
      throw Error(`unexpected ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const onPaidPeriodRecorded = vi.fn(async () => undefined);
    render(<CappedMembershipSandboxCheckout verifiedIdentity
      onPaidPeriodRecorded={onPaidPeriodRecorded} />);
    fireEvent.click(await screen.findByRole("button", {
      name: "Check Stripe test payment" }));
    await screen.findByText(/Stripe test payment and account ownership were verified/);
    await waitFor(() => expect(window.sessionStorage.getItem(
      "casimirbot:capped-membership-session:v1")).toBeNull());
    expect(onPaidPeriodRecorded).toHaveBeenCalledOnce();
  });

  it("explains the remaining device checks when private text is admitted", async () => {
    window.sessionStorage.setItem("casimirbot:capped-membership-session:v1",
      "cs_test_capped12345");
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/offer"))
        return ok({ ...offer, provider_calls_enabled: true });
      if (url.endsWith("/checkout/pending")) return ok({
        schema: "casimirbot.capped_checkout_pending.v1", state: "none" });
      if (url.endsWith("/reconcile"))
        return ok({ state: "paid_period_recorded" });
      throw Error(`unexpected ${url}`);
    }));
    render(<CappedMembershipSandboxCheckout verifiedIdentity />);
    fireEvent.click(await screen.findByRole("button", {
      name: "Check Stripe test payment" }));
    await screen.findByText(/managed text still requires an approved installation/);
  });
});
