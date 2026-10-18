import React, { useEffect, useRef, useState } from "react";
import { projectLocalPersonalConnection, type LocalPersonalConnectionStatus } from "@shared/local-personal-connection-status";
import { privateEnvironmentStateSchema } from "@shared/desktop-environment-home";
import { helixAgentConnectionStatusSchema } from "@shared/helix-agent-client-profile";
import { privateClockHistoryDiscoverySchema, checkPrivateClockReceipt } from "@shared/private-clock-history";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";
import { AGENT_CONNECTION_INVALIDATED_EVENT } from "@/lib/agent-access/connectionObservation";
import { useWorkstationLayoutStore } from "@/store/useWorkstationLayoutStore";
import { parseDesktopMcpTunnelState } from "@shared/desktop-mcp-tunnel";

const button = "rounded border border-white/20 px-3 py-2 text-sm disabled:opacity-40";
/** Durable progress is reconstructed from existing native/service records.
 * This view stores no credentials, consent, grants, or remembered readiness. */
export default function LocalPersonalConnectionSetup() {
  const openPanel = useWorkstationLayoutStore(s => s.openPanelInActiveGroup);
  const [status, setStatus] = useState<LocalPersonalConnectionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Inspect to resume your existing connection.");
  const generation = useRef(0), pending = useRef(false), abort = useRef<AbortController | null>(null);
  const tunnelFingerprint = useRef<string | null>(null);
  const inspect = async () => {
    if (pending.current) return;
    pending.current = true; const id = ++generation.current;
    setBusy(true); setStatus(null); setMessage("Inspecting existing records…");
    const control = new AbortController(); abort.current = control;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let expired = false;
    try {
      const native = window.casimirDesktop;
      const perform = async () => {
      const settled = await Promise.allSettled([
          native?.getMcpTunnelState?.(), native?.getPrivateEnvironmentState?.(), native?.getPrivateClockMcpPermission?.(),
          fetch("/api/account/session/agent-connections/readiness?client_profile=codex_app", {
            credentials: "same-origin", cache: "no-store", signal: control.signal,
          }).then(r => r.ok ? r.json() : null),
          native?.recoverPrivateClockObservation?.(),
        ]);
      if (id !== generation.current || expired) return;
      const values = settled.map(r => r.status === "fulfilled" ? r.value : undefined);
      let history: "historical_success" | "outcome_unknown" | "absent" | undefined;
      const discovery = privateClockHistoryDiscoverySchema.safeParse(values[4]);
      const installation = privateEnvironmentStateSchema.safeParse(values[1]);
      if (discovery.success && installation.success && installation.data.installationRef) {
        const found = discovery.data;
        if (found.state === "empty") history = "absent";
        else if (found.history.state === "uncertain") history = "outcome_unknown";
        else if (found.history.state === "absent") history = "absent";
        else {
          try { checkPrivateClockReceipt(found.history.receipt, found.request, installation.data.installationRef); history = "historical_success"; }
          catch { /* Wrong installation or request is not outcome evidence. */ }
        }
      }
      let connectionRef: string | undefined;
      const client = helixAgentConnectionStatusSchema.safeParse(values[3]);
      if (client.success && installation.success && window.crypto?.subtle) {
        const identity = JSON.stringify([client.data.authenticated_profile_ref,client.data.service_instance_ref,
          client.data.authenticated_mcp_client_ref,installation.data.installationRef ?? null]);
        const digest = await window.crypto.subtle.digest("SHA-256",new TextEncoder().encode(identity));
        connectionRef = `connection:${Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,"0")).join("")}`;
      }
      if (id !== generation.current || expired) return;
      const parsedTunnel = parseDesktopMcpTunnelState(values[0]);
      tunnelFingerprint.current = parsedTunnel ? JSON.stringify(parsedTunnel) : null;
      setStatus(projectLocalPersonalConnection({ now: Date.now(), tunnel: values[0], installation: values[1], permission: values[2], client: values[3], history, connectionRef }));
      setMessage("Read-only inspection complete. Unknown facts remain unverified.");
      };
      await Promise.race([
        perform(),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => { expired = true; control.abort(); reject(Error("inspection_timeout")); }, 10000); }),
      ]);
    } catch { if (id === generation.current) setMessage("Inspection unavailable. Open native setup; do not create another tunnel or replay an uncertain read."); }
    finally { if (timeout) clearTimeout(timeout); if (id === generation.current) { pending.current = false; setBusy(false); } }
  };
  useEffect(() => {
    const clear = () => { tunnelFingerprint.current = null; generation.current++; abort.current?.abort(); pending.current = false; setBusy(false); setStatus(null);
      setMessage("Account, permission or transport changed. Inspect again before continuing."); };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear);
    window.addEventListener(AGENT_CONNECTION_INVALIDATED_EVENT, clear);
    const remove = window.casimirDesktop?.onMcpTunnelState?.(value => {
      const parsed = parseDesktopMcpTunnelState(value);
      // Duplicate valid notifications are not a change in authority or transport.
      // Invalid or changed snapshots still require a fresh read-only inspection.
      if (parsed && tunnelFingerprint.current === JSON.stringify(parsed)) return;
      clear();
    });
    return () => { generation.current++; abort.current?.abort(); remove?.(); window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, clear);
      window.removeEventListener(AGENT_CONNECTION_INVALIDATED_EVENT, clear); };
  }, []);
  useEffect(() => {
    if (!status) return;
    const expire = () => { if (Date.now() >= Date.parse(status.expiresAt)) { setStatus(null); setMessage("Inspection expired. Inspect again; saved success grants no current access."); } };
    const timer = setTimeout(expire, Math.max(0, Date.parse(status.expiresAt) - Date.now()));
    window.addEventListener("focus", expire);
    return () => { clearTimeout(timer); window.removeEventListener("focus", expire); };
  }, [status]);
  return <section aria-label="Connect Codex locally" className="my-4 rounded-xl border border-cyan-300/20 bg-slate-900 p-4 text-slate-100">
    <h2 className="text-lg font-semibold">Optional personal-tool connection check</h2>
    <p className="mt-2 text-sm">This installed clock-tool qualification is separate from AI task pairing and Minecraft readiness. An unverified clock tool does not mean your paired task is disconnected.</p>
    <p className="mt-2 text-sm">Private local route: existing native Secure MCP Tunnel and reviewed installed clock. Your external client owns model access and charges. No subscription, room or task pairing is required for bounded personal tools.</p>
    <p className="mt-2 text-xs text-slate-400">Signed same-device stdio remains unavailable pending trust and IPC admission. Private tunnel qualification does not establish public or ordinary-user acceptance.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" className={button} disabled={busy} onClick={() => void inspect()}>Inspect / resume connection</button>
      <button type="button" className={button} onClick={() => openPanel("device-check")}>Open protected native setup</button>
      <button type="button" className={button} onClick={() => openPanel("environment-home")}>Program permission, Stop and history</button>
    </div>
    <p role="status" className="mt-3 text-sm">{message}</p>
    {status && <>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">{[
        ["Connection reference",status.connectionRef ?? "unknown"], ["Account / device / client match",status.accountDeviceClientMatch],
        ["Native transport",status.transport], ["Control-plane delivery",status.controlPlane], ["External client attachment",status.attachment],
        ["Client catalog",status.catalog], ["Exact clock tool availability",status.requiredTool], ["Installation",status.installation],
        ["Artifact version",status.version ?? "unknown"], ["Artifact SHA-256",status.artifactSha256 ?? "unknown"],
        ["Current installation grant",status.grant], ["Grant expiry",status.grantExpiresAt ?? "unknown"], ["Last verified result",status.lastResult],
      ].map(([label,value]) => <div key={label}><dt className="text-slate-400">{label}</dt><dd className="break-all">{value.replaceAll("_"," ")}</dd></div>)}</dl>
      <p className="mt-3 text-sm">Next: {status.next.action.replaceAll("_"," ")} · {status.next.actor.replaceAll("_"," ")}. {status.next.reason}</p>
      <p className="mt-1 text-xs text-slate-400">Completion proof: {status.next.completion}</p>
      <button type="button" className={`${button} mt-3`} onClick={() => openPanel(status.next.panel)}>Open next control</button>
      <details className="mt-3 text-xs"><summary>Admitted connected-client recovery</summary><p className="mt-2">Inspect helix_public_ui_catalog, present the supported control with helix_workstation_human_control_present, or request / inspect / execute an existing helix_desktop_tunnel_transition. The native supervisor enforces consent and Stop. Keep request identity after uncertainty; never automatically renew or replay.</p></details>
    </>}
  </section>;
}
