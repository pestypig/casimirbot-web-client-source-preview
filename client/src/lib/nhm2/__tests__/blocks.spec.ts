import { describe, expect, it } from "vitest";
import { buildNhm2Blocks } from "@shared/nhm2-blocks";
import { buildNhm2SolveState } from "@/lib/nhm2/solve-state";
import type { GrConstraintContract, GrEvaluation, ProofPack } from "@shared/schema";

const makeAuthorityState = () => {
  const proofPack = {
    values: {
      hull_Lx_m: { value: 1007, proxy: false },
      hull_Ly_m: { value: 264, proxy: false },
      hull_Lz_m: { value: 173, proxy: false },
      metric_adapter_family: { value: "natario_like_low_expansion", proxy: false },
      metric_chart_contract_status: { value: "ok", proxy: false },
      metric_chart_contract_reason: { value: "authority congruent", proxy: false },
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

  return buildNhm2SolveState({
    pipeline: {
      claim_tier: "diagnostic",
      provenance_class: "simulation",
      currentMode: "hover",
      warpFieldType: "natario_sdf",
      sectorCount: 80,
      concurrentSectors: 2,
      congruentSolvePass: true,
      hull: { Lx_m: 1007, Ly_m: 264, Lz_m: 173 },
      lightCrossing: { tauLC_ms: 0.003359 },
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
};

describe("buildNhm2Blocks", () => {
  it("builds citation-ready authority blocks from shared NHM2 state", () => {
    const blocks = buildNhm2Blocks({
      state: makeAuthorityState(),
      generatedAt: 123,
      calculatorSnapshot: {
        decisionClass: "admissible",
        congruentSolvePass: true,
      },
    });

    const authority = blocks.find((block) => block.blockId === "nhm2.authority-status");
    const proof = blocks.find((block) => block.blockId === "nhm2.proof-guardrails");

    expect(authority?.authorityTier).toBe("authoritative");
    expect(authority?.integrity.generatedAt).toBe(123);
    expect(authority?.render?.href).toContain("/api/helix/blocks/nhm2.authority-status");
    expect(proof?.status).toBe("good");
    expect(proof?.provenance.some((entry) => entry.ref === "/api/helix/gr-evaluation")).toBe(true);
  });

  it("marks geometry drift and fallback as non-authoritative", () => {
    const state = buildNhm2SolveState({
      pipeline: {
        hull: { Lx_m: 503.5, Ly_m: 132, Lz_m: 86.5 },
        geometryFallback: {
          mode: "legacy",
          applied: true,
          blocked: false,
          reasons: ["legacy fallback"],
        },
      } as any,
      proofPack: {
        values: {
          metric_adapter_family: { value: "natario_like_low_expansion", proxy: false },
        },
      } as unknown as ProofPack,
      stageGate: { ok: true, stage: "reduced-order", pending: false } as any,
    });

    const [geometry] = buildNhm2Blocks({
      state,
      blockIds: ["nhm2.geometry-timing"],
      generatedAt: 456,
    });

    expect(geometry.status).toBe("bad");
    expect(geometry.authorityTier).toBe("proxy");
    expect(geometry.summary).toContain("drifts");
    expect(geometry.summary).toContain("fallback applied");
  });
});
