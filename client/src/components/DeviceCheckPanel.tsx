import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  Square,
  Play,
  Trash2,
  ExternalLink,
  WifiOff,
  FolderOpen,
} from "lucide-react";
import {
  helixEnvironmentDeviceCheckListSchema,
  type HelixEnvironmentDeviceCheck,
} from "@shared/helix-environment-device-check";
import type { HelixAccountCapabilityPolicy } from "@shared/helix-account-session";
import {
  parseDesktopCodexPluginState,
  type DesktopCodexPluginState,
} from "@shared/codex-plugin";
import {
  parseDesktopMcpTunnelState,
  type DesktopMcpTunnelState,
} from "@shared/desktop-mcp-tunnel";
import type { DesktopMcpTransitionRequest } from
  "@shared/desktop-mcp-tunnel-transition";
import {
  parseDesktopMinecraftRunProfileState,
  type DesktopMinecraftRunProfileState,
} from "@shared/desktop-minecraft-run-profile";
import {
  parseDesktopMinecraftIntegratedWorldState,
  type DesktopMinecraftIntegratedWorldState,
} from "@shared/desktop-minecraft-integrated-world";
import { useRuntimeSurface } from "@/lib/runtime/RuntimeSurfaceProvider";
import { personalMcpP1UnavailableMessage } from
  "@/lib/workstation/personalMcpP1Availability";
import { useWorkstationLayoutStore } from "@/store/useWorkstationLayoutStore";
import {
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,
  fetchAccountCapabilityPolicy,
  readCachedAccountCapabilityPolicy,
  readCachedAccountProfileIdentity,
} from "@/lib/workstation/accountCapabilityPolicy";

const statusClass: Record<HelixEnvironmentDeviceCheck["health"], string> = {
  online: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  degraded: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  offline: "border-rose-400/30 bg-rose-400/10 text-rose-200",
  unknown: "border-slate-400/30 bg-slate-400/10 text-slate-200",
};

const statusIcon = (health: HelixEnvironmentDeviceCheck["health"]) => {
  if (health === "online") return CheckCircle2;
  if (health === "offline") return WifiOff;
  return AlertTriangle;
};

const label = (value: string): string =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const formatAge = (milliseconds: number | null): string => {
  if (milliseconds === null) return "Never observed";
  if (milliseconds < 1_000) return "Just now";
  const seconds = Math.floor(milliseconds / 1_000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
};

const subscribeAccountProfile = (listener: () => void): (() => void) => {
  window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, listener);
  return () => window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, listener);
};
const readAccountProfileRevision = (): number => readCachedAccountProfileIdentity().revision;

export default function DeviceCheckPanel() {
  const profileRevision = useSyncExternalStore(
    subscribeAccountProfile, readAccountProfileRevision, () => 0,
  );
  // Reset observations, drafts and pending UI work only when identity changes.
  return <DeviceCheckProfilePanel key={profileRevision} />;
}

function DeviceCheckProfilePanel() {
  const runtime = useRuntimeSurface();
  const [accountPolicy, setAccountPolicy] = useState<HelixAccountCapabilityPolicy | null>(
    () => readCachedAccountCapabilityPolicy(),
  );
  const developerControlsAvailable = accountPolicy?.account_type === "developer";
  const personalControlsAvailable = accountPolicy?.account_type === "user";
  const minecraftWorldControlsAvailable = developerControlsAvailable || personalControlsAvailable;
  const [personalMcpP1Available, setPersonalMcpP1Available] = useState(false);
  const [personalMcpP1Phase, setPersonalMcpP1Phase] = useState<string>("unavailable");
  const personalP1ReadGeneration = useRef(0);
  const [devices, setDevices] = useState<HelixEnvironmentDeviceCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [codexPlugin, setCodexPlugin] =
    useState<DesktopCodexPluginState | null>(null);
  const [codexOpening, setCodexOpening] = useState(false);
  const [codexError, setCodexError] = useState<string | null>(null);
  const [tunnel, setTunnel] = useState<DesktopMcpTunnelState | null>(null);
  const tunnelReadGeneration = useRef(0);
  const [tunnelId, setTunnelId] = useState("");
  const [runtimeApiKey, setRuntimeApiKey] = useState("");
  const [tunnelBusy, setTunnelBusy] = useState(false);
  const [tunnelError, setTunnelError] = useState<string | null>(null);
  const [transitionRequests, setTransitionRequests] =
    useState<DesktopMcpTransitionRequest[]>([]);
  const [transitionConsentAvailable, setTransitionConsentAvailable] =
    useState(false);
  const [transitionBusyRef, setTransitionBusyRef] = useState<string | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [minecraftRunProfile, setMinecraftRunProfile] =
    useState<DesktopMinecraftRunProfileState | null>(null);
  const [minecraftIntegratedWorld, setMinecraftIntegratedWorld] =
    useState<DesktopMinecraftIntegratedWorldState | null>(null);
  const [minecraftProfileBusy, setMinecraftProfileBusy] = useState(false);
  const [minecraftProfileError, setMinecraftProfileError] = useState<string | null>(null);

  const refreshTunnelState = useCallback((clearCurrent: boolean) => {
    const generation = ++tunnelReadGeneration.current;
    if (clearCurrent) setTunnel(null);
    const bridge = window.casimirDesktop;
    if (!bridge?.getMcpTunnelState) {
      setTunnelError("This desktop build does not include Secure MCP Tunnel support.");
      return;
    }
    void bridge.getMcpTunnelState().then((candidate) => {
      if (generation !== tunnelReadGeneration.current) return;
      const parsed = parseDesktopMcpTunnelState(candidate);
      if (!parsed) {
        setTunnelError("The desktop host returned an invalid tunnel state.");
        return;
      }
      setTunnel(parsed);
      setTunnelError(null);
    }).catch(() => {
      if (generation === tunnelReadGeneration.current) {
        setTunnelError("The desktop host could not inspect the tunnel runtime.");
      }
    });
  }, []);

  useEffect(() => {
    const onPolicyChange = (event: Event) => {
      const detail = (event as CustomEvent<{
        account_policy?: HelixAccountCapabilityPolicy | null;
        account_profile_changed?: boolean;
      }>).detail;
      setAccountPolicy(detail?.account_policy ?? readCachedAccountCapabilityPolicy());
      if (runtime.surface === "desktop_native") {
        // A policy refresh for the same profile is not a sign-out. Keep the
        // last observation visible while native identity is revalidated.
        refreshTunnelState(detail?.account_profile_changed === true);
      }
    };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, onPolicyChange);
    if (!readCachedAccountCapabilityPolicy()) {
      void fetchAccountCapabilityPolicy().catch(() => undefined);
    }
    return () => window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, onPolicyChange);
  }, [refreshTunnelState, runtime.surface]);

  useEffect(() => {
    if (developerControlsAvailable) return;
    setMinecraftRunProfile(null);
    setTransitionRequests([]);
    setTransitionConsentAvailable(false);
    setRuntimeApiKey("");
  }, [developerControlsAvailable]);

  useEffect(() => {
    if (!minecraftWorldControlsAvailable) setMinecraftIntegratedWorld(null);
  }, [minecraftWorldControlsAvailable]);

  const refreshPersonalMcpP1 = useCallback(async () => {
    const generation = ++personalP1ReadGeneration.current;
    setPersonalMcpP1Available(false);
    setPersonalMcpP1Phase("unavailable");
    if (runtime.surface !== "desktop_native" || !personalControlsAvailable) return;
    const inspect = window.casimirDesktop?.personalMcpP1Connection;
    if (!inspect) return;
    try {
      const result = await inspect("inspect");
      if (generation !== personalP1ReadGeneration.current) return;
      const candidate = result as { available?: unknown; phase?: unknown } | null;
      setPersonalMcpP1Available(candidate?.available === true);
      setPersonalMcpP1Phase(typeof candidate?.phase === "string"
        ? candidate.phase : "unavailable");
    } catch {
      if (generation === personalP1ReadGeneration.current)
        setPersonalMcpP1Phase("unavailable");
    }
  }, [personalControlsAvailable, runtime.surface]);

  useEffect(() => {
    void refreshPersonalMcpP1();
    return () => { personalP1ReadGeneration.current++; };
  }, [refreshPersonalMcpP1]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/agi/environment-connectors/devices", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          body && typeof body.message === "string"
            ? body.message
            : `Device Check request failed (${response.status}).`;
        throw new Error(message);
      }
      const parsed = helixEnvironmentDeviceCheckListSchema.safeParse(body);
      if (!parsed.success) {
        throw new Error("Device Check returned an invalid response contract.");
      }
      setDevices(parsed.data.devices);
      setRefreshedAt(parsed.data.generated_at);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  useEffect(() => {
    if (runtime.surface !== "desktop_native") return;
    const getState = window.casimirDesktop?.getCodexPluginState;
    if (!getState) {
      setCodexError("This desktop build does not expose a verified Codex plugin bundle.");
      return;
    }
    let cancelled = false;
    void getState()
      .then((candidate) => {
        if (cancelled) return;
        const parsed = parseDesktopCodexPluginState(candidate);
        if (!parsed) {
          setCodexError("The desktop host returned an invalid Codex plugin state.");
          return;
        }
        setCodexPlugin(parsed);
      })
      .catch(() => {
        if (!cancelled) {
          setCodexError("The desktop host could not verify the Codex plugin bundle.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [runtime.surface]);

  useEffect(() => {
    if (runtime.surface !== "desktop_native" || !developerControlsAvailable) return;
    const inspect = window.casimirDesktop?.getMinecraftRunProfile;
    if (!inspect) return;
    let cancelled = false;
    void inspect().then((candidate) => {
      if (cancelled) return;
      const parsed = parseDesktopMinecraftRunProfileState(candidate);
      if (parsed) setMinecraftRunProfile(parsed);
      else setMinecraftProfileError("The desktop host returned an invalid Minecraft profile state.");
    }).catch(() => {
      if (!cancelled) setMinecraftProfileError("The Minecraft profile could not be inspected.");
    });
    return () => { cancelled = true; };
  }, [developerControlsAvailable, runtime.surface]);

  useEffect(() => {
    if (runtime.surface !== "desktop_native" || !minecraftWorldControlsAvailable) return;
    let cancelled = false;
    const inspectIntegrated = window.casimirDesktop?.getMinecraftIntegratedWorld;
    if (inspectIntegrated) void inspectIntegrated().then((candidate) => {
      if (cancelled) return;
      const parsed = parseDesktopMinecraftIntegratedWorldState(candidate);
      if (parsed) setMinecraftIntegratedWorld(parsed);
      else setMinecraftProfileError("The desktop host returned an invalid integrated-world selection.");
    }).catch(() => {
      if (!cancelled) setMinecraftProfileError("The integrated-world selection could not be inspected.");
    });
    return () => { cancelled = true; };
  }, [minecraftWorldControlsAvailable, runtime.surface]);

  const runMinecraftProfileOperation = useCallback(async (
    operation: (() => Promise<unknown>) | undefined,
  ) => {
    if (!operation) return;
    setMinecraftProfileBusy(true);
    setMinecraftProfileError(null);
    try {
      const parsed = parseDesktopMinecraftRunProfileState(await operation());
      if (!parsed) throw new Error("invalid Minecraft profile state");
      setMinecraftRunProfile(parsed);
    } catch (caught) {
      setMinecraftProfileError(
        caught instanceof Error ? caught.message : "The Minecraft profile operation failed.",
      );
    } finally {
      setMinecraftProfileBusy(false);
    }
  }, []);

  const runIntegratedWorldOperation = useCallback(async (
    operation: (() => Promise<unknown>) | undefined,
  ) => {
    if (!operation) return;
    setMinecraftProfileBusy(true);
    setMinecraftProfileError(null);
    try {
      const parsed = parseDesktopMinecraftIntegratedWorldState(await operation());
      if (!parsed) throw new Error("invalid integrated-world selection");
      setMinecraftIntegratedWorld(parsed);
    } catch (caught) {
      setMinecraftProfileError(caught instanceof Error ? caught.message :
        "The integrated-world operation failed.");
    } finally {
      setMinecraftProfileBusy(false);
    }
  }, []);

  const refreshTransitionRequests = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(
        "/api/desktop/mcp-tunnel-transition/requests",
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal,
        },
      );
      const body = await response.json().catch(() => null) as
        | { requests?: unknown }
        | null;
      if (response.status === 401 || response.status === 403) {
        setTransitionConsentAvailable(false);
        setTransitionRequests([]);
        return;
      }
      if (!response.ok || !Array.isArray(body?.requests)) {
        setTransitionConsentAvailable(false);
        return;
      }
      const admitted = body.requests.filter((candidate): candidate is DesktopMcpTransitionRequest => {
        if (!candidate || typeof candidate !== "object") return false;
        const request = candidate as Partial<DesktopMcpTransitionRequest>;
        return request.schema === "helix.desktop_tunnel_transition.v1" &&
          typeof request.transition_request_ref === "string" &&
          typeof request.declared_task_summary === "string" &&
          typeof request.status === "string" &&
          request.credential_included === false &&
          request.private_endpoint_included === false &&
          request.assistant_answer === false &&
          request.terminal_eligible === false;
      });
      setTransitionRequests(admitted);
      setTransitionConsentAvailable(true);
      setTransitionError(null);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setTransitionError("Tunnel delegation requests could not be inspected.");
    }
  }, []);

  const refreshAll = useCallback(async () => {
    const operations: Promise<unknown>[] = [refresh(), refreshPersonalMcpP1()];
    if (developerControlsAvailable && runtime.surface === "desktop_native" && tunnel?.configured) {
      operations.push(refreshTransitionRequests());
    }
    await Promise.all(operations);
  }, [developerControlsAvailable, refresh, refreshPersonalMcpP1,
    refreshTransitionRequests, runtime.surface, tunnel?.configured]);

  useEffect(() => {
    if (!developerControlsAvailable || runtime.surface !== "desktop_native" || !tunnel?.configured) return;
    const controller = new AbortController();
    void refreshTransitionRequests(controller.signal);
    return () => controller.abort();
  }, [developerControlsAvailable, refreshTransitionRequests, runtime.surface, tunnel?.configured]);

  const decideTransitionRequest = useCallback(async (
    requestRef: string,
    decision: "delegate" | "revoke",
    requestedLeaseSeconds?: number,
  ) => {
    setTransitionBusyRef(requestRef);
    setTransitionError(null);
    try {
      const response = await fetch(
        `/api/desktop/mcp-tunnel-transition/requests/${encodeURIComponent(requestRef)}/${decision}`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(decision === "delegate"
            ? { lease_seconds: requestedLeaseSeconds }
            : {}),
        },
      );
      const body = await response.json().catch(() => null) as
        | { error?: unknown }
        | null;
      if (!response.ok) {
        throw new Error(typeof body?.error === "string"
          ? label(body.error)
          : "Tunnel delegation decision failed");
      }
      await refreshTransitionRequests();
    } catch (caught) {
      setTransitionError(
        caught instanceof Error ? caught.message : "Tunnel delegation decision failed.",
      );
    } finally {
      setTransitionBusyRef(null);
    }
  }, [refreshTransitionRequests]);

  useEffect(() => {
    if (runtime.surface !== "desktop_native") return;
    const bridge = window.casimirDesktop;
    refreshTunnelState(false);
    const removeListener = bridge?.onMcpTunnelState?.((candidate) => {
      const parsed = parseDesktopMcpTunnelState(candidate);
      if (parsed) {
        setTunnel(parsed);
        setTunnelError(null);
      }
      else setTunnelError("The desktop host returned an invalid tunnel state.");
    });
    return () => {
      tunnelReadGeneration.current += 1;
      removeListener?.();
    };
  }, [refreshTunnelState, runtime.surface]);

  const runTunnelOperation = useCallback(
    async (operation: () => Promise<unknown>) => {
      setTunnelBusy(true);
      setTunnelError(null);
      try {
        const candidate = await operation();
        const parsed = parseDesktopMcpTunnelState(candidate);
        if (!parsed) throw new Error("invalid tunnel state");
        setTunnel(parsed);
        return parsed;
      } catch (caught) {
        setTunnelError(
          caught instanceof Error ? caught.message : "The tunnel operation failed.",
        );
        return null;
      } finally {
        setTunnelBusy(false);
      }
    },
    [],
  );

  const configureTunnel = useCallback(async () => {
    const configure = window.casimirDesktop?.configureMcpTunnel;
    if (!configure) {
      setTunnelError("Secure credential storage is unavailable in this build.");
      return;
    }
    const state = await runTunnelOperation(() =>
      configure({ tunnelId, runtimeApiKey }),
    );
    if (state?.configured) {
      setTunnelId("");
      setRuntimeApiKey("");
    }
  }, [runTunnelOperation, runtimeApiKey, tunnelId]);

  const tunnelFailureMessage = tunnel?.failureCode
    ? tunnel.failureCode.split("_").map(label).join(" ")
    : null;
  const tunnelRecoveryMessage = tunnel?.recovery.phase === "scheduled"
    ? `Self-repair scheduled (${tunnel.recovery.attemptCount}/${tunnel.recovery.maxAttempts} attempts used)`
    : tunnel?.recovery.phase === "revalidating"
      ? "Self-repair is revalidating the exact account session"
      : tunnel?.recovery.phase === "restarting"
        ? `Self-repair is restoring read-only coordination (attempt ${tunnel.recovery.attemptCount}/${tunnel.recovery.maxAttempts})`
        : tunnel?.recovery.phase === "exhausted"
          ? `Self-repair stopped after ${tunnel.recovery.attemptCount}/${tunnel.recovery.maxAttempts} attempts${tunnel.recovery.lastReason ? ` · ${label(tunnel.recovery.lastReason)}` : ""}`
          : null;

  const openCodexPlugin = useCallback(async () => {
    const openPlugin = window.casimirDesktop?.openCodexPlugin;
    if (
      !openPlugin ||
      codexPlugin?.status !== "ready" ||
      !runtime.capabilities.codexMcpRegistration
    ) {
      setCodexError("Codex plugin installation is unavailable in this build.");
      return;
    }
    setCodexOpening(true);
    setCodexError(null);
    try {
      await openPlugin();
    } catch {
      setCodexError("Codex could not open the plugin installation surface.");
    } finally {
      setCodexOpening(false);
    }
  }, [codexPlugin, runtime.capabilities.codexMcpRegistration]);

  return (
    <section className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-100" data-testid="device-check-panel">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-lg border border-cyan-400/25 bg-cyan-400/10 p-2 text-cyan-200">
            <RadioTower className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">Device Check</h1>
            <p className="text-xs text-slate-400">
              Read-only connector identity, freshness, and probe readiness
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refreshAll()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 hover:border-cyan-400/50 hover:text-white disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
          Refresh
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
          <span>{devices.length} paired device{devices.length === 1 ? "" : "s"}</span>
          {refreshedAt ? (
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              Updated {new Date(refreshedAt).toLocaleTimeString()}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1 text-cyan-200/80">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            No credentials projected
          </span>
          <span data-testid="device-check-runtime-surface">
            {runtime.surface === "desktop_native"
              ? "Desktop service"
              : runtime.surface === "pwa"
                ? "Installed web app"
                : "Web service"}
          </span>
        </div>

        {runtime.surface === "desktop_native" && personalControlsAvailable ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3"
            data-testid="device-check-personal-harness">
            <div>
              <p className="text-sm font-medium text-cyan-100">Personal Full Harness</p>
              <p className="mt-1 text-xs text-slate-400" role="status">
                {personalMcpP1Available
                  ? "Local Codex setup is available for this installation. Account and device approval are checked separately."
                  : personalMcpP1UnavailableMessage(personalMcpP1Phase) ??
                    "Local Codex setup is unavailable."}
              </p>
            </div>
            {personalMcpP1Available ? <button type="button"
              onClick={() => useWorkstationLayoutStore.getState().openPanelInActiveGroup("account-session")}
              className="inline-flex items-center gap-2 rounded border border-cyan-400/30 px-3 py-2 text-xs font-medium text-cyan-100 hover:bg-cyan-400/10">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              Set up Full Harness
            </button> : null}
          </div>
        ) : null}

        {runtime.surface === "desktop_native" ? (
          <div
            className="mb-4 rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3"
            data-testid="device-check-mcp-tunnel"
            data-helix-guidance-target="device-check-mcp-tunnel"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-2xl">
                <p className="text-sm font-medium text-emerald-100">
                  Local Desktop MCP tunnel
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  {developerControlsAvailable
                    ? "Outbound-only developer connection to OpenAI Secure MCP Tunnel. Read-only Device Check and local-supervisor coordination remain the automatic default. Starting Full Harness grants a finite developer-session tunnel scope; OAuth, room, capability, and environment authority remain separate. Automatic recovery restores read-only only."
                    : tunnel?.configured
                      ? "This saved read-only tunnel is separate from the personal Full Harness connection above. It can be started, stopped, or forgotten here."
                      : "The private tunnel is not required for ordinary Full Harness. Personal local-connection status is shown above."}
                </p>
                {!developerControlsAvailable && !tunnel?.configured ? (
                  <button type="button" className="mt-2 rounded-md border border-cyan-400/30 px-3 py-2 text-xs text-cyan-100"
                    onClick={() => useWorkstationLayoutStore.getState().openPanelInActiveGroup("account-session")}>Open Account &amp; Sessions</button>
                ) : null}
                <p className="mt-2 text-xs text-slate-300" data-testid="device-check-tunnel-status">
                  {tunnel?.failureCode === "control_plane_auth_invalidated" ? "Tunnel status" : "Local tunnel status"}: <span className="font-medium text-emerald-200">{tunnel ? label(tunnel.status) : "Inspecting"}</span>
                   {tunnel?.binaryVersion ? ` · tunnel-client ${tunnel.binaryVersion}` : ""}
                   {tunnel ? ` · ${tunnel.scope === "full_helix_agent" ? "Full developer MCP" : "Read-only coordination"}` : ""}
                  {tunnelFailureMessage ? ` · ${tunnelFailureMessage}` : ""}
                </p>
                {tunnel?.failureCode === "control_plane_auth_invalidated" ? (
                  <p className="mt-1 text-xs text-rose-200" role="alert" data-testid="device-check-tunnel-control-plane-failure">
                    {developerControlsAvailable
                      ? "The local tunnel endpoints are responding, but repeated remote control-plane polls rejected its runtime key. Remote MCP is unavailable. Obtain a replacement restricted key for the same tunnel ID, then stop, clear, save, and start the tunnel. Confirm a fresh authenticated check-in from the intended AI task afterward."
                      : "The local tunnel endpoints are responding, but remote polls rejected this account's runtime key. Stop the tunnel and contact support to restore enrollment."}
                  </p>
                ) : null}
                {tunnel?.ready ? (
                  <p className="mt-1 text-xs text-amber-200" data-testid="device-check-tunnel-remote-verification">
                    Remote MCP is not checked here. See Agent Access for a fresh exact-task check-in.
                  </p>
                ) : null}
                {tunnelRecoveryMessage ? (
                  <p
                    className={tunnel?.recovery.manualInterventionRequired
                      ? "mt-1 text-xs text-amber-200"
                      : "mt-1 text-xs text-cyan-200"}
                    data-testid="device-check-tunnel-recovery"
                  >
                    {tunnelRecoveryMessage}. Automatic recovery never restores full MCP authority.
                  </p>
                ) : null}
              </div>
              {developerControlsAvailable && tunnel?.adminUiAvailable ? (
                <button
                  type="button"
                  disabled={tunnelBusy || !tunnel.adminUiAvailable}
                  onClick={() => {
                    const open = window.casimirDesktop?.openMcpTunnelAdmin;
                    if (open) void runTunnelOperation(open);
                  }}
                  className="inline-flex items-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-medium text-emerald-100 disabled:opacity-50"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  Tunnel console
                </button>
              ) : null}
            </div>

            {developerControlsAvailable && tunnel && !tunnel.configured ? (
              <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                <input
                  value={tunnelId}
                  onChange={(event) => setTunnelId(event.target.value)}
                  placeholder="tunnel_…"
                  aria-label="OpenAI tunnel ID"
                  autoComplete="off"
                  disabled={tunnelBusy || !tunnel.vaultAvailable}
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-emerald-400/50"
                />
                <input
                  value={runtimeApiKey}
                  onChange={(event) => setRuntimeApiKey(event.target.value)}
                  placeholder="Restricted runtime API key"
                  aria-label="OpenAI runtime API key"
                  type="password"
                  autoComplete="new-password"
                  disabled={tunnelBusy || !tunnel.vaultAvailable}
                  className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-emerald-400/50"
                />
                <button
                  type="button"
                  onClick={() => void configureTunnel()}
                  disabled={tunnelBusy || !tunnel.vaultAvailable || !tunnelId || !runtimeApiKey}
                  className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-medium text-emerald-100 disabled:opacity-50"
                >
                  Save securely
                </button>
              </div>
            ) : null}

            {tunnel?.configured ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {!tunnel.processRunning ? (
                  <>
                    <button
                      type="button"
                      disabled={tunnelBusy}
                      onClick={() => {
                        const start = window.casimirDesktop?.startMcpTunnel;
                        if (start) void runTunnelOperation(() => start({ scope: "local_supervisor_coordination_and_device_check" }));
                      }}
                      className="inline-flex items-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-medium text-emerald-100 disabled:opacity-50"
                    >
                      <Play className="h-3.5 w-3.5" aria-hidden="true" />
                      Start read-only tunnel
                    </button>
                    {developerControlsAvailable ? <button
                      type="button"
                      disabled={tunnelBusy}
                      onClick={() => {
                        const start = window.casimirDesktop?.startMcpTunnel;
                        if (start) void runTunnelOperation(() => start({ scope: "full_helix_agent" }));
                      }}
                      className="inline-flex items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-medium text-cyan-100 disabled:opacity-50"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      Start full developer MCP
                    </button> : null}
                  </>
                ) : (
                  <>
                    {developerControlsAvailable && tunnel.scope === "local_supervisor_coordination_and_device_check" ? (
                      <button
                        type="button"
                        disabled={tunnelBusy}
                        onClick={() => {
                          const start = window.casimirDesktop?.startMcpTunnel;
                          if (start) void runTunnelOperation(() => start({ scope: "full_helix_agent" }));
                        }}
                        className="inline-flex items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-medium text-cyan-100 disabled:opacity-50"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        Enable full harness for this session
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={tunnelBusy}
                      onClick={() => {
                        const stop = window.casimirDesktop?.stopMcpTunnel;
                        if (stop) void runTunnelOperation(stop);
                      }}
                      className="inline-flex items-center gap-2 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-medium text-amber-100 disabled:opacity-50"
                    >
                      <Square className="h-3.5 w-3.5" aria-hidden="true" />
                      Stop tunnel
                    </button>
                  </>
                )}
                <button
                  type="button"
                  disabled={tunnelBusy || tunnel.processRunning}
                  onClick={() => {
                    const clear = window.casimirDesktop?.clearMcpTunnel;
                    if (clear) void runTunnelOperation(clear);
                  }}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-300 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Forget credentials
                </button>
              </div>
            ) : null}
            {developerControlsAvailable && transitionConsentAvailable ? (
              <div
                className="mt-3 rounded-md border border-cyan-400/20 bg-cyan-400/5 p-3"
                data-testid="device-check-tunnel-transition-consent"
              >
                <p className="text-xs font-medium text-cyan-100">
                  Agent-requested tunnel delegations
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  Each grant lasts for the short lease requested below and permits only the native tunnel transport to switch modes. It does not grant room, environment, brokerage, trading, or answer authority. Current private-pilot identity binds the native tunnel client plus a server-derived conversation continuation; independent external-client cryptographic binding remains a release gate.
                </p>
                {transitionRequests.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    No agent has requested a delegation from the read-only MCP surface.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {transitionRequests.map((request) => {
                      const canDelegate = request.status === "pending_user_delegation";
                      const canRevoke = [
                        "delegated",
                        "transition_accepted",
                        "active",
                      ].includes(request.status);
                      return (
                        <div
                          key={request.transition_request_ref}
                          className="rounded border border-slate-700 bg-slate-950/60 p-2"
                        >
                          <p className="text-xs text-slate-200">
                            {request.declared_task_summary}
                          </p>
                          <p className="mt-1 font-mono text-[11px] text-slate-500">
                            {label(request.status)} · {request.client_session_ref}
                          </p>
                          {canDelegate || canRevoke ? (
                            <div className="mt-2 flex gap-2">
                              {canDelegate ? (
                                <button
                                  type="button"
                                  disabled={transitionBusyRef === request.transition_request_ref}
                                  onClick={() => void decideTransitionRequest(
                                    request.transition_request_ref,
                                    "delegate",
                                    request.requested_lease_seconds,
                                  )}
                                  className="rounded border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-xs text-cyan-100 disabled:opacity-50"
                                >
                                  Grant {request.requested_lease_seconds}-second tunnel lease
                                </button>
                              ) : null}
                              {canRevoke ? (
                                <button
                                  type="button"
                                  disabled={transitionBusyRef === request.transition_request_ref}
                                  onClick={() => void decideTransitionRequest(
                                    request.transition_request_ref,
                                    "revoke",
                                  )}
                                  className="rounded border border-rose-400/30 bg-rose-400/10 px-2 py-1 text-xs text-rose-100 disabled:opacity-50"
                                >
                                  Revoke and return read-only
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
                {transitionError ? (
                  <p className="mt-2 text-xs text-rose-200" role="alert">
                    {transitionError}
                  </p>
                ) : null}
              </div>
            ) : null}
            {tunnelError ? <p className="mt-2 text-xs text-rose-200" role="alert">{tunnelError}</p> : null}
          </div>
        ) : null}

        {runtime.surface === "desktop_native" && minecraftWorldControlsAvailable ? (
          <div
            className="mb-4 rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3"
            data-testid="device-check-minecraft-run-profile"
            data-helix-guidance-target="device-check-minecraft-run-profile"
          >
            <p className="text-sm font-medium text-cyan-100">Local Minecraft profile</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Select an integrated single-player world hosted through Minecraft. The native folder picker keeps the choice with this signed-in profile; selecting a world does not start the game or grant Minecraft actions.
            </p>
            <p className="mt-2 break-all font-mono text-[11px] text-slate-300">
              {minecraftIntegratedWorld?.configured
                ? `Integrated world: ${minecraftIntegratedWorld.worldFolder} · ${minecraftIntegratedWorld.gameDirectory}`
                : "No integrated world selected"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              When an integrated world is selected, local sensor pairing targets that world’s Fabric game directory. Dedicated-server launch settings remain separate.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={minecraftProfileBusy}
                onClick={() => void runIntegratedWorldOperation(
                  window.casimirDesktop?.selectMinecraftIntegratedWorld,
                )}
                className="inline-flex items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-medium text-cyan-100 disabled:opacity-50">
                <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                {minecraftIntegratedWorld?.configured ? "Change integrated world" : "Select integrated world"}
              </button>
              {minecraftIntegratedWorld?.configured ? <button type="button"
                disabled={minecraftProfileBusy}
                onClick={() => void runIntegratedWorldOperation(
                  window.casimirDesktop?.clearMinecraftIntegratedWorld,
                )}
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 disabled:opacity-50">
                Forget integrated world
              </button> : null}
            </div>
            {developerControlsAvailable ? <><p className="mt-2 break-all font-mono text-[11px] text-slate-300">
              {minecraftRunProfile?.configured
                ? `Server: ${minecraftRunProfile.label} · ${minecraftRunProfile.runDirectory}`
                : "No local Minecraft server profile selected"}
            </p>
            <p className="mt-1 break-all font-mono text-[11px] text-slate-300">
              {minecraftRunProfile?.playerGameDirectory
                ? `Player: ${minecraftRunProfile.playerGameDirectory}`
                : "No local Minecraft player profile selected"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={minecraftProfileBusy}
                onClick={() => void runMinecraftProfileOperation(
                  window.casimirDesktop?.selectMinecraftRunProfile,
                )}
                className="inline-flex items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-medium text-cyan-100 disabled:opacity-50"
              >
                <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                {minecraftRunProfile?.configured ? "Change server folder" : "Select server folder"}
              </button>
              <button
                type="button"
                disabled={minecraftProfileBusy || !minecraftRunProfile?.configured}
                onClick={() => void runMinecraftProfileOperation(
                  window.casimirDesktop?.selectMinecraftPlayerProfile,
                )}
                className="inline-flex items-center gap-2 rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-medium text-cyan-100 disabled:opacity-50"
              >
                <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                {minecraftRunProfile?.playerGameDirectory
                  ? "Change player folder"
                  : "Select player folder"}
              </button>
              {minecraftRunProfile?.configured ? (
                <button
                  type="button"
                  disabled={minecraftProfileBusy}
                  onClick={() => void runMinecraftProfileOperation(
                    window.casimirDesktop?.clearMinecraftRunProfile,
                  )}
                  className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300 disabled:opacity-50"
                >
                  Forget selection
                </button>
              ) : null}
            </div></> : null}
            {minecraftProfileError ? (
              <p className="mt-2 text-xs text-rose-200" role="alert">{minecraftProfileError}</p>
            ) : null}
          </div>
        ) : null}

        {runtime.surface === "desktop_native" ? (
          <div
            className="mb-4 rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3"
            data-testid="device-check-codex-integration"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-2xl">
                <p className="text-sm font-medium text-cyan-100">
                  Public Codex plugin (release path)
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  {codexPlugin?.status === "ready"
                    ? "Open the integrity-checked plugin in Codex, then approve installation and OAuth. CasimirBot does not copy credentials or edit Codex configuration."
                    : codexPlugin?.blockedReason === "production_oauth_unverified"
                      ? "The plugin is packaged and integrity checked, but production OAuth discovery is not verified. Installation stays locked in this build."
                      : "The desktop host is verifying the packaged Codex integration. Installation fails closed until that check completes."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void openCodexPlugin()}
                disabled={
                  codexOpening ||
                  codexPlugin?.status !== "ready" ||
                  !runtime.capabilities.codexMcpRegistration
                }
                className="rounded-md border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-xs font-medium text-cyan-100 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-900 disabled:text-slate-500"
              >
                {codexOpening ? "Opening Codex…" : "Open in Codex"}
              </button>
            </div>
            {codexError ? (
              <p className="mt-2 text-xs text-rose-200" role="alert">
                {codexError}
              </p>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-100" role="alert">
            {error}
          </div>
        ) : null}

        {!error && loading && devices.length === 0 ? (
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-6 text-center text-sm text-slate-400">
            Checking paired devices…
          </div>
        ) : null}

        {!error && !loading && devices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/30 p-8 text-center">
            <RadioTower className="mx-auto mb-3 h-8 w-8 text-slate-500" aria-hidden="true" />
            <p className="text-sm font-medium text-slate-200">No paired devices</p>
            <p className="mt-1 text-xs text-slate-500">
              Pair an environment connector from a Shared Live Room to populate Device Check.
            </p>
          </div>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-2">
          {devices.map((device) => {
            const StatusIcon = statusIcon(device.health);
            return (
              <article
                key={`${device.device_id}:${device.environment_binding_id ?? "unbound"}`}
                className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm"
                data-testid={`device-check-card-${device.device_id}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-100">{device.package_id}</p>
                    <p className="mt-1 truncate font-mono text-[11px] text-slate-500">{device.device_id}</p>
                  </div>
                  <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass[device.health]}`}>
                    <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {label(device.health)}
                  </div>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                  <div>
                    <dt className="text-slate-500">Last contact</dt>
                    <dd className="mt-0.5 text-slate-200">{formatAge(device.last_contact_age_ms)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Probe lane</dt>
                    <dd className={`mt-0.5 ${device.probe_ready ? "text-emerald-300" : "text-amber-300"}`}>
                      {device.probe_ready ? "Ready" : "Blocked"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Room</dt>
                    <dd className="mt-0.5 truncate text-slate-200">{device.room_id ?? "Unbound"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">World</dt>
                    <dd className="mt-0.5 truncate text-slate-200">{device.world_id ?? "Unbound"}</dd>
                  </div>
                </dl>

                {device.capability_ids.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {device.capability_ids.slice(0, 6).map((capability) => (
                      <span key={capability} className="max-w-full truncate rounded border border-slate-700 bg-slate-950/70 px-2 py-1 font-mono text-[10px] text-slate-300">
                        {capability}
                      </span>
                    ))}
                    {device.capability_ids.length > 6 ? (
                      <span className="rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-400">
                        +{device.capability_ids.length - 6}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {device.blocking_reasons.length > 0 ? (
                  <div className="mt-4 rounded-md border border-amber-400/20 bg-amber-400/5 p-2.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-amber-200">Readiness blockers</p>
                    <ul className="mt-1.5 space-y-1 text-xs text-amber-100/80">
                      {device.blocking_reasons.map((reason) => (
                        <li key={reason}>{label(reason)}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
