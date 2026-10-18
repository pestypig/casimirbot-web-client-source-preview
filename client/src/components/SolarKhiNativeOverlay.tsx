import React from "react";
import {SolarEvidenceStatus} from './SolarEvidenceStatus';
import {HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT} from '../lib/workstation/accountCapabilityPolicy';
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SolarKhiObservationV1Schema,
  type SolarKhiObservationV1,
} from "@shared/contracts/solar-khi-observation.v1";

const SCALE_LANES = [
  { label: "KHI structure", detail: "25–170 km · native detector pixels" },
  { label: "FastCam field", detail: "5.8 × 4.35 Mm" },
  { label: "DKIST VBI context", detail: "active-region context · ~50 Mm" },
  { label: "SDO/HMI active region", detail: "registered magnetic context" },
  { label: "Full solar disk", detail: "global context only" },
] as const;

export function SolarKhiNativeOverlay() {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const manifestPicker=React.useRef<HTMLInputElement|null>(null);
  const imagePicker=React.useRef<HTMLInputElement|null>(null);
  const [manifest, setManifest] = React.useState<SolarKhiObservationV1 | null>(null);
  const [image, setImage] = React.useState<HTMLImageElement | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [scaleLevel, setScaleLevel] = React.useState(0);
  const [frameIndex, setFrameIndex] = React.useState(0);
  const [reconstruction, setReconstruction] = React.useState<"mfbd" | "speckle">("mfbd");
  const generations=React.useRef({manifest:0,image:0});
  const ownedUrl=React.useRef<string|null>(null);
  const releaseImage=()=>{if(ownedUrl.current)URL.revokeObjectURL(ownedUrl.current);ownedUrl.current=null;};

  React.useEffect(()=>{
    const clear=()=>{
      generations.current.manifest++;generations.current.image++;
      releaseImage();setManifest(null);setImage(null);setFrameIndex(0);
      if(manifestPicker.current)manifestPicker.current.value='';
      if(imagePicker.current)imagePicker.current.value='';
      setError('Account changed; imported KHI inputs cleared.');
      const canvas=canvasRef.current;canvas?.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);
    };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,clear);
    return()=>{generations.current.manifest++;generations.current.image++;releaseImage();window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,clear);};
  },[]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    if (!manifest) return;

    ctx.lineWidth = Math.max(1, image.naturalWidth / 700);
    ctx.font = `${Math.max(11, image.naturalWidth / 80)}px ui-monospace, monospace`;
    for (const track of manifest.vortex_tracks.filter((candidate) => candidate.reconstruction === reconstruction)) {
      ctx.strokeStyle = "rgba(34, 211, 238, 0.95)";
      ctx.fillStyle = "rgba(34, 211, 238, 0.12)";
      ctx.beginPath();
      track.instance_polygon_px.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x_px, point.y_px);
        else ctx.lineTo(point.x_px, point.y_px);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      const sample = track.samples.find((candidate) => candidate.frame_index === frameIndex);
      if (sample) {
        ctx.fillStyle = "#fde047";
        ctx.beginPath();
        ctx.arc(sample.centroid_px.x_px, sample.centroid_px.y_px, Math.max(2, image.naturalWidth / 250), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillText(track.track_id, sample.centroid_px.x_px + 5, sample.centroid_px.y_px - 5);
      }
    }
  }, [frameIndex, image, manifest, reconstruction]);

  const loadManifest = async (file: File | undefined) => {
    const generation=++generations.current.manifest;
    setManifest(null);
    if (!file) return;
    try {
      if(file.size>1_000_000)throw Error('Manifest exceeds 1 MB.');
      const text=await file.text();
      if(new TextEncoder().encode(text).length>1_000_000)throw Error('Manifest exceeds 1 MB.');
      const parsed = SolarKhiObservationV1Schema.parse(JSON.parse(text));
      if(generation!==generations.current.manifest)return;
      setManifest(parsed);
      setFrameIndex(0);
      setError(null);
    } catch (cause) {
      if(generation!==generations.current.manifest)return;
      setManifest(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const loadFrame = (file: File | undefined) => {
    const generation=++generations.current.image;
    releaseImage();setImage(null);
    const canvas=canvasRef.current;canvas?.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);
    if (!file) return;
    const nextUrl = URL.createObjectURL(file);
    ownedUrl.current=nextUrl;
    const nextImage = new Image();
    nextImage.onload = () => {
      if(generation!==generations.current.image)return;
      setImage(nextImage);
      setError(null);
    };
    nextImage.onerror = () => {if(generation===generations.current.image)setError("Could not decode the selected native FastCam frame.");};
    nextImage.src = nextUrl;
  };

  const product = manifest?.reconstruction_products.find((candidate) => candidate.kind === reconstruction);
  const maxFrame = Math.max(0, (product?.frame_count ?? 1) - 1);
  const scale = SCALE_LANES[scaleLevel];
  const activeContextRef = scaleLevel < 2
    ? product?.frame_artifact_refs[Math.min(frameIndex, Math.max(0, (product?.frame_artifact_refs.length ?? 1) - 1))]
    : manifest?.parent_context_image_refs[Math.min(scaleLevel - 2, Math.max(0, (manifest?.parent_context_image_refs.length ?? 1) - 1))];

  return (
    <Card className="bg-slate-900/60 border-slate-800">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle>DKIST FastCam Native KHI Overlay</CardTitle>
            <CardDescription>
              Native-pixel tracks with MFBD/speckle provenance. Measurements remain numerical; this view is presentation only.
            </CardDescription>
            <SolarEvidenceStatus kind="Derived diagnostic" availability={manifest&&image?'Available':'Missing'}
              provenance="Schema-checked manifest declarations; selected image identity is not bound to a manifest frame."
              quantity="Native-pixel overlay; not calibrated radiance or a stellar-interior observation."
              coordinates="Manifest pixel/world coordinates are declarations; registration to the imported image is not verified."
              uncertainty="Manifest confidence and registration metadata are not independently validated here."
              limitations="Image and manifest are imported separately. Matching appearance, reconstruction selection or frame slider does not establish file identity or measurement registration." />
          </div>
          <Badge variant="outline" className="border-cyan-400/40 text-cyan-200">
            {manifest ? manifest.energy_calibration : "manifest required"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="khi-observation-manifest">Observation manifest</Label>
            <Input ref={manifestPicker} id="khi-observation-manifest" type="file" accept="application/json,.json" onChange={(event) => void loadManifest(event.target.files?.[0])} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="khi-native-frame">Native reconstruction frame</Label>
            <Input ref={imagePicker} id="khi-native-frame" type="file" accept="image/png,image/jpeg,image/tiff" onChange={(event) => loadFrame(event.target.files?.[0])} />
          </div>
        </div>

        {error ? <div className="rounded border border-rose-500/40 bg-rose-950/30 p-2 text-xs text-rose-200">{error}</div> : null}

        <div className="grid gap-3 lg:grid-cols-[1fr_240px]">
          <div className="max-h-[760px] overflow-auto rounded border border-slate-800 bg-black p-1">
            {image ? (
              <canvas
                ref={canvasRef}
                className={scaleLevel === 0 ? "max-w-none" : "h-auto max-w-full"}
                style={scaleLevel === 0 ? { width: image.naturalWidth, height: image.naturalHeight } : undefined}
                aria-label="Native-resolution DKIST FastCam KHI track overlay"
              />
            ) : (
              <div className="grid min-h-72 place-items-center px-8 text-center text-xs text-slate-500">
                Load one native MFBD or speckle frame. The canvas backing store will use its original pixel dimensions without the 224-pixel coherence-grid cap.
              </div>
            )}
          </div>

          <div className="space-y-3 rounded border border-slate-800 bg-slate-950/70 p-3 text-xs">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Scale lane</div>
              <div className="font-medium text-cyan-200">{scale.label}</div>
              <div className="text-slate-400">{scale.detail}</div>
            </div>
            <input
              aria-label="Solar spatial scale"
              type="range"
              min={0}
              max={SCALE_LANES.length - 1}
              value={scaleLevel}
              onChange={(event) => setScaleLevel(Number(event.target.value))}
              className="w-full accent-cyan-400"
            />
            <ol className="space-y-1 text-[11px] text-slate-400">
              {SCALE_LANES.map((lane, index) => (
                <li key={lane.label} className={index === scaleLevel ? "text-cyan-200" : undefined}>
                  {index + 1}. {lane.label}
                </li>
              ))}
            </ol>
            <div className="break-all rounded bg-slate-900 p-2 text-[10px] text-slate-500">
              context: {activeContextRef ?? "not loaded"}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <Label htmlFor="khi-reconstruction">Reconstruction</Label>
          <select
            id="khi-reconstruction"
            value={reconstruction}
            onChange={(event) => setReconstruction(event.target.value as "mfbd" | "speckle")}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1"
          >
            <option value="mfbd">MFBD</option>
            <option value="speckle">Speckle</option>
          </select>
          <Label htmlFor="khi-frame">Frame</Label>
          <input
            id="khi-frame"
            type="range"
            min={0}
            max={maxFrame}
            value={Math.min(frameIndex, maxFrame)}
            onChange={(event) => setFrameIndex(Number(event.target.value))}
            className="accent-cyan-400"
          />
          <span className="text-slate-400">{Math.min(frameIndex, maxFrame) + 1}/{maxFrame + 1}</span>
          {manifest ? (
            <>
              <Badge variant="outline">{manifest.sampling.native_km_per_pixel} km/px</Badge>
              <Badge variant="outline">{manifest.sampling.effective_resolution_km} km resolution</Badge>
              <Badge variant="outline">{manifest.sampling.reconstructed_cadence_s} s cadence</Badge>
              <Badge variant="outline">μ={manifest.coordinates.mu}</Badge>
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
