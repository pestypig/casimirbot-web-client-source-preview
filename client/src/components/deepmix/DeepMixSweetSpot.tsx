'use client';

import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {SolarEvidenceStatus} from '@/components/SolarEvidenceStatus';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import type { TooltipProps } from "recharts";
import {exportDeepMixToyRun} from '@/lib/workstation/exportDeepMixToyRun';
import {DEEPMIX_TOY_ENGINE_VERSION,deepMixToyFleetToTrip,
  deepMixToyParamsForPreset,scanDeepMixToyFleet,simulateDeepMixToy,type DeepMixToyParams} from "@shared/deepmix-toy-model";

export type DeepMixParams=DeepMixToyParams;

// -------------------- UI Component --------------------
export default function DeepMixSweetSpot() {
  // Controls
  const [ships, setShips] = useState<number>(1_000_000); // fleet size
  const [rateKgS, setRateKgS] = useState<number>(1e3); // kg/s per ship
  const [horizonYrs, setHorizonYrs] = useState<number>(200);
  const [exportStatus,setExportStatus]=useState('');

  // Base params + luminosity proxy
  const baseParams: DeepMixToyParams = useMemo(()=>deepMixToyParamsForPreset('sweetspot-legacy/1'),[]);

  // Mix vs no-mix
  const sim = useMemo(() => {
    const p = deepMixToyFleetToTrip(baseParams, ships, rateKgS);
    return simulateDeepMixToy(p, horizonYrs, 0.2);
  }, [baseParams, ships, rateKgS, horizonYrs]);

  const Pfinal = sim.at(-1)?.P ?? 0;
  const Xmin = sim.reduce((m, pt) => Math.min(m, pt.Xc), 1);
  const guardX = baseParams.trip.guard?.X ?? null;

  const pass =
    (guardX === null || Xmin >= guardX) &&
    Pfinal < 0.2; // arbitrary toy-index threshold, not a stellar probability

  // Baseline (no-mix) for reference / suppression metric
  const noMixParams: DeepMixToyParams = useMemo(
    () => ({ ...baseParams, trip: { ...baseParams.trip, mdotMax: 0, Mtrip: 0 } }),
    [baseParams]
  );
  const noMixSim = useMemo(() => simulateDeepMixToy(noMixParams, horizonYrs, 0.2), [noMixParams, horizonYrs]);
  const PfinalNoMix = noMixSim.at(-1)?.P ?? 0;

  const absoluteReduction = Math.max(0, (PfinalNoMix - Pfinal) * 100); // percentage points
  const suppressionRatio =
    PfinalNoMix > 1e-9 ? Math.max(0, Math.min(1, Pfinal / PfinalNoMix)) : null; // lower is better

  // Sweet-spot scan (log-spaced fleets)
  const sweet = useMemo(() => {
    const grid: number[] = [];
    for (let e = 3; e <= 10; e += 0.25) grid.push(Math.round(Math.pow(10, e)));
    return scanDeepMixToyFleet(baseParams, horizonYrs, grid, rateKgS);
  }, [baseParams, horizonYrs, rateKgS]);

  const sweetMin = useMemo(() => {
    return sweet.find((candidate) => candidate.pass) ?? null;
  }, [sweet]);

  // Recharts data
  const sweetData = sweet.map((d) => ({ ships: d.ships, hazard: d.P, pass: d.pass }));
  const hazardTooltipFormatter: TooltipProps<number, string>["formatter"] = (value, name) => {
    if (!Number.isFinite(value)) {
      return "N/A";
    }
    if (name === "hazard") {
      return value.toFixed(3);
    }
    return value.toLocaleString();
  };

  return (
    <div className="w-full">
      <Card className="w-full">
        <CardContent className="p-4 lg:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Deep-Mixing: Toy Parameter Scanner</h2>
            <Badge variant={pass ? "default" : "destructive"}>{pass ? "Toy gate met" : "Toy gate not met"}</Badge>
          </div>
          <p className="mb-4 text-xs text-amber-200">{DEEPMIX_TOY_ENGINE_VERSION} · preset sweetspot-legacy/1. Local one-zone equations only; the hazard is assumed, not a measured red-giant transition probability. No MESA or solar-scene binding.</p>
          <SolarEvidenceStatus kind="Derived diagnostic" availability="Available"
            provenance="Versioned sweetspot-legacy/1 toy preset and local fleet controls; no observational or MESA input."
            quantity="One-zone core-H proxy and assumed dimensionless hazard accumulation."
            coordinates="Toy evolution years, not an admitted MESA age track."
            processing={DEEPMIX_TOY_ENGINE_VERSION}
            uncertainty="No calibrated physical uncertainty or observational likelihood."
            reproduction="Export an exact-ID JSON run receipt with controls and output-series hashes."
            limitations="Toy threshold only; no physical transition probability, lifetime extension or engineering feasibility claim." />
          <button type="button" className="mb-4 rounded border px-2 py-1 text-xs" onClick={()=>{
            setExportStatus('Preparing receipt…');
            void exportDeepMixToyRun('sweetspot-legacy/1',
              {ships,ratePerShipKgS:rateKgS,horizonYears:horizonYrs,stepYears:0.2})
              .then(id=>setExportStatus(`Downloaded ${id}`))
              .catch(()=>setExportStatus('Export failed; no receipt was downloaded.'));
          }}>Export reproducible toy run JSON</button>
          <span role="status" className="ml-2 text-xs break-all">{exportStatus}</span>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <div className="text-sm mb-1">Fleet size (ships)</div>
              <Slider
                value={[Math.log10(ships)]}
                min={3}
                max={10}
                step={0.01}
                onValueChange={(v) => setShips(Math.round(Math.pow(10, v[0])))}
              />
              <div className="text-xs mt-1 opacity-70">{ships.toLocaleString()}</div>
            </div>

            <div>
              <div className="text-sm mb-1">Rate per ship (kg/s)</div>
              <Slider
                value={[Math.log10(rateKgS)]}
                min={0}
                max={5}
                step={0.01}
                onValueChange={(v) => setRateKgS(Math.pow(10, v[0]))}
              />
              <div className="text-xs mt-1 opacity-70">{rateKgS.toExponential(2)} kg/s</div>
            </div>

            <div>
              <div className="text-sm mb-1">Horizon (years)</div>
              <Slider
                value={[horizonYrs]}
                min={10}
                max={1000}
                step={10}
                onValueChange={(v) => setHorizonYrs(v[0])}
              />
              <div className="text-xs mt-1 opacity-70">{horizonYrs.toFixed(0)} yr</div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 rounded-xl bg-muted/40">
              <div className="text-xs uppercase tracking-wide opacity-70">
                Toy accumulated hazard index (0–1)
              </div>
              <div className="text-2xl font-semibold">{Pfinal.toFixed(3)}</div>
            </div>

            <div className="p-3 rounded-xl bg-muted/40">
              <div className="text-xs uppercase tracking-wide opacity-70">Core H guard</div>
              <div className="text-2xl font-semibold">
                {guardX === null ? "—" : guardX.toFixed(3)} (min {Xmin.toFixed(3)})
              </div>
            </div>

            <div className="p-3 rounded-xl bg-muted/40">
              <div className="text-xs uppercase tracking-wide opacity-70">Toy index change vs no-mix</div>
              <div className="text-2xl font-semibold">
                {suppressionRatio === null
                  ? "—"
                  : `${Math.round((1 - suppressionRatio) * 100)}% lower index`}
                <span className="text-xs ml-1 opacity-70">
                  ({absoluteReduction.toFixed(2)} points on a 0–100 toy scale)
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mt-6 mb-2">
            <h3 className="text-lg font-semibold">Toy index vs fleet size</h3>
            <Badge>
              {sweetMin
                ? `Lowest gated sample ≈ ${sweetMin.ships.toLocaleString()} ships`
                : "No gated sample"}
            </Badge>
          </div>

          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sweetData} margin={{ top: 10, bottom: 10, left: 5, right: 5 }}>
                <XAxis
                  dataKey="ships"
                  type="number"
                  domain={[1e3, 1e10]}
                  scale="log"
                  tickFormatter={(v) => Number(v).toExponential(0)}
                />
                <YAxis
                  dataKey="hazard"
                  domain={[0, 1]}
                  tickFormatter={(v) => Number(v).toFixed(1)}
                />
                <Tooltip
                  formatter={hazardTooltipFormatter}
                  labelFormatter={(x) => `ships=${Number(x).toLocaleString()}`}
                />
                <Line type="monotone" dataKey="hazard" dot={false} strokeWidth={2} />
                {/* Target threshold */}
                <ReferenceLine y={0.2} strokeDasharray="4 2" />
                {/* Current fleet */}
                <ReferenceLine x={ships} strokeDasharray="1 3" />
                {/* Sweet spot marker */}
                {sweetMin ? <ReferenceLine x={sweetMin.ships} strokeDasharray="3 3" /> : null}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <p className="text-sm mt-3 opacity-80">
            This scanner sweeps a hypothetical fleet capacity under an assumed one-zone transport and hazard law.
            Its minimum is conditional on this preset, time step and chosen toy guard; it does not establish an
            engineering fleet requirement, stellar lifetime extension or post-main-sequence transition probability.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
