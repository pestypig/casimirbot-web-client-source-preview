import {
  isDocEquationActionManifestV1,
  type DocEquationActionEntryV1,
  type DocEquationActionManifestV1,
  type DocEquationActionV1,
} from "@shared/contracts/doc-equation-action-manifest.v1";
import type {
  DocEquationContextArtifactV1,
  DocEquationContextLinkV1,
  DocEquationContextScopeV1,
} from "@shared/contracts/doc-equation-context.v1";
import { buildWorkstationPathRef, normalizeWorkstationDocPath } from "@shared/workstation-view-state";
import { isTheoryCompoundRunV1, type TheoryCompoundRunV1 } from "@shared/contracts/theory-compound-run.v1";
import { emitDocEquationContextArtifact } from "@/lib/docs/docEquationContextEvents";
import {
  buildDocScalarCalculatorLaunch,
  dispatchDocCalculatorLaunch,
} from "@/lib/docs/docCalculatorLaunch";
import { useTheoryBadgeGraphPanelStore } from "@/store/useTheoryBadgeGraphPanelStore";
import { useTheoryCompoundRunStore } from "@/store/useTheoryCompoundRunStore";
import { useWorkstationLayoutStore } from "@/store/useWorkstationLayoutStore";

type ManifestModule = DocEquationActionManifestV1 | { default?: DocEquationActionManifestV1 };

const sidecarModules = import.meta.glob("../../../../docs/**/*.equation-actions.json", {
  eager: true,
  import: "default",
}) as Record<string, ManifestModule>;

const DOC_PATH_PATTERN = /docs[\\/]/i;

const manifests = Object.values(sidecarModules)
  .map((module) => ("default" in module && module.default ? module.default : module))
  .filter(isDocEquationActionManifestV1);

const manifestByDocPath = new Map<string, DocEquationActionManifestV1>(
  manifests.map((manifest) => [normalizeDocPath(manifest.docPath), manifest]),
);

export type ExecuteDocEquationActionArgs = {
  currentPath?: string | null;
  anchor?: string | null;
  actionId: string;
  latex: string;
  fetchImpl?: typeof fetch;
  emitContextArtifact?: (artifact: DocEquationContextArtifactV1) => void;
};

const NHM2_DIAGNOSTIC_PROHIBITED_CLAIMS = [
  "validated",
  "viable",
  "certified transport",
  "NHM2 proves viability",
  "energy conditions pass",
  "Casimir source proven",
] as const;

const RUNTIME_ARTIFACT_BADGE_IDS = new Set([
  "nhm2.tensor.same_chart_full_tensor",
  "nhm2.closure.wall_t00_source_residual",
  "nhm2.energy_condition.observer_robust_gate",
  "nhm2.qei.worldline_dossier",
  "casimir.material.lifshitz_receipt",
  "casimir.geometry.beyond_pfa_validity",
  "nhm2.natario.invariant_audit",
  "nhm2.dynamic.time_dependent_source_campaign",
  "nhm2.formal.diagnostic_campaign_admissible",
  "nhm2.experimental.tile_source_physical_validation_plan",
  "nhm2.experimental.physical_viability_campaign",
  "nhm2.experimental.theory_solve_roadmap",
]);

export function getDocEquationActionManifest(docPath?: string | null): DocEquationActionManifestV1 | null {
  if (!docPath) return null;
  return manifestByDocPath.get(normalizeDocPath(docPath)) ?? null;
}

export function getDocEquationActionEntryForLatex(
  docPath: string | null | undefined,
  latex: string,
): DocEquationActionEntryV1 | null {
  const manifest = getDocEquationActionManifest(docPath);
  if (!manifest) return null;
  const normalized = normalizeLatexForDocAction(latex);
  if (!normalized) return null;
  return (
    manifest.entries.find((entry) => {
      const candidates = [entry.latex, ...(entry.aliases ?? [])];
      return candidates.some((candidate) => normalizeLatexForDocAction(candidate) === normalized);
    }) ?? null
  );
}

export function getDocEquationTheoryActions(entry: DocEquationActionEntryV1 | null): DocEquationActionV1[] {
  return entry?.actions.filter((action) => action.kind === "artifact_backed_theory_run") ?? [];
}

export function getDocEquationCalculatorActions(entry: DocEquationActionEntryV1 | null): DocEquationActionV1[] {
  return entry?.actions.filter((action) => action.kind === "calculator_ingest") ?? [];
}

export async function executeDocEquationAction(args: ExecuteDocEquationActionArgs): Promise<void> {
  const entry = getDocEquationActionEntryForLatex(args.currentPath, args.latex);
  const action = entry?.actions.find((candidate) => candidate.actionId === args.actionId) ?? null;
  if (!entry || !action) return;

  if (action.kind === "calculator_ingest") {
    const openedPanels = action.openPanels ?? ["scientific-calculator"];
    dispatchDocCalculatorLaunch(buildDocScalarCalculatorLaunch({
      latex: args.latex,
      docPath: args.currentPath ?? null,
      anchor: args.anchor ?? entry.equationId,
      label: entry.label,
      claimBoundaryNotes: [
        ...entry.claimBoundaryNotes,
        ...(action.claimBoundaryNote ? [action.claimBoundaryNote] : []),
      ],
    }));
    openDocEquationPanels(openedPanels);
    emitActionContext({
      currentPath: args.currentPath,
      latex: args.latex,
      entry,
      action,
      openedPanels,
      emitContextArtifact: args.emitContextArtifact,
    });
    return;
  }

  if (action.alsoIngestLatex !== false) {
    dispatchDocCalculatorLaunch(buildDocScalarCalculatorLaunch({
      latex: args.latex,
      docPath: args.currentPath ?? null,
      anchor: args.anchor ?? entry.equationId,
      label: entry.label,
      claimBoundaryNotes: entry.claimBoundaryNotes,
    }));
  }

  const openedPanels = action.openPanels ?? ["theory-badge-graph", "scientific-calculator"];
  openDocEquationPanels(openedPanels);
  applyTheoryGraphOrientation(action);
  emitActionContext({
    currentPath: args.currentPath,
    latex: args.latex,
    entry,
    action,
    openedPanels,
    emitContextArtifact: args.emitContextArtifact,
  });

  const badgeIds = action.badgeIds ?? [];
  if (badgeIds.length === 0) return;

  await loadStaticTheoryRun({
    badgeIds,
    mode: action.compoundRunMode ?? "dependency_path",
    preferredBadgeId: action.preferredBadgeId,
  });

  await loadArtifactBackedTheoryRun({
    badgeIds,
    mode: action.compoundRunMode ?? "dependency_path",
    preferredBadgeId: action.preferredBadgeId,
    fetchImpl: args.fetchImpl ?? fetch,
  });
}

export function buildDocEquationContextArtifact(args: {
  currentPath?: string | null;
  latex: string;
  entry: DocEquationActionEntryV1;
  action: DocEquationActionV1;
  openedPanels: string[];
  generatedAt?: string;
}): DocEquationContextArtifactV1 {
  const badgeIds = args.action.badgeIds?.length
    ? args.action.badgeIds
    : args.action.calculatorPayloadRef
      ? [args.action.calculatorPayloadRef.badgeId]
      : [];
  const scope = classifyActionScope(args.action);
  const docPath = normalizeDocPath(args.currentPath ?? "docs/unknown.md");
  const anchor = args.entry.equationId;
  const pathRef = buildWorkstationPathRef(docPath) ?? undefined;
  const uri = pathRef ? `${pathRef.virtualUri}#${encodeURIComponent(anchor)}` : undefined;
  const openedPanels = Array.from(new Set(args.openedPanels.filter(Boolean)));
  return {
    contractVersion: "doc_equation_context/v1",
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    docPath,
    equationId: args.entry.equationId,
    equationLabel: args.entry.label,
    ...(args.entry.sectionAnchor ? { sectionAnchor: args.entry.sectionAnchor } : {}),
    ...(uri ? { uri } : {}),
    ...(pathRef ? { pathRef } : {}),
    anchor,
    latex: args.latex.trim() || args.entry.latex,
    actionId: args.action.actionId,
    actionKind: args.action.kind,
    badgeIds,
    ...(args.action.preferredBadgeId ? { preferredBadgeId: args.action.preferredBadgeId } : {}),
    ...(args.action.calculatorPayloadRef ? { calculatorPayloadRef: args.action.calculatorPayloadRef } : {}),
    ...(args.action.atlasLensId ? { atlasLensId: args.action.atlasLensId } : {}),
    ...(args.action.atlasGroupId ? { atlasGroupId: args.action.atlasGroupId } : {}),
    openedPanels,
    claimBoundaryNotes: [...args.entry.claimBoundaryNotes],
    ...(args.action.claimBoundaryNote ? { actionClaimBoundaryNote: args.action.claimBoundaryNote } : {}),
    links: buildDocEquationContextLinks({
      docPath,
      anchor,
      sectionAnchor: args.entry.sectionAnchor,
      action: args.action,
      openedPanels,
      scope,
      badgeIds,
    }),
    commentaryHints: {
      summary: buildContextSummary(args.entry, args.action, scope),
      scope,
      prohibitedClaims: [...NHM2_DIAGNOSTIC_PROHIBITED_CLAIMS],
      suggestedExplanationFocus: buildSuggestedExplanationFocus(args.entry, args.action, scope),
    },
  };
}

function buildDocEquationContextLinks(args: {
  docPath: string;
  anchor: string;
  sectionAnchor?: string;
  action: DocEquationActionV1;
  openedPanels: string[];
  scope: DocEquationContextScopeV1;
  badgeIds: string[];
}): DocEquationContextLinkV1[] {
  const links: DocEquationContextLinkV1[] = [
    {
      rel: "supports_doc_section",
      docPath: args.docPath,
      anchor: args.sectionAnchor ?? args.anchor,
    },
  ];

  for (const panelId of args.openedPanels) {
    links.push({ rel: "opens_panel", panelId });
  }

  const artifactId = args.action.preferredBadgeId ?? args.action.calculatorPayloadRef?.badgeId ?? args.badgeIds[0];
  if (artifactId) {
    links.push({
      rel: args.scope === "theory_orientation" ? "orients_theory_graph" : "opens_runtime_artifact",
      artifactId,
      artifactKind: args.scope,
      ...(args.openedPanels[0] ? { panelId: args.openedPanels[0] } : {}),
    });
  }

  return links;
}

function emitActionContext(args: {
  currentPath?: string | null;
  latex: string;
  entry: DocEquationActionEntryV1;
  action: DocEquationActionV1;
  openedPanels: string[];
  emitContextArtifact?: (artifact: DocEquationContextArtifactV1) => void;
}): void {
  const artifact = buildDocEquationContextArtifact(args);
  if (args.emitContextArtifact) {
    args.emitContextArtifact(artifact);
    return;
  }
  emitDocEquationContextArtifact(artifact);
}

function classifyActionScope(action: DocEquationActionV1): DocEquationContextScopeV1 {
  if (action.kind === "calculator_ingest") return "scalar_replay";
  const ids = [action.preferredBadgeId, ...(action.badgeIds ?? [])].filter((id): id is string => Boolean(id));
  return ids.some((id) => RUNTIME_ARTIFACT_BADGE_IDS.has(id)) ? "runtime_artifact" : "theory_orientation";
}

function buildContextSummary(
  entry: DocEquationActionEntryV1,
  action: DocEquationActionV1,
  scope: DocEquationContextScopeV1,
): string {
  const target = action.preferredBadgeId ?? action.calculatorPayloadRef?.badgeId ?? action.badgeIds?.[0] ?? "theory graph";
  if (scope === "scalar_replay") {
    return `${entry.label} loads a scalar calculator replay for ${target}; it is not a final proof surface.`;
  }
  if (scope === "runtime_artifact") {
    return `${entry.label} opens runtime evidence for ${target}; artifact status and blockers remain authoritative.`;
  }
  return `${entry.label} orients the theory graph around ${target}; this is context, not validation.`;
}

function buildSuggestedExplanationFocus(
  entry: DocEquationActionEntryV1,
  action: DocEquationActionV1,
  scope: DocEquationContextScopeV1,
): string[] {
  const focus = new Set<string>();
  if (scope === "scalar_replay") {
    focus.add("scalar calculator replay");
    focus.add("limits of badge replay");
  } else if (scope === "runtime_artifact") {
    focus.add("runtime artifact status");
    focus.add("missing or proxy blockers");
  } else {
    focus.add("theory graph orientation");
    focus.add("first-principles context");
  }
  if (action.preferredBadgeId) focus.add(`preferred badge ${action.preferredBadgeId}`);
  for (const note of entry.claimBoundaryNotes.slice(0, 2)) focus.add(note);
  if (action.claimBoundaryNote) focus.add(action.claimBoundaryNote);
  return Array.from(focus);
}

export function normalizeLatexForDocAction(value: string): string {
  return value
    .replace(/\\left/g, "")
    .replace(/\\right/g, "")
    .replace(/\\,/g, "")
    .replace(/\\;/g, "")
    .replace(/\\!/g, "")
    .replace(/\s+/g, "")
    .replace(/[.;]+$/g, "")
    .trim();
}

function normalizeDocPath(raw: string): string {
  const workstationDocPath = normalizeWorkstationDocPath(raw);
  if (workstationDocPath) return workstationDocPath;
  const normalized = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  const matchIndex = normalized.search(DOC_PATH_PATTERN);
  const fromDocs = matchIndex === -1 ? normalized : normalized.slice(matchIndex);
  return fromDocs.replace(/^docs\/?/, "docs/").replace(/\/{2,}/g, "/");
}

function openDocEquationPanels(panelIds: string[]): void {
  const layout = useWorkstationLayoutStore.getState();
  Array.from(new Set(panelIds.filter(Boolean))).forEach((panelId) => {
    layout.openPanelInActiveGroup(panelId);
  });
}

function applyTheoryGraphOrientation(action: DocEquationActionV1): void {
  const graphStore = useTheoryBadgeGraphPanelStore.getState();
  if (action.atlasLensId) {
    graphStore.setActiveAtlasLensId(action.atlasLensId as Parameters<typeof graphStore.setActiveAtlasLensId>[0]);
  }
  if (action.badgeIds?.length) {
    graphStore.setSelectedBadgeIds(action.badgeIds);
    graphStore.setSelectedBadgeId(action.preferredBadgeId ?? action.badgeIds[0] ?? null);
  }
  if (!action.atlasGroupId) return;
  if (action.atlasLensId === "warp_gr_nhm2") {
    graphStore.setSelectedWarpGrNhm2GroupId(
      action.atlasGroupId as Parameters<typeof graphStore.setSelectedWarpGrNhm2GroupId>[0],
    );
  } else if (action.atlasLensId === "qei_stress_energy") {
    graphStore.setSelectedQeiStressEnergyGroupId(
      action.atlasGroupId as Parameters<typeof graphStore.setSelectedQeiStressEnergyGroupId>[0],
    );
  } else if (action.atlasLensId === "casimir_cavity_modes") {
    graphStore.setSelectedCasimirCavityGroupId(
      action.atlasGroupId as Parameters<typeof graphStore.setSelectedCasimirCavityGroupId>[0],
    );
  }
}

function selectEvidenceRunRow(run: TheoryCompoundRunV1, preferredBadgeId?: string): void {
  const runStore = useTheoryCompoundRunStore.getState();
  const preferredRow = preferredBadgeId
    ? run.rows.find(
        (row) =>
          row.badgeId === preferredBadgeId &&
          (row.runtimeReceiptV1 || row.runtimeMathTraceV1 || row.kind === "gate" || row.kind === "evidence"),
      )
    : null;
  const row =
    preferredRow ??
    run.rows.find((candidate) => candidate.runtimeReceiptV1) ??
    run.rows.find((candidate) => candidate.runtimeMathTraceV1) ??
    run.rows.find((candidate) => candidate.kind === "gate" || candidate.kind === "evidence") ??
    run.rows[0];
  if (row) runStore.selectTheoryRunRow(row.id);
}

async function loadStaticTheoryRun(args: {
  badgeIds: string[];
  mode: "selected_badges" | "dependency_path" | "locator_matches";
  preferredBadgeId?: string;
}): Promise<void> {
  const [{ buildNhm2TheoryBadgeGraphV1 }, { buildTheoryCompoundRun }] = await Promise.all([
    import("@shared/theory/nhm2-theory-badges"),
    import("@shared/theory/theory-compound-run-builder"),
  ]);
  const graph = buildNhm2TheoryBadgeGraphV1();
  const run = buildTheoryCompoundRun({
    graph,
    badgeIds: args.badgeIds,
    mode: args.mode,
    source: "workstation_action",
    includeScalar: true,
    includeRuntime: true,
    includeEvidence: true,
    includeBoundaries: true,
  });
  useTheoryCompoundRunStore.getState().loadTheoryRun(run);
  selectEvidenceRunRow(run, args.preferredBadgeId);
}

async function loadArtifactBackedTheoryRun(args: {
  badgeIds: string[];
  mode: "selected_badges" | "dependency_path" | "locator_matches";
  preferredBadgeId?: string;
  fetchImpl: typeof fetch;
}): Promise<void> {
  try {
    const response = await args.fetchImpl("/api/helix/theory/compound-run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        badgeIds: args.badgeIds,
        mode: args.mode,
        source: "workstation_action",
        includeScalar: true,
        includeRuntime: true,
        includeEvidence: true,
        includeBoundaries: true,
        runQuick: false,
      }),
    });
    if (!response.ok) return;
    const payload = (await response.json()) as { artifact_v1?: unknown };
    if (!isTheoryCompoundRunV1(payload.artifact_v1)) return;
    useTheoryCompoundRunStore.getState().loadTheoryRun(payload.artifact_v1);
    selectEvidenceRunRow(payload.artifact_v1, args.preferredBadgeId);
  } catch {
    // The static run remains loaded when artifact enrichment is unavailable.
  }
}
