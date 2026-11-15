import { useEffect, useState } from "react";
import { Copy, KeyRound, ShieldCheck } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

type FactorStatus = "not_enrolled" | "pending" | "active";
type Provisioning = Readonly<{ intentId: string;
  uri: string; expiresAt: string }>;
type Recovery = Readonly<{ intentId: string; codes: readonly string[] }>;
const intentPattern = /^totp_enroll_[0-9a-f-]{36}$/u;
const recoveryIntentPattern = /^totp_recover_[0-9a-f-]{36}$/u;
const recoveryCodePattern = /^CBR1-[A-Za-z0-9_-]{27}$/u;

const enrollmentIntent = (): string | null => {
  const value = new URLSearchParams(window.location.search)
    .get("totp_enrollment");
  return value && intentPattern.test(value) ? value : null;
};

const clearEnrollmentIntent = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete("totp_enrollment");
  window.history.replaceState(null, "",
    `${url.pathname}${url.search}${url.hash}`);
};

const clearRecoveryIntent = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete("totp_recovery");
  window.history.replaceState(null, "",
    `${url.pathname}${url.search}${url.hash}`);
};

export function PersonalTotpEnrollment({ profileId }: { profileId: string }) {
  const [status, setStatus] = useState<FactorStatus | null>(null);
  const [provisioning, setProvisioning] = useState<Provisioning | null>(null);
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [recoveryEnabled, setRecoveryEnabled] = useState(false);
  const [recoverIntent, setRecoverIntent] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveredNotice, setRecoveredNotice] = useState(false);
  const [code, setCode] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/account/personal-totp/enrollment/status", {
      credentials: "same-origin", cache: "no-store",
      headers: { Accept: "application/json" },
    }).then(async response => {
      const body = response.ok ? await response.json() as
        { ok?: boolean; status?: FactorStatus } : null;
      if (!cancelled) setStatus(body?.ok === true &&
        (body.status === "not_enrolled" || body.status === "pending" ||
         body.status === "active") ? body.status : null);
    }).catch(() => { if (!cancelled) setStatus(null); });
    return () => { cancelled = true; };
  }, [profileId]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/account/personal-totp/recovery/enabled", {
      credentials: "same-origin", cache: "no-store",
      headers: { Accept: "application/json" },
    }).then(response => {
      if (!cancelled) setRecoveryEnabled(response.ok);
    }).catch(() => { if (!cancelled) setRecoveryEnabled(false); });
    return () => { cancelled = true; };
  }, [profileId]);

  useEffect(() => {
    const intentId = enrollmentIntent();
    const returned = new URLSearchParams(window.location.search)
      .get("totp_enrollment");
    if (returned === "failed") {
      setError("Authenticator setup did not complete. Start it again.");
      clearEnrollmentIntent();
      return;
    }
    if (!intentId) return;
    let cancelled = false;
    void fetch(`/api/account/personal-totp/enrollment/provisioning?intent_id=${
      encodeURIComponent(intentId)}`, {
      credentials: "same-origin", cache: "no-store",
      headers: { Accept: "application/json" },
    }).then(async response => {
      const body = response.ok ? await response.json() as
        { ok?: boolean; provisioning_uri?: string; expires_at?: string } : null;
      if (cancelled) return;
      if (body?.ok === true &&
          body.provisioning_uri?.startsWith("otpauth://totp/") &&
          typeof body.expires_at === "string") {
        setProvisioning({ intentId, uri: body.provisioning_uri,
          expiresAt: body.expires_at });
      } else {
        setError("Authenticator setup expired. Start it again.");
        clearEnrollmentIntent();
      }
    }).catch(() => {
      if (!cancelled) setError("Authenticator setup is unavailable right now.");
    });
    return () => { cancelled = true; };
  }, [profileId]);

  useEffect(() => {
    const returned = new URLSearchParams(window.location.search)
      .get("totp_recovery");
    if (returned === "failed") {
      setError("Authenticator recovery did not complete. Start it again.");
      clearRecoveryIntent();
      return;
    }
    if (!returned || !recoveryIntentPattern.test(returned)) return;
    let cancelled = false;
    void fetch(`/api/account/personal-totp/recovery/ready?intent_id=${
      encodeURIComponent(returned)}`, {
      credentials: "same-origin", cache: "no-store",
      headers: { Accept: "application/json" },
    }).then(async response => {
      const body = response.ok ? await response.json() as
        { ok?: boolean; expires_at?: string } : null;
      if (cancelled) return;
      if (body?.ok === true && typeof body.expires_at === "string") {
        setRecoverIntent(returned);
      } else {
        setError("Authenticator recovery expired. Start it again.");
        clearRecoveryIntent();
      }
    }).catch(() => {
      if (!cancelled) setError("Authenticator recovery is unavailable right now.");
    });
    return () => { cancelled = true; };
  }, [profileId]);

  if (status === null && !provisioning && !recovery &&
      !recoverIntent && !error) return null;

  const start = async () => {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/account/personal-totp/enrollment/start", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const body = response.ok ? await response.json() as
        { ok?: boolean; authorization_url?: string } : null;
      if (body?.ok !== true || !body.authorization_url) throw new Error();
      const url = new URL(body.authorization_url);
      if (url.protocol !== "https:" || url.pathname !== "/authorize" ||
          url.username || url.password) throw new Error();
      window.location.assign(url.toString());
    } catch {
      setError("Authenticator setup could not start. Try again shortly.");
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!provisioning || !/^\d{6}$/u.test(code)) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/account/personal-totp/enrollment/confirm", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent_id: provisioning.intentId, code }),
      });
      const body = response.ok ? await response.json() as
        { ok?: boolean; recovery_codes?: string[] } : null;
      if (body?.ok !== true || !Array.isArray(body.recovery_codes) ||
          body.recovery_codes.length !== 10 ||
          !body.recovery_codes.every(item => typeof item === "string")) {
        throw new Error();
      }
      setRecovery({ intentId: provisioning.intentId, codes: body.recovery_codes });
      setProvisioning(null); setCode("");
    } catch {
      setError("That code was not accepted. Check the authenticator and try again.");
    } finally { setBusy(false); }
  };

  const startRecovery = async () => {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/account/personal-totp/recovery/start", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const body = response.ok ? await response.json() as
        { ok?: boolean; authorization_url?: string } : null;
      if (body?.ok !== true || !body.authorization_url) throw new Error();
      const url = new URL(body.authorization_url);
      if (url.protocol !== "https:" || url.pathname !== "/authorize" ||
          url.username || url.password) throw new Error();
      window.location.assign(url.toString());
    } catch {
      setError("Authenticator recovery could not start. Try again shortly.");
      setBusy(false);
    }
  };

  const redeemRecovery = async () => {
    if (!recoverIntent || !recoveryCodePattern.test(recoveryCode)) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/account/personal-totp/recovery/redeem", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent_id: recoverIntent,
          recovery_code: recoveryCode }),
      });
      if (!response.ok) throw new Error();
      setRecoveryCode(""); setRecoverIntent(null);
      setRecoveredNotice(true); setStatus("pending");
      clearRecoveryIntent();
    } catch {
      setError("That recovery code was not accepted. Check it and try again before this request expires.");
    } finally { setBusy(false); }
  };

  const acknowledge = async () => {
    if (!recovery || !saved) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/account/personal-totp/enrollment/acknowledge", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent_id: recovery.intentId, saved: true }),
      });
      if (!response.ok) throw new Error();
      setRecovery(null); setSaved(false); setStatus("active");
      clearEnrollmentIntent();
    } catch {
      setError("The recovery-code acknowledgment did not complete. Try again before leaving this page.");
    } finally { setBusy(false); }
  };

  let secret = "";
  if (provisioning) {
    try { secret = new URL(provisioning.uri).searchParams.get("secret") ?? ""; }
    catch { secret = ""; }
  }

  return (
    <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.035] p-6" aria-labelledby="authenticator-heading">
      <h2 id="authenticator-heading" className="flex items-center gap-2 text-lg font-semibold">
        <KeyRound className="h-5 w-5 text-cyan-200" /> Account authenticator
      </h2>
      {error ? <p role="alert" className="mt-3 text-sm text-amber-200">{error}</p> : null}
      {status === "active" && !recovery && !recoverIntent ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-emerald-200">
          <ShieldCheck className="h-4 w-4" /> Active
        </p>
      ) : null}
      {recoveredNotice ? (
        <p className="mt-3 text-sm text-cyan-100">
          Recovery approved. Set up a new authenticator before protected actions resume.
        </p>
      ) : null}
      {recoverIntent ? (
        <div className="mt-4 max-w-xl space-y-3">
          <label className="block text-sm text-slate-300" htmlFor="personal-totp-recovery-code">
            Saved recovery code
          </label>
          <input id="personal-totp-recovery-code" type="password"
            value={recoveryCode}
            onChange={event => setRecoveryCode(event.target.value.trim().slice(0, 32))}
            autoComplete="off" spellCheck={false} maxLength={32}
            className="w-full max-w-sm rounded border border-white/25 bg-slate-950 px-3 py-2 font-mono text-white" />
          <button type="button" onClick={() => void redeemRecovery()}
            disabled={busy || !recoveryCodePattern.test(recoveryCode)}
            className="block rounded bg-cyan-300 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">
            Use recovery code
          </button>
        </div>
      ) : null}
      {status === "active" && recoveryEnabled && !recoverIntent &&
        !provisioning && !recovery ? (
        <button type="button" onClick={() => void startRecovery()}
          disabled={busy}
          className="mt-4 rounded border border-white/25 px-4 py-2 text-sm font-medium text-slate-200 hover:border-cyan-200 disabled:opacity-50">
          Recover authenticator
        </button>
      ) : null}
      {provisioning ? (
        <div className="mt-4 max-w-xl space-y-4">
          <div>
            <p className="mb-2 text-sm text-slate-300">Scan with your authenticator app</p>
            <div className="inline-flex bg-white p-3">
              <QRCodeSVG value={provisioning.uri} size={208} level="M"
                marginSize={4} role="img" aria-label="Scan with authenticator app"
                data-testid="personal-totp-qr" />
            </div>
          </div>
          <a href={provisioning.uri} className="inline-flex min-h-10 items-center text-sm font-medium text-cyan-200 underline underline-offset-4">
            Open authenticator app on this device
          </a>
          {secret ? (
            <div>
              <p className="text-sm text-slate-300">Setup key</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <code className="break-all rounded bg-slate-950 px-3 py-2 text-sm text-white">{secret}</code>
                <button type="button" title="Copy setup key" aria-label="Copy setup key"
                  onClick={() => void navigator.clipboard.writeText(secret)}
                  className="rounded border border-white/25 p-2 hover:border-cyan-200">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}
          <label className="block text-sm text-slate-300" htmlFor="personal-totp-code">Authenticator code</label>
          <input id="personal-totp-code" value={code}
            onChange={event => setCode(event.target.value.replace(/\D/gu, "").slice(0, 6))}
            autoComplete="one-time-code" inputMode="numeric" maxLength={6}
            className="w-40 rounded border border-white/25 bg-slate-950 px-3 py-2 text-white" />
          <button type="button" onClick={() => void confirm()}
            disabled={busy || code.length !== 6}
            className="block rounded bg-cyan-300 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">
            Confirm code
          </button>
        </div>
      ) : null}
      {recovery ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-slate-300">Recovery codes</p>
          <ul className="grid max-w-xl gap-2 sm:grid-cols-2">
            {recovery.codes.map(item => <li key={item} className="rounded bg-slate-950 px-3 py-2 font-mono text-sm">{item}</li>)}
          </ul>
          <button type="button" title="Copy recovery codes" onClick={() =>
            void navigator.clipboard.writeText(recovery.codes.join("\n"))}
            className="inline-flex items-center gap-2 rounded border border-white/25 px-3 py-2 text-sm hover:border-cyan-200">
            <Copy className="h-4 w-4" /> Copy codes
          </button>
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} />
            I saved these recovery codes
          </label>
          <button type="button" onClick={() => void acknowledge()}
            disabled={busy || !saved}
            className="rounded bg-cyan-300 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50">
            Finish setup
          </button>
        </div>
      ) : null}
      {(status === "not_enrolled" || status === "pending") &&
        !provisioning && !recovery && !recoverIntent ? (
        <button type="button" onClick={() => void start()} disabled={busy}
          className="mt-4 rounded border border-cyan-200/40 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-300/10 disabled:opacity-50">
          {status === "pending" ? "Restart setup" : "Set up authenticator"}
        </button>
      ) : null}
    </section>
  );
}
