import { createWithEqualityFn } from "zustand/traditional";
import { persist } from "zustand/middleware";
import { ENVIRONMENT_HOME_PANEL_ID } from "@shared/desktop-environment-home";

export type WorkstationDockSide = "right" | "bottom";
export type WorkstationLayoutMode = "freeform" | "workstation";

export type WorkstationPanelGroup = {
  id: string;
  title?: string;
  panelIds: string[];
  activePanelId: string | null;
};

export type WorkstationLayoutNode =
  {
    type: "group";
    groupId: string;
  };

type WorkstationClosedPanelEntry = {
  panelId: string;
  groupId: string;
  closedAtMs: number;
};

export type WorkstationLayoutSnapshot = {
  chatDock: {
    side: WorkstationDockSide;
    widthPx: number;
    collapsed: boolean;
  };
  activeGroupId: string;
  groups: Record<string, WorkstationPanelGroup>;
  root: WorkstationLayoutNode;
};

export type WorkstationLayoutState = {
  environmentHomeEnabled: boolean;
  environmentHomePolicyResolved: boolean;
  pendingEnvironmentHomeFocus: boolean;
  setEnvironmentHomeEnabled: (enabled: boolean) => void;
  mode: WorkstationLayoutMode;
  chatDock: {
    side: WorkstationDockSide;
    widthPx: number;
    collapsed: boolean;
  };
  activeGroupId: string;
  groups: Record<string, WorkstationPanelGroup>;
  root: WorkstationLayoutNode;
  recentlyClosedPanels: WorkstationClosedPanelEntry[];
  mobileDrawer: {
    open: boolean;
    snap: "peek" | "half" | "full";
  };
  setMode: (mode: WorkstationLayoutMode) => void;
  setChatDockWidth: (widthPx: number) => void;
  toggleChatDock: () => void;
  openPanelInActiveGroup: (panelId: string) => void;
  openPanelInGroup: (groupId: string, panelId: string) => void;
  setActivePanel: (groupId: string, panelId: string) => void;
  closePanelFromGroup: (groupId: string, panelId: string) => void;
  closeActivePanel: () => WorkstationClosedPanelEntry | null;
  focusAdjacentPanel: (direction: "next" | "previous") => { groupId: string; panelId: string } | null;
  reopenLastClosedPanel: () => WorkstationClosedPanelEntry | null;
  focusGroup: (groupId: string) => void;
  setMobileDrawerOpen: (open: boolean) => void;
  toggleMobileDrawer: () => void;
  setMobileDrawerSnap: (snap: "peek" | "half" | "full") => void;
  captureLayoutSnapshot: () => WorkstationLayoutSnapshot;
  applyLayoutSnapshot: (snapshot: WorkstationLayoutSnapshot) => void;
};

const STORAGE_KEY = "workstation-layout-v1";
const PRIMARY_GROUP_ID = "group-primary";
export const WORKSTATION_DOCK_MIN_WIDTH = 320;
export const WORKSTATION_DOCK_MAX_WIDTH = 760;
const DEFAULT_DOCK_WIDTH = 420;
const MAX_RECENTLY_CLOSED_PANELS = 32;

const createGroup = (id: string, title?: string): WorkstationPanelGroup => ({
  id,
  title,
  panelIds: [],
  activePanelId: null,
});

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const ensureRoot = (
  root: WorkstationLayoutNode | null | undefined,
  activeGroupId: string,
): WorkstationLayoutNode => {
  if (root && typeof root === "object" && root.type === "group" && typeof root.groupId === "string") {
    return root;
  }
  return {
    type: "group",
    groupId: activeGroupId || PRIMARY_GROUP_ID,
  };
};

const ensureGroups = (
  groups: Record<string, WorkstationPanelGroup> | null | undefined,
  activeGroupId: string,
) => {
  const normalized = groups && typeof groups === "object" ? { ...groups } : {};
  if (!normalized[activeGroupId]) {
    normalized[activeGroupId] = createGroup(activeGroupId, "Primary");
  }
  return normalized;
};

const homeGroups = (groups: Record<string, WorkstationPanelGroup>, rootGroupId: string, enabled: boolean) => {
  const result = { ...groups };
  if (!result[rootGroupId]) result[rootGroupId] = createGroup(rootGroupId, "Primary");
  for (const [id, group] of Object.entries(result)) {
    const panelIds = group.panelIds.filter(panel => panel !== ENVIRONMENT_HOME_PANEL_ID);
    if (enabled && id === rootGroupId) panelIds.unshift(ENVIRONMENT_HOME_PANEL_ID);
    result[id] = { ...group, panelIds,
      activePanelId: group.activePanelId && panelIds.includes(group.activePanelId) ? group.activePanelId : panelIds[0] ?? null };
  }
  return result;
};

export const useWorkstationLayoutStore = createWithEqualityFn<WorkstationLayoutState>()(
  persist(
    (set, get) => ({
      environmentHomeEnabled: false,
      environmentHomePolicyResolved: false,
      pendingEnvironmentHomeFocus: false,
      setEnvironmentHomeEnabled: (enabled) => set(state => {
        if (state.environmentHomeEnabled === enabled && state.environmentHomePolicyResolved) return state;
        const groups = homeGroups(state.groups, state.root.groupId, enabled);
        if (enabled && state.pendingEnvironmentHomeFocus) {
          groups[state.root.groupId] = { ...groups[state.root.groupId], activePanelId: ENVIRONMENT_HOME_PANEL_ID };
        }
        return { environmentHomeEnabled: enabled,
          environmentHomePolicyResolved: true, pendingEnvironmentHomeFocus: false,
          groups,
          recentlyClosedPanels: state.recentlyClosedPanels.filter(entry => entry.panelId !== ENVIRONMENT_HOME_PANEL_ID) };
      }),
      mode: "workstation",
      chatDock: {
        side: "right",
        widthPx: DEFAULT_DOCK_WIDTH,
        collapsed: false,
      },
      activeGroupId: PRIMARY_GROUP_ID,
      groups: {
        [PRIMARY_GROUP_ID]: createGroup(PRIMARY_GROUP_ID, "Primary"),
      },
      root: {
        type: "group",
        groupId: PRIMARY_GROUP_ID,
      },
      recentlyClosedPanels: [],
      mobileDrawer: {
        open: false,
        snap: "half",
      },
      setMode: (mode) => set(() => ({ mode })),
      setChatDockWidth: (widthPx) =>
        set((state) => ({
          chatDock: {
            ...state.chatDock,
            widthPx: clamp(Math.round(widthPx), WORKSTATION_DOCK_MIN_WIDTH, WORKSTATION_DOCK_MAX_WIDTH),
          },
        })),
      toggleChatDock: () =>
        set((state) => ({
          chatDock: {
            ...state.chatDock,
            collapsed: !state.chatDock.collapsed,
          },
        })),
      openPanelInActiveGroup: (panelId) => {
        const { activeGroupId, openPanelInGroup } = get();
        openPanelInGroup(activeGroupId, panelId);
      },
      openPanelInGroup: (groupId, panelId) =>
        set((state) => {
          if (!panelId) return state;
          if (panelId === ENVIRONMENT_HOME_PANEL_ID && state.environmentHomeEnabled) groupId = state.root.groupId;
          const group = state.groups[groupId] ?? createGroup(groupId);
          let panelIds = group.panelIds.includes(panelId)
            ? group.panelIds
            : [...group.panelIds, panelId];
          if (state.environmentHomeEnabled && groupId === state.root.groupId) {
            panelIds = [ENVIRONMENT_HOME_PANEL_ID, ...panelIds.filter(id => id !== ENVIRONMENT_HOME_PANEL_ID)];
          }
          return {
            pendingEnvironmentHomeFocus: false,
            groups: {
              ...state.groups,
              [groupId]: {
                ...group,
                panelIds,
                activePanelId: panelId,
              },
            },
            activeGroupId: groupId,
          };
        }),
      setActivePanel: (groupId, panelId) =>
        set((state) => {
          const group = state.groups[groupId];
          if (!group) return state;
          if (!group.panelIds.includes(panelId)) return state;
          return {
            pendingEnvironmentHomeFocus: false,
            groups: {
              ...state.groups,
              [groupId]: {
                ...group,
                activePanelId: panelId,
              },
            },
            activeGroupId: groupId,
          };
        }),
      closePanelFromGroup: (groupId, panelId) =>
        set((state) => {
          if (state.environmentHomeEnabled && panelId === ENVIRONMENT_HOME_PANEL_ID) return state;
          const group = state.groups[groupId];
          if (!group || !group.panelIds.includes(panelId)) return state;
          const panelIds = group.panelIds.filter((id) => id !== panelId);
          const nextActive = group.activePanelId === panelId ? panelIds[panelIds.length - 1] ?? null : group.activePanelId;
          return {
            groups: {
              ...state.groups,
              [groupId]: {
                ...group,
                panelIds,
                activePanelId: nextActive,
              },
            },
            recentlyClosedPanels: [
              ...state.recentlyClosedPanels,
              { panelId, groupId, closedAtMs: Date.now() },
            ].slice(-MAX_RECENTLY_CLOSED_PANELS),
          };
        }),
      closeActivePanel: () => {
        const state = get();
        const groupId = state.activeGroupId;
        const group = state.groups[groupId];
        const panelId = group?.activePanelId;
        if (!groupId || !group || !panelId) return null;
        if (state.environmentHomeEnabled && panelId === ENVIRONMENT_HOME_PANEL_ID) return null;
        get().closePanelFromGroup(groupId, panelId);
        return { panelId, groupId, closedAtMs: Date.now() };
      },
      focusAdjacentPanel: (direction) => {
        const state = get();
        const groupId = state.activeGroupId;
        const group = state.groups[groupId];
        if (!group || group.panelIds.length === 0) return null;
        const panelCount = group.panelIds.length;
        const activeIndex = Math.max(
          0,
          group.activePanelId ? group.panelIds.indexOf(group.activePanelId) : 0,
        );
        const delta = direction === "previous" ? -1 : 1;
        const nextIndex = (activeIndex + delta + panelCount) % panelCount;
        const panelId = group.panelIds[nextIndex] ?? null;
        if (!panelId) return null;
        get().setActivePanel(groupId, panelId);
        return { groupId, panelId };
      },
      reopenLastClosedPanel: () => {
        const state = get();
        const lastClosed = state.recentlyClosedPanels[state.recentlyClosedPanels.length - 1];
        if (!lastClosed) return null;
        set((current) => {
          const groupId = lastClosed.groupId;
          const group = current.groups[groupId] ?? createGroup(groupId);
          const panelIds = group.panelIds.includes(lastClosed.panelId)
            ? group.panelIds
            : [...group.panelIds, lastClosed.panelId];
          return {
            groups: {
              ...current.groups,
              [groupId]: {
                ...group,
                panelIds,
                activePanelId: lastClosed.panelId,
              },
            },
            activeGroupId: groupId,
            recentlyClosedPanels: current.recentlyClosedPanels.slice(0, -1),
          };
        });
        return lastClosed;
      },
      focusGroup: (groupId) =>
        set((state) => {
          if (!state.groups[groupId]) return state;
          return {
            activeGroupId: groupId,
          };
        }),
      setMobileDrawerOpen: (open) =>
        set((state) => ({
          mobileDrawer: {
            ...state.mobileDrawer,
            open,
          },
        })),
      toggleMobileDrawer: () =>
        set((state) => ({
          mobileDrawer: {
            ...state.mobileDrawer,
            open: !state.mobileDrawer.open,
          },
        })),
      setMobileDrawerSnap: (snap) =>
        set((state) => ({
          mobileDrawer: {
            ...state.mobileDrawer,
            snap,
          },
        })),
      captureLayoutSnapshot: () => {
        const state = get();
        return {
          chatDock: { ...state.chatDock },
          activeGroupId: state.activeGroupId,
          groups: Object.fromEntries(
            Object.entries(state.groups).map(([groupId, group]) => [
              groupId,
              {
                ...group,
                panelIds: [...group.panelIds],
              },
            ]),
          ),
          root: { ...state.root },
        };
      },
      applyLayoutSnapshot: (snapshot) =>
        set((state) => {
          const activeGroupId = snapshot.activeGroupId || state.activeGroupId || PRIMARY_GROUP_ID;
          const root = ensureRoot(snapshot.root, activeGroupId);
          const groups = homeGroups(ensureGroups(snapshot.groups, activeGroupId), root.groupId, state.environmentHomeEnabled);
          return {
            pendingEnvironmentHomeFocus: !state.environmentHomePolicyResolved &&
              snapshot.groups[root.groupId]?.activePanelId === ENVIRONMENT_HOME_PANEL_ID,
            chatDock: {
              ...state.chatDock,
              ...snapshot.chatDock,
              widthPx: clamp(Number(snapshot.chatDock.widthPx), WORKSTATION_DOCK_MIN_WIDTH, WORKSTATION_DOCK_MAX_WIDTH),
            },
            activeGroupId,
            groups,
            root,
          };
        }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      partialize: (state) => ({
        mode: state.mode,
        chatDock: state.chatDock,
        activeGroupId: state.activeGroupId,
        groups: state.groups,
        root: state.root,
        recentlyClosedPanels: state.recentlyClosedPanels,
        mobileDrawer: state.mobileDrawer,
      }),
      merge: (persisted, current) => {
        const source = (persisted ?? {}) as Partial<WorkstationLayoutState>;
        const activeGroupId = source.activeGroupId ?? current.activeGroupId ?? PRIMARY_GROUP_ID;
        const root = ensureRoot(source.root, activeGroupId);
        const groups = homeGroups(ensureGroups(source.groups, activeGroupId), root.groupId, current.environmentHomeEnabled);
        return {
          ...current,
          ...source,
          environmentHomeEnabled: current.environmentHomeEnabled,
          environmentHomePolicyResolved: current.environmentHomePolicyResolved,
          pendingEnvironmentHomeFocus: !current.environmentHomePolicyResolved &&
            source.groups?.[root.groupId]?.activePanelId === ENVIRONMENT_HOME_PANEL_ID,
          activeGroupId,
          groups,
          root,
          recentlyClosedPanels: Array.isArray(source.recentlyClosedPanels)
            ? source.recentlyClosedPanels.filter(
                (entry): entry is WorkstationClosedPanelEntry =>
                  Boolean(
                    entry &&
                      typeof entry === "object" &&
                      typeof (entry as WorkstationClosedPanelEntry).panelId === "string" &&
                      typeof (entry as WorkstationClosedPanelEntry).groupId === "string" &&
                      Number.isFinite((entry as WorkstationClosedPanelEntry).closedAtMs),
                  ),
              )
            : current.recentlyClosedPanels,
          mobileDrawer: {
            ...current.mobileDrawer,
            ...(source.mobileDrawer ?? {}),
          },
          chatDock: {
            ...current.chatDock,
            ...(source.chatDock ?? {}),
            widthPx: clamp(
              Number(source.chatDock?.widthPx ?? current.chatDock.widthPx),
              WORKSTATION_DOCK_MIN_WIDTH,
              WORKSTATION_DOCK_MAX_WIDTH,
            ),
          },
        };
      },
    },
  ),
);
