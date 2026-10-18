import React, {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  CheckCircle2,
  CircleHelp,
  ClipboardCheck,
  ExternalLink,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import {
  parseDesktopMcpTunnelState,
  type DesktopMcpTunnelState,
} from "@shared/desktop-mcp-tunnel";
import {
  HELIX_AGENT_CLIENT_PROFILES,
  helixAgentConnectionStatusSchema,
  type HelixAgentClientProfileId,
  type HelixAgentConnectionStatus,
} from "@shared/helix-agent-client-profile";
import {
  parseDesktopCodexPluginState,
  type DesktopCodexPluginState,
} from "@shared/codex-plugin";
import AgentAccountBindingReadiness from "./AgentAccountBindingReadiness";
import ConnectionExpiryNotice from "./ConnectionExpiryNotice";
import ReasoningClaimHandle from "./ReasoningClaimHandle";
import DurableTaskPairing from "./DurableTaskPairing";
import {
  deriveHelixAgentSetupNextAction,
  HELIX_AGENT_SETUP_PROCEDURE,
  PERSONAL_MCP_STARTUP_REQUEST,
} from "@shared/helix-agent-setup-procedure";
import EnvironmentSessionReadyUp from "./EnvironmentSessionReadyUp";
import EnvironmentSessionPreparationRequest from "./EnvironmentSessionPreparationRequest";
import {
  AGENT_CONNECTION_SETUP_STORAGE_KEY,
  INITIAL_AGENT_CONNECTION_SETUP_STATE,
  agentConnectionSetupReducer,
  connectionSetupGuidanceProfile,
  persistableAgentConnectionSetup,
  restoreAgentConnectionSetup,
  type AgentConnectionSetupStep,
} from "./agentConnectionSetupState";
import { CASIMIRBOT_PUBLIC_ORIGIN } from "@/lib/agent-access/agentAccessContent";
import { useAgiChatStore } from "@/store/useAgiChatStore";
import { useWorkspaceMemoryRegistryStore } from "@/store/useWorkspaceMemoryRegistryStore";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";
import { AGENT_CONNECTION_INVALIDATED_EVENT } from "@/lib/agent-access/connectionObservation";
import {
  inspectLatestReasoningBinding,
  inspectReasoningBinding,
  issueReasoningBindingClaim,
  revokeReasoningBinding,
  type BrowserReasoningBinding,
} from "@/lib/agent-access/reasoningTaskBinding";
import {
  buildAgentHarnessOnboardingDiagnostic,
  type AgentHarnessOnboardingPhase,
} from "./agentHarnessOnboarding";
import { resumePrivateLabNativeStartup } from "./privateLabNativeStartup";
import {
  HELIX_WORKSTATION_GUIDANCE_EVENT,
  coerceWorkstationGuidanceRequest,
  consumePendingWorkstationGuidance,
  requestWorkstationGuidance,
} from "@/lib/workstation/workstationGuidance";

export const AGENT_CONNECTION_READINESS_ENDPOINT =
  "/api/account/session/agent-connections/readiness";
export const FULL_HARNESS_TRUST_ENDPOINT =
  "/api/desktop/mcp-tunnel-transition/full-harness-trust";
const REASONING_BIND_CONTROL_ID =
  "workstation.panel.agent-access.agent-connection-setup.bind-current-helix-chat";

type FullHarnessTrust = Readonly<{
  schema: "helix.installed_device_full_harness_trust.v1";
  trusted: boolean;
  device_ref: string;
  policy_revision: number;
  authority_limited_to_tunnel_transport: true;
  environment_authority_granted: false;
  trading_authority_granted: false;
  answer_authority: false;
  terminal_eligible: false;
}>;

const parseFullHarnessTrust = (value: unknown): FullHarnessTrust | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.schema !== "helix.installed_device_full_harness_trust.v1" ||
    typeof candidate.trusted !== "boolean" ||
    typeof candidate.device_ref !== "string" ||
    typeof candidate.policy_revision !== "number" ||
    !Number.isSafeInteger(candidate.policy_revision) || candidate.policy_revision < 0 ||
    candidate.authority_limited_to_tunnel_transport !== true ||
    candidate.environment_authority_granted !== false ||
    candidate.trading_authority_granted !== false ||
    candidate.answer_authority !== false ||
    candidate.terminal_eligible !== false
  )
    return null;
  return candidate as FullHarnessTrust;
};

const continuationExplanation = (
  continuation: HelixAgentConnectionStatus["readiness"]["continuation_readiness"],
): string => {
  switch (continuation) {
    case "ready":
      return "Helix can deliver steering to this attached task.";
    case "polling":
      return "This attached task can pick up steering while its AI client is polling.";
    case "monitor_only":
      return "Helix can observe public checkpoints, but cannot send messages to this task.";
    case "unavailable":
      return "Helix sees harness tool activity only and cannot send messages to this task.";
  }
};

type RemoteState =
  | { kind: "idle" | "loading" | "signed_out" | "unavailable" }
  | { kind: "loaded"; status: HelixAgentConnectionStatus; refreshing?: boolean; readFailed?: boolean };

const restore = () => {
  if (typeof window === "undefined")
    return INITIAL_AGENT_CONNECTION_SETUP_STATE;
  return restoreAgentConnectionSetup(
    window.localStorage.getItem(AGENT_CONNECTION_SETUP_STORAGE_KEY),
  );
};

export function AgentConnectionSetup() {
  const [setup, dispatch] = useReducer(
    agentConnectionSetupReducer,
    undefined,
    restore,
  );
  const nativeHarnessControlAvailable = Boolean(window.casimirDesktop?.startMcpTunnel);
  const [remote, setRemote] = useState<RemoteState>({ kind: "idle" });
  const [codexPlugin, setCodexPlugin] =
    useState<DesktopCodexPluginState | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [presentationError, setPresentationError] = useState<string | null>(null);
  const [disconnectConfirm, setDisconnectConfirm] = useState<{
    profileRef:string; bindingRef:string; clientProfile:HelixAgentClientProfileId; generation:number;
  } | null>(null);
  const disconnectGeneration=useRef(0),disconnectInFlight=useRef(false);
  const [disconnectBusy,setDisconnectBusy]=useState(false);
  useEffect(()=>{
    disconnectGeneration.current++;setDisconnectConfirm(null);
    return()=>{disconnectGeneration.current++;};
  },[setup.selectedProfile]);
  const activeChatId = useAgiChatStore((state) => state.activeId);
  const rememberReasoningTaskBinding = useAgiChatStore(
    (state) => state.rememberReasoningTaskBinding,
  );
  const [reasoningBinding, setReasoningBinding] =
    useState<BrowserReasoningBinding | null>(null);
  const [claimHandle, setClaimHandle] = useState<string | null>(null);
  const [bindingBusy, setBindingBusy] = useState(false);
  const [selectedRunVerification, setSelectedRunVerification] = useState<string | null>(null);
  const [onboardingPhase, setOnboardingPhase] =
    useState<AgentHarnessOnboardingPhase>("idle");
  const [onboardingTunnel, setOnboardingTunnel] =
    useState<DesktopMcpTunnelState | null>(null);
  const [transportInspection, setTransportInspection] = useState<"unverified" | "checking" | "observed" | "unavailable">("unverified");
  const [transportInspectionRequest, setTransportInspectionRequest] = useState(0);
  const [setupRequestCopyStatus, setSetupRequestCopyStatus] = useState("");
  useEffect(() => {
    if (!setup.selectedProfile) return;
    const inspect = window.casimirDesktop?.getMcpTunnelState;
    if (!inspect) { setTransportInspection("unavailable"); return; }
    let active = true;
    let settled = false;
    let lastTransportState: string | null = null;
    let recheckTimer: number | undefined;
    setTransportInspection("checking");
    const timer = window.setTimeout(() => {
      settled = true;
      if (active) setTransportInspection("unavailable");
    }, 5_000);
    const observe = (candidate: unknown) => {
      if (!active) return;
      const parsed = parseDesktopMcpTunnelState(candidate);
      setOnboardingTunnel(parsed);
      setTransportInspection(parsed ? "observed" : "unavailable");
      return parsed;
    };
    const unsubscribe = window.casimirDesktop?.onMcpTunnelState?.((candidate) => {
      settled = true;
      window.clearTimeout(timer);
      const tunnel = observe(candidate);
      if (!tunnel || !setup.selectedProfile) return;
      const transition = `${tunnel.status}:${tunnel.scope}:${tunnel.ready}:${tunnel.processRunning}`;
      if (transition === lastTransportState) return;
      lastTransportState = transition;
      // The native event is only a reason to ask the server again. It never
      // proves an authenticated task check-in, pairing, or action authority.
      if (recheckTimer !== undefined) window.clearTimeout(recheckTimer);
      recheckTimer = window.setTimeout(() => {
        recheckTimer = undefined;
        void guidanceRefresh.current();
      }, 200);
    });
    // Read-only native inspection. An IPC response is not an authenticated
    // task check-in, pairing consent, or permission to execute an action.
    Promise.resolve().then(() => inspect()).then(candidate => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      const tunnel = observe(candidate);
      if (tunnel) lastTransportState = `${tunnel.status}:${tunnel.scope}:${tunnel.ready}:${tunnel.processRunning}`;
    }).catch(() => {
      if (!active || settled) return;
      settled = true;
      window.clearTimeout(timer);
      setTransportInspection("unavailable");
    });
    return () => {
      active = false;
      window.clearTimeout(timer);
      if (recheckTimer !== undefined) window.clearTimeout(recheckTimer);
      unsubscribe?.();
    };
  }, [setup.selectedProfile, transportInspectionRequest]);
  const [diagnosticStatus, setDiagnosticStatus] = useState<string | { kind: "binding_check" } | null>(null);
  const [diagnosticPreview, setDiagnosticPreview] = useState<string | null>(null);
  const diagnosticGeneration = useRef(0);
  useEffect(() => () => { diagnosticGeneration.current++; }, []);
  const [fullHarnessTrust, setFullHarnessTrust] =
    useState<FullHarnessTrust | null>(null);
  const [trustBusy, setTrustBusy] = useState(false);
  const [trustStatus, setTrustStatus] = useState<string | null>(null);
  const [trustRecoveryPanel, setTrustRecoveryPanel] = useState<"account-session" | "connections-billing-security" | null>(null);
  const [trustReadBusy, setTrustReadBusy] = useState(false);
  const [trustReadFailed, setTrustReadFailed] = useState(false);
  const [trustReadAccountBlocker, setTrustReadAccountBlocker] =
    useState<"session" | "developer" | null>(null);
  const [trustNeedsRecheck, setTrustNeedsRecheck] = useState(false);
  const trustRead = useRef<{ generation: number; controller?: AbortController }>({ generation: 0 });
  const trustMutation = useRef<{ generation: number; controller?: AbortController }>({ generation: 0 });
  const setupTitleRef = useRef<HTMLHeadingElement | null>(null);
  const previousViewedStep = useRef(setup.viewedStep);
  const skipNextProfileRefresh = useRef(false);
  const pendingHarnessStart = useRef(false);
  const revealBindingAfterStart = useRef(false);
  const suppressLocalGuidanceHandling = useRef(false);
  const readinessRead = useRef<{ generation: number; controller?: AbortController }>({ generation: 0 });
  useEffect(() => () => {
    readinessRead.current.generation++;
    readinessRead.current.controller?.abort();
    trustMutation.current.generation++;
    trustMutation.current.controller?.abort();
  }, []);

  useEffect(() => {
    const serialized = JSON.stringify(persistableAgentConnectionSetup(setup));
    const registry = useWorkspaceMemoryRegistryStore.getState();
    const artifactId = "agent-connection-setup:preferences";
    const previous = registry.artifacts[artifactId];
    if (previous && window.localStorage.getItem(AGENT_CONNECTION_SETUP_STORAGE_KEY) === serialized) return;
    window.localStorage.setItem(AGENT_CONNECTION_SETUP_STORAGE_KEY, serialized);
    // Only the selected application and viewed step are profile preferences.
    // Consent, presence, claims and authority remain outside this snapshot.
    registry.upsertArtifact({
      artifact_id: artifactId,
      artifact_type: "workstation_session_draft",
      storage_key: AGENT_CONNECTION_SETUP_STORAGE_KEY,
      storage_backend: "localStorage",
      owner_scope: previous?.owner_scope ?? "browser_guest",
      profile_id: previous?.profile_id ?? null,
      sync_status: previous?.sync_status ?? "profile_candidate",
      title: "Agent connection preferences",
      size_bytes: new TextEncoder().encode(serialized).byteLength,
    });
  }, [setup]);

  useEffect(() => {
    if (previousViewedStep.current === setup.viewedStep) return;
    previousViewedStep.current = setup.viewedStep;
    setupTitleRef.current?.focus();
  }, [setup.viewedStep]);

  const refresh = useCallback(
    async (
      profileOverride?: HelixAgentClientProfileId,
      viewedStepOverride?: AgentConnectionSetupStep,
    ): Promise<void> => {
      const selectedProfile = profileOverride ?? setup.selectedProfile;
      const viewedStep = viewedStepOverride ?? setup.viewedStep;
      if (!selectedProfile) return;
      readinessRead.current.controller?.abort();
      const controller = new AbortController();
      const generation = ++readinessRead.current.generation;
      readinessRead.current.controller = controller;
      let timeoutId: number | undefined;
      setOnboardingPhase("checking_readiness");
      // Keep the consent control mounted when returning to this window. A
      // background read must not remove the target between pointerdown/click.
      // The claim endpoint still validates current identity and presence.
      setRemote((current) => current.kind === "loaded"
        ? { ...current, refreshing: true }
        : { kind: "loading" });
      setOperationError(null);
      try {
        const { response, body } = await Promise.race([
          (async () => {
            const response = await fetch(
              `${AGENT_CONNECTION_READINESS_ENDPOINT}?client_profile=${encodeURIComponent(selectedProfile)}`,
              {
                credentials: "same-origin",
                cache: "no-store",
                headers: { Accept: "application/json" },
                signal: controller.signal,
              },
            );
            const body = response.status === 401 ? null : await response.json();
            return { response, body };
          })(),
          new Promise<never>((_, reject) => {
            timeoutId = window.setTimeout(() => {
              controller.abort();
              reject(new Error("readiness_timeout"));
            }, 10_000);
          }),
        ]);
        if (generation !== readinessRead.current.generation) return;
        if (response.status === 401) {
          setOnboardingPhase("action_required");
          setRemote({ kind: "signed_out" });
          dispatch({ type: "view", step: "account" });
          return;
        }
        if (!response.ok) throw new Error("readiness unavailable");
        const parsed = helixAgentConnectionStatusSchema.safeParse(
          body,
        );
        if (!parsed.success) throw new Error("invalid readiness projection");
        setRemote({ kind: "loaded", status: parsed.data });
        setOnboardingPhase(
          parsed.data.readiness.agent_ready ? "ready" : "action_required",
        );
        if (parsed.data.readiness.client_authorization !== "active") {
          dispatch({ type: "view", step: "authorize" });
          suppressLocalGuidanceHandling.current = true;
          try {
            requestWorkstationGuidance({
              kind: "user_attention",
              panelId: "agent-access",
              targetId: "auth0-account-link",
              label:
                "Agent access needs authentication. Review the account status and choose Link Auth0 to open the secure native sign-in window.",
              durationMs: 12_000,
            });
          } finally {
            suppressLocalGuidanceHandling.current = false;
          }
        } else if (
          parsed.data.proof_basis === "authenticated_presence_tool" &&
          parsed.data.readiness.agent_ready
        ) {
          dispatch({ type: "view", step: "ready" });
        } else if (parsed.data.catalog_reenumeration_required) {
          dispatch({ type: "view", step: "check" });
        } else if (revealBindingAfterStart.current) {
          dispatch({ type: "view", step: "check" });
          setDiagnosticStatus("Account access is linked. Waiting for this AI task to check in through CasimirBot. This page checks automatically; Check connection checks now. Neither action wakes the AI task or approves binding.");
        } else if (viewedStep === "account" || viewedStep === "authorize") {
          dispatch({ type: "view", step: "connect" });
          setDiagnosticStatus("This exact AI task has not passed its connection check. Ask the same AI task to refresh its CasimirBot presence, then use Retry. Starting the harness alone does not create a task binding.");
        }
      } catch {
        if (generation !== readinessRead.current.generation) return;
        setOnboardingPhase("action_required");
        setRemote(current => current.kind === "loaded"
          ? { ...current, refreshing: false, readFailed: true }
          : { kind: "unavailable" });
        setOperationError("The connection check did not finish. Recheck connection is available; binding waits for a fresh result. Any selected run is retained.");
      } finally {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      }
    },
    [setup.selectedProfile, setup.viewedStep],
  );
  const guidanceRefresh = useRef(refresh);
  guidanceRefresh.current = refresh;
  useEffect(() => {
    if (!setup.selectedProfile) return;
    // Account events invalidate observations only. Never accept event identity,
    // start transport, or infer consent; refresh validates the server response
    // and supersedes any older in-flight readiness request.
    const recheckAccount = () => {
      disconnectGeneration.current++;setDisconnectConfirm(null);setOperationError(null);
      void guidanceRefresh.current();
    };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, recheckAccount);
    const invalidateConnection = () => { setRemote({kind:"loading"}); recheckAccount(); };
    window.addEventListener(AGENT_CONNECTION_INVALIDATED_EVENT, invalidateConnection);
    return () => {
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, recheckAccount);
      window.removeEventListener(AGENT_CONNECTION_INVALIDATED_EVENT, invalidateConnection);
    };
  }, [setup.selectedProfile]);
  const refreshBusy = useRef(false);
  const readinessRefreshing = remote.kind === "loading" ||
    (remote.kind === "loaded" && remote.refreshing === true);
  refreshBusy.current = readinessRefreshing || bindingBusy;

  useEffect(() => {
    if (!setup.selectedProfile) return;
    if (skipNextProfileRefresh.current) {
      skipNextProfileRefresh.current = false;
      return;
    }
    void refresh();
  }, [setup.selectedProfile]);

  useEffect(() => {
    if (!setup.selectedProfile || setup.viewedStep !== "ready") return;
    let pending: number | undefined;
    const recheckOnReturn = () => {
      if (document.visibilityState === "hidden" || pending !== undefined) return;
      // Focus and visibility commonly arrive together. Coalesce them into one
      // read; never synthesize presence or activate the human-only bind control.
      pending = window.setTimeout(() => {
        pending = undefined;
        if (document.visibilityState !== "hidden" && !refreshBusy.current) {
          void guidanceRefresh.current();
        }
      }, 200);
    };
    window.addEventListener("focus", recheckOnReturn);
    document.addEventListener("visibilitychange", recheckOnReturn);
    return () => {
      if (pending !== undefined) window.clearTimeout(pending);
      window.removeEventListener("focus", recheckOnReturn);
      document.removeEventListener("visibilitychange", recheckOnReturn);
    };
  }, [setup.selectedProfile, setup.viewedStep]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("native_presentation") !== "reasoning-binding")
      return;
    url.searchParams.delete("native_presentation");
    window.history.replaceState(window.history.state, "", url.toString());
    setOnboardingPhase("checking_readiness");
    if (setup.selectedProfile === "codex_app") {
      void refresh("codex_app", "account");
    } else {
      dispatch({ type: "choose", profile: "codex_app" });
    }
  }, [refresh, setup.selectedProfile]);

  useEffect(() => {
    const inspectTunnel = window.casimirDesktop?.getMcpTunnelState;
    let cancelled = false;
    const retryIds = new Set<number>();
    let presentationGeneration = 0;
    let failedPresentation: unknown = null;
    const handleGuidanceRequest = (candidate: unknown) => {
      if (suppressLocalGuidanceHandling.current) return;
      const request = coerceWorkstationGuidanceRequest(candidate);
      const setupProfile=connectionSetupGuidanceProfile(request?.targetId);
      if (request?.kind === "user_attention" && request.panelId === "agent-access" && setupProfile) {
        // Resume navigation only. Opening setup never starts transport or
        // grants trust, binding, or environment authority.
        revealBindingAfterStart.current = true;
        setPresentationError(null);
        dispatch({ type: "choose", profile: setupProfile });
        void guidanceRefresh.current(setupProfile, "account");
        return;
      }
      if (!inspectTunnel) return;
      const presentsTrust = request?.targetId === "full-harness-trust";
      const presentsAgentAccountLink =
        request?.targetId === "auth0-account-link";
      const presentsReasoningBinding =
        request?.controlId === REASONING_BIND_CONTROL_ID;
      if (
        request?.kind !== "user_attention" ||
        request.panelId !== "agent-access" ||
        (!presentsTrust &&
          !presentsAgentAccountLink &&
          !presentsReasoningBinding)
      )
        return;
      const generation = ++presentationGeneration;
      failedPresentation = null;
      for (const retryId of retryIds) window.clearTimeout(retryId);
      retryIds.clear();
      setPresentationError(null);
      setOperationError(null);
      setOnboardingPhase("checking_readiness");
      dispatch({ type: "choose", profile: "codex_app" });
      const reportPresentationFailure = (message: string) => {
        if (cancelled || generation !== presentationGeneration) return;
        failedPresentation = candidate;
        setOnboardingPhase("action_required");
        setPresentationError(message);
      };
      const inspectPresentedTunnel = (attempt: number) => {
        void inspectTunnel()
          .then(parseDesktopMcpTunnelState)
          .then((tunnel) => {
            if (cancelled || generation !== presentationGeneration) return;
            if (tunnel?.ready && tunnel.scope !== "full_helix_agent") {
              setOnboardingTunnel(tunnel);
              reportPresentationFailure(
                "The native connection is ready for Device Check and supervisor coordination. Full Harness scope is not active. Use Start Harness to request the finite Full Harness lease; this does not approve task pairing or game actions.",
              );
              return;
            }
            if (!tunnel?.ready || tunnel.scope !== "full_helix_agent") {
              if (attempt >= 20) {
                reportPresentationFailure(
                  "The binding panel request arrived, but the native Full Harness transport did not become ready within 5 seconds. Binding is not ready. Ask the connected AI task to inspect the transport; repeating account sign-in will not complete this check.",
                );
                return;
              }
              const retryId = window.setTimeout(() => {
                retryIds.delete(retryId);
                inspectPresentedTunnel(attempt + 1);
              }, 250);
              retryIds.add(retryId);
              return;
            }
            setOnboardingTunnel(tunnel);
            setOnboardingPhase("checking_readiness");
            void guidanceRefresh.current("codex_app", "account");
          })
          .catch(() => reportPresentationFailure(
            "CasimirBot could not read native Full Harness transport readiness. Binding readiness is unverified. Ask the connected AI task to inspect the native transport.",
          ));
      };
      inspectPresentedTunnel(0);
    };
    const handleGuidance = (event: Event) => {
      const candidate = (event as CustomEvent<unknown>).detail;
      handleGuidanceRequest(candidate);
      const request = coerceWorkstationGuidanceRequest(candidate);
      if (
        request?.kind === "user_attention" &&
        request.panelId === "agent-access" &&
        (connectionSetupGuidanceProfile(request.targetId) !== null || request.targetId === "full-harness-trust" ||
          request.targetId === "auth0-account-link" ||
          request.controlId === REASONING_BIND_CONTROL_ID)
      ) {
        consumePendingWorkstationGuidance();
      }
    };
    window.addEventListener(HELIX_WORKSTATION_GUIDANCE_EVENT, handleGuidance);
    const pending = consumePendingWorkstationGuidance();
    if (pending) handleGuidanceRequest(pending);
    void window.casimirDesktop?.getPendingWorkstationGuidance?.()
      .then((candidate) => {
        if (!cancelled && candidate) handleGuidanceRequest(candidate);
      })
      .catch(() => undefined);
    const unsubscribeTunnel = window.casimirDesktop?.onMcpTunnelState?.((candidate) => {
      if (cancelled || !failedPresentation) return;
      const tunnel = parseDesktopMcpTunnelState(candidate);
      if (!tunnel?.ready || tunnel.scope !== "full_helix_agent") return;
      // A late native recovery resumes only the prior presentation/readiness
      // check. It does not start transport, issue a claim or approve a run.
      handleGuidanceRequest(failedPresentation);
    });
    return () => {
      cancelled = true;
      unsubscribeTunnel?.();
      for (const retryId of retryIds) window.clearTimeout(retryId);
      retryIds.clear();
      window.removeEventListener(
        HELIX_WORKSTATION_GUIDANCE_EVENT,
        handleGuidance,
      );
    };
  }, []);

  const readFullHarnessTrust = useCallback(async () => {
    if (trustRead.current.controller || trustMutation.current.controller) return;
    const controller = new AbortController();
    const generation = ++trustRead.current.generation;
    trustRead.current.controller = controller;
    let timeoutId: number | undefined;
    setTrustReadBusy(true);
    try {
      // Bound both response and body reads. Retrying this observation never
      // submits trust, starts transport or retries an unknown consent mutation.
      const trust = await Promise.race([
        (async () => {
          const response = await fetch(FULL_HARNESS_TRUST_ENDPOINT, {
            credentials: "same-origin",
            cache: "no-store",
            headers: { Accept: "application/json" },
            signal: controller.signal,
          });
          if (!response.ok) {
            const failure = await response.json().catch(() => null);
            if (response.status === 401 && failure?.error === "transition_account_session_required")
              throw new Error("trust_read_account_session_required");
            if (response.status === 403 && failure?.error === "transition_developer_account_required")
              throw new Error("trust_read_developer_account_required");
            throw new Error("trust_read_unavailable");
          }
          const body = (await response.json()) as { trust?: unknown };
          const parsed = parseFullHarnessTrust(body?.trust);
          if (!parsed) throw new Error("trust_read_invalid");
          return parsed;
        })(),
        new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(() => {
            controller.abort();
            reject(new Error("trust_read_timeout"));
          }, 10_000);
        }),
      ]);
      if (generation !== trustRead.current.generation) return;
      setFullHarnessTrust(trust);
      setTrustReadFailed(false);
      setTrustReadAccountBlocker(null);
      setTrustRecoveryPanel(null);
      setTrustNeedsRecheck(false);
      setTrustStatus(null);
    } catch (error) {
      if (generation !== trustRead.current.generation) return;
      setFullHarnessTrust(null);
      setTrustReadFailed(true);
      const blocker = error instanceof Error && error.message === "trust_read_account_session_required"
        ? "session" : error instanceof Error && error.message === "trust_read_developer_account_required"
          ? "developer" : null;
      setTrustReadAccountBlocker(blocker);
      if (blocker) setTrustRecoveryPanel("account-session");
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      if (generation === trustRead.current.generation) {
        trustRead.current.controller = undefined;
        setTrustReadBusy(false);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window.casimirDesktop?.getRuntimeSnapshot !== "function") return;
    void readFullHarnessTrust();
    const recheckTrust = () => {
      // Account events invalidate presentation; their payload never grants trust.
      // An unsettled owner-approved mutation must retain its reconciliation path.
      if (trustMutation.current.controller) return;
      trustRead.current.generation++;
      trustRead.current.controller?.abort();
      trustRead.current.controller = undefined;
      setFullHarnessTrust(null);
      void readFullHarnessTrust();
    };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, recheckTrust);
    return () => {
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, recheckTrust);
      trustRead.current.generation++;
      trustRead.current.controller?.abort();
      trustRead.current.controller = undefined;
    };
  }, [readFullHarnessTrust]);

  useEffect(() => {
    if (setup.selectedProfile !== "codex_app") return;
    const inspect = window.casimirDesktop?.getCodexPluginState;
    if (!inspect) return;
    let cancelled = false;
    void inspect()
      .then((candidate) => {
        if (!cancelled) setCodexPlugin(parseDesktopCodexPluginState(candidate));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [setup.selectedProfile]);

  const selected = setup.selectedProfile
    ? HELIX_AGENT_CLIENT_PROFILES[setup.selectedProfile]
    : null;
  const status = remote.kind === "loaded" ? remote.status : null;
  const setupNextAction = useMemo(() => deriveHelixAgentSetupNextAction({
    profileSelected: Boolean(setup.selectedProfile),
    statusFresh: remote.kind === "loaded" && !remote.readFailed,
    readiness: status?.readiness,
    authenticatedMcpCallObserved: status?.proof_basis === "authenticated_presence_tool",
    transport: status?.proof_basis === "authenticated_presence_tool"
      ? "ready"
      : transportInspection !== "observed"
        ? "unknown"
        : onboardingTunnel?.ready && onboardingTunnel.processRunning
          ? "ready" : "not_ready",
  }), [remote, setup.selectedProfile, status?.proof_basis, status?.readiness,
    transportInspection, onboardingTunnel]);
  const acceptedDurablePolling = Boolean(reasoningBinding?.pairing_id &&
    reasoningBinding.status === "active" && reasoningBinding.continuation_transport === "polling" &&
    reasoningBinding.helix_conversation_id === activeChatId &&
    reasoningBinding.service_instance_ref === status?.service_instance_ref &&
    reasoningBinding.expires_at && Date.parse(reasoningBinding.expires_at) > Date.now());
  const connectedToolActivityOnly = remote.kind === "loaded" && !remote.readFailed &&
    status?.readiness.client_presence === "online" &&
    status.readiness.continuation_readiness === "unavailable" &&
    status.thread_observability_bridge.negotiated_level === "tool_activity_only";
  const continuationRecovery = connectedToolActivityOnly
    ? "This task is connected for tool activity. For personal Message Codex requests, approve the exact-task pairing above; the task can pick up queued steering by MCP while it is running. The separate session/run binding below requires continuation-ready support. Repeating the same presence refresh cannot enable that optional binding."
    : "This task's continuation was unavailable at the last check. Ask that same AI task to refresh its CasimirBot presence. While this panel is visible, it checks automatically every five seconds and enables binding when the server confirms readiness.";
  // Connection guidance follows the latest read; operation receipts such as
  // copying diagnostics remain separate strings, not cached readiness proof.
  const diagnosticMessage = typeof diagnosticStatus === "string" ? diagnosticStatus : diagnosticStatus
    ? status?.readiness.agent_ready && acceptedDurablePolling
      ? "Approved task pairing checked. The same task can pick up steering while running; this check does not renew pairing or environment permissions."
      : status?.readiness.agent_ready && status.readiness.continuation_readiness !== "unavailable"
        ? "Connection checked. Review the exact-task binding below; Start Harness has not approved it for you."
        : continuationRecovery
    : null;
  const bindingGuidanceLabel = acceptedDurablePolling
    ? "Keep the approved exact-task pairing. Polling pickup requires the AI task to run."
    : status?.readiness.continuation_readiness === "unavailable"
    ? connectedToolActivityOnly
      ? "Personal task polling uses the owner-approved pairing above; this optional session/run binding needs continuation-ready support."
      : "Recheck this AI task's connection before binding."
    : !status?.verified_run_association
      ? "For Minecraft, prepare a room below and wait for a verified run before binding. Chat-only binding remains optional."
      : "Review and bind the current Helix chat to this exact AI task. This is a user consent action.";
  const bindingDisabledReason = !status ? null
    : !activeChatId
      ? "Open or create a Helix chat before binding."
      : remote.kind === "loaded" && remote.readFailed === true
        ? "The latest connection check failed. Use Recheck connection; the control will enable after a current read succeeds."
        : !status.client_session_ref
          ? "This AI task has not checked in to the current harness session yet."
          : !status.readiness.agent_ready
            ? "This exact AI task has not passed the current connection check yet."
        : status.readiness.continuation_readiness === "unavailable"
              ? connectedToolActivityOnly
                ? "This optional session/run binding requires continuation-ready presence. Owner-approved personal pairing above can still queue steering for active-task MCP pickup."
                : "Steering pickup is not currently available. Keep this panel open while the same AI task refreshes its presence."
              : bindingBusy
                ? "The current binding request is still being processed."
                : null;

  const waitingForSessionSetup = (setup.viewedStep === "ready" || setup.viewedStep === "check") &&
    status?.readiness.client_authorization === "active" &&
    !status.catalog_reenumeration_required &&
    ((remote.kind === "loaded" && remote.readFailed) ||
      (status.readiness.continuation_readiness === "unavailable" && !acceptedDurablePolling) || !status.readiness.agent_ready ||
      (Boolean(activeChatId) && reasoningBinding?.status !== "active" && !status.verified_run_association));
  useEffect(() => {
    if (!setup.selectedProfile || !["ready", "check"].includes(setup.viewedStep) ||
        !status?.heartbeat_expires_at) return;
    const deadline = Date.parse(status.heartbeat_expires_at);
    if (!Number.isFinite(deadline)) return;
    let timer: number;
    const inspectAtDeadline = () => {
      // This is a status read, never a heartbeat or consent renewal. Keep the
      // selected run mounted while fetching; the server still decides validity.
      if (document.visibilityState === "hidden") return;
      if (refreshBusy.current) {
        timer = window.setTimeout(inspectAtDeadline, 250);
        return;
      }
      void guidanceRefresh.current();
    };
    timer = window.setTimeout(inspectAtDeadline,
      Math.min(2_147_483_647, Math.max(0, deadline - Date.now()) + 50));
    return () => window.clearTimeout(timer);
  }, [setup.selectedProfile, setup.viewedStep, status?.heartbeat_expires_at]);

  useEffect(() => {
    if (!waitingForSessionSetup || !setup.selectedProfile) return;
    // Observe recovery from the authenticated task; never mint a heartbeat,
    // wake a provider, issue a claim, or extend a permission from this UI.
    // A connected task can still be preparing its run. Keep observing until
    // that association is available for human review, or a binding is active.
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden" && !refreshBusy.current) {
        void guidanceRefresh.current();
      }
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [waitingForSessionSetup, setup.selectedProfile]);

  useEffect(() => {
    if (!revealBindingAfterStart.current || setup.viewedStep !== "ready" || !status) return;
    revealBindingAfterStart.current = false;
    setDiagnosticStatus({ kind: "binding_check" });
    // Presentation only: wait until the binding target has mounted and never
    // invoke its human-only control or recursively refresh from our own guide.
    suppressLocalGuidanceHandling.current = true;
    try {
      requestWorkstationGuidance({
        kind: "user_attention", panelId: "agent-access", targetId: "reasoning-task-binding",
        label: bindingGuidanceLabel,
        durationMs: 12000,
      });
    } finally { suppressLocalGuidanceHandling.current = false; }
  }, [setup.viewedStep, status, bindingGuidanceLabel]);

  useEffect(() => {
    if (
      !["check", "ready"].includes(setup.viewedStep) ||
      status?.readiness.client_authorization !== "active"
    )
      return;
    let cancelled = false;
    void inspectLatestReasoningBinding()
      .then((binding) => {
        if (cancelled) return;
        setReasoningBinding(binding);
        rememberReasoningTaskBinding(binding);
      })
      .catch(() => {
        if (cancelled) return;
        setReasoningBinding(null);
        setClaimHandle((current) => {
          if (current) {
            setOperationError(
              "The previous show-once claim is no longer valid on this packaged service. Create a new binding claim; do not retry the old value.",
            );
          }
          return null;
        });
      });
    return () => {
      cancelled = true;
    };
  }, [
    rememberReasoningTaskBinding,
    setup.viewedStep,
    status?.client_session_ref,
    status?.readiness.continuation_readiness,
    status?.readiness.client_authorization,
  ]);

  useEffect(() => {
    if (
      !status?.service_instance_ref ||
      !reasoningBinding?.service_instance_ref ||
      status.service_instance_ref === reasoningBinding.service_instance_ref
    )
      return;
    setReasoningBinding(null);
    setClaimHandle(null);
    setOperationError(
      reasoningBinding.pairing_id
        ? "The packaged service restarted. Recover the existing approved pairing in the same AI task; its consent duration has not changed."
        : "The packaged service restarted, so its previous show-once claim was invalidated. Create a new binding claim for this service run.",
    );
  }, [reasoningBinding?.service_instance_ref, status?.service_instance_ref]);

  useEffect(() => {
    if (!claimHandle || !reasoningBinding?.expires_at) return;
    let cancelled = false;
    const expiresAt = Date.parse(reasoningBinding.expires_at);
    if (!Number.isFinite(expiresAt)) return;
    const reconcileExpiry = async () => {
      try {
        const binding = await inspectReasoningBinding(
          reasoningBinding.reasoning_binding_id,
        );
        if (cancelled) return;
        setClaimHandle(null);
        setReasoningBinding(binding);
        rememberReasoningTaskBinding(binding);
        setOperationError(
          binding.status === "active"
            ? null
            : "The show-once claim expired. Create a new binding claim instead of retrying the old value.",
        );
      } catch {
        if (cancelled) return;
        setClaimHandle(null);
        setReasoningBinding((current) =>
          current?.status === "pending_claim"
            ? { ...current, status: "expired" }
            : current,
        );
        setOperationError(
          "The show-once claim expired. Create a new binding claim instead of retrying the old value.",
        );
      }
    };
    const delay = expiresAt - Date.now();
    if (delay <= 0) {
      void reconcileExpiry();
      return () => {
        cancelled = true;
      };
    }
    const timeoutId = window.setTimeout(() => void reconcileExpiry(), delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    claimHandle,
    reasoningBinding?.expires_at,
    reasoningBinding?.reasoning_binding_id,
    rememberReasoningTaskBinding,
  ]);

  const mcpUrl = selected
    ? `${CASIMIRBOT_PUBLIC_ORIGIN}${selected.endpoint_path}`
    : "";

  const startHarness = async (): Promise<void> => {
    if (
      onboardingPhase === "starting_native_harness" ||
      onboardingPhase === "checking_readiness"
    )
      return;
    if (!nativeHarnessControlAvailable) {
      revealBindingAfterStart.current = false;
      pendingHarnessStart.current = false;
      setOnboardingPhase("checking_readiness");
      setOperationError(null);
      setDiagnosticStatus(
        "This browser panel cannot start the installed private MCP tunnel. It can only check the CasimirBot service at this page's address. Open Agent Access inside the installed CasimirBot app to start the harness, or use MCP to present that native panel; existing task bindings are unchanged.",
      );
      await refresh(setup.selectedProfile ?? "codex_app", setup.viewedStep);
      return;
    }
    setOnboardingPhase("starting_native_harness");
    revealBindingAfterStart.current = true;
    pendingHarnessStart.current = false;
    setOperationError(null);
    setDiagnosticStatus(null);
    let nativeStartFailed = false;
    try {
      const start = window.casimirDesktop?.startMcpTunnel;
      if (start) {
        const resumed = await resumePrivateLabNativeStartup({
          developerAccess: window.casimirDesktop?.localDeveloperAccess,
          startTunnel: () => start({ scope: "full_helix_agent" }),
        });
        setOnboardingTunnel(resumed.tunnel);
        if (resumed.stage !== "transport_ready") throw new Error(resumed.stage);
      }
      pendingHarnessStart.current = false;
      setOnboardingPhase("checking_readiness");
    } catch (error) {
      pendingHarnessStart.current = true;
      nativeStartFailed = true;
      setOnboardingPhase("action_required");
      const stage = error instanceof Error ? error.message : "";
      setDiagnosticStatus(stage === "developer_access_required"
        ? "Private developer access was not approved. Use Activate this private development profile in Account & Sessions, then Start Harness again. No tunnel or task action was attempted."
        : stage === "developer_access_unavailable"
          ? "Private developer access is unavailable. Check the protected vault and signed-in profile in Account & Sessions. No grant or tunnel readiness is inferred."
          : stage === "native_lease_unverified"
            ? "The local grant is active, but its short native lease was not acknowledged by this service. Recheck developer access before starting the tunnel."
            : "CasimirBot could not verify the full native tunnel. The connection check below will identify the next safe action; no provider task or environment action was attempted.");
    } finally {
      if (setup.selectedProfile !== "codex_app")
        skipNextProfileRefresh.current = true;
      dispatch({ type: "choose", profile: "codex_app" });
      if (fullHarnessTrust?.trusted !== true) {
        suppressLocalGuidanceHandling.current = true;
        try {
          requestWorkstationGuidance({
            kind: "user_attention",
            panelId: "agent-access",
            targetId: "full-harness-trust",
            label:
              "Review and choose whether to trust this installed device for short Full Harness tunnel leases and installed local environment application lifecycle.",
            durationMs: 8000,
          });
        } finally {
          suppressLocalGuidanceHandling.current = false;
        }
      }
      await refresh("codex_app", "account");
      if (nativeStartFailed) setOnboardingPhase("action_required");
    }
  };

  const updateFullHarnessTrust = async (trusted: boolean): Promise<void> => {
    if (trustBusy || trustReadBusy || fullHarnessTrust === null || trustMutation.current.controller) return;
    const controller = new AbortController();
    const generation = ++trustMutation.current.generation;
    trustMutation.current.controller = controller;
    let timeoutId: number | undefined;
    setTrustBusy(true);
    setTrustStatus(null);
    setTrustRecoveryPanel(null);
    let parsed: FullHarnessTrust | null = null;
    try {
      const { response, body } = await Promise.race([
        (async () => {
          const response = await fetch(FULL_HARNESS_TRUST_ENDPOINT, {
            method: "PUT",
            credentials: "same-origin",
            cache: "no-store",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({ trusted, expected_policy_revision: fullHarnessTrust.policy_revision }),
          });
          const body = (await response.json()) as { trust?: unknown; error?: unknown };
          return { response, body };
        })(),
        new Promise<never>((_, reject) => {
          timeoutId = window.setTimeout(() => {
            controller.abort();
            reject(new Error("trust_save_timeout"));
          }, 10_000);
        }),
      ]);
      if (generation !== trustMutation.current.generation) return;
      if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "trust_update_unavailable");
      parsed = parseFullHarnessTrust(body.trust);
      if (!parsed) throw new Error("invalid full harness trust projection");
      setFullHarnessTrust(parsed);
      setTrustStatus(
        parsed.trusted
          ? "Trusted-device tunnel approval is on. Every lease remains finite, logged, and revocable."
          : "Trusted-device tunnel approval is off.",
      );
    } catch (error) {
      if (generation !== trustMutation.current.generation) return;
      // Render fixed guidance only. A server message may contain private detail,
      // and a failed/unknown response is not proof that the user is signed out.
      switch (error instanceof Error ? error.message : "") {
        case "device_not_registered":
          setTrustStatus("This device is not registered or is no longer active. Open Connections, Billing & Security, choose Device & Security, and complete registration or recovery with MFA. Then return here to approve Full Harness trust.");
          setTrustRecoveryPanel("connections-billing-security");
          break;
        case "session_required":
        case "transition_account_session_required":
          setTrustStatus("Your profile session is no longer active. Open Account & Sessions to sign in before approving device trust.");
          setTrustRecoveryPanel("account-session");
          break;
        case "transition_developer_account_required":
          setTrustStatus("Full Harness device trust requires a developer account. Check the account type in Account & Sessions.");
          setTrustRecoveryPanel("account-session");
          break;
        case "transition_same_origin_required":
          setTrustStatus("The trust request did not pass the installed app's same-origin check. The approval was rejected; signing in again does not repair this request.");
          break;
        case "transition_native_trust_unavailable":
          setTrustStatus("The installed device-trust service is unavailable. Open Connections, Billing & Security to check native runtime status.");
          setTrustRecoveryPanel("connections-billing-security");
          break;
        case "device_trust_revision_changed":
          setFullHarnessTrust(null);
          setTrustNeedsRecheck(true);
          setTrustStatus("Device trust changed after you reviewed it. Your earlier decision was rejected. Recheck device trust before another decision.");
          break;
        default:
          setFullHarnessTrust(null);
          setTrustNeedsRecheck(true);
          setTrustStatus("CasimirBot could not confirm the trusted-device change. It may have completed. Recheck device trust to read its current state; the change will not be resubmitted automatically.");
      }
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      if (generation === trustMutation.current.generation) {
        trustMutation.current.controller = undefined;
        setTrustBusy(false);
      }
    }
    if (!parsed?.trusted || !pendingHarnessStart.current) return;

    setOnboardingPhase("starting_native_harness");
    try {
      const start = window.casimirDesktop?.startMcpTunnel;
      if (!start) throw new Error("native harness unavailable");
      const tunnel = parseDesktopMcpTunnelState(
        await start({ scope: "full_helix_agent" }),
      );
      if (!tunnel?.ready || tunnel.scope !== "full_helix_agent") {
        throw new Error("full harness did not become ready");
      }
      pendingHarnessStart.current = false;
      setOnboardingTunnel(tunnel);
      setTrustStatus(
        "This device is trusted and the pending Full Harness start resumed successfully.",
      );
      await refresh("codex_app", "account");
    } catch {
      setOnboardingPhase("action_required");
      setTrustStatus(
        "This device is trusted, but the pending Full Harness start still needs attention. Retry Start Harness; do not toggle trust off.",
      );
    }
  };

  const copyOnboardingDiagnostic = async (): Promise<void> => {
    const generation = ++diagnosticGeneration.current;
    setDiagnosticStatus(null);
    setDiagnosticPreview(null);
    let collected: string | null = null;
    let timeoutId: number | undefined;
    try {
      let tunnel = onboardingTunnel;
      const inspectTunnel = window.casimirDesktop?.getMcpTunnelState;
      if (inspectTunnel) {
        tunnel = parseDesktopMcpTunnelState(await Promise.race([
          inspectTunnel(),
          new Promise<never>((_, reject) => {
            timeoutId = window.setTimeout(() => reject(new Error("diagnostic_timeout")), 5000);
          }),
        ]));
        if (generation !== diagnosticGeneration.current) return;
        setOnboardingTunnel(tunnel);
      }
      const diagnostic = buildAgentHarnessOnboardingDiagnostic({
        onboardingPhase,
        setupStep: setup.viewedStep,
        selectedClientProfile: setup.selectedProfile,
        nativeDesktopAvailable:
          typeof window.casimirDesktop?.getRuntimeSnapshot === "function",
        status,
        tunnel,
        reasoningBinding,
      });
      collected = JSON.stringify(diagnostic, null, 2);
      if (generation !== diagnosticGeneration.current) return;
      if (!navigator.clipboard?.writeText)
        throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(collected);
      if (generation !== diagnosticGeneration.current) return;
      setDiagnosticStatus("Sanitized onboarding diagnostics copied.");
    } catch {
      if (generation !== diagnosticGeneration.current) return;
      setDiagnosticPreview(collected);
      setDiagnosticStatus(collected
        ? "Clipboard unavailable. Sanitized diagnostics are shown below for manual selection."
        : "Diagnostics could not be collected. Native transport state remains unverified.");
    } finally {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    }
  };

  const currentCopy = useMemo(() => {
    switch (setup.viewedStep) {
      case "choose":
        return {
          title: "Choose your AI app",
          body: "CasimirBot works with an AI app already on this device. You can change this later.",
        };
      case "account":
        return {
          title: "Sign in to CasimirBot",
          body: "Open account sign-in below. After signing in, return here and retry this check.",
        };
      case "authorize":
        return {
          title: "Authorize agent access",
          body: "Link this CasimirBot profile through the native OAuth window. No token is copied into this chat or page.",
        };
      case "connect":
        return {
          title: `Add CasimirBot to ${selected?.display_name ?? "your AI app"}`,
          body: "This step happens in the AI app. CasimirBot does not edit its settings, approve OAuth, restart it, or create its chat.",
        };
      case "check":
        return status?.catalog_reenumeration_required
          ? {
              title: "Refresh this AI task's connection",
              body: "CasimirBot authorization changed after this task last loaded its tools. Use the AI app's in-place MCP reload for this same task. In Codex, reload MCP server configuration or restart Codex and reopen this same task; do not create replacement tasks just to chase a catalog.",
            }
          : {
              title: "Waiting for your AI task",
              body: "No authenticated check-in from this AI task has been verified. Local transport, the AI app's matching connection, and task check-in are separate dependencies. Use the recovery controls below if a check-in fails; do not repeat completed sign-in or MFA just because this task is absent.",
            };
      case "ready":
        // Persisted navigation keeps recovery controls reachable, not a proof
        // of current connection. Preserve binding inspection without claiming
        // success from a saved step, failed refresh, or offline task.
        if (remote.kind !== "loaded" || remote.readFailed || !status?.readiness.agent_ready) return {
          title: "Connection needs rechecking",
          body: "Your saved setup and pairing history are retained, but this AI task's current connection is not verified. Use Recheck connection; recover the missing dependency without repeating completed authentication or replacing the task.",
        };
        return {
          title: "AI app connected",
          body: "A current read-only MCP call is verified. Message Codex pairing is optional, and environment actions require separate owner approval.",
        };
    }
  }, [
    selected?.display_name,
    setup.viewedStep,
    status?.catalog_reenumeration_required,
    status?.readiness.agent_ready,
    remote.kind,
    remote.kind === "loaded" && remote.readFailed,
  ]);

  const highlightNextStep = () => {
    const target = setupNextAction.checkpoint === "authorization" ? "auth0-account-link"
      : setupNextAction.checkpoint === "catalog" ? "agent-setup-review-connection"
      : setupNextAction.checkpoint === "first_read_only_call" ? "agent-setup-startup-request"
      : setupNextAction.checkpoint === "transport" ? "agent-setup-open-transport"
      : setupNextAction.checkpoint === "status" ? "agent-setup-recheck"
      : setup.viewedStep === "account" ? "account-sign-in"
      : setup.viewedStep === "connect" ? "agent-mcp-url" : null;
    if (!target) return;
    suppressLocalGuidanceHandling.current = true;
    try {
      requestWorkstationGuidance({
        kind: "user_attention", panelId: "agent-access", targetId: target,
        label: setupNextAction.actor === "owner"
          ? `Next owner action: ${setupNextAction.title}. ${setupNextAction.instruction}`
          : "Complete this connection step, then return to Agent Access.",
        durationMs: 12000,
      });
    } finally { suppressLocalGuidanceHandling.current = false; }
  };

  const disconnectTargetMatches=Boolean(disconnectConfirm && status?.oauth_binding_ref &&
    disconnectConfirm.profileRef===status.authenticated_profile_ref && disconnectConfirm.bindingRef===status.oauth_binding_ref &&
    disconnectConfirm.clientProfile===setup.selectedProfile && disconnectConfirm.generation===disconnectGeneration.current);
  const disconnect = async (): Promise<void> => {
    if (!disconnectTargetMatches || !disconnectConfirm ||
        disconnectConfirm.generation !== disconnectGeneration.current ||
        readinessRefreshing || disconnectInFlight.current) return;
    const target=disconnectConfirm;
    disconnectInFlight.current=true;setDisconnectBusy(true);setDisconnectConfirm(null);
    setOperationError(null);
    try {
      const response = await fetch(
        `/api/account/session/agent-bindings/${encodeURIComponent(target.bindingRef)}`,
        {
          method: "DELETE",
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" },
        },
      );
      if (!response.ok) throw new Error("disconnect failed");
      if(target.generation===disconnectGeneration.current)
        window.dispatchEvent(new Event(AGENT_CONNECTION_INVALIDATED_EVENT));
    } catch {
      if(target.generation===disconnectGeneration.current)setOperationError(
        "CasimirBot could not revoke this profile's agent binding. Retry without sharing any credential.",
      );
    } finally {disconnectInFlight.current=false;setDisconnectBusy(false);}
  };

  const bindCurrentChat = async (): Promise<void> => {
    if (!status?.client_session_ref || !activeChatId) return;
    setBindingBusy(true);
    setOperationError(null);
    try {
      if (selectedRunVerification &&
          selectedRunVerification !== status.verified_run_association?.verification_ref) {
        throw new Error("reasoning_binding_run_association_stale");
      }
      const issued = await issueReasoningBindingClaim({
        clientSessionRef: status.client_session_ref,
        helixConversationId: activeChatId,
        runAssociation: status.verified_run_association &&
          selectedRunVerification === status.verified_run_association.verification_ref
          ? status.verified_run_association : undefined,
      });
      setReasoningBinding(issued.binding);
      rememberReasoningTaskBinding(issued.binding);
      setClaimHandle(issued.claim_handle);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      setOperationError(
        reason === "reasoning_binding_run_association_stale"
          ? "The selected environment run changed or is no longer available. Refresh this task's presence, recheck the connection, and review the run again. Your existing chat binding was not replaced."
          : reason === "reasoning_binding_target_inactive"
          ? "This exact AI task's short supervisor presence expired. Return to that same task, ask it to refresh its CasimirBot presence, then retry here. Do not restart CasimirBot or create a replacement task."
          : reason === "reasoning_binding_identity_mismatch"
            ? "The connected AI task does not match this browser session. Recheck Agent Connections from the exact task you intend to bind; do not reuse another task's claim."
            : "CasimirBot could not create the exact task-binding claim.",
      );
    } finally {
      setBindingBusy(false);
    }
  };

  const checkReasoningBinding = async (): Promise<void> => {
    if (!reasoningBinding) return;
    setBindingBusy(true);
    try {
      const binding = await inspectReasoningBinding(
        reasoningBinding.reasoning_binding_id,
      );
      setReasoningBinding(binding);
      rememberReasoningTaskBinding(binding);
      if (binding.status === "active") setClaimHandle(null);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      if (
        reason === "reasoning_binding_not_found" ||
        reason === "reasoning_binding_expired" ||
        reason === "reasoning_binding_superseded"
      ) {
        setReasoningBinding(null);
        setClaimHandle(null);
        setOperationError(
          "This show-once claim is no longer valid. Create a new binding claim; do not retry the old value.",
        );
      } else {
        setOperationError(
          "CasimirBot could not verify the current reasoning-task binding.",
        );
      }
    } finally {
      setBindingBusy(false);
    }
  };

  const revokeCurrentReasoningBinding = async (): Promise<void> => {
    if (!reasoningBinding) return;
    setBindingBusy(true);
    setOperationError(null);
    try {
      const binding = await revokeReasoningBinding(
        reasoningBinding.reasoning_binding_id,
      );
      setReasoningBinding(binding);
      rememberReasoningTaskBinding(binding);
      setClaimHandle(null);
    } catch {
      setOperationError(
        "CasimirBot could not revoke the current reasoning-task binding.",
      );
    } finally {
      setBindingBusy(false);
    }
  };

  const nativeTrustControl =
    typeof window.casimirDesktop?.getRuntimeSnapshot === "function" ? (
      <div
        className="mt-3 rounded-lg border border-cyan-300/20 bg-cyan-400/5 p-3"
        data-helix-guidance-target="full-harness-trust"
        data-helix-guidance-satisfied={
          fullHarnessTrust?.trusted === true ? "true" : "false"
        }
        data-helix-guidance-next-targets="reasoning-task-binding agent-connection-fast-start"
      >
        <div className="flex items-start gap-2 text-xs text-cyan-50">
          <span>
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {fullHarnessTrust?.trusted
                ? "This device is trusted for Full Harness"
                : "Trust this device for Full Harness"}
            </span>
            <span className="mt-1 block leading-5 text-cyan-50/70">
              Remember approval for short, logged tunnel leases and for
              starting or stopping installed local environment applications on
              this profile and device. This never grants in-environment
              Minecraft actions, trading, answer, or terminal authority.
            </span>
            <button
              type="button"
              disabled={trustBusy || trustReadBusy || fullHarnessTrust === null}
              onClick={() =>
                void updateFullHarnessTrust(fullHarnessTrust?.trusted !== true)
              }
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-cyan-200/30 bg-cyan-300/10 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-50 disabled:opacity-50"
            >
              {trustBusy ? (
                <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : fullHarnessTrust?.trusted ? (
                <ShieldOff className="h-3 w-3" aria-hidden="true" />
              ) : (
                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              )}
              {trustBusy
                ? "Saving device trust…"
                : fullHarnessTrust?.trusted
                  ? "Remove Full Harness device trust"
                  : "Trust this device for Full Harness"}
            </button>
          </span>
        </div>
        {trustStatus ? (
          <p className="mt-2 text-[11px] leading-4 text-cyan-100" role="status">
            {trustStatus}
          </p>
        ) : null}
        {trustReadFailed || trustNeedsRecheck ? (
          <div className="mt-2 text-[11px] leading-4 text-cyan-100">
            <p role="status">{trustReadFailed
              ? trustReadAccountBlocker === "developer"
                ? "Full Harness requires an active developer account. Open Account & Sessions to check account access and email verification. Repeating MFA or AI check-in cannot change account policy. Existing device trust has not been revoked."
                : trustReadAccountBlocker === "session"
                  ? "Sign in through Account & Sessions before checking Full Harness device trust. This failed read does not revoke existing device trust."
                  : "CasimirBot could not read this device's current trust status. Recheck device trust to retry the status read; this does not change approval."
              : "Read the current device trust status before another decision. Rechecking does not repeat the change."}</p>
            <button
              type="button"
              disabled={trustReadBusy || trustBusy}
              onClick={() => void readFullHarnessTrust()}
              className="mt-2 rounded border border-cyan-200/30 px-2.5 py-1.5 disabled:opacity-50"
            >
              {trustReadBusy ? "Checking device trust…" : "Recheck device trust"}
            </button>
          </div>
        ) : trustReadBusy ? (
          <p className="mt-2 text-[11px] leading-4 text-cyan-100" role="status">Checking device trust…</p>
        ) : null}
        {trustRecoveryPanel ? (
          <button
            type="button"
            className="mt-2 rounded border border-cyan-200/30 px-2.5 py-1.5 text-[11px] text-cyan-100"
            onClick={() => requestWorkstationGuidance({
              kind: "user_attention",
              panelId: trustRecoveryPanel,
              label: trustRecoveryPanel === "account-session"
                ? "Check the profile session and account type."
                : "Choose Device & Security to check registration and recovery.",
            })}
          >
            {trustRecoveryPanel === "account-session"
              ? "Open Account & Sessions"
              : "Open Connections, Billing & Security"}
          </button>
        ) : null}
      </div>
    ) : null;

  return (
    <section
      className="rounded-xl border border-cyan-300/20 bg-slate-950/85 p-4 text-slate-100"
      aria-labelledby="agent-connection-setup-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
            Agent Connections
          </p>
          <h1
            ref={setupTitleRef}
            id="agent-connection-setup-title"
            tabIndex={-1}
            className="mt-1 text-xl font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
          >
            {currentCopy.title}
          </h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {setup.viewedStep !== "choose" && setup.viewedStep !== "check" && setup.viewedStep !== "ready" ? (
            <button
              type="button"
              disabled={
                onboardingPhase === "starting_native_harness" ||
                onboardingPhase === "checking_readiness"
              }
              onClick={() => void startHarness()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-50 disabled:opacity-50"
            >
              {onboardingPhase === "starting_native_harness" ||
              onboardingPhase === "checking_readiness" ? (
                <LoaderCircle
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {onboardingPhase === "starting_native_harness"
                ? "Starting harness…"
                : onboardingPhase === "checking_readiness"
                  ? "Checking connection…"
                  : nativeHarnessControlAvailable ? "Start Harness" : "Check current service"}
            </button>
          ) : null}
          <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-300">
            {setup.viewedStep === "ready"
              ? acceptedDurablePolling ? "Message Codex connected" : "Review task binding"
              : `Step ${Math.max(1, ["choose", "account", "authorize", "connect", "check", "ready"].indexOf(setup.viewedStep) + 1)} of 6`}
          </span>
          {setup.viewedStep === "ready" && status?.authenticated_profile_ref && activeChatId ? (
            <button type="button" className="rounded-lg border border-cyan-300/40 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-50"
              onClick={() => {
                const section = document.getElementById("agent-exact-task-pairing");
                section?.scrollIntoView?.({ behavior: "smooth", block: "start" });
                section?.querySelector<HTMLElement>("h3")?.focus();
              }}>
              {acceptedDurablePolling ? "View task pairing" : "Go to task pairing"}
            </button>
          ) : null}
        </div>
      </div>

      <p
        className="mt-3 text-sm leading-6 text-slate-300"
        role="status"
        aria-live="polite"
      >
        {currentCopy.body}
      </p>
      <p className="mt-2 text-xs text-cyan-100/85" role="status" data-testid="agent-setup-shared-status">
        Full Harness transport: {transportInspection === "checking" ? "checking" :
          transportInspection !== "observed" ? "not verified" :
          onboardingTunnel?.ready && onboardingTunnel.processRunning && onboardingTunnel.scope === "full_helix_agent"
            ? "Ready locally" : onboardingTunnel?.ready && onboardingTunnel.processRunning
              ? "read-only locally" : "stopped or unavailable"}.
        {" "}Exact AI task: {remote.kind === "loaded" && !remote.readFailed && status?.readiness.agent_ready
          ? "verified by authenticated check-in" : "not currently verified"}.
      </p>
      {setupNextAction.state !== "verified" ? (
        <section
          className="mt-3 rounded-lg border border-amber-300/35 bg-amber-400/10 p-4 text-xs leading-5 text-amber-50"
          aria-live="polite"
          data-agent-setup-next-action={setupNextAction.checkpoint}
        >
          <p className="font-semibold text-amber-100">
            Next action · {setupNextAction.actor === "agent" ? "AI task" : "You"}
          </p>
          <p className="mt-1 font-semibold">{setupNextAction.title}</p>
          <p className="mt-1 text-amber-50/85">{setupNextAction.instruction}</p>
          <button type="button" className="mt-3 rounded border border-amber-200/45 px-3 py-1.5 font-semibold"
            onClick={highlightNextStep}>Highlight next step</button>
          {setupNextAction.checkpoint === "first_read_only_call" ? (
            <button
              id="agent-setup-startup-request"
              data-helix-guidance-target="agent-setup-startup-request"
              type="button"
              className="mt-3 rounded border border-amber-200/45 px-3 py-1.5 font-semibold"
              onClick={() => void (async () => {
                try {
                  if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
                  await navigator.clipboard.writeText(PERSONAL_MCP_STARTUP_REQUEST);
                  setSetupRequestCopyStatus("Read-only startup request copied. Paste it into this exact AI task.");
                } catch {
                  setSetupRequestCopyStatus("Copy failed. Clipboard access is unavailable.");
                }
              })()}
            >
              Copy read-only startup request
            </button>
          ) : setupNextAction.checkpoint === "catalog" ? (
            <button
              id="agent-setup-review-connection"
              data-helix-guidance-target="agent-setup-review-connection"
              type="button"
              className="mt-3 rounded border border-amber-200/45 px-3 py-1.5 font-semibold"
              onClick={() => dispatch({ type: "view", step: "connect" })}
            >Review matching MCP connection</button>
          ) : setupNextAction.checkpoint === "transport" ? (
            <button
              id="agent-setup-open-transport"
              data-helix-guidance-target="agent-setup-open-transport"
              type="button"
              className="mt-3 rounded border border-amber-200/45 px-3 py-1.5 font-semibold"
              onClick={() => requestWorkstationGuidance({
                kind: "user_attention", panelId: "device-check",
                label: "Inspect or start the local MCP transport. Its Ready state does not prove exact-task MCP connectivity.",
                durationMs: 12000,
              })}
            >Open local transport setup</button>
          ) : null}
          {setupRequestCopyStatus ? <p role="status" className="mt-2">{setupRequestCopyStatus}</p> : null}
        </section>
      ) : (
        <section
          className="mt-3 rounded-lg border border-emerald-300/25 bg-emerald-400/10 p-4 text-xs leading-5 text-emerald-50"
          role="status"
          data-agent-setup-next-action="first_read_only_call"
        >
          <p className="font-semibold">{acceptedDurablePolling ? "MCP connected and Message Codex paired" : "Read-only MCP startup verified"}</p>
          <p className="mt-1">{acceptedDurablePolling
            ? "The exact-task polling binding is active. Task pickup still requires that task to run; environment actions require separate owner permission."
            : "Message Codex pairing and environment actions are optional next steps with separate owner approval."}</p>
        </section>
      )}
      <details className="mt-3 rounded border border-white/10 p-3 text-xs text-slate-300">
        <summary className="cursor-pointer font-semibold">Exact-task setup order and checkpoints</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          {HELIX_AGENT_SETUP_PROCEDURE.steps.map(step => <li key={step.id}>
            <strong>{step.actor === "owner" ? "Owner" : "AI task"} · {step.label}.</strong>{" "}
            <span className="text-cyan-200">{step.route === "personal_mcp" ? "Personal MCP" : step.route === "task_pairing" ? "Optional pairing" : "Optional environment"}.</span>{" "}
            {step.evidence} {step.next}
          </li>)}
        </ol>
        <p className="mt-2">{HELIX_AGENT_SETUP_PROCEDURE.rule}</p>
        <p className="mt-2">Provider API setup is a separate path for assisted AI; task pairing is optional for ordinary personal MCP tools. Select the environment and review its action permissions separately before gameplay.</p>
      </details>
      {!nativeHarnessControlAvailable ? (
        <p className="mt-2 rounded-lg border border-amber-300/20 bg-amber-400/5 p-3 text-xs leading-5 text-amber-50/85">
          Browser view: this page can check only the service at its current address. Starting the private MCP tunnel and binding its exact AI task must be done in the installed CasimirBot Agent Access panel. MCP can bring that native panel forward without approving anything.
        </p>
      ) : null}
      {nativeTrustControl}

      {setup.viewedStep === "choose" ? (
        <div className="mt-4 space-y-3">
          <div
            className="rounded-xl border border-cyan-300/30 bg-cyan-400/10 p-4"
            data-helix-guidance-target="agent-connection-fast-start"
            data-helix-guidance-label="Start the harness to check this account and exact Codex connection."
          >
            <p className="font-semibold text-cyan-50">Fast start with Codex</p>
            <p className="mt-1 text-xs leading-5 text-cyan-50/75">
              One click checks this account and exact Codex connection. In the
              installed desktop, this click also enables the existing full
              developer harness for this app session. It never approves OAuth,
              creates a Codex task, controls Codex UI, or grants environment
              authority.
            </p>
            <button
              type="button"
              disabled={
                onboardingPhase === "starting_native_harness" ||
                onboardingPhase === "checking_readiness"
              }
              onClick={() => void startHarness()}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-cyan-200/40 bg-cyan-300/15 px-4 py-2 text-sm font-semibold text-cyan-50 disabled:opacity-50"
            >
              {onboardingPhase === "starting_native_harness" ||
              onboardingPhase === "checking_readiness" ? (
                <LoaderCircle
                  className="h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Play className="h-4 w-4" aria-hidden="true" />
              )}
              {onboardingPhase === "starting_native_harness"
                ? "Starting harness…"
                : onboardingPhase === "checking_readiness"
                  ? "Checking connection…"
                  : nativeHarnessControlAvailable ? "Start Harness" : "Check current service"}
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.values(HELIX_AGENT_CLIENT_PROFILES).map((profile) => (
              <button
                key={profile.profile_id}
                type="button"
                onClick={() =>
                  dispatch({ type: "choose", profile: profile.profile_id })
                }
                className="rounded-xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-cyan-300/40 hover:bg-cyan-400/10"
              >
                <span className="block font-semibold text-white">
                  {profile.display_name}
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-400">
                  {profile.profile_id === "codex_app"
                    ? "Guided Codex MCP setup"
                    : "Any OAuth-capable Streamable HTTP MCP client"}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {setup.viewedStep === "account" ? (
        <button
          type="button"
          data-helix-guidance-target="account-sign-in"
          className="mt-4 rounded border border-cyan-700 px-3 py-2 text-sm text-cyan-100"
          onClick={() => requestWorkstationGuidance({
            kind: "user_attention",
            panelId: "account-session",
            label: "Choose how to sign in to your CasimirBot account.",
          })}
        >
          Open account sign-in
        </button>
      ) : null}

      {setup.viewedStep === "authorize" ? (
        <div className="mt-4">
          <AgentAccountBindingReadiness />
        </div>
      ) : null}

      {setup.viewedStep === "connect" && selected ? (
        <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4">
          <ol className="list-decimal space-y-2 pl-5 text-xs leading-5 text-slate-300">
            {selected.profile_id === "codex_app" ? (
              <>
                <li>
                  In Codex, open Plugins, choose Installed, and open the
                  CasimirBot connection. Some Codex builds instead show MCP
                  servers in Settings.
                </li>
                <li>
                  Choose Connect, Finish setup, or Authenticate. If Codex asks
                  for a server address, use the address shown below.
                </li>
                <li>
                  After sign-in succeeds, reload the exact MCP server shown
                  below for this same task. Reconnecting a separate Device Check
                  plugin does not refresh this server's catalog. If this Codex
                  build has no reload control, restart Codex once only while
                  this exact server is already healthy, then reopen this same
                  task; do not create replacement tasks to chase the catalog.
                </li>
              </>
            ) : (
              <>
                <li>
                  Open your AI app's MCP or tools settings and add a Streamable
                  HTTP server.
                </li>
                <li>
                  Enter the server address below and choose its OAuth sign-in
                  flow.
                </li>
                <li>
                  Reload or reconnect the MCP server for the current task. If
                  the client cannot refresh a loaded task, report that
                  unsupported recovery boundary instead of repeatedly creating
                  fresh tasks.
                </li>
              </>
            )}
          </ol>
          <label
            className="mt-4 block text-[10px] font-semibold uppercase tracking-wide text-slate-500"
            htmlFor="agent-mcp-url"
          >
            Server address
          </label>
          <input
            id="agent-mcp-url"
            readOnly
            value={mcpUrl}
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 font-mono text-xs text-cyan-100"
          />
          <p className="mt-2 text-[11px] text-slate-500">
            Use only the server address and the AI app's OAuth sign-in. Never
            paste a credential here.
          </p>
        </div>
      ) : null}

      {setup.viewedStep === "check" ? (
        <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-4 text-xs leading-5 text-slate-200"
        >
          <p className="font-semibold">Run the read-only check-in in your chosen Codex task</p>
          <p className="mt-1">The EXE uses that authenticated receipt to verify MCP startup for this exact task. Message Codex pairing is optional and requires separate owner review. This page cannot create a check-in or wake an idle task.</p>
          <p className="mt-2" role="status">Local transport: {transportInspection === "checking" ? "checking native status…" : transportInspection !== "observed" ? "not verified; inspect native setup" : onboardingTunnel?.ready && onboardingTunnel.processRunning ? "Ready locally; this does not prove AI connectivity" : "not Ready; review native setup before retrying the AI connection"}.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="rounded border border-white/20 px-3 py-1.5 font-semibold"
              onClick={() => { revealBindingAfterStart.current = false; dispatch({ type: "view", step: "connect" }); }}
            >Review AI connection settings</button>
            <button type="button" className="rounded border border-white/20 px-3 py-1.5 font-semibold"
              onClick={() => requestWorkstationGuidance({ kind: "user_attention", panelId: "device-check", label: "Inspect the local tunnel and its console. Ready locally is not proof of an authenticated AI task check-in.", durationMs: 12000 })}
            >Open local transport setup</button>
            {window.casimirDesktop?.getMcpTunnelState ? <button type="button" className="rounded border border-white/20 px-3 py-1.5 font-semibold"
              disabled={transportInspection === "checking"} onClick={() => setTransportInspectionRequest(value => value + 1)}
            >Inspect transport again</button> : null}
          </div>
          <p className="mt-3 text-amber-100/75">If Codex does not list the CasimirBot tools, finish its connection in Codex first. If a listed tool times out, check the tunnel console for a recent successful control-plane poll; local Ready alone does not prove Codex can reach this profile. Reconnecting a separate Device Check plugin or repeatedly pressing Check connection here cannot create task presence.</p>
          <p className="mt-2 text-amber-100/75">If the AI reports “Session terminated” or “Unauthorized,” refresh or reconnect the matching connection in the AI app. If that app reports a failed tool refresh, stop the check-in loop: its connection has not been repaired. CasimirBot cannot infer success from local Ready or from opening the plugin page.</p>
        </div>
      ) : null}

      {setup.viewedStep === "ready" && status?.readiness.agent_ready ? (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-emerald-300/25 bg-emerald-400/10 p-4">
          <CheckCircle2
            className="mt-0.5 h-5 w-5 shrink-0 text-emerald-200"
            aria-hidden="true"
          />
          <div className="text-xs leading-5 text-emerald-50/85">
            <p>
              Catalog probe: current. Chat attachment: current. Continuation:{" "}
              {acceptedDurablePolling ? "polling under the approved pairing" : status.readiness.continuation_readiness.replace("_", " ")}.
            </p>
            <p className="mt-1">
              Thread visibility:{" "}
              {status.thread_observability_bridge.negotiated_level.replaceAll(
                "_",
                " ",
              )}
              . Checkpoint publication:{" "}
              {status.thread_observability_bridge.checkpoint_publication_status.replaceAll(
                "_",
                " ",
              )}
              .
            </p>
            <p className="mt-1">
              {acceptedDurablePolling
                ? "The approved task can pick up queued steering when running. This does not wake an idle task or enable automatic delivery."
                : continuationExplanation(status.readiness.continuation_readiness)}
            </p>
            <p className="mt-1">
              This proves connection readiness only. It does not expose private
              reasoning or grant environment actions.
            </p>
          </div>
        </div>
      ) : null}

      {status?.authenticated_profile_ref && activeChatId && setup.viewedStep === "ready" ? (
        <DurableTaskPairing profileId={status.authenticated_profile_ref} chatId={activeChatId}
          onDeviceTrustMismatch={() => { void readFullHarnessTrust(); }}
          onRuntimeBinding={(binding, pairingId) => {
            setReasoningBinding(current => binding ?? (current?.pairing_id === pairingId ? null : current));
            if (binding) rememberReasoningTaskBinding(binding);
            else useAgiChatStore.getState().forgetPairedReasoningTaskBinding(activeChatId, pairingId);
          }}
          environment={status.verified_run_association ? {
            roomId: status.verified_run_association.room_id, runId: status.verified_run_association.run_id,
          } : null} />
      ) : null}

      {status?.heartbeat_expires_at ? (
        <ConnectionExpiryNotice deadline={status.heartbeat_expires_at} label="AI task presence"
          recovery="Ask the same AI task to refresh its CasimirBot presence. Keep this panel open for its automatic connection check. Keep any active binding; missing presence alone does not revoke it." />
      ) : null}

      {status && (setup.viewedStep === "ready" || (setup.viewedStep === "check" && reasoningBinding)) ? (
        <details
          open={setup.selectedProfile !== "codex_app" || Boolean(status.verified_run_association || reasoningBinding?.run_id)}
          className="mt-4 rounded-lg border border-cyan-300/20 bg-cyan-400/5 p-4 text-xs leading-5 text-cyan-50/85"
          data-helix-guidance-target="reasoning-task-binding"
          data-helix-guidance-satisfied={
            reasoningBinding?.status === "active" ? "true" : "false"
          }
          data-helix-guidance-label={bindingGuidanceLabel}
          data-helix-guidance-integration-blocked={setup.selectedProfile !== "codex_app" && connectedToolActivityOnly && !acceptedDurablePolling ? "true" : undefined}
        >
          <summary className="cursor-pointer font-semibold text-cyan-100">Optional session and environment run setup</summary>
          <p className="font-semibold text-cyan-100">
            Bind the current Helix chat to this exact AI task
          </p>
          <p className="mt-1">
            This optional short-lived binding associates the selected Helix chat
            with the current AI task and, when verified, an environment run. It
            does not create or control an AI-app chat. Personal Message Codex
            messages use the owner-approved pairing above and can be polled by
            that exact task through MCP while it is active.
          </p>
          {(reasoningBinding?.status === "pending_claim" || reasoningBinding?.status === "expired") && reasoningBinding.expires_at ? (
            <ConnectionExpiryNotice deadline={reasoningBinding.expires_at} label="One-time binding claim"
              recovery="Check the binding status before replacing the claim: the AI task may already have claimed it. If the server confirms expiry, review the verified environment run and generate a new claim here. Do not downgrade to chat-only for Minecraft." />
          ) : null}
          {reasoningBinding?.status === "active" ? (
            <div className="mt-3 rounded border border-white/15 p-3" aria-label="Session recovery status">
              <p>Chat binding: active. A missing heartbeat does not revoke this binding.</p>
              <p>AI availability: {status.readiness.agent_ready && (acceptedDurablePolling || status.readiness.continuation_readiness !== "unavailable")
                ? "current connection check passed; polling pickup still requires the AI task to run."
                : connectedToolActivityOnly
                  ? "connected for tool activity only; steering pickup has not been declared."
                  : "waiting for a fresh connection check from the same AI task."}</p>
              <p>An associated run does not by itself prove current game connectivity or action permission.</p>
              <EnvironmentSessionReadyUp key={`${reasoningBinding.reasoning_binding_id}:${reasoningBinding.binding_epoch}`}
                binding={reasoningBinding} />
              <p className="mt-2">Keep this binding while recovering the session. Do not replace it just because task presence or game permissions expired.</p>
            </div>
          ) : null}
          {status.readiness.continuation_readiness === "unavailable" && !acceptedDurablePolling ? (
            <p className="mt-2 text-amber-100">
              {continuationRecovery}{" "}
              Recheck connection only checks status: it cannot wake an idle task
              or renew binding and environment permissions. Do not create another task.
            </p>
          ) : null}
          {!activeChatId ? (
            <p className="mt-2 text-amber-100">
              Open or create a Helix chat first.
            </p>
          ) : null}
          {status.verified_run_association ? (
            <label className="mt-3 block rounded border border-cyan-300/20 p-3">
              <input
                type="checkbox"
                data-helix-interaction-kind="human_only"
                data-helix-authority-state="client_local"
                data-helix-control-id="workstation.panel.agent-access.agent-connection-setup.bind-environment-run"
                checked={selectedRunVerification === status.verified_run_association.verification_ref}
                onChange={event => setSelectedRunVerification(event.target.checked
                  ? status.verified_run_association!.verification_ref : null)}
              />{" "}
              Include this verified environment run in the new binding:
              <span className="block break-all">{status.verified_run_association.run_id}</span>
              <span className="block break-all">Room: {status.verified_run_association.room_id}</span>
              This associates steering with the run; environment action permission remains separate.
            </label>
          ) : (
            <div className="mt-3 rounded border border-amber-300/20 p-3">
              <label className="block">
                <input type="checkbox" checked={false} disabled aria-describedby="environment-run-preparation-needed" />{" "}
                Include a verified environment run in the new binding
              </label>
              <p id="environment-run-preparation-needed" className="mt-2">
                Environment session not ready to bind. This task has not published a current,
                server-verified run. A run may need preparation, or its verification may have
                expired after a state change. This does not mean Minecraft is disconnected.
              </p>
              <p className="mt-2">
                Ask this same AI task to prepare or restore the Minecraft session through the
                harness and refresh its presence with the exact run and room. Keep this panel
                open: when verification arrives, review and select the run here before replacing
                the binding. Checking the connection does not prepare a session or approve it.
              </p>
              <p className="mt-2">
                Binding now creates a chat-only connection, not a Minecraft run association.
                Do not generate another claim while waiting for the environment run.
              </p>
              {status.client_session_ref && status.conversation_thread_ref && activeChatId && (
                <EnvironmentSessionPreparationRequest
                  key={JSON.stringify([status.authenticated_profile_ref, status.service_instance_ref,
                    status.client_session_ref, status.conversation_thread_ref, activeChatId])}
                  clientSessionRef={status.client_session_ref}
                  profileRef={status.authenticated_profile_ref}
                  serviceInstanceRef={status.service_instance_ref}
                  continuationRef={status.conversation_thread_ref}
                  chatId={activeChatId}
                />
              )}
            </div>
          )}
          {selectedRunVerification &&
            selectedRunVerification !== status.verified_run_association?.verification_ref ? (
            <div className="mt-2 text-amber-100">
              The selected environment run is no longer current. Review a fresh run above or explicitly choose chat-only.
              <button
                type="button"
                data-helix-interaction-kind="human_only"
                data-helix-authority-state="client_local"
                data-helix-control-id="workstation.panel.agent-access.agent-connection-setup.clear-environment-run"
                className="ml-2 rounded border border-white/20 px-2 py-1"
                onClick={() => setSelectedRunVerification(null)}
              >Use chat-only binding</button>
            </div>
          ) : null}
          {claimHandle ? (
            <>
              <ReasoningClaimHandle value={claimHandle} />
              <p className="mt-2">
                In that exact AI task, call{" "}
                <code>helix_reasoning_task_binding_claim</code> with its stable
                continuation reference and this handle. Then return here and
                check the binding.
              </p>
              <p className="mt-1 text-[11px] text-cyan-100/70">
                {reasoningBinding?.expires_at
                  ? `Valid until ${new Date(reasoningBinding.expires_at).toLocaleTimeString()}. `
                  : "Short-lived claim. "}
                A packaged-service restart invalidates it immediately. Never
                retry a rejected or expired value.
              </p>
            </>
          ) : null}
          {reasoningBinding ? (
            <p className="mt-2">
              Binding state:{" "}
              <strong>{reasoningBinding.status.replaceAll("_", " ")}</strong>.
              Transport:{" "}
              {reasoningBinding.continuation_transport.replaceAll("_", " ")}.
              {" "}Environment run: {reasoningBinding.run_id ?? "none (chat-only)"}.
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              data-helix-control-id={REASONING_BIND_CONTROL_ID}
              data-helix-interaction-kind="human_only"
              data-helix-authority-state="client_local"
              type="button"
              aria-describedby={bindingDisabledReason ? "reasoning-binding-disabled-reason" : undefined}
              disabled={
                !activeChatId ||
                (remote.kind === "loaded" && remote.readFailed === true) ||
                !status.client_session_ref ||
                !status.readiness.agent_ready ||
                status.readiness.continuation_readiness === "unavailable" ||
                bindingBusy
              }
              onClick={() => void bindCurrentChat()}
              className="rounded-lg border border-cyan-300/30 bg-cyan-400/10 px-3 py-2 disabled:opacity-50"
            >
              {bindingBusy
                ? "Working…"
                : reasoningBinding
                  ? "Replace binding"
                  : "Bind current Helix chat"}
            </button>
            {bindingDisabledReason ? (
              <p id="reasoning-binding-disabled-reason" className="w-full text-amber-100" role="status">
                {bindingDisabledReason}
              </p>
            ) : null}
            {reasoningBinding ? (
              <button
                data-helix-control-id="workstation.panel.agent-access.agent-connection-setup.check-reasoning-binding"
                data-helix-interaction-kind="observe"
                data-helix-authority-state="client_local"
                type="button"
                disabled={bindingBusy}
                onClick={() => void checkReasoningBinding()}
                className="rounded-lg border border-white/10 px-3 py-2 disabled:opacity-50"
              >
                Check binding
              </button>
            ) : null}
            {reasoningBinding &&
            ["pending_claim", "active"].includes(reasoningBinding.status) ? (
              <button
                data-helix-control-id="workstation.panel.agent-access.agent-connection-setup.revoke-reasoning-binding"
                data-helix-interaction-kind="human_only"
                data-helix-authority-state="client_local"
                type="button"
                disabled={bindingBusy}
                onClick={() => void revokeCurrentReasoningBinding()}
                className="rounded-lg border border-rose-300/30 px-3 py-2 text-rose-100 disabled:opacity-50"
              >
                Revoke binding
              </button>
            ) : null}
          </div>
        </details>
      ) : null}

      {setup.explanationOpen ? (
        <p className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3 text-xs leading-5 text-slate-300">
          Setup progress stored on this device is navigation only.
          Authorization, client presence, catalog adoption, and chat attachment
          are always re-read from trusted server or native-host evidence.
        </p>
      ) : null}

      {operationError ? (
        <p className="mt-3 text-xs text-rose-200" role="alert">
          {operationError}
        </p>
      ) : null}

      {presentationError ? (
        <p className="mt-3 text-xs text-rose-200" role="alert">
          {presentationError}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {window.casimirDesktop?.startMcpTunnel && setup.viewedStep !== "check" && setup.viewedStep !== "ready" ? (
          <button
            type="button"
            onClick={() => void startHarness()}
            disabled={onboardingPhase === "starting_native_harness" || onboardingPhase === "checking_readiness"}
            title="Restore the native Full Harness transport and recheck setup. Does not renew an idle AI task's presence, approve binding, or grant game actions."
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-50 disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Refresh harness connection
          </button>
        ) : null}
        {setup.viewedStep !== "choose" ? (
          <button
            type="button"
            onClick={() => dispatch({ type: "back" })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back
          </button>
        ) : null}
        {setup.viewedStep !== "choose" ? (
          <button
            type="button"
            id="agent-setup-recheck"
            data-helix-guidance-target="agent-setup-recheck"
            onClick={() => void refresh()}
            disabled={readinessRefreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-50 disabled:opacity-50"
          >
            {readinessRefreshing ? (
              <LoaderCircle
                className="h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            )}{" "}
            {setup.viewedStep === "ready" ? "Recheck connection" : setup.viewedStep === "check" && !status?.catalog_reenumeration_required ? "Check connection" : "Retry"}
          </button>
        ) : null}
        {setup.viewedStep === "connect" ? (
          <button
            type="button"
            onClick={() => dispatch({ type: "view", step: "check" })}
            className="rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-3 py-2 text-xs text-cyan-50"
          >
            I added it
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => dispatch({ type: "toggle_explanation" })}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5"
          aria-expanded={setup.explanationOpen}
        >
          <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" /> Explain
        </button>
        {setup.viewedStep !== "choose" ? (
          <button
            type="button"
            onClick={() => void copyOnboardingDiagnostic()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5"
          >
            <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" /> Copy
            diagnostics
          </button>
        ) : null}
      </div>

      {diagnosticPreview ? <textarea aria-label="Sanitized onboarding diagnostics" readOnly value={diagnosticPreview}
        className="w-full min-h-40 rounded border p-2 text-xs" /> : null}
      {diagnosticStatus ? (
        <p className="mt-2 text-xs text-slate-300" role="status">
          {diagnosticMessage}
        </p>
      ) : null}

      {setup.selectedProfile === "codex_app" &&
      setup.viewedStep !== "choose" ? (
        <div className="mt-4 border-t border-white/10 pt-3 text-xs text-slate-400">
          <p>
            <strong className="text-slate-300">Optional Device Check:</strong>{" "}
            separate from the agent connection and never counts as chat or
            catalog proof.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {codexPlugin?.status === "ready" && !setup.deviceCheckSkipped ? (
              <button
                type="button"
                onClick={() => void window.casimirDesktop?.openCodexPlugin?.()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 hover:bg-white/5"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Open
                optional Device Check
              </button>
            ) : null}
            {!setup.deviceCheckSkipped ? (
              <button
                type="button"
                onClick={() => dispatch({ type: "skip_device_check" })}
                className="rounded-lg border border-white/10 px-3 py-2 hover:bg-white/5"
              >
                Skip Device Check
              </button>
            ) : (
              <span>Device Check skipped.</span>
            )}
          </div>
        </div>
      ) : null}

      {setup.selectedProfile && status?.oauth_binding_ref && status.readiness.client_authorization === "active" ? (
        <div className="mt-4 border-t border-white/10 pt-3">
          {!disconnectTargetMatches ? (
            <button
              type="button"
              disabled={disconnectBusy||readinessRefreshing}
              onClick={() => {
                if(!setup.selectedProfile||disconnectBusy||readinessRefreshing)return;
                setDisconnectConfirm({profileRef:status.authenticated_profile_ref,bindingRef:status.oauth_binding_ref!,
                  clientProfile:setup.selectedProfile,generation:disconnectGeneration.current});
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300/20 px-3 py-2 text-xs text-rose-100 hover:bg-rose-400/10"
            >
              <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />{" "}
              {disconnectBusy?"Disconnecting…":"Disconnect"}
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-xs text-rose-100">
              <span>
                This revokes the profile binding used by every AI client linked
                through it.
              </span>
              <button
                type="button"
                disabled={disconnectBusy||readinessRefreshing}
                onClick={() => void disconnect()}
                className="rounded-lg border border-rose-300/30 bg-rose-400/10 px-3 py-2"
              >
                Confirm disconnect
              </button>
              <button
                type="button"
                onClick={() => setDisconnectConfirm(null)}
                className="rounded-lg border border-white/10 px-3 py-2"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}

export default AgentConnectionSetup;
