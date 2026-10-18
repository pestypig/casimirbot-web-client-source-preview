import type {
  ReactNode,
  Ref,
  UIEventHandler,
} from "react";

import type { HelixAskActiveTurnReplySurfaceProps } from "./HelixAskActiveTurnReplySurface";
import type { HelixAskTurnListSurfaceProps } from "./HelixAskTurnListSurface";

export type HelixAskActiveTurnListStateOptions = {
  completedReplyCount: number;
  className: string;
  onScroll?: UIEventHandler<HTMLDivElement>;
  consoleDebugSnapshot?: unknown;
  rows: HelixAskActiveTurnReplySurfaceProps["rows"];
  tintClassName: string;
  replyId?: string | null;
  activeTurnId?: string | null;
  activeTraceId?: string | null;
  statusLine?: ReactNode;
  laneRef?: Ref<HTMLDivElement>;
  renderToken?: string | null;
  renderCommits?: number;
  bottomRef?: Ref<HTMLDivElement>;
  clipText: HelixAskActiveTurnReplySurfaceProps["clipText"];
  readRowClassName: HelixAskActiveTurnReplySurfaceProps["readRowClassName"];
  readDotClassName: HelixAskActiveTurnReplySurfaceProps["readDotClassName"];
  readPillClassName: HelixAskActiveTurnReplySurfaceProps["readPillClassName"];
};

export function buildHelixAskActiveTurnListState({
  completedReplyCount,
  className,
  onScroll,
  consoleDebugSnapshot,
  rows,
  tintClassName,
  replyId,
  activeTurnId,
  activeTraceId,
  statusLine,
  laneRef,
  renderToken,
  renderCommits = 0,
  bottomRef,
  clipText,
  readRowClassName,
  readDotClassName,
  readPillClassName,
}: HelixAskActiveTurnListStateOptions): Omit<HelixAskTurnListSurfaceProps, "children"> {
  return {
    visible: completedReplyCount > 0 || rows.length > 0,
    className,
    onScroll,
    consoleDebugSnapshot,
    activeTurnStreamReply: {
      rows,
      tintClassName,
      replyId,
      activeTurnId,
      clipText,
      readRowClassName,
      readDotClassName,
      readPillClassName,
    },
    activeTurnStreamStatusLine: statusLine,
    activeTurnStreamLaneRef: laneRef,
    activeTurnStreamLineCount: rows.length,
    activeTurnStreamTurnId: activeTurnId,
    activeTurnStreamTraceId: activeTraceId,
    activeTurnStreamRenderToken: renderToken,
    activeTurnStreamRenderCommits: renderCommits,
    bottomRef,
  };
}
