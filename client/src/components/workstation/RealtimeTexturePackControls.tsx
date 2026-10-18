import React, { useEffect, useRef, useState } from "react";
import type { HelixAccountCapabilityPolicy } from "@shared/helix-account-session";
import {
  REALTIME_TEXTURE_PACK_BASELINE_FPS,
  REALTIME_TEXTURE_PACK_BASELINE_HEIGHT,
  REALTIME_TEXTURE_PACK_BASELINE_WIDTH,
  REALTIME_TEXTURE_PACK_PRESETS,
  buildRealtimeTexturePackPrompt,
  parseRealtimeTexturePackProjectionFrame,
  buildRealtimeTexturePackSessionState,
  type RealtimeTexturePackConfigV1,
  type RealtimeTexturePackPresetId,
  type RealtimeTexturePackProjectionFrameV1,
  type RealtimeTexturePackSessionStateV1,
} from "@shared/realtime-texture-pack";
import {
  REALTIME_TEXTURE_PACK_HARNESS_ACTIONS,
  REALTIME_TEXTURE_PACK_VISUAL_DIRECTION_COMMANDS,
  isRealtimeTexturePackVisualDirectionCommand,
  type RealtimeTexturePackHarnessAction,
  type RealtimeTexturePackHarnessCommand,
  type RealtimeTexturePackHarnessVisualDirectionState,
  type RealtimeTexturePackVisualDirectionCommandKind,
} from "@shared/realtime-texture-pack-harness";
import {
  createRealtimeTexturePackPreviewController,
  type RealtimeTexturePackPreviewController,
} from "@/lib/helix/realtimeTexturePack";
import {
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,
  fetchAccountCapabilityPolicy,
  readCachedAccountCapabilityPolicy,
} from "@/lib/workstation/accountCapabilityPolicy";

const RTP_FAL_PROVIDER_ID = "fal_flux2_klein_realtime" as const;
const RTP_FAL_APPROVAL_VERSION = "rtp-fal-attended-v1" as const;

type FalReadiness = {
  runtime_enabled: boolean;
  credential_configured: boolean;
  sdk_available: boolean;
  ready_for_attended_arm: boolean;
  missing_requirements: string[];
  duration_cap_seconds: 60;
  request_cap: 60;
  spend_cap_usd: 1;
  published_compute_rate_usd: number;
};

type FalSessionProjection = {
  session_id: string;
  status: "armed" | "active" | "completed" | "cancelled" | "expired";
  requests_started: number;
  requests_accepted: number;
  requests_failed: number;
  request_cap: 60;
  spend_cap_usd: 1;
  estimated_cost_usd: number;
  in_flight: boolean;
  cancellation_acknowledged: boolean;
  cancellation_reason: string | null;
};

export default function RealtimeTexturePackControls() {
  const [accountPolicy, setAccountPolicy] = useState<HelixAccountCapabilityPolicy | null>(() =>
    readCachedAccountCapabilityPolicy(),
  );
  const [presetId, setPresetId] = useState<RealtimeTexturePackPresetId>("playable");
  const [customPrompt, setCustomPrompt] = useState("");
  const [providerChoice, setProviderChoice] = useState<"local_passthrough" | typeof RTP_FAL_PROVIDER_ID>("local_passthrough");
  const [falReadiness, setFalReadiness] = useState<FalReadiness | null>(null);
  const [falSession, setFalSession] = useState<FalSessionProjection | null>(null);
  const [falEgressAcknowledged, setFalEgressAcknowledged] = useState(false);
  const [falBillingAcknowledged, setFalBillingAcknowledged] = useState(false);
  const [falStatus, setFalStatus] = useState("Provider readiness not checked");
  const [falBusy, setFalBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [projection, setProjection] = useState<RealtimeTexturePackProjectionFrameV1 | null>(null);
  const [sessionState, setSessionState] = useState<RealtimeTexturePackSessionStateV1>(() =>
    buildRealtimeTexturePackSessionState({ sessionId: "texture-session:unstarted" }),
  );
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [overlayFailure, setOverlayFailure] = useState<string | null>(null);
  const [agentHarnessEnabled, setAgentHarnessEnabled] = useState(false);
  const [agentAllowedActions, setAgentAllowedActions] = useState<RealtimeTexturePackHarnessAction[]>(
    () => [...REALTIME_TEXTURE_PACK_HARNESS_ACTIONS],
  );
  const [agentHarnessStatus, setAgentHarnessStatus] = useState("Off — user control only");
  const [visualDirectionControlEnabled, setVisualDirectionControlEnabled] = useState(false);
  const [visualDirection, setVisualDirection] = useState<RealtimeTexturePackHarnessVisualDirectionState>({
    control_enabled: false,
    mode: "static_prompt_only",
    preset_id: "playable",
    configuration_revision: 0,
    pinned: false,
    enabled_cue_families: ["dimension", "biome", "time", "weather", "activity", "hazards"],
    selected_targets: ["overlay"],
    source_binding_id: null,
    source_binding_revision: null,
    environment_binding_id: null,
    compatibility_state: "disconnected",
    cue_packet_id: null,
    prompt_revision_id: null,
    visual_treatment_revision_id: null,
    cue_state: "static_fallback",
    fallback_reason: "No compatible environment binding is attached.",
  });
  const mountedRef = useRef(true);
  const controllerRef = useRef<RealtimeTexturePackPreviewController | null>(null);
  const configRef = useRef<RealtimeTexturePackConfigV1 | null>(null);
  const overlayVisibleRef = useRef(false);
  const handledCommandsRef = useRef(new Set<string>());
  const visualDirectionRef = useRef(visualDirection);
  const directionValuesRef = useRef({ presetId, customPrompt });
  const ownerDirectionRef = useRef({ presetId, customPrompt });
  const falSessionRef = useRef<FalSessionProjection | null>(null);

  const publishVisualDirection = (
    next: RealtimeTexturePackHarnessVisualDirectionState,
  ) => {
    visualDirectionRef.current = next;
    setVisualDirection(next);
    return next;
  };

  const postHarness = async (path: string, body: Record<string, unknown>) => {
    const response = await fetch(`/api/agi/realtime-texture-pack/harness/${path}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : `harness_${path}_failed`);
    return payload;
  };

  const callFalProvider = async (
    path: string,
    options: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {},
  ) => {
    const response = await fetch(`/api/agi/realtime-texture-pack/fal/${path}`, {
      method: options.method ?? "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : `fal_${path.replaceAll("/", "_")}_failed`);
    return payload;
  };

  const publishFalSession = (session: FalSessionProjection | null) => {
    falSessionRef.current = session;
    setFalSession(session);
  };

  if (!controllerRef.current) {
    controllerRef.current = createRealtimeTexturePackPreviewController({
      transformRemote: async (request, providerId) => {
        if (providerId !== RTP_FAL_PROVIDER_ID || falSessionRef.current?.session_id !== request.session_id) {
          throw new Error("attended_fal_session_not_armed");
        }
        const payload = await callFalProvider("transform", {
          method: "POST",
          body: { request },
        });
        const frame = parseRealtimeTexturePackProjectionFrame(
          payload.frame as RealtimeTexturePackProjectionFrameV1,
        );
        const session = payload.session as FalSessionProjection;
        publishFalSession(session);
        return frame;
      },
      onState: (state) => {
        if (mountedRef.current) {
          setSessionState(state);
          if (!state.capture_active && overlayVisibleRef.current) {
            overlayVisibleRef.current = false;
            setOverlayVisible(false);
            void window.casimirDesktop?.stopRealtimeTexturePackOverlay?.();
          }
          if (!state.capture_active && configRef.current?.session_id) {
            setAgentHarnessEnabled(false);
            setVisualDirectionControlEnabled(false);
            setAgentHarnessStatus("Off — capture inactive");
            void postHarness("lease", {
              operation: "disable",
              session_id: configRef.current.session_id,
            }).catch(() => undefined);
          }
          if (!state.capture_active && falSessionRef.current) {
            const providerSessionId = falSessionRef.current.session_id;
            publishFalSession(null);
            void callFalProvider("session/stop", {
              method: "POST",
              body: { session_id: providerSessionId, reason: "capture_inactive" },
            }).catch(() => undefined);
          }
        }
      },
      onConfig: (config) => {
        configRef.current = config;
      },
      onFrame: (frame) => {
        if (mountedRef.current) setProjection(frame);
        if (overlayVisibleRef.current) {
          void window.casimirDesktop?.updateRealtimeTexturePackFrame?.(frame)
            .then((candidate) => {
              if (
                mountedRef.current &&
                candidate &&
                typeof candidate === "object" &&
                "overlay_visible" in candidate &&
                candidate.overlay_visible === false
              ) {
                overlayVisibleRef.current = false;
                setOverlayVisible(false);
              }
            })
            .catch((error) => {
              if (mountedRef.current) {
                setOverlayFailure(error instanceof Error ? error.message : "overlay_frame_failed");
              }
            });
        }
      },
    });
  }

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void fetchAccountCapabilityPolicy()
        .then((policy) => {
          if (!cancelled) setAccountPolicy(policy);
        })
        .catch(() => {
          if (!cancelled) setAccountPolicy(readCachedAccountCapabilityPolicy());
        });
    };
    refresh();
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, refresh);
    };
  }, []);

  useEffect(() => () => {
    mountedRef.current = false;
    const sessionId = configRef.current?.session_id;
    if (sessionId) void postHarness("lease", { operation: "disable", session_id: sessionId }).catch(() => undefined);
    const providerSessionId = falSessionRef.current?.session_id;
    if (providerSessionId) {
      void callFalProvider("session/stop", {
        method: "POST",
        body: { session_id: providerSessionId, reason: "panel_unmounted" },
      }).catch(() => undefined);
    }
    controllerRef.current?.stop("panel_unmounted");
    void window.casimirDesktop?.stopRealtimeTexturePackOverlay?.();
  }, []);

  const isDeveloper = accountPolicy?.account_type === "developer";
  const captureActive = sessionState.capture_active;
  const nativeOverlayAvailable =
    typeof window.casimirDesktop?.showRealtimeTexturePackOverlay === "function" &&
    typeof window.casimirDesktop?.updateRealtimeTexturePackFrame === "function" &&
    typeof window.casimirDesktop?.revealRealtimeTexturePackOriginal === "function";

  const stopFalSession = async (reason: string) => {
    const session = falSessionRef.current;
    if (!session) return;
    publishFalSession(null);
    controllerRef.current?.updateProvider("local_passthrough");
    try {
      const payload = await callFalProvider("session/stop", {
        method: "POST",
        body: { session_id: session.session_id, reason },
      });
      if (payload.session) publishFalSession(payload.session as FalSessionProjection);
      setFalStatus("Provider session stopped");
    } catch (error) {
      setFalStatus(`Provider stop failed: ${error instanceof Error ? error.message : "unknown"}`);
    }
  };

  useEffect(() => {
    if (!isDeveloper) return;
    let cancelled = false;
    void callFalProvider("readiness")
      .then((payload) => {
        if (cancelled) return;
        const readiness = payload.readiness as FalReadiness;
        setFalReadiness(readiness);
        setFalStatus(readiness.ready_for_attended_arm
          ? "Ready for manual attended arm"
          : `Unavailable: ${readiness.missing_requirements.join(", ") || "requirements missing"}`);
      })
      .catch((error) => {
        if (!cancelled) setFalStatus(`Readiness unavailable: ${error instanceof Error ? error.message : "unknown"}`);
      });
    return () => { cancelled = true; };
  }, [isDeveloper]);

  useEffect(() => {
    if (!accountPolicy || isDeveloper) return;
    const sessionId = configRef.current?.session_id;
    if (sessionId) {
      void postHarness("lease", { operation: "disable", session_id: sessionId }).catch(() => undefined);
    }
    setAgentHarnessEnabled(false);
    setVisualDirectionControlEnabled(false);
    publishVisualDirection({ ...visualDirectionRef.current, control_enabled: false });
    controllerRef.current?.stop("developer_policy_lost");
    configRef.current = null;
    overlayVisibleRef.current = false;
    setOverlayVisible(false);
    void window.casimirDesktop?.stopRealtimeTexturePackOverlay?.();
  }, [accountPolicy, isDeveloper]);

  const handleStart = async () => {
    if (!isDeveloper || busy) return;
    setBusy(true);
    setProjection(null);
    configRef.current = null;
    setOverlayFailure(null);
    ownerDirectionRef.current = { presetId, customPrompt };
    directionValuesRef.current = { presetId, customPrompt };
    publishVisualDirection({
      ...visualDirectionRef.current,
      control_enabled: false,
      preset_id: presetId,
      configuration_revision: 0,
      pinned: false,
    });
    try {
      await controllerRef.current?.start({ presetId, customPrompt });
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const handleArmFal = async () => {
    const config = configRef.current;
    if (
      !config || !captureActive || providerChoice !== RTP_FAL_PROVIDER_ID ||
      !falReadiness?.ready_for_attended_arm || !falEgressAcknowledged ||
      !falBillingAcknowledged || falBusy
    ) return;
    setFalBusy(true);
    setFalStatus("Arming attended provider session…");
    try {
      const payload = await callFalProvider("session/arm", {
        method: "POST",
        body: {
          session_id: config.session_id,
          provider_id: RTP_FAL_PROVIDER_ID,
          approval_version: RTP_FAL_APPROVAL_VERSION,
          duration_cap_seconds: 60,
          request_cap: 60,
          spend_cap_usd: 1,
          external_frame_egress_acknowledged: true,
          billable_calls_acknowledged: true,
        },
      });
      const session = payload.session as FalSessionProjection;
      publishFalSession(session);
      controllerRef.current?.updateProvider(RTP_FAL_PROVIDER_ID);
      setFalStatus("Armed — maximum 60 seconds, 60 requests, USD $1.00");
    } catch (error) {
      setFalStatus(`Arm blocked: ${error instanceof Error ? error.message : "unknown"}`);
    } finally {
      if (mountedRef.current) setFalBusy(false);
    }
  };

  const handleStop = (revokeHarness = true) => {
    const sessionId = configRef.current?.session_id;
    if (revokeHarness && sessionId) void postHarness("lease", { operation: "disable", session_id: sessionId }).catch(() => undefined);
    setAgentHarnessEnabled(false);
    setVisualDirectionControlEnabled(false);
    publishVisualDirection({ ...visualDirectionRef.current, control_enabled: false });
    setAgentHarnessStatus("Off — capture stopped");
    controllerRef.current?.stop("user_stopped");
    setProjection(null);
    configRef.current = null;
    overlayVisibleRef.current = false;
    setOverlayVisible(false);
    void window.casimirDesktop?.stopRealtimeTexturePackOverlay?.();
    void stopFalSession("capture_stopped");
  };

  const handleShowOverlay = async () => {
    const config = configRef.current;
    const bridge = window.casimirDesktop;
    if (!config || !bridge?.showRealtimeTexturePackOverlay || !nativeOverlayAvailable) return false;
    try {
      setOverlayFailure(null);
      await bridge.showRealtimeTexturePackOverlay(config);
      overlayVisibleRef.current = true;
      setOverlayVisible(true);
      if (projection) await bridge.updateRealtimeTexturePackFrame?.(projection);
      return true;
    } catch (error) {
      setOverlayFailure(error instanceof Error ? error.message : "overlay_show_failed");
      return false;
    }
  };

  const handleRevealOriginal = async () => {
    try {
      await window.casimirDesktop?.revealRealtimeTexturePackOriginal?.(true);
      overlayVisibleRef.current = false;
      setOverlayVisible(false);
      setVisualDirectionControlEnabled(false);
      publishVisualDirection({ ...visualDirectionRef.current, control_enabled: false });
      await stopFalSession("reveal_original");
      return true;
    } catch (error) {
      setOverlayFailure(error instanceof Error ? error.message : "overlay_reveal_failed");
      return false;
    }
  };

  useEffect(() => {
    if ((!agentHarnessEnabled && !visualDirectionControlEnabled) || !captureActive || !configRef.current) return;
    let cancelled = false;
    const sessionId = configRef.current.session_id;
    const clientState = () => ({
      capture_active: controllerRef.current?.getState().capture_active === true,
      overlay_visible: overlayVisibleRef.current,
      session_status: controllerRef.current?.getState().status ?? "unknown",
      visual_direction: {
        ...visualDirectionRef.current,
        control_enabled: visualDirectionControlEnabled,
      },
    });
    const acknowledge = async (
      command: RealtimeTexturePackHarnessCommand,
      outcome: "completed" | "blocked",
      failureReason?: string,
      appliedConfigurationRevision?: number,
      appliedClientState?: ReturnType<typeof clientState>,
    ) => postHarness("ack", {
      session_id: sessionId,
      command_id: command.command_id,
      outcome,
      failure_reason: failureReason ?? null,
      applied_configuration_revision: appliedConfigurationRevision ?? null,
      client_state: appliedClientState ?? clientState(),
    });
    const applyVisualDirectionCommand = (command: RealtimeTexturePackHarnessCommand) => {
      if (!visualDirectionControlEnabled || !isRealtimeTexturePackVisualDirectionCommand(command.action) ||
          command.expected_configuration_revision !== visualDirectionRef.current.configuration_revision ||
          !command.arguments || command.arguments.command !== command.action) return null;
      const current = visualDirectionRef.current;
      let next = { ...current, configuration_revision: current.configuration_revision + 1 };
      let values = directionValuesRef.current;
      if (command.arguments.command === "set_visual_direction_profile") {
        values = { ...values, presetId: command.arguments.preset_id };
        next = { ...next, preset_id: command.arguments.preset_id };
      }
      if (command.arguments.command === "set_custom_visual_directive") {
        values = { ...values, customPrompt: command.arguments.custom_visual_directive };
      }
      if (command.arguments.command === "set_dynamic_cue_policy") {
        next = { ...next, enabled_cue_families: command.arguments.enabled_cue_families };
      }
      if (command.arguments.command === "pin_current_direction") next = { ...next, pinned: true };
      if (command.arguments.command === "resume_dynamic_direction") next = { ...next, pinned: false };
      if (command.arguments.command === "clear_agent_visual_direction") {
        values = ownerDirectionRef.current;
        next = { ...next, preset_id: values.presetId, pinned: false };
      }
      directionValuesRef.current = values;
      setPresetId(values.presetId);
      setCustomPrompt(values.customPrompt);
      controllerRef.current?.updateDirection(values);
      const applied = publishVisualDirection({
        ...next,
        control_enabled: true,
        prompt_revision_id: `image-lens-config:${next.configuration_revision}`,
      });
      return {
        ...clientState(),
        visual_direction: applied,
      };
    };
    const execute = async (command: RealtimeTexturePackHarnessCommand) => {
      if (handledCommandsRef.current.has(command.command_id)) return;
      handledCommandsRef.current.add(command.command_id);
      let completed = false;
      let appliedClientState: ReturnType<typeof clientState> | undefined;
      if (command.action === "show_overlay") completed = await handleShowOverlay();
      if (command.action === "reveal_original") completed = await handleRevealOriginal();
      if (command.action === "stop") {
        handleStop(false);
        completed = true;
      }
      if (isRealtimeTexturePackVisualDirectionCommand(command.action)) {
        appliedClientState = applyVisualDirectionCommand(command) ?? undefined;
        completed = Boolean(appliedClientState);
      }
      await acknowledge(
        command,
        completed ? "completed" : "blocked",
        completed ? undefined : "local_control_unavailable_or_revision_mismatch",
        appliedClientState?.visual_direction.configuration_revision,
        appliedClientState,
      );
      if (command.action === "stop") {
        void postHarness("lease", { operation: "disable", session_id: sessionId }).catch(() => undefined);
      }
      setAgentHarnessStatus(completed ? `Agent command completed: ${command.action}` : `Agent command blocked: ${command.action}`);
    };
    const poll = async () => {
      try {
        const payload = await postHarness("poll", {
          session_id: sessionId,
          allowed_actions: agentAllowedActions,
          visual_direction_control_enabled: visualDirectionControlEnabled,
          allowed_visual_direction_commands: visualDirectionControlEnabled
            ? REALTIME_TEXTURE_PACK_VISUAL_DIRECTION_COMMANDS
            : [],
          client_state: clientState(),
        });
        if (cancelled) return;
        setAgentHarnessStatus("On — waiting for governed commands");
        const commands = Array.isArray(payload.commands)
          ? payload.commands.filter((entry): entry is RealtimeTexturePackHarnessCommand => Boolean(
            entry && typeof entry === "object" && typeof (entry as RealtimeTexturePackHarnessCommand).command_id === "string",
          ))
          : [];
        for (const command of commands) await execute(command);
      } catch (error) {
        if (!cancelled) setAgentHarnessStatus(`Control unavailable: ${error instanceof Error ? error.message : "poll_failed"}`);
      }
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [agentAllowedActions, agentHarnessEnabled, captureActive, visualDirectionControlEnabled]);

  const setHarnessEnabled = (enabled: boolean) => {
    if (enabled && !captureActive) return;
    setAgentHarnessEnabled(enabled);
    setAgentHarnessStatus(enabled ? "Enabling…" : "Off — user control only");
    if (!enabled && !visualDirectionControlEnabled && configRef.current?.session_id) {
      void postHarness("lease", { operation: "disable", session_id: configRef.current.session_id }).catch(() => undefined);
    }
  };

  const setVisualHarnessEnabled = (enabled: boolean) => {
    if (enabled && !captureActive) return;
    setVisualDirectionControlEnabled(enabled);
    publishVisualDirection({ ...visualDirectionRef.current, control_enabled: enabled });
    setAgentHarnessStatus(enabled ? "Enabling visual-direction lease…" : "Visual-direction lease off");
    if (!enabled && !agentHarnessEnabled && configRef.current?.session_id) {
      void postHarness("lease", { operation: "disable", session_id: configRef.current.session_id }).catch(() => undefined);
    }
  };

  const toggleAgentAction = (action: RealtimeTexturePackHarnessAction) => {
    setAgentAllowedActions((current) => current.includes(action)
      ? current.filter((entry) => entry !== action)
      : [...current, action]);
  };

  const toggleCueFamily = (family: string) => {
    const current = visualDirectionRef.current;
    const enabled = current.enabled_cue_families.includes(family)
      ? current.enabled_cue_families.filter((entry) => entry !== family)
      : [...current.enabled_cue_families, family];
    publishVisualDirection({ ...current, enabled_cue_families: enabled });
  };

  const setPinnedByUser = (pinned: boolean) => {
    publishVisualDirection({ ...visualDirectionRef.current, pinned });
  };

  if (!isDeveloper) {
    return (
      <div className="flex min-h-[420px] items-center justify-center p-6" data-testid="realtime-texture-pack-locked">
        <div className="max-w-lg rounded-xl border border-amber-300/20 bg-amber-950/20 p-5 text-sm text-amber-100">
          <div className="font-semibold">Realtime Texture Pack is reserved for developer mode.</div>
          <p className="mt-2 text-amber-100/70">
            The ordinary Image Lens inspection surface remains available. This low-rate overlay experiment has no public account authority.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(270px,360px)_minmax(0,1fr)]" data-testid="realtime-texture-pack-controls">
      <section className="space-y-4 rounded-xl border border-cyan-300/15 bg-slate-900/70 p-4">
        <div>
          <div className="text-sm font-semibold text-cyan-100">Realtime Texture Pack</div>
          <div className="mt-1 text-xs text-slate-400">Non-authoritative visual projection</div>
        </div>

        <div className="rounded-lg border border-emerald-300/15 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-100">
          {providerChoice === "local_passthrough"
            ? "Local passthrough — no image API connected"
            : falSession && (falSession.status === "armed" || falSession.status === "active")
              ? "fal FLUX.2 Klein realtime — attended session armed"
              : "fal FLUX.2 Klein realtime — not armed"}
        </div>

        <div className="rounded-lg border border-sky-300/15 bg-sky-950/15 p-3" data-testid="realtime-texture-pack-provider-controls">
          <label className="block text-xs text-slate-300">
            Image provider
            <select
              aria-label="Realtime Texture Pack image provider"
              value={providerChoice}
              disabled={captureActive || falBusy}
              onChange={(event) => setProviderChoice(event.target.value as "local_passthrough" | typeof RTP_FAL_PROVIDER_ID)}
              className="mt-1 w-full rounded border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100"
            >
              <option value="local_passthrough">Local passthrough</option>
              <option value={RTP_FAL_PROVIDER_ID}>fal FLUX.2 Klein realtime</option>
            </select>
          </label>
          {providerChoice === RTP_FAL_PROVIDER_ID ? (
            <div className="mt-3 space-y-2 text-[10px] text-slate-300">
              <div className="rounded border border-white/10 bg-black/20 p-2" data-testid="realtime-texture-pack-fal-readiness">
                <div>{falStatus}</div>
                <div className="mt-1 text-slate-500">
                  Runtime {falReadiness?.runtime_enabled ? "enabled" : "off"} · credential {falReadiness?.credential_configured ? "configured" : "missing"} · SDK {falReadiness?.sdk_available ? "available" : "missing"}
                </div>
              </div>
              <label className="flex items-start gap-2 rounded border border-white/10 p-2">
                <input
                  type="checkbox"
                  aria-label="Acknowledge external frame egress"
                  checked={falEgressAcknowledged}
                  disabled={Boolean(falSession)}
                  onChange={(event) => setFalEgressAcknowledged(event.target.checked)}
                />
                <span>I understand each accepted source frame is sent to fal for image transformation.</span>
              </label>
              <label className="flex items-start gap-2 rounded border border-white/10 p-2">
                <input
                  type="checkbox"
                  aria-label="Acknowledge billable provider calls"
                  checked={falBillingAcknowledged}
                  disabled={Boolean(falSession)}
                  onChange={(event) => setFalBillingAcknowledged(event.target.checked)}
                />
                <span>I approve this one attended session only: at most 60 seconds, 60 requests, and USD $1.00.</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void handleArmFal()}
                  disabled={!captureActive || !falReadiness?.ready_for_attended_arm || !falEgressAcknowledged || !falBillingAcknowledged || falBusy || Boolean(falSession)}
                  className="rounded bg-sky-700 px-2 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {falBusy ? "Arming…" : "Arm attended API"}
                </button>
                <button
                  type="button"
                  onClick={() => void stopFalSession("user_provider_stop")}
                  disabled={!falSession || falBusy}
                  className="rounded border border-rose-300/25 px-2 py-2 text-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Stop provider
                </button>
              </div>
              <div className="text-slate-500">The agent/MCP harness cannot select this provider or arm billing.</div>
            </div>
          ) : null}
        </div>

        <label className="block text-xs text-slate-300">
          Style preset
          <select data-helix-control-id="workstation.panel.image-lens.realtime-texture-pack-controls.texture-style-preset" data-helix-interaction-kind="configure" data-helix-authority-state="client_local"
            aria-label="Texture style preset"
            value={presetId}
            onChange={(event) => setPresetId(event.target.value as RealtimeTexturePackPresetId)}
            disabled={captureActive || busy}
            className="mt-1 w-full rounded border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          >
            {REALTIME_TEXTURE_PACK_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.label}</option>
            ))}
          </select>
        </label>

        <label className="block text-xs text-slate-300">
          Custom prompt (optional)
          <textarea data-helix-control-id="workstation.panel.image-lens.realtime-texture-pack-controls.texture-custom-prompt" data-helix-interaction-kind="configure" data-helix-authority-state="client_local"
            aria-label="Texture custom prompt"
            value={customPrompt}
            onChange={(event) => setCustomPrompt(event.target.value.slice(0, 2_000))}
            disabled={captureActive || busy}
            rows={4}
            placeholder="Example: moonlit watercolor ruins"
            className="mt-1 w-full resize-none rounded border border-white/15 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
          />
        </label>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded border border-white/10 bg-black/20 p-2">
            <div className="text-slate-500">Transform rate</div>
            <div className="mt-1 text-slate-100">{REALTIME_TEXTURE_PACK_BASELINE_FPS} fps</div>
          </div>
          <div className="rounded border border-white/10 bg-black/20 p-2">
            <div className="text-slate-500">Source frame</div>
            <div className="mt-1 text-slate-100">{REALTIME_TEXTURE_PACK_BASELINE_WIDTH} × {REALTIME_TEXTURE_PACK_BASELINE_HEIGHT}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button data-helix-control-id="workstation.panel.image-lens.realtime-texture-pack-controls.void-handle-start" data-helix-interaction-kind="act" data-helix-authority-state="client_local"
            type="button"
            onClick={() => void handleStart()}
            disabled={busy || captureActive}
            className="rounded bg-cyan-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Opening picker…" : "Choose game/window"}
          </button>
          <button data-helix-control-id="workstation.panel.image-lens.realtime-texture-pack-controls.show-overlay" data-helix-interaction-kind="navigate" data-helix-authority-state="client_local"
            type="button"
            onClick={() => void handleShowOverlay()}
            disabled={!nativeOverlayAvailable || !captureActive || !configRef.current || overlayVisible}
            title={nativeOverlayAvailable ? "Show the click-through native overlay" : "Requires the CasimirBot desktop app"}
            className="rounded border border-white/15 px-3 py-2 text-xs text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Show overlay
          </button>
          <button data-helix-control-id="workstation.panel.image-lens.realtime-texture-pack-controls.hide-the-projection-while-capture-continues" data-helix-interaction-kind="act" data-helix-authority-state="client_local"
            type="button"
            onClick={() => void handleRevealOriginal()}
            disabled={!nativeOverlayAvailable || !overlayVisible}
            title="Hide the projection while capture continues"
            className="rounded border border-white/15 px-3 py-2 text-xs text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reveal original
          </button>
          <button data-helix-control-id="workstation.panel.image-lens.realtime-texture-pack-controls.stop" data-helix-interaction-kind="act" data-helix-authority-state="client_local"
            type="button"
            onClick={() => handleStop()}
            disabled={!captureActive && sessionState.status !== "degraded"}
            className="rounded border border-rose-300/30 px-3 py-2 text-xs text-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Stop
          </button>
        </div>

        <div className="rounded-lg border border-violet-300/20 bg-violet-950/20 p-3" data-testid="realtime-texture-pack-agent-harness">
          <label className="flex items-center justify-between gap-3 text-xs font-semibold text-violet-100">
            <span>Agent harness control</span>
            <input data-helix-control-id="workstation.panel.image-lens.realtime-texture-pack-controls.enable-agent-harness-control" data-helix-interaction-kind="configure" data-helix-authority-state="client_local"
              type="checkbox"
              aria-label="Enable agent harness control"
              checked={agentHarnessEnabled}
              disabled={!captureActive}
              onChange={(event) => setHarnessEnabled(event.target.checked)}
            />
          </label>
          <p className="mt-1 text-[11px] text-violet-100/65">
            Session-only. The agent cannot start capture or choose a source.
          </p>
          <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-slate-300">
            {REALTIME_TEXTURE_PACK_HARNESS_ACTIONS.map((action) => (
              <label key={action} className="flex items-center gap-1 rounded border border-white/10 px-1.5 py-1">
                <input data-helix-control-id="workstation.panel.image-lens.realtime-texture-pack-controls.input" data-helix-interaction-kind="configure" data-helix-authority-state="client_local"
                  type="checkbox"
                  checked={agentAllowedActions.includes(action)}
                  disabled={!agentHarnessEnabled}
                  onChange={() => toggleAgentAction(action)}
                />
                <span>{action === "show_overlay" ? "Show" : action === "reveal_original" ? "Reveal" : "Stop"}</span>
              </label>
            ))}
          </div>
          <div className="mt-2 text-[10px] text-slate-400" data-testid="realtime-texture-pack-agent-harness-status">
            {agentHarnessStatus}
          </div>
        </div>

        <div className="rounded-lg border border-fuchsia-300/20 bg-fuchsia-950/15 p-3" data-testid="realtime-texture-pack-visual-direction">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-fuchsia-100">Visual direction</div>
              <div className="mt-0.5 text-[10px] text-fuchsia-100/60">Revision {visualDirection.configuration_revision}</div>
            </div>
            <label className="flex items-center gap-2 text-[11px] text-fuchsia-100">
              Agent control
              <input
                type="checkbox"
                aria-label="Enable agent visual direction control"
                checked={visualDirectionControlEnabled}
                disabled={!captureActive}
                onChange={(event) => setVisualHarnessEnabled(event.target.checked)}
              />
            </label>
          </div>
          <p className="mt-2 text-[10px] text-fuchsia-100/65">
            Changes prompt direction only. Capture, source selection, provider choice, billing, and gameplay remain user-owned.
          </p>

          <div className="mt-3 grid gap-2 text-[10px]">
            <label className="text-slate-300">
              Visual source
              <select aria-label="Visual direction source" disabled className="mt-1 w-full rounded border border-white/10 bg-slate-950 px-2 py-1.5 text-slate-300">
                <option>Captured game/window (user chosen)</option>
              </select>
            </label>
            <label className="text-slate-300">
              Environment context
              <select aria-label="Visual direction environment" disabled className="mt-1 w-full rounded border border-white/10 bg-slate-950 px-2 py-1.5 text-slate-300">
                <option>None — static prompt fallback</option>
              </select>
            </label>
            <div className="rounded border border-amber-300/15 bg-amber-950/15 px-2 py-1.5 text-amber-100/80">
              Compatibility: disconnected. A supported environment binding must expose an exact, fresh controller identity before reactive cues can be used.
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-slate-300">
                Direction mode
                <select aria-label="Visual direction mode" value="static_prompt_only" disabled className="mt-1 w-full rounded border border-white/10 bg-slate-950 px-2 py-1.5 text-slate-300">
                  <option value="static_prompt_only">Static prompt</option>
                  <option value="environment_reactive">Environment reactive</option>
                </select>
              </label>
              <div className="text-slate-300">
                Output target
                <label className="mt-1 flex h-[30px] items-center gap-2 rounded border border-white/10 bg-slate-950 px-2">
                  <input type="checkbox" checked readOnly /> Overlay
                </label>
              </div>
            </div>
            <div>
              <div className="text-slate-400">Dynamic cue families</div>
              <div className="mt-1 grid grid-cols-3 gap-1">
                {["dimension", "biome", "time", "weather", "activity", "hazards", "focus", "workflow"].map((family) => (
                  <label key={family} className="flex items-center gap-1 rounded border border-white/10 px-1.5 py-1 text-slate-300">
                    <input
                      type="checkbox"
                      checked={visualDirection.enabled_cue_families.includes(family)}
                      onChange={() => toggleCueFamily(family)}
                    />
                    {family}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPinnedByUser(true)} disabled={visualDirection.pinned} className="flex-1 rounded border border-white/15 px-2 py-1.5 text-slate-200 disabled:opacity-40">Pin direction</button>
              <button type="button" onClick={() => setPinnedByUser(false)} disabled={!visualDirection.pinned} className="flex-1 rounded border border-white/15 px-2 py-1.5 text-slate-200 disabled:opacity-40">Resume dynamic</button>
            </div>
            <details className="rounded border border-white/10 bg-black/20 p-2">
              <summary className="cursor-pointer text-slate-300">Compiled prompt preview</summary>
              <div className="mt-2 whitespace-pre-wrap text-slate-500" data-testid="realtime-texture-pack-compiled-prompt">
                {buildRealtimeTexturePackPrompt(presetId, customPrompt)}
              </div>
            </details>
            <div className="grid grid-cols-2 gap-2 text-slate-400">
              <div className="rounded border border-white/10 p-2">Provider calls <strong className="text-slate-200">{falSession?.requests_started ?? 0} / 60</strong></div>
              <div className="rounded border border-white/10 p-2">Spend <strong className="text-slate-200">${falSession?.estimated_cost_usd ?? 0} / $1</strong></div>
            </div>
            <div className="text-amber-100/70">
              {falSession && (falSession.status === "armed" || falSession.status === "active")
                ? `Provider API ${falSession.status}.`
                : "Provider API is not armed."}
            </div>
          </div>
        </div>
      </section>

      <section className="flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-white/10 bg-black/30">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/10 px-4 py-3 text-xs">
          <span className="text-slate-400">State <strong className="font-medium text-slate-100">{sessionState.status}</strong></span>
          <span className="text-slate-400">Age <strong className="font-medium text-slate-100">{sessionState.frame_age_ms ?? "—"} ms</strong></span>
          <span className="text-slate-400">Dropped <strong className="font-medium text-slate-100">{sessionState.dropped_frame_count}</strong></span>
          <span className="text-slate-400">Provider <strong className="font-medium text-slate-100">{sessionState.provider_state}</strong></span>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
          {projection ? (
            <img
              src={projection.projection_image_data_url}
              alt="Realtime Texture Pack local preview"
              className="max-h-full max-w-full rounded border border-cyan-300/20 object-contain [image-rendering:auto]"
            />
          ) : (
            <div className="max-w-md text-center text-sm text-slate-500">
              Choose a game or application window. Whole-display capture is rejected so the future overlay cannot capture itself recursively.
            </div>
          )}
        </div>
        <div className="border-t border-white/10 px-4 py-2 text-[11px] text-slate-500">
          Projection only. Generated or passthrough pixels never enter Image Lens evidence receipts.
          {sessionState.failure_reason ? ` Last failure: ${sessionState.failure_reason}.` : ""}
          {overlayFailure ? ` Overlay failure: ${overlayFailure}.` : ""}
        </div>
      </section>
    </div>
  );
}
