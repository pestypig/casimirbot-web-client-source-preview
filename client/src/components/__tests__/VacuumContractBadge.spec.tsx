// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import VacuumContractBadge from "@/components/VacuumContractBadge";

describe("VacuumContractBadge", () => {
  it("surfaces explicit hull and bubble geometry in the summary chips", () => {
    render(
      <VacuumContractBadge
        contract={
          {
            id: "vacuum-contract-1",
            label: "NHM2 vacuum contract",
            status: "green",
            rule: null,
            changed: [],
            updatedAt: Date.now(),
            spec: {
              geometry: {
                gap_nm: 8,
                tileArea_cm2: 25,
                hullReferenceRadius_m: 503.5,
                bubbleRadius_m: 280,
                sectorCount: 80,
                sectorsConcurrent: 2,
              },
              boundary: { material: "SiC", model: "sealed", surface: "mirror" },
              thermal: { cavity_K: 20, environment_K: 20, gradient_K: 0.1 },
              loss: { qCavity: 100000, qMechanical: 50000, zeta: 0.12 },
              drive: { modulationFreq_GHz: 15, dutyCycle: 0.12, pumpPhase_deg: 90 },
              readout: { coupling_zeta: 0.12, amplifierNoiseTemp_K: 4.2 },
            },
            exports: {
              kappaEff_MHz: 12.5,
            },
          } as any
        }
      />,
    );

    expect(screen.getByText("hull ref 503.50 m")).toBeInTheDocument();
    expect(screen.getByText("bubble 280.00 m")).toBeInTheDocument();
  });
});
