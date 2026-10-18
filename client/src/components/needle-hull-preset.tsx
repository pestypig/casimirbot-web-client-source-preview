/**
 * Needle Hull Preset Component
 * Applies the NHM2 cavity contract to the legacy simulation form.
 */

import React from "react";
import { Button } from "@/components/ui/button";
import { Rocket } from "lucide-react";
import { UseFormReturn } from "react-hook-form";
import { moralLongToast } from "@/lib/moral-long-toasts";
import { SimulationParameters } from "@shared/schema";
import {
  buildNeedleHullMark2SimulationParameters,
  NHM2_CAVITY_CONTRACT,
  NHM2_SIMULATION_CONTROL_DEFAULTS,
} from "@shared/needle-hull-mark2-cavity-contract";

interface NeedleHullPresetProps {
  form: UseFormReturn<SimulationParameters>;
  onTileAreaChange?: (value: number) => void;
  onHullReferenceRadiusChange?: (value: number) => void;
  onApplyPreset?: () => void;
}
export function NeedleHullPreset({
  form,
  onTileAreaChange,
  onHullReferenceRadiusChange,
  onApplyPreset,
}: NeedleHullPresetProps) {
  const applyNeedleHullPreset = () => {
    form.reset(buildNeedleHullMark2SimulationParameters());

    onTileAreaChange?.(NHM2_SIMULATION_CONTROL_DEFAULTS.tileAreaCm2);
    onHullReferenceRadiusChange?.(
      NHM2_SIMULATION_CONTROL_DEFAULTS.hullReferenceRadiusM,
    );
    onApplyPreset?.();
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        onClick={() => {
          applyNeedleHullPreset();
          moralLongToast("sim:create", {
            gammaGeo: NHM2_CAVITY_CONTRACT.geometry.gammaGeo,
            qFactor: NHM2_CAVITY_CONTRACT.loss.qCavity,
            duty: NHM2_CAVITY_CONTRACT.loss.dutyShip,
            hullReferenceRadiusM:
              NHM2_SIMULATION_CONTROL_DEFAULTS.hullReferenceRadiusM,
            gapNm: NHM2_CAVITY_CONTRACT.geometry.gap_nm,
          });
        }}
        className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
      >
        <Rocket className="mr-2 h-4 w-4" />
        Apply Needle Hull Preset
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        Theoretical warp bubble configuration with GR-valid sector strobing
      </p>
    </div>
  );
}
