import React, { useEffect, useRef, useState } from "react";

type Kind =
  | "audio"
  | "vocal"
  | "lyrics"
  | "photo"
  | "journal"
  | "export"
  | "other";

type Celestial = {
  text: string;
  details?: string;
};

type Item = {
  id: string;
  kind: Kind;
  name: string;
  file?: File;
  url?: string;
  start: number;
  end?: number;
  durationMs?: number;
  meta?: Record<string, unknown>;
  celestial?: Celestial;
};

type TsiPoint = { t: number; tsi: number };

declare global {
  interface Window {
    HaloPeri?: any;
    num?: (x: number, dp?: number, unit?: string) => string;
    niceNsPerS?: (x: number) => string;
    buildSpanSeries?: (tStart: number, tEnd: number) => Promise<any>;
    accrueGR_arcsec?: (
      body: string,
      tStart: number,
      tEnd: number
    ) => { arcsec?: number } | undefined;
    integrateEinsteinRelative_ns?: (span: any) => number | undefined;
  }
}

const PX_PADDING = 60;
const DEFAULT_HEIGHT = 360;

export default function SporeTimeline(): JSX.Element {
  const [title, setTitle] = useState("Untitled project");
  const [items, setItems] = useState<Item[]>([]);
  const [tsiOn, setTsiOn] = useState(false);
  const [tsiSeries, setTsiSeries] = useState<TsiPoint[]>([]);
  const [selection, setSelection] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState(0);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemsRef = useRef<Item[]>([]);
  const [width, setWidth] = useState(960);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    const updateSize = () =>
      setWidth(containerRef.current?.clientWidth ?? 960);
    updateSize();
    if (!containerRef.current) return;
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }
    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const minT =
    items.length > 0
      ? Math.min(...items.map((d) => d.start))
      : Date.now() - 3_600_000;
  const maxT =
    items.length > 0
      ? Math.max(...items.map((d) => d.end ?? d.start))
      : Date.now() + 3_600_000;

  const pxPerMsBase = Math.max(0.0003, width / Math.max(1000, maxT - minT));
  const pxPerMs = pxPerMsBase * zoom;
  const xOf = (t: number) => Math.round((t - minT) * pxPerMs + pan + PX_PADDING);

  useEffect(() => {
    if (!tsiOn) {
      setTsiSeries([]);
      return;
    }
    setTsiSeries(mockTsi(minT, maxT));
  }, [tsiOn, minT, maxT]);

  async function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const added: Item[] = [];
    for (const file of Array.from(list)) {
      const id = uid();
      const lower = file.name.toLowerCase();
      const isAudio = file.type.startsWith("audio/");
      const isVocal = isAudio && (lower.includes("vocal") || lower.includes("vox"));
      const kind: Kind = file.type.startsWith("image/")
        ? "photo"
        : isVocal
        ? "vocal"
        : isAudio
        ? "audio"
        : lower.includes("lyric")
        ? "lyrics"
        : "other";

      let start = file.lastModified || Date.now();
      let durationMs: number | undefined;

      if (kind === "photo") {
        const exifTime = await readExifDate(file);
        if (typeof exifTime === "number") start = exifTime;
      } else if (kind === "audio" || kind === "vocal") {
        const id3 = await readId3(file);
        if (id3?.date) start = id3.date;
        if (id3?.duration) durationMs = id3.duration;
      }

      const end = durationMs ? start + durationMs : undefined;
      const celestial = await haloSummarizeSpan(start, end ?? start + 1);
      const url = URL.createObjectURL(file);

      added.push({
        id,
        kind,
        name: file.name,
        file,
        url,
        start,
        end,
        durationMs,
        celestial,
      });
    }

    setItems((prev) => {
      const next = [...prev, ...added].sort((a, b) => a.start - b.start);
      const starts = next.map((d) => d.start);
      const ends = next.map((d) => d.end ?? d.start);
      const minAll = Math.min(...starts);
      const maxAll = Math.max(...ends);
      const spanAll = Math.max(2000, maxAll - minAll || 0);
      const base = Math.max(0.0003, width / Math.max(1000, maxAll - minAll || 1));
      const targetZoom = Math.min(
        8,
        Math.max(1, (width - PX_PADDING * 2) / (spanAll * base))
      );
      setZoom(Number.isFinite(targetZoom) ? targetZoom : 1);
      setPan(0);
      return next;
    });
  }

  function addNote() {
    const id = uid();
    const now = Date.now();
    setItems((prev) => [
      ...prev,
      { id, kind: "journal", name: `Note ${prev.length + 1}`, start: now },
    ]);
  }

  async function finishExport() {
    try {
      const module = await import(
        /* @vite-ignore */ "https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.esm.js"
      );
      const node = containerRef.current;
      if (!node) return;
      const dataUrl = await module.toPng(node, { pixelRatio: 2 });
      const anchor = document.createElement("a");
      anchor.href = dataUrl;
      anchor.download = `${title.replace(/\s+/g, "_")}_timeline.png`;
      anchor.click();
    } catch (err) {
      window.alert("Export failed (html-to-image not available).");
    }
  }

  function onEdit(item: Item) {
    const iso = window.prompt(
      "Edit start (ISO 8601, e.g. 2025-01-15T23:12:00Z)",
      new Date(item.start).toISOString()
    );
    if (!iso) return;
    const parsed = Date.parse(iso);
    if (!Number.isFinite(parsed)) {
      window.alert("Invalid date.");
      return;
    }
    setItems((prev) =>
      prev.map((d) =>
        d.id === item.id
          ? {
              ...d,
              start: parsed,
              end: d.durationMs ? parsed + d.durationMs : d.end,
            }
          : d
      )
    );
  }

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        setZoom((prevZoom) =>
          clamp(prevZoom * (event.deltaY < 0 ? 1.1 : 0.9), 1, 8)
        );
      } else {
        setPan((prevPan) => prevPan - event.deltaY * 0.5);
      }
    };
    node.addEventListener("wheel", handleWheel, { passive: false });
    return () => node.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => {
        if (item.url) URL.revokeObjectURL(item.url);
      });
    };
  }, []);

  return (
    <div
      className="spore-timeline"
      style={{ padding: "12px 16px", color: "#e8eefc" }}
    >
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-label="Project title"
          style={{
            background: "#0f162b",
            border: "1px solid #1c2746",
            color: "#e8eefc",
            padding: "6px 10px",
            borderRadius: 8,
            minWidth: 220,
          }}
        />
        <label>
          <input
            type="file"
            multiple
            accept="image/*,audio/*,text/plain,application/json,.txt,.md"
            onChange={(event) => addFiles(event.target.files)}
            style={{ display: "none" }}
          />
          <span
            style={{
              background: "#141b31",
              border: "1px solid #202a4a",
              padding: "6px 10px",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            Upload…
          </span>
        </label>
        <button
          onClick={addNote}
          style={{
            background: "#141b31",
            border: "1px solid #202a4a",
            padding: "6px 10px",
            borderRadius: 8,
            color: "#e8eefc",
          }}
        >
          Add note
        </button>
        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "#0f162b",
            border: "1px solid #1c2746",
            padding: "6px 10px",
            borderRadius: 9,
          }}
        >
          <input
            type="checkbox"
            checked={tsiOn}
            onChange={(event) => setTsiOn(event.target.checked)}
          />
          <span>TSI overlay</span>
        </label>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={() => setZoom((value) => clamp(value * 1.2, 1, 8))}
            title="Zoom in"
            style={{
              background: "#141b31",
              border: "1px solid #202a4a",
              padding: "6px 10px",
              borderRadius: 8,
            }}
          >
            ＋
          </button>
          <button
            onClick={() => setZoom((value) => clamp(value / 1.2, 1, 8))}
            title="Zoom out"
            style={{
              background: "#141b31",
              border: "1px solid #202a4a",
              padding: "6px 10px",
              borderRadius: 8,
            }}
          >
            －
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setPan(0);
            }}
            title="Reset"
            style={{
              background: "#141b31",
              border: "1px solid #202a4a",
              padding: "6px 10px",
              borderRadius: 8,
            }}
          >
            Reset
          </button>
          <button
            onClick={finishExport}
            title="Export PNG"
            style={{
              background: "#1a2850",
              border: "1px solid #314377",
              padding: "6px 10px",
              borderRadius: 8,
              color: "#dfe6ff",
            }}
          >
            Finish &amp; Export
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        style={{
          position: "relative",
          height: DEFAULT_HEIGHT,
          background:
            "linear-gradient(180deg, #0f1526 0, #0b0f18 100%)",
          border: "1px solid #18223d",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} ${DEFAULT_HEIGHT}`}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient
              id="tsiGradient"
              x1="0"
              x2="1"
              y1="0"
              y2="0"
            >
              <stop offset="0" stopColor="#ffd26a" />
              <stop offset="1" stopColor="#8d9bff" />
            </linearGradient>
          </defs>

          <rect x={0} y={300} width={width} height={1} fill="#23335f" />

          {buildTicks(minT, maxT, width).map((timestamp, index) => (
            <g key={index} transform={`translate(${xOf(timestamp)},0)`}>
              <rect x={0} y={300} width={1} height={60} fill="#1c2746" />
              <text x={4} y={314} fill="#9fb0d9" fontSize="11">
                {new Date(timestamp).toISOString().slice(0, 10)}
              </text>
              <text x={4} y={330} fill="#3c4a77" fontSize="10">
                {new Date(timestamp).toISOString().slice(11, 19)}
              </text>
            </g>
          ))}

          {tsiOn && tsiSeries.length > 1 && (
            <polyline
              fill="none"
              stroke="url(#tsiGradient)"
              strokeWidth={2}
              points={tsiSeries
                .map(
                  (point) =>
                    `${xOf(point.t)},${120 - (point.tsi - 1361) * 60}`
                )
                .join(" ")}
            />
          )}

          {items.map((item) => {
            const x = xOf(item.start);
            const x2 = xOf(item.end ?? item.start);
            const y = 220 + ((hash(item.id) % 80) - 40);
            const color = pickColor(item.kind);

            if (item.durationMs && item.durationMs > 0) {
              const widthPx = Math.max(4, Math.abs(x2 - x));
              return (
                <g key={item.id}>
                  <rect
                    x={Math.min(x, x2)}
                    y={y - 12}
                    width={widthPx}
                    height={24}
                    rx={6}
                    fill={`${color}33`}
                    stroke={color}
                    strokeWidth={1}
                  />
                  <circle cx={x} cy={y} r={3} fill={color} />
                </g>
              );
            }

            return (
              <circle
                key={item.id}
                cx={x}
                cy={y}
                r={5}
                fill={color}
                stroke="#0b0f18"
                strokeWidth={1}
              />
            );
          })}
        </svg>

        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {items.map((item) => {
            const x = xOf(item.start);
            const y = 220 + ((hash(item.id) % 80) - 40);
            const label = `${item.name} • ${formatIso(item.start)}${
              item.durationMs
                ? ` • ${Math.round(item.durationMs / 1000)}s`
                : ""
            }`;

            return (
              <div
                key={item.id}
                onDoubleClick={() => onEdit(item)}
                onClick={() => setSelection(item.id)}
                title={item.celestial?.text ?? ""}
                style={{
                  position: "absolute",
                  left: x + 8,
                  top: y - 22,
                  pointerEvents: "auto",
                  background: "#101733cc",
                  border: "1px solid #23335f",
                  borderRadius: 8,
                  padding: "2px 6px",
                  color: "#dfe6ff",
                  fontSize: 12,
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        {selection ? (
          (() => {
            const item = items.find((d) => d.id === selection);
            if (!item) return null;
            return (
              <div
                style={{
                  background: "#0e1324",
                  border: "1px solid #1b2547",
                  padding: 10,
                  borderRadius: 10,
                }}
              >
                <div style={{ color: "#ffffff", marginBottom: 4 }}>
                  {item.name}
                </div>
                <div
                  style={{
                    color: "#9fb0d9",
                    fontFamily: "ui-monospace",
                  }}
                >
                  {formatIso(item.start)}
                  {item.durationMs
                    ? ` → ${formatIso(item.end ?? item.start)}`
                    : ""}
                </div>
                {item.celestial?.text && (
                  <div style={{ marginTop: 6, color: "#cfe1ff" }}>
                    {item.celestial.text}
                  </div>
                )}
                <div style={{ marginTop: 6 }}>
                  <button
                    onClick={() => onEdit(item)}
                    style={{
                      background: "#141b31",
                      border: "1px solid #202a4a",
                      padding: "6px 10px",
                      borderRadius: 8,
                      color: "#e8eefc",
                    }}
                  >
                    Edit time
                  </button>
                  <button
                    onClick={() =>
                      setItems((prev) => {
                        const filtered = prev.filter((d) => d.id !== item.id);
                        if (item.url) URL.revokeObjectURL(item.url);
                        return filtered;
                      })
                    }
                    style={{
                      marginLeft: 8,
                      background: "#311a1a",
                      border: "1px solid #4a2020",
                      padding: "6px 10px",
                      borderRadius: 8,
                      color: "#ffd7d7",
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })()
        ) : (
          <div style={{ color: "#9fb0d9" }}>
            Select a pin or span to see details.
          </div>
        )}
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function uid() {
  return Math.random().toString(36).slice(2);
}

function formatIso(timestamp: number) {
  return new Date(timestamp).toISOString().replace(".000Z", "Z");
}

function pickColor(kind: Kind) {
  switch (kind) {
    case "audio":
    case "vocal":
      return "#7bdcf3";
    case "photo":
      return "#ffd26a";
    case "lyrics":
      return "#c3a6ff";
    case "journal":
      return "#6699ff";
    default:
      return "#bfc9e6";
  }
}

async function haloSummarizeSpan(
  tStart: number,
  tEnd: number
): Promise<Celestial | undefined> {
  try {
    if (window.HaloPeri) {
      const series = window.HaloPeri.series?.span
        ? window.HaloPeri.series
        : await window.buildSpanSeries?.(tStart, tEnd);

      const merc: { arcsec?: number } | undefined =
        window.accrueGR_arcsec?.("mercury", tStart, tEnd);
      const earth: { arcsec?: number } | undefined =
        window.accrueGR_arcsec?.("earth", tStart, tEnd);
      const einNs = window.integrateEinsteinRelative_ns?.(series?.span);

      const textParts = [
        typeof merc?.arcsec === "number"
          ? `Mercury GR +${merc.arcsec.toFixed(2)}″`
          : null,
        typeof earth?.arcsec === "number"
          ? `Earth GR +${earth.arcsec.toFixed(2)}″`
          : null,
        Number.isFinite(einNs) ? `Einstein redshift ${signed(einNs!, 2)} ns` : null,
      ].filter(Boolean) as string[];

      const extrema = (() => {
        const span = series?.span ?? [];
        for (let i = 1; i < span.length - 1; i++) {
          const prev = span[i - 1];
          const curr = span[i];
          const next = span[i + 1];
          if (!curr || !prev || !next) continue;
          if (curr.t >= tStart && curr.t <= tEnd) {
            if (curr.r < prev.r && curr.r < next.r) return "Perihelion";
            if (curr.r > prev.r && curr.r > next.r) return "Aphelion";
          }
        }
        return null;
      })();

      const text = [extrema, ...textParts].filter(Boolean).join(" • ");
      if (text) return { text };
    }
  } catch (err) {
    console.warn("HaloBank summary failed:", err);
  }

  const days = Math.max(1, Math.round((tEnd - tStart) / 86_400_000));
  return {
    text: `Span ${days} day${days === 1 ? "" : "s"} • sky state summary (site-aware) available in HaloBank`,
  };
}

function signed(value: number, dp = 1) {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${Math.abs(value).toFixed(dp)}`;
}

async function readExifDate(file: File): Promise<number | undefined> {
  try {
    const exifr = await import(
      /* @vite-ignore */ "https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.umd.min.js"
    );
    const meta = await (exifr as any).parse(file, {
      tiff: true,
      ifd0: true,
      exif: true,
    });
    const dt =
      meta?.DateTimeOriginal || meta?.CreateDate || meta?.ModifyDate || meta?.DateTime;
    if (dt) {
      const parsed = new Date(dt).getTime();
      if (Number.isFinite(parsed)) return parsed;
    }
  } catch (err) {
    console.warn("EXIF parse failed", err);
  }
  return undefined;
}

type Id3Result = { date?: number; duration?: number };

async function readId3(file: File): Promise<Id3Result | undefined> {
  try {
    const mm = await import(
      /* @vite-ignore */ "https://cdn.jsdelivr.net/npm/music-metadata-browser@2.5.10/dist/music-metadata-browser.min.js"
    );
    const meta: any = await (mm as any).parseBlob(file);
    const tdrc = meta?.common?.date || meta?.common?.year;
    const date = tdrc ? new Date(tdrc).getTime() : undefined;
    let duration: number | undefined = meta?.format?.duration
      ? meta.format.duration * 1000
      : undefined;
    if (!duration) {
      const url = URL.createObjectURL(file);
      duration = await new Promise<number | undefined>((resolve) => {
        const audio = new Audio();
        audio.src = url;
        audio.addEventListener(
          "loadedmetadata",
          () => {
            resolve(
              Number.isFinite(audio.duration) ? audio.duration * 1000 : undefined
            );
          },
          { once: true }
        );
        audio.addEventListener("error", () => resolve(undefined), { once: true });
      });
      URL.revokeObjectURL(url);
    }
    return { date, duration };
  } catch (err) {
    console.warn("ID3 parse failed", err);
  }
  return undefined;
}

function buildTicks(minT: number, maxT: number, width: number) {
  const spanMs = Math.max(1, maxT - minT);
  const targetCount = Math.max(4, Math.floor(width / 120));
  const steps = [
    1_000,
    5_000,
    10_000,
    30_000,
    60_000,
    300_000,
    900_000,
    3_600_000,
    10_800_000,
    21_600_000,
    43_200_000,
    86_400_000,
    259_200_000,
    604_800_000,
    2_592_000_000,
  ];
  const step =
    steps.find((candidate) => spanMs / candidate <= targetCount) ??
    steps[steps.length - 1];
  const first = Math.ceil(minT / step) * step;
  const ticks: number[] = [];
  for (let t = first; t <= maxT; t += step) ticks.push(t);
  return ticks;
}

function mockTsi(minT: number, maxT: number): TsiPoint[] {
  const out: TsiPoint[] = [];
  const day = 86_400_000;
  const amplitude = 0.6;
  const base = 1361;
  for (let t = Math.floor(minT / day) * day; t <= maxT; t += day) {
    const years = t / day / 365.25;
    const tsi = base + amplitude * Math.sin((2 * Math.PI * years) / 11);
    out.push({ t, tsi });
  }
  return out;
}

function hash(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h << 5) - h + value.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}
