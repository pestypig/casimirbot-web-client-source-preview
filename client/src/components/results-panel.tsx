import React, { useState } from "react";
import { Download, ChartBar, Folder, Terminal, FileCode, Box, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SimulationResult } from "@shared/schema";
import { useEnergyPipeline } from "@/hooks/use-energy-pipeline";
import {
  resolvePipelineBubbleRadiusM,
  resolvePipelineHullReferenceRadiusM,
} from "@/lib/pipeline-geometry";

interface ResultsPanelProps {
  simulation: SimulationResult | null;
  onDownloadFile: (fileId: string) => void;
  onDownloadAll: () => void;
  hullReferenceRadius: number;
}

export default function ResultsPanel({
  simulation,
  onDownloadFile,
  onDownloadAll,
  hullReferenceRadius,
}: ResultsPanelProps) {
  const [activeTab, setActiveTab] = useState("results");

  // Current pipeline geometry is shown separately from the simulation result.
  const { data: pipeline } = useEnergyPipeline();

  if (!simulation) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64 text-center">
          <div className="text-muted-foreground">
            <ChartBar className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No simulation data available</p>
            <p className="text-sm">Run a simulation to see results here</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { results, generatedFiles, logs } = simulation;

  const formatScientificNotation = (value: number) => {
    if (!Number.isFinite(value)) return "â€”";
    if (Math.abs(value) === 0) return "0";
    const exp = Math.floor(Math.log10(Math.abs(value)));
    const mantissa = (value / Math.pow(10, exp)).toFixed(3);
    return `${mantissa} Ã— 10^${exp}`;
  };

  const safeToFixed = (v: unknown, digits = 1) => {
    if (typeof v === "number" && Number.isFinite(v)) return v.toFixed(digits);
    return "â€”";
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case "scuffgeo":
        return <FileCode className="h-4 w-4 text-blue-600" />;
      case "mesh":
        return <Box className="h-4 w-4 text-green-600" />;
      case "output":
        return <FileText className="h-4 w-4 text-orange-600" />;
      case "log":
        return <Terminal className="h-4 w-4 text-purple-600" />;
      default:
        return <FileText className="h-4 w-4 text-gray-600" />;
    }
  };

  const isFiniteNumber = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value);

  const gammaGeoDisplay = isFiniteNumber(results?.geometricBlueshiftFactor)
    ? results.geometricBlueshiftFactor
    : undefined;

  const hullReferenceRadiusDisplay =
    resolvePipelineHullReferenceRadiusM(pipeline) ??
    (isFiniteNumber(hullReferenceRadius) ? hullReferenceRadius : undefined);
  const bubbleRadiusDisplay = resolvePipelineBubbleRadiusM(pipeline);

  return (
    <Card>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="border-b border-border">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="results" className="flex items-center gap-2">
              <ChartBar className="h-4 w-4" />
              Results
            </TabsTrigger>
            <TabsTrigger value="files" className="flex items-center gap-2">
              <Folder className="h-4 w-4" />
              Generated Files
            </TabsTrigger>
            <TabsTrigger value="logs" className="flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              Simulation Logs
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="results" className="p-6">
          {simulation.parameters.moduleType === 'dynamic' && results && (
            <div className="mb-8">
              <h3 className="text-base font-semibold mb-3">Dynamic Simulation Values</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Values reported by this simulation. See Theory Badge Graph for the duty and QEI relationships and their evidence limits.
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                <div className="bg-muted rounded-lg p-3">Stroke period: {safeToFixed(results.strokePeriodPs, 2)} ps</div>
                <div className="bg-muted rounded-lg p-3">Duty factor: {safeToFixed(results.dutyFactor, 4)}</div>
                <div className="bg-muted rounded-lg p-3">Average power: {isFiniteNumber(results.averagePower) ? formatScientificNotation(results.averagePower) : "—"} W</div>
                <div className="bg-muted rounded-lg p-3">QI margin proxy: {safeToFixed(results.quantumInequalityMargin, 3)}</div>
              </div>
            </div>
          )}

          {/* Warp Module Results */}
          {simulation.parameters.moduleType === 'warp' && results && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Warp Bubble Results */}
              <div>
                <h3 className="text-base font-semibold mb-4">Warp Bubble Analysis</h3>
                <div className="space-y-4">
                  <div className="bg-muted rounded-lg p-4">
                    <div className="text-2xl font-mono font-semibold">
                      {safeToFixed(gammaGeoDisplay, 1)}
                    </div>
                    <div className="text-sm text-muted-foreground">Î³_geo (Geometric Amplification)</div>
                  </div>

                  <div className="bg-muted rounded-lg p-4">
                    <div className="text-2xl font-mono font-semibold">
                      {Number.isFinite(results.totalExoticMass)
                        ? formatScientificNotation(results.totalExoticMass as number)
                        : "â€”"}
                    </div>
                    <div className="text-sm text-muted-foreground">kg (Total Exotic Mass)</div>
                  </div>

                  <div className="bg-muted rounded-lg p-4">
                    <div className="text-2xl font-mono font-semibold">
                      {Number.isFinite(results.powerDraw)
                        ? formatScientificNotation(results.powerDraw as number)
                        : "â€”"}
                    </div>
                    <div className="text-sm text-muted-foreground">W (Power Draw)</div>
                  </div>

                  <div className="bg-muted rounded-lg p-4">
                    <div className="text-2xl font-mono font-semibold">
                      {safeToFixed(hullReferenceRadiusDisplay, 1)}
                    </div>
                    <div className="text-sm text-muted-foreground">m (Current Hull Reference Radius)</div>
                  </div>

                  <div className="bg-muted rounded-lg p-4">
                    <div className="text-2xl font-mono font-semibold">
                      {safeToFixed(bubbleRadiusDisplay, 1)}
                    </div>
                    <div className="text-sm text-muted-foreground">m (Current Pipeline Bubble Radius)</div>
                  </div>
                </div>
              </div>

              {/* Simulation geometry flag; no viability verdict is inferred here. */}
              <div>
                <h3 className="text-base font-semibold mb-4">Simulation Geometry</h3>
                <div className="bg-muted rounded-lg p-4">
                  <Badge variant="outline">
                    {results.isZeroExpansion ? "Zero expansion reported" : "Non-zero expansion reported"}
                  </Badge>
                  <div className="text-sm text-muted-foreground mt-1">
                    Simulation output only. See NHM2 Solve State and Theory Badge Graph for evidence and claim locks.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Standard Casimir Results (for static/dynamic modules) */}
          {simulation.parameters.moduleType !== 'warp' && (
            <div>
              {/* Energy Results */}
              <div>
                <h3 className="text-base font-semibold mb-4">Casimir Energy</h3>
                <div className="space-y-4">
                  <div className="bg-muted rounded-lg p-4">
                    <div className="text-2xl font-mono font-semibold">
                      {Number.isFinite(results?.totalEnergy) ? formatScientificNotation(results!.totalEnergy as number) : "â€”"}
                    </div>
                    <div className="text-sm text-muted-foreground">Joules (Total Energy)</div>
                  </div>

                  <div className="bg-muted rounded-lg p-4">
                    <div className="text-2xl font-mono font-semibold">
                      {Number.isFinite(results?.energyPerArea) ? formatScientificNotation(results!.energyPerArea as number) : "â€”"}
                    </div>
                    <div className="text-sm text-muted-foreground">J/mÂ² (Energy per unit area)</div>
                  </div>

                  <div className="bg-muted rounded-lg p-4">
                    <div className="text-2xl font-mono font-semibold">
                      {Number.isFinite(results?.force) ? formatScientificNotation(results!.force as number) : "â€”"}
                    </div>
                    <div className="text-sm text-muted-foreground">N (Casimir Force)</div>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* Analysis Summary */}
          {results && (
            <div className="mt-8">
              <h3 className="text-base font-semibold mb-4">Analysis Summary</h3>
              <div className="bg-muted rounded-lg p-4">
                {simulation.parameters.moduleType === 'warp' ? (
                  /* Warp Module Analysis Summary */
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Amplification Factor</div>
                      <div className="font-medium">{safeToFixed(gammaGeoDisplay, 1)}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Computation Time</div>
                      <div className="font-medium">{results.computeTime || "—"}</div>
                    </div>
                  </div>
                ) : (
                  /* Standard Casimir Analysis Summary */
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Convergence</div>
                      <div className="font-medium">
                        <Badge variant={results.convergence === "Achieved" ? "default" : "destructive"}>
                          {results.convergence || "Unknown"}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Xi Points</div>
                      <div className="font-medium">{results.xiPoints?.toLocaleString() || "â€”"}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Computation Time</div>
                      <div className="font-medium">{results.computeTime || "â€”"}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Error Estimate</div>
                      <div className="font-medium">{results.errorEstimate || "â€”"}</div>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

        </TabsContent>

        <TabsContent value="files" className="p-6">
          <h3 className="text-base font-semibold mb-4">Generated Files</h3>

          {generatedFiles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Folder className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No files generated yet</p>
              <p className="text-sm">Files will appear here after simulation completion</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {generatedFiles.map((file) => (
                  <div key={file.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex items-center space-x-3">
                      {getFileIcon(file.type)}
                      <div>
                        <div className="font-medium">{file.name}</div>
                        <div className="text-sm text-muted-foreground">{file.description}</div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-muted-foreground">{file.size}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDownloadFile(file.id)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-6 border-t border-border">
                <Button onClick={onDownloadAll} variant="outline">
                  <Download className="w-4 h-4 mr-2" />
                  Download All Files (.zip)
                </Button>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="logs" className="p-6">
          <h3 className="text-base font-semibold mb-4">Simulation Logs</h3>
          <div className="bg-slate-900 text-green-400 p-4 rounded-lg font-mono text-sm h-96 overflow-y-auto">
            {logs.length === 0 ? (
              <div className="text-center text-slate-500 py-8">
                <Terminal className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No logs available</p>
                <p className="text-xs">Logs will appear here during simulation</p>
              </div>
            ) : (
              <div>
                {logs.map((log, index) => (
                  <div key={index} className="mb-1">
                    {log}
                  </div>
                ))}
                {simulation.status !== "completed" && simulation.status !== "failed" && (
                  <div className="animate-pulse">â–ˆ</div>
                )}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}


