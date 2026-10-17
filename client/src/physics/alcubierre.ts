export type Vec3 = readonly [number, number, number];

export interface AlcubierreParams {
  R: number;
  sigma: number;
  v: number;
  center: Vec3;
}

const EPS = 1e-9;
const INV16PI = 1 / (16 * Math.PI);
const ZERO_VEC3: Vec3 = [0, 0, 0];
export interface Complex2 {
  real: number;
  imag: number;
}

const ZERO_COMPLEX: Complex2 = Object.freeze({ real: 0, imag: 0 });
const G = 6.6743e-11; // SI units

const clampDenominator = (value: number) => {
  if (value >= 0) return Math.max(value, EPS);
  return Math.min(value, -EPS);
};

const sechSq = (x: number) => {
  const c = Math.cosh(x);
  if (!Number.isFinite(c) || c === 0) return 0;
  return 1 / (c * c);
};

export const radialDistance = (x: number, y: number, z: number, center: Vec3) => {
  const dx = x - center[0];
  const dy = y - center[1];
  const dz = z - center[2];
  return Math.hypot(dx, dy, dz);
};

export const shapeFunction = (rs: number, R: number, sigma: number) => {
  if (!Number.isFinite(rs)) return 0;
  const denom = clampDenominator(2 * Math.tanh(sigma * R));
  const tanhPlus = Math.tanh(sigma * (rs + R));
  const tanhMinus = Math.tanh(sigma * (rs - R));
  return (tanhPlus - tanhMinus) / denom;
};

export const shapeDerivative = (rs: number, R: number, sigma: number) => {
  if (!Number.isFinite(rs)) return 0;
  const denom = clampDenominator(2 * Math.tanh(sigma * R));
  const sechPlus = sechSq(sigma * (rs + R));
  const sechMinus = sechSq(sigma * (rs - R));
  return sigma * (sechPlus - sechMinus) / denom;
};

export const shapeGradient = (x: number, y: number, z: number, params: AlcubierreParams) => {
  const rs = radialDistance(x, y, z, params.center);
  if (rs < EPS) {
    return { rs, x: 0, y: 0, z: 0 };
  }
  const dfdr = shapeDerivative(rs, params.R, params.sigma);
  const scale = dfdr / rs;
  return {
    rs,
    x: scale * (x - params.center[0]),
    y: scale * (y - params.center[1]),
    z: scale * (z - params.center[2]),
  };
};

export const betaField = (x: number, y: number, z: number, params: AlcubierreParams) => {
  const rs = radialDistance(x, y, z, params.center);
  const f = shapeFunction(rs, params.R, params.sigma);
  const betaX = -params.v * f;
  return { rs, f, beta: { x: betaX, y: 0, z: 0 } };
};

export const metric = (x: number, y: number, z: number, params: AlcubierreParams) => {
  const { beta } = betaField(x, y, z, params);
  const betaSq = beta.x * beta.x + beta.y * beta.y + beta.z * beta.z;
  return {
    g_tt: -(1 - betaSq),
    g_tx: beta.x,
    g_ty: beta.y,
    g_tz: beta.z,
    g_xx: 1,
    g_yy: 1,
    g_zz: 1,
  };
};

export const theta = (x: number, y: number, z: number, params: AlcubierreParams) => {
  const grad = shapeGradient(x, y, z, params);
  return params.v * grad.x;
};

export const extrinsicCurvature = (
  x: number,
  y: number,
  z: number,
  params: AlcubierreParams
) => {
  const grad = shapeGradient(x, y, z, params);
  const vs = params.v;
  return {
    Kxx: -vs * grad.x,
    Kxy: -0.5 * vs * grad.y,
    Kxz: -0.5 * vs * grad.z,
    Kyy: 0,
    Kzz: 0,
    Kyz: 0,
  };
};

export const energyDensityEulerian = (
  x: number,
  y: number,
  z: number,
  params: AlcubierreParams
) => {
  const { Kxx, Kxy, Kxz, Kyy, Kzz, Kyz } = extrinsicCurvature(x, y, z, params);
  const trace = Kxx + Kyy + Kzz;
  const squared =
    Kxx * Kxx +
    Kyy * Kyy +
    Kzz * Kzz +
    2 * (Kxy * Kxy + Kxz * Kxz + Kyz * Kyz);
  return (trace * trace - squared) * INV16PI;
};

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
] as Vec3;

const scale = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s] as Vec3;
const diff = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]] as Vec3;
const magnitude = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);

const complexAdd = (a: Complex2, b: Complex2): Complex2 => ({ real: a.real + b.real, imag: a.imag + b.imag });
const complexSub = (a: Complex2, b: Complex2): Complex2 => ({ real: a.real - b.real, imag: a.imag - b.imag });
const complexScale = (c: Complex2, s: number): Complex2 => ({ real: c.real * s, imag: c.imag * s });
const complexSquare = (c: Complex2): Complex2 => ({
  real: c.real * c.real - c.imag * c.imag,
  imag: 2 * c.real * c.imag,
});
const complexMagnitude = (c: Complex2) => Math.hypot(c.real, c.imag);
const complexDivide = (a: Complex2, b: Complex2): Complex2 => {
  const denom = b.real * b.real + b.imag * b.imag;
  if (denom < EPS) return ZERO_COMPLEX;
  return {
    real: (a.real * b.real + a.imag * b.imag) / denom,
    imag: (a.imag * b.real - a.real * b.imag) / denom,
  };
};
const complexSqrt = (c: Complex2): Complex2 => {
  const r = complexMagnitude(c);
  if (r === 0) return ZERO_COMPLEX;
  const real = Math.sqrt(Math.max(0, (r + c.real) / 2));
  const imagSign = c.imag >= 0 ? 1 : -1;
  const imag = Math.sqrt(Math.max(0, (r - c.real) / 2)) * imagSign;
  return { real, imag };
};

export interface LaplaceRungeLenzInput {
  position: Vec3;
  velocity: Vec3;
  mass: number;
  couplingConstant?: number;
  centralMass?: number;
  standardGravitationalParameter?: number;
  gravitationalConstant?: number;
}

export interface LaplaceRungeLenzMeasure {
  vector: Vec3;
  magnitude: number;
  eccentricity: number;
  periapsisAngle: number;
  angularMomentum: Vec3;
  actionRate: number;
  oscillatorCoordinate: Complex2;
  oscillatorVelocity: Complex2;
  oscillatorEnergy: Complex2;
  planarResidual: number;
  geometryResidual: number;
  couplingConstant?: number;
}

const resolveCoupling = ({
  couplingConstant,
  standardGravitationalParameter,
  centralMass,
  gravitationalConstant,
  mass,
}: LaplaceRungeLenzInput): number | undefined => {
  if (Number.isFinite(couplingConstant)) return couplingConstant as number;
  if (Number.isFinite(standardGravitationalParameter)) {
    return (standardGravitationalParameter as number) * mass;
  }
  if (Number.isFinite(centralMass)) {
    const Guse = gravitationalConstant ?? G;
    return Guse * (centralMass as number) * mass;
  }
  return undefined;
};

export const computeLaplaceRungeLenz = (
  input: LaplaceRungeLenzInput,
): LaplaceRungeLenzMeasure => {
  const { position, velocity, mass } = input;
  const coupling = resolveCoupling(input);
  const rMag = magnitude(position);

  if (rMag === 0 || mass <= 0 || !Number.isFinite(mass)) {
    return {
      vector: ZERO_VEC3,
      magnitude: 0,
      eccentricity: 0,
      periapsisAngle: 0,
      angularMomentum: ZERO_VEC3,
      actionRate: 0,
      oscillatorCoordinate: ZERO_COMPLEX,
      oscillatorVelocity: ZERO_COMPLEX,
      oscillatorEnergy: ZERO_COMPLEX,
      planarResidual: 0,
      geometryResidual: 0,
      couplingConstant: coupling,
    };
  }

  const momentum = scale(velocity, mass);
  const angularMomentum = cross(position, momentum);
  const rungeCore = cross(momentum, angularMomentum);
  const rHat = scale(position, 1 / rMag);
  const couplingTerm = coupling ? scale(rHat, coupling) : ZERO_VEC3;
  const vector = coupling ? diff(rungeCore, couplingTerm) : rungeCore;
  const magnitudeA = magnitude(vector);
  const denom = coupling ? Math.max(1e-12, Math.abs(coupling)) : Infinity;
  const eccentricityValue = coupling ? magnitudeA / denom : 0;
  const actionRate = momentum[0] * velocity[0] + momentum[1] * velocity[1] + momentum[2] * velocity[2];

  const planar: Complex2 = { real: position[0], imag: position[1] };
  const planarVelocity: Complex2 = { real: velocity[0], imag: velocity[1] };
  const oscillatorCoordinate = complexSqrt(planar);
  const wSquared = complexSquare(oscillatorCoordinate);
  const planarResidual = complexMagnitude(complexSub(wSquared, planar));
  const denomVec = complexScale(oscillatorCoordinate, 2);
  const oscillatorVelocity =
    denomVec.real === 0 && denomVec.imag === 0 ? ZERO_COMPLEX : complexDivide(planarVelocity, denomVec);
  const oscillatorEnergy = complexAdd(
    complexScale(complexSquare(oscillatorVelocity), mass / 2),
    complexScale(wSquared, 4),
  );
  const geometryResidual = coupling ? Math.abs(magnitudeA - Math.abs(coupling) * eccentricityValue) : 0;

  return {
    vector,
    magnitude: magnitudeA,
    eccentricity: eccentricityValue,
    periapsisAngle: Math.atan2(vector[1], vector[0]),
    angularMomentum,
    actionRate,
    oscillatorCoordinate,
    oscillatorVelocity,
    oscillatorEnergy,
    planarResidual,
    geometryResidual,
    couplingConstant: coupling,
  };
};
