import { readAgentLoopAuditRecord } from "@/lib/helix/ask-runtime-authority-readers";
import { coerceText } from "@/lib/helix/ask-value-normalization";

export type HelixAskTimelineFeedEntry = {
  status?: string | null;
  createdAtMs: number;
  traceId?: string | null;
  meta?: unknown;
};

function isHelixAskTimelineActiveStatus(status: string | null | undefined): boolean {
  return status === "queued" || status === "running" || status === "streaming";
}

function readHelixAskTimelineEntryParentTraceId(entry: HelixAskTimelineFeedEntry): string {
  const entryMeta = readAgentLoopAuditRecord(entry.meta);
  return coerceText(
    entryMeta?.parent_trace_id ??
      entryMeta?.parentTraceId ??
      entryMeta?.ask_trace_id ??
      entryMeta?.askTraceId ??
      entryMeta?.turn_id ??
      entryMeta?.turnId,
  ).trim();
}

export function buildHelixAskTimelineFeed<TEntry extends HelixAskTimelineFeedEntry>(
  helixTimeline: readonly TEntry[],
): TEntry[] {
  return [...helixTimeline].sort((a, b) => {
    const aActive = isHelixAskTimelineActiveStatus(a.status);
    const bActive = isHelixAskTimelineActiveStatus(b.status);
    if (aActive !== bActive) return aActive ? -1 : 1;
    return b.createdAtMs - a.createdAtMs;
  });
}

export function buildHelixAskActiveTimelineFeed<TEntry extends HelixAskTimelineFeedEntry>(args: {
  askBusy: boolean;
  askLiveTraceId?: string | null;
  helixTimelineFeed: readonly TEntry[];
}): TEntry[] {
  if (!args.askBusy) return [];
  const activeTraceId = (args.askLiveTraceId ?? "").trim();
  if (!activeTraceId) {
    return args.helixTimelineFeed.filter((entry) => isHelixAskTimelineActiveStatus(entry.status));
  }
  return args.helixTimelineFeed.filter((entry) => {
    const entryTraceId = (entry.traceId ?? "").trim();
    const entryParentTraceId = readHelixAskTimelineEntryParentTraceId(entry);
    return entryTraceId === activeTraceId || entryParentTraceId === activeTraceId;
  });
}
