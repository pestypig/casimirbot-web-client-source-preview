/* Beat/Bar scheduler with sample-accurate boundaries and a beat-locked LFO.
   - Deterministic (double precision accumulators)
   - Handles arbitrary BPM, time signatures, and downbeat offset
   - Dotted and triplet note values
*/

export type TimeSig = `${number}/${number}`;

export type NoteSpec =
  | "bar"
  | "beat" // denominator-defined beat (e.g., a quarter in 4/4)
  | "1/1"
  | "1/2"
  | "1/4"
  | "1/8"
  | "1/16"
  | "1/32"
  | "1/2."
  | "1/4."
  | "1/8."
  | "1/16." // dotted
  | "1/3T"
  | "1/6T"
  | "1/12T"
  | "1/24T"; // triplet (per quarter)

export interface GridInfo {
  sr: number; // sample rate
  bpm: number; // beats per minute (denominator-defined beat)
  timeSig: TimeSig; // "num/den"
  offsetMs: number; // downbeat offset relative to buffer start
  spBeat: number; // samples per beat (denominator-defined)
  spBar: number; // samples per bar
  spQuarter: number; // samples per quarter note
  beatsPerBar: number;
  den: number;
}

/** Parse a NoteSpec into a fraction of a quarter note (r of T_quarter). */
export function noteSpecToQuarterRatio(n: NoteSpec): number {
  // Base plain values relative to a quarter note
  const base: Record<string, number> = {
    "1/1": 4,
    "1/2": 2,
    "1/4": 1,
    "1/8": 1 / 2,
    "1/16": 1 / 4,
    "1/32": 1 / 8,
  };
  if (n === "bar" || n === "beat") return NaN; // handled separately
  if (n.endsWith(".")) {
    const root = n.slice(0, -1);
    const r = base[root];
    if (r == null) throw new Error(`Bad dotted note ${n}`);
    return r * 1.5; // dotted = 3/2
  }
  if (n.endsWith("T")) {
    const root = n.slice(0, -1);
    const r = base[root];
    if (r == null) throw new Error(`Bad triplet note ${n}`);
    return r * (2 / 3); // triplet = 2/3 of straight
  }
  const r = base[n];
  if (r == null) throw new Error(`Unknown note ${n}`);
  return r;
}

/** Build immutable grid constants. */
export function makeGrid(sr: number, bpm: number, timeSig: TimeSig, offsetMs = 0): GridInfo {
  const [num, den] = timeSig.split("/").map(Number);
  // "Beat" is the denominator-defined beat length
  const spBeat = sr * (60 / bpm) * (4 / den); // samples per beat (denominator)
  const spQuarter = sr * (60 / bpm); // samples per quarter note
  const spBar = spBeat * num; // samples per bar
  return {
    sr,
    bpm,
    timeSig,
    offsetMs,
    spBeat,
    spBar,
    spQuarter,
    beatsPerBar: num,
    den,
  };
}

/** Compute samples per step for a given NoteSpec. */
export function samplesPerStep(grid: GridInfo, n: NoteSpec): number {
  if (n === "bar") return grid.spBar;
  if (n === "beat") return grid.spBeat;
  const r = noteSpecToQuarterRatio(n);
  return r * grid.spQuarter;
}

/** Iterator over boundary sample indices within [start, end). */
export function* iterBoundaries(
  grid: GridInfo,
  note: NoteSpec,
  rangeStart: number,
  rangeEnd: number,
): Iterable<number> {
  const step = samplesPerStep(grid, note);
  const offset = Math.round((grid.offsetMs / 1000) * grid.sr); // downbeat offset in samples
  if (step <= 0) return;

  // First real boundary at: b0 = offset + k*step >= rangeStart
  const k0 = Math.ceil((rangeStart - offset) / step);
  let pos = offset + k0 * step; // double precision "true" boundary
  // Yield rounded indices; step with double, no long-term drift
  while (pos < rangeEnd) {
    yield Math.round(pos);
    pos += step;
  }
}

/** Convenience: all bar starts in [start,end). */
export function barBoundaries(grid: GridInfo, start: number, end: number) {
  return Array.from(iterBoundaries(grid, "bar", start, end));
}

/** Convenience: note boundaries for 1/16, 1/8, etc. */
export function noteBoundaries(grid: GridInfo, spec: NoteSpec, start: number, end: number) {
  return Array.from(iterBoundaries(grid, spec, start, end));
}

/** Beat-locked LFO: tempo-synced oscillator with boundary resync. */
export class BeatLockedLFO {
  private sr: number;
  private freq = 0;
  private phase: number;
  private dphi: number;

  constructor(sr: number, bpm: number, ratioNumerator = 1, ratioDenominator = 1, initialPhase = 0) {
    this.sr = sr;
    this.setTempo(bpm, ratioNumerator, ratioDenominator);
    this.phase = initialPhase;
    this.dphi = (2 * Math.PI * this.freq) / this.sr;
  }

  /** f = (BPM/60) * (p/q) */
  setTempo(bpm: number, p = 1, q = 1) {
    this.freq = (bpm / 60) * (p / q);
    this.dphi = (2 * Math.PI * this.freq) / this.sr;
  }

  /** Reset phase at a boundary (e.g., bar start) to stay grid-locked. */
  reset(phase = 0) {
    this.phase = phase;
  }

  /** Advance n samples; return tuple to generate a block cheaply. */
  advance(n: number): { phase0: number; dphi: number } {
    const out = { phase0: this.phase, dphi: this.dphi };
    this.phase += this.dphi * n;
    // keep bounded for numerical stability
    this.phase = this.phase % (2 * Math.PI);
    return out;
  }

  /** Fill a sine LFO into dest (optional helper). */
  fillSine(dest: Float32Array, gain = 1) {
    let ph = this.phase;
    for (let i = 0; i < dest.length; i += 1) {
      dest[i] = Math.sin(ph) * gain;
      ph += this.dphi;
    }
    this.phase = ph % (2 * Math.PI);
  }
}

/** Find split sizes for a processing block if it crosses any boundaries.
 *  Returns an array of segment lengths that partition [blockStart, blockEnd),
 *  so you can process-part, reset LFO, then process-rest without clicks.
 */
export function blockSplitsByBoundaries(
  blockStart: number,
  blockSize: number,
  boundariesAsc: number[],
): number[] {
  const end = blockStart + blockSize;
  const splits: number[] = [];
  let cursor = blockStart;
  // boundaries may be precomputed for the whole render; they are ascending
  for (const b of boundariesAsc) {
    if (b <= cursor) continue;
    if (b >= end) break;
    splits.push(b - cursor);
    cursor = b;
  }
  splits.push(end - cursor);
  return splits;
}
