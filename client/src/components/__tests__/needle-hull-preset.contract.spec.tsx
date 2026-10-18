// @vitest-environment jsdom
import React from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NeedleHullPreset } from "../needle-hull-preset";
import type { SimulationParameters } from "@shared/schema";
import {
  NHM2_CAVITY_CONTRACT,
  NHM2_SIMULATION_CONTROL_DEFAULTS,
} from "@shared/needle-hull-mark2-cavity-contract";

const { moralLongToastMock } = vi.hoisted(() => ({
  moralLongToastMock: vi.fn(),
}));

vi.mock("@/lib/moral-long-toasts", () => ({
  moralLongToast: moralLongToastMock,
}));

describe("NeedleHullPreset NHM2 contract wiring", () => {
  afterEach(() => {
    cleanup();
    moralLongToastMock.mockReset();
  });

  it("applies NHM2 contract geometry and callback values", () => {
    let latestForm: UseFormReturn<SimulationParameters> | null = null;
    const onTileAreaChange = vi.fn();
    const onHullReferenceRadiusChange = vi.fn();
    const onApplyPreset = vi.fn();

    function Harness() {
      const form = useForm<SimulationParameters>({
        defaultValues: {
          geometry: "parallel_plate",
          gap: 1,
          radius: 1000,
          material: "PEC",
          materialModel: "ideal_retarded",
          temperature: 20,
          moduleType: "static",
        },
      });
      latestForm = form;
      return (
        <NeedleHullPreset
          form={form}
          onTileAreaChange={onTileAreaChange}
          onHullReferenceRadiusChange={onHullReferenceRadiusChange}
          onApplyPreset={onApplyPreset}
        />
      );
    }

    render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: /apply needle hull preset/i }),
    );

    expect(onApplyPreset).toHaveBeenCalledTimes(1);
    expect(onTileAreaChange).toHaveBeenCalledWith(
      NHM2_CAVITY_CONTRACT.layout.tileArea_mm2 / 100,
    );
    expect(onHullReferenceRadiusChange).toHaveBeenCalledWith(
      NHM2_SIMULATION_CONTROL_DEFAULTS.hullReferenceRadiusM,
    );

    const values = latestForm?.getValues();
    expect(values?.geometry).toBe("bowl");
    expect(values?.radius).toBe(
      NHM2_CAVITY_CONTRACT.geometry.pocketDiameter_um / 2,
    );
    expect(values?.gap).toBe(NHM2_CAVITY_CONTRACT.geometry.gap_nm);
    expect(values?.sagDepth).toBe(NHM2_CAVITY_CONTRACT.geometry.sag_nm);
    expect(values?.temperature).toBe(NHM2_CAVITY_CONTRACT.thermal.temperature_K);
    expect(values?.moduleType).toBe("warp");
    expect(values?.dynamicConfig).toMatchObject({
      modulationFreqGHz: NHM2_CAVITY_CONTRACT.drive.modulationFreq_GHz,
      dutyCycle: NHM2_CAVITY_CONTRACT.loss.dutyCycle,
      cavityQ: NHM2_CAVITY_CONTRACT.loss.qCavity,
      sectorCount: NHM2_CAVITY_CONTRACT.geometry.sectorCount,
      sectorDuty: NHM2_CAVITY_CONTRACT.loss.dutyShip,
      pulseFrequencyGHz: NHM2_CAVITY_CONTRACT.drive.modulationFreq_GHz,
      warpFieldType: NHM2_CAVITY_CONTRACT.geometry.warpFieldType,
      gap_nm: NHM2_CAVITY_CONTRACT.geometry.gap_nm,
    });

    expect(moralLongToastMock).toHaveBeenCalledWith("sim:create", {
      gammaGeo: NHM2_CAVITY_CONTRACT.geometry.gammaGeo,
      qFactor: NHM2_CAVITY_CONTRACT.loss.qCavity,
      duty: NHM2_CAVITY_CONTRACT.loss.dutyShip,
      hullReferenceRadiusM: NHM2_SIMULATION_CONTROL_DEFAULTS.hullReferenceRadiusM,
      gapNm: NHM2_CAVITY_CONTRACT.geometry.gap_nm,
    });
  });
});
