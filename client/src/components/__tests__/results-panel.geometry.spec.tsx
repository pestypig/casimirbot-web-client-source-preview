// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ResultsPanel from "../results-panel";

vi.mock("@/hooks/use-energy-pipeline", () => ({
  useEnergyPipeline: () => ({
    data: {
      hull: { Lx_m: 1007, Ly_m: 264, Lz_m: 173 },
      bubble: { R: 2 },
    },
  }),
}));

vi.mock("../energy-pipeline", () => ({ EnergyPipeline: () => null }));

describe("ResultsPanel geometry readouts", () => {
  it("shows hull and bubble radii in the main warp analysis cards", () => {
    render(
      <ResultsPanel
        simulation={
          {
            parameters: {
              moduleType: "warp",
              dynamicConfig: {
                burstLengthUs: 10,
                cycleLengthUs: 1000,
                sectorCount: 80,
              },
            },
            results: {
              geometricBlueshiftFactor: 1,
              totalExoticMass: 1,
              powerDraw: 1,
              isZeroExpansion: true,
              quantumSafetyStatus: "safe",
            },
            generatedFiles: [],
            logs: [],
          } as any
        }
        onDownloadFile={() => {}}
        onDownloadAll={() => {}}
        hullReferenceRadius={503.5}
      />,
    );

    expect(screen.getByText("m (Current Hull Reference Radius)")).toBeInTheDocument();
    expect(screen.getByText("m (Current Pipeline Bubble Radius)")).toBeInTheDocument();
    expect(screen.getByText("503.5")).toBeInTheDocument();
    expect(screen.getByText("2.0")).toBeInTheDocument();
  });
});
