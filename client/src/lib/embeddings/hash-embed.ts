export type SanitizeOptions = {
  keepDiacritics?: boolean;
  extraAllowed?: RegExp;
};

const allowedCharacters = /\p{Letter}|\p{Mark}|\p{Number}|\s/gu;

export function sanitize(text: string, options: SanitizeOptions = {}) {
  const normalized = options.keepDiacritics ? text.normalize("NFKC") : text.normalize("NFKD");
  let out = "";
  for (const ch of normalized) {
    allowedCharacters.lastIndex = 0;
    if (allowedCharacters.test(ch)) {
      out += ch;
      continue;
    }
    if (options.extraAllowed) {
      options.extraAllowed.lastIndex = 0;
      if (options.extraAllowed.test(ch)) {
        out += ch;
      }
    }
  }
  return out.toLowerCase();
}

const fnvOffset = 2166136261 >>> 0;
const fnvPrime = 16777619;

function fnvHash(token: string, start: number, end: number) {
  let hash = fnvOffset;
  for (let i = start; i < end; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, fnvPrime);
  }
  return hash >>> 0;
}

const sign = (value: number) => ((value & 1) === 1 ? -1 : 1);

export function hashEmbed(
  text: string,
  dim = 512,
  ngrams: [number, number] = [3, 5],
  options?: SanitizeOptions
) {
  const vector = new Float32Array(dim);
  const clean = sanitize(text, options);
  const tokens = clean.split(/\s+/).filter(Boolean);

  for (const token of tokens) {
    for (let n = ngrams[0]; n <= ngrams[1]; n += 1) {
      if (token.length < n) continue;
      for (let i = 0; i <= token.length - n; i += 1) {
        const hash = fnvHash(token, i, i + n);
        const index = (hash >>> 1) % dim;
        vector[index] += sign(hash);
      }
    }
  }

  let norm = 0;
  for (let i = 0; i < dim; i += 1) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(Math.max(norm, 1e-9));
  for (let i = 0; i < dim; i += 1) {
    vector[i] /= norm;
  }
  return vector;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array) {
  const len = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < len; i += 1) {
    sum += a[i] * b[i];
  }
  return sum;
}
