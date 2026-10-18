import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDocEquationContextArtifact,
  executeDocEquationAction,
  getDocEquationActionEntryForLatex,
  getDocEquationTheoryActions,
  normalizeLatexForDocAction,
} from "../docEquationActions";
import { useTheoryBadgeGraphPanelStore } from "@/store/useTheoryBadgeGraphPanelStore";
import { selectActiveTheoryRunRow, useTheoryCompoundRunStore } from "@/store/useTheoryCompoundRunStore";

const NHM2_WHITEPAPER = "docs/research/nhm2-current-status-whitepaper.md";
const NHM2_WHITEPAPER_PATH = path.resolve(process.cwd(), NHM2_WHITEPAPER);
const NHM2_WHITEPAPER_ACTIONS_PATH = path.resolve(
  process.cwd(),
  "docs/research/nhm2-current-status-whitepaper.equation-actions.json",
);
const NHM2_WHITEPAPER_ACTION_SOURCE_PATH = path.resolve(
  process.cwd(),
  "docs/research/nhm2-current-status-whitepaper.equation-actions.source.json",
);
const CASIMIR_DP_STUDY = "docs/research/casimir-dp-quantum-foam-study.md";
const CASIMIR_DP_STUDY_PATH = path.resolve(process.cwd(), CASIMIR_DP_STUDY);
const CASIMIR_DP_STUDY_ACTIONS_PATH = path.resolve(
  process.cwd(),
  "docs/research/casimir-dp-quantum-foam-study.equation-actions.json",
);
const CASIMIR_DP_STUDY_ACTION_SOURCE_PATH = path.resolve(
  process.cwd(),
  "docs/research/casimir-dp-quantum-foam-study.equation-actions.source.json",
);

type TestDocEquationActionEntry = {
  equationId: string;
  latex: string;
  actions: Array<{ actionId: string; kind: string; calculatorPayloadRef?: unknown }>;
};

function readNhm2GeneratedEntry(equationId: string): TestDocEquationActionEntry {
  const manifest = JSON.parse(readFileSync(NHM2_WHITEPAPER_ACTIONS_PATH, "utf8")) as {
    entries: TestDocEquationActionEntry[];
  };
  const entry = manifest.entries.find((candidate) => candidate.equationId === equationId);
  if (!entry) throw new Error(`Missing generated NHM2 sidecar entry: ${equationId}`);
  return entry;
}

function readCasimirDpGeneratedEntry(equationId: string): TestDocEquationActionEntry {
  const manifest = JSON.parse(readFileSync(CASIMIR_DP_STUDY_ACTIONS_PATH, "utf8")) as {
    entries: TestDocEquationActionEntry[];
  };
  const entry = manifest.entries.find((candidate) => candidate.equationId === equationId);
  if (!entry) throw new Error(`Missing generated Casimir-DP study sidecar entry: ${equationId}`);
  return entry;
}

describe("doc equation actions", () => {
  beforeEach(() => {
    useTheoryBadgeGraphPanelStore.getState().resetPanelMemory();
    useTheoryCompoundRunStore.getState().clearTheoryRun();
  });

  it("normalizes equivalent LaTeX action keys", () => {
    expect(normalizeLatexForDocAction("\\left(\\frac{d\\tau}{dt}\\right)^2 = \\alpha^2.")).toBe(
      normalizeLatexForDocAction("(\\frac{d\\tau}{dt})^2=\\alpha^2"),
    );
  });

  it("keeps NHM2 whitepaper equation-action markers registered in source and generated sidecars", () => {
    const markdown = readFileSync(NHM2_WHITEPAPER_PATH, "utf8");
    const source = JSON.parse(readFileSync(NHM2_WHITEPAPER_ACTION_SOURCE_PATH, "utf8")) as {
      entries: Array<{ equationId: string }>;
    };
    const generated = JSON.parse(readFileSync(NHM2_WHITEPAPER_ACTIONS_PATH, "utf8")) as {
      entries: Array<{ equationId: string }>;
    };
    const markerIds = Array.from(
      markdown.matchAll(/<!--\s*helix-doc-equation-action\/v1\s+id=([A-Za-z0-9._:-]+)\s*-->/g),
      (match) => match[1],
    );
    const sourceIds = source.entries.map((entry) => entry.equationId);
    const generatedIds = generated.entries.map((entry) => entry.equationId);

    expect([...sourceIds].sort()).toEqual([...markerIds].sort());
    expect([...generatedIds].sort()).toEqual([...markerIds].sort());
    expect(generatedIds).toEqual(
      expect.arrayContaining([
        "nhm2-frozen-447-material-evidence-gate",
        "nhm2-qst-er-epr-stage1-sidecar-boundary",
        "nhm2-0p7000-candidate-metric-profile-spec",
        "nhm2-time-dependent-source-campaign-gate",
        "nhm2-0p7000-profile-campaign-frontier",
      ]),
    );
  });

  it("locates NHM2 whitepaper runtime-backed equation entries", () => {
    const entry = getDocEquationActionEntryForLatex(
      `/${NHM2_WHITEPAPER}`,
      "\\mathcal{T}^{\\rm same-chart}_{\\rm full}=\\{T_{00},T_{0i},T_{ii},T_{ij,\\ i\\ne j}\\}",
    );

    expect(entry?.equationId).toBe("nhm2-same-chart-full-tensor-ledger");
    expect(getDocEquationTheoryActions(entry)[0]?.preferredBadgeId).toBe("nhm2.tensor.same_chart_full_tensor");
  });

  it("keeps the Casimir-DP study equation markers synchronized with both sidecars", () => {
    const markdown = readFileSync(CASIMIR_DP_STUDY_PATH, "utf8");
    const source = JSON.parse(readFileSync(CASIMIR_DP_STUDY_ACTION_SOURCE_PATH, "utf8")) as {
      entries: Array<{ equationId: string }>;
    };
    const generated = JSON.parse(readFileSync(CASIMIR_DP_STUDY_ACTIONS_PATH, "utf8")) as {
      entries: Array<{ equationId: string }>;
    };
    const markerIds = Array.from(
      markdown.matchAll(/<!--\s*helix-doc-equation-action\/v1\s+id=([A-Za-z0-9._:-]+)\s*-->/g),
      (match) => match[1],
    );
    const generatedIds = generated.entries.map((entry) => entry.equationId);

    expect(markerIds).toHaveLength(62);
    expect(source.entries.map((entry) => entry.equationId).sort()).toEqual([...markerIds].sort());
    expect([...generatedIds].sort()).toEqual([...markerIds].sort());
    expect(generatedIds).toEqual(
      expect.arrayContaining([
        "cdp-stage3-composite-null",
        "cdp-stage3-complex-coherence",
        "cdp-stage3-complete-apparatus-mass",
        "cdp-stage3-manifold-kernel-preflight",
        "cdp-stage4-transverse-polarization-completeness",
        "cdp-stage4-polarization-double-contrast",
        "cdp-stage4-planck-stefan-boltzmann-closure",
        "cdp-stage4-frequency-semantic-nonbridge",
        "cdp-stage4-expanded-ordinary-null",
        "cdp-qed-scale-hierarchy-identities",
        "cdp-qed-hydrogen-reduced-mass-boundary",
        "cdp-stage4-2b-spectral-thermometry-forward-model",
        "cdp-stage4-2b-sensor-self-noise-forward-model",
        "cdp-stage4-2b-ordinary-coherence-exponent",
        "cdp-stage4-2b-residual-covariance",
        "cdp-stage4-2b-joint-complex-residual",
        "cdp-stage4-2b-frozen-dp-scaling",
        "cdp-stage4-2b-identifiability-power-gate",
        "cdp-stage4-2g-single-identity-dp",
        "cdp-stage4-2g-companion-threshold",
        "cdp-stage4-2g-whitened-pilot-gates",
        "cdp-stage4-2h-commissioning-gate",
      ]),
    );
  });

  it("opens the Casimir-DP observable-separation theory path from the study", async () => {
    const generatedEntry = readCasimirDpGeneratedEntry("cdp-observable-separation-gate");
    const entry = getDocEquationActionEntryForLatex(`/${CASIMIR_DP_STUDY}`, generatedEntry.latex);
    const fetchImpl = vi.fn(async () => ({ ok: false }) as Response);

    expect(entry?.equationId).toBe("cdp-observable-separation-gate");
    expect(getDocEquationTheoryActions(entry)[0]?.preferredBadgeId).toBe(
      "study.casimir_dp.observable_separation_gate",
    );

    await executeDocEquationAction({
      currentPath: CASIMIR_DP_STUDY,
      actionId: "open-cdp-full-study-protocol",
      latex: generatedEntry.latex,
      fetchImpl,
    });

    const graphState = useTheoryBadgeGraphPanelStore.getState();
    const runState = useTheoryCompoundRunStore.getState();
    expect(graphState.activeAtlasLensId).toBe("casimir_dp_quantum_foam");
    expect(graphState.selectedBadgeId).toBe("study.casimir_dp.observable_separation_gate");
    expect(runState.activeTheoryRun?.targetBadgeIds).toContain("study.casimir_dp.observable_separation_gate");
  });

  it("locates the manifold-response and decoherence/collapse gates from their study equations", () => {
    const manifoldEquation = readCasimirDpGeneratedEntry("cdp-manifold-response-slot");
    const decoherenceEquation = readCasimirDpGeneratedEntry("cdp-decoherence-collapse-gate");
    const manifoldEntry = getDocEquationActionEntryForLatex(`/${CASIMIR_DP_STUDY}`, manifoldEquation.latex);
    const decoherenceEntry = getDocEquationActionEntryForLatex(`/${CASIMIR_DP_STUDY}`, decoherenceEquation.latex);

    expect(manifoldEntry?.equationId).toBe("cdp-manifold-response-slot");
    expect(getDocEquationTheoryActions(manifoldEntry)[0]?.preferredBadgeId).toBe(
      "study.casimir_dp.manifold_response_hypothesis",
    );
    expect(decoherenceEntry?.equationId).toBe("cdp-decoherence-collapse-gate");
    expect(getDocEquationTheoryActions(decoherenceEntry)[0]?.preferredBadgeId).toBe(
      "study.casimir_dp.decoherence_collapse_gate",
    );
  });

  it("opens the Compton/DP/cavity separation badge from both frequency equations", () => {
    for (const equationId of [
      "cdp-compton-dp-frequency-identities",
      "cdp-frequency-cavity-bridge-gate",
    ]) {
      const generatedEquation = readCasimirDpGeneratedEntry(equationId);
      const entry = getDocEquationActionEntryForLatex(`/${CASIMIR_DP_STUDY}`, generatedEquation.latex);

      expect(entry?.equationId).toBe(equationId);
      expect(getDocEquationTheoryActions(entry)[0]?.preferredBadgeId).toBe(
        "study.casimir_dp.frequency_bridge_gate",
      );
    }
  });

  it("opens the Stage-4 polarization, thermal, congruence, and campaign paths", () => {
    const expected = {
      "cdp-stage4-polarization-double-contrast":
        "study.casimir_dp.polarization_resolved_qed_control",
      "cdp-stage4-planck-stefan-boltzmann-closure":
        "study.casimir_dp.thermal_radiative_closure",
      "cdp-stage4-frequency-semantic-nonbridge":
        "study.casimir_dp.tensor_dimensional_congruence",
      "cdp-stage4-expanded-ordinary-null":
        "study.casimir_dp.polarization_congruence_stage4",
    } as const;

    for (const [equationId, preferredBadgeId] of Object.entries(expected)) {
      const generatedEquation = readCasimirDpGeneratedEntry(equationId);
      const entry = getDocEquationActionEntryForLatex(
        `/${CASIMIR_DP_STUDY}`,
        generatedEquation.latex,
      );
      expect(entry?.equationId).toBe(equationId);
      expect(getDocEquationTheoryActions(entry)[0]?.preferredBadgeId).toBe(
        preferredBadgeId,
      );
    }
  });

  it("opens the Stage-4.2B apparatus-residual badge from all seven coupled equations", () => {
    for (const equationId of [
      "cdp-stage4-2b-spectral-thermometry-forward-model",
      "cdp-stage4-2b-sensor-self-noise-forward-model",
      "cdp-stage4-2b-ordinary-coherence-exponent",
      "cdp-stage4-2b-residual-covariance",
      "cdp-stage4-2b-joint-complex-residual",
      "cdp-stage4-2b-frozen-dp-scaling",
      "cdp-stage4-2b-identifiability-power-gate",
    ]) {
      const generatedEquation = readCasimirDpGeneratedEntry(equationId);
      const entry = getDocEquationActionEntryForLatex(
        `/${CASIMIR_DP_STUDY}`,
        generatedEquation.latex,
      );
      expect(entry?.equationId).toBe(equationId);
      expect(getDocEquationTheoryActions(entry)[0]?.preferredBadgeId).toBe(
        "study.casimir_dp.apparatus_coherence_residual_stage4_2b",
      );
    }
  });

  it("opens the Stage-4.2G empirical-feasibility badge from its prediction and pilot gates", () => {
    for (const equationId of [
      "cdp-stage4-2g-single-identity-dp",
      "cdp-stage4-2g-companion-threshold",
      "cdp-stage4-2g-whitened-pilot-gates",
    ]) {
      const generatedEquation = readCasimirDpGeneratedEntry(equationId);
      const entry = getDocEquationActionEntryForLatex(
        `/${CASIMIR_DP_STUDY}`,
        generatedEquation.latex,
      );
      expect(entry?.equationId).toBe(equationId);
      expect(getDocEquationTheoryActions(entry)[0]?.preferredBadgeId).toBe(
        "study.casimir_dp.empirical_feasibility_pilot_stage4_2g",
      );
    }
  });

  it("opens the Stage-4.2H commissioning badge from its intake gate", () => {
    const generatedEquation = readCasimirDpGeneratedEntry(
      "cdp-stage4-2h-commissioning-gate",
    );
    const entry = getDocEquationActionEntryForLatex(
      `/${CASIMIR_DP_STUDY}`,
      generatedEquation.latex,
    );
    expect(entry?.equationId).toBe(
      "cdp-stage4-2h-commissioning-gate",
    );
    expect(getDocEquationTheoryActions(entry)[0]?.preferredBadgeId).toBe(
      "study.casimir_dp.commissioning_intake_stage4_2h",
    );
  });

  it("opens the experiment-design badge from the accessible-rate equation", () => {
    const rateEquation = readCasimirDpGeneratedEntry("cdp-accessible-rate-ratio");
    const entry = getDocEquationActionEntryForLatex(`/${CASIMIR_DP_STUDY}`, rateEquation.latex);

    expect(entry?.equationId).toBe("cdp-accessible-rate-ratio");
    expect(getDocEquationTheoryActions(entry)[0]?.preferredBadgeId).toBe(
      "study.casimir_dp.experiment_design_campaign",
    );
  });

  it("opens the Stage-1 gated-computations badge from the Lifshitz integral", () => {
    const lifshitzEquation = readCasimirDpGeneratedEntry("cdp-stage1-lifshitz-free-energy");
    const entry = getDocEquationActionEntryForLatex(`/${CASIMIR_DP_STUDY}`, lifshitzEquation.latex);

    expect(entry?.equationId).toBe("cdp-stage1-lifshitz-free-energy");
    expect(getDocEquationTheoryActions(entry)[0]?.preferredBadgeId).toBe(
      "study.casimir_dp.gated_computations_stage1",
    );
  });

  it("opens an artifact-backed theory orientation from a whitepaper equation action", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false }) as Response);

    await executeDocEquationAction({
      currentPath: NHM2_WHITEPAPER,
      actionId: "open-same-chart-full-tensor-artifact",
      latex: "\\mathcal{T}^{\\rm same-chart}_{\\rm full}=\\{T_{00},T_{0i},T_{ii},T_{ij,\\ i\\ne j}\\}",
      fetchImpl,
    });

    const graphState = useTheoryBadgeGraphPanelStore.getState();
    const runState = useTheoryCompoundRunStore.getState();
    const selectedRow = selectActiveTheoryRunRow(runState);

    expect(graphState.activeAtlasLensId).toBe("warp_gr_nhm2");
    expect(graphState.selectedWarpGrNhm2GroupId).toBe("warp.nhm2.diagnostic_path");
    expect(runState.activeTheoryRun?.targetBadgeIds).toContain("nhm2.tensor.same_chart_full_tensor");
    expect(selectedRow?.badgeId).toBe("nhm2.tensor.same_chart_full_tensor");
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/helix/theory/compound-run",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("emits same-chart full tensor as runtime artifact context without calculator payload overreach", async () => {
    const contexts: Parameters<NonNullable<Parameters<typeof executeDocEquationAction>[0]["emitContextArtifact"]>>[0][] = [];

    await executeDocEquationAction({
      currentPath: NHM2_WHITEPAPER,
      actionId: "open-same-chart-full-tensor-artifact",
      latex: "\\mathcal{T}^{\\rm same-chart}_{\\rm full}=\\{T_{00},T_{0i},T_{ii},T_{ij,\\ i\\ne j}\\}",
      fetchImpl: vi.fn(async () => ({ ok: false }) as Response),
      emitContextArtifact: (artifact) => contexts.push(artifact),
    });

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      contractVersion: "doc_equation_context/v1",
      equationId: "nhm2-same-chart-full-tensor-ledger",
      uri: "workspace://workspace/docs/research/nhm2-current-status-whitepaper.md#nhm2-same-chart-full-tensor-ledger",
      anchor: "nhm2-same-chart-full-tensor-ledger",
      actionId: "open-same-chart-full-tensor-artifact",
      actionKind: "artifact_backed_theory_run",
      preferredBadgeId: "nhm2.tensor.same_chart_full_tensor",
      commentaryHints: {
        scope: "runtime_artifact",
      },
    });
    expect(contexts[0]?.calculatorPayloadRef).toBeUndefined();
    expect(contexts[0]?.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rel: "supports_doc_section",
          docPath: NHM2_WHITEPAPER,
          anchor: "57-workstation-equation-anchors",
        }),
        expect.objectContaining({ rel: "opens_panel", panelId: "theory-badge-graph" }),
        expect.objectContaining({
          rel: "opens_runtime_artifact",
          artifactId: "nhm2.tensor.same_chart_full_tensor",
          artifactKind: "runtime_artifact",
        }),
      ]),
    );
    expect(contexts[0]?.commentaryHints.prohibitedClaims).toEqual(
      expect.arrayContaining(["validated", "viable", "certified transport"]),
    );
  });

  it("emits wall residual calculator action as scalar replay context", async () => {
    const contexts: ReturnType<typeof buildDocEquationContextArtifact>[] = [];

    await executeDocEquationAction({
      currentPath: NHM2_WHITEPAPER,
      actionId: "load-wall-t00-source-residual-calculator",
      latex: "R_{{\\rm wall},T00}=T00_{{\\rm wall},{\\rm required}}-T00_{{\\rm wall},{\\rm available}}.",
      emitContextArtifact: (artifact) => contexts.push(artifact),
    });

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      equationId: "nhm2-wall-t00-source-residual",
      actionKind: "calculator_ingest",
      calculatorPayloadRef: {
        badgeId: "nhm2.closure.wall_t00_source_residual",
        payloadId: "wall_t00_source_residual_payload",
      },
      commentaryHints: {
        scope: "scalar_replay",
      },
    });
    expect(contexts[0]?.openedPanels).toEqual(["scientific-calculator"]);
  });

  it("emits frozen 447-layer material gate as bounded runtime context without scalar replay", async () => {
    const entry = readNhm2GeneratedEntry("nhm2-frozen-447-material-evidence-gate");
    const contexts: ReturnType<typeof buildDocEquationContextArtifact>[] = [];

    expect(entry.actions.some((action) => action.calculatorPayloadRef)).toBe(false);

    await executeDocEquationAction({
      currentPath: NHM2_WHITEPAPER,
      actionId: "open-frozen-447-material-evidence-gate",
      latex: entry.latex,
      fetchImpl: vi.fn(async () => ({ ok: false }) as Response),
      emitContextArtifact: (artifact) => contexts.push(artifact),
    });

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      equationId: "nhm2-frozen-447-material-evidence-gate",
      actionKind: "artifact_backed_theory_run",
      preferredBadgeId: "nhm2.experimental.tile_source_physical_validation_plan",
      commentaryHints: {
        scope: "runtime_artifact",
      },
    });
    expect(contexts[0]?.calculatorPayloadRef).toBeUndefined();
    expect(contexts[0]?.actionClaimBoundaryNote).toMatch(/evidence-admission and architecture-compatibility gate/i);
    expect(contexts[0]?.actionClaimBoundaryNote).toMatch(/not material validation/i);
  });

  it("emits 0p7000 campaign frontier as runtime evidence context with claim locks closed", async () => {
    const entry = readNhm2GeneratedEntry("nhm2-0p7000-profile-campaign-frontier");
    const contexts: ReturnType<typeof buildDocEquationContextArtifact>[] = [];

    await executeDocEquationAction({
      currentPath: NHM2_WHITEPAPER,
      actionId: "open-0p7000-profile-campaign-frontier",
      latex: entry.latex,
      fetchImpl: vi.fn(async () => ({ ok: false }) as Response),
      emitContextArtifact: (artifact) => contexts.push(artifact),
    });

    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      equationId: "nhm2-0p7000-profile-campaign-frontier",
      actionKind: "artifact_backed_theory_run",
      preferredBadgeId: "nhm2.formal.diagnostic_campaign_admissible",
      commentaryHints: {
        scope: "runtime_artifact",
      },
    });
    expect(contexts[0]?.calculatorPayloadRef).toBeUndefined();
    expect(contexts[0]?.actionClaimBoundaryNote).toMatch(/diagnostic campaign-admissible profile/i);
    expect(contexts[0]?.actionClaimBoundaryNote).toMatch(/claims remain locked/i);
  });
});
