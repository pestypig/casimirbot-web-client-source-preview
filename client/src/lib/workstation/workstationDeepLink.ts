import { getPanelDef } from "@/lib/desktop/panelRegistry";
import {
  buildWorkstationPathRef as buildSharedWorkstationPathRef,
  buildWorkstationPanelPathRef as buildSharedWorkstationPanelPathRef,
  coerceWorkstationViewState as coerceSharedWorkstationViewState,
  coerceWorkstationViewStateFromPathInput as coerceSharedWorkstationViewStateFromPathInput,
  encodeWorkstationViewStateSearch as encodeSharedWorkstationViewStateSearch,
  normalizeWorkspaceRelativePath as normalizeSharedWorkspaceRelativePath,
  normalizeWorkstationDocPath as normalizeSharedWorkstationDocPath,
  normalizeWorkstationPathInput as normalizeSharedWorkstationPathInput,
  parseWorkstationArtifactParam,
  parseWorkstationObjectParam,
  type WorkstationPathRef,
  type WorkstationViewState,
} from "@shared/workstation-view-state";

export type { WorkstationPathRef, WorkstationViewState } from "@shared/workstation-view-state";

const PANEL_ALIAS_TO_ID: Record<string, string> = {
  essence: "agi-essence-console",
  noisegen: "helix-noise-gens",
  helix: "operational-mode",
  observables: "helix-observables",
  luma: "helix-luma",
  ragadmin: "rag-admin",
  ragingest: "rag-ingest",
  "code-admin": "code-admin",
  taskbar: "taskbar",
};

const PANEL_ID_TO_ALIAS = Object.entries(PANEL_ALIAS_TO_ID).reduce<Record<string, string>>(
  (acc, [alias, id]) => {
    acc[id] = alias;
    return acc;
  },
  {},
);

type ParseInput = string | URL | {
  pathname?: string;
  search?: string;
  hash?: string;
};

function readPanelId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const mapped = PANEL_ALIAS_TO_ID[trimmed] ?? trimmed;
  return getPanelDef(mapped) ? mapped : null;
}

export function resolveWorkstationPanelIds(aliases?: string[] | null): string[] {
  if (!Array.isArray(aliases)) return [];
  const resolved: string[] = [];
  for (const alias of aliases) {
    const panelId = readPanelId(alias);
    if (!panelId || resolved.includes(panelId)) continue;
    resolved.push(panelId);
  }
  return resolved;
}

function parsePanelList(value: string | null): string[] {
  if (!value) return [];
  return resolveWorkstationPanelIds(
    value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

export function normalizeWorkspaceRelativePath(value: string | null | undefined): string | null {
  return normalizeSharedWorkspaceRelativePath(value);
}

export function normalizeWorkstationPathInput(value: string | null | undefined): string | null {
  return normalizeSharedWorkstationPathInput(value);
}

export function normalizeWorkstationDocPath(value: string | null | undefined): string | null {
  return normalizeSharedWorkstationDocPath(value);
}

export function buildWorkstationPathRef(path: string | null | undefined): WorkstationPathRef | null {
  return buildSharedWorkstationPathRef(path);
}

export function buildWorkstationPanelPathRef(panelId: string | null | undefined): WorkstationPathRef | null {
  const id = panelId?.trim();
  if (!id) return null;
  const panelDef = getPanelDef(id);
  if (!panelDef) return null;
  return buildSharedWorkstationPanelPathRef(id, panelDef.title);
}

export function coerceWorkstationViewStateFromPathInput(value: string | null | undefined): WorkstationViewState | null {
  return coerceSharedWorkstationViewStateFromPathInput(value, {
    resolvePanelId: readPanelId,
    resolvePanelTitle: (panelId) => getPanelDef(panelId)?.title ?? panelId,
  });
}

function readParams(params: URLSearchParams): WorkstationViewState {
  const panels = parsePanelList(params.get("panels") ?? params.get("openPanels"));
  const focusPanel = readPanelId(params.get("focus") ?? params.get("focusPanel") ?? params.get("panel")) ?? undefined;
  const activeDocPath = normalizeWorkstationDocPath(
    params.get("doc") ?? params.get("activeDocPath") ?? params.get("path"),
  ) ?? undefined;
  const anchor = params.get("anchor")?.trim() || undefined;
  const objectParam = parseWorkstationObjectParam(params.get("object"));
  const equation = params.get("equation")?.trim() || undefined;
  const artifactParam = parseWorkstationArtifactParam(params.get("artifact"));
  const selectedObjectKind = objectParam?.selectedObjectKind ?? (equation ? "doc_equation" : undefined);
  const selectedObjectId = objectParam?.selectedObjectId ?? equation;
  const projectSlug = params.get("project")?.trim() || undefined;
  const pathRef = buildWorkstationPathRef(activeDocPath) ?? undefined;
  const resolvedPanels = activeDocPath && !panels.includes("docs-viewer") ? [...panels, "docs-viewer"] : panels;
  return {
    ...(projectSlug ? { projectSlug } : {}),
    panels: resolvedPanels,
    ...(focusPanel ? { focusPanel } : activeDocPath ? { focusPanel: "docs-viewer" } : {}),
    ...(activeDocPath ? { activeDocPath } : {}),
    ...(anchor ? { anchor } : {}),
    ...(selectedObjectKind ? { selectedObjectKind } : {}),
    ...(selectedObjectId ? { selectedObjectId } : {}),
    ...(artifactParam?.artifactKind ? { artifactKind: artifactParam.artifactKind } : {}),
    ...(artifactParam?.artifactId ? { artifactId: artifactParam.artifactId } : {}),
    ...(pathRef ? { pathRef } : {}),
  };
}

function toUrl(input: ParseInput): URL {
  if (input instanceof URL) return input;
  if (typeof input === "string") return new URL(input, "http://localhost");
  const pathname = input.pathname?.trim() || "/desktop";
  const search = input.search?.trim() || "";
  const hash = input.hash?.trim() || "";
  return new URL(`${pathname}${search}${hash}`, "http://localhost");
}

export function parseWorkstationViewStateFromUrl(input: ParseInput): WorkstationViewState {
  const url = toUrl(input);
  const legacyHash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  const legacy = legacyHash ? readParams(new URLSearchParams(legacyHash)) : { panels: [] };
  const query = readParams(url.searchParams);
  return mergeWorkstationViewStates(legacy, query);
}

export function mergeWorkstationViewStates(
  base: WorkstationViewState,
  override: WorkstationViewState,
): WorkstationViewState {
  const panels = [...base.panels];
  for (const panelId of override.panels) {
    if (!panels.includes(panelId)) panels.push(panelId);
  }
  const activeDocPath = override.activeDocPath ?? base.activeDocPath;
  const pathRef = buildWorkstationPathRef(activeDocPath) ?? override.pathRef ?? base.pathRef;
  const selectedObjectKind = override.selectedObjectKind ?? base.selectedObjectKind;
  const selectedObjectId = override.selectedObjectId ?? base.selectedObjectId;
  const artifactKind = override.artifactKind ?? base.artifactKind;
  const artifactId = override.artifactId ?? base.artifactId;
  return {
    ...(override.projectSlug ?? base.projectSlug ? { projectSlug: override.projectSlug ?? base.projectSlug } : {}),
    panels: activeDocPath && !panels.includes("docs-viewer") ? [...panels, "docs-viewer"] : panels,
    ...(override.focusPanel ?? base.focusPanel
      ? { focusPanel: override.focusPanel ?? base.focusPanel }
      : activeDocPath
        ? { focusPanel: "docs-viewer" }
        : {}),
    ...(activeDocPath ? { activeDocPath } : {}),
    ...(override.anchor ?? base.anchor ? { anchor: override.anchor ?? base.anchor } : {}),
    ...(selectedObjectKind ? { selectedObjectKind } : {}),
    ...(selectedObjectId ? { selectedObjectId } : {}),
    ...(artifactKind ? { artifactKind } : {}),
    ...(artifactId ? { artifactId } : {}),
    ...(pathRef ? { pathRef } : {}),
  };
}

export function coerceWorkstationViewState(value: unknown): WorkstationViewState | null {
  return coerceSharedWorkstationViewState(value, {
    resolvePanelId: readPanelId,
    resolvePanelTitle: (panelId) => getPanelDef(panelId)?.title ?? panelId,
  });
}

export function encodeWorkstationViewStateSearch(
  state: WorkstationViewState,
  currentSearch = "",
): string {
  return encodeSharedWorkstationViewStateSearch(state, currentSearch, { resolvePanelId: readPanelId });
}

export function encodeLegacyLayoutHash(state: Pick<WorkstationViewState, "projectSlug" | "panels">): string {
  const params = new URLSearchParams();
  if (state.projectSlug) params.set("project", state.projectSlug);
  const panels = resolveWorkstationPanelIds(state.panels);
  if (panels.length > 0) {
    params.set("panels", panels.map((panel) => PANEL_ID_TO_ALIAS[panel] ?? panel).join(","));
  }
  const query = params.toString();
  return query ? `#${query}` : "";
}
