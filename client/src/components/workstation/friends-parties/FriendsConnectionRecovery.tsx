import React from "react";
import { DESKTOP_AUTH0_ACCOUNT_LINK_START_PATH, parseDesktopAuth0AccountLinkStartReceipt,
  parseDesktopAuth0AccountLinkCompletion } from "@shared/desktop-auth0-account-link";

export function FriendsConnectionRecovery({ onConnected }: { onConnected: () => void }) {
  const [waiting, setWaiting] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const active = React.useRef(false);
  const pending = React.useRef<AbortController | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const native = Boolean(window.casimirDesktop?.openAuth0AccountLink);
  const stop = React.useCallback(() => {
    active.current = false;
    pending.current?.abort();
    if (timer.current !== null) clearTimeout(timer.current);
    setWaiting(false);
  }, []);
  React.useEffect(() => {
    const unsubscribe = window.casimirDesktop?.onAuth0AccountLinkCompletion?.((value) => {
      const completion = parseDesktopAuth0AccountLinkCompletion(value);
      if (!active.current || !completion || completion.authorization_purpose !== "account_link") return;
      stop();
      if (completion.ok) onConnected();
      else setMessage(completion.error === "friends_authorization_insufficient"
        ? "Your account is signed in, but Friends & Parties permission was not included. CasimirBot's Friends authorization configuration needs to be checked by its maintainer. You do not need to sign out or log in to the Auth0 dashboard."
        : completion.error === "account_link_identity_mismatch"
          ? "The browser returned a different account. Try again with the same account you use in CasimirBot. Your desktop sign-in has not changed."
        : "The Friends connection did not complete. Your existing sign-in has not changed. Try again.");
    });
    return () => {
      active.current = false;
      pending.current?.abort();
      if (timer.current !== null) clearTimeout(timer.current);
      unsubscribe?.();
    };
  }, [onConnected, stop]);
  const start = async () => {
    if (active.current || !native) return;
    active.current = true;
    setWaiting(true);
    setMessage(null);
    const request = new AbortController();
    pending.current = request;
    const expire = () => { stop(); setMessage("The Friends connection timed out. You can try again."); };
    timer.current = setTimeout(expire, 15_000);
    try {
      const result = await fetch(DESKTOP_AUTH0_ACCOUNT_LINK_START_PATH, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json" }, signal: request.signal,
      });
      const receipt = parseDesktopAuth0AccountLinkStartReceipt(await result.json());
      if (!active.current || pending.current !== request) return;
      if (!result.ok || !receipt) throw new Error("connection_start_failed");
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(expire, Math.max(1, Math.min(600_000, Date.parse(receipt.expires_at) - Date.now())));
      await window.casimirDesktop!.openAuth0AccountLink!(receipt.authorization_url);
    } catch {
      if (!active.current || pending.current !== request) return;
      stop();
      setMessage("Friends authorization could not start in this build. Retry or update the app; your sign-in is unchanged.");
    }
  };
  return <section aria-label="Friends connection" className="max-w-xl rounded-lg border border-cyan-300/20 p-4 text-sm">
    <p>Connect your signed-in profile to Friends &amp; Parties. This enables saved friends, requests and presence; rooms and program access keep their separate approvals.</p>
    {native ? <button disabled={waiting} onClick={() => void start()} className="mt-3 rounded bg-cyan-500/20 px-3 py-2">
      {waiting ? "Waiting for Friends authorization…" : "Connect Friends & Parties"}
    </button> : <p className="mt-2">Open the desktop app to connect Friends &amp; Parties.</p>}
    {waiting && <>
      <button className="ml-3" onClick={onConnected}>Check connection</button>
      <button className="ml-3" onClick={stop}>Stop waiting</button>
    </>}
    {message && <p role="status" className="mt-2">{message}</p>}
  </section>;
}
