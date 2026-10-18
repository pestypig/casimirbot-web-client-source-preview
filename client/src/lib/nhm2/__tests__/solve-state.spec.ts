import { describe, expect, it } from "vitest";
import { buildNhm2SolveState } from "@/lib/nhm2/solve-state";
import type { GrConstraintContract, GrEvaluation, ProofPack } from "@shared/schema";

const makeAuthorityInputs = () => {
  const proofPack = {
    values: {
      hull_Lx_m: { value: 1007, proxy: false },
      hull_Ly_m: { value: 264, proxy: false },
      hull_Lz_m: { value: 173, proxy: false },
      metric_adapter_family: { value: "natario_like_low_expansion", proxy: false },
      metric_chart_contract_status: { value: "ok", proxy: false },
    },
  } as unknown as ProofPack;

  const grConstraintContract = {
    sources: { grDiagnostics: "gr-evolve-brick", certificate: "physics.warp.viability" },
    diagnostics: { brickMeta: { status: "CERTIFIED", reasons: [] } },
    certificate: {
      status: "ADMISSIBLE",
      admissibleStatus: "ADMISSIBLE",
      hasCertificate: true,
      certificateHash: "cert-hash",
      certificateId: "cert-id",
    },
    guardrails: {
      fordRoman: "ok",
      thetaAudit: "ok",
      tsRatio: "ok",
      vdbBand: "ok",
    },
    constraints: [],
    proxy: false,
  } as unknown as GrConstraintContract;

  const grEvaluation = {
    pass: true,
    constraints: [],
    certificate: {
      status: "ADMISSIBLE",
      admissibleStatus: "ADMISSIBLE",
      hasCertificate: true,
      certificateHash: "cert-hash",
      certificateId: "cert-id",
      integrityOk: true,
    },
  } as unknown as GrEvaluation;

  return {
    proofPack,
    grConstraintContract,
    grEvaluation,
    stageGate: { ok: true, stage: "reduced-order", pending: false } as any,
  };
};

const passingClosurePipeline = () =>
  ({
    claim_tier: "diagnostic",
    provenance_class: "simulation",
    currentMode: "hover",
    warpFieldType: "natario_sdf",
    hull: { Lx_m: 1007, Ly_m: 264, Lz_m: 173 },
    nhm2SameChartFullTensor: {
      completeness: { fullTensorComplete: true, missingComponentIds: [] },
    },
    nhm2SourceSideSameBasisTensorAuthority: {
      summary: {
        hasWallAuthority: true,
        allRequiredRegionsAuthoritative: true,
      },
      regions: [
        {
          regionId: "wall",
          status: "authoritative_same_basis",
          blockers: [],
        },
      ],
    },
    nhm2WallSourceClosure: {
      residual: { pass: true, relative: 0 },
      blockers: [],
    },
    nhm2ObserverRobustEnergyConditions: {
      contractVersion: "nhm2_observer_robust_energy_conditions/v1",
      summary: {
        robustCheckComplete: true,
        eulerianOnly: false,
        anyViolation: false,
      },
    },
    nhm2QeiWorldlineDossier: {
      summary: {
        dossierComplete: true,
        hasWallWorldline: true,
        anyProxy: false,
      },
    },
    casimirMaterialReceipt: { status: "material_receipted" },
    nhm2NatarioInvariantAudit: {
      expansion: { thetaFlatnessStatus: "pass" },
      invariants: { status: "computed" },
      stability: { convergenceStatus: "pass" },
      blockers: [],
    },
    nhm2FullSolveClaimAdmission: {
      admission: {
        status: "reduced_order_numerical_candidate",
        diagnosticClosurePassed: true,
        numericalReliabilityPassed: true,
      },
      blockers: ["external_physical_validation_missing"],
    },
  }) as any;

describe("buildNhm2SolveState", () => {
  it("reports an authority-wired state when live inputs line up with NHM2 authority", () => {
    const proofPack = {
      values: {
        hull_Lx_m: { value: 1007, proxy: false },
        hull_Ly_m: { value: 264, proxy: false },
        hull_Lz_m: { value: 173, proxy: false },
        metric_adapter_family: { value: "natario_like_low_expansion", proxy: false },
        metric_chart_contract_status: { value: "ok", proxy: false },
      },
    } as unknown as ProofPack;

    const grConstraintContract = {
      sources: { grDiagnostics: "gr-evolve-brick", certificate: "physics.warp.viability" },
      diagnostics: { brickMeta: { status: "CERTIFIED", reasons: [] } },
      certificate: {
        status: "ADMISSIBLE",
        admissibleStatus: "ADMISSIBLE",
        hasCertificate: true,
        certificateHash: "cert-hash",
        certificateId: "cert-id",
      },
      guardrails: {
        fordRoman: "ok",
        thetaAudit: "ok",
        tsRatio: "ok",
        vdbBand: "ok",
      },
      constraints: [],
      proxy: false,
    } as unknown as GrConstraintContract;

    const grEvaluation = {
      pass: true,
      constraints: [],
      certificate: {
        status: "ADMISSIBLE",
        admissibleStatus: "ADMISSIBLE",
        hasCertificate: true,
        certificateHash: "cert-hash",
        certificateId: "cert-id",
        integrityOk: true,
      },
    } as unknown as GrEvaluation;

    const state = buildNhm2SolveState({
      pipeline: {
        claim_tier: "diagnostic",
        provenance_class: "simulation",
        currentMode: "hover",
        warpFieldType: "natario_sdf",
        gammaGeo: 1,
        gammaVanDenBroeck: 500,
        qCavity: 100000,
        qSpoilingFactor: 3,
        dutyCycle: 0.12,
        sectorCount: 80,
        concurrentSectors: 2,
        zeta: 0.84,
        hull: { Lx_m: 1007, Ly_m: 264, Lz_m: 173 },
        nhm2SameChartFullTensor: {
          completeness: { fullTensorComplete: true, missingComponentIds: [] },
        },
        nhm2SourceSideSameBasisTensorAuthority: {
          summary: {
            hasWallAuthority: true,
            allRequiredRegionsAuthoritative: true,
          },
          regions: [
            {
              regionId: "wall",
              status: "authoritative_same_basis",
              blockers: [],
            },
          ],
        },
        nhm2WallSourceClosure: {
          residual: { pass: true, relative: 0 },
          blockers: [],
        },
        nhm2ObserverRobustEnergyConditions: {
          metricRequired: {
            summary: {
              robustCheckComplete: true,
              eulerianOnly: false,
              anyViolation: false,
            },
          },
          tileEffective: {
            summary: {
              robustCheckComplete: true,
              eulerianOnly: false,
              anyViolation: false,
            },
          },
        },
        nhm2QeiWorldlineDossier: {
          summary: {
            dossierComplete: true,
            hasWallWorldline: true,
            anyProxy: false,
          },
        },
        casimirMaterialReceipt: { status: "material_receipted" },
        nhm2NatarioInvariantAudit: {
          expansion: { thetaFlatnessStatus: "pass" },
          invariants: { status: "computed" },
          stability: { convergenceStatus: "pass" },
          blockers: [],
        },
        nhm2FullSolveClaimAdmission: {
          admission: {
            status: "reduced_order_numerical_candidate",
            diagnosticClosurePassed: true,
            numericalReliabilityPassed: true,
          },
          blockers: ["external_physical_validation_missing"],
        },
      } as any,
      proofPack,
      grConstraintContract,
      grEvaluation,
      stageGate: { ok: true, stage: "reduced-order", pending: false } as any,
    });

    expect(state.overall.tone).toBe("good");
    expect(state.overall.reasons).toEqual([]);
    expect(state.geometry.matchesAuthority).toBe(true);
    expect(state.proof.metricAdapterFamily).toBe("natario_like_low_expansion");
    expect(state.contract.integrityOk).toBe(true);
    expect(state.closureStack.sameChartFullTensor.fullTensorComplete).toBe(true);
  });

  it("surfaces blocking proxy and geometry drift reasons", () => {
    const proofPack = {
      values: {
        metric_adapter_family: { value: "natario_like_low_expansion", proxy: true },
      },
    } as unknown as ProofPack;

    const state = buildNhm2SolveState({
      pipeline: {
        hull: { Lx_m: 503.5, Ly_m: 132, Lz_m: 86.5 },
        geometryFallback: { mode: "warn", applied: true, blocked: false, reasons: ["legacy fallback"] },
      } as any,
      proofPack,
      stageGate: { ok: true, stage: "reduced-order", pending: false } as any,
    });

    expect(state.overall.tone).toBe("bad");
    expect(state.overall.reasons).toContain("strict proof-pack proxy present");
    expect(state.overall.reasons.some((reason) => reason.includes("live hull drift"))).toBe(true);
    expect(state.pipeline.geometryFallback.applied).toBe(true);
    expect(state.geometry.matchesAuthority).toBe(false);
  });

  it("keeps closure-stack gaps guarded instead of promotional success", () => {
    const state = buildNhm2SolveState({
      pipeline: {
        hull: { Lx_m: 1007, Ly_m: 264, Lz_m: 173 },
        nhm2SameChartFullTensor: {
          completeness: { fullTensorComplete: false, missingComponentIds: ["T0x", "Txy"] },
        },
        nhm2SourceSideSameBasisTensorAuthority: {
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
        nhm2WallSourceClosure: {
          residual: { pass: false, relative: 0.2 },
          blockers: ["wall_t00_residual_exceeded"],
        },
        nhm2ObserverRobustEnergyConditions: {
          metricRequired: {
            summary: {
              robustCheckComplete: false,
              eulerianOnly: true,
              anyViolation: false,
            },
          },
        },
        nhm2QeiWorldlineDossier: {
          summary: {
            dossierComplete: false,
            hasWallWorldline: false,
            anyProxy: true,
          },
        },
        casimirMaterialReceipt: { status: "ideal_scalar_only" },
        nhm2NatarioInvariantAudit: {
          expansion: { thetaFlatnessStatus: "pass" },
          invariants: { status: "missing" },
          stability: { convergenceStatus: "not_run" },
          blockers: ["curvature_invariants_missing"],
        },
      } as any,
      stageGate: { ok: true, stage: "reduced-order", pending: false } as any,
    });

    expect(state.overall.label).toBe("Blocked / proxy");
    expect(state.overall.reasons).toContain("same-chart full tensor incomplete");
    expect(state.overall.reasons).toContain("source-side same-basis tensor authority missing");
    expect(state.overall.reasons).toContain("wall source-side same-basis tensor authority missing");
    expect(state.overall.reasons).toContain("wall source closure missing/failing");
    expect(state.overall.reasons).toContain("observer-robust energy-condition check incomplete");
    expect(state.overall.reasons).toContain("QEI worldline dossier incomplete");
    expect(state.overall.reasons).toContain("Casimir material receipt missing");
    expect(state.overall.reasons).toContain("Natário invariant audit incomplete");
    expect(state.closureStack.sameChartFullTensor.missingComponentIds).toEqual(["T0x", "Txy"]);
    expect(state.closureStack.sourceSideSameBasisTensorAuthority.hasWallAuthority).toBe(false);
    expect(state.closureStack.sourceSideSameBasisTensorAuthority.blockers).toContain(
      "source_side_full_tensor_components_missing",
    );
    expect(state.closureStack.wallSourceClosure.pass).toBe(false);
    expect(state.closureStack.casimirMaterialReceipt.idealScalarOnly).toBe(true);
  });

  it("keeps missing closure artifacts guarded and partial instead of successful", () => {
    const state = buildNhm2SolveState({
      ...makeAuthorityInputs(),
      pipeline: {
        claim_tier: "diagnostic",
        provenance_class: "simulation",
        currentMode: "hover",
        warpFieldType: "natario_sdf",
        hull: { Lx_m: 1007, Ly_m: 264, Lz_m: 173 },
      } as any,
    });

    expect(state.overall.label).toBe("Guarded / partial");
    expect(state.closureStack.sameChartFullTensor.available).toBe(false);
    expect(state.closureStack.sourceSideSameBasisTensorAuthority.available).toBe(false);
    expect(state.closureStack.wallSourceClosure.available).toBe(false);
    expect(state.closureStack.observerRobustEnergyConditions.available).toBe(false);
    expect(state.closureStack.qeiWorldlineDossier.available).toBe(false);
    expect(state.closureStack.casimirMaterialReceipt.available).toBe(false);
    expect(state.closureStack.natarioInvariantAudit.available).toBe(false);
    expect(state.overall.reasons).toEqual(
      expect.arrayContaining([
        "same-chart full tensor incomplete",
        "source-side same-basis tensor authority missing",
        "wall source-side same-basis tensor authority missing",
        "wall source closure missing/failing",
        "observer-robust energy-condition check incomplete",
        "QEI worldline dossier incomplete",
        "Casimir material receipt missing",
        expect.stringMatching(/invariant audit incomplete/),
        "full-solve claim admission missing",
      ]),
    );
  });

  it("keeps diagnostic claim admission guarded when numerical reliability is incomplete", () => {
    const pipeline = passingClosurePipeline();
    pipeline.nhm2FullSolveClaimAdmission = {
      admission: {
        status: "diagnostic_closure_candidate",
        diagnosticClosurePassed: true,
        numericalReliabilityPassed: false,
      },
      blockers: ["reference_run_validation_not_pass:review"],
    };

    const state = buildNhm2SolveState({
      ...makeAuthorityInputs(),
      pipeline,
    });

    expect(state.overall.label).toBe("Guarded / partial");
    expect(state.claimAdmission.available).toBe(true);
    expect(state.claimAdmission.status).toBe("diagnostic_closure_candidate");
    expect(state.claimAdmission.diagnosticClosurePassed).toBe(true);
    expect(state.claimAdmission.numericalReliabilityPassed).toBe(false);
    expect(state.claimAdmission.physicalClaimAllowed).toBe(false);
    expect(state.claimAdmission.transportClaimAllowed).toBe(false);
    expect(state.claimAdmission.blockers).toContain("reference_run_validation_not_pass:review");
    expect(state.overall.reasons).toContain("physical claim admission remains diagnostic");
  });

  it("keeps wall closure failure blocking even when global residual-style context passes", () => {
    const pipeline = passingClosurePipeline();
    pipeline.nhm2SourceClosure = {
      residual: { pass: true, relative: 0 },
      residualRms: 0,
      residualMax: 0,
    };
    pipeline.nhm2WallSourceClosure = {
      residual: { pass: false, relative: 0.8 },
      blockers: ["wall_T00_source_residual_exceeds_tolerance"],
    };

    const state = buildNhm2SolveState({
      ...makeAuthorityInputs(),
      pipeline,
    });

    expect(state.overall.label).toBe("Blocked / proxy");
    expect(state.closureStack.wallSourceClosure.pass).toBe(false);
    expect(state.closureStack.wallSourceClosure.relativeResidual).toBe(0.8);
    expect(state.overall.reasons).toContain("wall source closure missing/failing");
    expect(state.overall.reasons).not.toContain("same-chart full tensor incomplete");
  });

  it("blocks source closure when wall source-side tensor authority is missing", () => {
    const pipeline = passingClosurePipeline();
    pipeline.nhm2SourceSideSameBasisTensorAuthority = {
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
    };
    pipeline.nhm2WallSourceClosure = {
      residual: { pass: true, relative: 0 },
      blockers: ["wall_source_side_same_basis_authority_missing"],
    };

    const state = buildNhm2SolveState({
      ...makeAuthorityInputs(),
      pipeline,
    });

    expect(state.overall.label).toBe("Blocked / proxy");
    expect(state.closureStack.wallSourceClosure.pass).toBe(true);
    expect(state.closureStack.sourceSideSameBasisTensorAuthority.hasWallAuthority).toBe(false);
    expect(state.overall.reasons).toContain("source-side same-basis tensor authority missing");
    expect(state.overall.reasons).toContain(
      "wall source-side same-basis tensor authority missing",
    );
  });

  it("does not let scalar qei_margin substitute for a QEI worldline dossier", () => {
    const pipeline = passingClosurePipeline();
    pipeline.qei_margin = 1;
    delete pipeline.nhm2QeiWorldlineDossier;

    const state = buildNhm2SolveState({
      ...makeAuthorityInputs(),
      pipeline,
    });

    expect(state.closureStack.qeiWorldlineDossier.available).toBe(false);
    expect(state.closureStack.qeiWorldlineDossier.dossierComplete).toBeNull();
    expect(state.overall.label).toBe("Guarded / partial");
    expect(state.overall.reasons).toContain("QEI worldline dossier incomplete");
  });
});
