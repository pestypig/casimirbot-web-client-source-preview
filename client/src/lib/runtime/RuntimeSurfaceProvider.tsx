import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  parseDesktopRuntimeSnapshot,
  resolveRuntimeCapabilities,
  resolveRuntimeSurface,
  type RuntimeCapabilities,
  type RuntimeSurface,
} from "@shared/runtime-surface";

const NATIVE_HANDSHAKE_TIMEOUT_MS = 2_000;

type DesktopRuntimeBridge = Readonly<{
  localDeveloperAccess?: (action: string, argument?: string) => Promise<unknown>;
  authorizeResponsesActionChoiceOnce?: () => Promise<{
    status: "approved" | "cancelled" | "not_ready" | "unavailable";
  }>;
  responsesActionSession?: (action: "state" | "approve" | "stop") => Promise<{
    status: "active" | "inactive" | "approved" | "stopped" | "cancelled" |
      "not_ready" | "unavailable";
    remainingCalls?: number; maxCalls?: number; expiresAt?: string | null;
  }>;
  liveConnection?: (request: import("@shared/desktop-live-connection").LiveConnectionRequest) =>
    Promise<import("@shared/desktop-live-connection").LiveConnectionResult>;
  readCivilizationMapsBrowserKey?: () => Promise<unknown>;
  saveCivilizationMapsBrowserKey?: (key: string) => Promise<unknown>;
  clearCivilizationMapsBrowserKey?: () => Promise<unknown>;
  getCivilizationRoutesKeyState?: () => Promise<unknown>;
  saveCivilizationRoutesKey?: (key: string) => Promise<unknown>;
  clearCivilizationRoutesKey?: () => Promise<unknown>;
  saveSolarObservation?: (text: string) => Promise<import("@shared/solar-observation-save").SolarObservationSaveResult>;
  getPrivateEnvironmentState?: () => Promise<unknown>;
  installPrivateEnvironmentPackage?: () => Promise<unknown>;
  getPrivateEnvironmentRemovalState?: () => Promise<unknown>;
  removePrivateEnvironmentPackage?: () => Promise<unknown>;
  preparePrivateClock?: () => Promise<unknown>;
  observePrivateClock?: (request: unknown) => Promise<unknown>;
  recoverPrivateClockObservation?: (request?: unknown) => Promise<unknown>;
  stopPrivateClock?: () => Promise<unknown>;
  getPrivateClockMcpPermission?: () => Promise<unknown>;
  grantPrivateClockMcpPermission?: (installationRef: string) => Promise<unknown>;
  revokePrivateClockMcpPermission?: () => Promise<unknown>;
  getRuntimeSnapshot: () => Promise<unknown>;
  getUpdateState?: () => Promise<unknown>;
  checkForUpdates?: () => Promise<unknown>;
  downloadUpdate?: () => Promise<unknown>;
  installUpdate?: () => Promise<unknown>;
  getPrivateDevUpdateState?: () => Promise<unknown>;
  restartIntoPrivateDevUpdate?: () => Promise<unknown>;
  getCodexPluginState?: () => Promise<unknown>;
  openCodexPlugin?: () => Promise<unknown>;
  getMcpTunnelState?: () => Promise<unknown>;
  configureMcpTunnel?: (input: unknown) => Promise<unknown>;
  startMcpTunnel?: (input?: unknown) => Promise<unknown>;
  stopMcpTunnel?: () => Promise<unknown>;
  clearMcpTunnel?: () => Promise<unknown>;
  openMcpTunnelAdmin?: () => Promise<unknown>;
  getMinecraftRunProfile?: () => Promise<unknown>;
  selectMinecraftRunProfile?: () => Promise<unknown>;
  selectMinecraftPlayerProfile?: () => Promise<unknown>;
  clearMinecraftRunProfile?: () => Promise<unknown>;
  openAuth0AccountLink?: (authorizationUrl: unknown) => Promise<unknown>;
  openAuth0ProfileSignIn?: () => Promise<unknown>;
  openRoomService?: (input: { authority: string; room_id: string }) => Promise<unknown>;
  openPublisherAccount?: () => Promise<unknown>;
  managedAiDeviceLink?: (action: "inspect" | "start" | "check" | "disconnect") => Promise<unknown>;
  managedAiTextTurn?: (prompt: string) => Promise<unknown>;
  openAuth0StepUp?: (authorizationUrl: unknown) => Promise<unknown>;
  openRobinhoodOAuth?: (authorizationUrl: unknown) => Promise<unknown>;
  getRealtimeTexturePackState?: () => Promise<unknown>;
  showRealtimeTexturePackOverlay?: (config: unknown) => Promise<unknown>;
  updateRealtimeTexturePackFrame?: (frame: unknown) => Promise<unknown>;
  revealRealtimeTexturePackOriginal?: (reveal: boolean) => Promise<unknown>;
  stopRealtimeTexturePackOverlay?: () => Promise<unknown>;
  showEnvironmentMissionHud?: (selection: unknown) => Promise<unknown>;
  stopEnvironmentMissionHud?: () => Promise<unknown>;
  showMessageCloud?: (frame: import("@shared/helix-message-cloud").HelixMessageCloudFrame) => Promise<unknown>;
  showCodexMirror?: (selection: { bindingId: string; helixConversationId: string }) => Promise<unknown>;
  readCodexMirror?: (selection: { bindingId: string; helixConversationId: string; visibleLimit?: 3 | 50 }) => Promise<unknown>;
  codexStreamGrants?: (request: unknown) => Promise<unknown>;
  stopMessageCloud?: () => Promise<unknown>;
  getMessageCloudStatus?: () => Promise<{ visible: boolean;
    source?: "session_activity" | "cloud_agent_dm" | "message_codex" | "codex_mirror" | null;
    helixConversationId?: string | null }>;
  onMessageCloudState?: (listener: (state: unknown) => void) => () => void;
  onRealtimeTexturePackState?: (
    listener: (state: unknown) => void,
  ) => () => void;
  onAuth0AccountLinkCompletion?: (
    listener: (state: unknown) => void,
  ) => () => void;
  onAuth0StepUpCompletion?: (
    listener: (state: unknown) => void,
  ) => () => void;
  onMcpTunnelState?: (listener: (state: unknown) => void) => () => void;
  onWorkstationGuidance?: (listener: (state: unknown) => void) => () => void;
  getPendingWorkstationGuidance?: () => Promise<unknown>;
  onUpdateState?: (listener: (state: unknown) => void) => () => void;
}>;

declare global {
  interface Window {
    casimirDesktop?: DesktopRuntimeBridge;
  }
}

export type NativeHandshakeState =
  | "not_available"
  | "pending"
  | "ready"
  | "rejected";

export type RuntimeSurfaceContextValue = Readonly<{
  surface: RuntimeSurface;
  capabilities: RuntimeCapabilities;
  nativeHandshake: NativeHandshakeState;
}>;

const detectStandaloneDisplayMode = (): boolean => {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const mediaStandalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return mediaStandalone || iosStandalone;
};

const browserRuntime = (): RuntimeSurfaceContextValue => {
  const surface = resolveRuntimeSurface({
    standaloneDisplayMode: detectStandaloneDisplayMode(),
  });
  return Object.freeze({
    surface,
    capabilities: resolveRuntimeCapabilities(surface),
    nativeHandshake: "not_available",
  });
};

const RuntimeSurfaceContext = createContext<RuntimeSurfaceContextValue>(browserRuntime());

export function RuntimeSurfaceProvider({ children }: React.PropsWithChildren) {
  const [runtime, setRuntime] = useState<RuntimeSurfaceContextValue>(() => browserRuntime());

  useEffect(() => {
    const bridge = window.casimirDesktop;
    if (!bridge || typeof bridge.getRuntimeSnapshot !== "function") return;

    let cancelled = false;
    let timeoutId: number | undefined;
    setRuntime((current) => ({ ...current, nativeHandshake: "pending" }));

    const timeout = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(
        () => reject(new Error("Desktop runtime handshake timed out")),
        NATIVE_HANDSHAKE_TIMEOUT_MS,
      );
    });

    void Promise.race([bridge.getRuntimeSnapshot(), timeout])
      .then((candidate) => {
        if (cancelled) return;
        const snapshot = parseDesktopRuntimeSnapshot(candidate, window.location.origin);
        if (!snapshot) {
          setRuntime((current) => ({ ...current, nativeHandshake: "rejected" }));
          return;
        }
        setRuntime(
          Object.freeze({
            surface: snapshot.surface,
            capabilities: snapshot.capabilities,
            nativeHandshake: "ready",
          }),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setRuntime((current) => ({ ...current, nativeHandshake: "rejected" }));
        }
      })
      .finally(() => {
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      });

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  const value = useMemo(() => Object.freeze(runtime), [runtime]);
  return <RuntimeSurfaceContext.Provider value={value}>{children}</RuntimeSurfaceContext.Provider>;
}

export const useRuntimeSurface = (): RuntimeSurfaceContextValue =>
  useContext(RuntimeSurfaceContext);
