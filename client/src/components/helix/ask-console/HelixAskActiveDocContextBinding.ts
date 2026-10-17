import { readDocPathFromDesktopUrl } from "./HelixAskContextBridge";
import {
  buildDocViewerDebugSnapshotFromState,
  normalizeDocViewerPathForAskSnapshot,
  resolveDocViewerSnapshotPathCandidate,
  type HelixAskDocViewerDebugSnapshotInput,
  type HelixAskDocViewerSnapshotPathResolution,
} from "@/lib/helix/ask-doc-viewer-context";

let helixAskLastKnownDocViewerPath: string | null = null;

export function rememberHelixAskDocViewerPathForSnapshot(value: unknown): string | null {
  const normalized = normalizeDocViewerPathForAskSnapshot(value);
  if (normalized) {
    helixAskLastKnownDocViewerPath = normalized;
    return normalized;
  }
  return helixAskLastKnownDocViewerPath;
}

export function readHelixAskDocViewerPathFromDesktopUrlForSnapshot(desktopUrl: unknown): string | null {
  if (typeof desktopUrl !== "string" || !desktopUrl.trim()) return null;
  return normalizeDocViewerPathForAskSnapshot(readDocPathFromDesktopUrl(desktopUrl));
}

export function buildHelixAskDocViewerDebugSnapshotBinding(
  state: HelixAskDocViewerDebugSnapshotInput,
): Record<string, unknown> {
  const currentPath = rememberHelixAskDocViewerPathForSnapshot(state.currentPath);
  return buildDocViewerDebugSnapshotFromState(state, currentPath);
}

export function resolveHelixAskDocViewerSnapshotPathBinding(args: {
  state: HelixAskDocViewerDebugSnapshotInput;
  desktopUrlDocPath?: string | null;
}): HelixAskDocViewerSnapshotPathResolution {
  const debugSnapshot = buildHelixAskDocViewerDebugSnapshotBinding(args.state);
  const resolution = resolveDocViewerSnapshotPathCandidate({
    storePath: args.state.currentPath,
    debugSnapshotPath: debugSnapshot.currentPath,
    desktopUrlDocPath: args.desktopUrlDocPath,
    lastKnownPath: helixAskLastKnownDocViewerPath,
  });
  if (resolution.path) rememberHelixAskDocViewerPathForSnapshot(resolution.path);
  return resolution;
}

export function resetHelixAskDocViewerSnapshotPathMemoryForTests(): void {
  helixAskLastKnownDocViewerPath = null;
}
