import { useEffect, useState } from "react";

type Offer = Readonly<{
  schema: "casimirbot.capped_membership_offer.v1";
  test_mode: true;
  provider_calls_enabled: boolean;
  currency: "USD";
  base_minor: 500;
  initial_cap_minor: 500;
  maximum_first_period_cap_minor: 10_000;
  included_provider_micros_usd: 1_000_000;
  overage_multiplier: 2;
  disclosure_revision: string;
  cap_increase_available: boolean;
}>;

const INTENT_KEY = "casimirbot:capped-membership-intent:v1";
const SESSION_KEY = "casimirbot:capped-membership-session:v1";
const validSession = (value: unknown): value is string =>
  typeof value === "string" && /^cs_test_[A-Za-z0-9_]{8,160}$/u.test(value);
const validOffer = (value: unknown): value is Offer => {
  if (!value || typeof value !== "object") return false;
  const offer = value as Partial<Offer>;
  return offer.schema === "casimirbot.capped_membership_offer.v1" &&
    offer.test_mode === true &&
    typeof offer.provider_calls_enabled === "boolean" &&
    offer.currency === "USD" && offer.base_minor === 500 &&
    offer.initial_cap_minor === 500 &&
    offer.maximum_first_period_cap_minor === 10_000 &&
    offer.included_provider_micros_usd === 1_000_000 &&
    offer.overage_multiplier === 2 &&
    typeof offer.cap_increase_available === "boolean" &&
    typeof offer.disclosure_revision === "string" &&
    offer.disclosure_revision.length > 0;
};
const validCheckoutUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "checkout.stripe.com" &&
      !url.username && !url.password;
  } catch { return false; }
};

/** Private qualification UI. The server route remains unmounted and off by
 * default; a redirect selector is never evidence of payment. */
export function CappedMembershipSandboxCheckout({ verifiedIdentity,
  onPaidPeriodRecorded }: Readonly<{
  verifiedIdentity: boolean;
  onPaidPeriodRecorded?: () => Promise<void>;
}>) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [hostedUrl, setHostedUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("capped_membership");
    const returnedSession = url.searchParams.get("session");
    if (result === "returned" && validSession(returnedSession)) {
      window.sessionStorage.setItem(SESSION_KEY, returnedSession);
      setSessionId(returnedSession);
      setMessage("Stripe returned. The purchasing account must check its payment before any paid period is recorded.");
    } else if (result === "canceled") {
      setMessage("Checkout was canceled. No capped membership was recorded. The saved attempt remains reserved until its Stripe status is checked.");
    } else {
      const saved = window.sessionStorage.getItem(SESSION_KEY);
      if (validSession(saved)) setSessionId(saved);
    }
    if (result || returnedSession) {
      url.searchParams.delete("capped_membership");
      url.searchParams.delete("session");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  useEffect(() => {
    if (!verifiedIdentity) { setOffer(null); return; }
    let canceled = false;
    void fetch("/api/capped-membership/checkout/offer", {
      credentials: "same-origin", cache: "no-store",
    }).then(async response => response.ok ? response.json() : null)
      .then(value => { if (!canceled) setOffer(validOffer(value) ? value : null); })
      .catch(() => { if (!canceled) setOffer(null); });
    return () => { canceled = true; };
  }, [verifiedIdentity]);

  useEffect(() => {
    if (!verifiedIdentity) { setHostedUrl(null); return; }
    let canceled = false;
    void fetch("/api/capped-membership/checkout/pending", {
      credentials: "same-origin", cache: "no-store",
    }).then(async response => response.ok ? response.json() as Promise<{
      schema?: unknown; state?: unknown;
      checkout_session_id?: unknown; hosted_url?: unknown;
    }> : null).then(pending => {
      if (canceled || pending?.schema !==
          "casimirbot.capped_checkout_pending.v1" ||
          pending.state !== "open" ||
          !validSession(pending.checkout_session_id) ||
          !validCheckoutUrl(pending.hosted_url)) return;
      const url = new URL(pending.hosted_url);
      if (!url.hash || url.pathname !==
        `/c/pay/${pending.checkout_session_id}`) return;
      window.sessionStorage.setItem(SESSION_KEY, pending.checkout_session_id);
      setSessionId(pending.checkout_session_id);
      setHostedUrl(pending.hosted_url);
    }).catch(() => undefined);
    return () => { canceled = true; };
  }, [verifiedIdentity]);

  const start = async () => {
    if (!offer || !reviewed || busy) return;
    setBusy(true); setMessage(null);
    try {
      const saved = window.sessionStorage.getItem(INTENT_KEY);
      const intentId = saved && /^capped_intent:[A-Za-z0-9_-]{8,100}$/u.test(saved)
        ? saved : `capped_intent:${crypto.randomUUID()}`;
      window.sessionStorage.setItem(INTENT_KEY, intentId);
      const response = await fetch("/api/capped-membership/checkout", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent_id: intentId,
          accepted_all_in_cap_minor: offer.initial_cap_minor,
          accepted_included_provider_micros_usd: offer.included_provider_micros_usd,
          accepted_overage_multiplier: offer.overage_multiplier,
          accepted_terms_revision: offer.disclosure_revision }),
      });
      const result = response.ok ? await response.json() as {
        checkout_session_id?: unknown; hosted_url?: unknown;
      } : null;
      if (!validSession(result?.checkout_session_id) ||
          !validCheckoutUrl(result?.hosted_url)) throw new Error("checkout_unavailable");
      window.sessionStorage.setItem(SESSION_KEY, result.checkout_session_id);
      setSessionId(result.checkout_session_id);
      setHostedUrl(result.hosted_url);
    } catch {
      setMessage("Checkout could not open. The same saved attempt will be checked before another processor request; no paid period was recorded.");
    } finally { setBusy(false); }
  };

  const reconcile = async () => {
    if (!sessionId || !verifiedIdentity || busy) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/capped-membership/checkout/reconcile", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkout_session_id: sessionId }),
      });
      const receipt = response.ok ? await response.json() as {
        state?: string;
      } : null;
      if (receipt?.state !== "paid_period_recorded") throw new Error("unverified");
      window.sessionStorage.removeItem(SESSION_KEY);
      window.sessionStorage.removeItem(INTENT_KEY);
      setSessionId(null); setHostedUrl(null);
      setMessage(offer?.provider_calls_enabled
        ? "Stripe test payment and account ownership were verified. The paid period is recorded; managed text still requires an approved installation and text consent."
        : "Stripe test payment and account ownership were verified. The paid period is recorded; managed provider calls remain disabled during qualification.");
      // Keep the balance panel in step with a newly recorded period. A status
      // refresh failure must not replace the successful payment receipt.
      void onPaidPeriodRecorded?.().catch(() => undefined);
    } catch {
      setMessage("Payment is not verified for this account yet. No paid period was added; check again after Stripe finishes.");
    } finally { setBusy(false); }
  };

  if (!offer && !sessionId && !message) return null;
  return <div className="mt-4 rounded-xl border border-cyan-200/25 bg-cyan-200/5 p-4 text-sm text-slate-200"
    aria-label="Capped membership sandbox checkout">
    {offer ? <>
      <h3 className="font-semibold text-cyan-100">Owner-only capped membership sandbox</h3>
      <p className="mt-2">$5 monthly base, including up to $1 of measured provider cost. The initial monthly all-in cap is $5 USD, including tax. After included usage, eligible managed provider use is charged at 2× measured provider cost, but no overage is authorized at this initial cap. {offer.cap_increase_available
        ? "After payment is verified, you can review and authorize a higher total cap up to $100 for this period in Account."
        : "A higher cap is unavailable in this test."}</p>
      <p className="mt-2">This sandbox membership renews monthly until canceled. Each paid month starts with a $5 total cap and a new $1 included provider-cost allowance; an increase you authorize for one month does not carry into the next. You can review cancellation from Account through Stripe, which shows its effective date. Usage already incurred may appear on a later invoice.</p>
      <p className="mt-2">Stripe test card only. Checkout starts no provider call or program permission. Managed GPT Live and agent funding are not enabled by this sandbox purchase.</p>
      <label className="mt-3 flex items-start gap-2"><input type="checkbox" checked={reviewed}
        onChange={event => setReviewed(event.target.checked)} />
        <span>I reviewed the $5 monthly base, $1 included provider cost, 2× overage rule, $5 total monthly cap, automatic renewal, and cancellation path for this Stripe sandbox test.</span></label>
      <button type="button" disabled={!reviewed || busy || !!hostedUrl} onClick={() => void start()}
        className="mt-3 rounded-full border border-cyan-200/40 px-4 py-2 text-cyan-100 disabled:opacity-50">
        Prepare $5 sandbox checkout
      </button>
      {hostedUrl ? <a href={hostedUrl} className="ml-3 underline underline-offset-4">
        Continue to Stripe test checkout</a> : null}
    </> : null}
    {sessionId ? <p className="mt-3">A Stripe test Checkout is pending for this browser. It does not prove payment.</p> : null}
    {sessionId && verifiedIdentity ? <button type="button" disabled={busy}
      onClick={() => void reconcile()}
      className="mt-3 rounded-full border border-cyan-200/40 px-4 py-2 text-cyan-100 disabled:opacity-50">
      Check Stripe test payment
    </button> : null}
    {sessionId && !verifiedIdentity ? <p className="mt-2">Sign in as the purchasing account to check payment.</p> : null}
    {message ? <p role="status" className="mt-3">{message}</p> : null}
  </div>;
}
