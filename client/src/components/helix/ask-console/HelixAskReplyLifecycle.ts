import { asObjectRecord, asStringArray, coerceText } from "@/lib/helix/ask-value-normalization";

export type HelixAskReplyLifecycleReply = {
  id: string;
  content?: string | null;
  createdAtMs?: number;
  turn_id?: string | null;
  debug?: unknown;
};

export type HelixAskReplyOrderResolver<TReply extends HelixAskReplyLifecycleReply> = (
  reply: TReply,
) => number | null;

export function resolveHelixAskConsoleReplyOrderMs<TReply extends HelixAskReplyLifecycleReply>(
  reply: TReply,
  extraOrderCandidates: readonly unknown[] = [],
): number | null {
  const record = asObjectRecord(reply);
  const debug = asObjectRecord(reply.debug);
  const candidates = [
    reply.createdAtMs,
    record?.created_at_ms,
    record?.createdAtMs,
    record?.created_at,
    record?.createdAt,
    debug?.created_at_ms,
    debug?.createdAtMs,
    debug?.exported_at_ms,
    ...extraOrderCandidates,
  ];
  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

export function resolveHelixAskConsoleReplyCanonicalKey<TReply extends HelixAskReplyLifecycleReply>(
  reply: TReply,
): string {
  const replyRecord = asObjectRecord(reply);
  const debugRecord = asObjectRecord(reply.debug);
  const candidates = [
    reply.turn_id,
    replyRecord?.turn_id,
    replyRecord?.turnId,
    debugRecord?.turn_id,
    debugRecord?.turnId,
    debugRecord?.active_turn_id,
    debugRecord?.activeTurnId,
    reply.id,
  ];
  for (const value of candidates) {
    const normalized = coerceText(value).trim();
    if (normalized) return normalized;
  }
  return reply.id;
}

export function isHelixAskConsoleProgressPlaceholderReply<TReply extends HelixAskReplyLifecycleReply>(
  reply: TReply | null | undefined,
  isProgressPlaceholderText: (text: string) => boolean,
): boolean {
  return Boolean(reply && isProgressPlaceholderText(coerceText(reply.content)));
}

export function shouldHideHelixAskConsoleTranscriptReply<TReply extends HelixAskReplyLifecycleReply>(args: {
  reply: TReply;
  askBusy: boolean;
  activeTurnId?: string | null;
  isProgressPlaceholderText: (text: string) => boolean;
}): boolean {
  if (!isHelixAskConsoleProgressPlaceholderReply(args.reply, args.isProgressPlaceholderText)) return false;
  const activeTurnId = coerceText(args.activeTurnId).trim();
  const replyKey = resolveHelixAskConsoleReplyCanonicalKey(args.reply);
  if (args.askBusy && activeTurnId && replyKey === activeTurnId) return true;
  return true;
}

export function mergeHelixAskConsoleReplyPreservingOrder<TReply extends HelixAskReplyLifecycleReply>(
  existing: TReply,
  incoming: TReply,
  resolveOrderMs: HelixAskReplyOrderResolver<TReply> = resolveHelixAskConsoleReplyOrderMs,
): TReply {
  const existingOrderMs = resolveOrderMs(existing);
  const incomingOrderMs = resolveOrderMs(incoming);
  const createdAtMs =
    typeof existing.createdAtMs === "number" && Number.isFinite(existing.createdAtMs)
      ? existing.createdAtMs
      : existingOrderMs !== null
        ? existingOrderMs
        : typeof incoming.createdAtMs === "number" && Number.isFinite(incoming.createdAtMs)
          ? incoming.createdAtMs
          : incomingOrderMs ?? undefined;
  return {
    ...existing,
    ...incoming,
    id: existing.id || incoming.id,
    createdAtMs,
  };
}

export function mergeHelixAskConsoleRepliesByCanonicalTurn<TReply extends HelixAskReplyLifecycleReply>(
  replies: readonly TReply[],
  resolveOrderMs: HelixAskReplyOrderResolver<TReply> = resolveHelixAskConsoleReplyOrderMs,
): TReply[] {
  const merged: TReply[] = [];
  const indexByKey = new Map<string, number>();
  for (const reply of replies) {
    const key = resolveHelixAskConsoleReplyCanonicalKey(reply);
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, merged.length);
      merged.push(reply);
      continue;
    }
    merged[existingIndex] = mergeHelixAskConsoleReplyPreservingOrder(
      merged[existingIndex],
      reply,
      resolveOrderMs,
    );
  }
  return merged;
}

export function sortHelixAskConsoleRepliesChronologically<TReply extends HelixAskReplyLifecycleReply>(
  replies: readonly TReply[],
  resolveOrderMs: HelixAskReplyOrderResolver<TReply> = resolveHelixAskConsoleReplyOrderMs,
): TReply[] {
  return mergeHelixAskConsoleRepliesByCanonicalTurn(replies, resolveOrderMs)
    .map((reply, index) => ({ reply, index, orderMs: resolveOrderMs(reply) }))
    .sort((left, right) => {
      if (left.orderMs !== null && right.orderMs !== null && left.orderMs !== right.orderMs) {
        return left.orderMs - right.orderMs;
      }
      if (left.orderMs !== null && right.orderMs === null) return -1;
      if (left.orderMs === null && right.orderMs !== null) return 1;
      return left.index - right.index;
    })
    .map((entry) => entry.reply);
}

export function limitHelixAskConsoleRepliesChronologically<TReply extends HelixAskReplyLifecycleReply>(
  replies: readonly TReply[],
  limit: number,
  resolveOrderMs: HelixAskReplyOrderResolver<TReply> = resolveHelixAskConsoleReplyOrderMs,
): TReply[] {
  return sortHelixAskConsoleRepliesChronologically(replies, resolveOrderMs).slice(-limit);
}

export function appendHelixAskConsoleReplyChronologically<TReply extends HelixAskReplyLifecycleReply>(
  replies: readonly TReply[],
  reply: TReply,
  limit: number,
  resolveOrderMs: HelixAskReplyOrderResolver<TReply> = resolveHelixAskConsoleReplyOrderMs,
): TReply[] {
  const incomingKey = resolveHelixAskConsoleReplyCanonicalKey(reply);
  const next = [...replies];
  const existingIndex = next.findIndex((existing) => resolveHelixAskConsoleReplyCanonicalKey(existing) === incomingKey);
  if (existingIndex >= 0) {
    next[existingIndex] = mergeHelixAskConsoleReplyPreservingOrder(next[existingIndex], reply, resolveOrderMs);
  } else {
    next.push(reply);
  }
  return limitHelixAskConsoleRepliesChronologically(next, limit, resolveOrderMs);
}

export function appendHelixAskReplyChronologicallyWithOrder<TReply extends HelixAskReplyLifecycleReply>(
  replies: readonly TReply[],
  reply: TReply,
  limit: number,
  resolveOrderMs: HelixAskReplyOrderResolver<TReply>,
): TReply[] {
  return appendHelixAskConsoleReplyChronologically(replies, reply, limit, resolveOrderMs);
}

export function shouldRenderHelixAskConsoleActiveTurnStream<TReply extends HelixAskReplyLifecycleReply>(input: {
  askBusy: boolean;
  activeTurnId?: string | null;
  activeStartedAtMs?: number | null;
  latestReply?: TReply | null;
  resolveOrderMs?: HelixAskReplyOrderResolver<TReply>;
}): boolean {
  if (!input.askBusy) return false;
  const activeTurnId = coerceText(input.activeTurnId).trim();
  const latestReply = input.latestReply ?? null;
  if (!latestReply) return true;
  if (activeTurnId) {
    return resolveHelixAskConsoleReplyCanonicalKey(latestReply) !== activeTurnId;
  }
  const activeStartedAtMs =
    typeof input.activeStartedAtMs === "number" && Number.isFinite(input.activeStartedAtMs)
      ? input.activeStartedAtMs
      : null;
  const latestReplyOrderMs = (input.resolveOrderMs ?? resolveHelixAskConsoleReplyOrderMs)(latestReply);
  if (activeStartedAtMs !== null && latestReplyOrderMs !== null && activeStartedAtMs <= latestReplyOrderMs) {
    return false;
  }
  if (!activeTurnId && activeStartedAtMs === null) return false;
  return true;
}

export function shouldKeepHelixAskConsoleReplyInBriefLane(debug: unknown): boolean {
  const record = asObjectRecord(debug);
  if (!record) return false;
  if (record.smalltalk_fast_path_applied === true) return true;
  const fallbackReasonTaxonomy =
    typeof record.fallback_reason_taxonomy === "string"
      ? record.fallback_reason_taxonomy.trim().toLowerCase()
      : "";
  if (fallbackReasonTaxonomy === "smalltalk_fast_path") return true;
  const fallbackReason =
    typeof record.fallback_reason === "string" ? record.fallback_reason.trim().toLowerCase() : "";
  if (fallbackReason === "smalltalk_fast_path") return true;
  const answerPath = asStringArray(record.answer_path).map((step) => step.toLowerCase());
  return answerPath.includes("forcedanswer:smalltalk_fast_path");
}
