// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ScientificCalculatorPanel from "@/components/panels/ScientificCalculatorPanel";
import { runScientificSolve } from "@/lib/scientific-calculator/solver";
import { useScientificCalculatorStore } from "@/store/useScientificCalculatorStore";
import { useTheoryCompoundRunStore } from "@/store/useTheoryCompoundRunStore";
import { useWorkstationSessionMemoryStore } from "@/store/useWorkstationSessionMemoryStore";
import { buildNhm2TheoryBadgeGraphV1 } from "@shared/theory/nhm2-theory-badges";
import { buildTheoryCalculatorLoadout } from "@shared/theory/theory-calculator-loadout";
import { buildTheoryCompoundRun } from "@shared/theory/theory-compound-run-builder";
import { buildTheoryRuntimeReceiptV1 } from "@shared/contracts/theory-runtime-receipt.v1";
import { buildTheoryCompoundRunV1, type TheoryCompoundRunRowV1 } from "@shared/contracts/theory-compound-run.v1";
import { buildTheoryRuntimeRunRequestV1 } from "@shared/contracts/theory-runtime-run-request.v1";
import { runTheoryScalarSweep } from "@shared/theory/theory-scalar-sweep-runner";

vi.mock("@/components/panels/ScientificCalculatorLiveSourceControls", () => ({
  ScientificCalculatorLiveSourceControls: () => <div data-testid="live-source-controls" />,
}));

const graph = buildNhm2TheoryBadgeGraphV1();
const storageData: Record<string, string> = {};
const FORBIDDEN_CLAIM_PATTERNS = [
  /validated propulsion/i,
  /working warp drive/i,
  /certified transport solution/i,
  /closed-loop solved transport result/i,
  /physical mechanism confirmed/i,
  /\bQEI passed\b/i,
];

function expectNoForbiddenClaimText(text: string | null | undefined): void {
  for (const pattern of FORBIDDEN_CLAIM_PATTERNS) {
    expect(text ?? "").not.toMatch(pattern);
  }
}

const localStorageStub = {
  getItem: (key: string) => storageData[key] ?? null,
  setItem: (key: string, value: string) => {
    storageData[key] = value;
  },
  removeItem: (key: string) => {
    delete storageData[key];
  },
};

function buildMixedTheoryRun() {
  return buildTheoryCompoundRun({
    graph,
    badgeIds: [
      "physics.gr.einstein_field_equation",
      "nhm2.energy_condition.diagnostic_gate",
      "nhm2.claim_boundary.diagnostic_only",
    ],
    mode: "selected_badges",
    generatedAt: "2026-05-29T00:00:00.000Z",
  });
}

function buildScalarTheoryRun() {
  return buildTheoryCompoundRun({
    graph,
    badgeIds: ["nhm2.source.energy_density_proxy"],
    mode: "selected_badges",
    generatedAt: "2026-05-29T00:00:00.000Z",
  });
}

function buildSweepTheoryRun() {
  const sweep = runTheoryScalarSweep({
    expression: "y = x*2",
    graphId: graph.graphId,
    targetBadgeIds: ["solar.spectrum.photon_energy"],
    samplePolicy: { kind: "grid" },
    variables: [{ symbol: "x", unit: "J", distribution: { kind: "samples", values: [1, 2, 3] } }],
    generatedAt: "2026-05-29T00:00:00.000Z",
    claimBoundaryNotes: ["Diagnostic-only scalar sweep; no validation claim."],
  });
  const row: TheoryCompoundRunRowV1 = {
    id: "row:sweep:test",
    index: 1,
    badgeId: "solar.spectrum.photon_energy",
    badgeTitle: "Solar Photon Energy",
    title: "Photon energy sweep",
    kind: "sweep",
    displayLatex: "y = 2x",
    expression: "y = x*2",
    status: "computed",
    solver: "sweep_runner",
    sourcePath: `theory://${graph.graphId}/solar.spectrum.photon_energy/sweep`,
    dependsOn: [],
    calculatorArtifactV1: null,
    runtimeMathTraceV1: null,
    runtimeReceiptV1: null,
    runtimeRunRequestV1: null,
    sweepRunV1: sweep,
    evidenceRefs: [],
    claimBoundaryNotes: ["Diagnostic-only scalar sweep; no validation claim."],
    warnings: [],
  };
  return buildTheoryCompoundRunV1({
    generatedAt: "2026-05-29T00:00:00.000Z",
    runId: "theory-compound:sweep-test",
    graphId: graph.graphId,
    targetBadgeIds: ["solar.spectrum.photon_energy"],
    source: { kind: "manual", label: "sweep test" },
    rows: [row],
  });
}

function buildRuntimeRequestTheoryRun() {
  const request = buildTheoryRuntimeRunRequestV1({
    generatedAt: "2026-05-29T00:00:00.000Z",
    requestId: "request:warp-full-solve",
    runtimeId: "warp.full_solve.campaign",
    graphId: graph.graphId,
    badgeIds: ["nhm2.closure.source_residual"],
    args: {},
    requestedScope: "full",
    status: "created",
    createdAt: "2026-05-29T00:00:00.000Z",
    updatedAt: "2026-05-29T00:00:00.000Z",
    heartbeat: {
      updatedAt: "2026-05-29T00:00:00.000Z",
      stage: "manifest_created",
      message: "Runtime request manifest created; no backend runtime executed.",
      progress: 0,
    },
    outputArtifactGlobs: ["artifacts/research/full-solve/**/*.json"],
    claimBoundary: {
      currentTier: "diagnostic",
      maximumTier: "reduced_order",
      promotionAllowed: false,
      promotionRequires: ["certificate integrity receipt"],
    },
  });
  const row: TheoryCompoundRunRowV1 = {
    id: "row:runtime-request:test",
    index: 1,
    badgeId: "nhm2.closure.source_residual",
    badgeTitle: "Source Residual",
    title: "Warp full-solve request",
    kind: "runtime",
    displayLatex: null,
    expression: null,
    status: "pending",
    solver: "backend_runtime",
    sourcePath: `theory://${graph.graphId}/nhm2.closure.source_residual/runtime-request`,
    dependsOn: [],
    calculatorArtifactV1: null,
    runtimeMathTraceV1: null,
    runtimeReceiptV1: null,
    runtimeRunRequestV1: request,
    sweepRunV1: null,
    evidenceRefs: [],
    claimBoundaryNotes: ["Manifest-only runtime request; no validation claim."],
    warnings: [],
  };
  return buildTheoryCompoundRunV1({
    generatedAt: "2026-05-29T00:00:00.000Z",
    runId: "theory-compound:runtime-request-test",
    graphId: graph.graphId,
    targetBadgeIds: ["nhm2.closure.source_residual"],
    source: { kind: "manual", label: "runtime request test" },
    rows: [row],
  });
}

describe("ScientificCalculatorPanel theory run workbench", () => {
  beforeEach(() => {
    for (const key of Object.keys(storageData)) delete storageData[key];
    vi.stubGlobal("localStorage", localStorageStub);
    useTheoryCompoundRunStore.getState().clearTheoryRun();
    useScientificCalculatorStore.getState().clear({ source: "panel" });
    useWorkstationSessionMemoryStore.getState().clearDraft("scientific-calculator:input");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("preserves the scalar calculator smoke path when no theory run is loaded", () => {
    render(<ScientificCalculatorPanel />);

    expect(screen.getByText("LaTeX / Expression Input")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Solve" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Scalar Workbench" })).toHaveAttribute("aria-selected", "true");
  });

  it("projects the latest structured calculator receipt in the panel", () => {
    act(() => {
      useScientificCalculatorStore.getState().recordCalculatorReceipt({
        receipt_id: "scientific-calculator-receipt:panel-test",
        expression_template_id: "template:rho",
        status: "template_only",
        expression: "rho = E / V",
        latex: "\\rho = E / V",
        variables: [
          { symbol: "E", value: null, unit: "J" },
          { symbol: "V", value: null, unit: "m^3" },
        ],
        dimensional_check_status: "missing_units",
        missing_bindings: ["variable:E", "variable:V"],
        blockers: ["missing_variable_bindings"],
        provenance_refs: ["theory-reflection:test"],
      });
    });

    render(<ScientificCalculatorPanel />);

    const receiptCard = screen.getByTestId("scientific-calculator-receipt-card");
    expect(receiptCard).toHaveTextContent("scientific-calculator-receipt:panel-test");
    expect(receiptCard).toHaveTextContent("template_only");
    expect(receiptCard).toHaveTextContent("\\rho = E / V");
    expect(receiptCard).toHaveTextContent("variable:E; variable:V; missing_variable_bindings");
  });

  it("shows equation intake classification without solving symbolic prefill", async () => {
    render(<ScientificCalculatorPanel />);

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "E = h * f" },
    });

    const intake = await screen.findByTestId("scientific-calculator-intake");
    expect(within(intake).getByText("symbolic_equation")).toBeInTheDocument();
    expect(within(intake).getByText("paper_equation_binder")).toBeInTheDocument();
    expect(within(intake).getByText("missing_variable_bindings")).toBeInTheDocument();
    expect(within(intake).getByText("Missing bindings: f")).toBeInTheDocument();
    expect(within(intake).getByText("Variable binder")).toBeInTheDocument();
    expect(within(intake).getByText("No numeric evidence bound")).toBeInTheDocument();
    expect(within(intake).getByText("missing")).toBeInTheDocument();
    expect(useScientificCalculatorStore.getState().lastSolve).toBeNull();
  });

  it("shows the Theory Run section when a compound theory run is loaded", async () => {
    const run = buildMixedTheoryRun();
    useTheoryCompoundRunStore.getState().loadTheoryRun(run);

    render(<ScientificCalculatorPanel />);

    const theorySection = await screen.findByTestId("scientific-calculator-theory-run-section");
    expect(theorySection).toBeInTheDocument();
    expect(within(theorySection).getByText(/rows \/ .* scalar/i)).toBeInTheDocument();
    expect(within(theorySection).getAllByText("Einstein field equation").length).toBeGreaterThan(0);
    expect(within(theorySection).getByRole("button", { name: "Solve Scalar Rows" })).toBeInTheDocument();
    expect(within(theorySection).getByRole("button", { name: "Build Runtime Traces" })).toBeInTheDocument();
    expect(within(theorySection).getByRole("button", { name: "Solve Available" })).toBeInTheDocument();
  });

  it("promotes compound scalar calculator work without duplicating theory work", async () => {
    const run = buildScalarTheoryRun();
    useTheoryCompoundRunStore.getState().loadTheoryRun(run);

    render(<ScientificCalculatorPanel />);

    const theorySection = await screen.findByTestId("scientific-calculator-theory-run-section");
    const scalarSection = screen.getByTestId("scientific-calculator-scalar-section");
    expect(theorySection).toHaveStyle({ order: "0" });
    expect(scalarSection).toHaveStyle({ order: "1" });

    act(() => {
      useScientificCalculatorStore.getState().ingestLatex("z = 2", {
        sourcePath: "agent://calculator",
        source: "workstation_action",
        compoundRunId: run.runId,
        targetWorkbench: "scalar",
      });
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("z = 2")).toBeInTheDocument();
      expect(scalarSection).toHaveStyle({ order: "0" });
      expect(theorySection).toHaveStyle({ order: "1" });
    });
    expect(screen.getAllByTestId("scientific-calculator-theory-run-section")).toHaveLength(1);
    expect(screen.getAllByTestId("scientific-calculator-scalar-section")).toHaveLength(1);
  });

  it("clears stale theory context when a standalone workstation solve arrives", async () => {
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    useTheoryCompoundRunStore.getState().loadTheoryRun(buildScalarTheoryRun());

    try {
      render(<ScientificCalculatorPanel />);

      const theorySection = await screen.findByTestId("scientific-calculator-theory-run-section");
      const scalarSection = screen.getByTestId("scientific-calculator-scalar-section");
      expect(theorySection).toHaveStyle({ order: "0" });
      expect(scalarSection).toHaveStyle({ order: "1" });

      act(() => {
        useScientificCalculatorStore.getState().setSolveResult(runScientificSolve("2*(3+4)", false), {
          actionId: "solve_expression",
          source: "workstation_action",
        });
      });

      await waitFor(() => {
        expect(screen.getByDisplayValue("2*(3+4)")).toBeInTheDocument();
        expect(screen.getByTestId("scientific-calculator-scalar-section")).toHaveStyle({ order: "0" });
        expect(screen.queryByTestId("scientific-calculator-theory-run-section")).toBeNull();
      });
      expect(useTheoryCompoundRunStore.getState().activeTheoryRun).toBeNull();
      await waitFor(() => {
        expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
      });
    } finally {
      if (originalScrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
          configurable: true,
          value: originalScrollIntoView,
        });
      } else {
        delete (HTMLElement.prototype as Partial<Pick<HTMLElement, "scrollIntoView">>).scrollIntoView;
      }
    }
  });

  it("scrolls the selected theory run row into view", async () => {
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    const run = buildMixedTheoryRun();
    const targetRow = run.rows[run.rows.length - 1];
    useTheoryCompoundRunStore.getState().loadTheoryRun(run);
    useTheoryCompoundRunStore.getState().selectTheoryRunRow(targetRow.id);

    try {
      render(<ScientificCalculatorPanel />);

      await waitFor(() => {
        const selectedRow = document.querySelector('[data-selected-theory-run-row="true"]');
        expect(selectedRow).toHaveAttribute("data-theory-run-row-id", targetRow.id);
      });
      await waitFor(() => {
        expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
      });
    } finally {
      if (originalScrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
          configurable: true,
          value: originalScrollIntoView,
        });
      } else {
        delete (HTMLElement.prototype as Partial<Pick<HTMLElement, "scrollIntoView">>).scrollIntoView;
      }
    }
  });

  it("organizes a badge calculator loadout under the Theory Run section", async () => {
    const loadout = buildTheoryCalculatorLoadout({
      graph,
      badgeIds: ["nhm2.source.energy_density_proxy"],
      mode: "selected_badges",
      variableBindings: {
        E: 12,
        V: 3,
      },
      includeContextItems: true,
    });
    const scientificState = useScientificCalculatorStore.getState();
    scientificState.setTheoryLoadout(loadout);
    scientificState.loadTheoryLoadoutItem(1);

    render(<ScientificCalculatorPanel />);

    const theorySection = await screen.findByTestId("scientific-calculator-theory-run-section");
    expect(screen.getByRole("tab", { name: "Theory Run" })).toHaveAttribute("aria-selected", "true");
    expect(within(theorySection).getByText(/scalar rows/i)).toBeInTheDocument();
    expect(within(theorySection).getByText("Energy density proxy")).toBeInTheDocument();
    expect(within(theorySection).getByText("rho = 12 / 3")).toBeInTheDocument();
    expect(screen.queryByText("Theory Loadout")).not.toBeInTheDocument();
    expect(screen.getByText(/source:/i)).toBeInTheDocument();
    expect(screen.getByTitle(/Energy density proxy/)).toBeInTheDocument();
  });

  it("solves scalar rows in the loaded theory run", async () => {
    useTheoryCompoundRunStore.getState().loadTheoryRun(buildScalarTheoryRun());

    render(<ScientificCalculatorPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Solve Scalar Rows" }));

    await waitFor(() => {
      const run = useTheoryCompoundRunStore.getState().activeTheoryRun;
      expect(run?.summary.solvedCount).toBeGreaterThan(0);
      expect(run?.rows.some((row) => row.status === "solved" && row.calculatorArtifactV1)).toBe(true);
    });
  });

  it("builds runtime traces without backend execution claims", async () => {
    useTheoryCompoundRunStore.getState().loadTheoryRun(buildMixedTheoryRun());

    render(<ScientificCalculatorPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Build Runtime Traces" }));

    await waitFor(() => {
      const run = useTheoryCompoundRunStore.getState().activeTheoryRun;
      expect(run?.summary.computedCount).toBeGreaterThan(0);
      expect(run?.rows.some((row) => /no backend runtime executed/i.test(row.warnings.join(" ")))).toBe(true);
    });
    expect(screen.getAllByText("Static reference").length).toBeGreaterThan(0);
  });

  it("shows tensor trace steps in the Tensor / Runtime Workbench", async () => {
    useTheoryCompoundRunStore.getState().loadTheoryRun(buildMixedTheoryRun());

    render(<ScientificCalculatorPanel />);
    fireEvent.click(screen.getByRole("tab", { name: "Tensor / Runtime Workbench" }));

    const runtimeSection = await screen.findByTestId("scientific-calculator-runtime-section");
    expect(within(runtimeSection).getByText("Metric Input")).toBeInTheDocument();
    expect(within(runtimeSection).getByText("Christoffel Symbols")).toBeInTheDocument();
    expect(within(runtimeSection).getByText("Source residual")).toBeInTheDocument();
  });

  it("promotes a standalone runtime trace to the Tensor / Runtime Workbench", async () => {
    const runtimeTrace = buildMixedTheoryRun().rows.find((row) => row.runtimeMathTraceV1)?.runtimeMathTraceV1;
    expect(runtimeTrace).toBeTruthy();
    if (!runtimeTrace) return;
    useTheoryCompoundRunStore.getState().setActiveRuntimeTrace(runtimeTrace);

    render(<ScientificCalculatorPanel />);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Tensor / Runtime Workbench" })).toHaveAttribute("aria-selected", "true");
    });
    const runtimeSection = await screen.findByTestId("scientific-calculator-runtime-section");
    expect(runtimeSection).toHaveStyle({ order: "0" });
    expect(within(runtimeSection).getByText(runtimeTrace.traceId)).toBeInTheDocument();
  });

  it("loads a runtime scalar cut into the scalar calculator input", async () => {
    useTheoryCompoundRunStore.getState().loadTheoryRun(buildMixedTheoryRun());

    render(<ScientificCalculatorPanel />);
    fireEvent.click(screen.getByRole("tab", { name: "Tensor / Runtime Workbench" }));
    fireEvent.click(await screen.findByRole("button", { name: "Load Scalar Cut" }));

    expect(useScientificCalculatorStore.getState().currentLatex).toBe(
      "R_source = source_required - source_available",
    );
    expect(screen.getByDisplayValue("R_source = source_required - source_available")).toBeInTheDocument();
  });

  it("shows claim boundary warnings in the Theory Run section", async () => {
    useTheoryCompoundRunStore.getState().loadTheoryRun(buildMixedTheoryRun());

    render(<ScientificCalculatorPanel />);

    const theorySection = await screen.findByTestId("scientific-calculator-theory-run-section");
    expect(within(theorySection).getAllByText(/promotion not allowed/i).length).toBeGreaterThan(0);
    expect(within(theorySection).getAllByText(/validation claim not allowed/i).length).toBeGreaterThan(0);
  });

  it("displays explicit boundary rows without forbidden claim language", async () => {
    useTheoryCompoundRunStore.getState().loadTheoryRun(buildMixedTheoryRun());

    render(<ScientificCalculatorPanel />);

    const theorySection = await screen.findByTestId("scientific-calculator-theory-run-section");
    expect(within(theorySection).getAllByText("boundary").length).toBeGreaterThan(0);
    expect(within(theorySection).getAllByText(/Diagnostic-only/i).length).toBeGreaterThan(0);
    expect(within(theorySection).getAllByText(/diagnostic-only/i).length).toBeGreaterThan(0);
    expectNoForbiddenClaimText(theorySection.textContent);
  });

  it("renders evidence refs and runtime receipt summaries on theory run rows", async () => {
    const run = buildMixedTheoryRun();
    const evidenceRow = run.rows.find((row) => row.evidenceRefs && row.evidenceRefs.length > 0);
    expect(evidenceRow).toBeTruthy();
    if (evidenceRow) {
      evidenceRow.status = "blocked";
      evidenceRow.runtimeReceiptV1 = buildTheoryRuntimeReceiptV1({
        generatedAt: "2026-05-29T00:00:00.000Z",
        receiptId: "receipt:test",
        runtimeId: "warp.full_solve.campaign",
        graphId: run.graphId,
        badgeIds: [evidenceRow.badgeId],
        command: null,
        args: {},
        status: "completed",
        outputs: {
          artifacts: ["artifacts/research/full-solve/run.json"],
          scalars: {},
          units: {},
          gates: {
            certificate_integrity: "not_ready",
          },
          missingSignals: ["missing_certificate"],
          warnings: ["NHM2/warp evidence is fail-closed because no certificate artifact was found."],
        },
        provenance: {
          gitSha: null,
          startedAt: null,
          completedAt: "2026-05-29T00:00:00.000Z",
          durationMs: null,
        },
        claimBoundary: {
          currentTier: "diagnostic",
          maximumTier: "reduced_order",
          promotionAllowed: false,
          promotionBlockedBy: ["missing_certificate"],
        },
      });
    }
    useTheoryCompoundRunStore.getState().loadTheoryRun(run);

    render(<ScientificCalculatorPanel />);

    const theorySection = await screen.findByTestId("scientific-calculator-theory-run-section");
    expect(within(theorySection).getByTestId("theory-run-aggregate-status")).toHaveTextContent(/Aggregate theory run\s*loaded/i);
    expect(within(theorySection).getAllByText("Evidence refs").length).toBeGreaterThan(0);
    expect(within(theorySection).getByText("Runtime receipt")).toBeInTheDocument();
    expect(within(theorySection).getByText("Artifact referenced")).toBeInTheDocument();
    expect(within(theorySection).getByText("Blocked by missing evidence")).toBeInTheDocument();
    expect(within(theorySection).getByText("warp.full_solve.campaign")).toBeInTheDocument();
    expect(within(theorySection).getByText(/artifact: artifacts\/research\/full-solve\/run\.json/)).toBeInTheDocument();
    expect(within(theorySection).getByText(/fail-closed/)).toBeInTheDocument();
    expect(within(theorySection).getByTestId("runtime-status-lamp-aggregate")).toHaveAttribute("data-status", "blocked");
    expect(within(theorySection).getByTestId("runtime-status-lamp-evidence")).toHaveAttribute("data-status", "unknown");
    expect(within(theorySection).getByTestId("runtime-status-lamp-provenance")).toHaveAttribute("data-status", "unbound");
    expect(within(theorySection).getByTestId("runtime-status-lamp-certificate")).toHaveAttribute("data-status", "not_ready");
    expect(within(theorySection).getByText("certificate_integrity: not_ready")).toBeInTheDocument();
  });

  it("renders sweep summaries inside the Theory Run section", async () => {
    useTheoryCompoundRunStore.getState().loadTheoryRun(buildSweepTheoryRun());

    render(<ScientificCalculatorPanel />);

    const theorySection = await screen.findByTestId("scientific-calculator-theory-run-section");
    expect(within(theorySection).getByText("Sweep summary")).toBeInTheDocument();
    expect(within(theorySection).getByText("ok: 3")).toBeInTheDocument();
    expect(within(theorySection).getByText("samples: 3")).toBeInTheDocument();
    expect(within(theorySection).getByText(/mean: 4/)).toBeInTheDocument();
    expect(within(theorySection).getAllByText(/Diagnostic-only scalar sweep/).length).toBeGreaterThan(0);
  });

  it("renders manifest-only runtime run requests inside the Theory Run section", async () => {
    useTheoryCompoundRunStore.getState().loadTheoryRun(buildRuntimeRequestTheoryRun());

    render(<ScientificCalculatorPanel />);

    const theorySection = await screen.findByTestId("scientific-calculator-theory-run-section");
    expect(within(theorySection).getByText("Runtime request")).toBeInTheDocument();
    expect(within(theorySection).getByText("manifest created")).toBeInTheDocument();
    expect(within(theorySection).getByText("warp.full_solve.campaign")).toBeInTheDocument();
    expect(within(theorySection).getByText(/no backend runtime executed/i)).toBeInTheDocument();
    expect(within(theorySection).getByText("promotion: blocked")).toBeInTheDocument();
    expectNoForbiddenClaimText(theorySection.textContent);
  });
});
