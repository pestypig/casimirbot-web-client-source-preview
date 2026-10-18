import React, { useCallback, useEffect, useState } from "react";
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
import { useRuntimeSurface } from "@/lib/runtime/RuntimeSurfaceProvider";
import { useWorkstationLayoutStore } from "@/store/useWorkstationLayoutStore";
import {
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,
  readCachedAccountCapabilityPolicy,
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

export default function DeviceCheckPanel() {
  const runtime = useRuntimeSurface();
  const [accountPolicy, setAccountPolicy] = useState<HelixAccountCapabilityPolicy | null>(
    () => readCachedAccountCapabilityPolicy(),
  );
  const developerControlsAvailable = accountPolicy?.account_type === "developer";
  const [devices, setDevices] = useState<HelixEnvironmentDeviceCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [codexPlugin, setCodexPlugin] =
    useState<DesktopCodexPluginState | null>(null);
  const [codexOpening, setCodexOpening] = useState(false);
  const [codexError, setCodexError] = useState<string | null>(null);
  const [tunnel, setTunnel] = useState<DesktopMcpTunnelState | null>(null);
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
  const [minecraftProfileBusy, setMinecraftProfileBusy] = useState(false);
  const [minecraftProfileError, setMinecraftProfileError] = useState<string | null>(null);

  useEffect(() => {
    const onPolicyChange = (event: Event) => {
      const policy = (event as CustomEvent<{
        account_policy?: HelixAccountCapabilityPolicy | null;
      }>).detail?.account_policy;
      setAccountPolicy(policy ?? readCachedAccountCapabilityPolicy());
    };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, onPolicyChange);
    return () => window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, onPolicyChange);
  }, []);

  useEffect(() => {
    if (developerControlsAvailable) return;
    setMinecraftRunProfile(null);
    setTransitionRequests([]);
    setTransitionConsentAvailable(false);
    setRuntimeApiKey("");
  }, [developerControlsAvailable]);

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
    const operations: Promise<unknown>[] = [refresh()];
    if (developerControlsAvailable && runtime.surface === "desktop_native" && tunnel?.configured) {
      operations.push(refreshTransitionRequests());
    }
    await Promise.all(operations);
  }, [developerControlsAvailable, refresh, refreshTransitionRequests, runtime.surface, tunnel?.configured]);

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
    if (!bridge?.getMcpTunnelState) {
      setTunnelError("This desktop build does not include Secure MCP Tunnel support.");
      return;
    }
    let cancelled = false;
    const accept = (candidate: unknown) => {
      if (cancelled) return;
      const parsed = parseDesktopMcpTunnelState(candidate);
      if (!parsed) {
        setTunnelError("The desktop host returned an invalid tunnel state.");
        return;
      }
      setTunnel(parsed);
    };
    void bridge.getMcpTunnelState().then(accept).catch(() => {
      if (!cancelled) setTunnelError("The desktop host could not inspect the tunnel runtime.");
    });
    const removeListener = bridge.onMcpTunnelState?.(accept);
    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [runtime.surface]);

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
      ? "Self-repair is revalidating the exact developer session"
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

        {runtime.surface === "desktop_native" ? (
          <div
            className="mb-4 rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3"
            data-testid="device-check-mcp-tunnel"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-2xl">
                <p className="text-sm font-medium text-emerald-100">
                  Local Desktop MCP tunnel
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  {developerControlsAvailable
                    ? "Outbound-only developer connection to OpenAI Secure MCP Tunnel. Read-only Device Check and local-supervisor coordination remain the automatic default. Starting Full Harness grants a finite developer-session tunnel scope; OAuth, room, capability, and environment authority remain separate. Automatic recovery restores read-only only."
                    : "Read-only connector and local tunnel status. Open Account & Sessions to sign in or activate local developer access. Tunnel controls appear after that access is active."}
                </p>
                {!developerControlsAvailable ? (
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
                    The local tunnel endpoints are responding, but repeated remote control-plane polls rejected its runtime key. Remote MCP is unavailable. Obtain a replacement restricted key for the same tunnel ID, then stop, clear, save, and start the tunnel. Confirm a fresh authenticated check-in from the intended AI task afterward.
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

            {developerControlsAvailable && tunnel?.configured ? (
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
                      Start full developer MCP
                    </button>
                  </>
                ) : (
                  <>
                    {tunnel.scope === "local_supervisor_coordination_and_device_check" ? (
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

        {runtime.surface === "desktop_native" && developerControlsAvailable ? (
          <div
            className="mb-4 rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3"
            data-testid="device-check-minecraft-run-profile"
          >
            <p className="text-sm font-medium text-cyan-100">Local Minecraft profile</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              Select both the dedicated Fabric server folder and the Fabric client game directory once for this Casimir profile. Opaque pairing then reaches each exact local inbox without exposing a pairing code or letting an agent choose a filesystem path.
            </p>
            <p className="mt-2 break-all font-mono text-[11px] text-slate-300">
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
            </div>
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
