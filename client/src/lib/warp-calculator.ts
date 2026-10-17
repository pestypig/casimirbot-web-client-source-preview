import { apiRequest } from "@/lib/queryClient";
import type {
  ObserverConditionKey,
  ObserverFrameKey,
} from "@/lib/stress-energy-brick";

export type WarpCalculatorDecisionClass =
  | "candidate_pass_found"
  | "margin_limited"
  | "applicability_limited"
  | "evidence_path_blocked"
  | string;

export interface WarpCalculatorInputPayload {
  label?: string;
  params?: Record<string, unknown>;
  qi?: {
    sampler?: string;
    fieldType?: string;
    tau_s_ms?: number;
  };
}

export interface WarpCalculatorRunRequest {
  persist?: boolean;
  outPath?: string;
  injectCurvatureSignals?: boolean;
  inputPayload?: WarpCalculatorInputPayload;
}

export interface WarpCalculatorRunResponse {
  ok: boolean;
  outPath: string | null;
  decisionClass: WarpCalculatorDecisionClass;
  congruentSolvePass: boolean | null;
  marginRatioRaw: number | null;
  marginRatioRawComputed: number | null;
}

export interface WarpCalculatorPayloadContext {
  pipeline?: Record<string, unknown> | null;
  observerCondition: ObserverConditionKey;
  observerFrame: ObserverFrameKey;
  observerRapidityCap?: number | null;
  observerTypeITolerance?: number | null;
  label?: string;
}

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const finiteOrUndefined = (value: unknown): number | undefined => {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const readNumber = (
  source: Record<string, unknown> | null,
  keys: string[],
): number | undefined => {
  if (!source) return undefined;
  for (const key of keys) {
    const parsed = finiteOrUndefined(source[key]);
    if (parsed !== undefined) return parsed;
  }
  return undefined;
};

const readString = (
  source: Record<string, unknown> | null,
  keys: string[],
): string | undefined => {
  if (!source) return undefined;
  for (const key of keys) {
    const raw = source[key];
    if (typeof raw === "string" && raw.trim().length > 0) return raw.trim();
  }
  return undefined;
};

const pushFiniteParam = (
  target: Record<string, unknown>,
  key: string,
  value: unknown,
) => {
  const parsed = finiteOrUndefined(value);
  if (parsed !== undefined) target[key] = parsed;
};

const buildLabel = (context: WarpCalculatorPayloadContext): string => {
  if (context.label && context.label.trim().length > 0) return context.label.trim();
  const ts = new Date().toISOString();
  const cap =
    finiteOrUndefined(context.observerRapidityCap) !== undefined
      ? `cap${Number(context.observerRapidityCap).toFixed(3)}`
      : "capNA";
  return `needle-hull-mk2-${context.observerCondition}-${context.observerFrame}-${cap}-${ts}`;
};

export const buildWarpCalculatorInputPayload = (
  context: WarpCalculatorPayloadContext,
): WarpCalculatorInputPayload => {
  const pipeline = asRecord(context.pipeline);
  const params: Record<string, unknown> = {};

  const warpFieldType = readString(pipeline, ["warpFieldType"]);
  if (warpFieldType) params.warpFieldType = warpFieldType;

  pushFiniteParam(params, "gammaGeo", readNumber(pipeline, ["gammaGeo"]));
  pushFiniteParam(params, "dutyCycle", readNumber(pipeline, ["dutyCycle"]));
  pushFiniteParam(params, "dutyShip", readNumber(pipeline, ["dutyShip"]));
  pushFiniteParam(
    params,
    "dutyEffective_FR",
    readNumber(pipeline, ["dutyEffectiveFR", "dutyEffective_FR"]),
  );
  pushFiniteParam(params, "sectorCount", readNumber(pipeline, ["sectorCount"]));
  pushFiniteParam(
    params,
    "concurrentSectors",
    readNumber(pipeline, ["concurrentSectors", "sectorsConcurrent", "sectors"]),
  );
  pushFiniteParam(
    params,
    "qSpoilingFactor",
    readNumber(pipeline, ["qSpoilingFactor", "deltaAOverA"]),
  );
  pushFiniteParam(params, "qCavity", readNumber(pipeline, ["qCavity"]));
  pushFiniteParam(
    params,
    "gammaVanDenBroeck",
    readNumber(pipeline, [
      "gammaVanDenBroeck",
      "gammaVdB",
      "gammaVanDenBroeck_vis",
    ]),
  );

  const qiSource = asRecord(pipeline?.qi);
  const qi: WarpCalculatorInputPayload["qi"] = {};
  const sampler = readString(qiSource, ["sampler"]);
  if (sampler) qi.sampler = sampler;
  const fieldType = readString(qiSource, ["fieldType"]);
  if (fieldType) qi.fieldType = fieldType;
  const tauMs = readNumber(qiSource, ["tau_s_ms"]);
  if (tauMs !== undefined) qi.tau_s_ms = tauMs;

  const payload: WarpCalculatorInputPayload = {
    label: buildLabel(context),
  };

  if (Object.keys(params).length > 0) payload.params = params;
  if (Object.keys(qi).length > 0) payload.qi = qi;
  return payload;
};

export async function runWarpCalculatorViaApi(
  request: WarpCalculatorRunRequest,
  signal?: AbortSignal,
): Promise<WarpCalculatorRunResponse> {
  const payload: Record<string, unknown> = {
    persist: request.persist === true,
    injectCurvatureSignals: request.injectCurvatureSignals !== false,
  };
  if (request.inputPayload) payload.inputPayload = request.inputPayload;
  if (request.persist === true && request.outPath?.trim()) {
    payload.outPath = request.outPath.trim();
  }

  const response = await apiRequest(
    "POST",
    "/api/physics/warp/calculator",
    payload,
    signal,
  );
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const errorMessage =
      (json && typeof json === "object" && (json as any).message) ||
      (json && typeof json === "object" && (json as any).error) ||
      response.statusText ||
      "Calculator request failed";
    throw new Error(String(errorMessage));
  }

  const body = asRecord(json) ?? {};
  return {
    ok: body.ok === true,
    outPath:
      typeof body.outPath === "string" && body.outPath.trim().length > 0
        ? body.outPath
        : null,
    decisionClass:
      typeof body.decisionClass === "string" && body.decisionClass.trim().length > 0
        ? body.decisionClass
        : "evidence_path_blocked",
    congruentSolvePass:
      typeof body.congruentSolvePass === "boolean"
        ? body.congruentSolvePass
        : null,
    marginRatioRaw: finiteOrUndefined(body.marginRatioRaw) ?? null,
    marginRatioRawComputed: finiteOrUndefined(body.marginRatioRawComputed) ?? null,
  };
}
