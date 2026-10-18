// client/src/components/WarpProofPanel.tsx
import React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { FrontProofsLedger } from "@/components/FrontProofsLedger";
import { useProofPack } from "@/hooks/useProofPack";
import { useNhm2SolveState } from "@/hooks/useNhm2SolveState";
import { useMathStageGate } from "@/hooks/useMathStageGate";
import { useGrConstraintContract } from "@/hooks/useGrConstraintContract";
import { apiRequest } from "@/lib/queryClient";
import {
  PROOF_PACK_STAGE_REQUIREMENTS,
  getProofValue,
  isStrictProofPack,
  readProofBooleanStrict,
  readProofNumberStrict,
  readProofStringStrict,
} from "@/lib/proof-pack";
import { STAGE_BADGE, STAGE_LABELS } from "@/lib/math-stage-gate";
import { fmtSci } from "@/lib/warp-proof-math";
import CongruenceLegend from "@/components/common/CongruenceLegend";
import { useDesktopStore } from "@/store/useDesktopStore";

type ContractGuardrailStatus = "ok" | "fail" | "proxy" | "missing";
type ClosureStackStatus = "pass" | "review" | "missing" | "fail" | "proxy";

type PanelRecord = Record<string, unknown>;

const asPanelRecord = (value: unknown): PanelRecord | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as PanelRecord) : null;

const readPanelText = (record: PanelRecord | null | undefined, key: string): string | null => {
  const value = record?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
};

const readPanelBoolean = (record: PanelRecord | null | undefined, key: string): boolean | null => {
  const value = record?.[key];
  return typeof value === "boolean" ? value : null;
};

const readPanelRecord = (record: PanelRecord | null | undefined, key: string): PanelRecord | null =>
  asPanelRecord(record?.[key]);

const readFirstArtifactRecord = (
  records: Array<PanelRecord | null | undefined>,
  keys: string[],
): PanelRecord | null => {
  for (const record of records) {
    for (const key of keys) {
      const candidate = readPanelRecord(record, key);
      if (candidate) return candidate;
    }
  }
  return null;
};

const firstPanelText = (...values: Array<string | null | undefined>): string | null =>
  values.find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? null;

const artifactRefFrom = (
  artifact: PanelRecord | null,
  fallback: string,
  ...keys: string[]
): string | null => {
  if (!artifact) return null;
  for (const key of keys) {
    const direct = readPanelText(artifact, key);
    if (direct) return direct;
  }
  return readPanelText(artifact, "contractVersion") ?? fallback;
};

const statusBadgeClass = (status: ClosureStackStatus): string => {
  if (status === "pass") return "border-emerald-500/60 bg-emerald-500/10 text-emerald-100";
  if (status === "fail") return "border-rose-500/60 bg-rose-500/10 text-rose-100";
  if (status === "proxy") return "border-amber-500/60 bg-amber-500/10 text-amber-100";
  if (status === "missing") return "border-slate-600/60 bg-slate-800/50 text-slate-300";
  return "border-cyan-500/50 bg-cyan-500/10 text-cyan-100";
};

const observerScopeNote = (artifact: PanelRecord | null, eulerianOnly: boolean | null): string => {
  const families = Array.isArray(artifact?.observerFamilies)
    ? artifact.observerFamilies
        .map((entry) => readPanelText(asPanelRecord(entry), "familyId"))
        .filter((entry): entry is string => Boolean(entry))
    : [];
  const scopes: string[] = [];
  if (eulerianOnly === true || (families.includes("eulerian") && families.length === 1)) {
    scopes.push("Eulerian only");
  }
  if (families.some((family) => family === "boosted_timelike_grid" || family === "null_direction_grid")) {
    scopes.push("robust grid");
  }
  if (families.includes("algebraic_type_i")) scopes.push("algebraic Type I");
  if (families.includes("continuous_optimizer")) scopes.push("continuous optimizer");
  return `Observer scope: ${scopes.length > 0 ? scopes.join(" / ") : "not available"}.`;
};

const contractSummaryClass = (statuses: ContractGuardrailStatus[] | null) => {
  if (!statuses) return "border-slate-600 bg-slate-900/70 text-slate-200";
  if (statuses.some((status) => status === "fail" || status === "missing")) {
    return "border-rose-500/40 bg-rose-500/10 text-rose-200";
  }
  if (statuses.some((status) => status === "proxy")) {
    return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  }
  return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
};

export function WarpProofPanel() {
  const openPanel = useDesktopStore((store) => store.open);
  const { data: pack, isLoading, error } = useProofPack({
    refetchInterval: 5_000,
    staleTime: 10_000,
  });
  const stageGate = useMathStageGate(PROOF_PACK_STAGE_REQUIREMENTS, {
    staleTime: 30_000,
  });
  const stageLabel = stageGate.pending
    ? "STAGE..."
    : STAGE_LABELS[stageGate.stage];
  const contractQuery = useGrConstraintContract({ enabled: true, refetchInterval: 2000 });
  const nhm2Solve = useNhm2SolveState();
  const closureStack = nhm2Solve.state.closureStack;
  const claimAdmission = nhm2Solve.state.claimAdmission;
  const pipelineRecord = asPanelRecord(nhm2Solve.pipelineQuery.data);
  const natarioPipelineRecord = readPanelRecord(pipelineRecord, "natario");
  const sameChartTensorArtifact = readFirstArtifactRecord(
    [pipelineRecord, natarioPipelineRecord],
    ["nhm2SameChartFullTensor", "nhm2_same_chart_full_tensor"],
  );
  const wallClosureArtifact = readFirstArtifactRecord(
    [pipelineRecord, natarioPipelineRecord],
    ["nhm2WallSourceClosure", "nhm2_wall_source_closure"],
  );
  const sourceSideAuthorityArtifact = readFirstArtifactRecord(
    [pipelineRecord, natarioPipelineRecord],
    [
      "nhm2SourceSideSameBasisTensorAuthority",
      "nhm2_source_side_same_basis_tensor_authority",
    ],
  );
  const observerRobustArtifact = readFirstArtifactRecord(
    [pipelineRecord, natarioPipelineRecord],
    ["nhm2ObserverRobustEnergyConditions", "nhm2_observer_robust_energy_conditions"],
  );
  const qeiDossierArtifact = readFirstArtifactRecord(
    [pipelineRecord, natarioPipelineRecord],
    ["nhm2QeiWorldlineDossier", "nhm2_qei_worldline_dossier"],
  );
  const casimirReceiptArtifact = readFirstArtifactRecord(
    [pipelineRecord, natarioPipelineRecord],
    ["casimirMaterialReceipt", "casimir_material_receipt"],
  );
  const natarioInvariantArtifact = readFirstArtifactRecord(
    [pipelineRecord, natarioPipelineRecord],
    ["nhm2NatarioInvariantAudit", "nhm2_natario_invariant_audit"],
  );
  const claimAdmissionArtifact = readFirstArtifactRecord(
    [pipelineRecord, natarioPipelineRecord],
    ["nhm2FullSolveClaimAdmission", "nhm2_full_solve_claim_admission"],
  );
  const wallRequiredRecord = readPanelRecord(wallClosureArtifact, "required");
  const wallAvailableRecord = readPanelRecord(wallClosureArtifact, "available");
  const sourceSideAuthoritySummary = readPanelRecord(
    sourceSideAuthorityArtifact,
    "summary",
  );
  const observerSummaryRecord = readPanelRecord(observerRobustArtifact, "summary");
  const casimirStatus =
    closureStack.casimirMaterialReceipt.status ??
    readPanelText(casimirReceiptArtifact, "status");
  const qeiWorldlines = Array.isArray(qeiDossierArtifact?.worldlines)
    ? qeiDossierArtifact.worldlines
    : [];
  const firstQeiWorldline = asPanelRecord(qeiWorldlines[0]);
  const firstQeiSampledRho = readPanelRecord(firstQeiWorldline, "sampledRho");
  const firstQeiBound = readPanelRecord(firstQeiWorldline, "bound");
  const natarioStabilityRecord = readPanelRecord(natarioInvariantArtifact, "stability");
  const sameChartStatus: ClosureStackStatus = !closureStack.sameChartFullTensor.available
    ? "missing"
    : closureStack.sameChartFullTensor.fullTensorComplete === true
      ? "pass"
      : "review";
  const sourceSideAuthorityStatus: ClosureStackStatus = !closureStack
    .sourceSideSameBasisTensorAuthority.available
    ? "missing"
    : closureStack.sourceSideSameBasisTensorAuthority.hasWallAuthority === true &&
        closureStack.sourceSideSameBasisTensorAuthority.allRequiredRegionsAuthoritative === true
      ? "pass"
      : closureStack.sourceSideSameBasisTensorAuthority.hasWallAuthority === false
        ? "fail"
        : "review";
  const wallClosureStatus: ClosureStackStatus = !closureStack.wallSourceClosure.available
    ? "missing"
    : closureStack.wallSourceClosure.blockers.length > 0
      ? "review"
      : closureStack.wallSourceClosure.pass === true
      ? "pass"
      : closureStack.wallSourceClosure.pass === false
        ? "fail"
        : "review";
  const observerStatus: ClosureStackStatus = !closureStack.observerRobustEnergyConditions.available
    ? "missing"
    : closureStack.observerRobustEnergyConditions.anyViolation === true
      ? "fail"
      : closureStack.observerRobustEnergyConditions.eulerianOnly === true
        ? "proxy"
        : closureStack.observerRobustEnergyConditions.robustCheckComplete === true
          ? "pass"
          : "review";
  const qeiDossierStatus: ClosureStackStatus = !closureStack.qeiWorldlineDossier.available
    ? "missing"
    : closureStack.qeiWorldlineDossier.anyProxy === true
      ? "proxy"
      : closureStack.qeiWorldlineDossier.dossierComplete === true
        ? "pass"
        : "review";
  const casimirReceiptStatus: ClosureStackStatus = !closureStack.casimirMaterialReceipt.available
    ? "missing"
    : casimirStatus === "blocked"
      ? "fail"
      : closureStack.casimirMaterialReceipt.idealScalarOnly === true ||
          casimirStatus === "ideal_scalar_only" ||
          casimirStatus === "proxy"
        ? "proxy"
        : casimirStatus === "material_receipted"
          ? "pass"
          : "review";
  const natarioAuditStatus: ClosureStackStatus = !closureStack.natarioInvariantAudit.available
    ? "missing"
    : closureStack.natarioInvariantAudit.status === "fail" ||
        closureStack.natarioInvariantAudit.thetaFlatnessStatus === "fail"
      ? "fail"
      : closureStack.natarioInvariantAudit.status === "pass" &&
          closureStack.natarioInvariantAudit.invariantStatus === "computed"
        ? "pass"
        : "review";
  const claimAdmissionStatus: ClosureStackStatus = !claimAdmission.available
    ? "missing"
    : claimAdmission.status === "blocked" ||
        claimAdmission.status === "physical_claim_forbidden"
      ? "fail"
      : claimAdmission.status === "reduced_order_numerical_candidate"
        ? "pass"
        : "review";
  const claimAdmissionPrimaryBlocker =
    claimAdmission.blockers[0] ??
    (claimAdmissionStatus === "missing"
      ? "full-solve claim admission artifact missing"
      : claimAdmission.numericalReliabilityPassed !== true
        ? "numerical reliability evidence incomplete"
        : "external physical validation missing");
  const claimAdmissionNote =
    claimAdmission.status === "reduced_order_numerical_candidate"
      ? "Reduced-order numerical candidate; physical and transport claims remain forbidden."
      : claimAdmission.status === "diagnostic_closure_candidate"
        ? "Diagnostic closure candidate; numerical reliability and external evidence still gate claims."
        : "Physical claim admission is locked behind diagnostic, numerical, and external evidence.";
  const closureRows = [
    {
      id: "same-chart-full-tensor",
      label: "Same-chart full tensor",
      status: sameChartStatus,
      blocker:
        closureStack.sameChartFullTensor.missingComponentIds.length > 0
          ? `missing components: ${closureStack.sameChartFullTensor.missingComponentIds.slice(0, 4).join(", ")}`
          : sameChartStatus === "missing"
            ? "same-chart tensor artifact missing"
            : "none",
      artifactRef: artifactRefFrom(
        sameChartTensorArtifact,
        "nhm2SameChartFullTensor",
        "artifactRef",
      ),
      note: "Diagnostic closure artifact available; missing tensor components are not zero.",
    },
    {
      id: "source-side-same-basis-tensor-authority",
      label: "Source-side same-basis tensor authority",
      status: sourceSideAuthorityStatus,
      blocker:
        closureStack.sourceSideSameBasisTensorAuthority.blockers[0] ??
        (sourceSideAuthorityStatus === "missing"
          ? "source-side tensor authority receipt missing"
          : closureStack.sourceSideSameBasisTensorAuthority.hasWallAuthority !== true
            ? "wall source-side tensor authority missing"
            : closureStack.sourceSideSameBasisTensorAuthority.allRequiredRegionsAuthoritative !== true
              ? "required regional source authority incomplete"
              : "none"),
      artifactRef: artifactRefFrom(
        sourceSideAuthorityArtifact,
        "nhm2SourceSideSameBasisTensorAuthority",
        "sourceTensorArtifactRef",
        "counterpartArtifactRef",
      ),
      note:
        readPanelBoolean(sourceSideAuthoritySummary, "hasWallAuthority") === true
          ? "Source-side tensor authority is diagnostic evidence, not source validation."
          : "Wall T00 cannot be promoted from proxy or metric-echo source rows.",
    },
    {
      id: "wall-t00-closure",
      label: "Wall T00 closure",
      status: wallClosureStatus,
      blocker:
        closureStack.wallSourceClosure.blockers[0] ??
        (wallClosureStatus === "missing"
          ? "wall source closure artifact missing"
          : wallClosureStatus === "fail"
            ? "wall residual outside tolerance"
            : wallClosureStatus === "review"
              ? "wall closure unresolved"
              : "none"),
      artifactRef: firstPanelText(
        readPanelText(wallRequiredRecord, "tensorRef"),
        readPanelText(wallAvailableRecord, "tensorRef"),
        artifactRefFrom(wallClosureArtifact, "nhm2WallSourceClosure"),
      ),
      note: "Wall closure remains the front-door blocker.",
    },
    {
      id: "observer-robust-energy-conditions",
      label: "Observer-robust energy conditions",
      status: observerStatus,
      blocker:
        observerStatus === "missing"
          ? "observer-robust energy-condition artifact missing"
          : closureStack.observerRobustEnergyConditions.anyViolation === true
            ? "observer-family energy-condition violation"
            : closureStack.observerRobustEnergyConditions.eulerianOnly === true
              ? "restricted to Eulerian observer frame"
              : closureStack.observerRobustEnergyConditions.robustCheckComplete !== true
                ? "observer-robust check incomplete"
                : "none",
      artifactRef: firstPanelText(
        readPanelText(observerRobustArtifact, "tensorRef"),
        artifactRefFrom(observerRobustArtifact, "nhm2ObserverRobustEnergyConditions"),
      ),
      note: observerScopeNote(
        observerRobustArtifact,
        closureStack.observerRobustEnergyConditions.eulerianOnly ??
          readPanelBoolean(observerSummaryRecord, "eulerianOnly"),
      ),
    },
    {
      id: "qei-worldline-dossier",
      label: "QEI worldline dossier",
      status: qeiDossierStatus,
      blocker:
        qeiDossierStatus === "missing"
          ? "QEI worldline dossier missing"
          : closureStack.qeiWorldlineDossier.hasWallWorldline === false
            ? "wall worldline missing"
            : closureStack.qeiWorldlineDossier.anyProxy === true
              ? "dossier includes proxy values"
              : closureStack.qeiWorldlineDossier.dossierComplete !== true
                ? "QEI dossier incomplete"
                : "none",
      artifactRef: firstPanelText(
        readPanelText(firstQeiSampledRho, "provenanceRef"),
        readPanelText(firstQeiBound, "provenanceRef"),
        artifactRefFrom(qeiDossierArtifact, "nhm2QeiWorldlineDossier"),
      ),
      note: "Scalar QEI remains badge replay until the worldline dossier is complete.",
    },
    {
      id: "casimir-material-receipt",
      label: "Casimir material receipt",
      status: casimirReceiptStatus,
      blocker:
        casimirReceiptStatus === "missing"
          ? "Casimir material receipt missing"
          : closureStack.casimirMaterialReceipt.idealScalarOnly === true || casimirStatus === "ideal_scalar_only"
            ? "ideal scalar budget only"
            : casimirStatus === "blocked"
              ? "material receipt blocked"
              : "none",
      artifactRef: artifactRefFrom(casimirReceiptArtifact, "casimirMaterialReceipt", "tileBatchId"),
      note:
        closureStack.casimirMaterialReceipt.idealScalarOnly === true || casimirStatus === "ideal_scalar_only"
          ? "Ideal Casimir scalar budget is not material-receipted."
          : "Material receipt remains diagnostic source context.",
    },
    {
      id: "natario-invariant-audit",
      label: "Natário invariant audit",
      status: natarioAuditStatus,
      blocker:
        natarioAuditStatus === "missing"
          ? "Natário invariant audit missing"
          : closureStack.natarioInvariantAudit.invariantStatus !== "computed"
            ? `invariantStatus=${closureStack.natarioInvariantAudit.invariantStatus ?? "missing"}`
            : readPanelText(natarioStabilityRecord, "convergenceStatus") &&
                readPanelText(natarioStabilityRecord, "convergenceStatus") !== "pass"
              ? `convergenceStatus=${readPanelText(natarioStabilityRecord, "convergenceStatus")}`
              : "none",
      artifactRef: artifactRefFrom(natarioInvariantArtifact, "nhm2NatarioInvariantAudit"),
      note: "Zero expansion is separate from curvature, stability, and safety diagnostics.",
    },
  ] satisfies Array<{
    id: string;
    label: string;
    status: ClosureStackStatus;
    blocker: string;
    artifactRef: string | null;
    note: string;
  }>;
  const contractGuardrails = contractQuery.data?.guardrails ?? null;
  const contractStatuses: ContractGuardrailStatus[] | null = contractGuardrails
    ? [
        contractGuardrails.fordRoman,
        contractGuardrails.thetaAudit,
        contractGuardrails.tsRatio,
        contractGuardrails.vdbBand,
      ]
    : null;
  const contractSource = contractQuery.data?.sources?.grDiagnostics ?? "missing";
  const strictMode = isStrictProofPack(pack);
  const contractStatusesStrict =
    strictMode && contractStatuses
      ? contractStatuses.map((status) =>
          status === "proxy" || status === "missing" ? "fail" : status,
        )
      : contractStatuses;
  const contractBadgeClass = contractSummaryClass(contractStatusesStrict);
  const baseProxy = !stageGate.ok || !pack;
  const isProxy = (key: string) =>
    baseProxy || Boolean(getProofValue(pack, key)?.proxy);
  const proxyFrom = (keys: string[]) => baseProxy || keys.some(isProxy);

  const readNum = (key: string) => readProofNumberStrict(pack, key, strictMode);
  const readBool = (key: string) => readProofBooleanStrict(pack, key, strictMode);
  const readStr = (key: string) => readProofStringStrict(pack, key, strictMode);
  const proxyBadge = (proxy: boolean) =>
    proxy ? (
      <Badge
        className={cn(
          "ml-2 px-2 py-0.5 text-[10px] leading-tight",
          strictMode
            ? "bg-rose-900/40 text-rose-200"
            : "bg-slate-800 text-slate-300",
        )}
      >
        {strictMode ? "NON-ADMISSIBLE" : "PROXY"}
      </Badge>
    ) : null;

  const hull = {
    Lx_m: readNum("hull_Lx_m"),
    Ly_m: readNum("hull_Ly_m"),
    Lz_m: readNum("hull_Lz_m"),
    wallThickness_m: readNum("hull_wall_m"),
  };

  const gammaRequested = readNum("gamma_vdb_requested") ?? readNum("gamma_vdb");
  const vdb = {
    limit: readNum("vdb_limit"),
    pocketRadius_m: readNum("vdb_pocket_radius_m"),
    pocketThickness_m: readNum("vdb_pocket_thickness_m"),
    planckMargin: readNum("vdb_planck_margin"),
    admissible: readBool("vdb_admissible"),
    reason: readStr("vdb_reason"),
  };
  const vdbProxy = proxyFrom([
    "gamma_vdb_requested",
    "gamma_vdb",
    "vdb_limit",
    "vdb_pocket_radius_m",
    "vdb_pocket_thickness_m",
    "vdb_planck_margin",
    "vdb_admissible",
    "vdb_reason",
  ]);
  const vdbRegion = {
    alpha: readNum("vdb_region_ii_alpha"),
    n: readNum("vdb_region_ii_n"),
    rTilde_m: readNum("vdb_region_ii_r_tilde_m"),
    deltaTilde_m: readNum("vdb_region_ii_delta_tilde_m"),
    bPrimeMaxAbs: readNum("vdb_region_ii_bprime_max_abs"),
    bDoubleMaxAbs: readNum("vdb_region_ii_bdouble_max_abs"),
    t00Min: readNum("vdb_region_ii_t00_min"),
    t00Max: readNum("vdb_region_ii_t00_max"),
    t00Mean: readNum("vdb_region_ii_t00_mean"),
    sampleCount: readNum("vdb_region_ii_sample_count"),
    support: readBool("vdb_region_ii_support"),
    note: readStr("vdb_region_ii_note"),
  };
  const vdbRegionProxy = proxyFrom([
    "vdb_region_ii_alpha",
    "vdb_region_ii_n",
    "vdb_region_ii_r_tilde_m",
    "vdb_region_ii_delta_tilde_m",
    "vdb_region_ii_bprime_max_abs",
    "vdb_region_ii_bdouble_max_abs",
    "vdb_region_ii_t00_min",
    "vdb_region_ii_t00_max",
    "vdb_region_ii_t00_mean",
    "vdb_region_ii_sample_count",
    "vdb_region_ii_support",
    "vdb_region_ii_note",
  ]);
  const vdbRegionIV = {
    R_m: readNum("vdb_region_iv_R_m"),
    sigma: readNum("vdb_region_iv_sigma"),
    dfdrMaxAbs: readNum("vdb_region_iv_dfdr_max_abs"),
    dfdrRms: readNum("vdb_region_iv_dfdr_rms"),
    sampleCount: readNum("vdb_region_iv_sample_count"),
    support: readBool("vdb_region_iv_support"),
    note: readStr("vdb_region_iv_note"),
  };
  const vdbRegionIVProxy = proxyFrom([
    "vdb_region_iv_R_m",
    "vdb_region_iv_sigma",
    "vdb_region_iv_dfdr_max_abs",
    "vdb_region_iv_dfdr_rms",
    "vdb_region_iv_sample_count",
    "vdb_region_iv_support",
    "vdb_region_iv_note",
  ]);
  const vdbTwoWall = {
    support: readBool("vdb_two_wall_support"),
    note: readStr("vdb_two_wall_note"),
  };
  const vdbTwoWallProxy = proxyFrom(["vdb_two_wall_support", "vdb_two_wall_note"]);

  const mech = {
    requestedGap_nm: readNum("mechanical_gap_req_nm"),
    constrainedGap_nm: readNum("mechanical_gap_eff_nm"),
    mechSafetyFactor: readNum("mechanical_safety_factor"),
    safetyFactorMin: readNum("mechanical_safety_min"),
    loadPressure_Pa: readNum("mechanical_load_pressure_Pa"),
    sigmaAllow_Pa: readNum("mechanical_sigma_allow_Pa"),
    casimirPressure_Pa: readNum("mechanical_casimir_pressure_Pa"),
    electrostaticPressure_Pa: readNum("mechanical_electrostatic_pressure_Pa"),
    maxStroke_pm: readNum("mechanical_max_stroke_pm"),
    strokeFeasible: readBool("mechanical_stroke_feasible"),
    feasible: readBool("mechanical_feasible"),
    safetyFeasible: readBool("mechanical_safety_feasible"),
    margin_Pa: readNum("mechanical_margin_Pa"),
  };
  const mechProxy = proxyFrom([
    "mechanical_gap_req_nm",
    "mechanical_gap_eff_nm",
    "mechanical_safety_factor",
    "mechanical_safety_min",
    "mechanical_load_pressure_Pa",
    "mechanical_sigma_allow_Pa",
    "mechanical_casimir_pressure_Pa",
    "mechanical_electrostatic_pressure_Pa",
    "mechanical_max_stroke_pm",
    "mechanical_stroke_feasible",
    "mechanical_feasible",
    "mechanical_safety_feasible",
    "mechanical_margin_Pa",
  ]);

  const metricAdapter = {
    family: readStr("metric_adapter_family"),
    requestedField: readStr("metric_requested_field"),
    chartLabel: readStr("metric_chart_label"),
    dtGammaPolicy: readStr("metric_dt_gamma_policy"),
    chartStatus: readStr("metric_chart_contract_status"),
    chartReason: readStr("metric_chart_contract_reason"),
    chartNotes: readStr("metric_chart_notes"),
    coordinateMap: readStr("metric_coordinate_map"),
    alpha: readNum("metric_alpha"),
    gammaXX: readNum("metric_gamma_xx"),
    gammaYY: readNum("metric_gamma_yy"),
    gammaZZ: readNum("metric_gamma_zz"),
    betaMethod: readStr("metric_beta_method"),
    betaThetaMax: readNum("metric_beta_theta_max"),
    betaThetaRms: readNum("metric_beta_theta_rms"),
    betaCurlMax: readNum("metric_beta_curl_max"),
    betaCurlRms: readNum("metric_beta_curl_rms"),
    betaThetaConformalMax: readNum("metric_beta_theta_conformal_max"),
    betaThetaConformalRms: readNum("metric_beta_theta_conformal_rms"),
    betaBPrimeOverBMax: readNum("metric_beta_bprime_over_b_max"),
    betaBDoubleOverBMax: readNum("metric_beta_bdouble_over_b_max"),
    betaSampleCount: readNum("metric_beta_sample_count"),
    betaStep_m: readNum("metric_beta_step_m"),
    betaNote: readStr("metric_beta_note"),
  };
  const metricProxy = proxyFrom([
    "metric_adapter_family",
    "metric_requested_field",
    "metric_chart_label",
    "metric_dt_gamma_policy",
    "metric_chart_notes",
    "metric_coordinate_map",
    "metric_alpha",
    "metric_gamma_xx",
    "metric_gamma_yy",
    "metric_gamma_zz",
    "metric_beta_method",
    "metric_beta_theta_max",
    "metric_beta_theta_rms",
    "metric_beta_curl_max",
    "metric_beta_curl_rms",
    "metric_beta_theta_conformal_max",
    "metric_beta_theta_conformal_rms",
    "metric_beta_bprime_over_b_max",
    "metric_beta_bdouble_over_b_max",
    "metric_beta_sample_count",
    "metric_beta_step_m",
    "metric_beta_note",
  ]);

  const invariants = {
    kMin: readNum("gr_kretschmann_min"),
    kMax: readNum("gr_kretschmann_max"),
    kMean: readNum("gr_kretschmann_mean"),
    kP98: readNum("gr_kretschmann_p98"),
    rMin: readNum("gr_ricci4_min"),
    rMax: readNum("gr_ricci4_max"),
    rMean: readNum("gr_ricci4_mean"),
    rP98: readNum("gr_ricci4_p98"),
  };
  const readInvariantStats = (prefix: string) => {
    const min = readNum(`${prefix}_min`);
    const max = readNum(`${prefix}_max`);
    const mean = readNum(`${prefix}_mean`);
    const p98 = readNum(`${prefix}_p98`);
    const sampleCount = readNum(`${prefix}_sample_count`);
    const abs = readBool(`${prefix}_abs`);
    const wallFraction = readNum(`${prefix}_wall_fraction`);
    const bandFraction = readNum(`${prefix}_band_fraction`);
    const threshold = readNum(`${prefix}_threshold`);
    const bandMin = readNum(`${prefix}_band_min`);
    const bandMax = readNum(`${prefix}_band_max`);
    if (
      min == null ||
      max == null ||
      mean == null ||
      p98 == null ||
      sampleCount == null ||
      abs == null ||
      wallFraction == null ||
      bandFraction == null ||
      threshold == null ||
      bandMin == null ||
      bandMax == null
    ) {
      return null;
    }
    return {
      min,
      max,
      mean,
      p98,
      sampleCount,
      abs,
      wallFraction,
      bandFraction,
      threshold,
      bandMin,
      bandMax,
    };
  };
  const invariantsProxy = proxyFrom([
    "gr_kretschmann_min",
    "gr_kretschmann_max",
    "gr_kretschmann_mean",
    "gr_kretschmann_p98",
    "gr_ricci4_min",
    "gr_ricci4_max",
    "gr_ricci4_mean",
    "gr_ricci4_p98",
  ]);
  const cl0Delta = {
    kMean: readNum("gr_cl0_kretschmann_delta_mean"),
    kP98: readNum("gr_cl0_kretschmann_delta_p98"),
    rMean: readNum("gr_cl0_ricci4_delta_mean"),
    rP98: readNum("gr_cl0_ricci4_delta_p98"),
    max: readNum("gr_cl0_delta_max"),
    baselineSource: readStr("gr_cl0_baseline_source"),
    baselineAge: readNum("gr_cl0_baseline_age_s"),
  };
  const cl0Proxy = proxyFrom([
    "gr_cl0_kretschmann_delta_mean",
    "gr_cl0_kretschmann_delta_p98",
    "gr_cl0_ricci4_delta_mean",
    "gr_cl0_ricci4_delta_p98",
    "gr_cl0_delta_max",
    "gr_cl0_baseline_source",
    "gr_cl0_baseline_age_s",
  ]);
  const cl3 = {
    rhoMean: readNum("gr_rho_constraint_mean"),
    rhoRms: readNum("gr_rho_constraint_rms"),
    rhoMaxAbs: readNum("gr_rho_constraint_max_abs"),
    rhoSource: getProofValue(pack, "gr_rho_constraint_mean")?.source,
    matterMean: readNum("gr_matter_t00_mean"),
    deltaMean: readNum("gr_cl3_rho_delta_mean"),
    metricMean: readNum("gr_metric_t00_geom_mean"),
    metricDeltaMean: readNum("gr_cl3_rho_delta_metric_mean"),
    pipelineMean: readNum("gr_pipeline_t00_geom_mean"),
    pipelineDeltaMean: readNum("gr_cl3_rho_delta_pipeline_mean_telemetry"),
    threshold: readNum("gr_cl3_rho_threshold"),
    gate: readBool("gr_cl3_rho_gate"),
    gateSource: readStr("gr_cl3_rho_gate_source"),
    gateReason: readStr("gr_cl3_rho_gate_reason"),
    missingParts: readStr("gr_cl3_rho_missing_parts"),
    congruenceMissingParts: readStr("congruence_missing_parts"),
    congruenceMissingCount: readNum("congruence_missing_count"),
    congruenceMissingReason: readStr("congruence_missing_reason"),
    metricObserver: readStr("metric_t00_observer"),
    metricNormalization: readStr("metric_t00_normalization"),
    metricUnitSystem: readStr("metric_t00_unit_system"),
    metricContractStatus: readStr("metric_t00_contract_status"),
    metricContractReason: readStr("metric_t00_contract_reason"),
  };
  const cl3Proxy = proxyFrom([
    "gr_rho_constraint_mean",
    "gr_rho_constraint_rms",
    "gr_rho_constraint_max_abs",
    "gr_matter_t00_mean",
    "gr_cl3_rho_delta_mean",
    "gr_metric_t00_geom_mean",
    "gr_cl3_rho_delta_metric_mean",
    "gr_pipeline_t00_geom_mean",
    "gr_cl3_rho_delta_pipeline_mean_telemetry",
    "gr_cl3_rho_threshold",
    "gr_cl3_rho_gate",
    "gr_cl3_rho_gate_source",
    "gr_cl3_rho_gate_reason",
    "gr_cl3_rho_missing_parts",
    "congruence_missing_parts",
    "congruence_missing_count",
    "congruence_missing_reason",
    "metric_t00_observer",
    "metric_t00_normalization",
    "metric_t00_unit_system",
    "metric_t00_contract_status",
    "metric_t00_contract_reason",
  ]);
  const thetaStrict = {
    mode: readBool("theta_strict_mode"),
    ok: readBool("theta_strict_ok"),
    reason: readStr("theta_strict_reason"),
    metricDerived: readBool("theta_metric_derived"),
    metricSource: readStr("theta_metric_source"),
    metricReason: readStr("theta_metric_reason"),
    audit: readNum("theta_audit"),
  };
  const thetaProvenance = (() => {
    const metricDerived = thetaStrict.metricDerived === true;
    const auditPresent = Number.isFinite(thetaStrict.audit);
    const congruence = metricDerived
      ? "geometry-derived"
      : auditPresent
        ? "conditional"
        : "proxy-only";
    const proxy = congruence !== "geometry-derived";
    const source = metricDerived ? "metric" : "pipeline";
    return {
      source,
      congruence,
      proxy,
      reason: thetaStrict.metricReason ?? undefined,
    };
  })();
  const thetaBadgeLabel = thetaProvenance.proxy
    ? thetaProvenance.congruence === "conditional"
      ? "CONDITIONAL"
      : "PROXY"
    : "METRIC";
  const thetaBadgeTone = thetaProvenance.proxy
    ? "border-amber-400/60 text-amber-200"
    : "border-emerald-400/60 text-emerald-200";
  const thetaStrictProxy = proxyFrom([
    "theta_strict_mode",
    "theta_strict_ok",
    "theta_strict_reason",
    "theta_metric_derived",
    "theta_metric_source",
    "theta_metric_reason",
    "theta_audit",
  ]);
  const qiStrict = {
    mode: readBool("qi_strict_mode"),
    ok: readBool("qi_strict_ok"),
    reason: readStr("qi_strict_reason"),
    rhoSource: readStr("qi_rho_source"),
    metricDerived: readBool("qi_metric_derived"),
    metricSource: readStr("qi_metric_source"),
    metricReason: readStr("qi_metric_reason"),
  };
  const qiStrictProxy = proxyFrom([
    "qi_strict_mode",
    "qi_strict_ok",
    "qi_strict_reason",
    "qi_rho_source",
    "qi_metric_derived",
    "qi_metric_source",
    "qi_metric_reason",
  ]);
  const tsStrict = {
    metricDerived: readBool("ts_metric_derived"),
    source: readStr("ts_metric_source"),
    reason: readStr("ts_metric_reason"),
  };
  const tsStrictProxy = proxyFrom([
    "ts_metric_derived",
    "ts_metric_source",
    "ts_metric_reason",
  ]);
  const metricT00Diag = {
    sampleCount: readNum("metric_t00_sample_count"),
    rhoGeomMean: readNum("metric_t00_rho_geom_mean"),
    rhoSiMean: readNum("metric_t00_rho_si_mean"),
    kTraceMean: readNum("metric_k_trace_mean"),
    kSquaredMean: readNum("metric_k_sq_mean"),
    step_m: readNum("metric_t00_step_m"),
    scale_m: readNum("metric_t00_scale_m"),
  };
  const metricT00DiagProxy = proxyFrom([
    "metric_t00_sample_count",
    "metric_t00_rho_geom_mean",
    "metric_t00_rho_si_mean",
    "metric_k_trace_mean",
    "metric_k_sq_mean",
    "metric_t00_step_m",
    "metric_t00_scale_m",
  ]);
  const warpStress = {
    t00: readNum("warp_t00_avg"),
    t11: readNum("warp_t11_avg"),
    t22: readNum("warp_t22_avg"),
    t33: readNum("warp_t33_avg"),
  };
  const warpStressProxy = proxyFrom([
    "warp_t00_avg",
    "warp_t11_avg",
    "warp_t22_avg",
    "warp_t33_avg",
  ]);
  const stressMetaSource = readStr("stress_meta_source") ?? "unknown";
  const stressMetaCongruence = readStr("stress_meta_congruence") ?? "unknown";
  const stressMetaProxy =
    baseProxy || readBool("stress_meta_proxy") === true;
  const baselineStats = {
    kretschmann: readInvariantStats("gr_kretschmann") ?? undefined,
    ricci4: readInvariantStats("gr_ricci4") ?? undefined,
  };
  const baselineReady = Boolean(baselineStats.kretschmann || baselineStats.ricci4);
  const [baselinePending, setBaselinePending] = React.useState(false);
  const setBaseline = React.useCallback(
    async (clear = false) => {
      if (!clear && !baselineReady) return;
      setBaselinePending(true);
      try {
        const payload = clear
          ? { grBaseline: { source: "warp-proof-panel-clear", updatedAt: Date.now() } }
          : {
              grBaseline: {
                invariants: baselineStats,
                source: "warp-proof-panel",
                updatedAt: Date.now(),
              },
            };
        await apiRequest("POST", "/api/helix/pipeline/update", payload);
      } catch (err) {
        console.warn("[WarpProofPanel] failed to update GR baseline", err);
      } finally {
        setBaselinePending(false);
      }
    },
    [baselineReady, baselineStats],
  );

  const exoticStatus = readStr("overall_status") as
    | "NOMINAL"
    | "WARNING"
    | "CRITICAL"
    | undefined;
  const cl3BadText =
    cl3.gateReason === "metric_source_missing"
      ? "metric T00 source missing"
      : cl3.gateReason === "constraint_rho_missing"
        ? "constraint rho missing"
        : cl3.gateReason === "missing_inputs"
          ? "CL3 inputs missing"
          : `rho_delta > ${fmtSci(cl3.threshold, 4)}`;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-[#050915] text-slate-100">
      <header className="border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">
              Warp Proof Panel - Needle Hull Guardrails
            </div>
            <div className="text-[11px] text-slate-300/80">
              Proof metrics are read from the pipeline proof pack, with stage and
              proxy markers for maturity.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => openPanel("theory-badge-graph")}
              className="rounded-md border border-sky-700 px-2 py-1 text-[11px] text-sky-200 hover:bg-sky-900/30">
              Theory Badge Graph
            </button>
            <Badge
              variant="outline"
              className={cn(
                "border px-2 py-0.5 text-[10px]",
                STAGE_BADGE[stageGate.stage],
              )}
            >
              {stageLabel}
            </Badge>
            {proxyBadge(!stageGate.ok || !pack)}
            {exoticStatus && (
              <span
                className={
                  "rounded-full px-2 py-1 text-[11px] font-semibold " +
                  (exoticStatus === "NOMINAL"
                    ? "bg-emerald-500/20 text-emerald-200 border border-emerald-400/60"
                    : exoticStatus === "WARNING"
                      ? "bg-amber-500/20 text-amber-200 border border-amber-400/60"
                      : "bg-rose-500/20 text-rose-200 border border-rose-400/60")
                }
              >
                overallStatus = {exoticStatus}
              </span>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 text-[10px]">
          {contractGuardrails ? (
            <Badge className={cn("border px-2 py-0.5", contractBadgeClass)}>
              {`contract FR=${contractGuardrails.fordRoman} TH=${contractGuardrails.thetaAudit} TS=${contractGuardrails.tsRatio} VdB=${contractGuardrails.vdbBand}`}
            </Badge>
          ) : (
            <Badge className="border border-slate-600/50 bg-slate-900/60 px-2 py-0.5 text-slate-300">
              contract unavailable
            </Badge>
          )}
          <span className="text-slate-400">{`source=${contractSource}`}</span>
        </div>
        <CongruenceLegend className="mt-2" compact />
      </header>

      <div className="grid flex-1 grid-cols-1 gap-4 p-4 md:grid-cols-3">
        <div className="md:col-span-3">
          <FrontProofsLedger />
          {isLoading && (
            <div className="mt-2 text-xs text-slate-400">Loading proof pack...</div>
          )}
          {error && (
            <div className="mt-2 text-xs text-rose-400">
              Failed to load proof pack data.
            </div>
          )}
        </div>

        <section className="md:col-span-3 rounded-xl border border-white/10 bg-black/40 p-3 text-[12px]">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                Closure Stack
              </h2>
              <p className="mt-1 text-[11px] text-slate-300">
                Diagnostic closure artifacts are shown as blockers and review gates, not viability claims.
              </p>
            </div>
            <Badge className="border border-cyan-500/40 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-100">
              diagnostic only
            </Badge>
          </div>

          <div className="grid gap-2 lg:grid-cols-2">
            {closureRows.map((row) => (
              <div
                key={row.id}
                className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[12px] font-semibold text-slate-100">{row.label}</div>
                  <Badge className={cn("border px-2 py-0.5 text-[10px]", statusBadgeClass(row.status))}>
                    {`status: ${row.status}`}
                  </Badge>
                </div>
                <dl className="mt-2 space-y-1 text-[11px]">
                  <Row label="primary blocker">{row.blocker}</Row>
                  <Row label="artifact ref">{row.artifactRef ?? "not available"}</Row>
                </dl>
                <p className="mt-2 text-[11px] text-slate-400">{row.note}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="md:col-span-3 rounded-xl border border-white/10 bg-black/40 p-3 text-[12px]">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
                Claim Admission
              </h2>
              <p className="mt-1 text-[11px] text-slate-300">
                Diagnostic closure and numerical reliability are separated from physical or transport claims.
              </p>
            </div>
            <Badge className={cn("border px-2 py-0.5 text-[10px]", statusBadgeClass(claimAdmissionStatus))}>
              {`status: ${claimAdmission.status ?? claimAdmissionStatus}`}
            </Badge>
          </div>

          <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-3">
            <dl className="grid gap-2 text-[11px] md:grid-cols-2">
              <Row label="primary blocker">{claimAdmissionPrimaryBlocker}</Row>
              <Row label="artifact ref">
                {artifactRefFrom(claimAdmissionArtifact, "nhm2FullSolveClaimAdmission") ?? "not available"}
              </Row>
              <Row label="diagnostic closure">
                {claimAdmission.diagnosticClosurePassed === true
                  ? "passed"
                  : claimAdmission.diagnosticClosurePassed === false
                    ? "not passed"
                    : "unknown"}
              </Row>
              <Row label="numerical reliability">
                {claimAdmission.numericalReliabilityPassed === true
                  ? "passed"
                  : claimAdmission.numericalReliabilityPassed === false
                    ? "not passed"
                    : "unknown"}
              </Row>
              <Row label="physical claim">forbidden</Row>
              <Row label="transport claim">forbidden</Row>
            </dl>
            <p className="mt-2 text-[11px] text-slate-400">{claimAdmissionNote}</p>
          </div>
        </section>

        {/* Hull + pocket guard */}
        <section className="rounded-xl border border-white/10 bg-black/40 p-3 text-[12px]">
          <h2 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
            Van den Broeck pocket guard
            {proxyBadge(vdbProxy)}
          </h2>
          <p className="mb-2 text-[11px] text-slate-300">
            Ensure the compressed pocket stays above the conservative Planck band
            and above a fraction of the wall thickness.
          </p>

          <div className="mb-2 rounded bg-slate-900/60 p-2">
            <div className="font-mono text-[11px] text-slate-200">
              gamma_limit = min(
              <br />
              &nbsp;&nbsp;L_min / pocketFloor,
              <br />
              &nbsp;&nbsp;L_min / (l_P * safetyMult),
              <br />
              &nbsp;&nbsp;1e16
              <br />)
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              pocketFloor = max( wall * 0.01, l_P * 1e6 )
            </div>
          </div>

          <dl className="space-y-1 text-[11px]">
            <Row label="Lx_m">{fmtSci(hull.Lx_m)} m</Row>
            <Row label="Ly_m">{fmtSci(hull.Ly_m)} m</Row>
            <Row label="Lz_m">{fmtSci(hull.Lz_m)} m</Row>
            <Row label="wallThickness_m">{fmtSci(hull.wallThickness_m)} m</Row>
            <Row label="gamma_requested">{fmtSci(gammaRequested)}</Row>
            <Row label="gamma_limit">{fmtSci(vdb.limit)}</Row>
            <Row label="pocketRadius_m">{fmtSci(vdb.pocketRadius_m)}</Row>
            <Row label="pocketThickness_m">{fmtSci(vdb.pocketThickness_m)}</Row>
            <Row label="Planck margin">{fmtSci(vdb.planckMargin)}</Row>
          </dl>
          {vdb.reason ? (
            <p className="mt-2 text-[11px] text-slate-400">Reason: {vdb.reason}</p>
          ) : null}

        <StatusBadge
          ok={vdb.admissible}
          okText="gamma_requested <= gamma_limit"
          badText="gamma_requested exceeds limit"
          pendingText="Awaiting VdB guard data"
        />
      </section>

      {/* VdB region II diagnostics */}
      <section className="rounded-xl border border-white/10 bg-black/40 p-3 text-[12px]">
        <h2 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
          VdB region II diagnostics
          {proxyBadge(vdbRegionProxy)}
        </h2>
        <p className="mb-2 text-[11px] text-slate-300">
          B(r) transition-band derivatives used to verify region II support
          in Van Den Broeck geometry.
        </p>
        <dl className="space-y-1 text-[11px]">
          <Row label="alpha">{fmtSci(vdbRegion.alpha)}</Row>
          <Row label="n">{fmtSci(vdbRegion.n)}</Row>
          <Row label="r_tilde_m">{fmtSci(vdbRegion.rTilde_m)} m</Row>
          <Row label="delta_tilde_m">{fmtSci(vdbRegion.deltaTilde_m)} m</Row>
          <Row label="|B'|_max">{fmtSci(vdbRegion.bPrimeMaxAbs, 4)} 1/m</Row>
          <Row label="|B'|_max">{fmtSci(vdbRegion.bDoubleMaxAbs, 4)} 1/m^2</Row>
          <Row label="T00_min">{fmtSci(vdbRegion.t00Min, 4)} J/m^3</Row>
          <Row label="T00_max">{fmtSci(vdbRegion.t00Max, 4)} J/m^3</Row>
          <Row label="T00_mean">{fmtSci(vdbRegion.t00Mean, 4)} J/m^3</Row>
          <Row label="samples">{fmtSci(vdbRegion.sampleCount)}</Row>
        </dl>
        {vdbRegion.note ? (
          <p className="mt-2 text-[11px] text-slate-400">Note: {vdbRegion.note}</p>
        ) : null}
        <StatusBadge
          ok={Boolean(vdbRegion.support)}
          okText="Region II support detected (B' or B'')"
          badText="No region II support detected"
          pendingText="Awaiting VdB region II diagnostics"
        />
      </section>

      {/* VdB region IV diagnostics */}
      <section className="rounded-xl border border-white/10 bg-black/40 p-3 text-[12px]">
        <h2 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
          VdB region IV diagnostics
          {proxyBadge(vdbRegionIVProxy)}
        </h2>
        <p className="mb-2 text-[11px] text-slate-300">
          f-wall derivative sample around R for the outer transition band.
        </p>
        <dl className="space-y-1 text-[11px]">
          <Row label="R_m">{fmtSci(vdbRegionIV.R_m)} m</Row>
          <Row label="sigma">{fmtSci(vdbRegionIV.sigma)}</Row>
          <Row label="|df/dr|_max">{fmtSci(vdbRegionIV.dfdrMaxAbs, 4)} 1/m</Row>
          <Row label="df/dr_rms">{fmtSci(vdbRegionIV.dfdrRms, 4)} 1/m</Row>
          <Row label="samples">{fmtSci(vdbRegionIV.sampleCount)}</Row>
        </dl>
        {vdbRegionIV.note ? (
          <p className="mt-2 text-[11px] text-slate-400">Note: {vdbRegionIV.note}</p>
        ) : null}
        <StatusBadge
          ok={Boolean(vdbRegionIV.support)}
          okText="Region IV support detected (df/dr)"
          badText="No region IV support detected"
          pendingText="Awaiting VdB region IV diagnostics"
        />
      </section>

      {/* VdB two-wall derivative signature */}
      <section className="rounded-xl border border-white/10 bg-black/40 p-3 text-[12px]">
        <h2 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
          VdB two-wall derivative signature
          {proxyBadge(vdbTwoWallProxy)}
        </h2>
        <p className="mb-2 text-[11px] text-slate-300">
          Requires nontrivial derivative support in both the B(r) transition (region II) and the f-wall (region IV).
        </p>
        {vdbTwoWall.note ? (
          <p className="mb-2 text-[11px] text-slate-400">{vdbTwoWall.note}</p>
        ) : null}
        <StatusBadge
          ok={Boolean(vdbTwoWall.support)}
          okText="Two-wall derivative support confirmed"
          badText="Two-wall derivative support missing"
          pendingText="Awaiting two-wall derivative diagnostics"
        />
      </section>

      {/* Mechanical guard */}
        <section className="rounded-xl border border-white/10 bg-black/40 p-3 text-[12px]">
          <h2 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
            Casimir tile mechanical guard
            {proxyBadge(mechProxy)}
          </h2>
          <p className="mb-2 text-[11px] text-slate-300">
            Compare Casimir and patch-pressure load to the elastic restoring
            pressure at the requested gap and stroke.
          </p>

          <div className="mb-2 rounded bg-slate-900/60 p-2">
            <div className="font-mono text-[11px] text-slate-200">
              P_Casimir = (pi^2 hbar c) / (240 a^4)
              <br />
              P_electrostatic = 0.5 * eps0 * (V_patch / a)^2
              <br />
              P_restoring = D * clearance / (k * span^4)
              <br />
              margin = P_restoring - (P_Casimir + P_electrostatic)
            </div>
          </div>

          <dl className="space-y-1 text-[11px]">
            <Row label="gap_req">{fmtSci(mech.requestedGap_nm)} nm</Row>
            <Row label="gap_eff">{fmtSci(mech.constrainedGap_nm)} nm</Row>
            <Row label="S_mech">{fmtSci(mech.mechSafetyFactor)}</Row>
            <Row label="S_min">{fmtSci(mech.safetyFactorMin)}</Row>
          </dl>

          <div className="mt-2 grid grid-cols-2 gap-1 text-[11px]">
            <Row label="P_Casimir">{fmtSci(mech.casimirPressure_Pa)} Pa</Row>
            <Row label="P_electrostatic">{fmtSci(mech.electrostaticPressure_Pa)} Pa</Row>
            <Row label="P_load">{fmtSci(mech.loadPressure_Pa)} Pa</Row>
            <Row label="sigma_allow">{fmtSci(mech.sigmaAllow_Pa)} Pa</Row>
            <Row label="margin">{fmtSci(mech.margin_Pa)} Pa</Row>
            <Row label="maxStroke_pm">{fmtSci(mech.maxStroke_pm)} pm</Row>
          </div>

          <StatusBadge
            ok={mech.feasible}
            okText="margin > 0 and clearance > 0"
            badText="mechanical guard trip"
            pendingText="Awaiting mechanical guard data"
          />
        </section>

        {/* Metric adapter diagnostics */}
        <section className="rounded-xl border border-white/10 bg-black/40 p-3 text-[12px]">
          <h2 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
            Metric adapter (CL1-CL2)
            {proxyBadge(metricProxy)}
          </h2>
          <p className="mb-2 text-[11px] text-slate-300">
            Chart contract + shift diagnostics from the active warp adapter.
            Use these to verify the slicing assumptions behind CL1-CL2 comparisons.
          </p>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <span className="font-mono">theta.source={thetaProvenance.source}</span>
            <span className="font-mono">theta.congruence={thetaProvenance.congruence}</span>
            {thetaProvenance.reason ? (
              <span className="font-mono">theta.reason={thetaProvenance.reason}</span>
            ) : null}
            <Badge variant="outline" className={thetaBadgeTone}>
              {thetaBadgeLabel}
            </Badge>
          </div>

          <dl className="space-y-1 text-[11px]">
            <Row label="family">{metricAdapter.family ?? "n/a"}</Row>
            <Row label="requested">{metricAdapter.requestedField ?? "n/a"}</Row>
            <Row label="chart">{metricAdapter.chartLabel ?? "n/a"}</Row>
            <Row label="dt_gamma policy">{metricAdapter.dtGammaPolicy ?? "n/a"}</Row>
            <Row label="chart status">{metricAdapter.chartStatus ?? "n/a"}</Row>
            <Row label="alpha">{fmtSci(metricAdapter.alpha)}</Row>
            <Row label="gamma_xx">{fmtSci(metricAdapter.gammaXX)}</Row>
            <Row label="gamma_yy">{fmtSci(metricAdapter.gammaYY)}</Row>
            <Row label="gamma_zz">{fmtSci(metricAdapter.gammaZZ)}</Row>
            <Row label="theta method">{metricAdapter.betaMethod ?? "n/a"}</Row>
            <Row label="theta_max">{fmtSci(metricAdapter.betaThetaMax, 4)} 1/m</Row>
            <Row label="theta_rms">{fmtSci(metricAdapter.betaThetaRms, 4)} 1/m</Row>
            <Row label="curl_max">{fmtSci(metricAdapter.betaCurlMax, 4)} 1/m</Row>
            <Row label="curl_rms">{fmtSci(metricAdapter.betaCurlRms, 4)} 1/m</Row>
            <Row label="theta_conformal_max">
              {fmtSci(metricAdapter.betaThetaConformalMax, 4)} 1/m
            </Row>
            <Row label="theta_conformal_rms">
              {fmtSci(metricAdapter.betaThetaConformalRms, 4)} 1/m
            </Row>
            <Row label="|B'/B|_max">
              {fmtSci(metricAdapter.betaBPrimeOverBMax, 4)} 1/m
            </Row>
            <Row label="|B''/B|_max">
              {fmtSci(metricAdapter.betaBDoubleOverBMax, 4)} 1/m^2
            </Row>
            <Row label="samples">{fmtSci(metricAdapter.betaSampleCount)}</Row>
            <Row label="step_m">{fmtSci(metricAdapter.betaStep_m)}</Row>
          </dl>

          {metricAdapter.coordinateMap ? (
            <p className="mt-2 text-[11px] text-slate-400">
              coord: {metricAdapter.coordinateMap}
            </p>
          ) : null}
          {metricAdapter.chartNotes ? (
            <p className="mt-1 text-[11px] text-slate-400">
              notes: {metricAdapter.chartNotes}
            </p>
          ) : null}
          {metricAdapter.chartReason ? (
            <p className="mt-1 text-[11px] text-slate-400">
              contract: {metricAdapter.chartReason}
            </p>
          ) : null}
          {metricAdapter.betaNote ? (
            <p className="mt-1 text-[11px] text-slate-400">
              diag: {metricAdapter.betaNote}
            </p>
          ) : null}
        </section>

        {/* GR invariants */}
        <section className="rounded-xl border border-white/10 bg-black/40 p-3 text-[12px]">
          <h2 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
            GR invariants (CL0 helpers)
            {proxyBadge(invariantsProxy)}
          </h2>
          <p className="mb-2 text-[11px] text-slate-300">
            Scalar invariants from GR bricks. Use for CL0 equivalence checks
            when a diffeomorphism is not explicit.
          </p>

          <dl className="space-y-1 text-[11px]">
            <Row label="K_min">{fmtSci(invariants.kMin, 4)}</Row>
            <Row label="K_max">{fmtSci(invariants.kMax, 4)}</Row>
            <Row label="K_mean">{fmtSci(invariants.kMean, 4)}</Row>
            <Row label="K_p98">{fmtSci(invariants.kP98, 4)}</Row>
            <Row label="R4_min">{fmtSci(invariants.rMin, 4)}</Row>
            <Row label="R4_max">{fmtSci(invariants.rMax, 4)}</Row>
            <Row label="R4_mean">{fmtSci(invariants.rMean, 4)}</Row>
            <Row label="R4_p98">{fmtSci(invariants.rP98, 4)}</Row>
          </dl>

          <div className="mt-3">
            <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              CL0 delta vs baseline
              {proxyBadge(cl0Proxy)}
            </div>
            <dl className="space-y-1 text-[11px]">
              <Row label="delta_max">{fmtSci(cl0Delta.max, 4)}</Row>
              <Row label="K_mean_delta">{fmtSci(cl0Delta.kMean, 4)}</Row>
              <Row label="K_p98_delta">{fmtSci(cl0Delta.kP98, 4)}</Row>
              <Row label="R4_mean_delta">{fmtSci(cl0Delta.rMean, 4)}</Row>
              <Row label="R4_p98_delta">{fmtSci(cl0Delta.rP98, 4)}</Row>
              <Row label="baseline_age_s">{fmtSci(cl0Delta.baselineAge, 4)}</Row>
            </dl>
            {cl0Delta.baselineSource ? (
              <p className="mt-1 text-[11px] text-slate-400">
                baseline: {cl0Delta.baselineSource}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              <button
                type="button"
                className={cn(
                  "rounded border border-white/10 bg-white/5 px-2 py-1 text-slate-200 transition",
                  baselineReady && !baselinePending
                    ? "hover:border-white/30 hover:bg-white/10"
                    : "cursor-not-allowed opacity-60",
                )}
                onClick={() => setBaseline(false)}
                disabled={!baselineReady || baselinePending}
                title={
                  baselineReady
                    ? "Capture current GR invariants as CL0 baseline"
                    : "Baseline capture requires GR invariant stats"
                }
              >
                {baselinePending ? "Saving..." : "Set baseline"}
              </button>
              <button
                type="button"
                className={cn(
                  "rounded border border-white/10 bg-white/5 px-2 py-1 text-slate-200 transition",
                  cl0Delta.baselineSource && !baselinePending
                    ? "hover:border-white/30 hover:bg-white/10"
                    : "cursor-not-allowed opacity-60",
                )}
                onClick={() => setBaseline(true)}
                disabled={!cl0Delta.baselineSource || baselinePending}
                title="Clear stored CL0 baseline"
              >
                Clear baseline
              </button>
            </div>
          </div>

          <div className="mt-3">
              <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              CL3 constraint rho
              {proxyBadge(cl3Proxy || thetaStrictProxy || qiStrictProxy || tsStrictProxy)}
            </div>
            <dl className="space-y-1 text-[11px]">
              <Row label="rho_mean">{fmtSci(cl3.rhoMean, 4)}</Row>
              <Row label="rho_rms">{fmtSci(cl3.rhoRms, 4)}</Row>
              <Row label="rho_max_abs">{fmtSci(cl3.rhoMaxAbs, 4)}</Row>
              <Row label="rho_constraint_source"><span className="font-mono">{cl3.rhoSource ?? "n/a"}</span></Row>
              <Row label="matter_T00_mean">{fmtSci(cl3.matterMean, 4)}</Row>
              <Row label="rho_delta_mean">{fmtSci(cl3.deltaMean, 4)}</Row>
              <Row label="metric_T00_mean">{fmtSci(cl3.metricMean, 4)}</Row>
              <Row label="rho_delta_metric">{fmtSci(cl3.metricDeltaMean, 4)}</Row>
              <Row label="pipeline_T00_mean">{fmtSci(cl3.pipelineMean, 4)}</Row>
              <Row label="rho_delta_pipeline_telemetry">{fmtSci(cl3.pipelineDeltaMean, 4)}</Row>
              <Row label="rho_delta_threshold">{fmtSci(cl3.threshold, 4)}</Row>
              <Row label="rho_gate_source"><span className="font-mono">{cl3.gateSource ?? "n/a"}</span></Row>
              <Row label="rho_gate_reason"><span className="font-mono">{cl3.gateReason ?? "n/a"}</span></Row>
              <Row label="rho_missing_parts"><span className="font-mono">{cl3.missingParts ?? "n/a"}</span></Row>
              <Row label="congruence_missing_parts"><span className="font-mono">{cl3.congruenceMissingParts ?? "n/a"}</span></Row>
              <Row label="congruence_missing_count">{fmtSci(cl3.congruenceMissingCount, 2)}</Row>
              <Row label="congruence_missing_reason"><span className="font-mono">{cl3.congruenceMissingReason ?? "n/a"}</span></Row>
              <Row label="metric_t00_observer"><span className="font-mono">{cl3.metricObserver ?? "n/a"}</span></Row>
              <Row label="metric_t00_normalization"><span className="font-mono">{cl3.metricNormalization ?? "n/a"}</span></Row>
              <Row label="metric_t00_unit_system"><span className="font-mono">{cl3.metricUnitSystem ?? "n/a"}</span></Row>
              <Row label="metric_t00_contract_status"><span className="font-mono">{cl3.metricContractStatus ?? "n/a"}</span></Row>
              <Row label="metric_t00_contract_reason"><span className="font-mono">{cl3.metricContractReason ?? "n/a"}</span></Row>
              <Row label="theta_strict_mode">
                {thetaStrict.mode == null ? "n/a" : thetaStrict.mode ? "on" : "off"}
              </Row>
              <Row label="theta_strict_ok">
                {thetaStrict.ok == null ? "n/a" : thetaStrict.ok ? "true" : "false"}
              </Row>
              <Row label="theta_strict_reason"><span className="font-mono">{thetaStrict.reason ?? "n/a"}</span></Row>
              <Row label="theta_metric_derived">
                {thetaStrict.metricDerived == null
                  ? "n/a"
                  : thetaStrict.metricDerived
                    ? "true"
                    : "false"}
              </Row>
              <Row label="theta_metric_source"><span className="font-mono">{thetaStrict.metricSource ?? "n/a"}</span></Row>
              <Row label="theta_metric_reason"><span className="font-mono">{thetaStrict.metricReason ?? "n/a"}</span></Row>
              <Row label="theta_audit">{fmtSci(thetaStrict.audit, 4)}</Row>
              <Row label="qi_strict_mode">
                {qiStrict.mode == null ? "n/a" : qiStrict.mode ? "on" : "off"}
              </Row>
              <Row label="qi_strict_ok">
                {qiStrict.ok == null ? "n/a" : qiStrict.ok ? "true" : "false"}
              </Row>
              <Row label="qi_strict_reason"><span className="font-mono">{qiStrict.reason ?? "n/a"}</span></Row>
              <Row label="qi_rho_source"><span className="font-mono">{qiStrict.rhoSource ?? "n/a"}</span></Row>
              <Row label="qi_metric_derived">
                {qiStrict.metricDerived == null
                  ? "n/a"
                  : qiStrict.metricDerived
                    ? "true"
                    : "false"}
              </Row>
              <Row label="qi_metric_source"><span className="font-mono">{qiStrict.metricSource ?? "n/a"}</span></Row>
              <Row label="qi_metric_reason"><span className="font-mono">{qiStrict.metricReason ?? "n/a"}</span></Row>
              <Row label="ts_metric_derived">
                {tsStrict.metricDerived == null
                  ? "n/a"
                  : tsStrict.metricDerived
                    ? "true"
                    : "false"}
              </Row>
              <Row label="ts_metric_source"><span className="font-mono">{tsStrict.source ?? "n/a"}</span></Row>
              <Row label="ts_metric_reason"><span className="font-mono">{tsStrict.reason ?? "n/a"}</span></Row>
            </dl>
            <StatusBadge
              ok={cl3.gate}
              okText={`rho_delta <= ${fmtSci(cl3.threshold, 4)}`}
              badText={cl3BadText}
              pendingText="Awaiting CL3 delta gate"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Constraint-derived rho is compared to GR matter avg T00, metric T00 (when available),
              and pipeline rho_avg (unitSystem=gr).
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              TS strict congruence requires `ts_metric_derived=true`; hardware/proxy timing is blocked in strict mode.
              {proxyBadge(tsStrictProxy)}
            </p>
          </div>
          {(metricT00Diag.sampleCount != null ||
            metricT00Diag.rhoGeomMean != null ||
            metricT00Diag.rhoSiMean != null) && (
            <div className="mt-3">
              <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Metric T00 diagnostics
                {proxyBadge(metricT00DiagProxy)}
              </div>
              <dl className="space-y-1 text-[11px]">
                <Row label="sample_count">{fmtSci(metricT00Diag.sampleCount)}</Row>
                <Row label="rho_geom_mean">{fmtSci(metricT00Diag.rhoGeomMean, 4)}</Row>
                <Row label="rho_si_mean">{fmtSci(metricT00Diag.rhoSiMean, 4)} J/m^3</Row>
                <Row label="K_trace_mean">{fmtSci(metricT00Diag.kTraceMean, 4)} 1/m</Row>
                <Row label="K_sq_mean">{fmtSci(metricT00Diag.kSquaredMean, 4)} 1/m^2</Row>
                <Row label="step_m">{fmtSci(metricT00Diag.step_m)} m</Row>
                <Row label="scale_m">{fmtSci(metricT00Diag.scale_m)} m</Row>
              </dl>
            </div>
          )}

          <p className="mt-2 text-[11px] text-slate-400">
            Values are reported in the GR brick unit system.
          </p>
        </section>

        {/* Warp stress-energy (pipeline SI) */}
        <section className="rounded-xl border border-white/10 bg-black/40 p-3 text-[12px]">
          <h2 className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
            Warp stress-energy (pipeline SI)
            {proxyBadge(warpStressProxy)}
          </h2>
          <p className="mb-2 text-[11px] text-slate-300">
            Time-averaged stress-energy components reported by the warp module
            (SI units, J/m^3). These are pipeline stress components; metric T00 is
            shown in the CL3/Metric diagnostics above.
          </p>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
            <span className="font-mono">stress.source={stressMetaSource}</span>
            <span className="font-mono">stress.congruence={stressMetaCongruence}</span>
            {proxyBadge(stressMetaProxy)}
          </div>
          <dl className="space-y-1 text-[11px]">
            <Row label="T00_avg">{fmtSci(warpStress.t00, 4)} J/m^3</Row>
            <Row label="T11_avg">{fmtSci(warpStress.t11, 4)} J/m^3</Row>
            <Row label="T22_avg">{fmtSci(warpStress.t22, 4)} J/m^3</Row>
            <Row label="T33_avg">{fmtSci(warpStress.t33, 4)} J/m^3</Row>
          </dl>
        </section>
      </div>
    </div>
  );
}

function Row(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-slate-400">{props.label}</span>
      <span className="font-mono text-[11px] text-slate-50">
        {props.children}
      </span>
    </div>
  );
}

function StatusBadge(props: {
  ok?: boolean | null;
  okText: string;
  badText: string;
  pendingText: string;
}) {
  const { ok, okText, badText, pendingText } = props;
  const status =
    ok === true ? "ok" : ok === false ? "fail" : "pending";
  const klass =
    status === "ok"
      ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-100"
      : status === "fail"
        ? "border-rose-500/60 bg-rose-500/10 text-rose-100"
        : "border-slate-600/60 bg-slate-800/40 text-slate-300";
  return (
    <div className={`mt-3 rounded-md border px-2 py-1 text-[11px] ${klass}`}>
      {status === "ok"
        ? `OK: ${okText}`
        : status === "fail"
          ? `GUARD TRIP: ${badText}`
          : pendingText}
    </div>
  );
}

export default WarpProofPanel;



