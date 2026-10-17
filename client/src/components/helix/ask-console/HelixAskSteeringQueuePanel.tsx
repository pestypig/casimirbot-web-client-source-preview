import React from "react";

import {
  readHelixSteeringQueueDotClass,
  readHelixSteeringQueueItemClass,
  type HelixAskSteeringQueueItem,
} from "@/lib/helix/ask-steering-queue-display";

export type HelixAskSteeringQueuePanelProps = {
  items: HelixAskSteeringQueueItem[];
  activeCount: number;
  expanded: boolean;
  onToggleExpanded: () => void;
};

function clipSteeringQueueText(value: string | undefined, limit: number): string {
  if (!value) return "";
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}...`;
}

export function HelixAskSteeringQueuePanel({
  items,
  activeCount,
  expanded,
  onToggleExpanded,
}: HelixAskSteeringQueuePanelProps) {
  if (items.length === 0) return null;

  const nextItem = items[0] ?? null;

  return (
    <section
      className="mt-2 rounded-2xl border border-white/10 bg-slate-950/55 px-2.5 py-1.5 text-xs text-slate-100 shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
      aria-label="Helix Ask steering queue"
      data-testid="helix-ask-steering-queue"
      data-active-steering-count={activeCount}
      data-expanded={expanded ? "true" : "false"}
    >
      <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-steering-queue-panel.on-toggle-expanded"
        type="button"
        aria-expanded={expanded}
        aria-controls="helix-ask-steering-queue-items"
        onClick={onToggleExpanded}
        className="flex w-full items-center justify-between gap-2 rounded-xl px-1 py-0.5 text-left hover:bg-white/5"
      >
        <span className="min-w-0 truncate text-[11px] font-semibold text-slate-200">
          {nextItem?.label ?? "Queue"}
          {nextItem?.detail ? (
            <span className="ml-2 font-normal text-slate-400">
              {clipSteeringQueueText(nextItem.detail, 92)}
            </span>
          ) : null}
        </span>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] ${
            activeCount > 0
              ? "border-amber-300/35 bg-amber-400/10 text-amber-100"
              : "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
          }`}
        >
          {activeCount > 0 ? `${activeCount} active` : "settled"}
        </span>
        <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-slate-500">
          {expanded ? "Hide" : "Show"}
        </span>
      </button>
      {expanded ? (
        <div id="helix-ask-steering-queue-items" className="mt-2 max-h-[11rem] space-y-1.5 overflow-y-auto pr-1">
          {items.map((item, index) => {
            const itemClass = readHelixSteeringQueueItemClass(item);
            const dotClass = readHelixSteeringQueueDotClass(item);
            return (
              <div
                key={item.key}
                className={`grid grid-cols-[auto_auto_minmax(0,1fr)] items-start gap-2 rounded-lg border px-2.5 py-2 ${itemClass}`}
                data-testid={index === 0 ? "helix-ask-steering-queue-next" : undefined}
                data-steering-status={item.status}
              >
                <span className="mt-1 text-[10px] tabular-nums text-current/55">{index + 1}</span>
                <span
                  className={`mt-1 h-2.5 w-2.5 rounded-full shadow-[0_0_16px_currentColor] ${dotClass}`}
                  aria-hidden
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="min-w-0 break-words font-semibold leading-4">{item.label}</p>
                    <span className="rounded border border-white/10 bg-black/15 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-current/70">
                      {item.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="mt-1 break-words text-[11px] leading-4 text-current/85">
                    {clipSteeringQueueText(item.detail, 220)}
                  </p>
                  <p className="mt-1 truncate text-[9px] uppercase tracking-[0.12em] text-current/50">
                    {item.meta}
                    {item.evidenceRefs.length > 0 ? ` | ${item.evidenceRefs.slice(0, 2).join(" | ")}` : ""}
                    {item.evidenceRefs.length > 2 ? " | ..." : ""}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
