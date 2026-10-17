export type HelixAskLegacyReplyEventOrderEvent = {
  id: string;
  seq?: unknown;
};

export type HelixAskLegacyReplyEventTimestampResolver<TEvent> = (event: TEvent) => number | null;

export function sortHelixAskLegacyReplyEventsChronologically<TEvent extends HelixAskLegacyReplyEventOrderEvent>(
  events: readonly TEvent[],
  resolveTimestampMs: HelixAskLegacyReplyEventTimestampResolver<TEvent>,
): TEvent[] {
  return [...events].sort((left, right) => {
    const leftTs = resolveTimestampMs(left);
    const rightTs = resolveTimestampMs(right);
    if (leftTs !== null && rightTs !== null && leftTs !== rightTs) {
      return leftTs - rightTs;
    }
    if (
      typeof left.seq === "number" &&
      Number.isFinite(left.seq) &&
      typeof right.seq === "number" &&
      Number.isFinite(right.seq) &&
      left.seq !== right.seq
    ) {
      return left.seq - right.seq;
    }
    return left.id.localeCompare(right.id);
  });
}
