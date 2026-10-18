import React, { useEffect, useRef, useState } from "react";
import { CircleStop, MonitorUp, ShieldX, Video } from "lucide-react";
import type { HudSurfaceRenderReceipt } from "@shared/helix-hud-surface";
import type {
  VisualSequenceCaptureSurface,
  VisualSequenceErrorResponse,
  VisualSequenceIngestResponse,
} from "@shared/helix-visual-sequence";
import {
  BoundedCaptureError,
  startBoundedVisualSequenceCapture,
  type ActiveBoundedCapture,
  type CaptureIdentity,
} from "../../../lib/helix/boundedVisualSequenceCapture";
import {
  fetchAccountCapabilityPolicy,
  readCachedAccountProfileIdentity,
} from "../../../lib/workstation/accountCapabilityPolicy";

type Props = {
  hudElement: HTMLElement | null;
  hudReceipt: HudSurfaceRenderReceipt | null;
  hudIdentity: CaptureIdentity;
  onArtifact: (result: VisualSequenceIngestResponse) => void;
};

const SOURCE_OPTIONS: Array<[VisualSequenceCaptureSurface, string]> = [
  ["hud_composed_feed", "HUD + source feed"],
  ["hud_clean_feed", "HUD clean feed"],
  ["minecraft_client_window", "Minecraft client window"],
  ["program_window", "Selected program / browser tab"],
];

const uploadCapture = async (blob: Blob, metadata: import("@shared/helix-visual-sequence").VisualSequenceCaptureMetadata) => {
  const body = new FormData();
  body.append("video", blob, `${metadata.capture_session_id}.webm`);
  body.append("thread_id", metadata.thread_id);
  body.append("cadence_ms", "1000");
  body.append("capture_metadata", JSON.stringify(metadata));
  const response = await fetch("/api/visual-sequences", { method: "POST", body, credentials: "same-origin" });
  const payload = await response.json() as VisualSequenceIngestResponse | VisualSequenceErrorResponse;
  if (!response.ok || !payload.ok) throw new Error(payload.ok ? "Capture ingestion failed." : payload.message);
  return payload;
};

export default function BoundedCaptureControls({ hudElement, hudReceipt, hudIdentity, onArtifact }: Props) {
  const [source, setSource] = useState<VisualSequenceCaptureSurface>("hud_composed_feed");
  const [durationMs, setDurationMs] = useState<10_000 | 15_000>(10_000);
  const [consent, setConsent] = useState(false);
  const [contentCleared, setContentCleared] = useState(false);
  const [state, setState] = useState<"idle" | "selecting" | "recording" | "processing">("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef<ActiveBoundedCapture | null>(null);
  const mountedRef = useRef(true);
  const receiptRef = useRef(hudReceipt);
  const identityRef = useRef(hudIdentity);
  receiptRef.current = hudReceipt;
  identityRef.current = hudIdentity;

  useEffect(() => () => {
    mountedRef.current = false;
    activeRef.current?.revoke();
  }, []);

  const start = async () => {
    if (!consent || !contentCleared || state !== "idle") return;
    setError(null);
    setElapsedMs(0);
    setState("selecting");
    try {
      if (!readCachedAccountProfileIdentity().profileId) await fetchAccountCapabilityPolicy();
      const profileId = readCachedAccountProfileIdentity().profileId;
      if (!profileId) throw new Error("A signed-in developer profile is required.");
      const isHud = source === "hud_clean_feed" || source === "hud_composed_feed";
      if (isHud && !hudReceipt) throw new Error("The HUD render receipt is unavailable.");
      if (source === "hud_clean_feed" && hudReceipt?.mode === "hud_over_source") {
        throw new Error("Switch the HUD surface to HUD alpha or projector black before clean-feed capture.");
      }
      if (source === "hud_composed_feed" && hudReceipt?.mode !== "hud_over_source") {
        throw new Error("Switch the HUD surface to HUD + source before composed-feed capture.");
      }
      const identity: CaptureIdentity = isHud
        ? { ...hudIdentity, profileId }
        : { sourceId: "pending-picker", producerEpoch: "pending-picker", profileId, runId: `capture:${source}`, threadId: "motorcycle-hud-lab" };
      const active = await startBoundedVisualSequenceCapture({
        consent: true,
        contentCleared: true,
        surface: source,
        durationMs,
        identity,
        getIdentity: isHud ? () => ({ ...identityRef.current, profileId }) : undefined,
        hudElement: isHud ? hudElement : null,
        getHudReceipt: isHud ? () => receiptRef.current : undefined,
        onProgress: setElapsedMs,
      });
      activeRef.current = active;
      if (!mountedRef.current) {
        activeRef.current = null;
        active.revoke();
        void active.completion.catch(() => undefined);
        return;
      }
      setState("recording");
      const captured = await active.completion;
      activeRef.current = null;
      setState("processing");
      onArtifact(await uploadCapture(captured.blob, captured.metadata));
      setConsent(false);
      setContentCleared(false);
      setState("idle");
    } catch (caught) {
      activeRef.current = null;
      if (!mountedRef.current) return;
      setState("idle");
      setConsent(false);
      setContentCleared(false);
      const message = caught instanceof BoundedCaptureError ? caught.message : caught instanceof Error ? caught.message : "Bounded capture failed.";
      setError(message);
    }
  };

  return (
    <section className="mt-3 rounded border border-violet-300/15 bg-violet-400/[0.035] p-3" data-testid="bounded-capture-controls">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-violet-100"><Video size={15} />Consented bounded capture · VSE-0B</div>
          <p className="mt-1 max-w-3xl text-[10px] leading-relaxed text-slate-500">Records only the surface you affirmatively select for 10 or 15 seconds, without audio. Program and Minecraft capture require choosing one window or browser tab; whole-screen capture fails closed.</p>
        </div>
        <span className="rounded border border-violet-300/20 px-2 py-1 text-[9px] uppercase tracking-[0.14em] text-violet-200">developer only · visible capture</span>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_110px_auto]">
        <label className="text-[9px] uppercase tracking-[0.13em] text-slate-500">Selected surface
          <select aria-label="Bounded capture surface" value={source} disabled={state !== "idle"} onChange={(event) => setSource(event.target.value as VisualSequenceCaptureSurface)} className="mt-1 w-full rounded border border-white/10 bg-slate-950 px-2 py-2 text-xs normal-case tracking-normal text-slate-200">
            {SOURCE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-[9px] uppercase tracking-[0.13em] text-slate-500">Duration
          <select aria-label="Bounded capture duration" value={durationMs} disabled={state !== "idle"} onChange={(event) => setDurationMs(Number(event.target.value) as 10_000 | 15_000)} className="mt-1 w-full rounded border border-white/10 bg-slate-950 px-2 py-2 text-xs normal-case tracking-normal text-slate-200"><option value={10000}>10 seconds</option><option value={15000}>15 seconds</option></select>
        </label>
        <div className="flex items-end gap-1">
          {state === "idle" ? <button type="button" disabled={!consent || !contentCleared} onClick={start} className="flex items-center gap-1 rounded border border-violet-300/25 bg-violet-400/10 px-3 py-2 text-xs text-violet-100 disabled:opacity-40"><MonitorUp size={14} />Start capture</button> : null}
          {state === "recording" ? <><button type="button" onClick={() => activeRef.current?.stop()} className="flex items-center gap-1 rounded border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-xs text-amber-100"><CircleStop size={14} />Stop</button><button type="button" onClick={() => activeRef.current?.revoke()} className="flex items-center gap-1 rounded border border-red-300/25 bg-red-400/10 px-3 py-2 text-xs text-red-100"><ShieldX size={14} />Revoke</button></> : null}
        </div>
      </div>
      <label className="mt-2 flex items-start gap-2 text-[10px] text-slate-400"><input aria-label="Consent to bounded capture" type="checkbox" checked={consent} disabled={state !== "idle"} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5" /><span>I consent to capture the selected surface now. I understand capture is visible, bounded, audio-free, and revocable.</span></label>
      <label className="mt-1 flex items-start gap-2 text-[10px] text-slate-400"><input aria-label="Confirm surface excludes protected or sensitive content" type="checkbox" checked={contentCleared} disabled={state !== "idle"} onChange={(event) => setContentCleared(event.target.checked)} className="mt-0.5" /><span>I confirm this surface excludes protected media, credentials, private messages, and other sensitive content.</span></label>
      {state !== "idle" ? <div className="mt-2" data-testid="bounded-capture-progress"><div className="flex justify-between text-[9px] uppercase tracking-wider text-violet-200"><span>{state}</span><span>{(elapsedMs / 1000).toFixed(1)} / {durationMs / 1000}s</span></div><div className="mt-1 h-1 overflow-hidden rounded bg-white/5"><div className="h-full bg-violet-300 transition-[width]" style={{ width: `${Math.min(100, elapsedMs / durationMs * 100)}%` }} /></div></div> : null}
      {error ? <div role="alert" className="mt-2 rounded border border-red-300/20 bg-red-400/10 px-2 py-1.5 text-[10px] text-red-200">{error}</div> : null}
      <div className="mt-2 font-mono text-[9px] text-slate-600">input=false · model=false · environment_action=false · safety_authority=false</div>
    </section>
  );
}
