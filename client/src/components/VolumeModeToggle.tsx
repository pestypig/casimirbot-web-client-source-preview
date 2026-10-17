import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { publish, subscribe, unsubscribe } from "@/lib/luma-bus";
import { useGlobalPhase } from "@/hooks/useGlobalPhase";
import { PHASE_STREAK_BASE_HUE } from "@/constants/phase-streak";
import {
  CURVATURE_PALETTES,
  type CurvaturePalette,
  normalizeCurvaturePalette,
} from "@/lib/curvature-directive";

export type VolumeViz = 0 | 1 | 2 | 3 | 4; // 0=theta_GR, 1=rho_GR, 2=theta_Drive, 3=shear_GR, 4=vorticity_GR

const THETA = "\u03B8";
const RHO = "\u03C1";
const SIGMA = "\u03C3";
const OMEGA = "\u03C9";

const OVERLAY_STATE_QUERY_KEY = ["hull3d:overlay:controls"] as const;

type Overlay3DControlsSnapshot = {
  mode: 0 | 1 | 2 | 3 | 4;
  mix: number;
  alpha: number;
  thick: number;
  gain: number;
  hue: number;
  phase01: number;
  animate: boolean;
  curvAlpha: number;
  curvGain: number;
  curvPalette: CurvaturePalette;
  curvMargin: boolean;
};

const labels: Record<VolumeViz, { short: string; title: string }> = {
  2: {
    short: `${THETA} (Drive)`,
    title: `${THETA} (Drive) — York time scaled by drive chain and sector gating`,
  },
  0: {
    short: `${THETA} (GR)`,
    title: `${THETA} (GR) — York time from the GR extrinsic curvature trace`,
  },
  1: {
    short: `${RHO} (GR)`,
    title: `${RHO} (GR) — Hamiltonian constraint energy density (≤ 0 in shell)`,
  },
  3: {
    short: `${SIGMA}^2 (GR)`,
    title: `${SIGMA}^2 (GR) shear magnitude from K_ij K_ij - K^2/3`,
  },
  4: {
    short: `${OMEGA} (GR)`,
    title: `${OMEGA} (GR) vorticity proxy beta * sqrt(dfy^2 + dfz^2)`,
  },
};

const paletteLabels: Record<CurvaturePalette, string> = {
  cool: "Cool sequential",
  warm: "Warm sequential",
  diverging: "Diverging",
};

export interface VolumeModeToggleProps {
  value: VolumeViz;
  onChange?: (v: VolumeViz) => void;
  className?: string;
}

type OverlayKey =
  | "showHeatmapRing"
  | "showShellBands"
  | "showPhaseTracer"
  | "showReciprocity";

type OverlayFlags = Partial<Record<OverlayKey, boolean>>;
const DEFAULT_OVERLAY_FLAGS: OverlayFlags = {
  showPhaseTracer: true,
};

function OverlaysBlock({ className }: { className?: string }) {
  const queryClient = useQueryClient();
  const [overlays, setOverlays] = React.useState<OverlayFlags>(() => {
    const stored = queryClient.getQueryData(["helix:overlays"]) as OverlayFlags | undefined;
    return stored ?? { ...DEFAULT_OVERLAY_FLAGS };
  });

  React.useEffect(() => {
    queryClient.setQueryData(["helix:overlays"], overlays);
  }, [queryClient, overlays]);

  const setFlag = React.useCallback(
    (key: OverlayKey, next: boolean) => {
      setOverlays((prev) => {
        const nextState = { ...(prev ?? {}), [key]: next };
        queryClient.setQueryData(["helix:overlays"], nextState);
        return nextState;
      });
    },
    [queryClient]
  );

  const handleChange = React.useCallback(
    (key: OverlayKey, value: boolean) => {
      setFlag(key, value);
    },
    [setFlag]
  );

  const Row = ({ id, label }: { id: OverlayKey; label: string }) => {
    const checked = Boolean(overlays[id]);
    const inputId = `overlay-${id}`;
    return (
      <label
        htmlFor={inputId}
        className="flex w-full items-center justify-between rounded text-xs py-1 px-2 select-none transition hover:bg-slate-800/40 focus-within:ring-2 focus-within:ring-slate-500"
      >
        <span className="pr-2 text-left">{label}</span>
        <input
          id={inputId}
          type="checkbox"
          className="h-3 w-3 accent-emerald-500"
          checked={checked}
          onChange={(event) => handleChange(id, event.target.checked)}
        />
      </label>
    );
  };

  return (
    <div
      className={
        className
          ? `${className} rounded-lg border border-slate-700 p-3 space-y-1`
          : "rounded-lg border border-slate-700 p-3 space-y-1"
      }
    >
      <div className="text-[11px] tracking-wide uppercase text-slate-400 mb-1">
        Overlays
      </div>
      <Row id="showHeatmapRing" label="Sector heatmap ring" />
      <Row id="showShellBands" label="Shell-band contours (|df/dr|)" />
      <Row id="showPhaseTracer" label="Phase tracer" />
      <Row id="showReciprocity" label="Reciprocity lamp (burst vs τLC)" />
    </div>
  );
}

function Overlay3DControls({ className }: { className?: string }) {
  const queryClient = useQueryClient();
  const savedOverlay = React.useMemo<Overlay3DControlsSnapshot | undefined>(() => {
    const raw = queryClient.getQueryData(OVERLAY_STATE_QUERY_KEY) as
      | Partial<Overlay3DControlsSnapshot>
      | undefined;
    if (!raw) return undefined;
    return {
      ...raw,
      curvPalette: normalizeCurvaturePalette(raw.curvPalette),
    } as Overlay3DControlsSnapshot;
  }, [queryClient]);

  const [mode, setMode] = React.useState<0 | 1 | 2 | 3 | 4>(() => savedOverlay?.mode ?? 0);
  const [mix, setMix] = React.useState(() => savedOverlay?.mix ?? 0);
  const [alpha, setAlpha] = React.useState(() => savedOverlay?.alpha ?? 0.8);
  const [thick, setThick] = React.useState(() => savedOverlay?.thick ?? 0.12);
  const [gain, setGain] = React.useState(() => savedOverlay?.gain ?? 1.0);
  const [hue, setHue] = React.useState(() => {
    const storedHue = savedOverlay?.hue;
    return typeof storedHue === "number" && Number.isFinite(storedHue)
      ? storedHue
      : PHASE_STREAK_BASE_HUE;
  });
  const [animate, setAnimate] = React.useState(() => savedOverlay?.animate ?? true);
  const [curvAlpha, setCurvAlpha] = React.useState(() => savedOverlay?.curvAlpha ?? 0.45);
  const [curvGain, setCurvGain] = React.useState(() => savedOverlay?.curvGain ?? 1.0);
  const [curvPalette, setCurvPalette] = React.useState<CurvaturePalette>(() =>
    normalizeCurvaturePalette(savedOverlay?.curvPalette)
  );
  const [curvMargin, setCurvMargin] = React.useState(() => savedOverlay?.curvMargin ?? false);
  const phaseAnim = useGlobalPhase({ mode: "auto", periodMs: 8000, damp: 0.12, publishBus: false });
  const [phase01, setPhase01] = React.useState(() => savedOverlay?.phase01 ?? 0);

  const phaseToSend = React.useMemo(
    () => (animate ? phaseAnim : phase01),
    [animate, phaseAnim, phase01]
  );

  const emitOverlayState = React.useCallback(() => {
    const snapshot: Overlay3DControlsSnapshot = {
      mode,
      mix,
      alpha,
      thick,
      gain,
      hue,
      phase01: phaseToSend,
      animate,
      curvAlpha,
      curvGain,
      curvPalette,
      curvMargin,
    };

    if (mode === 4) {
      publish("hull3d:overlay", {
        mode: 0,
        mix,
        alpha: 0,
        thick,
        gain,
        hue,
        phase01: phaseToSend,
      });
      publish("hull3d:overlay:curvature", {
        enabled: true,
        gain: curvGain,
        alpha: curvAlpha,
        palette: curvPalette,
        showQIMargin: curvMargin,
      });
    } else {
      publish("hull3d:overlay", {
        mode,
        mix,
        alpha,
        thick,
        gain,
        hue,
        phase01: phaseToSend,
      });
      publish("hull3d:overlay:curvature", { enabled: false });
    }

    queryClient.setQueryData(OVERLAY_STATE_QUERY_KEY, (prev) => {
      if (prev && typeof prev === "object") {
        const prevSnapshot = prev as Overlay3DControlsSnapshot;
        if (
          prevSnapshot.mode === snapshot.mode &&
          prevSnapshot.mix === snapshot.mix &&
          prevSnapshot.alpha === snapshot.alpha &&
          prevSnapshot.thick === snapshot.thick &&
          prevSnapshot.gain === snapshot.gain &&
          prevSnapshot.hue === snapshot.hue &&
          prevSnapshot.phase01 === snapshot.phase01 &&
          prevSnapshot.animate === snapshot.animate &&
          prevSnapshot.curvAlpha === snapshot.curvAlpha &&
          prevSnapshot.curvGain === snapshot.curvGain &&
          prevSnapshot.curvPalette === snapshot.curvPalette &&
          prevSnapshot.curvMargin === snapshot.curvMargin
        ) {
          return prevSnapshot;
        }
      }
      return snapshot;
    });
  }, [mode, mix, alpha, thick, gain, hue, phaseToSend, animate, curvAlpha, curvGain, curvPalette, curvMargin, queryClient]);

  React.useEffect(() => {
    emitOverlayState();
  }, [emitOverlayState]);

  React.useEffect(() => {
    const handlerId = subscribe("hull3d:overlay:ping", () => {
      emitOverlayState();
    });
    return () => {
      unsubscribe(handlerId);
    };
  }, [emitOverlayState]);

  return (
    <div
      className={
        className
          ? `${className} rounded-lg border border-slate-700 p-3 space-y-3`
          : "rounded-lg border border-slate-700 p-3 space-y-3"
      }
    >
      <div className="text-[11px] tracking-wide uppercase text-slate-400">
        3D Overlay
      </div>
      <div className="grid grid-cols-2 gap-2 items-center text-xs text-slate-300">
        <span className="text-[11px] text-slate-400">Mode</span>
        <Select
          value={String(mode)}
          onValueChange={(v) => setMode(Number(v) as 0 | 1 | 2 | 3 | 4)}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="Off" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Off</SelectItem>
            <SelectItem value="1">Sector Fog (3D)</SelectItem>
            <SelectItem value="2">Iso-shell |df/dr|</SelectItem>
            <SelectItem value="3">Phase Streaks</SelectItem>
            <SelectItem value="4">Curvature Î²-amp</SelectItem>
          </SelectContent>
        </Select>

        {mode !== 4 ? (
          <>
            <span className="text-[11px] text-slate-400">Instant â EMA</span>
            <Slider
              value={[mix]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={([value]) => setMix(value)}
            />

            <span className="text-[11px] text-slate-400">Alpha</span>
            <Slider
              value={[alpha]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={([value]) => setAlpha(value)}
            />

            <span className="text-[11px] text-slate-400">Thickness (RÃ)</span>
            <Slider
              value={[thick]}
              min={0.02}
              max={0.5}
              step={0.005}
              onValueChange={([value]) => setThick(value)}
            />

            <span className="text-[11px] text-slate-400">Gain</span>
            <Slider
              value={[gain]}
              min={0.05}
              max={5}
              step={0.05}
              onValueChange={([value]) => setGain(value)}
            />

            <span className="text-[11px] text-slate-400">Hue</span>
            <Slider
              value={[hue]}
              min={0}
              max={1}
              step={0.005}
              onValueChange={([value]) => {
                setHue(value);
              }}
            />

            <span className="text-[11px] text-slate-400">Animate phase</span>
            <div className="flex items-center gap-2">
              <Switch checked={animate} onCheckedChange={setAnimate} />
              {!animate && (
                <Slider
                  className="ml-2 flex-1"
                  value={[phase01]}
                  min={0}
                  max={1}
                  step={0.001}
                  onValueChange={([value]) => setPhase01(value)}
                />
              )}
            </div>
          </>
        ) : (
          <>
            <span className="text-[11px] text-slate-400">Curvature alpha</span>
            <Slider
              value={[curvAlpha]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={([value]) => setCurvAlpha(value)}
            />

            <span className="text-[11px] text-slate-400">Curvature gain</span>
            <Slider
              value={[curvGain]}
              min={0.1}
              max={6}
              step={0.05}
              onValueChange={([value]) => setCurvGain(value)}
            />

            <span className="text-[11px] text-slate-400">Palette</span>
            <Select value={curvPalette} onValueChange={(value: CurvaturePalette) => setCurvPalette(value)}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Palette" />
              </SelectTrigger>
              <SelectContent>
                {CURVATURE_PALETTES.map((palette) => (
                  <SelectItem key={palette} value={palette}>
                    {paletteLabels[palette]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <span className="text-[11px] text-slate-400">QI margin</span>
            <div className="flex items-center gap-2">
              <Switch checked={curvMargin} onCheckedChange={setCurvMargin} />
              <span className="text-[11px] text-slate-400">Highlight</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function VolumeModeToggle({ value, onChange, className }: VolumeModeToggleProps) {
  const setMode = React.useCallback(
    (mode: VolumeViz) => {
      if (mode === value) return;
      onChange?.(mode);
      publish("warp:viz", { volumeViz: mode });
    },
    [onChange, value]
  );

  const renderButton = (mode: VolumeViz) => {
    const { short, title } = labels[mode];
    return (
      <Button
        key={mode}
        size="sm"
        variant={value === mode ? "default" : "outline"}
        title={title}
        onClick={() => setMode(mode)}
      >
        {short}
      </Button>
    );
  };

  return (
    <>
      <div className={className ? `inline-flex gap-1 ${className}` : "inline-flex gap-1"}>
        {renderButton(2)}
        {renderButton(0)}
        {renderButton(1)}
        {renderButton(3)}
        {renderButton(4)}
      </div>
      <OverlaysBlock className="mt-3" />
      <Overlay3DControls className="mt-3" />
    </>
  );
}
