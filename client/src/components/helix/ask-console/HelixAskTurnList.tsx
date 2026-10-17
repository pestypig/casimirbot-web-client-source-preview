import {
  default as React,
  forwardRef,
  type ReactNode,
  type Ref,
  type UIEventHandler,
} from "react";

export type HelixAskTurnListProps = {
  className: string;
  onScroll?: UIEventHandler<HTMLDivElement>;
  consoleDebugSnapshot?: unknown;
  children: ReactNode;
  activeTurnStreamPanel?: ReactNode;
  activeTurnStreamStatusLine?: ReactNode;
  activeTurnStreamLaneRef?: Ref<HTMLDivElement>;
  activeTurnStreamLineCount?: number;
  activeTurnStreamTurnId?: string | null;
  activeTurnStreamTraceId?: string | null;
  activeTurnStreamRenderToken?: string | null;
  activeTurnStreamRenderCommits?: number;
  bottomRef?: Ref<HTMLDivElement>;
};

const HELIX_ASK_TURN_LIST_ANIMATION_CSS =
  "@keyframes helixAskTurnFadeIn{0%{opacity:0;transform:translate3d(0,8px,0)}100%{opacity:1;transform:translate3d(0,0,0)}}@keyframes helixAskTurnLineFadeIn{0%{opacity:0;transform:translate3d(0,5px,0)}100%{opacity:1;transform:translate3d(0,0,0)}}.helix-ask-turn-enter{animation:helixAskTurnFadeIn 220ms ease-out both}.helix-ask-turn-line-enter{animation:helixAskTurnLineFadeIn 180ms ease-out both}@media (prefers-reduced-motion:reduce){.helix-ask-turn-enter,.helix-ask-turn-line-enter{animation:none}}";

export const HelixAskTurnList = forwardRef<HTMLDivElement, HelixAskTurnListProps>(
  function HelixAskTurnList(
    {
      className,
      onScroll,
      consoleDebugSnapshot,
      children,
      activeTurnStreamPanel,
      activeTurnStreamStatusLine,
      activeTurnStreamLaneRef,
      activeTurnStreamLineCount = 0,
      activeTurnStreamTurnId = null,
      activeTurnStreamTraceId = null,
      activeTurnStreamRenderToken = null,
      activeTurnStreamRenderCommits = 0,
      bottomRef,
    },
    ref,
  ) {
    return (
      <>
        <style>{HELIX_ASK_TURN_LIST_ANIMATION_CSS}</style>
        <div
          ref={ref}
          className={className}
          onScroll={onScroll}
          data-testid="helix-ask-turn-list-scroll"
          role="log"
          aria-label="Ask Helix history"
          tabIndex={0}
        >
          {consoleDebugSnapshot ? (
            <details
              className="rounded-lg border border-cyan-300/25 bg-cyan-950/15 px-3 py-2 text-xs text-cyan-50"
              data-testid="helix-ask-console-debug"
            >
              <summary className="cursor-pointer select-none text-[10px] uppercase tracking-[0.2em] text-cyan-200">
                Console assembly debug
              </summary>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded border border-cyan-300/15 bg-black/30 p-2 font-mono text-[10px] leading-4 text-cyan-50">
                {JSON.stringify(consoleDebugSnapshot, null, 2)}
              </pre>
            </details>
          ) : null}
          {children}
          {activeTurnStreamPanel ? (
            <div
              ref={activeTurnStreamLaneRef}
              className="relative w-full rounded-lg border border-cyan-300/20 bg-cyan-950/10 p-1 shadow-[0_0_0_1px_rgba(8,145,178,0.08)]"
              data-testid="helix-ask-active-turn-stream-lane"
              data-render-placement="inline_active_turn"
              data-turn-stream-lines={activeTurnStreamLineCount}
              data-active-row-count={activeTurnStreamLineCount}
              data-active-turn-id={activeTurnStreamTurnId ?? undefined}
              data-active-trace-id={activeTurnStreamTraceId ?? undefined}
              data-active-render-token={activeTurnStreamRenderToken ?? undefined}
              data-active-render-commits={activeTurnStreamRenderCommits}
            >
              {activeTurnStreamStatusLine ? (
                <div
                  className="mb-1 rounded-md border border-cyan-300/15 bg-black/20 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-cyan-100/85"
                  data-testid="helix-ask-active-turn-status-line"
                >
                  {activeTurnStreamStatusLine}
                </div>
              ) : null}
              {activeTurnStreamPanel}
            </div>
          ) : null}
          <div
            ref={bottomRef}
            className="h-px w-full"
            aria-hidden
            data-testid="helix-ask-reply-list-bottom"
          />
        </div>
      </>
    );
  },
);
