import React, { useEffect, useMemo, useState, type ReactNode, type Ref } from "react";
import { Expand, Layers3, Minimize2, MonitorUp, ShieldAlert } from "lucide-react";
import {
  HUD_SURFACE_SCHEMA,
  composeHudSurface,
  type HudCompositionMode,
  type HudScene,
  type SurfaceFrame,
  type SurfaceSourceBinding,
} from "@shared/helix-hud-surface";

const MODE_LABELS: Record<HudCompositionMode, string> = {
  hud_only_alpha: "HUD alpha",
  hud_on_black: "Projector black",
  hud_over_source: "HUD + source",
  source_only: "Source only",
};

export type HudSurfaceHostProps = {
  profileLabel: string;
  atMs: number;
  binding: SurfaceSourceBinding;
  frame: SurfaceFrame | null;
  scene: HudScene;
  manualBlank?: boolean;
  emergencyStop?: boolean;
  initialMode?: HudCompositionMode;
  syntheticUnderlay?: ReactNode;
  children: ReactNode;
  feedRef?: Ref<HTMLDivElement>;
  onReceiptChange?: (receipt: import("@shared/helix-hud-surface").HudSurfaceRenderReceipt) => void;
};

function DefaultSyntheticUnderlay() {
  return (
    <div
      className="absolute inset-0 overflow-hidden bg-[linear-gradient(to_bottom,#07111f_0%,#12243a_48%,#111827_49%,#020617_100%)]"
      data-testid="hud-synthetic-underlay"
      aria-label="Synthetic source underlay"
    >
      <div className="absolute left-1/2 top-[48%] h-[55%] w-[72%] -translate-x-1/2 bg-gradient-to-b from-slate-700/45 to-slate-950 [clip-path:polygon(42%_0,58%_0,100%_100%,0_100%)]" />
      <div className="absolute left-1/2 top-[54%] h-[40%] w-px -translate-x-1/2 bg-gradient-to-b from-amber-100/70 to-transparent" />
      <div className="absolute left-[18%] top-[24%] h-px w-[64%] bg-cyan-200/10" />
    </div>
  );
}

export default function HudSurfaceHost({
  profileLabel,
  atMs,
  binding,
  frame,
  scene,
  manualBlank = false,
  emergencyStop = false,
  initialMode = "hud_only_alpha",
  syntheticUnderlay,
  children,
  feedRef,
  onReceiptChange,
}: HudSurfaceHostProps) {
  const [mode, setMode] = useState<HudCompositionMode>(initialMode);
  const [cleanFeedFullscreen, setCleanFeedFullscreen] = useState(false);
  const devicePixelRatio = typeof window === "undefined"
    ? 1
    : Math.min(4, Math.max(1, window.devicePixelRatio || 1));

  useEffect(() => {
    if (!cleanFeedFullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCleanFeedFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cleanFeedFullscreen]);

  const receipt = useMemo(() => composeHudSurface({
    atMs,
    binding,
    frame,
    scene,
    viewport: {
      schema: HUD_SURFACE_SCHEMA,
      viewportId: cleanFeedFullscreen ? "clean-feed-fullscreen" : "workstation-tab",
      mode,
      outputTarget: cleanFeedFullscreen ? "clean_feed" : "workstation_preview",
      outputWidth: 1280,
      outputHeight: 720,
      devicePixelRatio,
      crop: { xNorm: 0, yNorm: 0, widthNorm: 1, heightNorm: 1 },
      transformRef: "identity:unit-rect-v1",
    },
    controls: { manualBlank, emergencyStop },
  }), [atMs, binding, cleanFeedFullscreen, devicePixelRatio, emergencyStop, frame, manualBlank, mode, scene]);

  useEffect(() => { onReceiptChange?.(receipt); }, [onReceiptChange, receipt]);

  const sourceLayer = receipt.sourceVisible
    ? syntheticUnderlay ?? <DefaultSyntheticUnderlay />
    : null;
  const background = mode === "hud_on_black" ? "bg-black" : mode === "hud_only_alpha" ? "bg-transparent" : "bg-slate-950";

  const feed = (
    <div
      ref={feedRef}
      className={`relative isolate aspect-video h-auto w-full overflow-hidden ${background}`}
      data-testid="hud-clean-feed"
      data-output-target={receipt.outputTarget}
      data-composition-mode={mode}
      data-chrome="excluded"
      aria-label={`${profileLabel} clean visual feed`}
    >
      {sourceLayer}
      {receipt.hudVisible && mode !== "source_only" ? <div className="absolute inset-0 z-10">{children}</div> : null}
      {receipt.status === "blanked" ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black" data-testid="hud-surface-blank">
          <div className="font-mono text-xs uppercase tracking-[0.16em] text-red-200">surface blank · {receipt.reason.replaceAll("_", " ")}</div>
        </div>
      ) : null}
    </div>
  );

  if (cleanFeedFullscreen) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black" data-testid="hud-clean-feed-fullscreen" aria-label="Fullscreen clean HUD feed">
        {feed}
        <span className="sr-only">Press Escape to exit clean feed fullscreen</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-cyan-300/15 bg-slate-950/70 p-3" data-testid="hud-surface-host">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200"><Layers3 size={14} />Governed HUD surface host</div>
          <div className="mt-0.5 text-[10px] text-slate-500">{profileLabel} · normalized viewport · pixels-only authority</div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {(Object.keys(MODE_LABELS) as HudCompositionMode[]).map((candidate) => (
            <button
              key={candidate}
              type="button"
              onClick={() => setMode(candidate)}
              className={`rounded border px-2 py-1 text-[9px] ${mode === candidate ? "border-cyan-300/30 bg-cyan-300/15 text-cyan-100" : "border-white/10 text-slate-500 hover:bg-white/5"}`}
              aria-pressed={mode === candidate}
            >
              {MODE_LABELS[candidate]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCleanFeedFullscreen(true)}
            className="ml-1 flex items-center gap-1 rounded border border-violet-300/25 bg-violet-400/10 px-2 py-1 text-[9px] text-violet-100"
            aria-label="Open clean feed fullscreen"
          >
            <Expand size={12} />Fullscreen clean feed
          </button>
        </div>
      </div>

      <div className="mb-2 rounded border border-violet-300/20 bg-violet-400/[0.06] px-3 py-2" data-testid="normalized-hud-plane-notice">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-200">Normalized HUD coordinate plane</div>
        <p className="mt-1 text-[10px] leading-relaxed text-slate-400">No visor curvature, optical skew, eye-box correction, combiner calibration, or CAD-derived projection is applied. Those remain a later transform over this unchanged cue plane.</p>
      </div>

      <div className="overflow-hidden rounded-md border border-cyan-300/20">{feed}</div>

      <div className="mt-2 grid gap-1.5 text-[9px] sm:grid-cols-4" aria-label="HUD surface receipt summary">
        <div className="rounded border border-white/5 bg-black/20 px-2 py-1.5"><span className="text-slate-600">SOURCE</span><div className="truncate font-mono text-slate-300">{receipt.sourceFrameHash ?? "none"}</div></div>
        <div className="rounded border border-white/5 bg-black/20 px-2 py-1.5"><span className="text-slate-600">SCENE</span><div className="truncate font-mono text-slate-300">{receipt.hudSceneHash}</div></div>
        <div className="rounded border border-white/5 bg-black/20 px-2 py-1.5"><span className="text-slate-600">TRANSFORM</span><div className="truncate font-mono text-slate-300">{receipt.transformRef}</div></div>
        <div className="rounded border border-white/5 bg-black/20 px-2 py-1.5"><span className="text-slate-600">RECEIPT</span><div className="truncate font-mono text-cyan-200">{receipt.causalHash}</div></div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[9px] uppercase tracking-wide text-slate-500">
        <span className="flex items-center gap-1"><MonitorUp size={12} />{receipt.outputTarget.replaceAll("_", " ")} · {receipt.status} · {receipt.reason.replaceAll("_", " ")}</span>
        <span className="flex items-center gap-1"><ShieldAlert size={12} />Program input authority: false</span>
        <span className="flex items-center gap-1"><Minimize2 size={12} />Clean feed excludes controls and workstation chrome</span>
      </div>
    </div>
  );
}
