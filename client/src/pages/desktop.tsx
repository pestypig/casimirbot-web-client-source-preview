import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  panelRegistry,
  getPanelDef,
  type PanelDefinition,
} from "@/lib/desktop/panelRegistry";
import { useDesktopStore } from "@/store/useDesktopStore";
import { DesktopWindow } from "@/components/desktop/DesktopWindow";
import { DesktopTaskbar } from "@/components/desktop/DesktopTaskbar";
import { HelixWorkstationShell } from "@/components/workstation/HelixWorkstationShell";
import { Dialog } from "@/components/ui/dialog";
import { HelixSettingsDialogContent } from "@/components/HelixSettingsDialogContent";
import SplashCursor from "@/components/SplashCursor";
import { HelixAskConsole } from "@/components/helix/ask-console/HelixAskConsole";
import { RoomServiceEntry } from "@/components/helix/ask-console/shared-live-room/RoomServiceEntry";
import {
  PROFILE_STORAGE_KEY,
  useHelixStartSettings,
} from "@/hooks/useHelixStartSettings";
import { getInterfaceLanguageOption } from "@/lib/i18n/interfaceLanguage";
import { useInterfaceText } from "@/lib/i18n/interfaceText";
import { getInterfacePanelTitle } from "@/lib/i18n/panelTitles";
import { useHelixSettingsDialog } from "@/hooks/useHelixSettingsDialog";
import {
  resolvePanelIds,
  type DesktopLayoutHash,
} from "@/lib/desktop/shareState";
import { useKnowledgeProjectsStore } from "@/store/useKnowledgeProjectsStore";
import { useDocViewerStore } from "@/store/useDocViewerStore";
import {
  fetchUiPreferences,
  type EssenceEnvironmentContext,
  type UiPreference,
} from "@/lib/agi/preferences";
import { SurfaceStack } from "@/components/surface/SurfaceStack";
import { generateSurfaceRecipe } from "@/lib/surfacekit/generateSurface";
import { useLumaMoodTheme } from "@/lib/luma-mood-theme";
import { ProcessGraphSurfaceLayer } from "@/components/workstation/ProcessGraphSurfaceLayer";
import NarratorReadRegionOverlay from "@/components/workstation/NarratorReadRegionOverlay";
import WorkstationGuidanceOverlay from "@/components/workstation/WorkstationGuidanceOverlay";
import { HELIX_ASK_CONTEXT_ID } from "@/lib/helix/voice-surface-contract";
import { useWorkstationLayoutStore } from "@/store/useWorkstationLayoutStore";
import { useNarratorHoverFocusInspector } from "@/lib/narrator/hoverFocusInspector";
import {
  HELIX_WORKSTATION_ACTION_EVENT,
  coerceHelixWorkstationActions,
  type HelixWorkstationAction,
} from "@/lib/workstation/workstationActionContract";
import { executeWorkstationActionWithLedger } from "@/lib/workstation/workstationActionExecutor";
import { runWorkstationJob } from "@/lib/workstation/jobExecutor";
import { emitHelixWorkstationProceduralStep } from "@/lib/workstation/proceduralPlaybackContract";
import { startWorkstationClipboardCapture } from "@/lib/workstation/workstationClipboard";
import { startWorkstationTimelineCapture } from "@/lib/workstation/workstationTimelineCapture";
import { startProcessGraphCapture } from "@/lib/workstation/processGraph/startProcessGraphCapture";
import { startWorkstationPerformanceSampler } from "@/lib/workstation/performance/startWorkstationPerformanceSampler";
import { runWhenQuiet } from "@/lib/workstation/performance/workstationInteractionScheduler";
import {
  createWorkstationActionTraceId,
  emitWorkstationActionLiveEvent,
} from "@/lib/workstation/workstationActionLiveEvents";
import {
  coerceWorkstationGuidanceRequest,
  requestWorkstationGuidance,
} from "@/lib/workstation/workstationGuidance";
import { maybePostSituationRoomSetupExecutionReceipt } from "@/lib/workstation/setupExecutionReceiptPost";
import {
  encodeWorkstationViewStateSearch,
  normalizeWorkstationDocPath,
  parseWorkstationViewStateFromUrl,
  type WorkstationViewState,
} from "@/lib/workstation/workstationDeepLink";
import { parseWorkstationLinkMetaFromUrl } from "@shared/workstation-link-meta";
import { useProfileStorageSync } from "@/lib/workstation/profileStorageSync";
import {
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,
  fetchAccountCapabilityPolicy,
  readCachedAccountCapabilityPolicy,
} from "@/lib/workstation/accountCapabilityPolicy";
import {
  HELIX_USER_ACCOUNT_POLICY,
  resolveHelixAccountPanelAccess,
  type HelixAccountCapabilityPolicy,
} from "@shared/helix-account-session";

const LAYOUT_COLLECTION_KEYS = [
  "panels",
  "windows",
  "openPanels",
  "items",
  "children",
  "columns",
  "stack",
  "slots",
];
const MAX_LAYOUT_DEPTH = 5;
const PENDING_PANEL_KEY = "helix:pending-panel";
const NOISE_GENS_PANEL_ID = "helix-noise-gens";
const ESSENCE_CONSOLE_PANEL_ID = "agi-essence-console";
const HELIX_CONVERSATION_TRACE_PANEL_ID = "workstation-workflow-timeline";
const NOISE_GENS_AUTO_OPEN_SUPPRESS = new Set([ESSENCE_CONSOLE_PANEL_ID]);
const WORKSTATION_PROCEDURAL_STEP_DELAY_MS = 220;

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, Math.max(0, ms));
  });
}
function collectPanelIdsFromStructure(
  input: unknown,
  target: Set<string>,
  depth = 0,
  allowLeaf = false,
): void {
  if (input === null || input === undefined || depth > MAX_LAYOUT_DEPTH) {
    return;
  }
  if (typeof input === "string") {
    if (allowLeaf) {
      const trimmed = input.trim();
      if (trimmed) {
        target.add(trimmed);
      }
    }
    return;
  }
  if (Array.isArray(input)) {
    input.forEach((entry) =>
      collectPanelIdsFromStructure(entry, target, depth + 1, true),
    );
    return;
  }
  if (typeof input === "object") {
    const record = input as Record<string, unknown>;
    if (allowLeaf) {
      const candidate =
        typeof record.panelId === "string"
          ? record.panelId
          : typeof record["panel_id"] === "string"
            ? (record["panel_id"] as string)
            : typeof record.panel === "string"
              ? record.panel
              : typeof record.id === "string"
                ? record.id
                : null;
      if (candidate) {
        const trimmed = candidate.trim();
        if (trimmed) {
          target.add(trimmed);
        }
      }
    }
    for (const key of LAYOUT_COLLECTION_KEYS) {
      if (key in record) {
        collectPanelIdsFromStructure(record[key], target, depth + 1, true);
      }
    }
  }
}

export default function DesktopPage({
  layoutVariant = "desktop",
}: {
  layoutVariant?: "desktop" | "mobile";
}) {
  useProfileStorageSync();
  useNarratorHoverFocusInspector();
  const { windows, registerFromManifest, open } = useDesktopStore();
  const workstationMode = useWorkstationLayoutStore((state) => state.mode);
  const { userSettings, updateSettings } = useHelixStartSettings();
  const interfaceLanguage = getInterfaceLanguageOption(
    userSettings.interfaceLanguage,
  );
  const { t } = useInterfaceText(interfaceLanguage.code);
  const {
    settingsOpen,
    settingsTab,
    setSettingsTab,
    openSettings,
    handleSettingsOpenChange,
  } = useHelixSettingsDialog("preferences");
  const {
    refresh: refreshProjects,
    selectProjects,
    projects,
  } = useKnowledgeProjectsStore((state) => ({
    projects: state.projects,
    refresh: state.refresh,
    selectProjects: state.selectProjects,
  }));
  const { exportActiveContext } = useKnowledgeProjectsStore((state) => ({
    exportActiveContext: state.exportActiveContext,
  }));
  const hashAppliedRef = useRef(false);
  // Only the entry URL is a restore request. Our own URL sync can run while
  // account/projects load; retrying effects must not reinterpret that output.
  const initialWorkstationView = useMemo(
    () => typeof window === "undefined" ? null : parseWorkstationViewStateFromUrl(window.location.href),
    [],
  );
  const urlSyncRestoringRef = useRef(false);
  const syncWorkstationUrlRef = useRef<(() => void) | null>(null);
  const environmentAppliedRef = useRef(false);
  const autoOpenSuppressRef = useRef<Set<string> | null>(null);
  const accountPolicyRef = useRef<HelixAccountCapabilityPolicy>(
    readCachedAccountCapabilityPolicy() ?? HELIX_USER_ACCOUNT_POLICY,
  );
  const { mood } = useLumaMoodTheme({ randomize: true, listenToBus: true });
  const orientation = layoutVariant === "mobile" ? "mobile" : "desktop";
  const initialMobileSurface = useMemo(
    () =>
      typeof window !== "undefined"
        ? (parseWorkstationLinkMetaFromUrl(window.location.href).entry ?? "ask")
        : "ask",
    [],
  );
  const wallpaperRecipe = useMemo(
    () =>
      generateSurfaceRecipe({
        seed: "helix-workstation-world-v1",
        context:
          layoutVariant === "mobile" ? "mobile-shell" : "desktop-wallpaper",
        density: "medium",
        mood,
        orientation,
      }),
    [layoutVariant, mood, orientation],
  );
  const allowAutoOpen = false;
  const workstationEnabledFlag =
    String((import.meta as any)?.env?.VITE_HELIX_WORKSTATION_SHELL ?? "1") !==
    "0";
  const processGraphSurfaceEnabled =
    String(
      (import.meta as any)?.env?.VITE_HELIX_PROCESS_GRAPH_SURFACE ?? "1",
    ) !== "0";
  const workstationEnabled =
    workstationEnabledFlag &&
    (workstationMode === "workstation" || layoutVariant === "mobile");

  const canOpenPanelForAccount = useCallback((panelId: string): boolean => {
    // Device Check is a read-only launch surface for every account. Its
    // developer-only native controls are gated inside the panel and host IPC.
    if (panelId === "device-check") return true;
    return (
      resolveHelixAccountPanelAccess(accountPolicyRef.current, panelId)
        .state === "available"
    );
  }, []);

  const filterPanelsForAccount = useCallback(
    (panelIds: readonly string[]): string[] => {
      const filtered: string[] = [];
      for (const panelId of panelIds) {
        if (!getPanelDef(panelId)) continue;
        if (!canOpenPanelForAccount(panelId)) continue;
        if (!filtered.includes(panelId)) filtered.push(panelId);
      }
      return filtered;
    },
    [canOpenPanelForAccount],
  );

  const openPanelUniversal = useCallback(
    (panelId: string) => {
      if (!panelId) return;
      if (!getPanelDef(panelId)) return;
      if (!canOpenPanelForAccount(panelId)) return;
      if (workstationEnabled) {
        useWorkstationLayoutStore.getState().openPanelInActiveGroup(panelId);
        return;
      }
      open(panelId);
    },
    [canOpenPanelForAccount, open, workstationEnabled],
  );

  const applyWorkstationViewState = useCallback(
    (viewState: WorkstationViewState) => {
      const panels = filterPanelsForAccount(viewState.panels);
      if (viewState.activeDocPath && !panels.includes("docs-viewer")) {
        panels.push("docs-viewer");
      }
      panels.forEach((panelId) => openPanelUniversal(panelId));
      if (viewState.activeDocPath) {
        useDocViewerStore
          .getState()
          .viewDoc(viewState.activeDocPath, viewState.anchor);
      }
      const requestedFocusPanel =
        viewState.focusPanel ??
        (viewState.activeDocPath ? "docs-viewer" : undefined);
      const focusPanel =
        requestedFocusPanel && canOpenPanelForAccount(requestedFocusPanel)
          ? requestedFocusPanel
          : (panels[0] ?? undefined);
      if (focusPanel && workstationEnabled) {
        const store = useWorkstationLayoutStore.getState();
        const hit = Object.values(store.groups).find((group) =>
          group.panelIds.includes(focusPanel),
        );
        if (hit) {
          store.setActivePanel(hit.id, focusPanel);
          store.focusGroup(hit.id);
        } else {
          store.openPanelInActiveGroup(focusPanel);
        }
      } else if (focusPanel) {
        openPanelUniversal(focusPanel);
      }
    },
    [
      canOpenPanelForAccount,
      filterPanelsForAccount,
      openPanelUniversal,
      workstationEnabled,
    ],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    let canceled = false;
    const applyPolicy = (
      policy: HelixAccountCapabilityPolicy | null | undefined,
    ) => {
      accountPolicyRef.current = policy ?? HELIX_USER_ACCOUNT_POLICY;
      // Policy is held in a ref, so changing it does not itself notify layout
      // subscribers. Re-project the current view through the new access policy.
      syncWorkstationUrlRef.current?.();
    };
    const handlePolicyChange = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          account_policy?: HelixAccountCapabilityPolicy | null;
        }>
      ).detail;
      applyPolicy(detail?.account_policy);
    };
    window.addEventListener(
      HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,
      handlePolicyChange as EventListener,
    );
    fetchAccountCapabilityPolicy()
      .then((policy) => {
        if (!canceled) applyPolicy(policy);
      })
      .catch(() => {
        if (!canceled)
          applyPolicy(
            readCachedAccountCapabilityPolicy() ?? HELIX_USER_ACCOUNT_POLICY,
          );
      });
    return () => {
      canceled = true;
      window.removeEventListener(
        HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,
        handlePolicyChange as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    registerFromManifest(panelRegistry, { allowDefaultOpen: false });
  }, [registerFromManifest]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const pending = window.localStorage.getItem(PENDING_PANEL_KEY);
      if (pending) {
        if (pending === NOISE_GENS_PANEL_ID) {
          autoOpenSuppressRef.current = NOISE_GENS_AUTO_OPEN_SUPPRESS;
        }
        openPanelUniversal(pending);
        window.localStorage.removeItem(PENDING_PANEL_KEY);
      }
    } catch {
      // ignore storage read failures
    }
  }, [openPanelUniversal]);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const custom = event as CustomEvent<{ id?: string }>;
      const id = custom?.detail?.id;
      if (!id) return;
      openPanelUniversal(id);
    };
    window.addEventListener("open-helix-panel", handleOpen as EventListener);
    return () => {
      window.removeEventListener(
        "open-helix-panel",
        handleOpen as EventListener,
      );
    };
  }, [openPanelUniversal]);

  useEffect(() => {
    const subscribe = window.casimirDesktop?.onWorkstationGuidance;
    if (!subscribe) return;
    const present = (candidate: unknown) => {
      const request = coerceWorkstationGuidanceRequest(candidate);
      if (!request) return;
      if (request.panelId) openPanelUniversal(request.panelId);
      requestWorkstationGuidance(request);
    };
    return subscribe(present);
  }, [openPanelUniversal]);

  useEffect(() => {
    const handleKnowledgeOpen = (event: Event) => {
      const custom = event as CustomEvent<{ projectId?: string }>;
      const projectId = custom?.detail?.projectId;
      if (projectId) {
        selectProjects([projectId]);
      }
      openSettings("knowledge");
    };
    window.addEventListener(
      "open-knowledge-project",
      handleKnowledgeOpen as EventListener,
    );
    return () => {
      window.removeEventListener(
        "open-knowledge-project",
        handleKnowledgeOpen as EventListener,
      );
    };
  }, [openSettings, selectProjects]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stopClipboardCapture = startWorkstationClipboardCapture();
    const stopTimelineCapture = startWorkstationTimelineCapture();
    const stopProcessGraphCapture = startProcessGraphCapture();
    const stopPerformanceSampler = startWorkstationPerformanceSampler();
    const handleWorkstationAction = (event: Event) => {
      const detail = (event as CustomEvent<unknown>)?.detail;
      const actions = coerceHelixWorkstationActions(detail);
      if (actions.length === 0) return;
      const store = useWorkstationLayoutStore.getState();
      const runAction = async (action: HelixWorkstationAction) => {
        const guidedPanelId =
          "panel_id" in action ? action.panel_id : undefined;
        const guidedControlId =
          action.action === "run_panel_action" ? action.action_id : undefined;
        if (guidedPanelId) {
          requestWorkstationGuidance({
            kind: "tool_activity",
            panelId: guidedPanelId,
            controlId: guidedControlId,
            label: guidedControlId
              ? `Using ${guidedControlId} in ${guidedPanelId}. No click or authority is implied by this highlight.`
              : `${action.action.replaceAll("_", " ")} · ${guidedPanelId}`,
            durationMs: 2600,
          });
        }
        const traceId = createWorkstationActionTraceId(action.action);
        const startedAtMs = Date.now();
        const publish = (args: {
          ok: boolean;
          kind?:
            | "workstation_action_receipt"
            | "workstation_procedural_step"
            | "situation_room_setup_execution_receipt";
          message?: string;
          artifact?: Record<string, unknown> | null;
        }) => {
          emitWorkstationActionLiveEvent({
            contextId: HELIX_ASK_CONTEXT_ID.desktop,
            traceId,
            action,
            ok: args.ok,
            kind: args.kind,
            message: args.message,
            artifact: args.artifact ?? null,
            durationMs: Math.max(0, Date.now() - startedAtMs),
          });
        };
        switch (action.action) {
          case "open_panel":
            if (!getPanelDef(action.panel_id)) {
              publish({
                ok: false,
                message: `Unknown panel: ${action.panel_id}`,
              });
              return;
            }
            openPanelUniversal(action.panel_id);
            publish({ ok: true });
            return;
          case "focus_panel": {
            if (!getPanelDef(action.panel_id)) {
              publish({
                ok: false,
                message: `Unknown panel: ${action.panel_id}`,
              });
              return;
            }
            if (!workstationEnabled) {
              openPanelUniversal(action.panel_id);
              publish({ ok: true, message: "Focused via freeform mode." });
              return;
            }
            const groupId =
              action.group_id ??
              Object.values(store.groups).find((group) =>
                group.panelIds.includes(action.panel_id),
              )?.id;
            if (groupId) {
              store.setActivePanel(groupId, action.panel_id);
              store.focusGroup(groupId);
              publish({ ok: true });
              return;
            }
            openPanelUniversal(action.panel_id);
            publish({
              ok: true,
              message: "Panel opened because no existing group owned it.",
            });
            return;
          }
          case "close_panel": {
            if (!workstationEnabled) {
              publish({
                ok: false,
                message: "Close panel ignored outside workstation mode.",
              });
              return;
            }
            if (action.group_id) {
              store.closePanelFromGroup(action.group_id, action.panel_id);
              publish({ ok: true });
              return;
            }
            Object.values(store.groups).forEach((group) => {
              if (group.panelIds.includes(action.panel_id)) {
                store.closePanelFromGroup(group.id, action.panel_id);
              }
            });
            publish({ ok: true });
            return;
          }
          case "close_active_panel": {
            if (!workstationEnabled) {
              publish({
                ok: false,
                message: "Close active panel ignored outside workstation mode.",
              });
              return;
            }
            const closed = store.closeActivePanel();
            if (!closed) {
              publish({ ok: false, message: "No active panel to close." });
              return;
            }
            publish({
              ok: true,
              message: `Closed active panel ${closed.panelId}.`,
            });
            return;
          }
          case "focus_next_panel": {
            if (!workstationEnabled) {
              publish({
                ok: false,
                message: "Focus next panel ignored outside workstation mode.",
              });
              return;
            }
            const focused = store.focusAdjacentPanel("next");
            if (!focused) {
              publish({
                ok: false,
                message: "No panel available to focus next.",
              });
              return;
            }
            publish({ ok: true, message: `Focused ${focused.panelId}.` });
            return;
          }
          case "focus_previous_panel": {
            if (!workstationEnabled) {
              publish({
                ok: false,
                message:
                  "Focus previous panel ignored outside workstation mode.",
              });
              return;
            }
            const focused = store.focusAdjacentPanel("previous");
            if (!focused) {
              publish({
                ok: false,
                message: "No panel available to focus previous.",
              });
              return;
            }
            publish({ ok: true, message: `Focused ${focused.panelId}.` });
            return;
          }
          case "reopen_last_closed_panel": {
            if (!workstationEnabled) {
              publish({
                ok: false,
                message: "Reopen panel ignored outside workstation mode.",
              });
              return;
            }
            const reopened = store.reopenLastClosedPanel();
            if (!reopened) {
              publish({
                ok: false,
                message: "No recently closed panel to reopen.",
              });
              return;
            }
            publish({ ok: true, message: `Reopened ${reopened.panelId}.` });
            return;
          }
          case "open_settings":
            openSettings(action.tab ?? "preferences");
            publish({ ok: true });
            return;
          case "set_chat_dock":
            if (!workstationEnabled) {
              publish({
                ok: false,
                message: "Set chat dock ignored outside workstation mode.",
              });
              return;
            }
            if (typeof action.width_px === "number") {
              store.setChatDockWidth(action.width_px);
            }
            if (
              typeof action.collapsed === "boolean" &&
              action.collapsed !== store.chatDock.collapsed
            ) {
              store.toggleChatDock();
            }
            publish({ ok: true });
            return;
          case "restore_view_state":
            applyWorkstationViewState(action.view_state);
            publish({
              ok: true,
              message: "Restored workstation view state.",
              artifact: {
                kind: "workstation_view_state_restore",
                panels: action.view_state.panels,
                focus_panel: action.view_state.focusPanel ?? null,
                active_doc_path: action.view_state.activeDocPath ?? null,
                anchor: action.view_state.anchor ?? null,
                path_ref: action.view_state.pathRef ?? null,
              },
            });
            return;
          case "run_panel_action": {
            const actionId = action.action_id.trim().toLowerCase();
            const isProceduralDocsAction =
              workstationEnabled &&
              action.panel_id === "docs-viewer" &&
              (actionId === "open_doc" ||
                actionId === "open_doc_by_path" ||
                actionId === "open_latest_doc_by_topic" ||
                actionId === "open_doc_and_read");
            const targetGroupId =
              store.activeGroupId ??
              Object.values(store.groups).find((group) =>
                group.panelIds.includes("docs-viewer"),
              )?.id;
            if (isProceduralDocsAction) {
              emitHelixWorkstationProceduralStep({
                traceId,
                step: "highlight_plus",
                groupId: targetGroupId,
                panelId: "docs-viewer",
              });
              publish({
                ok: true,
                kind: "workstation_procedural_step",
                message: "Step: focusing panel picker (+).",
                artifact: { phase: "highlight_plus" },
              });
              await sleep(WORKSTATION_PROCEDURAL_STEP_DELAY_MS);

              emitHelixWorkstationProceduralStep({
                traceId,
                step: "open_picker",
                groupId: targetGroupId,
                panelId: "docs-viewer",
              });
              publish({
                ok: true,
                kind: "workstation_procedural_step",
                message: "Step: opening panel picker.",
                artifact: { phase: "open_picker" },
              });
              await sleep(WORKSTATION_PROCEDURAL_STEP_DELAY_MS);

              emitHelixWorkstationProceduralStep({
                traceId,
                step: "target_panel",
                groupId: targetGroupId,
                panelId: "docs-viewer",
              });
              publish({
                ok: true,
                kind: "workstation_procedural_step",
                message: "Step: targeting Docs panel.",
                artifact: { phase: "target_panel", panel_id: "docs-viewer" },
              });
              await sleep(WORKSTATION_PROCEDURAL_STEP_DELAY_MS + 80);
            }

            const execution = await executeWorkstationActionWithLedger({
              request: {
                panel_id: action.panel_id,
                action_id: action.action_id,
                args: action.args,
              },
              thread_id: HELIX_ASK_CONTEXT_ID.desktop,
              trace_id: traceId,
              context: {
                openPanel: (panelId, groupId) => {
                  if (groupId && workstationEnabled) {
                    store.openPanelInGroup(groupId, panelId);
                    return;
                  }
                  openPanelUniversal(panelId);
                },
                focusPanel: (panelId, groupId) => {
                  if (groupId && workstationEnabled) {
                    store.setActivePanel(groupId, panelId);
                    store.focusGroup(groupId);
                    return;
                  }
                  if (workstationEnabled) {
                    const hit = Object.values(store.groups).find((group) =>
                      group.panelIds.includes(panelId),
                    );
                    if (hit) {
                      store.setActivePanel(hit.id, panelId);
                      store.focusGroup(hit.id);
                      return;
                    }
                  }
                  openPanelUniversal(panelId);
                },
                closePanel: (panelId, groupId) => {
                  if (!workstationEnabled) return;
                  if (groupId) {
                    store.closePanelFromGroup(groupId, panelId);
                    return;
                  }
                  Object.values(store.groups).forEach((group) => {
                    if (group.panelIds.includes(panelId)) {
                      store.closePanelFromGroup(group.id, panelId);
                    }
                  });
                },
                openSettings: (tab) => openSettings(tab ?? "preferences"),
              },
            });
            const result = execution.result;
            if (result.ok && isProceduralDocsAction) {
              const path =
                result.artifact && typeof result.artifact.path === "string"
                  ? result.artifact.path
                  : undefined;
              emitHelixWorkstationProceduralStep({
                traceId,
                step: "open_doc",
                groupId: targetGroupId,
                panelId: "docs-viewer",
                docPath: path,
              });
              publish({
                ok: true,
                message: "Step: opening selected document in Docs panel.",
                artifact: { phase: "open_doc", path: path ?? null },
              });
              if (actionId === "open_doc_and_read") {
                emitHelixWorkstationProceduralStep({
                  traceId,
                  step: "read_start",
                  groupId: targetGroupId,
                  panelId: "docs-viewer",
                  docPath: path,
                });
                publish({
                  ok: true,
                  message: "Step: starting read-aloud.",
                  artifact: { phase: "read_start", path: path ?? null },
                });
              }
              emitHelixWorkstationProceduralStep({
                traceId,
                step: "close_picker",
                groupId: targetGroupId,
                panelId: "docs-viewer",
                docPath: path,
              });
              publish({
                ok: true,
                kind: "workstation_procedural_step",
                message: "Step: closing panel picker.",
                artifact: { phase: "close_picker", path: path ?? null },
              });
            }
            publish({
              ok: result.ok,
              kind:
                result.artifact &&
                typeof result.artifact === "object" &&
                (result.artifact as Record<string, unknown>).kind ===
                  "situation_room_setup_execution_receipt"
                  ? "situation_room_setup_execution_receipt"
                  : undefined,
              message: result.message,
              artifact: result.artifact ?? null,
            });
            maybePostSituationRoomSetupExecutionReceipt({
              action,
              artifact: result.artifact ?? null,
              traceId,
            });
            return;
          }
          case "run_job":
            publish({
              ok: true,
              message: "Delegated to workstation job executor.",
            });
            const payloadWithJobId = action.payload.job_id
              ? action.payload
              : { ...action.payload, job_id: traceId };
            void runWorkstationJob({
              contextId: HELIX_ASK_CONTEXT_ID.desktop,
              payload: payloadWithJobId,
              executionContext: {
                openPanel: (panelId, groupId) => {
                  if (groupId && workstationEnabled) {
                    store.openPanelInGroup(groupId, panelId);
                    return;
                  }
                  openPanelUniversal(panelId);
                },
                focusPanel: (panelId, groupId) => {
                  if (groupId && workstationEnabled) {
                    store.setActivePanel(groupId, panelId);
                    store.focusGroup(groupId);
                    return;
                  }
                  if (workstationEnabled) {
                    const hit = Object.values(store.groups).find((group) =>
                      group.panelIds.includes(panelId),
                    );
                    if (hit) {
                      store.setActivePanel(hit.id, panelId);
                      store.focusGroup(hit.id);
                      return;
                    }
                  }
                  openPanelUniversal(panelId);
                },
                closePanel: (panelId, groupId) => {
                  if (!workstationEnabled) return;
                  if (groupId) {
                    store.closePanelFromGroup(groupId, panelId);
                    return;
                  }
                  Object.values(store.groups).forEach((group) => {
                    if (group.panelIds.includes(panelId)) {
                      store.closePanelFromGroup(group.id, panelId);
                    }
                  });
                },
                openSettings: (tab) => openSettings(tab ?? "preferences"),
              },
            });
            return;
          case "toggle_mobile_drawer":
            publish({
              ok: false,
              message: "Toggle mobile drawer is not supported on desktop.",
            });
            return;
          default:
            publish({ ok: false, message: "Unhandled workstation action." });
            return;
        }
      };
      for (const action of actions) {
        void runAction(action);
      }
    };
    window.addEventListener(
      HELIX_WORKSTATION_ACTION_EVENT,
      handleWorkstationAction as EventListener,
    );
    return () => {
      window.removeEventListener(
        HELIX_WORKSTATION_ACTION_EVENT,
        handleWorkstationAction as EventListener,
      );
      stopClipboardCapture();
      stopTimelineCapture();
      stopProcessGraphCapture();
      stopPerformanceSampler();
    };
  }, [
    applyWorkstationViewState,
    openPanelUniversal,
    openSettings,
    workstationEnabled,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMeta = event.metaKey || event.ctrlKey;
      if (!isMeta) return;
      if (event.key !== ",") return;
      event.preventDefault();
      openSettings("preferences");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openSettings]);

  const applyLayout = useCallback(
    (layout: DesktopLayoutHash) => {
      if (layout.projectSlug) {
        const match = projects.find(
          (project) => project.hashSlug === layout.projectSlug,
        );
        if (match) {
          selectProjects([match.id]);
        }
      }
      const panels = filterPanelsForAccount(resolvePanelIds(layout.panels));
      if (panels.includes(NOISE_GENS_PANEL_ID)) {
        autoOpenSuppressRef.current = NOISE_GENS_AUTO_OPEN_SUPPRESS;
      }
      panels.forEach((id) => openPanelUniversal(id));
    },
    [filterPanelsForAccount, openPanelUniversal, projects, selectProjects],
  );

  const applyEnvironment = useCallback(
    (context: EssenceEnvironmentContext | null | undefined) => {
      if (!context || !allowAutoOpen) return;
      const panelIds = new Set<string>();
      collectPanelIdsFromStructure(
        context.template.defaultPanels ?? [],
        panelIds,
        0,
        true,
      );
      collectPanelIdsFromStructure(
        context.template.defaultDesktopLayout,
        panelIds,
      );
      collectPanelIdsFromStructure(
        context.environment.userOverrides?.layout,
        panelIds,
      );
      collectPanelIdsFromStructure(
        context.environment.userOverrides?.widgets,
        panelIds,
      );
      panelIds.forEach((panelId) => {
        if (panelId && getPanelDef(panelId)) {
          if (autoOpenSuppressRef.current?.has(panelId)) {
            return;
          }
          openPanelUniversal(panelId);
        }
      });
    },
    [allowAutoOpen, openPanelUniversal],
  );

  useEffect(() => {
    if (hashAppliedRef.current) return;
    if (typeof window === "undefined") return;
    let canceled = false;
    const restore = async () => {
      const viewState = initialWorkstationView;
      if (!viewState) return;
      await fetchAccountCapabilityPolicy()
        .then((policy) => {
          accountPolicyRef.current = policy;
        })
        .catch(() => {
          accountPolicyRef.current =
            readCachedAccountCapabilityPolicy() ?? HELIX_USER_ACCOUNT_POLICY;
        });
      if (canceled) return;
      if (
        !viewState.projectSlug &&
        viewState.panels.length === 0 &&
        !viewState.focusPanel &&
        !viewState.activeDocPath
      ) {
        hashAppliedRef.current = true;
        return;
      }
      if (viewState.projectSlug) {
        const match = projects.find(
          (project) => project.hashSlug === viewState.projectSlug,
        );
        if (!match) {
          return;
        }
        selectProjects([match.id]);
      }
      urlSyncRestoringRef.current = true;
      applyWorkstationViewState(viewState);
      window.setTimeout(() => {
        urlSyncRestoringRef.current = false;
        // Layout notifications were suppressed during restoration. Flush the
        // final admitted view even when no later layout change occurs.
        syncWorkstationUrlRef.current?.();
      }, 0);
      hashAppliedRef.current = true;
    };
    void restore();
    return () => {
      canceled = true;
    };
  }, [applyWorkstationViewState, initialWorkstationView, projects, selectProjects]);

  useEffect(() => {
    if (typeof window === "undefined" || !workstationEnabled) return;
    const buildViewState = (): WorkstationViewState => {
      const layout = useWorkstationLayoutStore.getState();
      const panelSet = new Set<string>();
      Object.values(layout.groups).forEach((group) => {
        group.panelIds.forEach((panelId) => {
          if (getPanelDef(panelId) && canOpenPanelForAccount(panelId))
            panelSet.add(panelId);
        });
      });
      const activeGroup = layout.groups[layout.activeGroupId] ?? null;
      const focusPanel =
        activeGroup?.activePanelId &&
        getPanelDef(activeGroup.activePanelId) &&
        canOpenPanelForAccount(activeGroup.activePanelId)
          ? activeGroup.activePanelId
          : undefined;
      const docState = useDocViewerStore.getState();
      const activeDocPath =
        docState.mode === "doc"
          ? normalizeWorkstationDocPath(docState.currentPath)
          : null;
      return {
        panels: [...panelSet].sort((a, b) => a.localeCompare(b)),
        ...(focusPanel ? { focusPanel } : {}),
        ...(activeDocPath ? { activeDocPath } : {}),
        ...(activeDocPath && docState.anchor
          ? { anchor: docState.anchor }
          : {}),
      };
    };
    const syncUrl = () => {
      if (urlSyncRestoringRef.current) return;
      const viewState = buildViewState();
      const nextSearch = encodeWorkstationViewStateSearch(
        viewState,
        window.location.search,
      );
      const nextUrl = `${window.location.pathname}${nextSearch}`;
      const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextUrl !== currentUrl) {
        window.history.replaceState(window.history.state, "", nextUrl);
      }
    };
    let cancelScheduledSync: (() => void) | null = null;
    syncWorkstationUrlRef.current = syncUrl;
    const scheduleSyncUrl = () => {
      cancelScheduledSync?.();
      cancelScheduledSync = runWhenQuiet(syncUrl, {
        key: "workstation.url_sync",
        priority: "share_state",
        quietMs: 700,
        timeoutMs: 2500,
      });
    };
    // Panel focus is reload-critical state. Persist it synchronously so a Vite
    // reload or a pressure-triggered remount cannot restore a stale `focus=`
    // query while the quieter document/share-state sync is still pending.
    const unsubscribeLayout = useWorkstationLayoutStore.subscribe(syncUrl);
    const unsubscribeDocs = useDocViewerStore.subscribe(scheduleSyncUrl);
    scheduleSyncUrl();
    return () => {
      if (syncWorkstationUrlRef.current === syncUrl) syncWorkstationUrlRef.current = null;
      cancelScheduledSync?.();
      unsubscribeLayout();
      unsubscribeDocs();
    };
  }, [canOpenPanelForAccount, workstationEnabled]);

  useEffect(() => {
    const handleApplyLayout = (event: Event) => {
      const detail = (event as CustomEvent<DesktopLayoutHash>).detail;
      if (!detail) return;
      applyLayout(detail);
    };
    window.addEventListener(
      "apply-desktop-layout",
      handleApplyLayout as EventListener,
    );
    return () =>
      window.removeEventListener(
        "apply-desktop-layout",
        handleApplyLayout as EventListener,
      );
  }, [applyLayout]);

  const clearSavedChoice = useCallback(() => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(PROFILE_STORAGE_KEY);
    }
  }, []);

  const applyUiPreferences = useCallback(
    (preferences: UiPreference[]) => {
      if (!allowAutoOpen) return;
      if (!Array.isArray(preferences) || preferences.length === 0) {
        return;
      }
      const seen = new Set<string>();
      preferences.forEach((pref) => {
        if (!pref?.key || seen.has(pref.key)) {
          return;
        }
        if (pref.key.startsWith("panel:")) {
          const panelId = pref.key.slice("panel:".length);
          if (panelId) {
            if (autoOpenSuppressRef.current?.has(panelId)) {
              return;
            }
            openPanelUniversal(panelId);
            seen.add(pref.key);
          }
        }
      });
    },
    [allowAutoOpen, openPanelUniversal],
  );

  useEffect(() => {
    let canceled = false;
    fetchUiPreferences()
      .then(({ preferences, environment }) => {
        if (canceled) return;
        if (preferences?.length && allowAutoOpen) {
          applyUiPreferences(preferences);
        }
        if (environment && !environmentAppliedRef.current && allowAutoOpen) {
          applyEnvironment(environment);
          environmentAppliedRef.current = true;
        }
      })
      .catch(() => undefined);
    return () => {
      canceled = true;
    };
  }, [allowAutoOpen, applyEnvironment, applyUiPreferences]);

  const openPanelById = useCallback(
    (panelId: PanelDefinition["id"]) => {
      if (!panelId) return;
      if (!getPanelDef(panelId)) return;
      openPanelUniversal(panelId);
    },
    [openPanelUniversal],
  );
  return (
    <Dialog open={settingsOpen} onOpenChange={handleSettingsOpenChange}>
      <RoomServiceEntry />
      {userSettings.enableSplashCursor && <SplashCursor />}
      <div
        className="mood-transition-scope relative box-border h-screen w-screen overflow-hidden bg-slate-950 text-slate-100"
        data-layout-variant={layoutVariant}
        style={
          layoutVariant === "mobile"
            ? {
                height: "100dvh",
                paddingTop: "env(safe-area-inset-top, 0px)",
                paddingRight: "env(safe-area-inset-right, 0px)",
                paddingBottom: "env(safe-area-inset-bottom, 0px)",
                paddingLeft: "env(safe-area-inset-left, 0px)",
              }
            : undefined
        }
      >
        <SurfaceStack recipe={wallpaperRecipe} />
        {processGraphSurfaceEnabled ? (
          <ProcessGraphSurfaceLayer
            mood={mood}
            orientation={orientation}
            mode="ambient"
          />
        ) : null}
        <NarratorReadRegionOverlay />
        <WorkstationGuidanceOverlay />
        {workstationEnabled ? (
          <HelixWorkstationShell
            layoutVariant={layoutVariant}
            initialMobileSurface={initialMobileSurface}
            onOpenPanel={openPanelUniversal}
          />
        ) : (
          <>
            <div className="pointer-events-none absolute inset-x-0 top-[18%] z-10 flex flex-col items-center px-6">
              <HelixAskConsole
                className="pointer-events-auto w-full"
                contextId={HELIX_ASK_CONTEXT_ID.desktop}
                maxWidthClassName="max-w-4xl mx-auto"
                onOpenPanel={openPanelById}
                onOpenConversation={() => {
                  openPanelUniversal(HELIX_CONVERSATION_TRACE_PANEL_ID);
                }}
              />
            </div>
            {Object.values(windows)
              .filter((w) => w.isOpen)
              .sort((a, b) => a.z - b.z)
              .map((w) => {
                const def = getPanelDef(w.id);
                if (!def) return null;
                return (
                  <DesktopWindow
                    key={w.id}
                    id={w.id}
                    title={getInterfacePanelTitle(t, String(def.id), def.title)}
                    Loader={def.loader}
                  />
                );
              })}
          </>
        )}

        {layoutVariant === "desktop" && !workstationEnabled ? (
          <DesktopTaskbar
            onOpenPanel={openPanelUniversal}
            showStart
            showWindowTabs
          />
        ) : null}
      </div>

      <HelixSettingsDialogContent
        settingsTab={settingsTab}
        onSettingsTabChange={setSettingsTab}
        userSettings={userSettings}
        updateSettings={updateSettings}
        onClearSavedChoice={clearSavedChoice}
        onClose={() => handleSettingsOpenChange(false)}
      />
    </Dialog>
  );
}
