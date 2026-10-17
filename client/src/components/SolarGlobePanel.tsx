import React, { useCallback, useEffect, useMemo, useState } from "react";
import { shallow } from "zustand/shallow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useSolarGlobeStore } from "@/store/useSolarGlobeStore";
import { cn } from "@/lib/utils";
import { SolarEvidenceStatus } from './SolarEvidenceStatus';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const formatPercent = (value: number, digits = 1) => {
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
};

const formatSmall = (value: number, digits = 3) => {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(digits);
};

const lerpColor = (a: [number, number, number], b: [number, number, number], t: number) => {
  const clamped = clamp(t, 0, 1);
  const mix = (i: number) => Math.round(a[i] + (b[i] - a[i]) * clamped);
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
};

const useRafTick = (tick: (dt: number) => void) => {
  useEffect(() => {
    if (typeof window === "undefined") return;
    let raf: number;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      tick(dt);
      raf = window.requestAnimationFrame(loop);
    };

    raf = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(raf);
  }, [tick]);
};

const BADGE_META = [
  { key: "kMix", label: "Mixing κ" },
  { key: "core", label: "Core H%" },
  { key: "entropy", label: "Entropy ΔS" },
  { key: "luminosity", label: "L / L☉" },
] as const;

export const SolarGlobePanel: React.FC = () => {
  const { state, cmd, holdMix, tick, setMix, injectBurst, setHoldMix, setAuto } = useSolarGlobeStore(
    (s) => ({
      state: s.state,
      cmd: s.cmd,
      holdMix: s.holdMix,
      tick: s.tick,
      setMix: s.setMix,
      injectBurst: s.injectBurst,
      setHoldMix: s.setHoldMix,
      setAuto: s.setAuto,
    }),
    shallow,
  );

  const [burstKg, setBurstKg] = useState(800);

  useRafTick(tick);

  const visualScale = useMemo(() => {
    const delta = state.radius_ui - 1;
    return 1 + delta * 9; // make tiny radius deltas readable
  }, [state.radius_ui]);

  const heat = useMemo(() => {
    const entropyNorm = clamp((state.entropyDrift + 0.05) / 0.15, 0, 1);
    return clamp(0.2 + entropyNorm * 0.8, 0, 1);
  }, [state.entropyDrift]);

  const sphereColor = useMemo(
    () => lerpColor([90, 166, 255], [255, 158, 94], heat),
    [heat],
  );

  const handleBurst = useCallback(() => {
    injectBurst(burstKg);
  }, [injectBurst, burstKg]);

  const badges = useMemo(() => {
    return [
      formatPercent(cmd.kMix, 0),
      formatPercent(state.coreH_frac, 1),
      formatSmall(state.entropyDrift, 3),
      `${(state.luminosity * 100).toFixed(2)}%`,
    ];
  }, [cmd.kMix, state.coreH_frac, state.entropyDrift, state.luminosity]);

  return (
    <div className="flex h-full flex-col rounded-xl border border-white/10 bg-slate-950/70 text-slate-100 shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div className="flex flex-col">
          <span className="text-sm font-semibold uppercase tracking-wide text-slate-200">
            Solar Globe (Fusion Balance)
          </span>
          <span className="text-[11px] text-slate-400">Tend the fire. Order is borrowed.</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] uppercase text-slate-400">
          Auto-stabilize
          <Switch
            checked={cmd.autoStabilize}
            onCheckedChange={(v) => setAuto(Boolean(v))}
            className="data-[state=checked]:bg-amber-500 data-[state=unchecked]:bg-slate-700"
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <SolarEvidenceStatus kind="Illustration" availability="Available"
          provenance="Local animation state; no observational or MESA input binding."
          quantity="Toy core fraction, luminosity ratio, entropy proxy and radius."
          coordinates="Animation seconds, not stellar evolutionary time."
          processing="Toy burn/injection scalers, tanh luminosity and smoothed/clamped radius; radius deviations visually magnified ninefold."
          uncertainty="No calibrated physical uncertainty model."
          reproduction="Interactive local state is not an evolved-model archive."
          limitations="Illustrative fusion-balance animation, not a conservative stellar evolution solution or evidence for refuelling feasibility." />
        <div className="relative flex flex-1 flex-col items-center justify-center rounded-xl border border-white/5 bg-gradient-to-b from-slate-900/60 to-slate-950/80 p-6">
          <div
            className="relative flex h-64 w-64 items-center justify-center"
            style={{ transform: `scale(${visualScale})` }}
          >
            <div
              className="absolute h-64 w-64 rounded-full blur-3xl opacity-60 transition-colors duration-500"
              style={{
                background: sphereColor,
              }}
            />
            <div
              className="relative h-64 w-64 rounded-full border border-white/10 shadow-inner shadow-black/70 transition-transform duration-300 ease-out"
              style={{
                background: `radial-gradient(circle at 30% 25%, rgba(255,255,255,0.9), ${sphereColor})`,
                boxShadow: `0 0 40px ${sphereColor}`,
              }}
            >
              <div className="absolute inset-0 rounded-full opacity-30"
                style={{
                  backgroundImage:
                    "radial-gradient(circle, transparent 45%, rgba(255,255,255,0.05) 46%, transparent 47%), radial-gradient(circle, transparent 70%, rgba(255,255,255,0.05) 71%, transparent 72%)",
                }}
              />
              <div
                className="absolute inset-0 rounded-full opacity-25"
                style={{
                  backgroundImage:
                    "linear-gradient(0deg, transparent 48%, rgba(255,255,255,0.09) 50%, transparent 52%), linear-gradient(90deg, transparent 48%, rgba(255,255,255,0.09) 50%, transparent 52%)",
                }}
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-3 text-[11px] font-semibold uppercase text-slate-300">
            {BADGE_META.map((meta, idx) => (
              <Badge
                key={meta.key}
                className={cn(
                  "border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold tracking-wide",
                  meta.key === "entropy" && "text-amber-200",
                  meta.key === "luminosity" && "text-sky-200",
                )}
              >
                <span className="mr-2 opacity-70">{meta.label}</span>
                <span className="font-mono text-xs text-white">{badges[idx]}</span>
              </Badge>
            ))}
          </div>
        </div>

        <div className="grid gap-4 rounded-xl border border-white/5 bg-slate-950/60 p-4 text-sm">
          <div>
            <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
              <span>Mixing κ</span>
              <span className="font-mono text-slate-100">{cmd.kMix.toFixed(2)}</span>
            </div>
            <Slider
              value={[cmd.kMix]}
              max={1}
              step={0.01}
              onValueChange={([value]) => setMix(value ?? 0)}
              className="[&_[role=slider]]:bg-amber-400"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
              <span>Inject H burst (kg)</span>
              <span className="font-mono text-slate-100">{Math.round(burstKg)}</span>
            </div>
            <Slider
              value={[burstKg]}
              min={100}
              max={4000}
              step={50}
              onValueChange={([value]) => setBurstKg(value ?? burstKg)}
              className="[&_[role=slider]]:bg-sky-400"
            />
            <Button
              onClick={handleBurst}
              className="mt-2 w-full bg-sky-500 text-[13px] font-semibold uppercase tracking-wide text-slate-950 hover:bg-sky-400"
            >
              Inject H
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/5 px-4 py-3 text-xs uppercase tracking-wide text-slate-300">
            <span>Hold Mix</span>
            <Switch
              checked={holdMix}
              onCheckedChange={(v) => setHoldMix(Boolean(v))}
              className="data-[state=checked]:bg-slate-200 data-[state=unchecked]:bg-slate-700"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SolarGlobePanel;
