import { Clock, FileCode, Box, Calculator, ChartLine } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface SimulationStatusProps {
  status: "idle" | "pending" | "generating" | "meshing" | "calculating" | "processing" | "completed" | "failed";
  currentStep?: string;
}

export default function SimulationStatus({ status, currentStep }: SimulationStatusProps) {
  const steps = [
    { id: "generating", icon: FileCode, title: ".scuffgeo Generation", description: "Create geometry description file" },
    { id: "meshing", icon: Box, title: "Mesh Generation", description: "Create computational mesh files" },
    { id: "calculating", icon: Calculator, title: "SCUFF-EM Calculation", description: "Running cas3D simulation" },
    { id: "processing", icon: ChartLine, title: "Results Processing", description: "Analyzing output files" }
  ];

  const getStatusInfo = () => {
    switch (status) {
      case "idle":
        return { label: "Ready", color: "bg-slate-400" };
      case "pending":
        return { label: "Pending", color: "bg-yellow-400" };
      case "generating":
      case "meshing":
      case "calculating":
      case "processing":
        return { label: "Running", color: "bg-blue-400 animate-pulse" };
      case "completed":
        return { label: "Completed", color: "bg-green-400" };
      case "failed":
        return { label: "Failed", color: "bg-red-400" };
      default:
        return { label: "Unknown", color: "bg-slate-400" };
    }
  };

  const statusInfo = getStatusInfo();

  const isStepActive = (stepId: string) => status === stepId;
  const isStepCompleted = (stepId: string) => {
    const stepOrder = ["generating", "meshing", "calculating", "processing"];
    const currentIndex = stepOrder.indexOf(status);
    const stepIndex = stepOrder.indexOf(stepId);
    return currentIndex > stepIndex || status === "completed";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Simulation Status</span>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${statusInfo.color}`}></div>
            <Badge variant="secondary">{statusInfo.label}</Badge>
          </div>
        </CardTitle>
        {currentStep && (
          <p className="text-sm text-muted-foreground">{currentStep}</p>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = isStepActive(step.id);
            const isCompleted = isStepCompleted(step.id);
            const opacity = isActive || isCompleted ? "opacity-100" : "opacity-50";

            return (
              <div key={step.id} className={`flex items-center space-x-3 ${opacity}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  isCompleted 
                    ? "bg-green-100 text-green-600" 
                    : isActive 
                      ? "bg-blue-100 text-blue-600" 
                      : "bg-slate-100 text-slate-500"
                }`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <div className={`text-sm font-medium ${
                    isCompleted 
                      ? "text-green-600" 
                      : isActive 
                        ? "text-blue-600" 
                        : "text-slate-600"
                  }`}>
                    {step.title}
                  </div>
                  <div className="text-xs text-muted-foreground">{step.description}</div>
                </div>
                {isActive && (
                  <div className="ml-auto">
                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
