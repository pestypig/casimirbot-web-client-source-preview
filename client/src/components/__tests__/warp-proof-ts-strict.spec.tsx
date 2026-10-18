// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useProofPackMock = vi.fn();
const useMathStageGateMock = vi.fn();
const useGrConstraintContractMock = vi.fn();
const useNhm2SolveStateMock = vi.fn();

vi.mock("@/hooks/useProofPack", () => ({
  useProofPack: (...args: unknown[]) => useProofPackMock(...args),
}));

vi.mock("@/hooks/useMathStageGate", () => ({
  useMathStageGate: (...args: unknown[]) => useMathStageGateMock(...args),
}));

vi.mock("@/hooks/useGrConstraintContract", () => ({
  useGrConstraintContract: (...args: unknown[]) => useGrConstraintContractMock(...args),
}));

vi.mock("@/hooks/useNhm2SolveState", () => ({
  useNhm2SolveState: (...args: unknown[]) => useNhm2SolveStateMock(...args),
}));

import { FrontProofsLedger } from "@/components/FrontProofsLedger";
import { WarpProofPanel } from "@/components/WarpProofPanel";

const makeProofPack = () =>
  ({
    values: {
      ts_ratio: { value: 50, source: "pipeline.TS_ratio", proxy: false },
      zeta: { value: 0.5, source: "pipeline.zeta", proxy: false },
      ford_roman_ok: { value: true, source: "pipeline.fordRomanCompliance", proxy: false },
      ts_metric_derived: {
        value: true,
        source: "derived:ts_metric_derived",
        proxy: false,
      },
      ts_metric_source: {
        value: "warp.metricAdapter+clocking",
        source: "derived:ts_metric_source",
        proxy: false,
      },
      ts_metric_reason: {
        value: "TS_ratio from proper-distance timing with explicit chart contract",
        source: "derived:ts_metric_reason",
        proxy: false,
      },
      qi_strict_mode: {
        value: true,
        source: "guardrail.qi.strict.mode",
        proxy: false,
      },
      qi_strict_ok: {
        value: true,
        source: "guardrail.qi.strict.ok",
        proxy: false,
      },
      qi_strict_reason: {
        value: "strict metric source satisfied",
        source: "guardrail.qi.strict.reason",
        proxy: false,
      },
      qi_rho_source: {
        value: "warp.metric.T00.natario.shift",
        source: "pipeline.qi.rhoSource",
        proxy: false,
      },
      qi_metric_derived: {
        value: true,
        source: "pipeline.qi.metricDerived",
        proxy: false,
      },
      qi_metric_source: {
        value: "warp.metricAdapter+clocking",
        source: "pipeline.qi.metricSource",
        proxy: false,
      },
      qi_metric_reason: {
        value: "TS_ratio from proper-distance timing with explicit chart contract",
        source: "pipeline.qi.metricReason",
        proxy: false,
      },
    },
  }) as any;

const makeNhm2SolveState = () =>
  ({
    state: {
      closureStack: {
        sameChartFullTensor: {
          available: true,
          fullTensorComplete: false,
          missingComponentIds: ["T0x", "Txy"],
        },
        sourceSideSameBasisTensorAuthority: {
          available: true,
          hasWallAuthority: false,
          allRequiredRegionsAuthoritative: false,
          blockers: ["source_side_full_tensor_components_missing"],
        },
        wallSourceClosure: {
          available: true,
          pass: false,
          relativeResidual: 0.12,
          blockers: ["wall residual outside tolerance"],
        },
        observerRobustEnergyConditions: {
          available: true,
          robustCheckComplete: false,
          eulerianOnly: true,
          anyViolation: false,
        },
        qeiWorldlineDossier: {
          available: true,
          dossierComplete: false,
          hasWallWorldline: false,
          anyProxy: true,
        },
        casimirMaterialReceipt: {
          available: true,
          status: "ideal_scalar_only",
          idealScalarOnly: true,
        },
        natarioInvariantAudit: {
          available: true,
          status: "review",
          thetaFlatnessStatus: "pass",
          invariantStatus: "missing",
        },
      },
      claimAdmission: {
        available: true,
        status: "diagnostic_closure_candidate",
        diagnosticClosurePassed: true,
        numericalReliabilityPassed: false,
        physicalClaimAllowed: false,
        transportClaimAllowed: false,
        blockers: ["reference_run_validation_not_pass:review"],
      },
    },
    pipelineQuery: {
      data: {
        nhm2SameChartFullTensor: {
          contractVersion: "nhm2_same_chart_full_tensor/v1",
        },
        nhm2WallSourceClosure: {
          contractVersion: "nhm2_wall_source_closure/v1",
          required: { tensorRef: "metric-required-wall-t00" },
        },
        nhm2SourceSideSameBasisTensorAuthority: {
          contractVersion: "nhm2_source_side_same_basis_tensor_authority/v1",
          summary: {
            hasWallAuthority: false,
            allRequiredRegionsAuthoritative: false,
          },
          regions: [
            {
              regionId: "wall",
              status: "blocked",
              blockers: ["source_side_full_tensor_components_missing"],
            },
          ],
        },
        nhm2ObserverRobustEnergyConditions: {
          contractVersion: "nhm2_observer_robust_energy_conditions/v1",
          tensorRef: "same-chart-full-tensor",
          observerFamilies: [{ familyId: "eulerian", status: "proxy" }],
          summary: { eulerianOnly: true },
        },
        nhm2QeiWorldlineDossier: {
          contractVersion: "nhm2_qei_worldline_dossier/v1",
          worldlines: [
            {
              sampledRho: { provenanceRef: "qei-rho-sample" },
              bound: { provenanceRef: "ford-roman-bound" },
            },
          ],
        },
        casimirMaterialReceipt: {
          contractVersion: "casimir_material_receipt/v1",
          tileBatchId: "tile-batch-proxy",
          status: "ideal_scalar_only",
        },
        nhm2NatarioInvariantAudit: {
          contractVersion: "nhm2_natario_invariant_audit/v1",
          stability: { convergenceStatus: "not_run" },
        },
        nhm2FullSolveClaimAdmission: {
          contractVersion: "nhm2_full_solve_claim_admission/v1",
          admission: {
            status: "diagnostic_closure_candidate",
            diagnosticClosurePassed: true,
            numericalReliabilityPassed: false,
          },
          blockers: ["reference_run_validation_not_pass:review"],
        },
      },
    },
  }) as any;

describe("TS strict proof-pack rendering", () => {
  beforeEach(() => {
    useProofPackMock.mockReturnValue({
      data: makeProofPack(),
      isLoading: false,
      error: null,
    });
    useMathStageGateMock.mockReturnValue({
      pending: false,
      stage: "diagnostic",
      ok: true,
      reasons: [],
      modules: [],
    });
    useGrConstraintContractMock.mockReturnValue({
      data: null,
      isFetching: false,
      isError: false,
    });
    useNhm2SolveStateMock.mockReturnValue(makeNhm2SolveState());
  });

  afterEach(() => {
    cleanup();
    useProofPackMock.mockReset();
    useMathStageGateMock.mockReset();
    useGrConstraintContractMock.mockReset();
    useNhm2SolveStateMock.mockReset();
  });

  it("shows ts strict row in FrontProofsLedger", () => {
    render(<FrontProofsLedger />);
    expect(screen.getByText("TS strict congruence")).toBeDefined();
    expect(screen.getByText(/source = warp\.metricAdapter\+clocking/i)).toBeDefined();
    expect(screen.getByText("QI metric path")).toBeDefined();
  });

  it("shows ts strict fields in WarpProofPanel CL3 section", () => {
    render(<WarpProofPanel />);
    expect(screen.getByText("ts_metric_source")).toBeDefined();
    expect(screen.getAllByText("warp.metricAdapter+clocking").length).toBeGreaterThan(0);
  });

  it("shows NHM2 closure stack rows with diagnostic claim-boundary copy", () => {
    const { container } = render(<WarpProofPanel />);

    expect(screen.getByText("Closure Stack")).toBeDefined();
    expect(screen.getByText("Same-chart full tensor")).toBeDefined();
    expect(screen.getByText("Source-side same-basis tensor authority")).toBeDefined();
    expect(screen.getByText("Wall T00 closure")).toBeDefined();
    expect(screen.getByText("Observer-robust energy conditions")).toBeDefined();
    expect(screen.getByText("QEI worldline dossier")).toBeDefined();
    expect(screen.getByText("Casimir material receipt")).toBeDefined();
    expect(screen.getByText(/Nat.rio invariant audit/i)).toBeDefined();
    expect(screen.getByText("missing components: T0x, Txy")).toBeDefined();
    expect(screen.getByText("source_side_full_tensor_components_missing")).toBeDefined();
    expect(screen.getByText("wall residual outside tolerance")).toBeDefined();
    expect(screen.getByText("Observer scope: Eulerian only.")).toBeDefined();
    expect(screen.getByText("Ideal Casimir scalar budget is not material-receipted.")).toBeDefined();
    expect(screen.getByText("Zero expansion is separate from curvature, stability, and safety diagnostics.")).toBeDefined();
    expect(screen.getByText("Claim Admission")).toBeDefined();
    expect(screen.getByText("reference_run_validation_not_pass:review")).toBeDefined();
    expect(screen.getByText("Diagnostic closure candidate; numerical reliability and external evidence still gate claims.")).toBeDefined();
    expect(screen.getByText("physical claim")).toBeDefined();
    expect(screen.getByText("transport claim")).toBeDefined();
    expect(container.textContent).not.toMatch(/validated|viable|certified transport/i);
  });

});
