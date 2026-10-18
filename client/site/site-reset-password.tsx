import { useState } from "react";

export function SiteResetPasswordPage() {
  const [token, setToken] = useState(() => new URLSearchParams(window.location.search).get("token") ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/account/session/password-reset/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ token_value: token, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.message ?? "Password reset failed.");
      setPassword("");
      setMessage("Password updated. Return to account sign-in.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Password reset failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050b18] p-5 text-slate-100">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.055] p-7">
        <h1 className="text-2xl font-semibold">Reset your CasimirBot password</h1>
        <p className="mt-3 text-sm text-slate-300">Use the reset token from your account recovery link.</p>
        {message ? <p role="status" className="mt-4 text-sm text-cyan-200">{message}</p> : null}
        <label className="mt-6 block text-sm">Reset token<input value={token} onChange={(event) => setToken(event.target.value)} className="mt-2 w-full rounded-xl border border-white/20 bg-slate-950 p-3 text-white" /></label>
        <label className="mt-4 block text-sm">New password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-white/20 bg-slate-950 p-3 text-white" /></label>
        <button type="button" onClick={() => void submit()} disabled={busy || !token || !password} className="mt-6 rounded-full bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50">Update password</button>
        <a href="/account" className="mt-5 block text-sm text-cyan-200 hover:text-white">Back to account</a>
      </section>
    </main>
  );
}
