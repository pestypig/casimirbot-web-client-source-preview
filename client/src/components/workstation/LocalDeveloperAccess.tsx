import React from "react";
import { z } from "zod";

const viewSchema = z.object({ phase: z.enum(["active", "inactive", "unavailable"]), detail: z.string(),
  issuerInitialized: z.boolean().optional(), ownsIssuer: z.boolean().optional(),
  fingerprint: z.string().nullable().optional(), expiresAt: z.number().nullable().optional(),
  nativeLease: z.object({ lastAcknowledgedAt: z.number().nullable(),
    lastRefreshIssue: z.object({ at: z.number(), reason: z.enum(["account_unavailable", "vault_unavailable", "lease_publish_failed"]) }).nullable() }).optional(),
  issued: z.array(z.object({ grantId: z.string().uuid(), profileId: z.string(), expiresAt: z.number(), revoked: z.boolean() })).optional() });

export function LocalDeveloperAccess({ signedIn, onChanged }: { signedIn: boolean; onChanged: () => void }) {
  const bridge = window.casimirDesktop?.localDeveloperAccess;
  const [view, setView] = React.useState<z.infer<typeof viewSchema> | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [busyAction, setBusyAction] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [grantId, setGrantId] = React.useState("");
  const inFlight = React.useRef(false);
  const epoch = React.useRef(0);
  const changedRef = React.useRef(onChanged);
  changedRef.current = onChanged;
  const run = React.useCallback(async (action: string, argument?: string) => {
    if (!bridge || !signedIn || inFlight.current) return;
    const current = epoch.current; inFlight.current = true; setBusy(true); setBusyAction(action); setError(null);
    try {
      const next = viewSchema.parse(await bridge(action, argument));
      if (epoch.current !== current) return;
      setView(next);
      if (action !== "inspect") changedRef.current();
    } catch { if (epoch.current === current) setError("Could not complete local developer setup. No access is inferred."); }
    finally { inFlight.current = false; if (epoch.current === current) { setBusy(false); setBusyAction(null); } }
  }, [bridge, signedIn]);
  React.useEffect(() => {
    epoch.current++; setView(null); setGrantId(""); setBusy(false); setBusyAction(null);
    if (bridge && signedIn) void run("inspect");
    return () => { epoch.current++; };
  }, [bridge, signedIn, run]);
  if (!bridge) return null;
  const button = (label: string, action: string, disabled = false, argument?: string) =>
    <button type="button" className="rounded border border-cyan-300/30 px-3 py-2 text-xs text-cyan-100 disabled:opacity-40"
      disabled={busy || !signedIn || disabled} onClick={() => void run(action, argument)}>{label}</button>;
  return <section className="mb-3 rounded-lg border border-cyan-300/20 bg-black/20 p-4" aria-label="Local developer USB access">
    <h2 className="text-sm font-semibold">Local developer USB access</h2>
    <p className="mt-2 text-xs text-slate-300">Private development builds only. Grants retain your profile and expire within 24 hours. They do not verify email, fund AI, pair a task or grant game actions. USB documents contain no private login keys.</p>
    <p role="status" className="mt-2 text-xs text-cyan-100">{!signedIn ? "Sign in to your existing local profile first." : busy ? busyAction === "inspect" ? "Checking local developer access…" : "Complete the native dialog…" : error ?? view?.detail ?? "Checking local developer access…"}</p>
    {view?.phase === "active" ? <p className="mt-2 text-xs text-slate-300">
      Native lease last acknowledged: {view.nativeLease?.lastAcknowledgedAt ? new Date(view.nativeLease.lastAcknowledgedAt).toLocaleTimeString() : "not confirmed"}.
      {view.nativeLease?.lastRefreshIssue ? ` Last refresh interruption: ${view.nativeLease.lastRefreshIssue.reason.replaceAll("_", " ")} at ${new Date(view.nativeLease.lastRefreshIssue.at).toLocaleTimeString()}.` : ""}
      {" "}A USB grant alone does not confirm current room-source access.
    </p> : null}
    {view?.phase === "active" && view.expiresAt ? <p className="mt-2 text-xs">Expires {new Date(view.expiresAt).toLocaleString()}. USB is a transport, not a hardware authenticator; removing it does not revoke an imported grant.</p> : null}
    <div className="mt-3 flex flex-wrap gap-2">
      {button("Check developer access", "inspect")}
      {view?.phase === "inactive" && (!view.issuerInitialized || view.ownsIssuer)
        ? button("Activate this private development profile", "activate-self") : null}
      {button("Import my USB grant", "import-grant")}
      {button("Export my installation request", "export-request")}
      {view?.phase === "active" ? button("Disable my USB access", "disable") : null}
    </div>
    {view?.phase === "inactive" && (!view.issuerInitialized || view.ownsIssuer)
      ? <p className="mt-2 text-xs text-slate-300">On this private developer PC, activation handles issuer creation, a 24-hour self-grant, USB backup, and local import in one reviewed native operation. It does not start the tunnel or authorize Minecraft or paid AI.</p> : null}
    {view?.phase !== "unavailable" ? <details className="mt-3 text-xs">
      <summary>Developer issuer: grant access to yourself or others</summary>
      <p className="my-2 text-slate-300">On the owner’s private development PC, create an issuer, then grant this profile or select another installation’s request. The recipient imports the signed bundle and compares the issuer fingerprint separately. Each installation gets its own grant.</p>
      {view?.fingerprint ? <p className="my-2 break-all">Issuer fingerprint: {view.fingerprint}</p> : null}
      <div className="flex flex-wrap gap-2">
        {!view?.issuerInitialized ? button("Create developer issuer on this PC", "initialize-issuer") : null}
        {view?.ownsIssuer ? <>
          {button("Grant this profile and save to USB", "grant-self")}
          {button("Issue grant from installation request", "issue-grant")}
          {button("Export updated grants and revocations", "export-bundle", !view.issued?.length)}
        </> : null}
      </div>
      {view?.ownsIssuer && view.issued?.length ? <div className="mt-3 flex flex-wrap gap-2">
        <select aria-label="Developer grant to revoke" value={grantId} onChange={e => setGrantId(e.target.value)} disabled={busy}>
          <option value="">Select a grant</option>
          {view.issued.map(g => <option key={g.grantId} value={g.grantId} disabled={g.revoked}>{g.profileId} · {g.grantId.slice(0, 8)}{g.revoked ? " · revoked" : ""}</option>)}
        </select>
        {button("Revoke selected grant", "revoke", !grantId, grantId)}
      </div> : null}
    </details> : null}
    <p className="mt-3 text-xs text-amber-200">Offline recipients receive revocations only when they import an updated signed bundle. Otherwise their existing grant expires within 24 hours. Keep the issuer’s Windows account private.</p>
    <div className="mt-2">{button("Import updated revocations", "import-revocations")}</div>
  </section>;
}
