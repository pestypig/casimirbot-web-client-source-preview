// @vitest-environment jsdom
import React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { describe, expect, beforeEach, afterEach, it, vi } from "vitest";
import { useEnergyPipeline } from "../use-energy-pipeline";
import { queryClient } from "@/lib/queryClient";
import * as queryClientModule from "@/lib/queryClient";
import type { PipelineSnapshot, QiGuardrail } from "@/types/pipeline";

describe("useEnergyPipeline qi guard contract", () => {
  beforeEach(() => {
    queryClient.getQueryCache().clear();
    queryClient.getMutationCache().clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const pipelineZetas = {
    zeta: 0.77,
    zetaRaw: 0.84,
  } as const;

  const guardCases: Array<{ name: string; guard: QiGuardrail }> = [
    {
      name: "green guardrail stays untouched",
      guard: {
        marginRatioRaw: 0.2,
        marginRatio: 0.2,
        lhs_Jm3: -2.5e-5,
        bound_Jm3: -18,
        sumWindowDt: 1.0,
        window_ms: 40,
        sampler: "gaussian",
        fieldType: "em",
        duty: 0.4,
        patternDuty: 0.4,
        maskSum: 6400,
        effectiveRho: -19.08,
        rhoOn: -47.7,
        rhoOnDuty: -18,
        rhoSource: "tile-telemetry",
      },
    },
    {
      name: "amber guardrail passes through unclamped",
      guard: {
        marginRatioRaw: 0.98,
        marginRatio: 0.98,
      },
    },
    {
      name: "red guardrail keeps unclamped raw margin",
      guard: {
        marginRatioRaw: 2.65,
        marginRatio: 1.0,
        lhs_Jm3: -47.71,
        bound_Jm3: -18,
      },
    },
    {
      name: "clamped-only guardrail (raw missing) remains as sent",
      guard: {
        marginRatio: 0.83,
      },
    },
    {
      name: "full guardrail payload is preserved",
      guard: {
        lhs_Jm3: -3.6,
        bound_Jm3: -18,
        marginRatioRaw: 0.21,
        marginRatio: 0.2,
        window_ms: 25,
        sampler: "lorentzian",
        fieldType: "em",
        duty: 0.18,
        patternDuty: 0.22,
        maskSum: 3200,
        effectiveRho: -1.12,
        rhoOn: -2.04,
        rhoOnDuty: -1.98,
        rhoSource: "gate-pulses",
        sumWindowDt: 1.003,
      },
    },
  ];

  const renderWithPayload = async (payload: PipelineSnapshot) => {
    const pipelinePayload = { ...pipelineZetas, ...payload };
    const apiRequestMock = vi
      .spyOn(queryClientModule, "apiRequest")
      .mockImplementation(async (_method: string, url: string) => {
        if (url === "/api/helix/pipeline") {
          return { ok: true, json: async () => pipelinePayload } as Response;
        }
        return { ok: true, json: async () => ({ ok: true }) } as Response;
      });

    let snapshot: PipelineSnapshot | undefined;

    function Harness() {
      const { data } = useEnergyPipeline();
      React.useEffect(() => {
        if (data) snapshot = data;
      }, [data]);
      return null;
    }

    render(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(Harness),
      ),
    );

    await waitFor(() => expect(snapshot?.qiGuardrail).toBeDefined());

    return { snapshot: snapshot as PipelineSnapshot, apiRequestMock, pipelinePayload };
  };

  it.each(guardCases)(
    "returns guard fields bit-identical for $name",
    async ({ guard }) => {
      const payload: PipelineSnapshot = {
        qiGuardrail: guard,
        claim_tier: "diagnostic",
        provenance_class: "simulation",
      } as PipelineSnapshot;
      const { snapshot, apiRequestMock, pipelinePayload } = await renderWithPayload(payload);

      expect(snapshot.qiGuardrail).toBe(guard);
      expect(snapshot.qiGuardrail).toStrictEqual(guard);
      expect(snapshot.zeta).toBe(pipelinePayload.zeta);
      expect(snapshot.zetaRaw).toBe(pipelinePayload.zetaRaw);
      expect((snapshot as any).claim_tier).toBe("diagnostic");
      expect((snapshot as any).claimTier).toBe("diagnostic");
      expect((snapshot as any).provenance_class).toBe("simulation");
      expect((snapshot as any).provenanceClass).toBe("simulation");
      expect(apiRequestMock).toHaveBeenCalledWith("GET", "/api/helix/pipeline");
    },
  );
});
