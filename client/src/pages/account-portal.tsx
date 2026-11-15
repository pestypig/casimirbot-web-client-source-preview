import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Download, LogOut, ShieldCheck } from "lucide-react";
import type { HelixAccountSessionStatus } from "@shared/helix-account-session";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { AccountRoomPilot } from "@/components/account/AccountRoomPilot";
import { DiscordTaskConnections } from "@/components/account/DiscordTaskConnections";
import {GcnSourceConnection} from "@/components/GcnSourceConnection";
import { PersonalTotpEnrollment } from
  "@/components/account/PersonalTotpEnrollment";
import { CappedMembershipLedgerStatus,
  validCappedMembershipLedgerStatus,
  type CappedMembershipLedgerStatusResponse } from
  "@/components/account/CappedMembershipLedgerStatus";
import { CappedMembershipSandboxCheckout } from
  "@/components/account/CappedMembershipSandboxCheckout";
import { CappedMembershipCancellation } from
  "@/components/account/CappedMembershipCancellation";
import { CappedMembershipLiveProbe } from
  "@/components/account/CappedMembershipLiveProbe";
import { CappedMembershipAgentProbe } from
  "@/components/account/CappedMembershipAgentProbe";
import { CappedMembershipMeterSandboxDelivery } from
  "@/components/account/CappedMembershipMeterSandboxDelivery";

type LoadState = "loading" | "ready" | "error";
type ManagedAiStatus = {
  available: false;
  reason: "sign_in_required" | "fresh_sign_in_required" | "verified_identity_required" |
    "offer_not_admitted" | "account_service_unavailable";
};
type PrivateTestOffer = {
  test_mode: true;
  provider_calls_enabled: false;
  tiers: Array<"ai_5" | "ai_10">;
};
type DeviceGrant = {
  grantId: string; installationLabel: string; keyThumbprint: string;
  expiresAt: string; lastUsedAt: string | null;
  managedTextAuthorized?: boolean;
};
type ManagedUsage = {
  as_of: string;
  payer: "casimirbot_managed";
  own_key_usage_included: false;
  terms: Array<{
    termId: string; sourceKind: "subscription" | "developer";
    planTier: "ai_5" | "ai_10" | null;
    processorLivemode: boolean | null;
    state: "active" | "paused"; periodEndsAt: string;
    budgetMicros: number; committedMicros: number; remainingMicros: number;
    observedEstimateMicros: number; observedInputTokens: number;
    observedOutputTokens: number; observedRequests: number;
    settledMaxRequests?: number; pendingRequests: number; uncertainRequests: number;
  }>;
};
type TestSubscription = {
  termId: string; subscriptionSuffix: string; periodEndsAt: string;
};
const dollars = (micros: number): string => `$${(micros / 1_000_000).toFixed(4)}`;
const PENDING_CHECKOUT_KEY = "casimirbot:managed-ai-checkout-session:v1";
const CHECKOUT_REQUEST_KEY = "casimirbot:managed-ai-test-checkout-request:v1";
const validRequestId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
const savedRequestId = (tier: "ai_5" | "ai_10"): string | null => {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(CHECKOUT_REQUEST_KEY) ?? "null") as {
      tier?: string; request_id?: unknown;
    } | null;
    return saved?.tier === tier && validRequestId(saved.request_id)
      ? saved.request_id : null;
  } catch { return null; }
};
const validCheckoutId = (value: string | null): value is string =>
  typeof value === "string" && /^cs_test_[A-Za-z0-9_]{8,160}$/u.test(value);
const validHostedCheckoutUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "checkout.stripe.com" &&
      !url.username && !url.password;
  } catch { return false; }
};
const validHostedPortalUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "billing.stripe.com" &&
      !url.username && !url.password;
  } catch { return false; }
};

export default function AccountPortalPage() {
  const [status, setStatus] = useState<HelixAccountSessionStatus | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [managedAi, setManagedAi] = useState<ManagedAiStatus | null>(null);
  const [privateTestOffer, setPrivateTestOffer] = useState<PrivateTestOffer | null>(null);
  const [testManagementAvailable, setTestManagementAvailable] = useState(false);
  const [testSubscriptions, setTestSubscriptions] = useState<TestSubscription[]>([]);
  const [hostedCheckoutUrl, setHostedCheckoutUrl] = useState<string | null>(null);
  const [hostedPortal, setHostedPortal] = useState<{
    termId: string; url: string;
  } | null>(null);
  const [managedUsage, setManagedUsage] = useState<ManagedUsage | null>(null);
  const [cappedStatus, setCappedStatus] =
    useState<CappedMembershipLedgerStatusResponse | null>(null);
  const [cappedInactive, setCappedInactive] = useState(false);
  const [deviceGrants, setDeviceGrants] = useState<DeviceGrant[] | null>(null);
  const [pendingCheckoutId, setPendingCheckoutId] = useState<string | null>(null);
  const [checkoutVerifying, setCheckoutVerifying] = useState(false);
  const checkoutAutoCheckStarted = useRef(false);
  const authResult = typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.search).get("auth0_account");
  const emailVerificationToken = typeof window === "undefined"
    ? null
    : new URLSearchParams(window.location.search).get("token");

  const accountReadEpoch = useRef(0);
  const cappedReadGeneration = useRef(0);
  useEffect(() => () => {
    accountReadEpoch.current++;
    cappedReadGeneration.current++;
  }, []);

  const refreshCappedStatus = useCallback(async () => {
    const accountEpoch = accountReadEpoch.current;
    const generation = ++cappedReadGeneration.current;
    const current = () => accountEpoch === accountReadEpoch.current &&
      generation === cappedReadGeneration.current;
    try {
      const response = await fetch("/api/capped-membership/cap/status", {
        credentials: "same-origin", cache: "no-store",
      });
      const capped = response.ok ? await response.json() : null;
      if (!current()) return;
      setCappedInactive(capped?.schema ===
        "casimirbot.capped_membership_status.v1" &&
        capped?.state === "inactive");
      setCappedStatus(validCappedMembershipLedgerStatus(capped)
        ? capped : null);
    } catch {
      if (current()) { setCappedStatus(null); setCappedInactive(false); }
    }
  }, []);

  const refresh = useCallback(async () => {
    // An account reload invalidates any independent ledger observation begun
    // under the preceding session, including a cap update finishing sign-out.
    accountReadEpoch.current++;
    setLoadState("loading");
    setCappedStatus(null);
    setCappedInactive(false);
    try {
      const response = await fetch("/api/account/session", {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("The account service is unavailable.");
      const next = await response.json() as HelixAccountSessionStatus;
      setStatus(next);
      if (next.session) {
        try {
          const managedResponse = await fetch("/api/managed-ai/status", {
            credentials: "same-origin", cache: "no-store",
          });
          setManagedAi(managedResponse.ok ? await managedResponse.json() as ManagedAiStatus : null);
        } catch { setManagedAi(null); }
        try {
          const usageResponse = await fetch("/api/managed-ai/usage", {
            credentials: "same-origin", cache: "no-store",
          });
          setManagedUsage(usageResponse.ok ? await usageResponse.json() as ManagedUsage : null);
        } catch { setManagedUsage(null); }
        try {
          const grantsResponse = await fetch("/api/managed-ai/device-grants", {
            credentials: "same-origin", cache: "no-store",
          });
          setDeviceGrants(grantsResponse.ok
            ? (await grantsResponse.json() as { grants: DeviceGrant[] }).grants : null);
        } catch { setDeviceGrants(null); }
        try {
          const offerResponse = await fetch("/api/managed-ai/checkout/private-test-offer", {
            credentials: "same-origin", cache: "no-store",
          });
          setPrivateTestOffer(offerResponse.ok
            ? await offerResponse.json() as PrivateTestOffer : null);
        } catch { setPrivateTestOffer(null); }
        try {
          const managementResponse = await fetch("/api/managed-ai/checkout/management-status", {
            credentials: "same-origin", cache: "no-store",
          });
          const management = managementResponse.ok ? await managementResponse.json() as {
            available?: boolean; subscriptions?: TestSubscription[];
          } : null;
          setTestManagementAvailable(management?.available === true);
          setTestSubscriptions(management?.available === true &&
            Array.isArray(management.subscriptions) ? management.subscriptions : []);
        } catch { setTestManagementAvailable(false); setTestSubscriptions([]); }
        await refreshCappedStatus();
      } else {
        setManagedAi(null); setManagedUsage(null); setCappedStatus(null);
        setCappedInactive(false);
        setDeviceGrants(null);
        setPrivateTestOffer(null); setHostedCheckoutUrl(null); setHostedPortal(null);
        setTestManagementAvailable(false); setTestSubscriptions([]);
      }
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }, [refreshCappedStatus]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const returned = url.searchParams.get("managed_ai_checkout");
    const fromStripe = url.searchParams.get("managed_ai_checkout_session");
    if (returned === "canceled") {
      window.sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
      window.sessionStorage.removeItem(CHECKOUT_REQUEST_KEY);
      setPendingCheckoutId(null);
      setMessage("Checkout was canceled. No AI allowance was added.");
    } else if (returned === "returned" && validCheckoutId(fromStripe)) {
      window.sessionStorage.removeItem(CHECKOUT_REQUEST_KEY);
      // Session storage survives an account sign-in redirect in this tab. The
      // selector is never payment proof; the domain rechecks account and Stripe.
      window.sessionStorage.setItem(PENDING_CHECKOUT_KEY, fromStripe);
      setPendingCheckoutId(fromStripe);
    } else {
      const saved = window.sessionStorage.getItem(PENDING_CHECKOUT_KEY);
      if (validCheckoutId(saved)) setPendingCheckoutId(saved);
    }
    if (returned || fromStripe) {
      url.searchParams.delete("managed_ai_checkout");
      url.searchParams.delete("managed_ai_checkout_session");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  const verifyCheckout = useCallback(async (checkoutSessionId: string) => {
    setCheckoutVerifying(true);
    try {
      const response = await fetch("/api/managed-ai/checkout/reconcile", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkout_session_id: checkoutSessionId }),
      });
      if (response.ok) {
        const result = await response.json() as { entitlement_state?: string };
        if (result.entitlement_state === "active") {
          window.sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
          setPendingCheckoutId(null);
          await refresh();
          setMessage("Stripe test payment verified. The test allowance is recorded below. Managed text still requires an approved installation, text permission, and available service capacity.");
        } else {
          setMessage("This Checkout has no active AI allowance. Check your subscription status before retrying.");
        }
      } else if (response.status === 409) {
        setMessage("Payment is not verified yet. Check again shortly; no AI allowance has started.");
      } else {
        setMessage("Checkout verification is unavailable for this account. You can check again later.");
      }
    } catch {
      setMessage("Checkout verification could not be reached. You can check again later.");
    } finally { setCheckoutVerifying(false); }
  }, [refresh]);

  const startPrivateTestCheckout = async (tier: "ai_5" | "ai_10") => {
    if (!privateTestOffer?.tiers.includes(tier) || busy) return;
    setBusy(true);
    setMessage(null);
    setHostedCheckoutUrl(null);
    try {
      const requestId = savedRequestId(tier) ?? crypto.randomUUID();
      window.sessionStorage.setItem(CHECKOUT_REQUEST_KEY,
        JSON.stringify({ tier, request_id: requestId }));
      const response = await fetch("/api/managed-ai/checkout", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, request_id: requestId }),
      });
      if (response.status === 409) {
        window.sessionStorage.removeItem(CHECKOUT_REQUEST_KEY);
        setMessage("This test Checkout request can no longer be retried. Start it again to create a new request.");
        return;
      }
      const result = response.ok ? await response.json() as {
        checkout_session_id?: string; hosted_url?: string;
      } : null;
      const checkoutSessionId = result?.checkout_session_id ?? null;
      const hostedUrl = result?.hosted_url;
      if (!validCheckoutId(checkoutSessionId) ||
          !validHostedCheckoutUrl(hostedUrl)) throw new Error();
      window.sessionStorage.removeItem(CHECKOUT_REQUEST_KEY);
      window.sessionStorage.setItem(PENDING_CHECKOUT_KEY, checkoutSessionId);
      setHostedCheckoutUrl(hostedUrl);
      window.location.assign(hostedUrl);
    } catch {
      setMessage("The private test Checkout could not open. Retry will use the same request; no AI allowance was added.");
    } finally { setBusy(false); }
  };

  const openTestSubscriptionManagement = async (termId: string) => {
    if (busy || !testManagementAvailable) return;
    setBusy(true); setMessage(null); setHostedPortal(null);
    try {
      const response = await fetch("/api/managed-ai/checkout/manage", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term_id: termId }),
      });
      const result = response.ok ? await response.json() as {
        hosted_url?: string;
      } : null;
      if (!validHostedPortalUrl(result?.hosted_url)) throw new Error();
      setHostedPortal({ termId, url: result.hosted_url });
    } catch {
      setMessage("Subscription management is unavailable right now. Your subscription was not changed.");
    } finally { setBusy(false); }
  };

  useEffect(() => {
    const profile = status?.session?.profile;
    const verified = profile?.auth_mode === "web_auth" ||
      (profile?.auth_mode === "password_account" && Boolean(profile.email_verified_at));
    if (!pendingCheckoutId || !verified || loadState !== "ready" ||
        checkoutAutoCheckStarted.current) return;
    checkoutAutoCheckStarted.current = true;
    void verifyCheckout(pendingCheckoutId);
  }, [pendingCheckoutId, status?.session, loadState, verifyCheckout]);

  useEffect(() => {
    if (!emailVerificationToken?.startsWith("acct_verify_")) return;
    // The one-use token should not linger in the visible URL after opening.
    const url = new URL(window.location.href);
    url.searchParams.delete("token");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    void fetch("/api/account/session/email-verification/confirm", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token_value: emailVerificationToken }),
    }).then(async response => {
      setMessage(response.ok ? "Email verified. Your account status is updating."
        : "This verification link is invalid or expired. Request a new link in the app.");
      await refresh();
    }).catch(() => setMessage("Email verification could not be completed. Try again."));
  }, [emailVerificationToken, refresh]);

  // An active term changes at provider-turn boundaries. Poll only while the
  // customer has a managed term; own-key calls use a separate accounting path.
  useEffect(() => {
    if (!status?.session || !managedUsage?.terms.length) return;
    const timer = window.setInterval(() => {
      void fetch("/api/managed-ai/usage", {
        credentials: "same-origin", cache: "no-store",
      }).then(async response => {
        setManagedUsage(response.ok ? await response.json() as ManagedUsage : null);
      }).catch(() => setManagedUsage(null));
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [status?.session, managedUsage?.terms.length]);

  const signOut = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/account/session/sign-out", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("Sign-out could not be completed.");
      await refresh();
      setMessage("Signed out on this website.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sign-out could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  const revokeDevice = async (grantId: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/managed-ai/device-grants/${encodeURIComponent(grantId)}/revoke`, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: "{}",
      });
      if (!response.ok) throw new Error("Could not disconnect this installation.");
      await refresh();
      setMessage("Installation disconnected. Its CasimirBot device credential is revoked.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not disconnect this installation.");
    } finally { setBusy(false); }
  };

  const updateRoomsAccess = async (enabled: boolean) => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/account/session/experimental-rooms", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const receipt = await response.json() as {
        ok: boolean; message?: string; status?: HelixAccountSessionStatus;
      };
      if (!response.ok || !receipt.ok || !receipt.status) {
        throw new Error(receipt.message || "Could not change Shared Live Rooms access.");
      }
      setStatus(receipt.status);
      setMessage(enabled ? "Shared Live Rooms are on for this account session." :
        "Shared Live Rooms are off for this account session.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not change Shared Live Rooms access.");
    } finally { setBusy(false); }
  };

  const profile = status?.session?.profile;
  const roomAccess = status?.experimental_features?.shared_realtime_rooms;
  const verifiedIdentity = profile?.auth_mode === "web_auth" ||
    (profile?.auth_mode === "password_account" && Boolean(profile.email_verified_at));

  return (
    <main className="min-h-screen bg-[#050b18] px-5 py-6 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <a href="/" className="inline-flex items-center gap-3 font-semibold text-white">
            <img src="/icons/helix-arrow.svg" alt="" className="h-9 w-9" /> CasimirBot
          </a>
          <nav className="flex gap-4 text-sm text-slate-300" aria-label="Account navigation">
            <a href="/getting-started" className="hover:text-white">Get started</a>
            <a href="/download" className="hover:text-white">Download</a>
            <a href="/" className="hover:text-white">Home</a>
          </nav>
        </header>

        <section className="py-12 sm:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">CasimirBot account</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Your account, your installed harness.</h1>
          <p className="mt-5 max-w-2xl leading-7 text-slate-300">
            Sign in here for your CasimirBot identity. The workspace runs in the downloaded app. Start device linking from Account &amp; Sessions in the app and approve this installation in your browser. Website sign-in alone does not grant AI, room, or program access.
          </p>
        </section>

        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-3xl border border-white/10 bg-white/[0.055] p-6" aria-labelledby="account-state-heading">
            <h2 id="account-state-heading" className="text-xl font-semibold">Account status</h2>
            {authResult === "room_agent_linked" ? (
              <p role="status" className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-3 text-sm text-emerald-100">
                Room API access is linked to this account. Return to the installed app and authorize its room connection again.
              </p>
            ) : null}
            {authResult && authResult !== "linked" && authResult !== "room_agent_linked" ? (
              <p role="alert" className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
                {authResult === "session_creation_failed"
                  ? "CasimirBot could not create your website session. Your sign-in may have succeeded; wait for the account service to recover before trying again."
                  : `Sign-in did not complete (${authResult.replaceAll("_", " ")}). Try again or use Google sign-in.`}
              </p>
            ) : null}
            {message ? <p role="status" className="mt-4 text-sm text-slate-200">{message}</p> : null}
            {loadState === "loading" ? <p className="mt-5 text-sm text-slate-300">Checking your account…</p> : null}
            {loadState === "error" ? (
              <div className="mt-5">
                <p role="alert" className="text-sm text-amber-200">The account service could not be reached.</p>
                <button type="button" onClick={() => void refresh()} className="mt-3 rounded-full border border-white/25 px-4 py-2 text-sm hover:border-cyan-200">Try again</button>
              </div>
            ) : null}
            {loadState === "ready" && profile ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4">
                  <p className="inline-flex items-center gap-2 text-sm font-medium text-emerald-200"><ShieldCheck className="h-4 w-4" /> Signed in</p>
                  <p className="mt-2 text-lg font-semibold">{profile.display_name}</p>
                  {profile.email ? <p className="mt-1 break-all text-sm text-slate-300">{profile.email}</p> : null}
                  {status?.account_policy?.account_type ? (
                    <p className="mt-1 text-sm text-slate-300">
                      Account type: {status.account_policy.account_type === "developer" ? "Developer" : "User"}
                    </p>
                  ) : null}
                </div>
                {!verifiedIdentity ? <p className="text-sm text-amber-200">This session is local or unverified. Managed access will require a verified customer identity.</p> : null}
                <button type="button" onClick={() => void signOut()} disabled={busy} className="inline-flex items-center gap-2 rounded-full border border-white/25 px-4 py-2 text-sm hover:border-white/50 disabled:opacity-50">
                  <LogOut className="h-4 w-4" /> Sign out of website
                </button>
              </div>
            ) : null}
            {loadState === "ready" && !profile ? (
              <div className="mt-5 space-y-5">
                <p className="text-sm text-slate-300">Choose your usual sign-in method. No provider API key is needed to create a CasimirBot account.</p>
                <div className="flex flex-wrap gap-3">
                  <a href="/api/auth/auth0/start?return_to=%2Faccount&signup=1" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-cyan-300 px-5 py-2 font-semibold text-slate-950 hover:bg-cyan-200">
                    Create account <ArrowRight className="h-4 w-4" />
                  </a>
                  <a href="/api/auth/auth0/start?return_to=%2Faccount" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/25 px-5 py-2 font-semibold text-white hover:border-cyan-200">
                    Sign in
                  </a>
                </div>
                {import.meta.env.VITE_GOOGLE_CLIENT_ID ? (
                  <div className="border-t border-white/10 pt-4">
                    <p className="mb-3 text-sm text-slate-400">Or use Google directly</p>
                    <GoogleSignInButton redirectTarget={null} onSignedIn={refresh} promptOnLoad={false} />
                  </div>
                ) : <p className="text-sm text-slate-400">Choose Google or email on the CasimirBot sign-in page.</p>}
              </div>
            ) : null}
          </section>

          <aside className="rounded-3xl border border-white/10 bg-white/[0.035] p-6" aria-labelledby="next-heading">
            <h2 id="next-heading" className="text-xl font-semibold">Next in the harness</h2>
            <ol className="mt-5 space-y-5 text-sm leading-6 text-slate-300">
              <li><span className="font-semibold text-white">1. Download the signed app.</span> The release page shows an installer only after verification.</li>
              <li><span className="font-semibold text-white">2. Sign in in the app.</span> Use the same CasimirBot account, then connect this installation to your website account.</li>
              <li><span className="font-semibold text-white">3. Grant only the access you want.</span> Linking an account does not approve an agent task, room, or program action.</li>
            </ol>
            <a href="/download" className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-full border border-cyan-200/40 px-5 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-300/10"><Download className="h-4 w-4" /> Check download status</a>
          </aside>
        </div>

        <DiscordTaskConnections profileRef={loadState === "ready" && profile?.auth_mode !== "guest" ? profile?.profile_id ?? null : null}
          accountSessionRef={loadState === "ready" ? status?.session?.session_id ?? null : null} />

        {loadState === "ready" && profile && profile.auth_mode !== "guest" ? (
          <section id="star-watcher-gcn" className="mt-6" aria-label="Star Watcher source access">
            <GcnSourceConnection key={status?.session?.session_id} />
          </section>
        ) : null}

        {profile?.auth_mode === "web_auth" &&
         profile.provider === "external_oauth" &&
         status?.account_policy.account_type === "user" &&
         profile.email_verified_at ? (
          <PersonalTotpEnrollment profileId={profile.profile_id} />
        ) : null}

        {profile && roomAccess?.available ? (
          <section className="mt-6 rounded-3xl border border-cyan-200/20 bg-cyan-200/[0.04] p-6" aria-labelledby="room-pilot-heading">
            <h2 id="room-pilot-heading" className="text-lg font-semibold">Shared Live Rooms</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              Room access is available to this account for private testing. A room still requires an exact owner, membership and separate sharing consent. Turning it on does not activate a microphone, model call, Codex task, or program action.
            </p>
            <p className="mt-3 text-sm text-cyan-100">{roomAccess.enabled ? "On for this session" : "Off for this session"}</p>
            {status?.account_policy.account_type !== "developer" ? (
              <button type="button" disabled={busy} onClick={() => void updateRoomsAccess(!roomAccess.enabled)}
                className="mt-4 rounded-full border border-cyan-200/40 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-300/10 disabled:opacity-50">
                {roomAccess.enabled ? "Turn off Shared Live Rooms" : "Enable Shared Live Rooms"}
              </button>
            ) : <p className="mt-3 text-xs text-slate-400">Included with developer access.</p>}
            {roomAccess.enabled && profile.provider === "external_oauth" ? (
              <form action="/api/auth/auth0/room-agent/start" method="POST" className="mt-4 rounded-xl border border-cyan-200/20 bg-slate-950/30 p-4">
                <p className="text-sm text-slate-300">Authorize this account to use the room API from the installed harness. You will confirm your identity with CasimirBot sign-in. This does not activate audio, AI, or program actions.</p>
                <button type="submit" className="mt-3 rounded-full border border-cyan-200/40 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-300/10">
                  Authorize room API for this account
                </button>
              </form>
            ) : null}
            {roomAccess.enabled ? <AccountRoomPilot /> : null}
          </section>
        ) : null}

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.035] p-6">
          <h2 className="text-lg font-semibold">Managed access</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            We are preparing one $5 monthly membership with up to $1 of measured provider cost included. Its monthly spending cap would start at $5 total and could be raised, with your explicit payment authorization, as high as $100 in the first month. After included usage, eligible managed calls would use the remaining cap at twice measured provider cost. CasimirBot would stop new managed work at the cap and keep its provider keys off your device. This offer and managed GPT Live and agent API funding are not available publicly yet. Membership would never grant device, room, Discord, or program-action permission; your free personal harness and own-key connections remain available.
          </p>
          {cappedStatus ? <CappedMembershipLedgerStatus status={cappedStatus}
            onUpdated={refreshCappedStatus} /> : null}
          {profile && (cappedStatus || cappedInactive) ?
            <a className="mt-3 inline-block text-sm underline underline-offset-4"
              href="/api/capped-membership/cap/purchase-notice">
              Download latest paid invoice purchase notice
            </a> : null}
          {profile && cappedInactive ? <p role="status"
            className="mt-4 text-sm text-slate-300">
            No active capped membership for this account. CasimirBot-managed
            provider calls require a new verified paid period; your own-key
            connections remain separate.
          </p> : null}
          {cappedStatus ? <CappedMembershipCancellation
            periodId={cappedStatus.period_id} /> : null}
          {cappedStatus ? <CappedMembershipLiveProbe
            onSettled={refreshCappedStatus} /> : null}
          {cappedStatus ? <CappedMembershipAgentProbe
            onSettled={refreshCappedStatus} /> : null}
          {cappedStatus?.meter_delivery_state === "pending" ?
            <CappedMembershipMeterSandboxDelivery
              onDelivered={refreshCappedStatus} /> : null}
          {cappedInactive ? <CappedMembershipSandboxCheckout
            verifiedIdentity={Boolean(verifiedIdentity)}
            onPaidPeriodRecorded={refreshCappedStatus} /> : null}
          {!cappedStatus && privateTestOffer?.test_mode &&
            !privateTestOffer.provider_calls_enabled &&
            verifiedIdentity ? <div className="mt-4 rounded-xl border border-amber-200/30 bg-amber-200/5 p-4 text-sm text-slate-200">
              <p className="font-semibold text-amber-100">Owner-only Stripe test checkout</p>
              <p className="mt-1">These older $5/$10 sandbox fixtures are separate from the planned capped membership. They make no real charge. A verified test payment can fund only the private managed-text test, subject to installation approval, text permission, and available capacity. Checkout alone starts no model call or hosted-room access.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {privateTestOffer.tiers.map(tier => <button key={tier} type="button"
                  disabled={busy} onClick={() => void startPrivateTestCheckout(tier)}
                  className="rounded-full border border-amber-200/40 px-4 py-2 text-amber-100 hover:bg-amber-200/10 disabled:opacity-50">
                  Start {tier === "ai_5" ? "$5" : "$10"} test checkout
                </button>)}
              </div>
              {hostedCheckoutUrl ? <a href={hostedCheckoutUrl}
                className="mt-3 inline-block underline underline-offset-4">Continue to Stripe test checkout</a> : null}
            </div> : null}
          {pendingCheckoutId ? <div className="mt-4 rounded-xl border border-cyan-200/25 bg-cyan-200/5 p-4 text-sm text-slate-200">
            <p>Test checkout returned. A test allowance is recorded only after this account and Stripe confirm it.</p>
            {!verifiedIdentity ? <p className="mt-2 text-amber-200">Sign in with the purchasing account to check it.</p> : null}
            {verifiedIdentity ? <button type="button" disabled={checkoutVerifying}
              onClick={() => void verifyCheckout(pendingCheckoutId)}
              className="mt-3 rounded-full border border-cyan-200/40 px-4 py-2 text-cyan-100 hover:bg-cyan-300/10 disabled:opacity-50">
              {checkoutVerifying ? "Checking payment…" : "Check payment again"}
            </button> : null}
          </div> : null}
          {profile && managedAi?.reason === "fresh_sign_in_required" ? <p className="mt-3 text-sm text-amber-200">This account session needs a fresh sign-in before it can be considered for managed access.</p> : null}
          {profile && managedAi?.reason === "verified_identity_required" ? <p className="mt-3 text-sm text-amber-200">A verified account identity will be required for managed access.</p> : null}
          {profile && managedAi?.reason === "offer_not_admitted" && !managedUsage?.terms.length && !cappedStatus ? <p className="mt-3 text-sm text-cyan-200">{privateTestOffer
            ? "This account has no active managed allowance. Test checkout alone does not start a model call."
            : "Your account is recognized. Managed AI allowance has not been launched; signing in does not start provider charges."}</p> : null}
          {profile && managedUsage?.terms.length ? (
            <div className="mt-5 space-y-3" aria-label="Included managed AI usage">
              <p className="text-sm text-slate-300">Included usage updates after provider turns. Own-key calls are separate and do not debit this allowance.</p>
              {managedUsage.terms.map(term => <div key={term.termId} className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm">
                <p className="font-semibold text-white">{term.sourceKind === "developer"
                  ? "Private developer test allowance" : term.processorLivemode === false ? "Stripe test · " : ""}{term.sourceKind === "developer" ? "" : term.planTier === "ai_5"
                  ? "$5 AI plan" : term.planTier === "ai_10"
                    ? "$10 AI plan" : "AI subscription allowance"} · {term.state}</p>
                <p className="mt-1 text-slate-300">Reserved {dollars(term.committedMicros)} of {dollars(term.budgetMicros)} · unreserved {dollars(term.remainingMicros)} until {new Date(term.periodEndsAt).toLocaleDateString()}</p>
                <p className="mt-2 text-slate-300">Provider-reported tokens: {term.observedInputTokens.toLocaleString()} input, {term.observedOutputTokens.toLocaleString()} output across {term.observedRequests} completed requests.</p>
                <p className="mt-1 text-slate-400">Observed price estimate: {dollars(term.observedEstimateMicros)}. {term.pendingRequests} pending; {term.uncertainRequests} awaiting reconciliation; {term.settledMaxRequests ?? 0} conservatively settled at full reservation. Unconfirmed reservations remain committed.</p>
              </div>)}
              <p className="text-xs text-slate-400">Checked {new Date(managedUsage.as_of).toLocaleTimeString()}; refreshed about every 15 seconds while this page is open. Estimates are not the provider invoice.</p>
            </div>
          ) : null}
          {profile && testManagementAvailable && testSubscriptions.length > 0 ? (
            <div className="mt-5 space-y-3" aria-label="Test subscription management">
              <h3 className="text-sm font-semibold text-white">Test subscriptions</h3>
              <p className="text-xs text-slate-400">Cancellation takes effect on the date shown in Stripe. A paid allowance may continue until then.</p>
              {testSubscriptions.map(subscription => (
                <div key={subscription.termId} className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
                  <span>Stripe test subscription ending {subscription.subscriptionSuffix} · last paid period ends {new Date(subscription.periodEndsAt).toLocaleDateString()}</span>
                  <button type="button" disabled={busy}
                    onClick={() => void openTestSubscriptionManagement(subscription.termId)}
                    className="rounded border border-white/20 px-3 py-2 text-xs text-slate-200 disabled:opacity-50">
                    Manage test subscription
                  </button>
                  {hostedPortal?.termId === subscription.termId ? (
                    <a href={hostedPortal.url} className="text-xs underline underline-offset-4">
                      Continue to Stripe cancellation
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </section>
        {profile && deviceGrants ? (
          <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.035] p-6" aria-labelledby="device-grants-heading">
            <h2 id="device-grants-heading" className="text-lg font-semibold">Connected installations</h2>
            <p className="mt-2 text-sm text-slate-300">These links identify installed apps. Managed text permission appears separately when you approve it; every call still requires an active managed allowance. No link grants room or program control.</p>
            {deviceGrants.length === 0 ? <p className="mt-4 text-sm text-slate-400">No installations connected.</p> : (
              <ul className="mt-5 space-y-3">
                {deviceGrants.map((grant) => <li key={grant.grantId} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                  <div><p className="font-medium">{grant.installationLabel}</p>
                    <p className="mt-1 font-mono text-xs text-slate-400">{grant.keyThumbprint.slice(0, 16)}…{grant.keyThumbprint.slice(-8)}</p>
                    <p className="mt-1 text-xs text-slate-400">Expires {new Date(grant.expiresAt).toLocaleString()}</p></div>
                  {grant.managedTextAuthorized ? <p className="text-xs text-amber-100">Managed text permission approved. Calls still require an active allowance and available service.</p> : null}
                  <button type="button" disabled={busy} onClick={() => void revokeDevice(grant.grantId)} className="rounded-full border border-rose-300/40 px-4 py-2 text-sm text-rose-100 hover:bg-rose-300/10 disabled:opacity-50">Disconnect</button>
                </li>)}
              </ul>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
