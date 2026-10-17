import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

type Pt = { x: number; y: number };

interface MeshVisualizationProps {
  className?: string;
}

export function MeshVisualization({ className }: MeshVisualizationProps) {
  // ---- Constants (keep visuals identical to your original) ----
  const APERTURE_RADIUS_MM = 25;        // ±25 mm span
  const X_STEP_MM = 0.5;                // cross-section sampling step
  const NM_TO_MM = 1e-6;
  const PX_PER_MM = 8;                  // 50 mm * 8 px/mm = 400 px width
  const Y_ZERO_PX = 150;                // baseline row
  const Y_SCALE_PX_PER_MM = 1000;       // vertical exaggeration for nm-scale sag

  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

  const [sagDepth1, setSagDepth1] = useState<number>(0);
  const [sagDepth2, setSagDepth2] = useState<number>(50);

  // Spherical-cap helper: radius of curvature from aperture radius & sag (both in mm)
  const radiusOfCurvature = (apertureRadiusMm: number, sagMm: number) => {
    if (!Number.isFinite(sagMm) || sagMm <= 0) return Infinity; // flat
    // R = (a^2 + s^2) / (2s)
    return (apertureRadiusMm * apertureRadiusMm + sagMm * sagMm) / (2 * sagMm);
  };

  // Generate cross-section points for bowl geometry (concave down in SVG)
  const generateCrossSection = (sagDepthNm: number): Pt[] => {
    const sagMm = sagDepthNm * NM_TO_MM;
    const pts: Pt[] = [];

    if (sagDepthNm <= 0) {
      // Flat surface along x in [-R, R], y=0
      for (let x = -APERTURE_RADIUS_MM; x <= APERTURE_RADIUS_MM; x += X_STEP_MM) {
        pts.push({ x, y: 0 });
      }
      return pts;
    }

    const R = radiusOfCurvature(APERTURE_RADIUS_MM, sagMm);
    if (!Number.isFinite(R) || R <= 0) return pts;

    // Sphere center is at y = R - sag; we want lower branch (concave bowl)
    const centerY = R - sagMm;

    for (let x = -APERTURE_RADIUS_MM; x <= APERTURE_RADIUS_MM; x += X_STEP_MM) {
      const disc = Math.max(0, R * R - x * x); // numeric guard
      const yOnSphere = centerY - Math.sqrt(disc); // lower branch
      // For SVG downwards sag, flip sign so positive y ⇒ downward
      pts.push({ x, y: -yOnSphere });
    }
    return pts;
  };

  // Cross-sections recomputed when sag depths change
  const crossSectionData = useMemo(() => {
    const d1 = clamp(Number.isFinite(sagDepth1) ? sagDepth1 : 0, 0, 1000);
    const d2 = clamp(Number.isFinite(sagDepth2) ? sagDepth2 : 0, 0, 1000);
    return {
      depth1: { points: generateCrossSection(d1), sagDepth: d1 },
      depth2: { points: generateCrossSection(d2), sagDepth: d2 },
    };
  }, [sagDepth1, sagDepth2]);

  // Create SVG path from mm points
  const createPath = (points: Pt[]) => {
    if (!points.length) return "";
    return points
      .map((p, i) => {
        const sx = (p.x + APERTURE_RADIUS_MM) * PX_PER_MM; // map -25..25mm → 0..400px
        const sy = Y_ZERO_PX + p.y * Y_SCALE_PX_PER_MM;    // 0mm → 150px baseline; +y goes down
        return `${i === 0 ? "M" : "L"} ${sx} ${sy}`;
      })
      .join(" ");
  };

  // Nice-to-have: quick reset and swap
  const resetDefaults = () => {
    setSagDepth1(0);
    setSagDepth2(50);
  };
  const swapDepths = () => {
    setSagDepth1((d1) => {
      const d2 = sagDepth2;
      setSagDepth2(d1);
      return d2;
    });
  };

  // Derived curvature readouts for the yellow panel
  const roc1 =
    crossSectionData.depth1.sagDepth > 0
      ? radiusOfCurvature(APERTURE_RADIUS_MM, crossSectionData.depth1.sagDepth * NM_TO_MM)
      : undefined;
  const roc2 =
    crossSectionData.depth2.sagDepth > 0
      ? radiusOfCurvature(APERTURE_RADIUS_MM, crossSectionData.depth2.sagDepth * NM_TO_MM)
      : undefined;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Bowl Geometry Cross-Section Visualization</CardTitle>
        <CardDescription>Compare bowl curvature at different sag depths (25 mm radius)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Controls */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sagDepth1">Sag Depth 1 (nm)</Label>
              <Input
                id="sagDepth1"
                type="number"
                inputMode="numeric"
                min={0}
                max={1000}
                step={1}
                value={Number.isFinite(sagDepth1) ? sagDepth1 : 0}
                onChange={(e) => setSagDepth1(clamp(parseFloat(e.target.value) || 0, 0, 1000))}
                aria-label="Sag depth one in nanometers"
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sagDepth2">Sag Depth 2 (nm)</Label>
              <Input
                id="sagDepth2"
                type="number"
                inputMode="numeric"
                min={0}
                max={1000}
                step={1}
                value={Number.isFinite(sagDepth2) ? sagDepth2 : 0}
                onChange={(e) => setSagDepth2(clamp(parseFloat(e.target.value) || 0, 0, 1000))}
                aria-label="Sag depth two in nanometers"
                className="w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={swapDepths}>Swap Depths</Button>
            <Button onClick={resetDefaults}>Reset</Button>
          </div>

          <Separator />

          {/* Visualization */}
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2">Cross-Section Comparison</h3>
              <p className="text-sm text-muted-foreground">
                <span className="text-blue-600">Blue</span>: {crossSectionData.depth1.sagDepth} nm&nbsp; |&nbsp;
                <span className="text-red-600">Red</span>: {crossSectionData.depth2.sagDepth} nm
              </p>
            </div>

            <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
              <svg
                width="400"
                height="200"
                viewBox="0 0 400 200"
                className="mx-auto"
                role="img"
                aria-label="Bowl cross-section comparison"
              >
                {/* Grid */}
                <defs>
                  <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e0e0e0" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="400" height="200" fill="url(#grid)" />

                {/* Center line */}
                <line x1="200" y1="0" x2="200" y2="200" stroke="#ccc" strokeWidth="1" strokeDasharray="5,5" />

                {/* Horizontal reference (y=0) */}
                <line x1="0" y1={Y_ZERO_PX} x2="400" y2={Y_ZERO_PX} stroke="#ccc" strokeWidth="1" strokeDasharray="5,5" />

                {/* Curves */}
                <path d={createPath(crossSectionData.depth1.points)} stroke="#2563eb" strokeWidth="2" fill="none" />
                <path d={createPath(crossSectionData.depth2.points)} stroke="#dc2626" strokeWidth="2" fill="none" />

                {/* Labels */}
                <text x="200" y="15" textAnchor="middle" className="text-xs fill-gray-600">
                  Cross-Section View
                </text>
                <text x="20" y="195" className="text-xs fill-gray-600">-25 mm</text>
                <text x="360" y="195" className="text-xs fill-gray-600">+25 mm</text>
                <text x="10" y={Y_ZERO_PX + 5} className="text-xs fill-gray-600">0</text>
              </svg>
            </div>

            {/* Data display */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded">
                <h4 className="font-semibold text-blue-800 dark:text-blue-200">
                  Sag Depth: {crossSectionData.depth1.sagDepth} nm
                </h4>
                <p className="text-blue-600 dark:text-blue-300">
                  {crossSectionData.depth1.sagDepth === 0
                    ? "Flat surface"
                    : `Curved with ${crossSectionData.depth1.points.length} points`}
                </p>
              </div>
              <div className="p-3 bg-red-50 dark:bg-red-950 rounded">
                <h4 className="font-semibold text-red-800 dark:text-red-200">
                  Sag Depth: {crossSectionData.depth2.sagDepth} nm
                </h4>
                <p className="text-red-600 dark:text-red-300">
                  {crossSectionData.depth2.sagDepth === 0
                    ? "Flat surface"
                    : `Curved with ${crossSectionData.depth2.points.length} points`}
                </p>
              </div>
            </div>

            {/* Curvature analysis */}
            <div className="p-3 bg-yellow-50 dark:bg-yellow-950 rounded">
              <h4 className="font-semibold text-yellow-800 dark:text-yellow-200 mb-2">Curvature Analysis</h4>
              <div className="text-sm text-yellow-700 dark:text-yellow-300 space-y-1">
                {roc1 && (
                  <p>
                    • Depth 1 radius of curvature: {roc1.toFixed(2)} mm
                  </p>
                )}
                {roc2 && (
                  <p>
                    • Depth 2 radius of curvature: {roc2.toFixed(2)} mm
                  </p>
                )}
                <p>
                  • Maximum depth difference:{" "}
                  {Math.abs(crossSectionData.depth2.sagDepth - crossSectionData.depth1.sagDepth)} nm
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
