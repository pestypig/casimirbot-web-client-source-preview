import type { PendingHelixAskPrompt } from "@/lib/helix/ask-prompt-launch";

export function isStagePlayMailboxWakePromptText(question: string): boolean {
  const normalized = question.trim();
  if (!normalized) return false;
  return (
    /\bReview\s+the\s+latest\s+Stage\s+Play\s+live[-\s]?source\s+mailbox\s+finding\b/i.test(normalized) &&
    /\bMicro[-\s]?reasoner\s+recommendation\b/i.test(normalized) &&
    /\bstructured\s+mailbox\s+route\s+metadata\b/i.test(normalized)
  );
}

export function hasStagePlayMailboxWakeRouteMetadata(
  routeMetadata: PendingHelixAskPrompt["routeMetadata"],
): boolean {
  return Boolean(
    routeMetadata &&
      routeMetadata.invocationKind === "stage_play_mail_wake" &&
      routeMetadata.sourceTarget === "live_source_mailbox" &&
      typeof routeMetadata.wakeRequestId === "string" &&
      routeMetadata.wakeRequestId.trim() &&
      typeof routeMetadata.mailboxThreadId === "string" &&
      routeMetadata.mailboxThreadId.trim(),
  );
}

export function shouldBlockStagePlayMailboxWakePromptWithoutRouteMetadata(
  pending: PendingHelixAskPrompt | null,
  question: string,
): boolean {
  return isStagePlayMailboxWakePromptText(question) && !hasStagePlayMailboxWakeRouteMetadata(pending?.routeMetadata);
}
