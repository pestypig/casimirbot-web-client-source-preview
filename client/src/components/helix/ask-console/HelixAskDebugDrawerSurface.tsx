import {
  HelixAskDebugDrawer,
  type HelixAskDebugDrawerProps,
} from "./HelixAskDebugDrawer";
import type { HelixAskDebugExportDrawerState } from "./HelixAskDebugDrawerState";

export type HelixAskDebugDrawerSurfaceProps = {
  drawer?: HelixAskDebugDrawerProps | null;
  drawerState?: HelixAskDebugExportDrawerState;
  onClose?: () => void;
};

export function HelixAskDebugDrawerSurface({
  drawer,
  drawerState,
  onClose,
}: HelixAskDebugDrawerSurfaceProps) {
  const resolvedDrawer =
    drawer ??
    (drawerState && onClose
      ? {
          payload: drawerState.payload,
          payloadHash: drawerState.payloadHash,
          readbackMatch: drawerState.result.readback_match ?? "unavailable",
          replyId: drawerState.replyId,
          onClose,
        }
      : null);

  if (!resolvedDrawer) return null;

  return <HelixAskDebugDrawer {...resolvedDrawer} />;
}
