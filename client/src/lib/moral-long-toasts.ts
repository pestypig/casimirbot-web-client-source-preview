import { toast } from "@/hooks/use-toast";

export type MoralCtx =
  | "mode:switch"
  | "geom:gamma"
  | "geom:qfactor"
  | "geom:sag"
  | "drive:duty"
  | "drive:frequency"
  | "drive:sectors"
  | "limits:maxPower"
  | "limits:massTolerance"
  | "limits:zeta"
  | "limits:timescaleMin"
  | "sim:create"
  | "sim:start"
  | "mesh:export"
  | "helix:pulse"
  | "helix:manualPulse"
  | "helix:diagnostics"
  | "ui:realtimeToggle"
  | "docs:open";

export type MoralVals = Partial<{
  mode: "Hover" | "Cruise" | "Emergency" | "Standby" | string;
  gammaGeo: number;      // geometric amplification (γ_geo)
  qFactor: number;       // cavity Q
  sagDepthMm: number;    // bow curvature depth
  duty: number;          // duty cycle (0..1 or %)
  freqGHz: number;       // modulation frequency
  sectors: number;       // active sectors
  maxPowerMW: number;    // constraint
  massTolerancePct: number;
  zeta: number;          // Ford–Roman safety margin ζ
  tsRatio: number;       // T_s / T_LC (timescale separation)
  powerMW: number;       // current raw or average power
  exoticKg: number;      // computed exotic-mass equivalent
  hullReferenceRadiusM: number; // full-hull reference radius used by UI approximations
  gapNm: number;         // cavity gap
  frOk: boolean;
  natarioOk: boolean;
  curvatureOk: boolean;
}>;

const fmt = (x?: number, digits=3) => x==null ? "—" :
  (Math.abs(x)>=1e4 || Math.abs(x)<1e-3 ? x.toExponential(2) : x.toFixed(digits));

const ok = (b?: boolean) => b==null ? "—" : (b ? "✅" : "⚠️");

type Entry = {
  title: string;
  theory: (v: MoralVals)=>string;
  moral:    (v: MoralVals)=>string;
};

const hullReferenceRadius = (v: MoralVals) => v.hullReferenceRadiusM;

const MORAL_MAP: Record<MoralCtx, Entry> = {
  // --- GLOBAL / MODE ---
  "mode:switch": {
    title: "Operational Mode Committed",
    theory: v => `Mode set to ${v.mode ?? "—"}. This switches the target curvature profile and rebalances energy between contraction/expansion zones. The pipeline recalculates constraints (ζ=${fmt(v.zeta)}, T_s/T_LC=${fmt(v.tsRatio)}), expected power ${fmt(v.powerMW)} MW, and exotic-mass budget ${fmt(v.exoticKg)} kg.`,
    moral:   v => `Every journey begins in stillness. Choose your bearing, then move without hesitation—the right distance and the right moment as one (maai).`,
  },

  // --- GEOMETRY ---
  "geom:gamma": {
    title: "Geometry Amplification Adjusted (γ₍geo₎)",
    theory: v => `Geometric amplification set to γ_geo=${fmt(v.gammaGeo)} for full-hull reference radius ${fmt(hullReferenceRadius(v))} m and gap ${fmt(v.gapNm)} nm. This scales cycle-averaged cavity energy and therefore raw power and exotic-mass estimates under current constraints.`,
    moral:   v => `Stance before strike: arrange form for inevitability. Correct posture makes quiet outcomes.`,
  },
  "geom:qfactor": {
    title: "Cavity Q-Factor Tuned",
    theory: v => `Electromagnetic Q set to ${fmt(v.qFactor)}. Higher Q improves energy cycling efficiency but tightens sensitivity to timing and thermal limits. Effects propagate to power ${fmt(v.powerMW)} MW and ζ=${fmt(v.zeta)}.`,
    moral:   v => `The stiller the water, the clearer the reflection. Clarity invites accuracy; speed will follow.`,
  },
  "geom:sag": {
    title: "Sag / Bow Curvature Updated",
    theory: v => `Sag depth set to ${fmt(v.sagDepthMm)} mm. Boundary curvature perturbs local field distributions and meshes; meshing precision will gate solver accuracy for the selected geometry.`,
    moral:   v => `Rake the lines with intent. Small curves guide the whole garden.`,
  },

  // --- DRIVE ---
  "drive:duty": {
    title: "Duty Cycle Rebalanced",
    theory: v => `Duty set to ${fmt( (v.duty ?? 0)*100, 2)}%. Active/rest timing shifts power draw (${fmt(v.powerMW)} MW) and thermal load, and interacts with Q and phase to maintain T_s/T_LC=${fmt(v.tsRatio)}.`,
    moral:   v => `Breath and step together. Distance and timing are interdependent; harmony beats force.`,
  },
  "drive:frequency": {
    title: "Modulation Frequency Set",
    theory: v => `Drive frequency set to ${fmt(v.freqGHz)} GHz across ${fmt(v.sectors)} sectors. Frequency affects sector strobing, coupling to cavity resonances, and compliance windows for ζ and timescale separation.`,
    moral:   v => `Match the rhythm, don't force it. When the cadence is right, effort feels light.`,
  },
  "drive:sectors": {
    title: "Active Sectors Updated",
    theory: v => `Active sectors: ${fmt(v.sectors)}. Sector count shapes spatial duty distribution and pulse sequencing; correct phasing reduces spillover and improves lattice coherence.`,
    moral:   v => `Many hands, one motion. Coordination turns parts into purpose.`,
  },

  // --- CONSTRAINTS / LIMITS ---
  "limits:maxPower": {
    title: "Max Power Constraint Applied",
    theory: v => `Maximum power capped at ${fmt(v.maxPowerMW)} MW. The scheduler will throttle sequences to remain within curvature and thermal limits (ζ=${fmt(v.zeta)}; FR ${ok(v.frOk)}; Natário ${ok(v.natarioOk)}).`,
    moral:   v => `Compassion is part of skill. Restraint protects what you serve.`,
  },
  "limits:massTolerance": {
    title: "Mass Tolerance Window Set",
    theory: v => `Mass tolerance set to ±${fmt(v.massTolerancePct,2)}%. Budgeting accepts deviations within this band while preserving mission viability and compliance.`,
    moral:   v => `Hold the center lightly. Precision breathes better than rigidity.`,
  },
  "limits:zeta": {
    title: "Quantum-Inequality Guard (ζ) Adjusted",
    theory: v => `Safety margin ζ set/read at ${fmt(v.zeta)}. Operations will bias schedules to maintain Ford–Roman compliance (FR ${ok(v.frOk)}), even if it reduces instantaneous output.`,
    moral:   v => `Honor the boundary that keeps life whole. Correct form wins without excess.`,
  },
  "limits:timescaleMin": {
    title: "Minimum Time-Scale Separation Raised",
    theory: v => `Required T_s/T_LC set to ${fmt(v.tsRatio)} (min). The pipeline will reject sequences that homogenize too slowly, preventing spurious curvature growth.`,
    moral:   v => `Patience is speed in disguise. Let structure settle before you move again.`,
  },

  // --- SIMULATION & MESH ---
  "sim:create": {
    title: "Simulation Case Created",
    theory: v => `Initial parameters locked (γ_geo=${fmt(v.gammaGeo)}, Q=${fmt(v.qFactor)}, duty=${fmt( (v.duty??0)*100,2)}%). Baselines recorded for power and exotic-mass projections.`,
    moral:   v => `Set the distance first; timing will reveal itself. Maai turns choice into inevitability.`,
  },
  "sim:start": {
    title: "Simulation Started",
    theory: v => `Boundary-value solve launched for the current geometry/drive. Outputs will update power (${fmt(v.powerMW)} MW), ζ=${fmt(v.zeta)}, and exotic mass (${fmt(v.exoticKg)} kg).`,
    moral:   v => `Once the bow is loosed, preparation speaks. Trust the form you set.`,
  },
  "mesh:export": {
    title: "Mesh / .scuffgeo Exported",
    theory: v => `Discretization emitted (R=${fmt(hullReferenceRadius(v))} m, gap=${fmt(v.gapNm)} nm). Mesh fidelity now gates solver accuracy for field interactions.`,
    moral:   v => `Rake clean lines. The mesh is posture for the solver.`,
  },

  // --- HELIX-CORE EXECUTION ---
  "helix:pulse": {
    title: "Pulse Sequence Executed",
    theory: v => `Sequence fired at ${fmt(v.freqGHz)} GHz with duty ${fmt((v.duty??0)*100,2)}% across ${fmt(v.sectors)} sectors. Compliance check: FR ${ok(v.frOk)}, Natário ${ok(v.natarioOk)}, Curvature ${ok(v.curvatureOk)}.`,
    moral:   v => `Cut once, cleanly. Accuracy is final; the quiet strike matters.`,
  },
  "helix:manualPulse": {
    title: "Manual Pulse Sent",
    theory: v => `Single pulse injected to probe response under current tuning. Watch ζ=${fmt(v.zeta)} and T_s/T_LC=${fmt(v.tsRatio)} for immediate feedback.`,
    moral:   v => `Tap the drum, listen to the hall. Feedback teaches timing.`,
  },
  "helix:diagnostics": {
    title: "Diagnostics & Guards",
    theory: v => `Guards evaluated → FR ${ok(v.frOk)}, Natário ${ok(v.natarioOk)}, Curvature ${ok(v.curvatureOk)}. Schedules and power will throttle to remain inside the safe manifold.`,
    moral:   v => `Compassion is part of mastery. Guardrails preserve the mission and the crew.`,
  },

  // --- MISC UI ---
  "ui:realtimeToggle": {
    title: "Real-time View Toggled",
    theory: v => `Live updates ${v.mode==="on"?"enabled":"paused"}. Visuals now reflect streaming pipeline values; recorded metrics remain in History.`,
    moral:   v => `Stillness and motion are one practice. Pause to see clearly; resume to move cleanly.`,
  },
  "docs:open": {
    title: "Documentation Opened",
    theory: v => `Reference tables and derivations loaded for the current configuration. Use them to cross-check any surprising outputs.`,
    moral:   v => `Read once, act twice. Knowledge steadies the hand.`,
  },
};

export function moralLongToast(ctx: MoralCtx, v: MoralVals = {}) {
  const e = MORAL_MAP[ctx];
  if (!e) return;
  toast({
    title: e.title,
    description: `${e.theory(v)}\n\n${e.moral(v)}`,
    duration: 7000,
  });
}
