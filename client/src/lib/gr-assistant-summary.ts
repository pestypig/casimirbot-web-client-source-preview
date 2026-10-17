export type GrAssistantReportLike = {
  passed?: boolean;
  checks?: Array<{ check_name?: string }>;
  failed_checks?: Array<{ check_name?: string }>;
  assumptions?: {
    signature?: string;
    units_internal?: string;
    coords?: string[];
  };
  invariants?: Record<string, unknown>;
  brick_invariants?: Record<string, unknown>;
};

export type GrAssistantGateLike = {
  pass?: boolean;
  constraints?: Array<{ id?: string; status?: string }>;
  certificate?: { certificateHash?: string };
};

export type GrAssistantApiLike = {
  report?: GrAssistantReportLike;
  gate?: GrAssistantGateLike;
};

export type GrAssistantStatus = "pass" | "fail" | "unknown";

export type GrAssistantSummaryView = {
  report: GrAssistantReportLike;
  gate: GrAssistantGateLike | null;
  overallPass: boolean;
  status: GrAssistantStatus;
  firstFail: string | null;
  invariants: Array<[string, unknown]>;
  brickInvariants: Array<[string, unknown]>;
  assumptions: {
    signature: string;
    unitsInternal: string;
    coords: string[];
  };
};

const safeString = (value: unknown): string =>
  typeof value === "string" && value.trim().length > 0 ? value : "n/a";

export const buildGrAssistantSummary = (
  data: GrAssistantApiLike | null | undefined,
): GrAssistantSummaryView | null => {
  if (!data?.report) return null;
  const report = data.report;
  const gate = data.gate ?? null;
  const checks = Array.isArray(report.checks) ? report.checks : [];
  const failedChecks = Array.isArray(report.failed_checks) ? report.failed_checks : [];
  const gateConstraints = Array.isArray(gate?.constraints) ? gate!.constraints! : [];
  const gateFail = gateConstraints.find((entry) => entry?.status === "fail");
  const firstFail = failedChecks[0]?.check_name ?? gateFail?.id ?? null;

  const hasEvaluatedEvidence = checks.length > 0 || gateConstraints.length > 0;
  const overallPass = Boolean(report.passed) && (gate?.pass ?? true);
  const status: GrAssistantStatus = !hasEvaluatedEvidence
    ? "unknown"
    : overallPass
      ? "pass"
      : "fail";

  const assumptions = report.assumptions ?? {};
  const coords = Array.isArray(assumptions.coords)
    ? assumptions.coords.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];

  return {
    report,
    gate,
    overallPass,
    status,
    firstFail,
    invariants: Object.entries(report.invariants ?? {}),
    brickInvariants: Object.entries(report.brick_invariants ?? {}),
    assumptions: {
      signature: safeString(assumptions.signature),
      unitsInternal: safeString(assumptions.units_internal),
      coords: coords.length > 0 ? coords : ["n/a"],
    },
  };
};
