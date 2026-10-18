import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  CircleCheck,
  Eye,
  EyeOff,
  LoaderCircle,
  Mic,
  Radio,
  Settings2,
  ShieldCheck,
  TriangleAlert,
  Volume2,
} from "lucide-react";
import type { HelixAccountCapabilityPolicy } from "@shared/helix-account-session";
import type { HelixAgentRuntimeId } from "@shared/helix-agent-runtime";
import type { HelixRealtimeGroundedRelayStatusV1 } from "@shared/contracts/helix-realtime-worker-relay.v1";
import {
  buildInactiveHelixLiveRuntimeAgentControlState,
  resolveHelixLiveRuntimeAuthority,
  resolveHelixLiveRuntimeMode,
  type HelixLiveRuntimeAgentAuthority,
  type HelixLiveRuntimeAgentControlState,
  type HelixLiveRuntimeAgentMode,
} from "@shared/helix-live-runtime-agent";
import {
  labelForHelixAskLiveRuntimeLifecycleState,
  labelForHelixAskLiveRuntimeTransportControllerState,
  type HelixAskLiveRuntimeLifecycleState,
  type HelixAskLiveRuntimeTransportControllerState,
} from "./HelixAskLiveRuntimeLifecycle";
import { useHelixAskLiveRuntimeSession } from "./useHelixAskLiveRuntimeSession";
import { describeHelixAskRealtimeFailure } from "./HelixAskRealtimeFailurePresentation";
import { LiveConnectionSettingsButton } from "@/components/agent-access/LiveConnectionSettings";
import { useSharedManagedConversation } from "@/components/agent-access/useManagedConversation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from
  "@/components/ui/dialog";
import type { DiscordVoiceRenewalPending } from
  "./shared-live-room/NativeRoomConnectionPanel";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, readCachedAccountProfileIdentity } from
  "@/lib/workstation/accountCapabilityPolicy";
import { readLatestReasoningBinding, HELIX_REASONING_BINDING_UPDATED_EVENT } from
  "@/lib/agent-access/reasoningTaskBinding";
import { EXPERIMENTAL_ASK_HELIX_CHANGED, readExperimentalAskHelix } from
  "@/lib/workstation/experimentalAskHelix";
import { labelForPersonalVoiceDestination, PERSONAL_VOICE_ROUTE_CHANGED_EVENT,
  personalVoiceBlockReason, readPersonalVoiceDestination, writePersonalVoiceDestination,
  type PersonalVoiceDestination } from "@/lib/helix/personal-voice-route";
import { HelixAskSharedLiveRoomControls } from "./shared-live-room";
import type { LocalRoomTextOwnerSnapshot } from "./shared-live-room/LocalRoomTextOwnerBridge";
import type { HostedRoomTextOwnerSnapshot } from "./shared-live-room/NativeHostedRoomTextOwnerBridge";

export type HelixAskLiveRuntimeControlsModel = {
  visible: boolean;
  locked: boolean;
  lockReason: string | null;
  visualInputAllowed: boolean;
  sharedRealtimeRoomsAllowed: boolean;
  authoritySelectorVisible: boolean;
  modeLabel: string;
  authorityLabel: string;
  lifecycleState: HelixAskLiveRuntimeLifecycleState;
  lifecycleLabel: string;
  transportControllerState: HelixAskLiveRuntimeTransportControllerState;
  transportControllerLabel: string;
  transportBlockedReason: string | null;
  selectedRuntimeAgentProvider: HelixAgentRuntimeId;
  controlState: HelixLiveRuntimeAgentControlState;
};

export type HelixAskLiveRuntimeToolbarBridge = {
  engaged: boolean;
  active: boolean;
  microphoneEnabled: boolean;
  microphoneToggleDisabled: boolean;
  toggleMicrophone: () => void;
  visualInputEnabled: boolean;
  visualInputToggleDisabled: boolean;
  toggleVisualInput: () => void;
};

const labelForMode = (mode: HelixLiveRuntimeAgentMode): string => {
  switch (mode) {
    case "live_voice":
      return "Live Voice";
    case "live_voice_mini":
      return "Live Mini";
    case "live_transcription":
      return "Transcript";
    case "live_translation":
      return "Translate";
    case "off":
      return "Live Off";
  }
};

const labelForAuthority = (authority: HelixLiveRuntimeAgentAuthority): string => {
  switch (authority) {
    case "suggest_actions":
      return "Suggest";
    case "execute_safe_actions":
      return "Safe Act";
    case "execute_confirmed_actions":
      return "Confirm";
    case "observe_only":
      return "Observe";
  }
};

export const describeHelixAskWorkerRelayStatus = (
  status: HelixRealtimeGroundedRelayStatusV1 | null,
): { label: string; icon: "checking" | "ready" | "speaking" } | null => {
  if (status === "worker_running") {
    return { label: "Checking workspace", icon: "checking" };
  }
  if (
    status === "result_ready" ||
    status === "relay_queued_busy" ||
    status === "response_requested" ||
    status === "provider_acknowledged"
  ) {
    return { label: "Result ready", icon: "ready" };
  }
  if (status === "speaking") {
    return { label: "Speaking result", icon: "speaking" };
  }
  return null;
};

export function buildHelixAskLiveRuntimeControlsModel(args: {
  accountPolicy?: Pick<
    HelixAccountCapabilityPolicy,
    "account_type" | "feature_flags" | "locked_features"
  > | null;
  mode?: unknown;
  authority?: unknown;
  lifecycleState?: HelixAskLiveRuntimeLifecycleState;
  transportControllerState?: HelixAskLiveRuntimeTransportControllerState;
  transportBlockedReason?: string | null;
  selectedRuntimeAgentProvider?: HelixAgentRuntimeId;
}): HelixAskLiveRuntimeControlsModel {
  const accountPolicy = args.accountPolicy ?? null;
  const runtimeControlsUnlocked =
    accountPolicy?.feature_flags?.includes("runtime_agent_controls") === true &&
    accountPolicy.locked_features?.includes("runtime_agent_controls") !== true;
  const visible = runtimeControlsUnlocked;
  const mode = resolveHelixLiveRuntimeMode(args.mode);
  const authoritySelectorVisible = accountPolicy?.account_type === "developer";
  const authority = authoritySelectorVisible
    ? resolveHelixLiveRuntimeAuthority(args.authority)
    : "observe_only";
  const lifecycleState = args.lifecycleState ?? "off";
  const transportControllerState = args.transportControllerState ?? "idle";
  return {
    visible,
    locked: !runtimeControlsUnlocked,
    lockReason: runtimeControlsUnlocked ? null : "runtime_agent_controls_required",
    visualInputAllowed:
      accountPolicy?.locked_features?.includes("live_answer_visual_capture_controls") !== true,
    sharedRealtimeRoomsAllowed:
      accountPolicy?.feature_flags?.includes("shared_realtime_rooms") === true &&
      accountPolicy.locked_features?.includes("shared_realtime_rooms") !== true,
    authoritySelectorVisible,
    modeLabel: labelForMode(mode),
    authorityLabel: labelForAuthority(authority),
    lifecycleState,
    lifecycleLabel: labelForHelixAskLiveRuntimeLifecycleState(lifecycleState),
    transportControllerState,
    transportControllerLabel:
      labelForHelixAskLiveRuntimeTransportControllerState(transportControllerState),
    transportBlockedReason: args.transportBlockedReason ?? null,
    selectedRuntimeAgentProvider: args.selectedRuntimeAgentProvider ?? "helix",
    controlState: buildInactiveHelixLiveRuntimeAgentControlState({
      runtime_agent_mode: mode,
      runtime_agent_authority: authority,
    }),
  };
}

export function HelixAskLiveRuntimeControls({
  model,
  onToolbarBridgeChange,
  onActiveSharedRoomChange,
  onRoomTextOwnerChange,
  onSelectRoomChannel,
  onSelectRoomMission,
  onHostedRoomTextOwnerChange,
  onSelectHostedRoomChannel,
  onSelectHostedRoomMission,
  onVisualInputEnableRequested,
}: {
  model: HelixAskLiveRuntimeControlsModel;
  onToolbarBridgeChange?: (bridge: HelixAskLiveRuntimeToolbarBridge | null) => void;
  onActiveSharedRoomChange?: (roomId: string | null) => void;
  onRoomTextOwnerChange?: (snapshot: LocalRoomTextOwnerSnapshot | null) => void;
  onSelectRoomChannel?: () => void;
  onSelectRoomMission?: () => void;
  onHostedRoomTextOwnerChange?: (snapshot: HostedRoomTextOwnerSnapshot | null) => void;
  onSelectHostedRoomChannel?: () => void;
  onSelectHostedRoomMission?: () => void;
  onVisualInputEnableRequested?: () => void;
}) {
  if (!model.visible) return null;
  return (
    <HelixAskVisibleLiveRuntimeControls
      model={model}
      onToolbarBridgeChange={onToolbarBridgeChange}
      onActiveSharedRoomChange={onActiveSharedRoomChange}
      onRoomTextOwnerChange={onRoomTextOwnerChange}
      onSelectRoomChannel={onSelectRoomChannel}
      onSelectRoomMission={onSelectRoomMission}
      onHostedRoomTextOwnerChange={onHostedRoomTextOwnerChange}
      onSelectHostedRoomChannel={onSelectHostedRoomChannel}
      onSelectHostedRoomMission={onSelectHostedRoomMission}
      onVisualInputEnableRequested={onVisualInputEnableRequested}
    />
  );
}

function HelixAskVisibleLiveRuntimeControls({
  model,
  onToolbarBridgeChange,
  onActiveSharedRoomChange,
  onRoomTextOwnerChange,
  onSelectRoomChannel,
  onSelectRoomMission,
  onHostedRoomTextOwnerChange,
  onSelectHostedRoomChannel,
  onSelectHostedRoomMission,
  onVisualInputEnableRequested,
}: {
  model: HelixAskLiveRuntimeControlsModel;
  onToolbarBridgeChange?: (bridge: HelixAskLiveRuntimeToolbarBridge | null) => void;
  onActiveSharedRoomChange?: (roomId: string | null) => void;
  onRoomTextOwnerChange?: (snapshot: LocalRoomTextOwnerSnapshot | null) => void;
  onSelectRoomChannel?: () => void;
  onSelectRoomMission?: () => void;
  onHostedRoomTextOwnerChange?: (snapshot: HostedRoomTextOwnerSnapshot | null) => void;
  onSelectHostedRoomChannel?: () => void;
  onSelectHostedRoomMission?: () => void;
  onVisualInputEnableRequested?: () => void;
}) {
  const [mode, setMode] = useState<HelixLiveRuntimeAgentMode>(
    model.controlState.runtime_agent_mode,
  );
  const [authority, setAuthority] = useState<HelixLiveRuntimeAgentAuthority>(
    model.controlState.runtime_agent_authority,
  );
  const [sharedRoomTransportBound, setSharedRoomTransportBound] = useState(false);
  const [voiceDestination, setVoiceDestination] = useState(readPersonalVoiceDestination);
  const voiceProfileId = useRef(readCachedAccountProfileIdentity().profileId);
  const [experimentalAskEnabled, setExperimentalAskEnabled] = useState(readExperimentalAskHelix);
  const [, refreshBinding] = useState(0);
  const managedConversation = useSharedManagedConversation();
  useEffect(() => {
    const onVoiceRoute = () => setVoiceDestination(readPersonalVoiceDestination());
    const onExperimental = () => setExperimentalAskEnabled(readExperimentalAskHelix());
    const onBinding = () => refreshBinding(value => value + 1);
    window.addEventListener(PERSONAL_VOICE_ROUTE_CHANGED_EVENT, onVoiceRoute);
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, onVoiceRoute);
    window.addEventListener(EXPERIMENTAL_ASK_HELIX_CHANGED, onExperimental);
    window.addEventListener(HELIX_REASONING_BINDING_UPDATED_EVENT, onBinding);
    return () => {
      window.removeEventListener(PERSONAL_VOICE_ROUTE_CHANGED_EVENT, onVoiceRoute);
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, onVoiceRoute);
      window.removeEventListener(EXPERIMENTAL_ASK_HELIX_CHANGED, onExperimental);
      window.removeEventListener(HELIX_REASONING_BINDING_UPDATED_EVENT, onBinding);
    };
  }, []);
  const runtime = useHelixAskLiveRuntimeSession({
    enabled: !model.locked,
    mode,
    authority,
    selectedRuntimeAgentProvider: model.selectedRuntimeAgentProvider,
    directVisualInputSuppressed: sharedRoomTransportBound,
    initialLifecycleState: model.lifecycleState,
    initialTransportState: model.transportControllerState,
  });
  const [clockMs, setClockMs] = useState(Date.now());
  const [discordRenewalRequest, setDiscordRenewalRequest] =
    useState<DiscordVoiceRenewalPending | null>(null);
  const [renewalDialogOpen, setRenewalDialogOpen] = useState(false);
  const [renewalBusy, setRenewalBusy] = useState(false);
  const [renewalMessage, setRenewalMessage] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  const notifiedSessionRef = useRef<string | null>(null);
  const expiredSessionRef = useRef<string | null>(null);
  const attemptedDiscordRenewalRef = useRef<string | null>(null);
  useEffect(() => {
    if (!runtime.active || !runtime.expiresAtMs) return;
    const timer = window.setInterval(() => setClockMs(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [runtime.active, runtime.expiresAtMs]);
  const remainingMs = runtime.expiresAtMs === null ? null : runtime.expiresAtMs - clockMs;
  const renewalWindowOpen = runtime.active && remainingMs !== null &&
    remainingMs > 0 && remainingMs <= 60_000;
  useEffect(() => {
    const sessionId = runtime.realtimeSessionId;
    if (!renewalWindowOpen || !sessionId || notifiedSessionRef.current === sessionId) return;
    notifiedSessionRef.current = sessionId;
    setRenewalDialogOpen(true);
    if (typeof Notification !== "undefined" && notificationPermission === "granted") {
      try {
        const notice = new Notification("GPT Live ends in one minute", {
          body: "Open CasimirBot to approve one more session. The Discord call will pause during renewal.",
          tag: `casimirbot-live-renewal-${sessionId}`,
        });
        notice.onclick = () => { window.focus(); setRenewalDialogOpen(true); };
      } catch { /* The in-app prompt remains available. */ }
    }
  }, [notificationPermission, renewalWindowOpen, runtime.realtimeSessionId]);
  useEffect(() => {
    if (renewalWindowOpen && discordRenewalRequest?.requestId) setRenewalDialogOpen(true);
  }, [discordRenewalRequest?.requestId, renewalWindowOpen]);
  useEffect(() => {
    if (renewalBusy || !runtime.active || !runtime.realtimeSessionId || remainingMs === null ||
        remainingMs > 0 || expiredSessionRef.current === runtime.realtimeSessionId) return;
    expiredSessionRef.current = runtime.realtimeSessionId;
    setRenewalDialogOpen(false);
    setRenewalMessage("GPT Live expired. Start a new session when your provider allows it.");
    void runtime.stop();
  }, [remainingMs, renewalBusy, runtime.active, runtime.realtimeSessionId, runtime.stop]);
  const approveRenewal = async () => {
    if (!renewalWindowOpen || renewalBusy) return;
    setRenewalBusy(true);
    setRenewalMessage(null);
    const pending = discordRenewalRequest;
    const renewed = await runtime.renew();
    if (renewed) {
      if (pending) await pending.acknowledge().catch(() => false);
      setRenewalDialogOpen(false);
      setRenewalMessage("New GPT Live session is active. Reconnect Discord audio in the room control; the current invitation and consents will be checked again.");
    } else {
      setRenewalMessage("Renewal failed. Check the Live Voice error; a provider rate limit cannot be extended here.");
    }
    setRenewalBusy(false);
  };
  useEffect(() => {
    const requestId = discordRenewalRequest?.requestId;
    if (!discordRenewalRequest || !renewalWindowOpen || !requestId || renewalBusy ||
        discordRenewalRequest.expiresAtMs <= Date.now() ||
        attemptedDiscordRenewalRef.current === requestId) return;
    // The linked commander approved this exact successor through Discord.
    // Consume that approval at most once, and only within the local lease window.
    attemptedDiscordRenewalRef.current = requestId;
    void approveRenewal();
  }, [discordRenewalRequest?.requestId, renewalBusy, renewalWindowOpen]);
  useEffect(() => {
    const onRouteChange = () => {
      // A route selected by another control cannot redirect an in-flight call.
      if (runtime.active) void runtime.stop();
    };
    const onAccountChange = () => {
      const nextProfileId = readCachedAccountProfileIdentity().profileId;
      if (nextProfileId === voiceProfileId.current) return;
      voiceProfileId.current = nextProfileId;
      if (runtime.active) void runtime.stop();
    };
    window.addEventListener(PERSONAL_VOICE_ROUTE_CHANGED_EVENT, onRouteChange);
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, onAccountChange);
    return () => {
      window.removeEventListener(PERSONAL_VOICE_ROUTE_CHANGED_EVENT, onRouteChange);
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, onAccountChange);
    };
  }, [runtime.active, runtime.stop]);
  const modeOptions: HelixLiveRuntimeAgentMode[] = [
    "live_voice",
    "live_voice_mini",
  ];
  const authorityOptions: HelixLiveRuntimeAgentAuthority[] = [
    "observe_only",
    "suggest_actions",
  ];
  const selectionDisabled = model.locked || runtime.active || runtime.lifecycleState === "requesting";
  const exactTaskReady = readLatestReasoningBinding()?.status === "active";
  const routeBlockedReason = personalVoiceBlockReason({
    destination: voiceDestination,
    managedConnectionReady: managedConversation?.connectionReady === true,
    exactTaskReady,
    experimentalAskEnabled,
  });
  const startDisabled = model.locked || runtime.lifecycleState === "requesting" ||
    runtime.transportState === "connecting" || (!runtime.active && Boolean(routeBlockedReason));
  const engaged = runtime.active ||
    runtime.lifecycleState === "requesting" ||
    runtime.lifecycleState === "stopping" ||
    runtime.transportState === "connecting" ||
    runtime.transportState === "active";
  const workerRelayIndicator = describeHelixAskWorkerRelayStatus(runtime.workerRelayStatus);
  const runtimeFailure = describeHelixAskRealtimeFailure(runtime.error);
  const toggleVisualInput = useCallback(() => {
    const nextEnabled = !runtime.visualInputEnabled;
    if (nextEnabled) onVisualInputEnableRequested?.();
    runtime.setVisualInputEnabled(nextEnabled);
  }, [
    onVisualInputEnableRequested,
    runtime.setVisualInputEnabled,
    runtime.visualInputEnabled,
  ]);
  useEffect(() => {
    if (!onToolbarBridgeChange) return;
    onToolbarBridgeChange({
      engaged,
      active: runtime.active,
      microphoneEnabled: runtime.microphoneEnabled,
      microphoneToggleDisabled: !runtime.active,
      toggleMicrophone: () => {
        runtime.setMicrophoneEnabled(!runtime.microphoneEnabled);
      },
      visualInputEnabled: runtime.visualInputEnabled,
      visualInputToggleDisabled: !runtime.active,
      toggleVisualInput,
    });
    return () => onToolbarBridgeChange(null);
  }, [
    engaged,
    onToolbarBridgeChange,
    runtime.active,
    runtime.microphoneEnabled,
    runtime.setMicrophoneEnabled,
    runtime.visualInputEnabled,
    toggleVisualInput,
  ]);
  const cycleMode = () => {
    const index = modeOptions.indexOf(mode);
    setMode(modeOptions[(index + 1) % modeOptions.length]);
  };
  const cycleAuthority = () => {
    const index = authorityOptions.indexOf(authority);
    setAuthority(authorityOptions[(index + 1) % authorityOptions.length]);
  };
  const selectVoiceDestination = (destination: PersonalVoiceDestination) => {
    if (selectionDisabled) return;
    if (destination === "message_codex" && !exactTaskReady) return;
    if (destination === "ask_helix" && !experimentalAskEnabled) return;
    writePersonalVoiceDestination(destination);
    setVoiceDestination(destination);
  };
  return (
    <>
      <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-live-runtime-controls.live-runtime-agent-lifecycle"
        type="button"
        data-helix-ask-action-item="true"
        aria-label="Live runtime agent lifecycle"
        title={model.lockReason ?? runtimeFailure?.detail ?? routeBlockedReason ?? "Start or stop Live Voice"}
        className="inline-flex h-10 shrink-0 snap-center items-center gap-2 rounded-full border border-violet-300/45 bg-violet-400/12 px-3 text-sm font-medium text-violet-100 transition hover:bg-violet-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200/70 disabled:opacity-60"
        disabled={startDisabled}
        data-lifecycle-state={runtime.lifecycleState}
        onClick={() => void (runtime.active ? runtime.stop() : runtime.start())}
      >
        <Activity className="h-4 w-4" />
        <span>{labelForHelixAskLiveRuntimeLifecycleState(runtime.lifecycleState)}</span>
        <span className="text-[11px] opacity-75">→ {labelForPersonalVoiceDestination(voiceDestination)}</span>
      </button>
      {renewalWindowOpen ? <button type="button" data-helix-ask-action-item="true"
        className="inline-flex h-10 shrink-0 items-center rounded-full border border-amber-300/60 bg-amber-400/15 px-3 text-xs font-semibold text-amber-100"
        onClick={() => setRenewalDialogOpen(true)}>
        Renew GPT Live · {Math.max(1, Math.ceil((remainingMs ?? 0) / 1_000))}s
      </button> : null}
      {renewalMessage ? <span role="status" className="max-w-80 text-xs text-amber-100">{renewalMessage}</span> : null}
      <Dialog open={renewalDialogOpen && renewalWindowOpen} onOpenChange={setRenewalDialogOpen}>
        <DialogContent className="border-amber-300/35 bg-slate-950 text-slate-100">
          <DialogHeader>
            <DialogTitle>GPT Live ends in one minute</DialogTitle>
            <DialogDescription>
              Approve one more session using your existing OpenAI connection. The current session will stop;
              reconnect Discord audio afterward. This cannot override a provider rate limit.
            </DialogDescription>
          </DialogHeader>
          {discordRenewalRequest && discordRenewalRequest.expiresAtMs > clockMs ?
            <p className="text-sm text-amber-100">The linked Discord commander approved renewal for this invitation.</p> : null}
          <div className="flex gap-2">
            <button type="button" disabled={renewalBusy} onClick={() => void approveRenewal()}
              className="rounded-md bg-amber-300 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">
              {renewalBusy ? "Starting…" : "Approve one more session"}
            </button>
            <button type="button" onClick={() => setRenewalDialogOpen(false)}
              className="rounded-md border border-white/20 px-3 py-2 text-sm">Not now</button>
          </div>
        </DialogContent>
      </Dialog>
      <Popover>
        <PopoverTrigger asChild><button type="button" data-helix-ask-action-item="true"
          aria-label="Voice settings" title="Choose where personal Live Voice sends finalized speech"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-violet-300/35 text-violet-100 hover:bg-violet-400/15">
          <Settings2 className="h-4 w-4" />
        </button></PopoverTrigger>
        <PopoverContent align="start" className="w-80 border-violet-300/25 bg-slate-950 text-slate-100">
          <p className="text-sm font-semibold">Live Voice settings</p>
          <p className="mt-1 text-xs text-slate-400">The voice destination stays the same when you switch text chats. Stop Live Voice to change it.</p>
          <fieldset className="mt-3 space-y-1" disabled={selectionDisabled}>
            <legend className="mb-1 text-xs font-semibold text-slate-300">Finalized speech goes to</legend>
            {(["cloud_agent_dm", "message_codex", "ask_helix"] as const)
              .filter(destination => destination !== "message_codex" || exactTaskReady).map(destination =>
              <label key={destination} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-white/5">
                <input type="radio" name="personal-voice-destination" value={destination}
                  checked={voiceDestination === destination}
                  disabled={destination === "ask_helix" && !experimentalAskEnabled}
                  onChange={() => selectVoiceDestination(destination)} />
                {labelForPersonalVoiceDestination(destination)}
              </label>)}
          </fieldset>
          {!exactTaskReady && voiceDestination === "message_codex" ? <p role="status" className="mt-2 text-xs text-amber-200">
            The saved direct Codex route is unavailable. Pair an exact task, or choose Cloud Agent DM above.
          </p> : null}
          <p className="mt-1 text-xs text-slate-400">Room Agent voice needs separate room consent and is not available here yet.</p>
          <div className="mt-3 border-t border-white/10 pt-3">
            <p className="mb-2 text-xs font-semibold text-slate-300">Realtime speech runtime · your OpenAI connection</p>
            <div className="flex flex-wrap gap-2">
      <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-live-runtime-controls.live-runtime-agent-mode"
        type="button"
        data-helix-ask-action-item="true"
        aria-label="Live runtime agent mode"
        title={model.lockReason ?? "Live runtime agent mode"}
        className="inline-flex h-10 shrink-0 snap-center items-center gap-2 rounded-full border border-sky-300/45 bg-sky-400/12 px-3 text-sm font-medium text-sky-100 transition hover:bg-sky-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/70 disabled:opacity-60"
        disabled={selectionDisabled}
        onClick={cycleMode}
      >
        <Radio className="h-4 w-4" />
        <span>{labelForMode(mode)}</span>
      </button>
      {model.authoritySelectorVisible ? <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-live-runtime-controls.live-runtime-agent-authority"
        type="button"
        data-helix-ask-action-item="true"
        aria-label="Live runtime agent authority"
        title={model.lockReason ?? "Live runtime agent authority"}
        className="inline-flex h-10 shrink-0 snap-center items-center gap-2 rounded-full border border-emerald-300/45 bg-emerald-400/12 px-3 text-sm font-medium text-emerald-100 transition hover:bg-emerald-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/70 disabled:opacity-60"
        disabled={selectionDisabled}
        onClick={cycleAuthority}
      >
        <ShieldCheck className="h-4 w-4" />
        <span>{labelForAuthority(authority)}</span>
      </button> : null}
      <LiveConnectionSettingsButton model={mode === "live_voice_mini" ? "gpt-realtime-2.1-mini" : "gpt-realtime-2.1"} repair={Boolean(runtimeFailure)}/>
            </div>
            <p className="mt-2 text-xs text-slate-400">Authority: {labelForAuthority(authority)}. Program actions still require their own grants.</p>
            <p className="mt-1 text-xs text-slate-400">Microphone: {runtime.microphoneEnabled ? "on" : "off"} · visual sharing: {runtime.visualInputEnabled ? "on" : "off"}</p>
            {typeof window.casimirDesktop !== "undefined" && notificationPermission !== "granted" &&
              notificationPermission !== "unsupported" ? <button type="button"
                className="mt-2 rounded-md border border-amber-300/40 px-2 py-1 text-xs text-amber-100"
                onClick={() => void Notification.requestPermission().then(setNotificationPermission)}>
                Enable Windows renewal reminders
              </button> : null}
          </div>
        </PopoverContent>
      </Popover>
      {runtimeFailure ? (
        <span
          role="status"
          aria-live="polite"
          data-helix-ask-realtime-failure={runtimeFailure.code}
          data-retryable={runtimeFailure.retryable ? "true" : "false"}
          title={runtimeFailure.detail}
          className="inline-flex h-10 shrink-0 snap-center items-center gap-2 border-l border-rose-300/25 px-3 text-sm font-medium text-rose-100"
        >
          <TriangleAlert className="h-4 w-4 text-rose-300" />
          <span>{runtimeFailure.label}</span>
        </span>
      ) : null}
      {model.sharedRealtimeRoomsAllowed ? (
        <HelixAskSharedLiveRoomControls
          realtimeSessionId={runtime.realtimeSessionId}
          runtimeActive={runtime.active}
          realtimeModel={mode === "live_voice_mini" ? "gpt-realtime-2.1-mini" : "gpt-realtime-2.1"}
          onActiveRoomChange={onActiveSharedRoomChange}
          onRoomTextOwnerChange={onRoomTextOwnerChange}
          onSelectRoomChannel={onSelectRoomChannel}
          onSelectRoomMission={onSelectRoomMission}
          onHostedRoomTextOwnerChange={onHostedRoomTextOwnerChange}
          onDiscordVoiceRenewalRequest={setDiscordRenewalRequest}
          onSelectHostedRoomChannel={onSelectHostedRoomChannel}
          onSelectHostedRoomMission={onSelectHostedRoomMission}
          onVisualSourceCaptureRequested={onVisualInputEnableRequested}
          onSharedTransportChange={setSharedRoomTransportBound}
          onHostTransportInvalidated={() => {
            void runtime.stop();
          }}
          onOwnerRoomClosed={() => {
            void runtime.stop();
          }}
        />
      ) : null}
      {runtime.active ? (
        <>
          <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-live-runtime-controls.runtime-set-microphone-enabled-runtime-microphone-enabled"
            type="button"
            data-helix-ask-action-item="true"
            aria-label={runtime.microphoneEnabled
              ? "Disable Live Voice microphone"
              : "Enable Live Voice microphone"}
            aria-pressed={runtime.microphoneEnabled}
            title={runtime.microphoneEnabled
              ? "Disable Live Voice microphone"
              : "Enable Live Voice microphone"}
            className={`inline-flex h-10 shrink-0 snap-center items-center gap-2 rounded-full border px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200/70 ${
              runtime.microphoneEnabled
                ? "border-emerald-300/55 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/20"
                : "border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
            }`}
            data-live-microphone-enabled={runtime.microphoneEnabled ? "true" : "false"}
            onClick={() => runtime.setMicrophoneEnabled(!runtime.microphoneEnabled)}
          >
            <Mic className={`h-4 w-4 ${runtime.microphoneEnabled ? "animate-pulse" : ""}`} />
            <span>{runtime.microphoneEnabled ? "Mic On" : "Mic Off"}</span>
          </button>
          {model.visualInputAllowed ? <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-live-runtime-controls.toggle-visual-input"
            type="button"
            data-helix-ask-action-item="true"
            data-live-visual-input-enabled={runtime.visualInputEnabled ? "true" : "false"}
            aria-label={runtime.visualInputEnabled
              ? "Stop sharing visual frames with GPT Live"
              : "Share visual frames with GPT Live"}
            aria-pressed={runtime.visualInputEnabled}
            title={runtime.visualInputError ?? (runtime.visualInputEnabled
              ? runtime.visualInputProviderImageConfirmedFrameCount > 0
                ? `GPT Live Vision provider confirmed image context for ${runtime.visualInputProviderImageConfirmedFrameCount} of ${runtime.visualInputFrameCount} queued frames`
                : runtime.visualInputProviderAcknowledgedFrameCount > 0
                  ? `GPT Live Vision provider acknowledged ${runtime.visualInputProviderAcknowledgedFrameCount} of ${runtime.visualInputFrameCount} items; awaiting input_image confirmation`
                : runtime.visualInputFrameCount > 0
                  ? `GPT Live Vision queued ${runtime.visualInputFrameCount} frames on the Realtime transport; awaiting provider acknowledgement`
                : "GPT Live Vision is enabled and waiting for the selected Screen or Camera source; captures run automatically every 10 seconds (0 sent)"
              : "Enable GPT Live Vision and start the selected Screen or Camera source with automatic 10-second captures")}
            className={`inline-flex h-10 shrink-0 snap-center items-center gap-2 rounded-full border px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 ${
              runtime.visualInputEnabled
                ? "border-cyan-300/55 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/20"
                : "border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
            }`}
            onClick={toggleVisualInput}
          >
            {runtime.visualInputEnabled ? (
              <Eye className="h-4 w-4 animate-pulse" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
            <span>{runtime.visualInputEnabled ? "Vision On" : "Vision Off"}</span>
          </button> : null}
        </>
      ) : null}
      {workerRelayIndicator ? (
        <span
          role="status"
          aria-live="polite"
          data-helix-ask-worker-relay-status={runtime.workerRelayStatus}
          className="inline-flex h-10 shrink-0 snap-center items-center gap-2 border-l border-white/15 px-3 text-sm font-medium text-slate-100"
        >
          {workerRelayIndicator.icon === "checking" ? (
            <LoaderCircle className="h-4 w-4 animate-spin text-cyan-200" />
          ) : workerRelayIndicator.icon === "speaking" ? (
            <Volume2 className="h-4 w-4 text-emerald-200" />
          ) : (
            <CircleCheck className="h-4 w-4 text-amber-200" />
          )}
          <span>{workerRelayIndicator.label}</span>
        </span>
      ) : null}
    </>
  );
}
