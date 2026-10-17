import { kappa_u } from "@shared/curvature-proxy";

const PI = Math.PI;
const TWO_PI = PI * 2;
const DEFAULT_BOHR_RADIUS = 5.29177210903e-11;
const RADIAL_CDF_BINS = 1024;
const THETA_CDF_BINS = 1024;
const MIN_FLOAT = 1e-30;
const EV_TO_J = 1.602176634e-19;
const ATOMIC_PROXY_RELATIVE_1SIGMA = 0.35;
const ATOMIC_PROXY_UNCERTAINTY_MODEL_ID = "atomic_proxy_volume_scale_v1";

export type AtomicSimulationMode = "quantum" | "classical";
export type AtomicClaimTier = "diagnostic" | "reduced-order" | "certified";
export type AtomicProvenanceClass = "simulation" | "proxy";

export type AtomicQuantumNumbers = {
  n: number;
  l: number;
  m: number;
};

export type AtomicOrbitalPoint = {
  x: number;
  y: number;
  z: number;
  weight: number;
  phase: number;
};

export type AtomicOrbitalCloud = {
  mode: AtomicSimulationMode;
  claim_tier: AtomicClaimTier;
  provenance_class: AtomicProvenanceClass;
  certifying: boolean;
  n: number;
  l: number;
  m: number;
  points: AtomicOrbitalPoint[];
  extent: number;
  referenceRadius: number;
  source: "atoms-kavan010";
};

export type AtomicCloudBuildOptions = {
  sampleCount?: number;
  bohrRadius?: number;
  nuclearCharge?: number;
  seed?: number;
};

export type AtomicStressEnergyProxyInput = {
  energy_scalar_eV: number;
  effective_volume_m3: number;
};

export type AtomicStressEnergyProxyOutput = {
  energy_scalar_eV: number;
  energy_scalar_J: number;
  effective_volume_m3: number;
  energy_density_J_m3: number;
  kappa_proxy_m2: number;
  units: {
    energy_scalar_eV: "eV";
    energy_scalar_J: "J";
    effective_volume_m3: "m^3";
    energy_density_J_m3: "J/m^3";
    kappa_proxy_m2: "m^-2";
  };
  governance: {
    equation_ref: "atomic_energy_to_energy_density_proxy";
    uncertainty_model_id: string;
    citation_claim_ids: ["atomic_energy_to_energy_density_proxy.v1", ...string[]];
    claim_tier: "diagnostic";
    provenance_class: "proxy";
    certifying: false;
  };
  uncertainty: {
    relative_1sigma: number;
    absolute_1sigma_J_m3: number;
    assumptions: string;
    labels: ["volume_scale_ambiguity", ...string[]];
  };
  semantics: {
    interpretation: "diagnostic proxy";
    not_stress_energy_tensor_inference: true;
  };
};

export function computeAtomicStressEnergyProxy(
  input: AtomicStressEnergyProxyInput
): AtomicStressEnergyProxyOutput {
  const energy_scalar_eV = Number.isFinite(input.energy_scalar_eV) ? input.energy_scalar_eV : 0;
  const effective_volume_m3 = Math.max(MIN_FLOAT, Number.isFinite(input.effective_volume_m3) ? input.effective_volume_m3 : MIN_FLOAT);
  const energy_scalar_J = energy_scalar_eV * EV_TO_J;
  const energy_density_J_m3 = energy_scalar_J / effective_volume_m3;
  const kappa_proxy_m2 = kappa_u(energy_density_J_m3);
  const absolute_1sigma_J_m3 = Math.abs(energy_density_J_m3) * ATOMIC_PROXY_RELATIVE_1SIGMA;

  return {
    energy_scalar_eV,
    energy_scalar_J,
    effective_volume_m3,
    energy_density_J_m3,
    kappa_proxy_m2,
    units: {
      energy_scalar_eV: "eV",
      energy_scalar_J: "J",
      effective_volume_m3: "m^3",
      energy_density_J_m3: "J/m^3",
      kappa_proxy_m2: "m^-2"
    },
    governance: {
      equation_ref: "atomic_energy_to_energy_density_proxy",
      uncertainty_model_id: ATOMIC_PROXY_UNCERTAINTY_MODEL_ID,
      citation_claim_ids: ["atomic_energy_to_energy_density_proxy.v1"],
      claim_tier: "diagnostic",
      provenance_class: "proxy",
      certifying: false
    },
    uncertainty: {
      relative_1sigma: ATOMIC_PROXY_RELATIVE_1SIGMA,
      absolute_1sigma_J_m3,
      assumptions:
        "Volume-scale ambiguity dominates this diagnostic mapping; effective_volume_m3 is a coarse orbital localization proxy, not a measured confinement volume.",
      labels: ["volume_scale_ambiguity"]
    },
    semantics: {
      interpretation: "diagnostic proxy",
      not_stress_energy_tensor_inference: true
    }
  };
}

type RadialCdf = {
  cdf: Float64Array;
  maxRadius: number;
};

const radialCdfCache = new Map<string, RadialCdf>();
const thetaCdfCache = new Map<string, Float64Array>();

export function buildAtomicOrbitalCloud(
  mode: AtomicSimulationMode,
  quantumNumbers: AtomicQuantumNumbers,
  options: AtomicCloudBuildOptions = {}
): AtomicOrbitalCloud {
  const normalized = normalizeQuantumNumbers(quantumNumbers);
  const sampleCount = Math.max(96, Math.min(4000, options.sampleCount ?? (mode === "quantum" ? 650 : 260)));
  const nuclearCharge = Math.max(1, options.nuclearCharge ?? 1);
  const bohrRadius = Math.max(MIN_FLOAT, options.bohrRadius ?? DEFAULT_BOHR_RADIUS / nuclearCharge);
  if (mode === "classical") {
    return buildClassicalCloud(normalized, sampleCount, bohrRadius, options.seed);
  }
  return buildQuantumCloud(normalized, sampleCount, bohrRadius, options.seed);
}

function buildQuantumCloud(
  quantumNumbers: AtomicQuantumNumbers,
  sampleCount: number,
  bohrRadius: number,
  seed?: number
): AtomicOrbitalCloud {
  const { n, l, m } = quantumNumbers;
  const mAbs = Math.abs(m);
  const rng = createRng(seed ?? hashSeed(`quantum-${n}-${l}-${m}`));
  const { cdf: radialCdf, maxRadius } = getRadialCdf(n, l, bohrRadius);
  const thetaCdf = getThetaCdf(l, mAbs);
  const points: AtomicOrbitalPoint[] = [];
  const rawDensity: number[] = [];
  const angularNorm = ((2 * l + 1) / (4 * PI)) * (factorial(l - mAbs) / factorial(l + mAbs));
  let maxDensity = MIN_FLOAT;

  for (let i = 0; i < sampleCount; i++) {
    const radius = sampleFromCdf(radialCdf, maxRadius, rng());
    const theta = sampleFromCdf(thetaCdf, PI, rng());
    const phi = rng() * TWO_PI;
    const density = orbitalDensity(n, l, mAbs, radius, theta, bohrRadius, angularNorm);
    maxDensity = Math.max(maxDensity, density);

    const sinTheta = Math.sin(theta);
    points.push({
      x: radius * sinTheta * Math.cos(phi),
      y: radius * Math.cos(theta),
      z: radius * sinTheta * Math.sin(phi),
      weight: 0,
      phase: m * phi
    });
    rawDensity.push(density);
  }

  const invMax = 1 / maxDensity;
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const density = rawDensity[i] ?? 0;
    point.weight = clamp01(density * invMax);
  }

  const extent = calculateExtent(points);
  return {
    mode: "quantum",
    claim_tier: "diagnostic",
    provenance_class: "simulation",
    certifying: false,
    n,
    l,
    m,
    points,
    extent,
    referenceRadius: n * n * bohrRadius,
    source: "atoms-kavan010"
  };
}

function buildClassicalCloud(
  quantumNumbers: AtomicQuantumNumbers,
  sampleCount: number,
  bohrRadius: number,
  seed?: number
): AtomicOrbitalCloud {
  const { n, l, m } = quantumNumbers;
  const rng = createRng(seed ?? hashSeed(`classical-${n}-${l}-${m}`));
  // bohrRadius is already effective (a0/Z by default), so avoid double-scaling by Z.
  const referenceRadius = n * n * bohrRadius;
  const eccentricity = Math.min(0.35, Math.abs(m) * 0.08);
  const tilt = Math.min(PI / 3, l * 0.18);
  const points: AtomicOrbitalPoint[] = [];

  for (let i = 0; i < sampleCount; i++) {
    const fraction = sampleCount <= 1 ? 0 : i / sampleCount;
    const phase = fraction * TWO_PI;
    const denominator = Math.max(0.3, 1 + eccentricity * Math.cos(phase));
    const orbitRadius = (referenceRadius * (1 - eccentricity * eccentricity)) / denominator;
    const thickness = referenceRadius * 0.025;
    const offset = (rng() - 0.5) * thickness;
    const x = (orbitRadius + offset) * Math.cos(phase);
    const yz = (orbitRadius + offset) * Math.sin(phase);
    const y = yz * Math.cos(tilt);
    const z = yz * Math.sin(tilt);
    points.push({
      x,
      y,
      z,
      weight: 0.7 + 0.25 * Math.cos(phase * (1 + Math.abs(m) * 0.2)),
      phase
    });
  }

  const extent = calculateExtent(points);
  return {
    mode: "classical",
    claim_tier: "diagnostic",
    provenance_class: "proxy",
    certifying: false,
    n,
    l,
    m,
    points,
    extent,
    referenceRadius,
    source: "atoms-kavan010"
  };
}

function orbitalDensity(
  n: number,
  l: number,
  mAbs: number,
  radius: number,
  theta: number,
  bohrRadius: number,
  angularNorm: number
) {
  const radial = radialWavefunction(n, l, radius, bohrRadius);
  const legendre = associatedLegendre(l, mAbs, Math.cos(theta));
  const angular = angularNorm * legendre * legendre;
  return radial * radial * angular;
}

function getRadialCdf(n: number, l: number, bohrRadius: number): RadialCdf {
  const key = `${n}-${l}-${bohrRadius.toExponential(6)}`;
  const cached = radialCdfCache.get(key);
  if (cached) return cached;

  const maxRadius = 12 * n * n * bohrRadius;
  const cdf = new Float64Array(RADIAL_CDF_BINS);
  let sum = 0;
  for (let i = 0; i < RADIAL_CDF_BINS; i++) {
    const radius = (i / (RADIAL_CDF_BINS - 1)) * maxRadius;
    const radial = radialWavefunction(n, l, radius, bohrRadius);
    const pdf = radius * radius * radial * radial;
    sum += Math.max(0, pdf);
    cdf[i] = sum;
  }

  const norm = sum > MIN_FLOAT ? 1 / sum : 1;
  for (let i = 0; i < cdf.length; i++) {
    cdf[i] *= norm;
  }

  const built: RadialCdf = { cdf, maxRadius };
  radialCdfCache.set(key, built);
  return built;
}

function getThetaCdf(l: number, mAbs: number) {
  const key = `${l}-${mAbs}`;
  const cached = thetaCdfCache.get(key);
  if (cached) return cached;

  const cdf = new Float64Array(THETA_CDF_BINS);
  let sum = 0;
  for (let i = 0; i < THETA_CDF_BINS; i++) {
    const theta = (i / (THETA_CDF_BINS - 1)) * PI;
    const legendre = associatedLegendre(l, mAbs, Math.cos(theta));
    const pdf = Math.sin(theta) * legendre * legendre;
    sum += Math.max(0, pdf);
    cdf[i] = sum;
  }

  const norm = sum > MIN_FLOAT ? 1 / sum : 1;
  for (let i = 0; i < cdf.length; i++) {
    cdf[i] *= norm;
  }

  thetaCdfCache.set(key, cdf);
  return cdf;
}

function sampleFromCdf(cdf: Float64Array, maxValue: number, sample: number) {
  if (cdf.length <= 1) return 0;
  let lo = 0;
  let hi = cdf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (cdf[mid] < sample) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return 0;
  const prevIdx = lo - 1;
  const prev = cdf[prevIdx] ?? 0;
  const next = cdf[lo] ?? 1;
  const span = Math.max(MIN_FLOAT, next - prev);
  const t = (sample - prev) / span;
  const idx = prevIdx + t;
  return (idx / (cdf.length - 1)) * maxValue;
}

function radialWavefunction(n: number, l: number, radius: number, bohrRadius: number) {
  const rho = (2 * radius) / (n * bohrRadius);
  const k = n - l - 1;
  const alpha = 2 * l + 1;
  const norm = Math.sqrt(
    Math.pow(2 / (n * bohrRadius), 3) * (factorial(n - l - 1) / (2 * n * factorial(n + l)))
  );
  const laguerre = associatedLaguerre(k, alpha, rho);
  return norm * Math.exp(-rho / 2) * Math.pow(rho, l) * laguerre;
}

function associatedLaguerre(k: number, alpha: number, x: number) {
  if (k <= 0) return 1;
  if (k === 1) return 1 + alpha - x;
  let lNm2 = 1;
  let lNm1 = 1 + alpha - x;
  let current = lNm1;
  for (let n = 2; n <= k; n++) {
    current = ((2 * n - 1 + alpha - x) * lNm1 - (n - 1 + alpha) * lNm2) / n;
    lNm2 = lNm1;
    lNm1 = current;
  }
  return current;
}

function associatedLegendre(l: number, mAbs: number, x: number) {
  let pmm = 1;
  if (mAbs > 0) {
    const somx2 = Math.sqrt(Math.max(0, (1 - x) * (1 + x)));
    let factor = 1;
    for (let i = 1; i <= mAbs; i++) {
      pmm *= -factor * somx2;
      factor += 2;
    }
  }
  if (l === mAbs) return pmm;
  let pmmp1 = x * (2 * mAbs + 1) * pmm;
  if (l === mAbs + 1) return pmmp1;
  let pll = pmmp1;
  for (let ll = mAbs + 2; ll <= l; ll++) {
    pll = ((2 * ll - 1) * x * pmmp1 - (ll + mAbs - 1) * pmm) / (ll - mAbs);
    pmm = pmmp1;
    pmmp1 = pll;
  }
  return pll;
}

function normalizeQuantumNumbers(quantumNumbers: AtomicQuantumNumbers): AtomicQuantumNumbers {
  const n = clampInt(quantumNumbers.n, 1, 7);
  const l = clampInt(quantumNumbers.l, 0, n - 1);
  const m = clampInt(quantumNumbers.m, -l, l);
  return { n, l, m };
}

function calculateExtent(points: AtomicOrbitalPoint[]) {
  let extent = 0;
  for (const point of points) {
    extent = Math.max(extent, Math.abs(point.x), Math.abs(point.y), Math.abs(point.z));
  }
  return Math.max(extent, MIN_FLOAT);
}

function factorial(value: number) {
  if (value <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= value; i++) result *= i;
  return result;
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function clampInt(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function createRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
