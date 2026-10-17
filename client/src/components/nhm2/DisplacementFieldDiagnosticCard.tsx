import { useEffect, useRef, useState } from "react";
import { PROMOTED_WARP_PROFILE } from "@shared/warp-promoted-profile";
import { useEnergyPipeline } from "@/hooks/use-energy-pipeline";

type FieldResponse = {
  count?: number;
  physics?: { gammaGeo?: number; qSpoiling?: number; sectorStrobing?: number };
  data?: { length?: number; disp?: unknown };
};
type SampledField = Omit<FieldResponse, "data"> & { data: { length?: number; disp: number[] } };
const MAX_SECTORS = Math.max(400, PROMOTED_WARP_PROFILE.sectorCount);

const bounded = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : min;
const shown = (value: number | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value.toExponential(3) : "unreported";
const readSamples = (raw: unknown, expected: number): number[] | null => {
  if (!Array.isArray(raw) && (!raw || typeof raw !== "object")) return null;
  const indexed = raw as Record<number, unknown>;
  const samples = Array.from({ length: expected }, (_, index) => indexed[index]);
  return samples.every((value): value is number => typeof value === "number" && Number.isFinite(value))
    ? samples : null;
};

export default function DisplacementFieldDiagnosticCard() {
  const { data: pipeline } = useEnergyPipeline({ refetchInterval: 5000 });
  const [nTheta, setNTheta] = useState(128);
  const [nPhi, setNPhi] = useState(64);
  const [sectors, setSectors] = useState<number>(PROMOTED_WARP_PROFILE.sectorCount);
  const [split, setSplit] = useState(Math.floor(PROMOTED_WARP_PROFILE.sectorCount / 2));
  const [field, setField] = useState<SampledField | null>(null);
  const [sampleShape, setSampleShape] = useState<{ nTheta: number; nPhi: number; sectors: number; split: number }>({ nTheta: 128, nPhi: 64, sectors: PROMOTED_WARP_PROFILE.sectorCount, split: Math.floor(PROMOTED_WARP_PROFILE.sectorCount / 2) });
  const [range, setRange] = useState<{ min: number; max: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  const sample = async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const safeSectors = bounded(sectors, 1, MAX_SECTORS);
    const params = {
      nTheta: bounded(nTheta, 32, 512), nPhi: bounded(nPhi, 16, 256),
      sectors: safeSectors, split: bounded(split, 0, safeSectors - 1),
    };
    setBusy(true);
    setError(null);
    try {
      const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)] as [string, string]));
      const response = await fetch(`/api/helix/displacement?${query}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json() as FieldResponse;
      const samples = readSamples(result.data?.disp, params.nTheta * params.nPhi);
      if (!samples) throw new Error("The field response has no complete finite displacement sample grid.");
      setField({ ...result, data: { length: result.data?.length, disp: samples } });
      setSampleShape(params);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setBusy(false);
      }
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const samples = field?.data?.disp;
    if (!canvas || !samples?.length) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let min = Infinity;
    let max = -Infinity;
    for (const value of samples) {
      if (!Number.isFinite(value)) continue;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      setError("The field response has no finite displacement samples.");
      return;
    }
    setRange({ min, max });
    const { width, height } = canvas;
    context.fillStyle = "#0b1020";
    context.fillRect(0, 0, width, height);
    const cellWidth = width / sampleShape.nTheta;
    const cellHeight = height / sampleShape.nPhi;
    const span = Math.max(1e-12, max - min);
    for (let theta = 0; theta < sampleShape.nTheta; theta++) {
      for (let phi = 0; phi < sampleShape.nPhi; phi++) {
        const value = samples[theta * sampleShape.nPhi + phi];
        if (!Number.isFinite(value)) continue;
        const t = Math.max(0, Math.min(1, (value - min) / span));
        const green = 0.08 + 0.2 * (1 - Math.abs(t - 0.5) * 2);
        context.fillStyle = `rgb(${Math.round(t * 255)}, ${Math.round(green * 255)}, ${Math.round((1 - t) * 255)})`;
        context.fillRect(theta * cellWidth, (sampleShape.nPhi - 1 - phi) * cellHeight, Math.ceil(cellWidth), Math.ceil(cellHeight));
      }
    }
    context.strokeStyle = "rgba(255,255,255,0.55)";
    context.beginPath();
    const splitX = sampleShape.split / sampleShape.sectors * width;
    context.moveTo(splitX, 0);
    context.lineTo(splitX, height);
    context.stroke();
  }, [field, sampleShape]);

  const liveSectorCount = Number(pipeline?.sectorCount);
  return <section className="space-y-3 text-sm text-slate-100">
    <p className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
      This samples the live pipeline's Natário-bell displacement proxy on an ellipsoidal shell. It is a renderer
      diagnostic, not a selected-run same-chart tensor, metric proof, or measured displacement field.
    </p>
    <div className="grid gap-2 text-xs sm:grid-cols-4">
      <label>θ samples <input type="number" min={32} max={512} value={nTheta} onChange={(event) => setNTheta(Number(event.target.value))}
        className="block w-full rounded border border-slate-600 bg-slate-900 px-2 py-1" /></label>
      <label>φ samples <input type="number" min={16} max={256} value={nPhi} onChange={(event) => setNPhi(Number(event.target.value))}
        className="block w-full rounded border border-slate-600 bg-slate-900 px-2 py-1" /></label>
      <label>Sectors <input type="number" min={1} max={MAX_SECTORS} value={sectors} onChange={(event) => setSectors(Number(event.target.value))}
        className="block w-full rounded border border-slate-600 bg-slate-900 px-2 py-1" /></label>
      <label>Split <input type="number" min={0} max={Math.max(0, sectors - 1)} value={split} onChange={(event) => setSplit(Number(event.target.value))}
        className="block w-full rounded border border-slate-600 bg-slate-900 px-2 py-1" /></label>
    </div>
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <button type="button" disabled={busy} onClick={() => void sample()}
        className="rounded border border-cyan-500/40 px-3 py-1 text-cyan-200 disabled:opacity-50">{busy ? "Sampling..." : "Sample live proxy"}</button>
      <span>Pipeline sectors: {Number.isFinite(liveSectorCount) ? liveSectorCount : "unreported"}</span>
      <button type="button" disabled={!Number.isFinite(liveSectorCount)}
        onClick={() => { const count = bounded(liveSectorCount, 1, MAX_SECTORS); setSectors(count); setSplit(Math.floor(count / 2)); }}
        className="rounded border border-slate-500 px-2 py-1 disabled:opacity-50">Use pipeline sector count</button>
    </div>
    {error ? <p role="alert" className="text-xs text-rose-300">Sampling failed: {error}</p> : null}
    <canvas ref={canvasRef} width={960} height={360} className="h-60 w-full rounded border border-slate-700 bg-slate-950" />
    <p className="text-xs text-slate-400">Blue is the local minimum; red is the local maximum. The white line marks the selected sector split.
      {field ? ` ${field.count ?? field.data?.length ?? field.data?.disp?.length ?? 0} samples; range ${shown(range?.min)} to ${shown(range?.max)}; γ_geo ${shown(field.physics?.gammaGeo)}; q ${shown(field.physics?.qSpoiling)}.` : " No field has been sampled in this view."}
    </p>
  </section>;
}
