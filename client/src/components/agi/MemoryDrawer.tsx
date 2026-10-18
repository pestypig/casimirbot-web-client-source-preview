import React, { useEffect, useState } from "react";
import { getTraceMemories, type TraceMemoryHit, type TraceMemoryResponse } from "@/lib/agi/api";

type MemoryDrawerProps = {
  traceId?: string;
  open: boolean;
  onClose: () => void;
  offsetPx?: number;
  variant?: "drawer" | "window";
};

const formatTimestamp = (value?: string): string => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
};

const sectionTitle = (label: string, count: number) => `${label} (${count})`;

const MemoryList = ({
  title,
  hits,
}: {
  title: string;
  hits: TraceMemoryHit[];
}) => (
  <div className="space-y-3">
    <div className="text-xs uppercase tracking-wide opacity-60">{title}</div>
    {hits.length === 0 ? (
      <div className="text-xs opacity-60 border border-dashed border-white/10 rounded p-3">
        Nothing yet.
      </div>
    ) : (
      hits.map((hit) => (
        <div key={hit.id} className="border border-white/10 rounded p-3 space-y-2">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide opacity-70">
            <span>{hit.kind}</span>
            <span>{formatTimestamp(hit.created_at)}</span>
          </div>
          <div className="text-sm whitespace-pre-wrap leading-relaxed">{hit.snippet || "(no text)"}</div>
          <div className="text-[11px] opacity-70 flex flex-wrap gap-2">
            {hit.keys.map((key) => (
              <span key={`${hit.id}-${key}`} className="px-1 py-0.5 rounded bg-white/10">
                {key}
              </span>
            ))}
            {hit.essence_id && (
              <a
                className="underline hover:opacity-100 opacity-80"
                href={`/api/essence/${hit.essence_id}`}
                target="_blank"
                rel="noreferrer"
              >
                Essence
              </a>
            )}
          </div>
        </div>
      ))
    )}
  </div>
);

export default function MemoryDrawer({ traceId, open, onClose, offsetPx = 0, variant = "drawer" }: MemoryDrawerProps) {
  const [data, setData] = useState<TraceMemoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!traceId) {
      setData(null);
    }
  }, [traceId]);

  useEffect(() => {
    if (!open || !traceId) {
      return;
    }
    let canceled = false;
    setLoading(true);
    setError(null);
    getTraceMemories(traceId)
      .then((payload) => {
        if (canceled) return;
        setData(payload);
      })
      .catch((err) => {
        if (canceled) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message || "Unable to load memories");
        setData(null);
      })
      .finally(() => {
        if (canceled) return;
        setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [open, traceId]);

  const drawerBody = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex flex-col">
          <span className="font-semibold">Memory</span>
          {traceId && <span className="text-[11px] opacity-70 truncate max-w-[220px]">{traceId}</span>}
        </div>
        <button className="text-xs underline opacity-70 hover:opacity-100" onClick={onClose}>
          close
        </button>
      </div>
      <div className="p-4 space-y-4 overflow-auto h-[calc(100%-48px)]">
        {!traceId && <div className="text-sm opacity-70">Trigger a task to inspect its memory.</div>}
        {traceId && loading && <div className="text-sm opacity-70">Loading memories...</div>}
        {error && <div className="text-xs text-red-400">{error}</div>}
        {traceId && !loading && !error && (
          <>
            <MemoryList title={sectionTitle("Top Memory Hits", data?.memories.length ?? 0)} hits={data?.memories ?? []} />
            <MemoryList
              title={sectionTitle("Reflections", data?.reflections.length ?? 0)}
              hits={data?.reflections ?? []}
            />
          </>
        )}
      </div>
    </div>
  );

  if (variant === "window") {
    return (
      <div
        className={`fixed inset-0 z-50 transition-opacity duration-300 ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div className="absolute inset-0 bg-black/50" aria-hidden="true" onClick={onClose} />
        <div
          className={`relative mx-auto my-8 w-[min(420px,calc(100%-32px))] max-h-[80vh] bg-[var(--panel-bg,#0f1115)] text-[var(--panel-fg,#e6e6e6)] border border-white/10 rounded-xl shadow-2xl overflow-hidden transform transition-all duration-300 ${
            open ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
          }`}
        >
          {drawerBody}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ right: `${offsetPx}px` }}
      className={`fixed top-0 h-full w-[360px] bg-[var(--panel-bg,#0f1115)] text-[var(--panel-fg,#e6e6e6)] border-l border-white/10 transition-transform duration-300 ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {drawerBody}
    </div>
  );
}
