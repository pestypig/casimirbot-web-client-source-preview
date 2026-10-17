import React from "react";

type FluxBin = { start?: string; end?: string; mean_long?: number; max_long?: number };
type FlareEvent = { id?: string; ivorn?: string; event_type: string; start_time?: string;
  end_time?: string; start?: string; end?: string; goes_class?: string };

// SunPy/Astropy ISO output may omit the UTC suffix. These acquired times are UTC,
// not browser-local wall time; unknown offsets are never guessed from the host.
export function solarUtcMs(value?: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/i.test(value)) return null;
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? ms : null;
}

export function buildSolarEvidenceTimeline(input: {
  frames: Array<{ obstime: string }>;
  currentFrameIndex: number;
  goesBins: FluxBin[];
  events: FlareEvent[];
}) {
  const frameTimes = input.frames.map(frame => solarUtcMs(frame.obstime));
  const validFrames = frameTimes.filter((time): time is number => time !== null);
  const windowStart = validFrames.length ? validFrames.reduce((min,time)=>Math.min(min,time),Infinity) : null;
  const windowEnd = validFrames.length ? validFrames.reduce((max,time)=>Math.max(max,time),-Infinity) : null;
  if (windowStart === null || windowEnd === null) return null;
  const width = 640, height = 150, left = 44, right = 12, top = 10, bottom = 25;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const halfWindow = Math.max(15 * 60_000, (windowEnd - windowStart) * 0.06);
  const startMs = windowStart - halfWindow, endMs = windowEnd + halfWindow;
  const x = (time: number) => left + (time - startMs) / (endMs - startMs) * plotWidth;
  const flux = input.goesBins.map(bin => {
    const start = solarUtcMs(bin.start), end = solarUtcMs(bin.end);
    return {time: start === null ? null : end !== null && end >= start ? (start+end)/2 : start,
      value: bin.mean_long};
  }).filter((point): point is {time:number;value:number} =>
    point.time !== null && typeof point.value === "number" && Number.isFinite(point.value) &&
    point.value > 0 && point.time >= startMs && point.time <= endMs);
  const logs = flux.map(point => Math.log10(point.value));
  const minLog = logs.length ? Math.floor(logs.reduce((min,value)=>Math.min(min,value),Infinity)) : -8;
  const maxLog = logs.length ? Math.max(minLog + 1, Math.ceil(logs.reduce((max,value)=>Math.max(max,value),-Infinity))) : -4;
  const y = (value: number) => top + plotHeight * (1 - (Math.log10(value) - minLog) / (maxLog - minLog));
  const flares = input.events.filter(event => event.event_type.toUpperCase() === "FL").map(event => {
    const start = solarUtcMs(event.start_time ?? event.start);
    const end = solarUtcMs(event.end_time ?? event.end) ?? start;
    if (start === null || end === null || end < start || end < startMs || start > endMs) return null;
    return { id: event.id ?? event.ivorn ?? `${start}`, label: event.goes_class ?? "FL",
      x: x(Math.max(start, startMs)), width: Math.max(2, x(Math.min(end, endMs)) - x(Math.max(start, startMs))) };
  }).filter((flare): flare is {id:string;label:string;x:number;width:number} => flare !== null);
  const cursorTime = frameTimes[input.currentFrameIndex] ?? null;
  return {width,height,left,right,top,bottom,plotHeight,startMs,endMs,minLog,maxLog,
    fluxPoints: flux.map(point => `${x(point.time).toFixed(2)},${y(point.value).toFixed(2)}`).join(" "),
    fluxCount: flux.length, flares, cursorX: cursorTime === null ? null : x(cursorTime),
    cursorTime: cursorTime === null ? null : new Date(cursorTime).toISOString()};
}

export function SolarEvidenceTimeline(props: {
  frames: Array<{ obstime: string }>;
  currentFrameIndex: number;
  goesBins?: FluxBin[];
  events?: FlareEvent[];
  onFrameSelect?: (index: number) => void;
}) {
  const timeline = React.useMemo(() => buildSolarEvidenceTimeline({
    frames: props.frames, currentFrameIndex: props.currentFrameIndex,
    goesBins: props.goesBins ?? [], events: props.events ?? [],
  }), [props.frames, props.currentFrameIndex, props.goesBins, props.events]);
  if (!timeline) return <p className="text-xs text-slate-400">No dated image frames; a synchronized timeline cannot be shown.</p>;
  return <section aria-label="Observation and flare timeline" className="space-y-2 rounded border border-slate-700 bg-slate-950/50 p-3 text-xs text-slate-300">
    <h3 className="text-sm font-medium text-slate-100">Frame time · GOES XRS · HEK flare windows</h3>
    {props.frames.length > 1 && props.onFrameSelect && <label className="flex items-center gap-3">
      <span>Image frame</span>
      <input aria-label="Image frame in observation timeline" type="range" min={0} max={props.frames.length-1}
        value={Math.min(Math.max(props.currentFrameIndex,0),props.frames.length-1)}
        onChange={event=>props.onFrameSelect?.(Number(event.target.value))} className="max-w-md flex-1 accent-cyan-400" />
      <span>{Math.min(Math.max(props.currentFrameIndex,0),props.frames.length-1)+1}/{props.frames.length}</span>
    </label>}
    <svg viewBox={`0 0 ${timeline.width} ${timeline.height}`} className="w-full max-w-2xl" role="img"
      aria-label={`${timeline.fluxCount} GOES XRS five-minute bins and ${timeline.flares.length} catalog flare windows aligned with the selected image frame`}>
      <rect x={timeline.left} y={timeline.top} width={timeline.width-timeline.left-timeline.right}
        height={timeline.plotHeight} fill="#07111e" stroke="#475569" />
      {timeline.flares.map(flare => <g key={flare.id}>
        <rect x={flare.x} y={timeline.top} width={flare.width} height={timeline.plotHeight} fill="#f59e0b" opacity="0.22" />
        <title>{`HEK flare ${flare.label}`}</title>
      </g>)}
      {timeline.fluxCount > 1 && <polyline points={timeline.fluxPoints} fill="none" stroke="#fb7185" strokeWidth="2" />}
      {timeline.cursorX !== null && <line x1={timeline.cursorX} x2={timeline.cursorX} y1={timeline.top}
        y2={timeline.top+timeline.plotHeight} stroke="#67e8f9" strokeWidth="2" />}
      <text x={timeline.left} y={timeline.height-6} fill="#94a3b8">{new Date(timeline.startMs).toISOString().slice(5,16).replace("T"," ")} UTC</text>
      <text x={timeline.width-timeline.right} y={timeline.height-6} textAnchor="end" fill="#94a3b8">{new Date(timeline.endMs).toISOString().slice(5,16).replace("T"," ")} UTC</text>
      <text x="3" y={timeline.top+8} fill="#94a3b8">10^{timeline.maxLog}</text>
      <text x="3" y={timeline.top+timeline.plotHeight} fill="#94a3b8">10^{timeline.minLog}</text>
    </svg>
    <p>Selected image: {timeline.cursorTime ?? "time unavailable"} · GOES XRS long-channel mean flux (W/m², log scale; bin midpoint when available) · amber = HEK-reported flare interval.</p>
    <p className="text-amber-200">Time co-occurrence only: GOES is full-disk irradiance; a nearby HEK flare is not automatically its source. This display is not a model residual.</p>
    {timeline.fluxCount === 0 && <p>No GOES XRS samples overlap these frames; no curve was inferred.</p>}
  </section>;
}
