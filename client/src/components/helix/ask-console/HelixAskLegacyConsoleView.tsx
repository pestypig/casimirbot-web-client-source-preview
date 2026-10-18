import React, {
  type ReactNode,
  type Ref,
} from "react";

import {
  HelixAskConsoleRuntimeLayout,
  type HelixAskConsoleRuntimeLayoutProps,
} from "./HelixAskConsoleRuntimeLayout";
import { HelixAskDebugDrawerSurface } from "./HelixAskDebugDrawerSurface";
import type { HelixAskDebugExportDrawerState } from "./HelixAskDebugDrawerState";
import {
  HelixAskConsoleErrorLineSurface,
  type HelixAskConsoleErrorLineSurfaceProps,
} from "./HelixAskConsoleErrorLineSurface";
import {
  HelixAskGoalPillSurface,
  type HelixAskGoalPillSurfaceProps,
} from "./HelixAskGoalPillSurface";
import { HelixAskSteeringQueueSurface } from "./HelixAskSteeringQueueSurface";
import {
  HelixAskSurfaceFrameSurface,
  type HelixAskSurfaceFrameSurfaceProps,
} from "./HelixAskSurfaceFrameSurface";
import {
  HelixAskLegacySurfaceContent,
  type HelixAskLegacySurfaceContentProps,
} from "./HelixAskLegacySurfaceContent";
import {
  HelixAskTurnListSurface,
  type HelixAskTurnListSurfaceProps,
} from "./HelixAskTurnListSurface";
import { HelixConsoleConversationWorkspace, type HelixConsoleConversationWorkspaceProps } from "./HelixConsoleConversationWorkspace";

export type HelixAskLegacyConsoleViewProps = Omit<HelixAskConsoleRuntimeLayoutProps, "surface"> & {
  debugDrawerState?: HelixAskDebugExportDrawerState;
  errorLineState?: HelixAskConsoleErrorLineSurfaceProps;
  errorMessage?: string | null;
  goalPillState?: HelixAskGoalPillSurfaceProps;
  onDebugDrawerClose?: (() => void) | null;
  surface?: ReactNode;
  surfaceContent?: ReactNode;
  surfaceContentState?: HelixAskLegacySurfaceContentProps;
  surfaceFrameState?: Omit<HelixAskSurfaceFrameSurfaceProps, "children">;
  turnListContent?: ReactNode;
  turnListRef?: Ref<HTMLDivElement>;
  turnListState?: Omit<HelixAskTurnListSurfaceProps, "children">;
  conversationWorkspace?: Omit<HelixConsoleConversationWorkspaceProps, "children">;
};

export function HelixAskLegacyConsoleView({
  debugDrawer,
  debugDrawerState,
  errorLine,
  errorLineState,
  errorMessage,
  onDebugDrawerClose,
  goalPill,
  goalPillState,
  layoutVariant,
  surface,
  surfaceContent,
  surfaceContentState,
  surfaceFrameState,
  steeringQueue,
  turnList,
  turnListContent,
  turnListRef,
  turnListState,
  conversationWorkspace,
  workflowSuggestion,
  ...props
}: HelixAskLegacyConsoleViewProps) {
  const resolvedTurnList = turnList ?? (turnListState ?
    <HelixAskTurnListSurface {...turnListState} ref={turnListRef}>{turnListContent}</HelixAskTurnListSurface>
    : turnListContent ?? null);
  const selectedChannel = conversationWorkspace?.selectedChannel ?? "private_ask";
  const selectedContentState = surfaceContentState ? {
    ...surfaceContentState,
    selectedChannel,
    localRoom: conversationWorkspace?.localRoom,
    hostedRoom: conversationWorkspace?.hostedRoom,
    onSelectRoomAgent: (source: "local" | "hosted") =>
      conversationWorkspace?.onSelectChannel(source === "local" ? "local_room_agent" : "hosted_room_agent"),
  } : null;
  const privateAskSurface = surfaceFrameState ? (
    <HelixAskSurfaceFrameSurface {...surfaceFrameState} onSubmit={event => {
      if (selectedChannel !== "private_ask" && selectedChannel !== "bound_task") {
        event.preventDefault(); return;
      }
      surfaceFrameState.onSubmit(event);
    }}>
      {surfaceContent ?? (selectedContentState ? <HelixAskLegacySurfaceContent {...selectedContentState} /> : null)}
    </HelixAskSurfaceFrameSurface>
  ) : (surfaceContent ?? (selectedContentState ? <HelixAskLegacySurfaceContent {...selectedContentState} /> : null));
  // The room controller lives below the original pill toolbar. Keep that
  // subtree mounted while another channel owns the visible pill; otherwise
  // selecting a room tears down its own admission and starts a request loop.
  const resolvedSurface = conversationWorkspace && surfaceFrameState ? <>
    <div className={surface ? "hidden" : "w-full"} aria-hidden={surface ? true : undefined}>
      {privateAskSurface}
    </div>
    {surface}
  </> : surface ?? privateAskSurface;
  const resolvedGoalPill = goalPill ?? (goalPillState ? <HelixAskGoalPillSurface {...goalPillState} /> : null);
  const resolvedErrorLine = errorLine ?? <HelixAskConsoleErrorLineSurface {...(errorLineState ?? { message: errorMessage })} />;
  const resolvedSteeringQueue = steeringQueue ?? <HelixAskSteeringQueueSurface />;
  const showingOtherChannel = Boolean(conversationWorkspace && conversationWorkspace.selectedChannel !== "private_ask");
  return (
    <HelixAskConsoleRuntimeLayout
      {...props}
      layoutVariant={layoutVariant}
      surface={resolvedSurface}
      workflowSuggestion={showingOtherChannel ? null : workflowSuggestion}
      debugDrawer={
        showingOtherChannel ? null : debugDrawer ??
        <HelixAskDebugDrawerSurface
          drawerState={debugDrawerState}
          onClose={onDebugDrawerClose ?? undefined}
        />
      }
      errorLine={showingOtherChannel ? null : resolvedErrorLine}
      goalPill={showingOtherChannel ? null : resolvedGoalPill}
      steeringQueue={showingOtherChannel ? null : resolvedSteeringQueue}
      turnList={conversationWorkspace ? <HelixConsoleConversationWorkspace {...conversationWorkspace} layoutVariant={layoutVariant}>
        {resolvedTurnList}
      </HelixConsoleConversationWorkspace> : resolvedTurnList}
    />
  );
}
