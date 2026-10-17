import React from "react";

export const HELIX_ASK_DEFAULT_RENDERED_TURN_COUNT = 8;
export const HELIX_ASK_RENDERED_TURN_REVEAL_STEP = 8;

export type HelixAskTurnHistoryWindow<T> = {
  visibleReplies: T[];
  totalCount: number;
  visibleCount: number;
  hiddenCount: number;
};

export function selectHelixAskTurnHistoryWindow<T>(args: {
  replies: T[];
  requestedVisibleCount?: number;
}): HelixAskTurnHistoryWindow<T> {
  const requestedVisibleCount = Number.isFinite(args.requestedVisibleCount)
    ? Math.trunc(args.requestedVisibleCount as number)
    : HELIX_ASK_DEFAULT_RENDERED_TURN_COUNT;
  const visibleLimit = Math.max(1, requestedVisibleCount);
  const visibleCount = Math.min(args.replies.length, visibleLimit);
  const hiddenCount = Math.max(0, args.replies.length - visibleCount);
  return {
    visibleReplies: args.replies.slice(hiddenCount),
    totalCount: args.replies.length,
    visibleCount,
    hiddenCount,
  };
}

export type HelixAskTurnHistoryWindowControlProps = {
  hiddenCount: number;
  visibleCount: number;
  totalCount: number;
  onRevealOlder: () => void;
};

export function HelixAskTurnHistoryWindowControl({
  hiddenCount,
  visibleCount,
  totalCount,
  onRevealOlder,
}: HelixAskTurnHistoryWindowControlProps) {
  if (hiddenCount <= 0) return null;
  const revealCount = Math.min(HELIX_ASK_RENDERED_TURN_REVEAL_STEP, hiddenCount);

  return (
    <div
      className="rounded-xl border border-cyan-300/15 bg-cyan-950/10 px-3 py-2 text-xs text-slate-300"
      data-testid="helix-ask-turn-history-window"
      data-hidden-turn-count={hiddenCount}
      data-visible-turn-count={visibleCount}
      data-total-turn-count={totalCount}
    >
      <p>
        Showing the latest {visibleCount} of {totalCount} turns. Older turns remain in the durable chat history.
      </p>
      <button data-helix-interaction-kind="navigate" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-turn-history-window.show-older"
        type="button"
        className="mt-2 rounded-md border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1 font-medium text-cyan-100 hover:bg-cyan-300/15 focus:outline-none focus:ring-2 focus:ring-cyan-300/40"
        onClick={onRevealOlder}
      >
        Show {revealCount} older {revealCount === 1 ? "turn" : "turns"}
      </button>
    </div>
  );
}
