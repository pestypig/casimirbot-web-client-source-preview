import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  HelixOperatorActivityCursor,
  HelixOperatorActivityEvent,
  HelixOperatorActivityStreamDescriptor,
} from "@shared/helix-operator-activity";
import {
  fetchHelixOperatorActivityPage,
  fetchHelixOperatorActivityStreams,
} from "./HelixOperatorActivityApi";

type DetailLevel = "summary" | "activity" | "technical";

const compactRef = (value: string): string =>
  value.length <= 34 ? value : `${value.slice(0, 15)}…${value.slice(-12)}`;

const eventTime = (value: string): string => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

const outcomeClass = (outcome: HelixOperatorActivityEvent["outcome"]): string => {
  if (outcome === "failed" || outcome === "blocked") return "text-rose-200";
  if (outcome === "canceled" || outcome === "stale") return "text-amber-200";
  if (outcome === "succeeded") return "text-emerald-200";
  return "text-slate-300";
};

export function HelixOperatorActivityPanel() {
  const [streams, setStreams] = useState<HelixOperatorActivityStreamDescriptor[]>([]);
  const [selectedStreamRef, setSelectedStreamRef] = useState<string | null>(null);
  const [events, setEvents] = useState<HelixOperatorActivityEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<HelixOperatorActivityCursor | null>(null);
  const [detailLevel, setDetailLevel] = useState<DetailLevel>("summary");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestEpoch = useRef(0);

  const selectedStream = useMemo(
    () => streams.find((stream) => stream.stream_ref === selectedStreamRef) ?? null,
    [selectedStreamRef, streams],
  );

  const loadStream = useCallback(async (
    stream: HelixOperatorActivityStreamDescriptor,
    cursor: HelixOperatorActivityCursor | null = null,
  ) => {
    const epoch = ++requestEpoch.current;
    cursor ? setLoadingMore(true) : setLoading(true);
    setError(null);
    try {
      const page = await fetchHelixOperatorActivityPage({
        streamRef: stream.stream_ref,
        nodeRef: stream.node_ref,
        cursor,
      });
      if (epoch !== requestEpoch.current) return;
      setEvents((current) => cursor ? [...current, ...page.events] : page.events);
      setNextCursor(page.next_cursor);
    } catch (cause) {
      if (epoch !== requestEpoch.current) return;
      setError(cause instanceof Error ? cause.message : "Helix activity is unavailable.");
    } finally {
      if (epoch === requestEpoch.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    const epoch = ++requestEpoch.current;
    setLoading(true);
    setError(null);
    try {
      const list = await fetchHelixOperatorActivityStreams();
      if (epoch !== requestEpoch.current) return;
      setStreams(list.streams);
      const selected = list.streams.find(
        (stream) => stream.stream_ref === selectedStreamRef,
      ) ?? list.streams[0] ?? null;
      setSelectedStreamRef(selected?.stream_ref ?? null);
      if (!selected) {
        setEvents([]);
        setNextCursor(null);
        setLoading(false);
        return;
      }
      const page = await fetchHelixOperatorActivityPage({
        streamRef: selected.stream_ref,
        nodeRef: selected.node_ref,
      });
      if (epoch !== requestEpoch.current) return;
      setEvents(page.events);
      setNextCursor(page.next_cursor);
    } catch (cause) {
      if (epoch !== requestEpoch.current) return;
      setError(cause instanceof Error ? cause.message : "Helix activity is unavailable.");
    } finally {
      if (epoch === requestEpoch.current) setLoading(false);
    }
  }, [selectedStreamRef]);

  useEffect(() => {
    void refresh();
  }, []); // The explicit refresh path owns later stream selection.

  const selectStream = (streamRef: string) => {
    const stream = streams.find((candidate) => candidate.stream_ref === streamRef);
    if (!stream) return;
    setSelectedStreamRef(streamRef);
    setEvents([]);
    setNextCursor(null);
    void loadStream(stream);
  };

  const outcomeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const event of events) counts[event.outcome] = (counts[event.outcome] ?? 0) + 1;
    return counts;
  }, [events]);

  return (
    <section
      aria-label="Helix operator activity"
      className="mt-3 rounded-2xl border border-cyan-400/20 bg-slate-950/70 px-3 py-3 text-slate-100"
      data-content-role="operator_activity_not_assistant_answer"
      data-answer-authority="false"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
            Helix activity
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">
            Governed lifecycle facts, not private reasoning or an assistant answer.
          </div>
        </div>
        <button
          type="button"
          className="rounded-lg border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:border-cyan-400/60"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {streams.length > 0 ? (
        <label className="mt-3 block text-[11px] text-slate-400">
          Activity source
          <select
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100"
            value={selectedStreamRef ?? ""}
            onChange={(event) => selectStream(event.currentTarget.value)}
          >
            {streams.map((stream) => (
              <option key={stream.stream_ref} value={stream.stream_ref}>
                {compactRef(stream.node_ref)} · {stream.event_count} events
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="mt-3 flex gap-1" role="tablist" aria-label="Activity detail">
        {(["summary", "activity", "technical"] as const).map((level) => (
          <button
            key={level}
            type="button"
            role="tab"
            aria-selected={detailLevel === level}
            className={`rounded-lg px-2.5 py-1 text-xs capitalize ${
              detailLevel === level
                ? "bg-cyan-400/15 text-cyan-100"
                : "text-slate-400 hover:text-slate-200"
            }`}
            onClick={() => setDetailLevel(level)}
          >
            {level}
          </button>
        ))}
      </div>

      <div className="mt-3" aria-live="polite" aria-busy={loading}>
        {error ? (
          <div role="status" className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-2 text-xs text-amber-100">
            {error} Refresh after the connection is available.
          </div>
        ) : loading && events.length === 0 ? (
          <div className="text-xs text-slate-400">Loading governed activity…</div>
        ) : !selectedStream ? (
          <div className="text-xs text-slate-400">
            No governed activity yet. It appears here after an admitted tool, agent-run, or environment event.
          </div>
        ) : detailLevel === "summary" ? (
          <div className="grid gap-2 text-xs sm:grid-cols-3">
            <div className="rounded-lg bg-slate-900/80 p-2">
              <div className="text-slate-500">Retrieved</div>
              <div className="mt-1 font-semibold">{events.length} of {selectedStream.event_count}</div>
            </div>
            <div className="rounded-lg bg-slate-900/80 p-2">
              <div className="text-slate-500">Outcomes</div>
              <div className="mt-1 font-semibold">
                {Object.entries(outcomeCounts).map(([key, count]) => `${key} ${count}`).join(" · ") || "None"}
              </div>
            </div>
            <div className="rounded-lg bg-slate-900/80 p-2">
              <div className="text-slate-500">Latest retrieved state</div>
              <div className="mt-1 font-semibold">{events.at(-1)?.summary ?? "No events"}</div>
            </div>
          </div>
        ) : (
          <ol className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {events.map((event) => (
              <li key={event.activity_event_id} className="rounded-lg border border-slate-800 bg-slate-900/70 p-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <span className={outcomeClass(event.outcome)}>{event.summary}</span>
                  <time className="shrink-0 text-[10px] text-slate-500" dateTime={event.occurred_at}>
                    {eventTime(event.occurred_at)}
                  </time>
                </div>
                {detailLevel === "technical" ? (
                  <dl className="mt-2 grid gap-x-3 gap-y-1 text-[10px] text-slate-400 sm:grid-cols-2">
                    <div><dt className="inline text-slate-500">Event </dt><dd className="inline">{event.activity_event_id}</dd></div>
                    <div><dt className="inline text-slate-500">Sequence </dt><dd className="inline">{event.projection_sequence}</dd></div>
                    <div><dt className="inline text-slate-500">Source </dt><dd className="inline">{event.source_kind}</dd></div>
                    <div><dt className="inline text-slate-500">Stage </dt><dd className="inline">{event.lifecycle_stage}</dd></div>
                    <div><dt className="inline text-slate-500">Run </dt><dd className="inline">{event.run_id ?? "not declared"}</dd></div>
                    <div><dt className="inline text-slate-500">Thread </dt><dd className="inline">{event.provider_thread_ref ?? "not declared"}</dd></div>
                  </dl>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>

      {nextCursor && selectedStream ? (
        <button
          type="button"
          className="mt-3 rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:border-cyan-400/60"
          onClick={() => void loadStream(selectedStream, nextCursor)}
          disabled={loadingMore}
        >
          {loadingMore ? "Loading…" : "Load more activity"}
        </button>
      ) : null}
    </section>
  );
}
