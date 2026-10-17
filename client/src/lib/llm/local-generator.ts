import type { RagChunk, RankedChunk } from "@/lib/rag/local-rag";

export class Xoroshiro128 {
  private a = 0x243f6a88 | 0;
  private b = 0x85a308d3 | 0;
  private c = 0x13198a2e | 0;
  private d = 0x03707344 | 0;

  constructor(seed: number) {
    this.a ^= seed | 0;
    this.b ^= (seed * 0x9e3779b9) | 0;
  }

  next() {
    const t = (this.b << 9) >>> 0;
    let r = (this.a * this.d) | 0;
    r = ((r << 5) | (r >>> 27)) | 0;
    this.c ^= this.a;
    this.d ^= this.b;
    this.b ^= this.c;
    this.a ^= this.d;
    this.c ^= t;
    this.d = ((this.d << 11) | (this.d >>> 21)) | 0;
    return ((r >>> 0) & 0xffffffff) / 4294967296;
  }
}

export function sampleTopP(logits: Float32Array, p: number, temp: number, rng: Xoroshiro128) {
  const { length } = logits;
  let max = -Number.MAX_VALUE;
  for (let i = 0; i < length; i += 1) {
    if (logits[i] > max) max = logits[i];
  }
  const probs = new Float32Array(length);
  let Z = 0;
  for (let i = 0; i < length; i += 1) {
    const value = Math.exp((logits[i] - max) / Math.max(temp, 1e-6));
    Z += value;
    probs[i] = value;
  }
  for (let i = 0; i < length; i += 1) probs[i] /= Z;
  const indices = Array.from({ length }, (_, idx) => idx).sort((lhs, rhs) => probs[rhs] - probs[lhs]);
  let cumulative = 0;
  let cutoff = indices.length;
  for (let i = 0; i < indices.length; i += 1) {
    cumulative += probs[indices[i]];
    if (cumulative >= p) {
      cutoff = i + 1;
      break;
    }
  }
  const keep = indices.slice(0, cutoff);
  let sum = 0;
  for (const idx of keep) sum += probs[idx];
  let draw = rng.next() * sum;
  for (const idx of keep) {
    if (draw < probs[idx]) return idx;
    draw -= probs[idx];
  }
  return keep[keep.length - 1];
}

const abstainThreshold = 0.08;

const clipTokens = (text: string, limit: number) => {
  if (limit <= 0) return "";
  const pieces = text.split(/(\s+)/).filter(Boolean);
  return pieces.slice(0, limit).join("");
};

const formatReferenceList = (heading: string, entries: RagChunk[]) => {
  if (!entries.length) return `${heading}\n[1] Local corpus - none`;
  const lines = entries.map((chunk, index) => {
    const origin = chunk.meta?.url ?? chunk.url ?? (chunk.docId ? `doc:${chunk.docId}` : "doc:unknown");
    const section = chunk.sectionPath ? ` (${chunk.sectionPath})` : "";
    const title = chunk.meta?.title ?? (chunk as any).title ?? chunk.docId ?? `Chunk ${index + 1}`;
    return `[${index + 1}] ${title}${section} - ${origin}`;
  });
  return `${heading}\n${lines.join("\n")}`;
};

export type LocalGenerateRequest = {
  prompt: string;
  ranked: RankedChunk[];
  seed: number;
  temperature: number;
  topP: number;
  maxTokens: number;
  grammar?: { suffix?: string };
};

export type LocalGenerateResult = {
  output: string;
  usage: { prompt: number; completion: number };
};

export function generateLocalResponse({
  prompt,
  ranked,
  seed,
  temperature,
  topP,
  maxTokens,
  grammar,
}: LocalGenerateRequest): LocalGenerateResult {
  const citedChunks = ranked.map((entry) => entry.chunk);
  const topScore = ranked[0]?.score ?? 0;
  const rng = new Xoroshiro128(seed >>> 0);
  let body: string;
  if (!ranked.length || topScore < abstainThreshold) {
    body =
      "Insufficient evidence in the local corpus; nearest material discusses spectral envelopes and coherence limits instead [1].";
  } else {
    const primaries = ranked.slice(0, 2);
    const fragments = primaries.map((entry, idx) => {
      const refId = idx + 1;
      const sentence = entry.chunk.text.replace(/\s+/g, " ").trim();
      const cutoff = Math.max(80, Math.min(160, Math.floor(sentence.length * 0.6)));
      const excerpt = sentence.slice(0, cutoff).trim();
      const section = entry.chunk.sectionPath ? ` (${entry.chunk.sectionPath})` : "";
      return `${excerpt}${excerpt.endsWith(".") ? "" : "..."}${section} [${refId}]`;
    });
    const noiseHint =
      "Structured colored noise S(omega) shapes branch updates while dissipative terms bound the energy budget over each spectral window";
    const branchPhrase =
      "Branch selection remains tied to the Helix correlation length rc and the injected weirdness T set by HCE";
    const picks = [noiseHint, branchPhrase, ...fragments];
    const start = Math.floor(rng.next() * picks.length) % picks.length;
    const ordered = [...picks.slice(start), ...picks.slice(0, start)];
    body = ordered.join(" ") + (temperature <= 0.1 ? " [1]" : "");
  }

  const heading = grammar?.suffix ?? "References:";
  const references = formatReferenceList(heading, citedChunks);
  const totalTokens = Math.max(8, Math.min(maxTokens, 768));
  const effectiveBody = clipTokens(body, totalTokens);
  const output = `${effectiveBody}\n\n${references}`;
  const completionTokens = output.split(/(\s+)/).filter(Boolean).length;

  return {
    output,
    usage: {
      prompt: Math.ceil(prompt.length / 4),
      completion: completionTokens,
    },
  };
}


