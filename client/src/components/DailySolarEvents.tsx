import React from "react";
import { hekCatalogDiskPosition } from "../../../shared/solar-hek-catalog-disk";
import { SolarPatrolArtifacts } from "./SolarPatrolArtifacts";
import { NeutrinoArtifacts } from "./NeutrinoArtifacts";
import { SolarComparisonResult } from "./SolarComparisonResult";

import {readDailySolarCatalog,type SolarDailyCatalogView} from '@/lib/solar-catalog-view';
type CatalogEvent=SolarDailyCatalogView['events'][number];
type DailyCatalog=SolarDailyCatalogView;

function admittedMovie(event: CatalogEvent): string | null {
  for (const ref of event.references ?? []) {
    if (ref.type !== "movie") continue;
    try {
      const url = new URL(ref.url);
      if ((url.protocol === "https:" || url.protocol === "http:") &&
          url.hostname === "sdowww.lmsal.com" &&
          url.pathname.startsWith("/sdomedia/ssw/") && url.pathname.endsWith(".mp4") &&
          !url.port && !url.search && !url.hash && !url.username && !url.password) {
        url.protocol = "https:";
        return url.href;
      }
    } catch { /* Keep unadmitted links out of embedded playback. */ }
  }
  return null;
}

function shortTime(value: string): string {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "time unavailable";
}

export function DailySolarEvents({ compact = false }: { compact?: boolean }) {
  const [catalog, setCatalog] = React.useState<DailyCatalog | null>(null);
  const [error, setError] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [dayUtc, setDayUtc] = React.useState<string | null>(null);
  React.useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    const load = async () => {
      if (busy) return;
      busy = true;
      try {
        const response = await fetch(`/api/star-watcher/daily-events${dayUtc ? `?dateUtc=${dayUtc}` : ""}`, {
          credentials: "same-origin", cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw new Error("catalog unavailable");
        const value = readDailySolarCatalog(await response.json(),dayUtc);
        if (!controller.signal.aborted) { setCatalog(value); setError(false); }
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally { busy = false; }
    };
    void load();
    const timer = window.setInterval(() => { void load(); }, 5 * 60_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [dayUtc]);
  const events = React.useMemo(() => [...(catalog?.events ?? [])].sort((a, b) =>
    Date.parse(b.start) - Date.parse(a.start) || a.ivorn.localeCompare(b.ivorn)), [catalog]);
  const selected = events.find((event) => event.ivorn === selectedId) ?? events.find(admittedMovie) ?? events[0] ?? null;
  const movie = selected ? admittedMovie(selected) : null;
  const plotted = events.flatMap((event) => {
    const position = hekCatalogDiskPosition(event);
    return position ? [{ event, position }] : [];
  });
  const reelUrl = catalog?.reel && /^[a-f0-9]{64}$/.test(catalog.reel.reelId)
    ? `/api/star-watcher/hek-reel/${catalog.reel.reelId}.mp4` : null;
  return <section aria-label="Daily solar event catalog" className="rounded-xl border border-cyan-700/40 bg-slate-950/80 p-4 text-slate-200">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-lg font-semibold">{dayUtc ? `Solar events on ${dayUtc} UTC` : "Solar events in the last 24 hours"}</h2>
        <p className="text-xs text-slate-400">HEK reports across {catalog?.eventTypes?.length ?? 27} iSolSearch categories and declared movie links. The catalog disk uses reported helioprojective arcseconds and an approximate 960″ radius; it is not registered to the image above.</p>
      </div>
      <span className="text-xs text-slate-400">{catalog ? `${shortTime(catalog.windowStartUtc)} to ${shortTime(catalog.windowEndUtc)}` : "Loading…"}</span>
    </div>
    {!compact && <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
      <label htmlFor="solar-hek-day">UTC archive day</label>
      <input id="solar-hek-day" type="date" value={dayUtc ?? ""}
        max={new Date(Date.now() - 24 * 3_600_000).toISOString().slice(0, 10)}
        onChange={(event) => { setSelectedId(null); setCatalog(null); setDayUtc(event.target.value || null); }}
        className="rounded border border-slate-700 bg-slate-900 p-1 text-slate-100" />
      <button type="button" onClick={() => { setSelectedId(null); setCatalog(null); setDayUtc(null); }}
        className="rounded border border-cyan-700 px-2 py-1 text-cyan-200">Live 24 hours</button>
    </div>}
    {error && <p role="status" className="mt-2 text-xs text-amber-200">Daily catalog refresh is unavailable; {catalog ? "showing the last loaded response." : "try again shortly."}</p>}
    {catalog && (!catalog.complete || catalog.refreshFailed) && <p role="status" className="mt-2 text-xs text-amber-200">Catalog coverage is incomplete or a refresh failed. Counts and locations may be missing.</p>}
    {catalog?.archivedOnly && <p className="mt-2 text-xs text-slate-400">Older days show retained records only; this view does not fetch a new historical backfill.</p>}
    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(200px,0.8fr)_minmax(0,1.2fr)]">
      <div>
        <svg viewBox="0 0 200 200" role="img" aria-label="2D catalog disk with reported HEK event locations" className="mx-auto aspect-square w-full max-w-72 rounded bg-black">
          <circle cx="100" cy="100" r="82" fill="#3b2512" stroke="#fbbf24" strokeWidth="2" />
          <line x1="100" y1="16" x2="100" y2="184" stroke="#fbbf24" opacity="0.25" />
          <line x1="16" y1="100" x2="184" y2="100" stroke="#fbbf24" opacity="0.25" />
          {plotted.map(({ event, position }) => <circle key={event.ivorn}
            cx={100 + position.u * 80} cy={100 - position.v * 80}
            r={selected?.ivorn === event.ivorn ? 5 : 3}
            fill={selected?.ivorn === event.ivorn ? "#22d3ee" : "#fbbf24"}
            stroke="#111827" strokeWidth="1" onClick={() => setSelectedId(event.ivorn)}
            className="cursor-pointer" />)}
          <text x="100" y="13" textAnchor="middle" fill="#cbd5e1" fontSize="8">Solar north</text>
        </svg>
        <p className="mt-1 text-center text-xs text-slate-400">{plotted.length} of {events.length} reports have on-disk coordinates.</p>
      </div>
      <div className="space-y-3">
        {reelUrl ? <div>
          <p className="mb-1 text-sm font-medium">Stitched event reel · {catalog?.reel?.sources.length} clips</p>
          <video controls preload="metadata" src={reelUrl} className="w-full max-w-lg rounded border border-slate-700" aria-label="Last daily solar event highlight reel" />
          <p className="mt-1 text-xs text-slate-400">Rendered from HEK linked browse movies for {shortTime(catalog!.reel!.windowStartUtc)} to {shortTime(catalog!.reel!.windowEndUtc)}.</p>
          {Boolean(catalog?.reel?.unavailableSources?.length) && <p className="mt-1 text-xs text-amber-200">{catalog!.reel!.unavailableSources!.length} declared movies were unavailable when this reel was rendered.</p>}
        </div> : <p className="text-xs text-slate-400">No retained daily reel is available yet.</p>}
        {selected && <div className="rounded border border-slate-700 p-2 text-xs">
          <p className="font-medium">{selected.event_type.toUpperCase()} {selected.goes_class ?? ""} · {shortTime(selected.start)}</p>
          <p className="break-all text-slate-400">{selected.ivorn}</p>
          <p className="text-slate-400">Reported location: {Number.isFinite(selected.hpc_x) && Number.isFinite(selected.hpc_y)
            ? `${selected.hpc_x}, ${selected.hpc_y} arcsec` : "unavailable"} · {selected.frm_name ?? "reporting method unavailable"}</p>
          {movie ? <video key={movie} controls preload="none" src={movie} className="mt-2 w-full max-w-lg rounded" aria-label="Selected HEK linked event movie" />
            : <p className="mt-2 text-slate-400">No admitted source movie for this report.</p>}
        </div>}
      </div>
    </div>
    {!compact && <div className="mt-3 max-h-64 space-y-1 overflow-auto" aria-label="HEK event reports">
      {events.length ? events.map((event) => <button type="button" key={event.ivorn}
        onClick={() => setSelectedId(event.ivorn)}
        className={`block w-full rounded border px-2 py-1 text-left text-xs ${selected?.ivorn === event.ivorn
          ? "border-cyan-500 bg-cyan-500/10" : "border-slate-800 bg-slate-900/50"}`}>
        <span className="font-medium">{event.event_type.toUpperCase()} {event.goes_class ?? ""}</span>
        <span className="ml-2 text-slate-400">{shortTime(event.start)} · {admittedMovie(event) ? "movie" : "no movie"}</span>
      </button>) : <p className="text-xs text-slate-400">No HEK reports in this window.</p>}
    </div>}
    <SolarPatrolArtifacts dayUtc={dayUtc} />
    <NeutrinoArtifacts dayUtc={dayUtc} />
    {!compact && <SolarComparisonResult />}
  </section>;
}
