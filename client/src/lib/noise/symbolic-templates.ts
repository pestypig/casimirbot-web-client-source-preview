import type {
  GrooveTemplate,
  MacroCurve,
  MacroCurveTarget,
  MacroCurvePoint,
} from "@/types/noise-gens";

type GrooveTemplateInput = {
  id?: unknown;
  name?: unknown;
  grid?: unknown;
  quantize?: unknown;
  stepsPerBeat?: unknown;
  stepsPerBar?: unknown;
  offsets?: unknown;
  timing?: unknown;
  velocity?: unknown;
  velocities?: unknown;
  swing?: unknown;
};

type MacroPointInput = {
  beat?: unknown;
  bar?: unknown;
  measure?: unknown;
  time?: unknown;
  t?: unknown;
  position?: unknown;
  value?: unknown;
  v?: unknown;
  val?: unknown;
  amount?: unknown;
};

type MacroCurveInput = {
  id?: unknown;
  name?: unknown;
  target?: unknown;
  points?: unknown;
  values?: unknown;
  curve?: unknown;
};

type MacroBundleInput = {
  curves?: unknown;
  macroCurves?: unknown;
  targets?: unknown;
  target?: unknown;
  points?: unknown;
  values?: unknown;
  curve?: unknown;
};

const clamp01 = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const normalizeNumberArray = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => toNumber(entry))
    .filter((entry): entry is number => entry != null && Number.isFinite(entry));
};

const normalizeGrooveGrid = (source: GrooveTemplateInput): string | number | undefined => {
  if (typeof source.grid === "string" || typeof source.grid === "number") {
    return source.grid;
  }
  if (typeof source.quantize === "string" || typeof source.quantize === "number") {
    return source.quantize;
  }
  const stepsPerBeat = toNumber(source.stepsPerBeat);
  if (stepsPerBeat && stepsPerBeat > 0) {
    return 1 / stepsPerBeat;
  }
  const stepsPerBar = toNumber(source.stepsPerBar);
  if (stepsPerBar && stepsPerBar > 0) {
    return 4 / stepsPerBar;
  }
  return undefined;
};

export const normalizeGrooveTemplatePayload = (
  payload: unknown,
  fallbackName?: string,
): GrooveTemplate | null => {
  if (!payload) return null;
  const source = isRecord(payload)
    ? ((payload.groove ?? payload.template ?? payload) as GrooveTemplateInput)
    : null;
  if (!source || !isRecord(source)) return null;

  const offsets = normalizeNumberArray(source.offsets ?? source.timing);
  const velocities = normalizeNumberArray(source.velocities ?? source.velocity);
  const grid = normalizeGrooveGrid(source);
  const swing = toNumber(source.swing);
  if (!offsets.length && !velocities.length && swing == null && !grid) {
    return null;
  }
  return {
    id: typeof source.id === "string" ? source.id : undefined,
    name:
      typeof source.name === "string" && source.name.trim().length > 0
        ? source.name.trim()
        : fallbackName,
    grid,
    offsets: offsets.length ? offsets : undefined,
    velocities: velocities.length ? velocities : undefined,
    swing: swing != null ? clamp01(swing) : undefined,
  };
};

const normalizeMacroTarget = (value: unknown): MacroCurveTarget | null => {
  if (typeof value !== "string") return null;
  const lowered = value.trim().toLowerCase();
  if (["gain", "volume", "level"].includes(lowered)) return "gain";
  if (["detune", "pitch"].includes(lowered)) return "detune";
  if (["attack", "attackms"].includes(lowered)) return "attackMs";
  if (["decay", "decayms"].includes(lowered)) return "decayMs";
  if (["release", "releasems"].includes(lowered)) return "releaseMs";
  if (["sustain"].includes(lowered)) return "sustain";
  return null;
};

const parseMacroPoints = (value: unknown): MacroCurvePoint[] => {
  if (!Array.isArray(value)) return [];
  if (value.length === 0) return [];
  if (value.every((entry) => typeof entry === "number")) {
    return value.map((entry, index) => ({
      beat: index,
      value: entry as number,
    }));
  }
  const points: MacroCurvePoint[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const record = entry as MacroPointInput;
    const beat =
      toNumber(record.beat ?? record.time ?? record.t ?? record.position) ??
      null;
    const bar = toNumber(record.bar ?? record.measure);
    const resolvedBeat =
      beat != null ? beat : bar != null ? bar * 4 : null;
    const val = toNumber(record.value ?? record.v ?? record.val ?? record.amount);
    if (resolvedBeat == null || val == null) continue;
    points.push({ beat: Math.max(0, resolvedBeat), value: val });
  }
  points.sort((a, b) => a.beat - b.beat);
  return points;
};

const normalizeMacroCurve = (
  input: MacroCurveInput,
  fallbackName?: string,
): MacroCurve | null => {
  const target = normalizeMacroTarget(input.target) ?? "gain";
  const points =
    parseMacroPoints(input.points ?? input.values ?? input.curve) ?? [];
  if (!points.length) return null;
  return {
    id: typeof input.id === "string" ? input.id : undefined,
    name:
      typeof input.name === "string" && input.name.trim().length > 0
        ? input.name.trim()
        : fallbackName,
    target,
    points,
  };
};

export const normalizeMacroCurvePayload = (
  payload: unknown,
  fallbackName?: string,
): MacroCurve[] | null => {
  if (!payload) return null;
  if (Array.isArray(payload)) {
    if (payload.length === 0) return null;
    if (payload.every((entry) => typeof entry === "number")) {
      const curve = normalizeMacroCurve(
        { points: payload, target: "gain" },
        fallbackName,
      );
      return curve ? [curve] : null;
    }
    const curves = payload
      .map((entry) =>
        isRecord(entry) ? normalizeMacroCurve(entry as MacroCurveInput, fallbackName) : null,
      )
      .filter((entry): entry is MacroCurve => Boolean(entry));
    return curves.length ? curves : null;
  }
  if (!isRecord(payload)) return null;
  const bundle = payload as MacroBundleInput & Record<string, unknown>;

  if (bundle.curves && isRecord(bundle.curves)) {
    const curves = Object.entries(bundle.curves)
      .map(([key, value]) => normalizeMacroCurve({ target: key, points: value }, fallbackName))
      .filter((entry): entry is MacroCurve => Boolean(entry));
    return curves.length ? curves : null;
  }

  if (Array.isArray(bundle.targets ?? bundle.macroCurves)) {
    const list = (bundle.targets ?? bundle.macroCurves) as unknown[];
    const curves = list
      .map((entry) =>
        isRecord(entry) ? normalizeMacroCurve(entry as MacroCurveInput, fallbackName) : null,
      )
      .filter((entry): entry is MacroCurve => Boolean(entry));
    return curves.length ? curves : null;
  }

  const curve = normalizeMacroCurve(
    {
      target: bundle.target ?? "gain",
      points: bundle.points ?? bundle.values ?? bundle.curve,
    },
    fallbackName,
  );
  return curve ? [curve] : null;
};
