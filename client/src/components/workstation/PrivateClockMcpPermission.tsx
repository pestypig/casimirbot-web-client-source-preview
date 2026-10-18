import React, { useEffect, useMemo, useRef, useState } from "react";
import { privateClockPermissionStateSchema, type PrivateClockPermissionState } from "@shared/desktop-private-clock-permission";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";
import { AGENT_CONNECTION_INVALIDATED_EVENT } from "@/lib/agent-access/connectionObservation";

export default function PrivateClockMcpPermission({ installationRef, blocked, onOpenSetup }: { installationRef: string | null; blocked: boolean; onOpenSetup?: () => void }) {
  const bridge = useMemo(() => {
    const native = window.casimirDesktop;
    return native?.getPrivateClockMcpPermission && native.grantPrivateClockMcpPermission && native.revokePrivateClockMcpPermission
      ? { inspect: native.getPrivateClockMcpPermission, grant: native.grantPrivateClockMcpPermission, revoke: native.revokePrivateClockMcpPermission } : null;
  }, []);
  const [state, setState] = useState<PrivateClockPermissionState | null>(null);
  const [busy, setBusy] = useState(false), [revoking, setRevoking] = useState(false), [message, setMessage] = useState("");
  const generation = useRef(0);
  const refresh = async () => {
    if (!bridge) return;
    const id = ++generation.current; setBusy(true); setMessage("");
    try { const next = privateClockPermissionStateSchema.parse(await bridge.inspect()); if (id === generation.current) setState(next); }
    catch { if (id === generation.current) { setState(null); setMessage("Clock connection could not be checked. Confirm the developer account and refresh."); } }
    finally { if (id === generation.current) setBusy(false); }
  };
  useEffect(() => {
    setState(null); void refresh();
    const changed = () => { ++generation.current; setState(null); setBusy(false); setMessage("Account state changed. Refresh to check clock permission."); };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, changed);
    return () => { ++generation.current; window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, changed); };
  }, [bridge, installationRef]);
  useEffect(() => {
    if (!state?.allowed || !state.expiresAt) return;
    const expiry = Date.parse(state.expiresAt);
    const expire = () => {
      if (Date.now() < expiry) return;
      ++generation.current; setState(null); setBusy(false);
      setMessage("Clock permission expired. Refresh to check current access.");
      window.dispatchEvent(new Event(AGENT_CONNECTION_INVALIDATED_EVENT));
    };
    const timer = setTimeout(expire, Math.max(0, Math.min(2147483647, expiry - Date.now())));
    window.addEventListener("focus", expire);
    return () => { clearTimeout(timer); window.removeEventListener("focus", expire); };
  }, [state]);
  if (!bridge || !installationRef) return null;
  const allowed = Boolean(state?.allowed && state.installationRef === installationRef && state.expiresAt && Date.parse(state.expiresAt) > Date.now());
  const grant = async () => {
    const id = ++generation.current; setBusy(true); setMessage("");
    try { const next = privateClockPermissionStateSchema.parse(await bridge.grant(installationRef)); if (id === generation.current) { setState(next); window.dispatchEvent(new Event(AGENT_CONNECTION_INVALIDATED_EVENT)); } }
    catch { if (id === generation.current) { setState(null); setMessage("Permission was not confirmed. Refresh and check the selected installation."); } }
    finally { if (id === generation.current) setBusy(false); }
  };
  const revoke = async () => {
    const id = ++generation.current; setRevoking(true); setBusy(false); setState(null); setMessage("");
    window.dispatchEvent(new Event(AGENT_CONNECTION_INVALIDATED_EVENT));
    try {
      const result = await bridge.revoke() as { revoked?: boolean };
      if (result?.revoked !== true) throw Error("unconfirmed");
      if (id === generation.current) setMessage("Clock access revoked; active clock work stopped.");
    } catch { if (id === generation.current) setMessage("Revocation or cleanup could not be confirmed. Keep the app open and retry Stop and revoke."); }
    finally { setRevoking(false); }
  };
  const button = "rounded border border-white/20 px-3 py-2 text-sm disabled:opacity-40";
  return <section aria-label="Codex MCP clock access" className="mt-3 rounded-xl border border-cyan-300/20 p-3 text-sm">
    <h3 className="font-semibold">Codex / MCP clock access</h3>
    <p className="mt-1 text-white/70">Allow the connected native MCP client for this account and device to read this installed clock. Each read is bounded; no room or task pairing is required.</p>
    <p className="mt-2">{allowed ? "Clock permission allowed" : "Clock permission not confirmed"} · {state?.transportReady ? "Full Harness transport ready" : "Transport needs connection or refresh"}</p>
    <p className="mt-1 text-white/60">Native connection setup is in Device Check. A ready transport does not confirm that your external AI client is connected or has read the clock.</p>
    {allowed && state?.expiresAt && <p className="text-white/60">Permission expires {new Date(state.expiresAt).toLocaleString()}.</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      {onOpenSetup && <button type="button" className={button} onClick={onOpenSetup}>Open native connection setup</button>}
      <button className={button} disabled={blocked || busy || revoking || Boolean(allowed) || !state} onClick={() => void grant()}>Allow MCP clock reads</button>
      <button className={button} disabled={revoking} onClick={() => void revoke()}>Stop and revoke MCP clock access</button>
      <button className={button} disabled={busy || revoking} onClick={() => void refresh()}>Refresh clock connection</button>
    </div>
    {message && <p role="status" className="mt-2">{message}</p>}
  </section>;
}
