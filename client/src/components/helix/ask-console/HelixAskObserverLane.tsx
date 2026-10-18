import React from "react";
import type { HelixAskObserverLaneEvent } from "./HelixAskObserverLaneEvents";

export type HelixAskConversationBriefPanelProps = {
  text?: string | null;
};

export function HelixAskConversationBriefPanel({ text }: HelixAskConversationBriefPanelProps) {
  if (!text) return null;

  return (
    <div className="-mt-1 px-4 pb-2 text-[11px]">
      <p className="text-[9px] uppercase tracking-[0.14em] text-cyan-300/80">brief</p>
      <p className="mt-0.5 whitespace-pre-wrap text-cyan-100/90">{text}</p>
    </div>
  );
}

export type HelixAskContextChooserPanelProps = {
  visible: boolean;
  autoContextMode?: "attached" | "isolated" | null;
  countdownSec?: number | null;
  onRunAttached: () => void;
  onRunIsolated: () => void;
  onCancel: () => void;
};

export function HelixAskContextChooserPanel({
  visible,
  autoContextMode = null,
  countdownSec = null,
  onRunAttached,
  onRunIsolated,
  onCancel,
}: HelixAskContextChooserPanelProps) {
  if (!visible) return null;

  return (
    <div className="-mt-1 px-4 pb-2 text-[11px]">
      <div className="rounded-lg border border-cyan-300/30 bg-cyan-500/10 px-2.5 py-2 text-cyan-50/95">
        <p className="text-[9px] uppercase tracking-[0.16em] text-cyan-100/90">
          Reasoning context
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words text-[11px]">
          Attach current workspace context to this reasoning turn?
        </p>
        {countdownSec !== null ? (
          <p className="mt-1 text-[10px] text-cyan-100/90">
            {autoContextMode === "isolated"
              ? `Auto-running isolated in ${countdownSec}s.`
              : `Auto-attaching context in ${countdownSec}s.`}
          </p>
        ) : null}
        <div className="mt-2 flex items-center gap-1.5">
          <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-observer-lane.attach-context"
            type="button"
            className="inline-flex items-center rounded-md border border-cyan-300/40 bg-cyan-500/15 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-cyan-100 transition hover:bg-cyan-500/25"
            onClick={onRunAttached}
          >
            Attach context
          </button>
          <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-observer-lane.run-isolated"
            type="button"
            className="inline-flex items-center rounded-md border border-indigo-300/35 bg-indigo-500/15 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-indigo-100 transition hover:bg-indigo-500/25"
            onClick={onRunIsolated}
          >
            Run isolated
          </button>
          <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-observer-lane.cancel"
            type="button"
            className="inline-flex items-center rounded-md border border-slate-300/35 bg-black/20 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-slate-200 transition hover:bg-black/35"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export type { HelixAskObserverLaneEvent };

export type HelixAskObserverLanePanelProps = {
  visible: boolean;
  events: readonly HelixAskObserverLaneEvent[];
  clipText: (text: string, limit: number) => string;
};

export function HelixAskObserverLanePanel({
  visible,
  events,
  clipText,
}: HelixAskObserverLanePanelProps) {
  if (!visible) return null;

  return (
    <div className="-mt-1 px-4 pb-2 text-[11px]">
      <div className="rounded border border-cyan-400/25 bg-cyan-950/20 p-2">
        <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-200">Observer lane</p>
        {events.length > 0 ? (
          <div className="mt-1 max-h-28 space-y-1 overflow-y-auto font-mono text-[10px] leading-5 text-cyan-50">
            {events.map((event) => (
              <div key={event.id} className="rounded border border-cyan-400/20 bg-black/25 px-1.5 py-1">
                <p className="whitespace-pre-wrap break-words">{event.text}</p>
                <p className="mt-0.5 text-[9px] uppercase tracking-[0.12em] text-cyan-200/80">
                  {event.tsMs !== null
                    ? new Date(event.tsMs).toLocaleTimeString([], {
                        hour12: false,
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })
                    : "--:--:--"}
                  {event.traceId ? ` | ${clipText(event.traceId, 64)}` : ""}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-[11px] text-cyan-100/75">Waiting for observer events...</p>
        )}
      </div>
    </div>
  );
}
