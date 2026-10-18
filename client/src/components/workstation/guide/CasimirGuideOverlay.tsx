import React from "react";
import {
  HELIX_USER_ACCOUNT_POLICY,
  resolveHelixAccountPanelAccess,
  type HelixAccountCapabilityPolicy,
} from "@shared/helix-account-session";
import type { HelixFriendsPartiesResponse } from "@shared/helix-friends-voice-party";
import {
  requestOpenSharedLiveRoomDialog,
  useSharedLiveRoomGuideProjection,
} from "@/components/helix/ask-console/shared-live-room/SharedLiveRoomGuideProjection";
import { friendsPartiesApi } from "@/components/workstation/friends-parties/FriendsPartiesApi";
import { useHelixStartSettings } from "@/hooks/useHelixStartSettings";
import { getPanelDef, panelRegistry, type PanelDefinition } from "@/lib/desktop/panelRegistry";
import { getInterfaceLanguageOption } from "@/lib/i18n/interfaceLanguage";
import type { InterfaceMessageId } from "@/lib/i18n/messages/types";
import { getInterfacePanelTitle } from "@/lib/i18n/panelTitles";
import { useInterfaceText } from "@/lib/i18n/interfaceText";
import {
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,
  fetchAccountCapabilityPolicy,
  readCachedAccountCapabilityPolicy,
} from "@/lib/workstation/accountCapabilityPolicy";
import { isDiscoverableLaunchPanel, isUserLaunchPanel } from "@/lib/workstation/launchPanelPolicy";
import { isSolarSpecialistLaunchPanel } from "@/lib/workstation/solarSpecialistPanels";
import {
  CasimirGuideRow,
  type CasimirGuideRowModel,
  type CasimirGuideRowState,
} from "./CasimirGuideRow";
import { useCasimirGuideEnvironmentProjection } from "./CasimirGuideEnvironmentProjection";
import { useCasimirGuideMissionProjection } from "./CasimirGuideMissionProjection";

const BLADES = [
  { key: "workspace", messageId: "casimirGuide.blade.workspace" },
  { key: "mission", messageId: "casimirGuide.blade.mission" },
  { key: "guide", messageId: "casimirGuide.blade.guide" },
  { key: "liveRoom", messageId: "casimirGuide.blade.liveRoom" },
  { key: "environment", messageId: "casimirGuide.blade.environment" },
  { key: "system", messageId: "casimirGuide.blade.system" },
] as const satisfies ReadonlyArray<{ key: string; messageId: InterfaceMessageId }>;

type Blade = typeof BLADES[number]["key"];
type WorkspaceView = "root" | "recent" | "favorites" | "search";
type SocialState = "loading" | "ready" | "locked" | "failed";

export type CasimirGuideContext = {
  activePanelId: string | null;
  recentPanelIds: string[];
  favoritePanelIds: string[];
};

const EMPTY_CONTEXT: CasimirGuideContext = {
  activePanelId: null,
  recentPanelIds: [],
  favoritePanelIds: [],
};

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

const CONTEXTUAL_SHORTCUTS: ReadonlyArray<{
  matches(panelId: string): boolean;
  panelIds: readonly string[];
}> = [
  {
    matches: (panelId) => panelId === "docs-viewer" || panelId.includes("image-lens"),
    panelIds: ["workstation-notes", "image-lens"],
  },
  {
    matches: (panelId) => ["device-check", "local-harness", "live-answer-environment"].includes(panelId),
    panelIds: ["device-check", "live-answer-environment"],
  },
  {
    matches: (panelId) => panelId === "scientific-calculator",
    panelIds: ["scientific-calculator"],
  },
];

const focusElement = (element: Element | null | undefined): void => {
  if (element instanceof HTMLElement && element.isConnected) element.focus();
};

const normalizeSearch = (value: string): string[] => value
  .trim()
  .toLocaleLowerCase()
  .split(/\s+/u)
  .filter(Boolean);

const rowId = (prefix: string, value: string): string => `${prefix}-${value.replace(/[^a-z0-9_-]+/giu, "-")}`;

export function CasimirGuideOverlay(props: {
  open: boolean;
  onClose(): void;
  onOpenPanel(panelId: string): void;
  context?: CasimirGuideContext;
}) {
  const context = props.context ?? EMPTY_CONTEXT;
  const { userSettings } = useHelixStartSettings();
  const language = getInterfaceLanguageOption(userSettings.interfaceLanguage);
  const { t } = useInterfaceText(language.code);
  const liveRoom = useSharedLiveRoomGuideProjection(props.open);
  const mission = useCasimirGuideMissionProjection(props.open);
  const [activeBlade, setActiveBlade] = React.useState<Blade>("guide");
  const [workspaceView, setWorkspaceView] = React.useState<WorkspaceView>("root");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [accountPolicy, setAccountPolicy] = React.useState<HelixAccountCapabilityPolicy>(
    () => readCachedAccountCapabilityPolicy() ?? HELIX_USER_ACCOUNT_POLICY,
  );
  const deviceCheckAccess = resolveHelixAccountPanelAccess(accountPolicy, "device-check");
  const deviceCheckAvailable = deviceCheckAccess.state === "available" || isUserLaunchPanel("device-check");
  const environment = useCasimirGuideEnvironmentProjection(
    props.open && deviceCheckAvailable,
  );
  const [social, setSocial] = React.useState<HelixFriendsPartiesResponse | null>(null);
  const [socialState, setSocialState] = React.useState<SocialState>("loading");
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const searchRef = React.useRef<HTMLInputElement | null>(null);
  const priorFocusRef = React.useRef<HTMLElement | null>(null);
  const wasOpenRef = React.useRef(false);

  React.useEffect(() => {
    const handlePolicyChange = (event: Event) => {
      const policy = (event as CustomEvent<{ account_policy?: HelixAccountCapabilityPolicy | null }>).detail
        ?.account_policy;
      setAccountPolicy(policy ?? readCachedAccountCapabilityPolicy() ?? HELIX_USER_ACCOUNT_POLICY);
    };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, handlePolicyChange as EventListener);
    return () => window.removeEventListener(
      HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,
      handlePolicyChange as EventListener,
    );
  }, []);

  React.useEffect(() => {
    if (!props.open) return;
    let active = true;
    void fetchAccountCapabilityPolicy()
      .then((policy: HelixAccountCapabilityPolicy) => { if (active) setAccountPolicy(policy); })
      .catch(() => {
        if (active) setAccountPolicy(readCachedAccountCapabilityPolicy() ?? HELIX_USER_ACCOUNT_POLICY);
      });
    return () => { active = false; };
  }, [props.open]);

  const friendsAccess = resolveHelixAccountPanelAccess(accountPolicy, "friends-parties");

  React.useEffect(() => {
    if (!props.open) return;
    if (friendsAccess.state !== "available") {
      setSocial(null);
      setSocialState("locked");
      return;
    }
    let active = true;
    setSocialState("loading");
    void friendsPartiesApi.list().then((value: HelixFriendsPartiesResponse) => {
      if (!active) return;
      setSocial(value);
      setSocialState("ready");
    }).catch((error: unknown) => {
      if (!active) return;
      const status = typeof error === "object" && error && "status" in error
        ? Number((error as { status: number }).status)
        : 0;
      setSocialState(status === 401 || status === 403 ? "locked" : "failed");
    });
    return () => { active = false; };
  }, [friendsAccess.state, props.open]);

  React.useLayoutEffect(() => {
    if (props.open && !wasOpenRef.current) {
      priorFocusRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      setActiveBlade("guide");
      setWorkspaceView("root");
      setSearchQuery("");
    } else if (!props.open && wasOpenRef.current) {
      focusElement(priorFocusRef.current);
      priorFocusRef.current = null;
    }
    wasOpenRef.current = props.open;
  }, [props.open]);

  React.useEffect(() => () => focusElement(priorFocusRef.current), []);

  React.useLayoutEffect(() => {
    if (!props.open) return;
    const timer = window.setTimeout(() => {
      if (activeBlade === "workspace" && workspaceView === "search") {
        focusElement(searchRef.current);
        return;
      }
      const firstRow = dialogRef.current?.querySelector<HTMLElement>("[data-casimir-guide-row]:not([disabled])");
      focusElement(firstRow ?? dialogRef.current);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeBlade, props.open, workspaceView]);

  const panelTitle = React.useCallback((panel: PanelDefinition): string => (
    getInterfacePanelTitle(t, panel.id, panel.title)
  ), [t]);

  const openPanel = React.useCallback((panelId: string) => {
    const panel = getPanelDef(panelId);
    const access = resolveHelixAccountPanelAccess(accountPolicy, panelId);
    if (!panel || (access.state !== "available" && !isUserLaunchPanel(panelId))) return;
    props.onOpenPanel(panelId);
    props.onClose();
  }, [accountPolicy, props.onClose, props.onOpenPanel]);

  const acceptedFriends = social?.friendships.filter(
    (item: HelixFriendsPartiesResponse["friendships"][number]) => item.state === "accepted",
  ) ?? [];
  const onlineCount = acceptedFriends.filter((item: HelixFriendsPartiesResponse["friendships"][number]) =>
    social?.presence.some((presence: HelixFriendsPartiesResponse["presence"][number]) =>
      presence.profile_id === item.peer.profile_id && presence.state !== "offline"))
    .length;
  const incomingCount = social?.friendships.filter(
    (item: HelixFriendsPartiesResponse["friendships"][number]) => item.state === "incoming",
  ).length ?? 0;
  const party = social?.party ?? null;
  const partySelf = party?.members.find(
    (member: NonNullable<HelixFriendsPartiesResponse["party"]>["members"][number]) =>
      member.profile.profile_id === social?.profile?.profile_id,
  );

  const openStart = React.useCallback(() => {
    props.onClose();
    window.setTimeout(() => document.getElementById("helix-start-button")?.click(), 0);
  }, [props.onClose]);

  const openFullLiveRoom = React.useCallback(() => {
    if (!liveRoom.controller_available) return;
    props.onClose();
    window.setTimeout(requestOpenSharedLiveRoomDialog, 0);
  }, [liveRoom.controller_available, props.onClose]);

  const panelRow = React.useCallback((
    panelId: string,
    options: {
      idPrefix?: string;
      label?: string;
      value?: string;
      state?: CasimirGuideRowState;
      description?: string;
    } = {},
  ): CasimirGuideRowModel => {
    const panel = getPanelDef(panelId);
    if (!panel) {
      return {
        id: rowId(options.idPrefix ?? "panel", panelId),
        label: options.label ?? panelId,
        value: t("casimirGuide.state.unavailable"),
        description: t("casimirGuide.route.unavailable"),
        state: "unavailable",
      };
    }
    const access = resolveHelixAccountPanelAccess(accountPolicy, panelId);
    if (access.state !== "available" && !isUserLaunchPanel(panelId)) {
      return {
        id: rowId(options.idPrefix ?? "panel", panelId),
        label: options.label ?? panelTitle(panel),
        value: t("casimirGuide.state.locked"),
        description: t("casimirGuide.policy.locked"),
        state: "locked",
      };
    }
    return {
      id: rowId(options.idPrefix ?? "panel", panelId),
      label: options.label ?? panelTitle(panel),
      value: options.value,
      description: options.description,
      action: () => openPanel(panelId),
      state: options.state ?? "available",
    };
  }, [accountPolicy, openPanel, panelTitle, t]);

  const actionRow = React.useCallback((
    id: string,
    label: string,
    action: () => void,
    value?: string,
  ): CasimirGuideRowModel => ({ id, label, value, action, state: "available" }), []);

  const resumeRow = React.useCallback((): CasimirGuideRowModel => {
    const panel = context.activePanelId ? getPanelDef(context.activePanelId) : undefined;
    if (!panel) return { id: "resume-none", label: t("casimirGuide.row.noActivePanel"), state: "unavailable" };
    return panelRow(panel.id, {
      idPrefix: "resume",
      label: t("casimirGuide.row.resume", { title: panelTitle(panel) }),
    });
  }, [context.activePanelId, panelRow, panelTitle, t]);

  const searchablePanels = React.useMemo(() => panelRegistry.filter((panel: PanelDefinition) => {
    if (panel.startHidden || panel.skipTaskbar || isSolarSpecialistLaunchPanel(String(panel.id))) return false;
    const access = resolveHelixAccountPanelAccess(accountPolicy, panel.id);
    return access.state === "available" || isDiscoverableLaunchPanel(panel.id);
  }), [accountPolicy]);

  const searchResults = React.useMemo(() => {
    const tokens = normalizeSearch(searchQuery);
    if (!tokens.length) return [];
    return searchablePanels.filter((panel: PanelDefinition) => {
      const searchable = [panelTitle(panel), panel.id, ...(panel.keywords ?? [])].join(" ").toLocaleLowerCase();
      return tokens.every((token) => searchable.includes(token));
    }).slice(0, 10);
  }, [panelTitle, searchQuery, searchablePanels]);

  const rows = React.useMemo((): CasimirGuideRowModel[] => {
    const mainMenu = actionRow("open-main-menu", t("casimirGuide.row.openMainMenu"), openStart);
    const returnRow = actionRow("return-to-workstation", t("casimirGuide.row.returnToWorkstation"), props.onClose);
    const emptyRow = (id: string, label: string): CasimirGuideRowModel => ({ id, label, state: "unavailable" });
    const backRow = actionRow("workspace-back", t("casimirGuide.row.back"), () => setWorkspaceView("root"));

    if (activeBlade === "workspace") {
      if (workspaceView === "recent") {
        const recent = context.recentPanelIds.slice(0, 5).map((id) => panelRow(id, { idPrefix: "recent" }));
        return [backRow, ...(recent.length ? recent : [emptyRow("recent-empty", t("casimirGuide.row.noRecentPanels"))])];
      }
      if (workspaceView === "favorites") {
        const favorites = context.favoritePanelIds.slice(0, 5).map((id) => panelRow(id, { idPrefix: "favorite" }));
        return [backRow, ...(favorites.length ? favorites : [emptyRow("favorites-empty", t("casimirGuide.row.noFavorites"))])];
      }
      if (workspaceView === "search") {
        const results = searchResults.map((panel) => panelRow(panel.id, { idPrefix: "search" }));
        return [backRow, ...(results.length ? results : [emptyRow("search-empty", t("casimirGuide.row.noSearchResults"))])];
      }
      return [
        resumeRow(),
        context.recentPanelIds.length
          ? actionRow("open-recent", t("casimirGuide.row.recentPanels"), () => setWorkspaceView("recent"), String(Math.min(5, context.recentPanelIds.length)))
          : emptyRow("open-recent", t("casimirGuide.row.recentPanels")),
        context.favoritePanelIds.length
          ? actionRow("open-favorites", t("casimirGuide.row.favorites"), () => setWorkspaceView("favorites"), String(Math.min(5, context.favoritePanelIds.length)))
          : emptyRow("open-favorites", t("casimirGuide.row.favorites")),
        actionRow("open-search", t("casimirGuide.row.searchPanels"), () => setWorkspaceView("search")),
        mainMenu,
      ];
    }

    if (activeBlade === "guide") {
      const shortcutIds = CONTEXTUAL_SHORTCUTS.find(({ matches }) => (
        context.activePanelId ? matches(context.activePanelId) : false
      ))?.panelIds ?? [];
      const socialStatus: CasimirGuideRowState | undefined = socialState === "loading"
        ? "pending"
        : socialState === "failed" ? "failed" : socialState === "locked" ? "locked" : undefined;
      return [
        resumeRow(),
        ...shortcutIds.filter((id) => id !== context.activePanelId).map((id) => panelRow(id, { idPrefix: "context" })),
        panelRow("friends-parties", {
          value: socialState === "ready"
            ? party
              ? t("casimirGuide.value.onlineParty", { online: onlineCount, members: party.members.length })
              : t("casimirGuide.value.online", { count: onlineCount })
            : socialState === "loading" ? t("casimirGuide.value.loading") : undefined,
          state: socialStatus,
          description: socialState === "failed"
            ? t("casimirGuide.social.failed")
            : socialState === "locked" ? t("casimirGuide.social.locked") : undefined,
        }),
        mainMenu,
        returnRow,
      ];
    }

    if (activeBlade === "liveRoom") {
      const socialStatus: CasimirGuideRowState | undefined = socialState === "loading"
        ? "pending"
        : socialState === "failed" ? "failed" : socialState === "locked" ? "locked" : undefined;
      const description = socialState === "failed"
        ? t("casimirGuide.social.failed")
        : socialState === "locked" ? t("casimirGuide.social.locked") : undefined;
      const loading = socialState === "loading" ? t("casimirGuide.value.loading") : undefined;
      const socialRow = (idPrefix: string, labelId: InterfaceMessageId, value?: string) => panelRow("friends-parties", {
        idPrefix,
        label: t(labelId),
        value,
        state: socialStatus,
        description,
      });
      const roomProjectionState: CasimirGuideRowState = liveRoom.state === "loading"
        ? "pending"
        : liveRoom.state === "failed"
          ? "failed"
          : liveRoom.state === "stale"
            ? "stale"
            : liveRoom.room ? "read_only" : "unavailable";
      const roomValue = liveRoom.state === "loading"
        ? t("casimirGuide.value.loading")
        : liveRoom.room?.title ?? t("casimirGuide.value.noSharedRoom");
      const microphoneState: CasimirGuideRowState = liveRoom.microphone.state === "failed"
        ? "failed"
        : liveRoom.microphone.state === "degraded"
          ? "degraded"
          : liveRoom.microphone.state === "unavailable" || liveRoom.microphone.state === "consent_required"
            ? "unavailable"
            : "read_only";
      const microphoneValue = t(`casimirGuide.value.roomMicrophone.${liveRoom.microphone.state}` as InterfaceMessageId);
      const gptValue = liveRoom.gpt.attached
        ? t("casimirGuide.value.gptAttached", { state: liveRoom.gpt.runtime_state ?? "active" })
        : t("casimirGuide.value.gptDetached", { state: liveRoom.gpt.runtime_state ?? "idle" });
      return [
        socialRow("live-friends", "casimirGuide.row.friendsOnline", socialState === "ready" ? String(onlineCount) : loading),
        socialRow("live-party", "casimirGuide.row.voiceParty", socialState === "ready"
          ? party ? t("casimirGuide.value.partyMembers", { count: party.members.length, state: party.state }) : t("casimirGuide.value.notActive")
          : loading),
        socialRow("live-party-microphone", "casimirGuide.row.microphone", socialState === "ready"
          ? partySelf ? partySelf.muted ? t("casimirGuide.value.muted", { state: partySelf.media_state }) : partySelf.media_state : t("casimirGuide.value.notConnected")
          : loading),
        socialRow("live-party-gpt", "casimirGuide.row.gptLive", socialState === "ready" ? party?.gpt_attachment_state ?? "detached" : loading),
        {
          id: "live-shared-room",
          label: t("casimirGuide.row.sharedRoom"),
          value: roomValue,
          description: liveRoom.state === "failed" ? t("casimirGuide.liveRoom.failed") : undefined,
          state: roomProjectionState,
        },
        {
          id: "live-room-participants",
          label: t("casimirGuide.row.roomParticipants"),
          value: liveRoom.room
            ? t("casimirGuide.value.roomParticipants", {
                present: liveRoom.room.present_count,
                count: liveRoom.room.participant_count,
                required: liveRoom.room.required_participant_count,
              })
            : undefined,
          state: liveRoom.room ? "read_only" : roomProjectionState,
        },
        {
          id: "live-room-floor",
          label: t("casimirGuide.row.speakingFloor"),
          value: liveRoom.floor.active
            ? liveRoom.floor.holder_display_name ?? t("casimirGuide.value.floorHeld")
            : liveRoom.room ? t("casimirGuide.value.floorOpen") : undefined,
          state: liveRoom.room ? "read_only" : roomProjectionState,
        },
        {
          id: "live-room-microphone",
          label: t("casimirGuide.row.roomMicrophone"),
          value: liveRoom.room ? microphoneValue : undefined,
          description: liveRoom.microphone.state === "consent_required"
            ? t("casimirGuide.liveRoom.microphoneConsent") : undefined,
          state: liveRoom.room ? microphoneState : roomProjectionState,
        },
        {
          id: "live-room-gpt",
          label: t("casimirGuide.row.roomGptAttachment"),
          value: liveRoom.room ? gptValue : undefined,
          state: liveRoom.room ? (liveRoom.gpt.runtime_state === "degraded" || liveRoom.gpt.runtime_state === "error" ? "degraded" : "read_only") : roomProjectionState,
        },
        {
          id: "live-room-sources",
          label: t("casimirGuide.row.sharedSources"),
          value: liveRoom.room
            ? t("casimirGuide.value.sources", { fresh: liveRoom.sources.fresh_count, count: liveRoom.sources.count })
            : undefined,
          description: t("casimirGuide.liveRoom.sourcesReadOnly"),
          state: liveRoom.room
            ? liveRoom.sources.count > 0 && liveRoom.sources.fresh_count === 0 ? "stale" : "read_only"
            : roomProjectionState,
        },
        {
          id: "live-room-results",
          label: t("casimirGuide.row.publicResults"),
          value: liveRoom.room
            ? t("casimirGuide.value.publicResults", { count: liveRoom.public_results.count })
            : undefined,
          description: t("casimirGuide.liveRoom.resultsReadOnly"),
          state: liveRoom.room ? "read_only" : roomProjectionState,
        },
        liveRoom.controller_available
          ? actionRow("live-room-controls", t("casimirGuide.row.openFullLiveRoom"), openFullLiveRoom)
          : emptyRow("live-room-controls", t("casimirGuide.row.openFullLiveRoom")),
        socialRow("live-invitations", "casimirGuide.row.invitations", socialState === "ready" ? String(incomingCount) : loading),
        socialRow("live-controls", "casimirGuide.row.friendsPartyControls"),
      ];
    }

    if (activeBlade === "mission") {
      const missionState: CasimirGuideRowState = mission.state === "loading" || mission.state === "idle"
        ? "pending"
        : mission.state === "failed"
          ? "failed"
          : mission.state === "stale"
            ? "stale"
            : mission.mission ? "read_only" : "unavailable";
      const missionStatusState: CasimirGuideRowState = mission.state === "stale"
        ? "stale"
        : mission.mission?.status === "blocked" || mission.mission?.status === "degraded"
          ? "degraded"
          : mission.mission ? "read_only" : missionState;
      const evidenceState: CasimirGuideRowState = mission.state === "stale"
        ? "stale"
        : mission.mission ? "read_only" : missionState;
      const missionFailureDescription = mission.state === "failed"
        ? t("casimirGuide.mission.failed")
        : mission.state === "stale" ? t("casimirGuide.mission.stale") : undefined;
      return [
        {
          id: "mission-identity",
          label: t("casimirGuide.row.missionIdentity"),
          value: mission.mission_id ?? t("casimirGuide.value.noMissionBound"),
          description: missionFailureDescription,
          state: mission.mission_id ? (mission.state === "loading" ? "pending" : "read_only") : "unavailable",
        },
        {
          id: "mission-objective",
          label: t("casimirGuide.row.currentObjective"),
          value: mission.state === "loading"
            ? t("casimirGuide.value.loading")
            : mission.objective
              ? t("casimirGuide.value.missionObjective", {
                  title: mission.objective.title,
                  status: mission.objective.status.replaceAll("_", " "),
                })
              : t("casimirGuide.value.noMissionObjective"),
          state: mission.objective ? evidenceState : missionState,
        },
        {
          id: "mission-phase-status",
          label: t("casimirGuide.row.missionPhaseStatus"),
          value: mission.mission
            ? t("casimirGuide.value.missionPhaseStatus", {
                phase: mission.mission.phase,
                status: mission.mission.status,
                freshness: mission.mission.freshness,
              })
            : mission.state === "loading" ? t("casimirGuide.value.loading") : undefined,
          description: mission.mission?.last_verified_at
            ? t("casimirGuide.mission.lastVerified", { timestamp: mission.mission.last_verified_at })
            : t("casimirGuide.mission.freshnessBoundary"),
          state: missionStatusState,
        },
        {
          id: "mission-attention",
          label: t("casimirGuide.row.missionAttention"),
          value: mission.attention?.text ?? t("casimirGuide.value.noMissionAttention"),
          description: mission.attention
            ? t("casimirGuide.mission.attentionMeta", {
                certainty: mission.attention.certainty,
                failReason: mission.attention.fail_reason ?? t("casimirGuide.value.none"),
                suppressionReason: mission.attention.suppression_reason ?? t("casimirGuide.value.none"),
              })
            : undefined,
          state: mission.attention
            ? mission.attention.classification === "critical" || mission.attention.fail_reason ? "degraded" : evidenceState
            : missionState,
        },
        {
          id: "mission-evidence-replay",
          label: t("casimirGuide.row.missionEvidenceReplay"),
          value: t("casimirGuide.value.missionEvidenceReplay", {
            count: mission.evidence.reference_count,
            replay: mission.evidence.replay_available
              ? t("casimirGuide.state.available")
              : t("casimirGuide.state.unavailable"),
          }),
          description: t("casimirGuide.mission.evidenceBoundary"),
          state: evidenceState,
        },
        {
          id: "mission-latest-result",
          label: t("casimirGuide.row.latestMissionResult"),
          value: t("casimirGuide.value.noTerminalResult"),
          description: t("casimirGuide.mission.terminalBoundary"),
          state: "unavailable",
        },
        {
          id: "mission-voice-state",
          label: t("casimirGuide.row.missionVoiceState"),
          value: t("casimirGuide.value.missionVoiceState", {
            tier: mission.voice.tier,
            session: mission.voice.session_state,
            mode: mission.voice.voice_mode,
          }),
          description: t("casimirGuide.mission.voiceBoundary"),
          state: mission.mission_id ? "read_only" : "unavailable",
        },
        {
          id: "mission-board-unavailable",
          label: t("casimirGuide.row.openMissionBoard"),
          value: t("casimirGuide.state.unavailable"),
          description: t("casimirGuide.mission.boardUnavailable"),
          state: "unavailable",
        },
        panelRow("agi-task-history", {
          idPrefix: "mission-history",
          description: t("casimirGuide.mission.historyNavigation"),
        }),
        panelRow("workstation-process-graph", {
          idPrefix: "mission-process-graph",
          description: t("casimirGuide.mission.graphNavigation"),
        }),
      ];
    }
    if (activeBlade === "environment") {
      const projectionState: CasimirGuideRowState = !deviceCheckAvailable
        ? "locked"
        : environment.state === "loading" || environment.state === "idle"
          ? "pending"
          : environment.state === "failed"
            ? "failed"
            : environment.state === "stale"
              ? "stale"
              : environment.monitor || environment.connector ? "read_only" : "unavailable";
      const projectionDescription = !deviceCheckAvailable
        ? t("casimirGuide.policy.locked")
        : environment.state === "failed"
          ? t("casimirGuide.environment.failed")
          : undefined;
      const monitorValue = environment.monitor
        ? t("casimirGuide.value.environmentMonitor", {
            preset: environment.monitor.preset.replaceAll("_", " "),
            status: environment.monitor.status,
            sources: environment.monitor.source_count,
          })
        : environment.connector?.world_id
          ? t("casimirGuide.value.boundWorld", { world: environment.connector.world_id })
          : t("casimirGuide.value.noEnvironmentProjection");
      const connectorState: CasimirGuideRowState = !environment.connector
        ? projectionState
        : environment.connector.freshness === "stale"
          ? "stale"
          : environment.connector.health === "degraded" || environment.connector.health === "offline"
            ? "degraded"
            : "read_only";
      const connectorValue = environment.connector
        ? t("casimirGuide.value.environmentConnector", {
            health: environment.connector.health,
            freshness: environment.connector.freshness.replaceAll("_", " "),
            capabilities: environment.connector.capability_count,
          })
        : t("casimirGuide.value.noConnectorProjection");
      const evidenceState: CasimirGuideRowState = environment.state === "stale"
        ? "stale"
        : environment.monitor || environment.connector ? "read_only" : projectionState;
      return [
        {
          id: "environment-selection",
          label: t("casimirGuide.row.environmentSelection"),
          value: environment.state === "loading" ? t("casimirGuide.value.loading") : monitorValue,
          description: projectionDescription,
          state: projectionState,
        },
        {
          id: "environment-connector",
          label: t("casimirGuide.row.environmentConnector"),
          value: environment.state === "loading" ? t("casimirGuide.value.loading") : connectorValue,
          description: environment.connector && !environment.connector.probe_ready
            ? t("casimirGuide.environment.connectorBlocked", {
                count: environment.connector.blocking_reason_count,
              })
            : undefined,
          state: connectorState,
        },
        {
          id: "environment-embodiments",
          label: t("casimirGuide.row.embodiments"),
          value: t("casimirGuide.value.noActorProjection"),
          description: t("casimirGuide.environment.actorBoundary"),
          state: deviceCheckAvailable ? "unavailable" : "locked",
        },
        {
          id: "environment-companion",
          label: t("casimirGuide.row.companion"),
          value: t("casimirGuide.value.noCompanionIncarnation"),
          description: t("casimirGuide.environment.companionBoundary"),
          state: deviceCheckAvailable ? "unavailable" : "locked",
        },
        {
          id: "environment-resident-mode",
          label: t("casimirGuide.row.residentMode"),
          value: t("casimirGuide.value.followProfileAccepted"),
          description: t("casimirGuide.environment.followBoundary"),
          state: deviceCheckAvailable ? "read_only" : "locked",
        },
        {
          id: "environment-authority",
          label: t("casimirGuide.row.authoritySafety"),
          value: t("casimirGuide.value.noLeaseProjection"),
          description: t("casimirGuide.environment.authorityBoundary"),
          state: deviceCheckAvailable ? "unavailable" : "locked",
        },
        {
          id: "environment-evidence",
          label: t("casimirGuide.row.environmentEvidence"),
          value: t("casimirGuide.value.environmentEvidence", {
            deltas: environment.evidence.delta_count,
            blockers: environment.evidence.blocked_subgoal_count,
          }),
          description: t("casimirGuide.environment.evidenceBoundary"),
          state: evidenceState,
        },
        panelRow("live-answer-environment", {
          idPrefix: "environment-controls",
          label: t("casimirGuide.row.environmentControls"),
        }),
        panelRow("device-check", { idPrefix: "environment-device-check" }),
        panelRow("local-harness", { idPrefix: "environment-local-harness" }),
      ];
    }
    return [
      panelRow("device-check"),
      panelRow("local-harness"),
      panelRow("account-session"),
      panelRow("connections-billing-security"),
      panelRow("desktop-updates"),
      mainMenu,
    ];
  }, [
    actionRow, activeBlade, context.activePanelId, context.favoritePanelIds, context.recentPanelIds,
    incomingCount, onlineCount, openStart, panelRow, party, props.onClose, resumeRow, searchResults,
    deviceCheckAvailable, environment, liveRoom, mission, openFullLiveRoom, partySelf, socialState, t, workspaceView,
  ]);

  const stateLabels = React.useMemo<Record<CasimirGuideRowState, string>>(() => ({
    available: t("casimirGuide.state.available"),
    locked: t("casimirGuide.state.locked"),
    unavailable: t("casimirGuide.state.unavailable"),
    degraded: t("casimirGuide.state.degraded"),
    stale: t("casimirGuide.state.stale"),
    pending: t("casimirGuide.state.pending"),
    failed: t("casimirGuide.state.failed"),
    planned: t("casimirGuide.state.planned"),
    read_only: t("casimirGuide.state.readOnly"),
  }), [t]);

  if (!props.open) return null;
  const bladeIndex = BLADES.findIndex(({ key }) => key === activeBlade);
  const activeBladeLabel = t(BLADES[bladeIndex].messageId);
  const nestedWorkspace = activeBlade === "workspace" && workspaceView !== "root";

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab") {
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (nestedWorkspace) {
        setWorkspaceView("root");
        setSearchQuery("");
      } else {
        props.onClose();
      }
      return;
    }
    const targetAcceptsText = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    if (!targetAcceptsText && event.key.toLowerCase() === "y") {
      event.preventDefault();
      openStart();
      return;
    }
    if (!targetAcceptsText && event.key.toLowerCase() === "x" && activeBlade === "workspace" && workspaceView === "root") {
      event.preventDefault();
      setWorkspaceView("search");
      return;
    }
    if (!targetAcceptsText && !nestedWorkspace && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      const offset = event.key === "ArrowLeft" ? -1 : 1;
      setActiveBlade(BLADES[Math.max(0, Math.min(BLADES.length - 1, bladeIndex + offset))].key);
      setWorkspaceView("root");
      return;
    }
    if (!targetAcceptsText && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      const rowElements = Array.from(
        dialogRef.current?.querySelectorAll<HTMLButtonElement>("[data-casimir-guide-row]:not([disabled])") ?? [],
      );
      if (!rowElements.length) return;
      const currentIndex = rowElements.findIndex((row) => row === document.activeElement);
      const offset = event.key === "ArrowUp" ? -1 : 1;
      const nextIndex = currentIndex < 0
        ? 0
        : Math.max(0, Math.min(rowElements.length - 1, currentIndex + offset));
      rowElements[nextIndex]?.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex animate-in items-center justify-center bg-black/75 p-4 backdrop-blur-sm fade-in-0 duration-200 motion-reduce:duration-100"
      onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}
    >
      <div
        id="casimir-guide-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="casimir-guide-title"
        aria-describedby="casimir-guide-description"
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        className="w-[clamp(560px,52vw,760px)] max-w-[94vw] animate-in overflow-hidden rounded-2xl border border-cyan-300/30 bg-slate-950/95 text-slate-100 shadow-[0_30px_100px_rgba(0,0,0,.75),0_0_45px_rgba(34,211,238,.12)] outline-none duration-200 fade-in-0 zoom-in-90 motion-reduce:zoom-in-100 motion-reduce:duration-100"
      >
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div>
            <p id="casimir-guide-title" className="font-semibold">{t("casimirGuide.title")}</p>
            <p id="casimir-guide-description" className="text-xs text-slate-400">{t("casimirGuide.description")}</p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            aria-label={t("casimirGuide.close")}
            className="rounded px-3 py-1 text-sm text-slate-300 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-200"
          >Esc</button>
        </header>
        <nav role="tablist" aria-label={t("casimirGuide.bladesLabel")} className="flex overflow-x-auto border-b border-white/10 bg-black/20">
          {BLADES.map((blade) => (
            <button
              key={blade.key}
              type="button"
              role="tab"
              id={`casimir-guide-tab-${blade.key.toLowerCase()}`}
              aria-controls="casimir-guide-panel"
              aria-selected={blade.key === activeBlade}
              tabIndex={blade.key === activeBlade ? 0 : -1}
              onClick={() => {
                setActiveBlade(blade.key);
                setWorkspaceView("root");
                setSearchQuery("");
              }}
              className={`min-w-fit flex-1 border-b-2 px-3 py-3 text-xs font-medium uppercase tracking-wide outline-none transition duration-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-200 motion-reduce:transition-none ${blade.key === activeBlade ? "border-cyan-300 bg-cyan-300/10 text-cyan-100" : "border-transparent text-slate-500 hover:text-slate-200"}`}
            >
              {t(blade.messageId)}
            </button>
          ))}
        </nav>
        <section
          id="casimir-guide-panel"
          role="tabpanel"
          aria-labelledby={`casimir-guide-tab-${activeBlade.toLowerCase()}`}
          className="min-h-[310px] max-h-[62vh] overflow-y-auto p-5"
        >
          <h2 className="mb-3 text-lg font-medium">{activeBladeLabel}</h2>
          {activeBlade === "workspace" && workspaceView === "search" ? (
            <input
              ref={searchRef}
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              aria-label={t("casimirGuide.search.label")}
              placeholder={t("casimirGuide.search.placeholder")}
              className="mb-3 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-cyan-200"
            />
          ) : null}
          <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.025]">
            {rows.map((row) => <CasimirGuideRow key={row.id} row={row} stateLabel={stateLabels[row.state]} />)}
          </div>
        </section>
        <div className="sr-only" aria-live="polite">
          {t("casimirGuide.bladeSelected", { blade: activeBladeLabel })}
        </div>
        <footer aria-label={t("casimirGuide.legend.label")} className="flex flex-wrap gap-x-5 gap-y-1 border-t border-white/10 bg-black/25 px-5 py-3 text-xs text-slate-400">
          <span><b className="text-emerald-300">A / Enter</b> {t("casimirGuide.legend.select")}</span>
          <span><b className="text-rose-300">B / Esc</b> {t(nestedWorkspace ? "casimirGuide.legend.back" : "casimirGuide.legend.close")}</span>
          <span><b className="text-cyan-300">← →</b> {t("casimirGuide.legend.changeBlade")}</span>
          {activeBlade === "workspace" && workspaceView === "root" ? (
            <span><b className="text-blue-300">X</b> {t("casimirGuide.legend.search")}</span>
          ) : null}
          <span><b className="text-amber-300">Y</b> {t("casimirGuide.legend.mainMenu")}</span>
        </footer>
      </div>
    </div>
  );
}
