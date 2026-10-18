import { useCallback, useEffect, useState } from "react";
import type { HelixAccountSessionStatus } from "@shared/helix-account-session";
import { GoogleSignInButton } from "../src/components/auth/GoogleSignInButton";

type Link = {
  request_id: string; installation_label: string; key_fingerprint: string;
  expires_at: string; state: "pending" | "approved" | "claimed" | "expired";
  text_authorization_available?: boolean;
  managed_text_authorized?: boolean;
};
const requestPattern = /^link_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export function SiteConnectPage() {
  const requestId = new URLSearchParams(window.location.search).get("request") ?? "";
  const [link, setLink] = useState<Link | null>(null);
  const [account, setAccount] = useState<HelixAccountSessionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [allowManagedText, setAllowManagedText] = useState(false);
  const authResult = new URLSearchParams(window.location.search).get("auth0_account");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (!requestPattern.test(requestId)) throw new Error("invalid request");
      const [linkResponse, accountResponse] = await Promise.all([
        fetch(`/api/managed-ai/device-links/${encodeURIComponent(requestId)}`,
          { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/account/session", { credentials: "same-origin", cache: "no-store" }),
      ]);
      if (!linkResponse.ok || !accountResponse.ok) throw new Error("unavailable");
      setLink(await linkResponse.json() as Link);
      setAccount(await accountResponse.json() as HelixAccountSessionStatus);
    } catch {
      setLink(null);
      setMessage("This connection request is unavailable or expired. Start again in the installed app.");
    } finally { setLoading(false); }
  }, [requestId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const profile = account?.session?.profile;
  const verified = profile?.auth_mode === "web_auth" ||
    (profile?.auth_mode === "password_account" && Boolean(profile.email_verified_at));
  const canApprove = Boolean(link?.state === "pending" && verified && !busy);
  const returnPath = `/account/connect?request=${requestId}`;

  const approve = async () => {
    if (!canApprove) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/managed-ai/device-links/${encodeURIComponent(requestId)}/approve`, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ managed_text_authorized:
          link?.text_authorization_available === true && allowManagedText }),
      });
      if (!response.ok) throw new Error("approval failed");
      await refresh();
      setMessage("Approved. Return to the installed app; it will complete this connection automatically.");
    } catch {
      setMessage("This request could not be approved. Refresh it or start again in the installed app.");
    } finally { setBusy(false); }
  };

  return (
    <main className="min-h-screen bg-[#050b18] px-5 py-7 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <nav className="flex justify-between border-b border-white/10 pb-5 text-sm">
          <a href="/" className="font-semibold text-white">CasimirBot</a>
          <a href="/account" className="text-cyan-200 hover:text-white">Account</a>
        </nav>
        <section className="py-12 sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">Connect installed app</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Approve one device connection.</h1>
          <p className="mt-5 leading-7 text-slate-300">Check that this is the computer you are setting up. Approval links your CasimirBot account to this installation. It does not start a subscription, make a model call, pair an agent task, or grant program actions.</p>
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.055] p-6">
            {loading ? <p role="status">Checking this request…</p> : null}
            {authResult && authResult !== "linked" ? <p role="alert" className="mb-4 text-amber-200">Sign-in did not finish ({authResult.replaceAll("_", " ")}). Try again.</p> : null}
            {link ? (
              <div className="space-y-3">
                <p><span className="text-slate-400">Installation:</span> <strong>{link.installation_label}</strong></p>
                <p className="break-all font-mono text-xs text-slate-400">Device fingerprint: {link.key_fingerprint.slice(0, 16)}…{link.key_fingerprint.slice(-8)}</p>
                <p className="text-sm text-slate-300">Request expires: {new Date(link.expires_at).toLocaleString()}</p>
                {link.state === "expired" ? <p role="alert" className="text-amber-200">This request expired. Start a new connection in the app.</p> : null}
                {link.state === "approved" || link.state === "claimed" ? <p role="status" className="text-emerald-200">Approved. Return to the app to finish.</p> : null}
                {link.managed_text_authorized ? <p className="text-sm text-amber-100">This installation was also approved for managed text requests. Each request still requires an active AI plan and server allowance.</p> : null}
              </div>
            ) : !loading ? <p role="alert" className="text-amber-200">Connection request unavailable.</p> : null}
            {link?.state === "pending" && !verified ? (
              <div className="mt-6 border-t border-white/10 pt-6">
                <p className="mb-4 text-sm text-slate-300">Sign in to the CasimirBot account you want on this device.</p>
                <a className="inline-flex rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-200"
                  href={`/api/auth/auth0/start?return_to=${encodeURIComponent(returnPath)}`}>Continue with CasimirBot sign-in</a>
                {import.meta.env.VITE_GOOGLE_CLIENT_ID ? (
                  <div className="mt-5"><p className="mb-3 text-sm text-slate-400">Or use Google directly</p>
                    <GoogleSignInButton redirectTarget={null} onSignedIn={refresh} promptOnLoad={false} /></div>
                ) : <p className="mt-5 text-sm text-slate-400">Choose Google or email on the CasimirBot sign-in page.</p>}
              </div>
            ) : null}
            {link?.state === "pending" && verified ? (
              <div className="mt-6 border-t border-white/10 pt-6">
                <p className="text-sm text-slate-300">Signed in as <strong className="text-white">{profile?.display_name}</strong>{profile?.email ? ` (${profile.email})` : ""}.</p>
                {link.text_authorization_available ? <label className="mt-4 flex gap-3 rounded-xl border border-amber-200/25 bg-amber-200/5 p-4 text-sm text-slate-200">
                  <input type="checkbox" checked={allowManagedText}
                    onChange={event => setAllowManagedText(event.target.checked)}
                    className="mt-1" />
                  <span>Allow this installation to use my included AI allowance for bounded text answers when I select CasimirBot-managed AI. Calls will consume plan capacity. This does not grant room or program actions.</span>
                </label> : null}
                <button type="button" disabled={!canApprove} onClick={() => void approve()}
                  className="mt-5 rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-200 disabled:opacity-50">Approve this installation</button>
              </div>
            ) : null}
            {message ? <p role="status" className="mt-5 text-sm text-cyan-100">{message}</p> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
