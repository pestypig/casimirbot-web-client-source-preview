export type TermDef = {
  id: string;
  symbol?: string;
  label: string;
  unit?: string;
  define: string;
  why: string;
  sourceField?: string;
  cite?: string;
};

export const FIRST_READ_TERMS: TermDef[] = [
  {
    id: "a",
    symbol: "a",
    label: "gap",
    unit: "nm",
    define: "Plate separation; sets spectrum cutoff and static pressure.",
    why: "Changing the gap shifts the vacuum spectrum the tiles can harvest.",
    sourceField: "pipeline.gap_nm",
    cite: "client/src/hooks/use-energy-pipeline.ts",
  },
  {
    id: "t",
    symbol: "t",
    label: "sag",
    unit: "nm",
    define: "Bowl depth; reduces the effective gap a_eff.",
    why: "Engaging the bowl increases static pressure by shrinking a_eff.",
    sourceField: "pipeline.sag_nm",
    cite: "client/src/hooks/use-energy-pipeline.ts",
  },
  {
    id: "a_eff",
    symbol: "a_eff",
    label: "effective gap",
    unit: "nm",
    define: "Plate gap after sag (a - t). Sets cutoff and pressure.",
    why: "Smaller a_eff means stronger static Casimir and better leverage.",
    sourceField: "pipeline.gap_nm - pipeline.sag_nm",
    cite: "server/energy-pipeline.ts",
  },
  {
    id: "gamma_geo",
    symbol: "\u03b3_geo",
    label: "geometry gain",
    define: "Concavity multiplier a/a_eff.",
    why: "Amplifies per-tile energy without changing materials.",
    sourceField: "pipeline.gammaGeo",
    cite: "client/src/hooks/use-energy-pipeline.ts",
  },
  {
    id: "Q_L",
    symbol: "Q_L",
    label: "loaded quality",
    define: "Cavity linewidth: kappa = f0 / Q_L.",
    why: "Higher Q_L narrows linewidth and raises tile gain.",
    sourceField: "sweep.QL",
    cite: "client/src/hooks/use-energy-pipeline.ts",
  },
  {
    id: "epsilon",
    symbol: "\u03b5",
    label: "pump amplitude",
    define: "\u03b5 = chi * eta * m (modulation depth transduced to coupling).",
    why: "Directly sets rho and distance to the runaway edge.",
    sourceField: "sweep.pumpRatio / sweep.QL",
    cite: "client/src/lib/parametric-sweep.ts",
  },
  {
    id: "rho",
    symbol: "\u03c1",
    label: "normalized coupling",
    define: "g / g_th = \u03b5 * Q_L; threshold knob.",
    why: "Controls the headroom to lambda = 1 runaway.",
    sourceField: "sweep.pumpRatio",
    cite: "client/src/lib/parametric-sweep.ts",
  },
  {
    id: "lambda",
    symbol: "\u03bb",
    label: "effective gain",
    define: "\u03bb = \u03bb0 * cos(phi); must stay < 1.",
    why: "Crossing 1 collapses damping; safety margin is 1 - |lambda|.",
    sourceField: "sweep.subThresholdMargin",
    cite: "client/src/lib/parametric-sweep.ts",
  },
  {
    id: "kappa_eff",
    symbol: "\u03ba_eff",
    label: "effective linewidth",
    unit: "MHz",
    define: "\u03ba_eff = \u03ba * (1 - \u03c1 * cos(phi)).",
    why: "Falling to zero signals runaway gain.",
    sourceField: "sweep.kappaEff_MHz",
    cite: "modules/dynamic/dynamic-casimir.ts",
  },
  {
    id: "d_eff",
    symbol: "d_eff",
    label: "effective duty",
    define: "Ship-wide duty after sectoring; GR sees this average.",
    why: "Shrinks the source to satisfy quantum limits while keeping curvature.",
    sourceField: "pipeline.dutyEffectiveFR",
    cite: "client/src/hooks/use-energy-pipeline.ts",
  },
  {
    id: "TS",
    symbol: "TS",
    label: "homogenization",
    define: "Light-crossing / pulse timing ratio used by a cycle-average approximation.",
    why: "Timing context only; a ratio does not establish a same-chart source tensor or GR solution.",
    sourceField: "pipeline.TS_ratio",
    cite: "client/src/hooks/use-energy-pipeline.ts",
  },
  {
    id: "zeta",
    symbol: "\u03b6",
    label: "QI guard",
    define: "Ford-Roman margin scaled from d_eff.",
    why: "A pipeline guard proxy; a QEI worldline dossier is still required for a source claim.",
    sourceField: "pipeline.zeta",
    cite: "server/services/target-validation.ts",
  },
  {
    id: "kappa_drive",
    symbol: "\u03ba_drive",
    label: "drive curvature proxy",
    unit: "m^-2",
    define: "(8 pi G / c^5) * (P/A) * d_eff * G_geom; prefactor = 8 pi / (c^5/G) (inverse Planck power).",
    why: "Flux-to-curvature proxy for comparing drives or astrophysical luminosity/area on one axis (not a full Einstein solve).",
    sourceField: "pipeline.P_avg_W, pipeline.hullArea_m2",
    cite: "shared/theory/curvature-collapse-theory-badges.ts",
  },
  {
    id: "green_zone",
    label: "Legacy green-zone proxy",
    define: "{ q_mech <= 1, 1e5 <= gamma_VdB <= 1e6, zeta < 1, TS >> 1 }.",
    why: "These local conditions cannot establish physical viability or a certified NHM2 solve.",
    sourceField: "pipeline.guards",
    cite: "docs/sweeps.md",
  },
];

export const FIRST_READ_TERM_MAP = FIRST_READ_TERMS.reduce<Record<string, TermDef>>(
  (acc, term) => {
    acc[term.id] = term;
    return acc;
  },
  {},
);
