import React, { useMemo, useState } from "react";
import { FileVideo2, Loader2, ShieldCheck } from "lucide-react";
import type {
  VisualSequenceErrorResponse,
  VisualSequenceIngestResponse,
  VisualSequenceManifest,
  VisualSequenceReceipt,
} from "@shared/helix-visual-sequence";
import type { HudSurfaceRenderReceipt } from "@shared/helix-hud-surface";
import type { CaptureIdentity } from "../../../lib/helix/boundedVisualSequenceCapture";
import BoundedCaptureControls from "./BoundedCaptureControls";

type Result = { manifest: VisualSequenceManifest; receipt: VisualSequenceReceipt };

const postClip = async (file: File): Promise<Result> => {
  const body = new FormData();
  body.append("video", file);
  body.append("thread_id", "motorcycle-hud-lab");
  body.append("cadence_ms", "1000");
  const response = await fetch("/api/visual-sequences", {
    method: "POST",
    body,
    credentials: "same-origin",
  });
  const payload = await response.json() as VisualSequenceIngestResponse | VisualSequenceErrorResponse;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? "Visual-sequence extraction failed." : payload.message);
  }
  return { manifest: payload.manifest, receipt: payload.receipt };
};

const shortHash = (value: string): string => `${value.slice(0, 10)}…${value.slice(-8)}`;

export type VisualSequenceInspectorProps = {
  hudElement?: HTMLElement | null;
  hudReceipt?: HudSurfaceRenderReceipt | null;
  hudIdentity?: CaptureIdentity;
  onArtifact?: (result: VisualSequenceIngestResponse) => void;
};

export default function VisualSequenceInspector({ hudElement = null, hudReceipt = null, hudIdentity, onArtifact }: VisualSequenceInspectorProps) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const durationLabel = useMemo(() => result
    ? `${(result.manifest.source.duration_ms / 1_000).toFixed(3)} s`
    : "—", [result]);

  const extract = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await postClip(file);
      setResult(next);
      onArtifact?.({ ok: true, ...next });
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : "Visual-sequence extraction failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="rounded-lg border border-sky-300/15 bg-slate-950/75 p-3" data-testid="visual-sequence-inspector">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileVideo2 size={16} className="text-sky-300" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-100">Visual Sequence Evidence · VSE-0A</h2>
          </div>
          <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-slate-500">
            Select an owner-supplied clip up to 30 seconds. Local decoding creates deterministic timestamped frames, a contact sheet, and provenance receipts. No model, live capture, environment action, or HUD mutation runs here.
          </p>
        </div>
        <span className="rounded border border-emerald-300/20 bg-emerald-400/5 px-2 py-1 text-[9px] uppercase tracking-[0.14em] text-emerald-200">developer · offline only</span>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-[280px] flex-1 text-[10px] uppercase tracking-[0.14em] text-slate-500">
          Local clip
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/x-matroska,video/x-msvideo"
            className="mt-1 block w-full rounded border border-white/10 bg-black/20 px-2 py-2 text-xs normal-case tracking-normal text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-sky-400/10 file:px-2 file:py-1 file:text-sky-100"
            aria-label="Choose local video clip"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError(null);
            }}
          />
        </label>
        <button
          type="button"
          onClick={extract}
          disabled={!file || busy}
          className="flex items-center gap-2 rounded border border-sky-300/25 bg-sky-400/10 px-3 py-2 text-xs text-sky-100 hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
          {busy ? "Extracting…" : "Build evidence artifact"}
        </button>
      </div>

      {error ? <div role="alert" className="mt-3 rounded border border-red-300/20 bg-red-400/10 px-3 py-2 text-xs text-red-200">{error}</div> : null}

      {result ? (
        <div className="mt-3 grid gap-3 xl:grid-cols-[1.1fr_0.9fr]" data-testid="visual-sequence-result">
          <div className="overflow-hidden rounded border border-white/10 bg-black/25">
            <img
              src={result.manifest.contact_sheet.image_ref}
              alt="Timestamped visual-sequence contact sheet"
              className="block h-auto max-h-[430px] w-full object-contain"
            />
            <div className="flex flex-wrap gap-1 border-t border-white/10 p-2">
              {result.manifest.frames.map((frame, index) => (
                <a
                  key={frame.frame_id}
                  href={frame.image_ref}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded border border-white/10 bg-white/5 px-2 py-1 font-mono text-[9px] text-sky-200 hover:bg-white/10"
                  title={`decoded frame ${frame.decoded_index} · ${frame.sha256}`}
                >
                  {index + 1} · {(frame.pts_ms / 1_000).toFixed(3)}s
                </a>
              ))}
            </div>
          </div>

          <div className="space-y-2 text-[10px]">
            <div className="grid grid-cols-2 gap-2">
              <EvidenceMetric label="Duration" value={durationLabel} />
              <EvidenceMetric label="Selected" value={`${result.manifest.sampling.selected_count}/${result.manifest.sampling.candidate_count}`} />
              <EvidenceMetric label="Applied cadence" value={`${result.manifest.sampling.applied_cadence_ms} ms`} />
              <EvidenceMetric label="VFR" value={result.manifest.source.variable_frame_rate ? "detected" : "not detected"} />
              <EvidenceMetric label="Display" value={`${result.manifest.source.display_width}×${result.manifest.source.display_height}`} />
              <EvidenceMetric label="Rotation" value={`${result.manifest.source.rotation_deg}°`} />
            </div>
            <div className="rounded border border-white/10 bg-black/20 p-2 font-mono text-slate-400">
              <div className="text-slate-600">sequence</div>
              <div className="break-all text-sky-200">{result.manifest.sequence_id}</div>
              <div className="mt-2 text-slate-600">manifest sha256</div>
              <div title={result.manifest.manifest_sha256}>{shortHash(result.manifest.manifest_sha256)}</div>
              <div className="mt-2 text-slate-600">receipt</div>
              <div className="break-all">{result.receipt.receipt_id}</div>
            </div>
            <div className="rounded border border-emerald-300/15 bg-emerald-400/[0.04] p-2 text-emerald-100/80" data-testid="visual-sequence-authority-boundary">
              model=false · live_capture={String(Boolean(result.manifest.authority?.live_capture))} · environment_action=false · hud_mutation=false
            </div>
            <div className="flex gap-2">
              <a href={`/api/visual-sequences/${result.manifest.sequence_id}/artifacts/manifest.json`} target="_blank" rel="noreferrer" className="rounded border border-white/10 px-2 py-1 text-slate-300 hover:bg-white/5">Manifest</a>
              <a href={result.manifest.receipts_ref} target="_blank" rel="noreferrer" className="rounded border border-white/10 px-2 py-1 text-slate-300 hover:bg-white/5">Receipts</a>
              <a href={result.manifest.alignments_ref} target="_blank" rel="noreferrer" className="rounded border border-white/10 px-2 py-1 text-slate-300 hover:bg-white/5">Alignments</a>
            </div>
          </div>
        </div>
      ) : null}
      {hudIdentity ? <BoundedCaptureControls hudElement={hudElement} hudReceipt={hudReceipt} hudIdentity={hudIdentity} onArtifact={(captured) => { setResult({ manifest: captured.manifest, receipt: captured.receipt }); onArtifact?.(captured); }} /> : null}
    </article>
  );
}

function EvidenceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/10 bg-black/20 px-2 py-1.5">
      <div className="uppercase tracking-[0.12em] text-slate-600">{label}</div>
      <div className="mt-0.5 font-mono text-slate-200">{value}</div>
    </div>
  );
}
