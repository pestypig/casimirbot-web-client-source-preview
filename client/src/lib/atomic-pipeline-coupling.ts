export type AtomicPipelineCouplingMode = "display_proxy";

export type AtomicPipelineCouplingContract = {
  mode: AtomicPipelineCouplingMode;
  domain: "telemetry_seed";
  equation_ref: null;
  uncertainty_model_id: null;
  citation_claim_ids: [];
  claim_tier: "diagnostic";
  certifying: false;
  driftFactor: number;
  note: string;
};

const DEFAULT_TS_RATIO = 100;

const toFiniteOrFallback = (value: number | null | undefined, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export function computeAtomicPipelineDrift(
  tsRatio: number | null | undefined,
  duty: number | null | undefined,
): number {
  const stability = toFiniteOrFallback(tsRatio, DEFAULT_TS_RATIO);
  const dutyCycle = toFiniteOrFallback(duty, 0);
  const driftFromTS = (stability - DEFAULT_TS_RATIO) / 600;
  const dutyMod = dutyCycle * 0.25;
  return 1 + driftFromTS + dutyMod;
}

export function buildAtomicPipelineCouplingContract(params: {
  tsRatio?: number | null;
  duty?: number | null;
}): AtomicPipelineCouplingContract {
  return {
    mode: "display_proxy",
    domain: "telemetry_seed",
    equation_ref: null,
    uncertainty_model_id: null,
    citation_claim_ids: [],
    claim_tier: "diagnostic",
    certifying: false,
    driftFactor: computeAtomicPipelineDrift(params.tsRatio, params.duty),
    note: "Display-only telemetry coupling for diagnostic drift visualization; not a physics assertion.",
  };
}

