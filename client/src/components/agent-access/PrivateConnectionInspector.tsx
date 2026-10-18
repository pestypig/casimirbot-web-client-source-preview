import React, { useEffect, useRef, useState } from "react";
import { helixAgentConnectionStatusSchema, type HelixAgentClientProfileId } from "@shared/helix-agent-client-profile";
import type { HelixAgentClientReadiness } from "@shared/helix-agent-client-readiness";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";
import { AGENT_CONNECTION_INVALIDATED_EVENT } from "@/lib/agent-access/connectionObservation";
import {requestWorkstationGuidance} from "@/lib/workstation/workstationGuidance";
import {connectionSetupGuidanceTarget} from "./agentConnectionSetupState";

const endpoint = "/api/account/session/agent-connections/readiness";
const button = "rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-45";
type Snapshot = { expiresAt: number; readiness: Pick<HelixAgentClientReadiness,
  "client_authorization" | "client_presence" | "catalog_sync" | "thread_attachment" | "continuation_readiness"> };

/** Read-only connection observation. Choosing an inspection target is never a
 * configured runtime selection, task attachment or package execution grant. */
export default function PrivateConnectionInspector({ scope, onOpenSetup }: {
  scope: string; onOpenSetup: () => void;
}) {
  const [profile, setProfile] = useState<HelixAgentClientProfileId>("codex_app");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [message, setMessage] = useState("Connection status has not been checked.");
  const [busy, setBusy] = useState(false);
  const generation = useRef(0), controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const clear = () => {
      generation.current++; controller.current?.abort(); controller.current = null;
      setSnapshot(null); setBusy(false); setMessage("Connection status has not been checked.");
    };
    clear(); window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear);
    window.addEventListener(AGENT_CONNECTION_INVALIDATED_EVENT, clear);
    return () => { generation.current++; controller.current?.abort(); window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear);
      window.removeEventListener(AGENT_CONNECTION_INVALIDATED_EVENT, clear); };
  }, [scope, profile]);
  useEffect(() => {
    if (!snapshot) return;
    const expire = () => { setSnapshot(null); setMessage("Connection status expired. Check again for current status."); };
    const timer = window.setTimeout(expire, Math.max(0, snapshot.expiresAt - Date.now()));
    const returned = () => { if (Date.now() >= snapshot.expiresAt) expire(); };
    window.addEventListener("focus", returned);
    document.addEventListener("visibilitychange", returned);
    return () => { window.clearTimeout(timer); window.removeEventListener("focus", returned); document.removeEventListener("visibilitychange", returned); };
  }, [snapshot]);
  const check = async () => {
    if (busy) return;
    const id = ++generation.current, abort = new AbortController(); controller.current = abort;
    setBusy(true); setSnapshot(null); setMessage("Checking connection status…");
    const timer = window.setTimeout(() => abort.abort(), 10000);
    try {
      const response = await fetch(`${endpoint}?client_profile=${profile}`, {
        credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }, signal: abort.signal,
      });
      if (id !== generation.current) return;
      abort.signal.throwIfAborted();
      if (response.status === 401) { setMessage("Sign in to check your external AI connection."); return; }
      if (!response.ok) throw Error("connection_unavailable");
      const value = helixAgentConnectionStatusSchema.parse(await response.json());
      if (id !== generation.current) return;
      abort.signal.throwIfAborted();
      if (value.selected_client_profile !== profile) throw Error("connection_profile_mismatch");
      const now = Date.now(), presenceExpiry = value.heartbeat_expires_at ? Date.parse(value.heartbeat_expires_at) : null;
      if (value.readiness.client_presence === "online" &&
          (presenceExpiry === null || presenceExpiry <= now || value.proof_basis !== "authenticated_presence_tool"))
        throw Error("connection_presence_stale");
      const expiresAt = Math.min(now + 30000, presenceExpiry ?? now + 30000);
      if (expiresAt <= now) throw Error("connection_presence_stale");
      const {client_authorization, client_presence, catalog_sync, thread_attachment, continuation_readiness} = value.readiness;
      setSnapshot({expiresAt,readiness:{client_authorization,client_presence,catalog_sync,thread_attachment,continuation_readiness}});
      setMessage("Account connection status checked. Package access is separate.");
    } catch { if (id === generation.current) { setSnapshot(null); setMessage("Connection status is unavailable. Try again or open connection setup."); } }
    finally { window.clearTimeout(timer); if (id === generation.current) { setBusy(false); controller.current = null; } }
  };
  return <section aria-label="External AI connection" className="mt-4 space-y-3 border-t border-white/15 pt-4">
    <h3 className="font-medium">External AI connection</h3>
    <p>Scope: {scope}. Checking an AI app does not grant program access or change your reasoning runtime.</p>
    <p>Your AI app handles its own model access and charges. CasimirBot does not supply model credits with this connection.</p>
    <label className="block">AI app to inspect
      <select className="ml-2 rounded border border-white/20 bg-slate-950 p-2" value={profile}
        onChange={event => setProfile(event.target.value as HelixAgentClientProfileId)}>
        <option value="codex_app">Codex App</option><option value="standard_mcp">Another MCP app</option>
      </select>
    </label>
    <div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy} onClick={() => void check()}>Check connection status</button>
      <button type="button" className={button} onClick={()=>{
        requestWorkstationGuidance({kind:"user_attention",panelId:"agent-access",targetId:connectionSetupGuidanceTarget(profile),
          label:"Review this AI app's connection setup. No connection or program access is granted.",durationMs:12000});
        onOpenSetup();
      }}>Open connection setup</button></div>
    <p role="status" aria-live="polite">{message}</p>
    {snapshot && <dl className="grid gap-2 sm:grid-cols-2">{[
      ["Authorization",snapshot.readiness.client_authorization], ["Client presence",snapshot.readiness.client_presence],
      ["Tool catalog",snapshot.readiness.catalog_sync], ["Task attachment",snapshot.readiness.thread_attachment],
      ["Task steering",snapshot.readiness.continuation_readiness],
    ].map(([label,value])=><div key={label}><dt className="text-slate-400">{label}</dt><dd>{value.replaceAll("_"," ")}</dd></div>)}</dl>}
  </section>;
}
