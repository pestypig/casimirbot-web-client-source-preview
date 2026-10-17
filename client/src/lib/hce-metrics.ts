const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export function mutualInformationBits(xs: number[], ys: number[], k: number): number {
  const n = Math.min(xs.length, ys.length);
  if (!Number.isFinite(k) || k <= 0 || n === 0) return 0;
  const joint = Array.from({ length: k }, () => new Array(k).fill(0));
  const mx = new Array(k).fill(0);
  const my = new Array(k).fill(0);
  for (let i = 0; i < n; i += 1) {
    const xi = clamp(xs[i], 0, k - 1) | 0;
    const yi = clamp(ys[i], 0, k - 1) | 0;
    joint[xi][yi] += 1;
    mx[xi] += 1;
    my[yi] += 1;
  }
  let mi = 0;
  for (let i = 0; i < k; i += 1) {
    for (let j = 0; j < k; j += 1) {
      const pxy = joint[i][j] / n;
      if (pxy <= 0) continue;
      const px = mx[i] / n;
      const py = my[j] / n;
      if (px <= 0 || py <= 0) continue;
      mi += pxy * Math.log2(pxy / (px * py));
    }
  }
  return mi;
}

export function dwellTimes(branches: number[], dtSec: number): number[] {
  if (!branches.length || !Number.isFinite(dtSec) || dtSec <= 0) return [];
  const out: number[] = [];
  let current = branches[0];
  let duration = 0;
  for (let i = 1; i < branches.length; i += 1) {
    duration += dtSec;
    if (branches[i] !== current) {
      out.push(duration);
      current = branches[i];
      duration = 0;
    }
  }
  out.push(duration);
  return out;
}

export function welchPSD(
  data: Float32Array,
  fs: number,
  winSec = 1.0,
  overlap = 0.5,
) {
  if (data.length === 0 || !Number.isFinite(fs) || fs <= 0) {
    return {
      freqs: new Float32Array(),
      psd: new Float32Array(),
    };
  }
  const nWin = Math.max(1, Math.floor(winSec * fs));
  const step = Math.max(1, Math.floor(nWin * (1 - overlap)));
  const hann = new Float32Array(nWin);
  const denom = nWin > 1 ? nWin - 1 : 1;
  for (let i = 0; i < nWin; i += 1) {
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / denom));
  }
  const specLen = Math.floor(nWin / 2) + 1;
  const psd = new Float32Array(specLen);
  let segments = 0;
  for (let offset = 0; offset + nWin <= data.length; offset += step) {
    segments += 1;
    let mean = 0;
    for (let i = 0; i < nWin; i += 1) {
      mean += data[offset + i];
    }
    mean /= nWin;
    for (let k = 0; k < specLen; k += 1) {
      let re = 0;
      let im = 0;
      for (let n = 0; n < nWin; n += 1) {
        const sample = (data[offset + n] - mean) * hann[n];
        const angle = (-2 * Math.PI * k * n) / nWin;
        re += sample * Math.cos(angle);
        im += sample * Math.sin(angle);
      }
      psd[k] += re * re + im * im;
    }
  }
  if (segments > 0) {
    for (let k = 0; k < specLen; k += 1) {
      psd[k] /= segments;
    }
  }
  const freqs = new Float32Array(specLen);
  for (let k = 0; k < specLen; k += 1) {
    freqs[k] = (k * fs) / nWin;
  }
  return { freqs, psd };
}

export function fitLorentzianAmps(
  freqs: Float32Array,
  psd: Float32Array,
  f0: number[],
  gamma: number[],
) {
  const m = f0.length;
  const n = freqs.length;
  if (!m || !n) return [];

  const A = Array.from({ length: m }, () => new Float64Array(n));
  for (let i = 0; i < m; i += 1) {
    const g = Math.max(1e-6, gamma[i]);
    const g2 = g * g;
    const f02 = f0[i] * f0[i];
    for (let k = 0; k < n; k += 1) {
      const f = freqs[k];
      const num = g2;
      const den =
        (f * f - f02) * (f * f - f02) + (g * f) * (g * f);
      A[i][k] = num / Math.max(1e-12, den);
    }
  }

  const AtY = new Float64Array(m);
  const G = Array.from({ length: m }, () => new Float64Array(m));
  for (let i = 0; i < m; i += 1) {
    for (let k = 0; k < n; k += 1) {
      AtY[i] += A[i][k] * psd[k];
    }
    for (let j = i; j < m; j += 1) {
      let sum = 0;
      for (let k = 0; k < n; k += 1) {
        sum += A[i][k] * A[j][k];
      }
      G[i][j] = sum;
      G[j][i] = sum;
    }
  }

  const L = Array.from({ length: m }, () => new Float64Array(m));
  for (let i = 0; i < m; i += 1) {
    for (let j = 0; j <= i; j += 1) {
      let s = G[i][j];
      for (let k = 0; k < j; k += 1) {
        s -= L[i][k] * L[j][k];
      }
      if (i === j) {
        L[i][j] = Math.sqrt(Math.max(1e-12, s));
      } else {
        L[i][j] = s / L[j][j];
      }
    }
  }

  const y = new Float64Array(m);
  for (let i = 0; i < m; i += 1) {
    let s = AtY[i];
    for (let k = 0; k < i; k += 1) {
      s -= L[i][k] * y[k];
    }
    y[i] = s / L[i][i];
  }

  const a = new Float64Array(m);
  for (let i = m - 1; i >= 0; i -= 1) {
    let s = y[i];
    for (let k = i + 1; k < m; k += 1) {
      s -= L[k][i] * a[k];
    }
    a[i] = s / L[i][i];
  }
  return Array.from(a);
}

export function toCSV(rows: (string | number)[][]): string {
  return rows
    .map((row) =>
      row
        .map((value) => {
          const text = String(value ?? "");
          const escaped = text.replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(","),
    )
    .join("\n");
}
