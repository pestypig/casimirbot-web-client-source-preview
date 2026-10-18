import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, Play, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import ParameterPanel from "@/components/parameter-panel";
import SimulationStatus from "@/components/simulation-status";
import ResultsPanel from "@/components/results-panel";
import { MeshVisualization } from "@/components/mesh-visualization";
import {
  createSimulation,
  startSimulation,
  generateScuffgeo,
  downloadFile,
  downloadAllFiles,
  createWebSocketConnection,
} from "@/lib/simulation-api";
import { SimulationParameters, SimulationResult } from "@shared/schema";
import {
  NHM2_SIMULATION_CONTROL_DEFAULTS,
  NHM2_SIMULATION_PARAMETERS,
} from "@shared/needle-hull-mark2-cavity-contract";

export default function Simulation() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentSimulation, setCurrentSimulation] =
    useState<SimulationResult | null>(null);
  const [currentStep, setCurrentStep] = useState<string>("");

  const [tileArea, setTileArea] = useState(
    NHM2_SIMULATION_CONTROL_DEFAULTS.tileAreaCm2,
  );
  const [hullReferenceRadius, setHullReferenceRadius] = useState(
    NHM2_SIMULATION_CONTROL_DEFAULTS.hullReferenceRadiusM,
  );
  const [gammaGeo, setGammaGeo] = useState(
    NHM2_SIMULATION_CONTROL_DEFAULTS.gammaGeo,
  );
  const [qFactor, setQFactor] = useState(
    NHM2_SIMULATION_CONTROL_DEFAULTS.qFactor,
  );
  const [duty, setDuty] = useState(NHM2_SIMULATION_CONTROL_DEFAULTS.duty);
  const [sagDepth, setSagDepth] = useState(
    NHM2_SIMULATION_CONTROL_DEFAULTS.sagDepthNm,
  );
  const [temperature, setTemperature] = useState(
    NHM2_SIMULATION_CONTROL_DEFAULTS.temperatureK,
  );
  const [strokeAmplitude, setStrokeAmplitude] = useState(
    NHM2_SIMULATION_CONTROL_DEFAULTS.strokeAmplitudePm,
  );
  const [burstTime, setBurstTime] = useState(
    NHM2_SIMULATION_CONTROL_DEFAULTS.burstTimeUs,
  );
  const [cycleTime, setCycleTime] = useState(
    NHM2_SIMULATION_CONTROL_DEFAULTS.cycleTimeUs,
  );
  const [xiPoints, setXiPoints] = useState(
    NHM2_SIMULATION_CONTROL_DEFAULTS.xiPoints,
  );

  const applyNeedleHullPreset = () => {
    setTileArea(NHM2_SIMULATION_CONTROL_DEFAULTS.tileAreaCm2);
    setHullReferenceRadius(NHM2_SIMULATION_CONTROL_DEFAULTS.hullReferenceRadiusM);
    setGammaGeo(NHM2_SIMULATION_CONTROL_DEFAULTS.gammaGeo);
    setQFactor(NHM2_SIMULATION_CONTROL_DEFAULTS.qFactor);
    setDuty(NHM2_SIMULATION_CONTROL_DEFAULTS.duty);
    setSagDepth(NHM2_SIMULATION_CONTROL_DEFAULTS.sagDepthNm);
    setTemperature(NHM2_SIMULATION_CONTROL_DEFAULTS.temperatureK);
    setStrokeAmplitude(NHM2_SIMULATION_CONTROL_DEFAULTS.strokeAmplitudePm);
    setBurstTime(NHM2_SIMULATION_CONTROL_DEFAULTS.burstTimeUs);
    setCycleTime(NHM2_SIMULATION_CONTROL_DEFAULTS.cycleTimeUs);
    setXiPoints(NHM2_SIMULATION_CONTROL_DEFAULTS.xiPoints);
  };

  const fetchSimulation = async (id: string): Promise<SimulationResult> => {
    const res = await fetch(`/api/simulations/${id}`);
    if (!res.ok) throw new Error("Failed to fetch simulation");
    return res.json();
  };

  const { data: simulation } = useQuery<SimulationResult>({
    queryKey: ["/api/simulations", currentSimulation?.id],
    enabled: !!currentSimulation?.id,
    refetchInterval:
      currentSimulation?.status &&
      !["completed", "failed"].includes(currentSimulation.status)
        ? 2000
        : false,
    queryFn: () => fetchSimulation(currentSimulation!.id),
  });

  const createSimulationMutation = useMutation({
    mutationFn: createSimulation,
    onSuccess: (newSimulation: SimulationResult) => {
      setCurrentSimulation(newSimulation);
      queryClient.invalidateQueries({ queryKey: ["/api/simulations"] });
      toast({
        title: "Simulation Created",
        description: `Simulation ${newSimulation.id} created successfully`,
      });
    },
    onError: (error) => {
      console.error("Create simulation error:", error);
      toast({
        title: "Error",
        description: "Failed to create simulation",
        variant: "destructive",
      });
    },
  });

  const startSimulationMutation = useMutation({
    mutationFn: startSimulation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/simulations"] });
      toast({
        title: "Simulation Started",
        description: "Simulation is now running",
      });
    },
    onError: (error) => {
      console.error("Start simulation error:", error);
      toast({
        title: "Error",
        description: "Failed to start simulation",
        variant: "destructive",
      });
    },
  });

  const generateScuffgeoMutation = useMutation({
    mutationFn: generateScuffgeo,
    onSuccess: () => {
      toast({
        title: "Geometry Generated",
        description: "SCUFF-EM geometry file created successfully",
      });
    },
    onError: (error: any) => {
      console.error("Generate scuffgeo error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to generate geometry file",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!currentSimulation?.id) return;

    const websocket = createWebSocketConnection(currentSimulation.id);
    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "progress") {
        setCurrentStep(data.message);
        setCurrentSimulation((prev) =>
          prev
            ? {
                ...prev,
                status: "calculating",
                logs: [...(prev.logs ?? []), data.message],
              }
            : prev,
        );
      } else if (data.type === "completed") {
        setCurrentSimulation((prev) =>
          prev ? { ...prev, status: "completed", results: data.results } : prev,
        );
        queryClient.invalidateQueries({
          queryKey: ["/api/simulations", currentSimulation.id],
        });
      } else if (data.type === "error") {
        setCurrentSimulation((prev) =>
          prev ? { ...prev, status: "failed", error: data.error } : prev,
        );
        toast({
          title: "Simulation Error",
          description: data.error,
          variant: "destructive",
        });
      }
    };

    return () => {
      websocket.close();
    };
  }, [currentSimulation?.id, queryClient, toast]);

  const handleRunSimulation = (
    parameters: SimulationParameters = NHM2_SIMULATION_PARAMETERS,
  ) => {
    createSimulationMutation.mutate(parameters);
  };

  const handleStartSimulation = () => {
    if (currentSimulation?.id) {
      startSimulationMutation.mutate(currentSimulation.id);
    }
  };

  const handleGenerateGeometry = () => {
    if (currentSimulation?.id) {
      generateScuffgeoMutation.mutate(currentSimulation.id);
    }
  };

  const handleGenerateOnly = async (
    parameters: SimulationParameters = NHM2_SIMULATION_PARAMETERS,
  ) => {
    try {
      const createdSimulation =
        await createSimulationMutation.mutateAsync(parameters);
      await generateScuffgeoMutation.mutateAsync(createdSimulation.id);
    } catch {
      // Mutation-level error handling already reports the failure.
    }
  };

  const handleDownload = (filename: string) => {
    if (currentSimulation?.id) {
      downloadFile(currentSimulation.id, filename);
    }
  };

  const handleDownloadAll = () => {
    if (currentSimulation?.id) {
      downloadAllFiles(currentSimulation.id);
    }
  };

  const displayedSimulation = simulation ?? currentSimulation;
  const simulationStatus = displayedSimulation?.status ?? "idle";

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4">
        <div className="mb-6 flex items-center gap-2">
          <Settings className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Simulation Configuration</h1>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <ParameterPanel
              onSubmit={handleRunSimulation}
              onGenerateOnly={handleGenerateOnly}
              isLoading={
                createSimulationMutation.isPending ||
                generateScuffgeoMutation.isPending
              }
              onTileAreaChange={setTileArea}
              onHullReferenceRadiusChange={setHullReferenceRadius}
              onApplyPreset={applyNeedleHullPreset}
              parameterValues={{
                gammaGeo,
                qFactor,
                duty,
                sagDepth,
                temperature,
                strokeAmplitude,
                burstTime,
                cycleTime,
                xiPoints,
              }}
              onParameterChange={{
                setGammaGeo,
                setQFactor,
                setDuty,
                setSagDepth,
                setTemperature,
                setStrokeAmplitude,
                setBurstTime,
                setCycleTime,
                setXiPoints,
              }}
            />

            <div className="flex gap-2">
              <Button
                onClick={handleStartSimulation}
                disabled={!currentSimulation || startSimulationMutation.isPending}
                className="flex items-center gap-2"
              >
                <Play className="h-4 w-4" />
                Start Simulation
              </Button>
              <Button
                onClick={handleGenerateGeometry}
                disabled={
                  !currentSimulation || generateScuffgeoMutation.isPending
                }
                variant="outline"
                className="flex items-center gap-2"
              >
                <Settings className="h-4 w-4" />
                Generate Geometry
              </Button>
              <Button
                onClick={handleDownloadAll}
                disabled={!currentSimulation}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Download All
              </Button>
            </div>
          </div>

          <div className="space-y-6">
            <SimulationStatus
              status={simulationStatus}
              currentStep={currentStep}
            />

            <MeshVisualization />

            {displayedSimulation && (
              <ResultsPanel
                simulation={displayedSimulation}
                onDownloadFile={handleDownload}
                onDownloadAll={handleDownloadAll}
                hullReferenceRadius={hullReferenceRadius}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
