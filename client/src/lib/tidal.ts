export type V3 = [number, number, number];

type EigenFrame = {
  eigenvalues: [number, number, number];
  principalAxes: [V3, V3, V3];
};

export function computeTidalEij(
  phi: Float32Array,
  positions: V3[],
): { norm: number } & EigenFrame {
  const count = Math.min(phi.length, positions.length);
  if (count < 9) {
    return {
      norm: 0,
      eigenvalues: [0, 0, 0],
      principalAxes: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    };
  }

  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < count; i++) {
    const [x, y, z] = positions[i];
    cx += x;
    cy += y;
    cz += z;
  }
  cx /= count;
  cy /= count;
  cz /= count;

  const unknowns = 10;
  const G = Array.from({ length: unknowns }, () => Array(unknowns).fill(0));
  const h = Array(unknowns).fill(0);

  for (let i = 0; i < count; i++) {
    const [px, py, pz] = positions[i];
    const x = px - cx;
    const y = py - cy;
    const z = pz - cz;
    const basis = [
      1,
      x,
      y,
      z,
      0.5 * x * x,
      0.5 * y * y,
      0.5 * z * z,
      x * y,
      x * z,
      y * z,
    ];
    const value = phi[i];
    for (let r = 0; r < unknowns; r++) {
      h[r] += basis[r] * value;
      const fr = basis[r];
      for (let c = r; c < unknowns; c++) {
        G[r][c] += fr * basis[c];
      }
    }
  }

  for (let r = 0; r < unknowns; r++) {
    for (let c = 0; c < r; c++) {
      G[r][c] = G[c][r];
    }
  }

  const w = solveSymmetric(G, h);
  const coeff = (idx: number) => {
    const val = w[idx];
    return Number.isFinite(val) ? val : 0;
  };

  const Hxx = 2 * coeff(4);
  const Hyy = 2 * coeff(5);
  const Hzz = 2 * coeff(6);
  const Hxy = coeff(7);
  const Hxz = coeff(8);
  const Hyz = coeff(9);

  const traceThird = (Hxx + Hyy + Hzz) / 3;
  const E = [
    [Hxx - traceThird, Hxy, Hxz],
    [Hxy, Hyy - traceThird, Hyz],
    [Hxz, Hyz, Hzz - traceThird],
  ];

  const norm = Math.sqrt(
    E[0][0] * E[0][0] +
      E[1][1] * E[1][1] +
      E[2][2] * E[2][2] +
      2 *
        (E[0][1] * E[0][1] + E[0][2] * E[0][2] + E[1][2] * E[1][2]),
  );

  const { vals, vecs } = jacobiEigenSym3(E);
  const order = [0, 1, 2].sort(
    (a, b) => Math.abs(vals[b]) - Math.abs(vals[a]),
  );

  return {
    norm,
    eigenvalues: [
      vals[order[0]],
      vals[order[1]],
      vals[order[2]],
    ],
    principalAxes: [
      vecs[order[0]],
      vecs[order[1]],
      vecs[order[2]],
    ],
  };
}

function solveSymmetric(G: number[][], h: number[]): number[] {
  const n = G.length;
  const A = G.map((row) => row.slice());
  const b = h.slice();

  for (let k = 0; k < n; k++) {
    let pivot = k;
    let maxVal = Math.abs(A[k][k]);
    for (let i = k + 1; i < n; i++) {
      const candidate = Math.abs(A[i][k]);
      if (candidate > maxVal) {
        maxVal = candidate;
        pivot = i;
      }
    }

    if (pivot !== k) {
      [A[k], A[pivot]] = [A[pivot], A[k]];
      [b[k], b[pivot]] = [b[pivot], b[k]];
    }

    const diagRaw = A[k][k];
    const diag =
      Math.abs(diagRaw) > 1e-18 ? diagRaw : diagRaw >= 0 ? 1e-18 : -1e-18;

    for (let j = k; j < n; j++) {
      A[k][j] /= diag;
    }
    b[k] /= diag;

    for (let i = 0; i < n; i++) {
      if (i === k) continue;
      const factor = A[i][k];
      if (factor === 0) continue;
      for (let j = k; j < n; j++) {
        A[i][j] -= factor * A[k][j];
      }
      b[i] -= factor * b[k];
    }
  }

  return b;
}

function jacobiEigenSym3(matrix: number[][]): {
  vals: [number, number, number];
  vecs: [V3, V3, V3];
} {
  const A = [
    [matrix[0][0], matrix[0][1], matrix[0][2]],
    [matrix[1][0], matrix[1][1], matrix[1][2]],
    [matrix[2][0], matrix[2][1], matrix[2][2]],
  ];
  const V: number[][] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  for (let iter = 0; iter < 12; iter++) {
    let p = 0;
    let q = 1;
    let max = Math.abs(A[0][1]);

    if (Math.abs(A[0][2]) > max) {
      max = Math.abs(A[0][2]);
      p = 0;
      q = 2;
    }
    if (Math.abs(A[1][2]) > max) {
      max = Math.abs(A[1][2]);
      p = 1;
      q = 2;
    }

    if (max < 1e-18) break;

    const app = A[p][p];
    const aqq = A[q][q];
    const apq = A[p][q];

    const phi = 0.5 * Math.atan2(2 * apq, aqq - app);
    const c = Math.cos(phi);
    const s = Math.sin(phi);

    for (let i = 0; i < 3; i++) {
      if (i !== p && i !== q) {
        const aip = A[i][p];
        const aiq = A[i][q];
        A[i][p] = c * aip - s * aiq;
        A[p][i] = A[i][p];
        A[i][q] = s * aip + c * aiq;
        A[q][i] = A[i][q];
      }
    }

    const appNew = c * c * app - 2 * s * c * apq + s * s * aqq;
    const aqqNew = s * s * app + 2 * s * c * apq + c * c * aqq;

    A[p][p] = appNew;
    A[q][q] = aqqNew;
    A[p][q] = 0;
    A[q][p] = 0;

    for (let i = 0; i < 3; i++) {
      const vip = V[i][p];
      const viq = V[i][q];
      V[i][p] = c * vip - s * viq;
      V[i][q] = s * vip + c * viq;
    }
  }

  return {
    vals: [A[0][0], A[1][1], A[2][2]],
    vecs: [
      [V[0][0], V[1][0], V[2][0]] as V3,
      [V[0][1], V[1][1], V[2][1]] as V3,
      [V[0][2], V[1][2], V[2][2]] as V3,
    ],
  };
}
