import React from "react";
import { KeyRound, LogIn } from "lucide-react";
import { Link } from "wouter";
import { buildWorkstationEntryUrl } from "@shared/workstation-link-meta";

export default function AccountResetPasswordPage() {
  const [token, setToken] = React.useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("token") ?? "";
  });
  const [password, setPassword] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const submit = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/account/session/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token_value: token, password }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.message ?? `reset ${response.status}`);
      setPassword("");
      setMessage("Password reset complete. Sign in with your new password.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password reset failed.");
    } finally {
      setLoading(false);
    }
  }, [password, token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4 text-slate-100">
      <section className="w-full max-w-md rounded-lg border border-white/10 bg-black/30 p-4 shadow-xl">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <KeyRound className="h-4 w-4 text-cyan-300" />
          Reset workstation profile password
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Enter a new password for your CasimirBot workstation profile.
        </p>
        {error ? <p className="mt-3 rounded border border-rose-400/30 bg-rose-500/10 p-2 text-xs text-rose-100">{error}</p> : null}
        {message ? <p className="mt-3 rounded border border-emerald-400/30 bg-emerald-500/10 p-2 text-xs text-emerald-100">{message}</p> : null}
        <div className="mt-4 space-y-3">
          <label className="block text-xs text-slate-300">
            Reset token
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              className="mt-1 w-full rounded border border-white/15 bg-slate-900 px-2 py-1.5 text-sm text-white outline-none focus:border-cyan-400"
            />
          </label>
          <label className="block text-xs text-slate-300">
            New password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              className="mt-1 w-full rounded border border-white/15 bg-slate-900 px-2 py-1.5 text-sm text-white outline-none focus:border-cyan-400"
            />
          </label>
          <button
            type="button"
            onClick={submit}
            disabled={!token.trim() || !password || loading}
            className="inline-flex items-center gap-2 rounded border border-cyan-400/40 bg-cyan-500/15 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <KeyRound className="h-3.5 w-3.5" />
            Reset password
          </button>
          <div>
            <Link
              href={buildWorkstationEntryUrl({
                search: "?panels=account-session&focus=account-session",
                entry: "workstation",
              })}
              className="inline-flex items-center gap-2 text-xs text-cyan-200 hover:text-cyan-100"
            >
              <LogIn className="h-3.5 w-3.5" />
              Back to sign in
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
