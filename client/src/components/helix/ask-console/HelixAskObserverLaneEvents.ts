import { readAgentLoopAuditRecord } from "@/lib/helix/ask-runtime-authority-readers";
import { normalizeHelixVisibleEventText } from "@/lib/helix/ask-turn-transcript";
import { clipText, coerceText } from "@/lib/helix/ask-value-normalization";

export type HelixAskObserverTimelineEntry = {
  id: string;
  type: string;
  status?: string | null;
  detail?: string | null;
  text: string;
  createdAtMs: number;
  updatedAtMs: number;
  traceId?: string | null;
  meta?: unknown;
};

export type HelixAskObserverLaneEvent = {
  id: string;
  text: string;
  tsMs: number | null;
  traceId?: string | null;
};

export function buildHelixAskObserverLaneEvents(args: {
  askBusy: boolean;
  askLiveTraceId?: string | null;
  helixTimeline: readonly HelixAskObserverTimelineEntry[];
  limit?: number;
}): HelixAskObserverLaneEvent[] {
  if (!args.askBusy) return [];
  const activeTraceId = (args.askLiveTraceId ?? "").trim();
  const seen = new Set<string>();
  return [...args.helixTimeline]
    .sort((left, right) => right.updatedAtMs - left.updatedAtMs)
    .filter((entry) => {
      if (activeTraceId) {
        const entryTraceId = (entry.traceId ?? "").trim();
        const entryMeta = readAgentLoopAuditRecord(entry.meta);
        const entryParentTraceId = coerceText(
          entryMeta?.parent_trace_id ??
            entryMeta?.parentTraceId ??
            entryMeta?.ask_trace_id ??
            entryMeta?.askTraceId ??
            entryMeta?.turn_id ??
            entryMeta?.turnId,
        ).trim();
        if (entryTraceId && entryTraceId !== activeTraceId && entryParentTraceId !== activeTraceId) {
          return false;
        }
      }
      const detail = (entry.detail ?? "").trim().toLowerCase();
      return (
        (entry.type === "action_receipt" && detail.includes("observer_lane_commentary")) ||
        entry.type === "conversation_brief" ||
        entry.type === "suppressed"
      );
    })
    .map((entry) => {
      const text = clipText(entry.text, 320);
      return {
        id: `observer:${entry.id}`,
        text,
        tsMs: Number.isFinite(entry.updatedAtMs) ? entry.updatedAtMs : entry.createdAtMs,
        traceId: entry.traceId ?? null,
        dedupeKey: [entry.type, entry.status, normalizeHelixVisibleEventText(text)]
          .filter(Boolean)
          .join("|"),
      };
    })
    .filter((event) => {
      if (!event.dedupeKey) return true;
      if (seen.has(event.dedupeKey)) return false;
      seen.add(event.dedupeKey);
      return true;
    })
    .slice(0, args.limit ?? 12)
    .map(({ dedupeKey: _dedupeKey, ...event }) => event);
}
