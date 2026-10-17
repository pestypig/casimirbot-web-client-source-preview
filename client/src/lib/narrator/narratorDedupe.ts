import type { NarratorEventV1 } from "@shared/contracts/narrator-event.v1";

export function buildNarratorDedupeKey(input: {
  sourceKind: NarratorEventV1["sourceKind"];
  sourceId: string;
  authority: NarratorEventV1["authority"];
  text: string;
  turnKey?: string | null;
}): string {
  const textKey = input.text.replace(/\s+/g, " ").trim().slice(0, 160);
  return [
    input.sourceKind,
    input.sourceId,
    input.authority,
    input.turnKey?.trim() || "no-turn",
    textKey,
  ].join(":");
}

export function shouldDropNarratorDuplicate(args: {
  event: NarratorEventV1;
  lastSeenByDedupeKey: Record<string, number>;
  nowMs?: number;
  windowMs?: number;
}): boolean {
  const windowMs = args.windowMs ?? 1_500;
  const nowMs = args.nowMs ?? Date.now();
  const lastSeen = args.lastSeenByDedupeKey[args.event.dedupeKey];
  return typeof lastSeen === "number" && nowMs - lastSeen < windowMs;
}
