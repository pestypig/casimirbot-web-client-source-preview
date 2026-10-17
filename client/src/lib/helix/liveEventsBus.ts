export const HELIX_ASK_LIVE_EVENT_BUS_EVENT = "helix-ask:live-event";

export type HelixAskLiveEventBusEntry = {
  id: string;
  text: string;
  tool?: string;
  ts?: string | number;
  tsMs?: number;
  seq?: number;
  durationMs?: number;
  meta?: Record<string, unknown>;
};

export type HelixAskLiveEventBusPayload = {
  contextId: string;
  traceId?: string;
  entry: HelixAskLiveEventBusEntry;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function asTimestamp(value: unknown): string | number | undefined {
  const str = asNonEmptyString(value);
  if (str) return str;
  const num = asFiniteNumber(value);
  return typeof num === "number" ? num : undefined;
}

export function coerceHelixAskLiveEventBusPayload(value: unknown): HelixAskLiveEventBusPayload | null {
  const record = asRecord(value);
  if (!record) return null;
  const contextId = asNonEmptyString(record.contextId);
  if (!contextId) return null;
  const entryRecord = asRecord(record.entry);
  if (!entryRecord) return null;
  const text = asNonEmptyString(entryRecord.text);
  if (!text) return null;
  const id = asNonEmptyString(entryRecord.id) ?? `event:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const metaRecord = asRecord(entryRecord.meta) ?? undefined;
  const traceId = asNonEmptyString(record.traceId) ?? undefined;
  const tool = asNonEmptyString(entryRecord.tool) ?? undefined;

  return {
    contextId,
    traceId,
    entry: {
      id,
      text,
      tool,
      ts: asTimestamp(entryRecord.ts),
      tsMs: asFiniteNumber(entryRecord.tsMs) ?? undefined,
      seq: asFiniteNumber(entryRecord.seq) ?? undefined,
      durationMs: asFiniteNumber(entryRecord.durationMs) ?? undefined,
      meta: metaRecord,
    },
  };
}

export function emitHelixAskLiveEvent(payload: HelixAskLiveEventBusPayload): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(HELIX_ASK_LIVE_EVENT_BUS_EVENT, {
      detail: payload,
    }),
  );
}
