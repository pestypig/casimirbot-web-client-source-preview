import {
  buildAskTurnWorkspaceContextSnapshotFromState,
  buildWorkstationLayoutDebugSnapshotFromState,
  type AskTurnWorkspaceContextSnapshotInput,
} from "@/lib/helix/ask-workspace-context-snapshot";
import { attachHelixAskActiveImageLensSourceContext } from "./HelixAskImageLensContextBridge";

export function buildHelixAskWorkstationLayoutDebugSnapshotBinding(
  layoutState: Parameters<typeof buildWorkstationLayoutDebugSnapshotFromState>[0],
): Record<string, unknown> {
  return buildWorkstationLayoutDebugSnapshotFromState(layoutState);
}

export function buildHelixAskWorkspaceContextSnapshotBinding(
  input: AskTurnWorkspaceContextSnapshotInput,
): Record<string, unknown> {
  return attachHelixAskActiveImageLensSourceContext(
    buildAskTurnWorkspaceContextSnapshotFromState(input),
  );
}
