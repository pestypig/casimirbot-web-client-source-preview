import React, { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { helixAgentConnectionStatusSchema } from "@shared/helix-agent-client-profile";
import { helixReasoningTaskBindingProjectionSchema } from "@shared/helix-reasoning-task-binding";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, readCachedAccountCapabilityPolicy } from "@/lib/workstation/accountCapabilityPolicy";
import { AGENT_CONNECTION_INVALIDATED_EVENT } from "@/lib/agent-access/connectionObservation";
import { projectConnectionHealth, type ConnectionHealth, type ConnectionHealthPurpose, type ConnectionHealthRoute } from "@/lib/agent-access/connectionHealth";
import { CONNECTION_HEALTH_MEMORY_KEY, readConnectionHealthMemory,
  shouldNotifyConnectionChange, type ConnectionHealthMemory } from "@/lib/agent-access/connectionHealthMemory";
import { useWorkstationLayoutStore } from "@/store/useWorkstationLayoutStore";
import { useAgiChatStore } from "@/store/useAgiChatStore";
import { listPairingDestinations, pairingStatusSchema } from "@/lib/agent-access/durablePairing";

const NOTIFY_KEY = "casimirbot.connection_health.windows_notices.v1";
const ROUTE_KEY = "casimirbot.connection_health.route.v1";
const PURPOSE_KEY = "casimirbot.connection_health.purpose.v1";
const button = "rounded border border-white/20 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40";
const hexDigest = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
};
const boundedRead = <T,>(read: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
  const timeout = window.setTimeout(() => reject(Error("inspection_timeout")), 10_000);
  read.then(value => { window.clearTimeout(timeout); resolve(value); }, error => {
    window.clearTimeout(timeout); reject(error);
  });
});

type HealthContext = {
  health: ConnectionHealth | null;
  lastKnown: ConnectionHealthMemory | null;
  message: string;
  optedIn: boolean;
  permission: NotificationPermission | "unsupported";
  developer: boolean;
  route: ConnectionHealthRoute;
  purpose: ConnectionHealthPurpose;
  check: () => Promise<void>;
  selectRoute: (next: ConnectionHealthRoute) => void;
  selectPurpose: (next: ConnectionHealthPurpose) => void;
  toggleNotices: () => void;
};
const ConnectionHealthContext = createContext<HealthContext | null>(null);

/** Keep the read-only observer alive while the desktop is open, even when the
 * Agent Access panel is closed. External Source errors remain unverified here. */
export function ConnectionHealthProvider({ children }: { children: ReactNode }) {
  const openPanel = useWorkstationLayoutStore(s => s.openPanelInActiveGroup);
  const activeChatId = useAgiChatStore(s => s.activeId);
  const [health, setHealth] = useState<ConnectionHealth | null>(null);
  const [lastKnown, setLastKnown] = useState<ConnectionHealthMemory | null>(null);
  const [message, setMessage] = useState("Checking connection checkpoints…");
  const [notice, setNotice] = useState<string | null>(null);
  const [optedIn, setOptedIn] = useState(() => window.localStorage.getItem(NOTIFY_KEY) === "true");
  const [route, setRoute] = useState<ConnectionHealthRoute>(() => {
    const saved = window.localStorage.getItem(ROUTE_KEY);
    if (saved === "external_oauth" || saved === "local_stdio" || saved === "private_tunnel") return saved;
    return readCachedAccountCapabilityPolicy()?.account_type === "developer" ? "private_tunnel"
      : window.casimirDesktop?.personalMcpP1Connection ? "local_stdio" : "external_oauth";
  });
  const [purpose, setPurpose] = useState<ConnectionHealthPurpose>(() => {
    const saved = window.localStorage.getItem(PURPOSE_KEY);
    return saved === "personal_mcp" || saved === "paired_task" ? saved
      : readCachedAccountCapabilityPolicy()?.account_type === "developer" ? "paired_task" : "personal_mcp";
  });
  const [developer, setDeveloper] = useState(() => readCachedAccountCapabilityPolicy()?.account_type === "developer");
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  const generation = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const previous = useRef<ConnectionHealth | null>(null);
  const knownProfile = useRef<string | null>(null);
  const chatRef = useRef(activeChatId);
  const check = useCallback(async () => {
    const id = ++generation.current;
    abort.current?.abort();
    const controller = new AbortController(); abort.current = controller;
    const developer = readCachedAccountCapabilityPolicy()?.account_type === "developer";
    const effectiveRoute = !developer && route === "private_tunnel"
      ? window.casimirDesktop?.personalMcpP1Connection ? "local_stdio" : "external_oauth" : route;
    const privateRoute = effectiveRoute === "private_tunnel";
    const localRoute = effectiveRoute === "local_stdio";
    const pairedPurpose = purpose === "paired_task";
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const [native, remote, pkg, bound, registered, localStdio, deviceApproval] = await Promise.allSettled([
        privateRoute ? window.casimirDesktop?.getMcpTunnelState?.() : Promise.resolve(null),
        fetch(`/api/account/session/agent-connections/readiness?client_profile=codex_app&connection_route=${effectiveRoute}`, {
          credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }, signal: controller.signal,
        }).then(async response => ({ signedIn: response.status !== 401, status: response.status,
          value: response.ok ? await response.json() : null })),
        privateRoute ? window.casimirDesktop?.getPrivateDevUpdateState?.() : Promise.resolve(null),
        pairedPurpose && activeChatId ? fetch(`/api/account/session/agent-connections/reasoning-bindings/current?helix_conversation_id=${encodeURIComponent(activeChatId)}`, {
          credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }, signal: controller.signal,
        }).then(response => response.ok ? response.json() : null) : Promise.resolve(null),
        pairedPurpose ? listPairingDestinations().then(result => result.destinations).catch(() => null) : Promise.resolve(null),
        localRoute ? window.casimirDesktop?.personalMcpP1Connection?.("inspect") : Promise.resolve(null),
        localRoute ? window.casimirDesktop?.personalMcpDeviceRegistration?.("check") : Promise.resolve(null),
      ].map(read => boundedRead(Promise.resolve(read))));
      if (id !== generation.current) return;
      const clientResponse = remote.status === "fulfilled" ? remote.value : null;
      const client = helixAgentConnectionStatusSchema.safeParse(clientResponse?.value);
      const readinessRead = remote.status === "rejected" || !clientResponse ? "network_error"
        : clientResponse.status === 401 ? "ok"
          : clientResponse.status < 200 || clientResponse.status >= 300 ? "http_error"
            : client.success ? "ok" : "invalid_payload";
      const bindingResponse = bound.status === "fulfilled" && bound.value && typeof bound.value === "object"
        ? bound.value as Record<string, unknown> : null;
      const bindingResult = helixReasoningTaskBindingProjectionSchema.safeParse(bindingResponse?.binding);
      const binding = bindingResponse?.ok === true && bindingResult.success ? bindingResult.data : null;
      let pairing: unknown = null;
      if (binding?.pairing_id) {
        try {
          const response = await fetch(`/api/account/session/agent-connections/reasoning-pairings/${encodeURIComponent(binding.pairing_id)}`, {
            credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }, signal: controller.signal,
          });
          if (response.ok) {
            const body = await response.json() as { pairing?: unknown };
            const parsed = pairingStatusSchema.safeParse(body?.pairing);
            if (parsed.success) pairing = parsed.data;
          }
        } catch { /* An interrupted pairing read is unknown, not revoked. */ }
      }
      const profileHash = client.success && crypto?.subtle
        ? await hexDigest(client.data.authenticated_profile_ref) : null;
      const taskRefHash = client.success && client.data.conversation_thread_ref && crypto?.subtle
        ? await hexDigest(client.data.conversation_thread_ref) : null;
      if (id !== generation.current) return;
      const projected = projectConnectionHealth({ now: Date.now(), developer, route: effectiveRoute, purpose,
        signedIn: clientResponse?.signedIn !== false,
        readinessRead, readinessHttpStatus: clientResponse?.status ?? null,
        tunnel: native.status === "fulfilled" ? native.value : null,
        localStdioSupported: Boolean(window.casimirDesktop?.personalMcpP1Connection),
        localStdio: localStdio.status === "fulfilled" ? localStdio.value : null,
        deviceApproval: deviceApproval.status === "fulfilled" ? deviceApproval.value : null,
        client: clientResponse?.value, binding, pairing, activeChatId, taskRefHash,
        registrations: registered.status === "fulfilled" ? registered.value : null,
        packageState: pkg.status === "fulfilled" ? pkg.value : null });
      const prior = previous.current;
      const sameProfile = Boolean(knownProfile.current && clientResponse?.signedIn !== false &&
        (!profileHash || knownProfile.current === profileHash));
      if (knownProfile.current && profileHash && !sameProfile) {
        window.localStorage.removeItem(CONNECTION_HEALTH_MEMORY_KEY);
        setNotice(null); setLastKnown(null);
      }
      if (clientResponse?.signedIn === false) { knownProfile.current = null; setLastKnown(null); }
      else if (profileHash) knownProfile.current = profileHash;
      const memory = knownProfile.current ? readConnectionHealthMemory(window.localStorage) : null;
      const matchingMemory = memory?.profileHash === knownProfile.current ? memory : null;
      setLastKnown(matchingMemory);
      const changed = sameProfile && prior && prior.blocker !== projected.blocker;
      const historicalRegression = !prior && Boolean(profileHash && matchingMemory &&
        shouldNotifyConnectionChange({ health: projected,
          memory: { ...matchingMemory, lastNotice: null }, now: Date.now(), optedIn: true }));
      if (projected.route === "local_stdio" && projected.blocker === "protected_read") setNotice(null);
      else if (changed || historicalRegression) setNotice(projected.blocker === "none"
        ? "Connection checkpoints recovered. Confirm the required tool from the exact task."
        : `Connection change: ${projected.message}`);
      let noticeMemory = matchingMemory;
      if (((changed && prior?.protectedRead === "current" && prior.catalog === "current") || historicalRegression) &&
        matchingMemory && shouldNotifyConnectionChange({ health: projected, memory: matchingMemory,
          now: Date.now(), optedIn }) && typeof window.casimirDesktop !== "undefined" &&
        typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification("CasimirBot connection needs attention", {
            body: projected.message, tag: `casimirbot-connection-${projected.blocker}`,
          });
          noticeMemory = { ...matchingMemory,
            lastNotice: { blocker: projected.blocker, at: projected.observedAt } };
        } catch { /* The in-app notice remains available. */ }
      }
      if (projected.workingIdentity && profileHash && crypto?.subtle) {
        const identityHash = await hexDigest(projected.workingIdentity);
        if (id !== generation.current) return;
        const next: ConnectionHealthMemory = { schema: CONNECTION_HEALTH_MEMORY_KEY,
          profileHash, identityHash, verifiedAt: projected.observedAt,
          packageBuild: projected.packageBuild, lastNotice: noticeMemory?.lastNotice ?? null };
        window.localStorage.setItem(CONNECTION_HEALTH_MEMORY_KEY, JSON.stringify(next));
        setLastKnown(next);
      } else if (noticeMemory && noticeMemory !== matchingMemory) {
        window.localStorage.setItem(CONNECTION_HEALTH_MEMORY_KEY, JSON.stringify(noticeMemory));
        setLastKnown(noticeMemory);
      }
      previous.current = projected;
      setHealth(projected);
      setMessage("Checked read-only records. The exact client entry and required tool still need their own task receipt.");
    } catch {
      if (id === generation.current) { setHealth(null); setMessage("Connection inspection is unavailable. Keep the current pairing and retry later."); }
    } finally {
      window.clearTimeout(timeout);
    }
  }, [optedIn, route, purpose, activeChatId]);
  useEffect(() => {
    if (chatRef.current === activeChatId) return;
    chatRef.current = activeChatId;
    if (purpose !== "paired_task") return;
    previous.current = null; knownProfile.current = null; setNotice(null); setLastKnown(null);
    window.localStorage.removeItem(CONNECTION_HEALTH_MEMORY_KEY);
  }, [activeChatId, purpose]);
  useEffect(() => {
    void check();
    const timer = window.setInterval(() => void check(), 30_000);
    const accountChanged = () => {
      const nextDeveloper = readCachedAccountCapabilityPolicy()?.account_type === "developer";
      setDeveloper(nextDeveloper);
      if (!window.localStorage.getItem(ROUTE_KEY)) setRoute(nextDeveloper ? "private_tunnel"
        : window.casimirDesktop?.personalMcpP1Connection ? "local_stdio" : "external_oauth");
      if (!window.localStorage.getItem(PURPOSE_KEY)) setPurpose(nextDeveloper ? "paired_task" : "personal_mcp");
      previous.current = null; knownProfile.current = null; setHealth(null); setNotice(null); setLastKnown(null); void check();
    };
    const connectionChanged = () => void check();
    const native = window.casimirDesktop?.onMcpTunnelState?.(() => void check());
    const personal = window.casimirDesktop?.onPersonalMcpP1Completion?.(() => void check());
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, accountChanged);
    window.addEventListener(AGENT_CONNECTION_INVALIDATED_EVENT, connectionChanged);
    window.addEventListener("focus", connectionChanged);
    return () => { generation.current++; abort.current?.abort(); window.clearInterval(timer); native?.(); personal?.();
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, accountChanged);
      window.removeEventListener(AGENT_CONNECTION_INVALIDATED_EVENT, connectionChanged);
      window.removeEventListener("focus", connectionChanged); };
  }, [check]);
  const enableNotices = async () => {
    if (typeof window.casimirDesktop === "undefined" || typeof Notification === "undefined") return;
    const next = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    setPermission(next);
    if (next === "granted") { window.localStorage.setItem(NOTIFY_KEY, "true"); setOptedIn(true); }
  };
  const resetSelection = () => {
    window.localStorage.removeItem(CONNECTION_HEALTH_MEMORY_KEY);
    previous.current = null; knownProfile.current = null; setNotice(null); setHealth(null); setLastKnown(null);
  };
  const selectRoute = (next: ConnectionHealthRoute) => {
    window.localStorage.setItem(ROUTE_KEY, next); resetSelection(); setRoute(next);
  };
  const selectPurpose = (next: ConnectionHealthPurpose) => {
    window.localStorage.setItem(PURPOSE_KEY, next); resetSelection(); setPurpose(next);
  };
  const toggleNotices = () => {
    if (optedIn) { window.localStorage.removeItem(NOTIFY_KEY); setOptedIn(false); }
    else void enableNotices();
  };
  return <ConnectionHealthContext.Provider value={{ health, lastKnown, message, optedIn, permission, developer,
    route, purpose, check, selectRoute, selectPurpose, toggleNotices }}>
    {children}
    {notice && <div role="alert" className="fixed bottom-4 right-4 z-[100] max-w-sm rounded border border-amber-300/50 bg-slate-900 p-3 text-sm text-slate-100 shadow-xl">
      <p>{notice}</p>
      <div className="mt-2 flex gap-2">
        <button data-helix-control-id="workstation.panel.agent-access.connection-health-panel.view-connection-health" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" className={button} onClick={() => openPanel("agent-access")}>View connection health</button>
        <button data-helix-control-id="workstation.panel.agent-access.connection-health-panel.dismiss" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" className={button} onClick={() => setNotice(null)}>Dismiss</button>
      </div>
    </div>}
  </ConnectionHealthContext.Provider>;
}

function ConnectionHealthView() {
  const context = useContext(ConnectionHealthContext);
  if (!context) return null;
  const { health, lastKnown, message, optedIn, permission, developer, route, purpose,
    check, selectRoute, selectPurpose, toggleNotices } = context;
  const openPanel = useWorkstationLayoutStore(s => s.openPanelInActiveGroup);
  const selectedRoute = !developer && route === "private_tunnel"
    ? window.casimirDesktop?.personalMcpP1Connection ? "local_stdio" : "external_oauth" : route;
  return <section aria-label="Connection Health" className="my-4 rounded-xl border border-cyan-300/20 bg-slate-900 p-4 text-slate-100">
    <h2 className="text-lg font-semibold">Connection Health</h2>
    <p className="mt-1 text-sm">The first checkpoint needing attention is shown below. Personal Codex approval, local Ready, OAuth, exact-task pairing, catalog, and package version are separate checks.</p>
    <label className="mt-3 block text-sm">Connection route
      <select data-helix-control-id="workstation.panel.agent-access.connection-health-panel.select" data-helix-interaction-kind="configure" data-helix-authority-state="client_local" className="ml-2 rounded border border-white/20 bg-slate-950 p-2" value={selectedRoute}
        onChange={event => selectRoute(event.target.value as ConnectionHealthRoute)}>
        {developer && <option value="private_tunnel">Private EXE tunnel</option>}
        <option value="local_stdio">Personal Codex local entry</option>
        <option value="external_oauth">External OAuth</option>
      </select>
    </label>
    <label className="mt-3 block text-sm">Connection purpose
      <select data-helix-control-id="workstation.panel.agent-access.connection-health-panel.select.2" data-helix-interaction-kind="configure" data-helix-authority-state="client_local" className="ml-2 rounded border border-white/20 bg-slate-950 p-2" value={purpose}
        onChange={event => selectPurpose(event.target.value as ConnectionHealthPurpose)}>
        <option value="paired_task">Message Codex task</option>
        <option value="personal_mcp">Personal MCP tools</option>
      </select>
    </label>
    <p className="mt-1 text-xs text-slate-400">Task pairing is optional for bounded personal reads and needs separate owner approval.</p>
    <p role="status" className="mt-2 text-sm">{message}</p>
    {health && <>
      <p className="mt-3 font-medium">First blocker: {health.blocker.replaceAll("_", " ")}</p>
      <p className="mt-1 text-sm">{health.message}</p>
      <p className="mt-1 text-xs text-slate-400">Actor: {health.actor.replaceAll("_", " ")}. Completion: {health.completion}</p>
      <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div><dt>Selected route</dt><dd>{health.route.replaceAll("_", " ")}</dd></div>
        <div><dt>Selected purpose</dt><dd>{health.purpose.replaceAll("_", " ")}</dd></div>
        <div><dt>Local transport</dt><dd>{health.transport}</dd></div>
        <div><dt>Protected client presence</dt><dd>{health.protectedRead}</dd></div>
        {health.purpose === "paired_task" && <><div><dt>Exact task protected read</dt><dd>{health.exactTaskRead}</dd></div>
        <div><dt>Exact task check</dt><dd>{health.exactTaskReason.replaceAll("_", " ")}</dd></div></>}
        <div><dt>{health.route === "local_stdio" ? "Personal MCP entry" : "Matching MCP Source"}</dt>
          <dd>unverified here; inspect in exact task</dd></div>
        <div><dt>Client catalog</dt><dd>{health.catalog}</dd></div>
        <div><dt>Required tool</dt><dd>unverified until exact task call</dd></div>
        {health.purpose === "paired_task" && <><div><dt>Task registration</dt><dd>{health.registration.replaceAll("_", " ")}</dd></div>
        <div><dt>Owner pairing</dt><dd>{health.pairing}</dd></div>
        <div><dt>Runtime binding</dt><dd>{health.runtimeBinding}</dd></div></>}
        {health.route === "private_tunnel" && <><div><dt>Running private build label</dt><dd>{health.packageBuild ?? "unknown"}</dd></div>
        <div><dt>Staged package</dt><dd>{health.packagePending ?? "none observed"}</dd></div>
        <div><dt>Package selection</dt><dd>{health.packageFreshness.replaceAll("_", " ")}</dd></div></>}
        <div><dt>Observed</dt><dd>{health.observedAt}</dd></div>
        <div><dt>Expires</dt><dd>{health.expiresAt}</dd></div>
      </dl>
      <p className="mt-2 text-xs text-slate-400">{lastKnown
        ? `Last verified client presence for this account: ${lastKnown.verifiedAt}. Build: ${lastKnown.packageBuild ?? "not applicable or unknown"}. This historical fingerprint grants no current access or required-tool result.`
        : "No last-known authenticated client presence is attributed to this current account. A saved fingerprint never grants access or a tool result."}</p>
      {health.registration === "not_listed" && health.pairing === "accepted" && <p className="mt-1 text-xs text-slate-400">A missing current registration does not revoke an accepted pairing or active runtime binding.</p>}
      {health.packagePending && <p className="mt-1 text-xs text-slate-400">A staged build is an update candidate, not evidence that the current EXE or pairing failed.</p>}
      <button data-helix-control-id="workstation.panel.agent-access.connection-health-panel.open-recovery-control" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" className={`${button} mt-3`} onClick={() => openPanel(health.panel)}>Open recovery control</button>
    </>}
    <div className="mt-3 flex flex-wrap gap-2">
      <button data-helix-control-id="workstation.panel.agent-access.connection-health-panel.check-again" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" className={button} onClick={() => void check()}>Check again</button>
      {typeof window.casimirDesktop !== "undefined" && permission !== "unsupported" &&
        <button data-helix-control-id="workstation.panel.agent-access.connection-health-panel.toggle-notices" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" className={button} onClick={toggleNotices}>{optedIn ? "Turn off Windows connection notices" : "Enable Windows connection notices"}</button>}
    </div>
    <p className="mt-2 text-xs text-slate-400">Windows notices are opt-in and appear only after previously verified local and client checkpoints change to an actionable blocker. Owner Stop stays quiet.</p>
  </section>;
}

export default function ConnectionHealthPanel() {
  const context = useContext(ConnectionHealthContext);
  return context ? <ConnectionHealthView /> : <ConnectionHealthProvider><ConnectionHealthView /></ConnectionHealthProvider>;
}
