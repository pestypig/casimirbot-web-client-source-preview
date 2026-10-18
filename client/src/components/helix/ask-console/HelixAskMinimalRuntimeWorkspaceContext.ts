import type { WorkstationLayoutSnapshotInput } from "@/lib/helix/ask-workspace-context-snapshot";

type RecordLike = Record<string, unknown>;

const readString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const readPanelId = (value: unknown): string | null => {
  const panelId = readString(value);
  return panelId && /^[A-Za-z0-9._:-]{1,180}$/.test(panelId) ? panelId : null;
};

const readDesktopUrl = (value: string): URL | null => {
  try {
    return value ? new URL(value, "http://localhost") : null;
  } catch {
    return null;
  }
};

const uniquePanelIds = (values: unknown[]): string[] =>
  Array.from(new Set(values.map(readPanelId).filter((value): value is string => Boolean(value)))).slice(0, 24);

const readLayoutPanelContext = (
  layoutState: WorkstationLayoutSnapshotInput | null | undefined,
): {
  activePanel: string | null;
  activeGroupId: string | null;
  openPanels: string[];
  groupCount: number;
} => {
  const groups = layoutState?.groups ?? {};
  const activeGroupId = readString(layoutState?.activeGroupId);
  const activePanel = activeGroupId ? readPanelId(groups[activeGroupId]?.activePanelId) : null;
  const openPanels = uniquePanelIds(
    Object.values(groups).flatMap((group) => Array.isArray(group?.panelIds) ? group.panelIds : []),
  );
  return {
    activePanel,
    activeGroupId,
    openPanels,
    groupCount: Object.keys(groups).length,
  };
};

export function buildHelixAskMinimalRuntimeWorkspaceContext(input: {
  sessionId?: string | null;
  desktopUrl?: string | null;
  layoutState?: WorkstationLayoutSnapshotInput | null;
}): RecordLike {
  const desktopUrl = input.desktopUrl?.trim() ?? "";
  const url = readDesktopUrl(desktopUrl);
  const urlPanels = uniquePanelIds((url?.searchParams.get("panels") ?? "").split(","));
  const layout = readLayoutPanelContext(input.layoutState);
  const urlFocus = readPanelId(url?.searchParams.get("focus"));
  const activePanel =
    layout.activePanel ??
    urlFocus ??
    (urlPanels.includes("docs-viewer") ? "docs-viewer" : urlPanels[0] ?? null);
  const openPanels = uniquePanelIds([
    ...(layout.openPanels.length > 0 ? layout.openPanels : urlPanels),
    activePanel,
  ]);
  const activeDocPath = readString(url?.searchParams.get("doc"));
  const sessionId = readString(input.sessionId);

  return {
    schema: "helix.ask.minimal_runtime_workspace_context_snapshot.v1",
    sessionId,
    session_id: sessionId,
    desktop_url: desktopUrl,
    activePanel,
    active_panel: activePanel,
    activePanelId: activePanel,
    active_panel_id: activePanel,
    activeGroupId: layout.activeGroupId,
    active_group_id: layout.activeGroupId,
    groupCount: layout.groupCount,
    group_count: layout.groupCount,
    openPanels,
    open_panels: openPanels,
    openPanelIds: openPanels,
    open_panel_ids: openPanels,
    activeDocPath,
    active_doc_path: activeDocPath,
    docContextPath: activeDocPath,
    doc_context_path: activeDocPath,
  };
}

export function buildHelixAskLiveRuntimeSourceBinding(input: {
  desktopUrl?: string | null;
  layoutState?: WorkstationLayoutSnapshotInput | null;
}): RecordLike {
  const context = buildHelixAskMinimalRuntimeWorkspaceContext(input);
  const binding: RecordLike = {
    thread_id: "helix-ask:desktop",
    source_id: "helix-ask:desktop",
    source_kind: "helix_ask_workstation",
  };
  const focusPanelId = readPanelId(context.activePanel);
  const documentRef = readString(context.activeDocPath);
  if (focusPanelId) binding.focus_panel_id = focusPanelId;
  if (documentRef) binding.document_ref = documentRef.slice(0, 260);
  return binding;
}
