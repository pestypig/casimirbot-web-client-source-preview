export type ActivateCanonicalSummary = {
  strictCongruence: boolean;
  mode: string | null;
  family: string | null;
  chart: string | null;
  observer: string | null;
  normalization: string | null;
};

export type ActivateContractView = {
  ok: boolean;
  accepted: boolean;
  warnings: string[];
  diagnosticsPartial: boolean;
  pipelineUpdate: Record<string, unknown>;
  diagnostics: Record<string, unknown>;
  strictCongruence: boolean;
  canonical: ActivateCanonicalSummary;
};

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

const asBoolean = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null;

const toWarnings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

export const parseActivateContract = (payload: unknown): ActivateContractView => {
  const root = asObject(payload);
  const accepted = asBoolean(root.accepted) === true;
  const warnings = toWarnings(root.warnings);
  const diagnosticsPartial = warnings.includes("diagnostics_partial");

  const pipelineUpdate = asObject(root.pipelineUpdate);
  const diagnostics = asObject(root.diagnostics);
  const canonicalRaw = asObject(root.canonical);

  const strictCongruence =
    asBoolean(root.strictCongruence) ??
    asBoolean(canonicalRaw.strictCongruence) ??
    asBoolean(pipelineUpdate.strictCongruence) ??
    true;

  const canonical: ActivateCanonicalSummary = {
    strictCongruence,
    mode: asString(canonicalRaw.mode),
    family: asString(canonicalRaw.family),
    chart: asString(canonicalRaw.chart),
    observer: asString(canonicalRaw.observer),
    normalization: asString(canonicalRaw.normalization),
  };

  return {
    ok: asBoolean(root.ok) !== false,
    accepted,
    warnings,
    diagnosticsPartial,
    pipelineUpdate,
    diagnostics,
    strictCongruence,
    canonical,
  };
};
