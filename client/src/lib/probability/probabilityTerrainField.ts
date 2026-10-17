export function hash01(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function valueNoise(seed: string, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const xf = x - x0;
  const yf = y - y0;
  const sx = smoothstep(xf);
  const sy = smoothstep(yf);

  const n00 = hash01(`${seed}:${x0}:${y0}`);
  const n10 = hash01(`${seed}:${x0 + 1}:${y0}`);
  const n01 = hash01(`${seed}:${x0}:${y0 + 1}`);
  const n11 = hash01(`${seed}:${x0 + 1}:${y0 + 1}`);

  return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy);
}

export function probabilityTerrainNoise2D(
  seed: string,
  x: number,
  y: number,
  octaveCount = 4,
): number {
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let amplitudeSum = 0;

  for (let octave = 0; octave < octaveCount; octave += 1) {
    total += valueNoise(`${seed}:octave:${octave}`, x * frequency, y * frequency) * amplitude;
    amplitudeSum += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }

  return amplitudeSum > 0 ? total / amplitudeSum : 0;
}
