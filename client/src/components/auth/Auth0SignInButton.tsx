import React, { useState } from "react";
import { ExternalLink, ShieldCheck } from "lucide-react";

const DEFAULT_RETURN_TO =
  "/desktop?panels=account-session&focus=account-session";

export const auth0AccountStartHref = (returnTo = DEFAULT_RETURN_TO): string =>
  `/api/auth/auth0/start?return_to=${encodeURIComponent(returnTo)}`;

export function Auth0SignInButton({
  returnTo = DEFAULT_RETURN_TO,
}: {
  returnTo?: string;
}) {
  const [opening, setOpening] = useState(false);
  const [desktopError, setDesktopError] = useState<string | null>(null);
  const desktopSignIn = typeof window !== "undefined" &&
    typeof window.casimirDesktop?.openAuth0ProfileSignIn === "function"
      ? window.casimirDesktop.openAuth0ProfileSignIn
      : null;
  const outcome =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("auth0_account");
  const error = outcome && outcome !== "linked" ? outcome : null;

  return (
    <div className="space-y-2">
      {React.createElement(desktopSignIn ? "button" : "a", {
        ...(desktopSignIn ? {
          type: "button",
          disabled: opening,
          onClick: async () => {
            setOpening(true);
            setDesktopError(null);
            try { await desktopSignIn(); }
            catch (failure) {
              const callbackBusy = failure instanceof Error &&
                failure.message.includes("desktop_auth0_callback_port_unavailable");
              setDesktopError(callbackBusy
                ? "Browser sign-in return port 1522 is already in use. Close the other app using it, then try again."
                : "Could not open browser sign-in. Check the desktop connection and try again.");
            }
            finally { setOpening(false); }
          },
        } : { href: auth0AccountStartHref(returnTo) }),
        className: "inline-flex items-center gap-2 rounded border border-cyan-300/35 bg-cyan-400/10 px-3 py-2 text-xs font-medium text-cyan-50 transition hover:bg-cyan-400/20",
      }, <>
        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
        {opening ? "Opening Chrome…" : "Sign in with Auth0"}
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </>)}
      <p className="text-[11px] leading-4 text-slate-500">
        {desktopSignIn ? "Opens your default browser for Google sign-in, then returns to this EXE." :
          "Uses public-client PKCE and an HttpOnly CasimirBot session. OAuth tokens are exchanged and verified by the server and are not returned to this page or an AI client."}
      </p>
      {desktopError ? <p className="text-xs text-rose-300" role="alert">{desktopError}</p> : null}
      {outcome === "linked" ? (
        <p className="text-xs text-emerald-300" role="status">
          Auth0 profile session connected.
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-rose-300" role="alert">
          {error === "login_intent_expired"
            ? "This sign-in window expired. Click Sign in with Auth0 again to open a fresh browser page."
            : `Auth0 profile sign-in did not complete (${error.replaceAll("_", " ")}).`}
        </p>
      ) : null}
    </div>
  );
}

export default Auth0SignInButton;
