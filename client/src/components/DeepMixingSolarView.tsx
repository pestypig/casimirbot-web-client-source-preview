// client/src/components/DeepMixingSolarView.tsx
import React, { useMemo } from "react";
import SolarMap from "./SolarMap";
import {SolarEvidenceStatus} from './SolarEvidenceStatus';

type Props = {
  ringSegments?: number;
  phasingMarkers?: number;
  routeIds?: string[];
};

type PolylinePoint = { x_au: number; y_au: number; alpha?: number };

function ringAU(radiusAU: number, segments: number, alpha = 0.65): PolylinePoint[] {
  const pts: PolylinePoint[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * (Math.PI * 2);
    pts.push({
      x_au: radiusAU * Math.cos(t),
      y_au: radiusAU * Math.sin(t),
      alpha,
    });
  }
  return pts;
}

function phasingTicks(radiusAU: number, count: number): PolylinePoint[] {
  if (count <= 0) return [];
  const pts: PolylinePoint[] = [];
  const tickAngle = (2 * Math.PI) / count;
  const tickLength = radiusAU * 0.045;
  for (let i = 0; i < count; i++) {
    const theta = i * tickAngle;
    const xBase = radiusAU * Math.cos(theta);
    const yBase = radiusAU * Math.sin(theta);
    const xOuter = (radiusAU + tickLength) * Math.cos(theta);
    const yOuter = (radiusAU + tickLength) * Math.sin(theta);
    pts.push({ x_au: xBase, y_au: yBase, alpha: 0 }); // anchor, invisible
    pts.push({ x_au: xBase, y_au: yBase, alpha: 0.45 });
    pts.push({ x_au: xOuter, y_au: yOuter, alpha: 0.45 });
    pts.push({ x_au: xOuter, y_au: yOuter, alpha: 0 });
  }
  return pts;
}

export function DeepMixingSolarView({
  ringSegments = 720,
  phasingMarkers = 12,
  routeIds = ["SUN"],
}: Props) {
  const R_SUN_AU = 6.957e8 / 1.496e11;
  const R_TACH_AU = 0.70 * R_SUN_AU;

  const poly = useMemo(() => {
    const base = ringAU(R_TACH_AU, ringSegments);
    const ticks = phasingTicks(R_TACH_AU, phasingMarkers);
    const filteredTicks = ticks.filter((pt) => Number.isFinite(pt.x_au) && Number.isFinite(pt.y_au));
    return [...base, ...filteredTicks];
  }, [R_TACH_AU, ringSegments, phasingMarkers]);

  return (
    <div className="space-y-2">
    <SolarEvidenceStatus kind="Illustration" availability="Available"
      provenance="Local route controls and fixed 0.70 solar-radius tachocline convention; no observed frame or MESA run."
      quantity="Drawn route and tachocline ring, not a conservative hydrogen/helium transport field."
      coordinates="Solar-System AU display with magnified schematic ring; not a registered Carrington scene."
      processing="Local polyline and markers."
      uncertainty="No calibrated transport or positional uncertainty."
      reproduction="Regenerate from the component inputs; no retained model artifact."
      limitations="Mission schematic only. It neither measures a solar flow nor demonstrates feasible core refuelling." />
    <SolarMap
      fitToIds={["SUN", "MERCURY", "VENUS", "EARTH", "MARS"]}
      backgroundPolylineAU={poly}
      backgroundPolylineStyle={{ stroke: "#f8c15c", width: 1.5, dash: [6, 4] }}
      backgroundPolylineGain={180}
      routeIds={routeIds}
      height={320}
    />
    </div>
  );
}

export default DeepMixingSolarView;
