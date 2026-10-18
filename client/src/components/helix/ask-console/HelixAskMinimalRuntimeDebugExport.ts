import type { HelixAskMinimalRuntimeControlPayload } from "./HelixAskMinimalRuntimeControls";

export type HelixAskMinimalRuntimeDebugExportRef = {
  endpoint?: string;
  turn_id?: string;
};

export type HelixAskMinimalRuntimeDebugExportRequest = {
  replyId: string;
  turnId: string;
  fallbackDebugCopyText: string;
  debugExportRef: HelixAskMinimalRuntimeDebugExportRef | null;
  endpoint: string | null;
};

export type HelixAskMinimalRuntimeDebugExportMaterializer = (
  request: HelixAskMinimalRuntimeDebugExportRequest,
) => Promise<unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function coerceText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return String(value);
  } catch {
    return "";
  }
}

function isBackendDebugExportEligibleTurnId(value: string): boolean {
  const trimmed = value.trim();
  return Boolean(trimmed && (trimmed.startsWith("ask:") || /(?:^|:)ask:[^:]+/i.test(trimmed)));
}

function readDebugExportRefFromRecord(record: Record<string, unknown> | null): HelixAskMinimalRuntimeDebugExportRef | null {
  if (!record) return null;
  const direct =
    asRecord(record.debug_export_ref) ??
    asRecord(record.debugExportRef) ??
    asRecord(record.backend_debug_response_ref);
  if (direct) {
    return {
      endpoint: coerceText(direct.endpoint).trim() || undefined,
      turn_id: coerceText(direct.turn_id).trim() || undefined,
    };
  }
  const debug = asRecord(record.debug);
  return readDebugExportRefFromRecord(debug);
}

export function readHelixAskMinimalRuntimeDebugExportRef(
  value: unknown,
): HelixAskMinimalRuntimeDebugExportRef | null {
  return readDebugExportRefFromRecord(asRecord(value));
}

export function readHelixAskMinimalRuntimeAuthoritativeDebugText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() ? value : null;
  const record = asRecord(value);
  if (!record) return null;
  const payload = record.payload ?? record.debug_export ?? record;
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return null;
  }
}

export function buildHelixAskMinimalRuntimeDebugExportRequest(
  payload: HelixAskMinimalRuntimeControlPayload,
): HelixAskMinimalRuntimeDebugExportRequest {
  const ref = readHelixAskMinimalRuntimeDebugExportRef(payload.debugSource);
  const refEndpoint = coerceText(ref?.endpoint).trim();
  const endpoint = refEndpoint || `/api/agi/ask/turn/${encodeURIComponent(payload.turnId)}/debug-export`;
  return {
    replyId: payload.replyId,
    turnId: payload.turnId,
    fallbackDebugCopyText: payload.debugCopyText,
    debugExportRef: ref,
    endpoint,
  };
}

export async function materializeHelixAskMinimalRuntimeDebugCopyText(args: {
  payload: HelixAskMinimalRuntimeControlPayload;
  materializeBackendDebugExport?: HelixAskMinimalRuntimeDebugExportMaterializer;
}): Promise<string> {
  const request = buildHelixAskMinimalRuntimeDebugExportRequest(args.payload);
  if (!args.materializeBackendDebugExport) {
    return args.payload.debugCopyText;
  }
  const turnId = coerceText(request.turnId).trim();
  if (!args.payload.isLatest && !isBackendDebugExportEligibleTurnId(turnId)) {
    return args.payload.debugCopyText;
  }
  const refTurnId = coerceText(request.debugExportRef?.turn_id).trim();
  if (refTurnId && refTurnId !== turnId) {
    return args.payload.debugCopyText;
  }
  try {
    const materialized = await args.materializeBackendDebugExport(request);
    return readHelixAskMinimalRuntimeAuthoritativeDebugText(materialized) ?? args.payload.debugCopyText;
  } catch {
    return args.payload.debugCopyText;
  }
}

export const HELIX_ASK_MINIMAL_RUNTIME_BACKEND_DEBUG_EXPORT_MATERIALIZER:
  HelixAskMinimalRuntimeDebugExportMaterializer = async (request) => {
    if (typeof fetch !== "function" || !request.endpoint) return null;
    const response = await fetch(request.endpoint, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    return response.json();
  };
