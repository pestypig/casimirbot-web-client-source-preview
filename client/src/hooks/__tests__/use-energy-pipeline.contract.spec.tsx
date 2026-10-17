// @vitest-environment jsdom
import React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { describe, expect, beforeEach, afterEach, it, vi } from "vitest";
import { useEnergyPipeline } from "../use-energy-pipeline";
import { queryClient } from "@/lib/queryClient";
import * as queryClientModule from "@/lib/queryClient";
import type { PipelineSnapshot } from "@/types/pipeline";

describe("useEnergyPipeline contract", () => {
  beforeEach(() => {
    queryClient.getQueryCache().clear();
    queryClient.getMutationCache().clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const guardMatrix: Array<{
    name: string;
    payload: PipelineSnapshot;
    expectedZeta: number;
    expectedZetaRaw?: number;
  }> = [
    {
      name: "green path when zetaRaw < 0.95",
      payload: {
        zeta: 0.42,
        zetaRaw: 0.42,
        qiGuardrail: {
          marginRatio: 0.42,
          marginRatioRaw: 0.42,
          lhs_Jm3: -7.56,
          bound_Jm3: -18,
          window_ms: 40,
          sampler: "gaussian",
          sumWindowDt: 1.0,
          rhoSource: "tile-telemetry",
          duty: 2.5e-5,
          patternDuty: 0.5,
          maskSum: 1.0,
          effectiveRho: -7.56,
          rhoOn: -15.12,
          rhoOnDuty: -7.56,
          fieldType: "em",
        },
      },
      expectedZeta: 0.42,
      expectedZetaRaw: 0.42,
    },
    {
      name: "amber path when 0.95 <= zetaRaw < 1",
      payload: {
        zeta: 0.94,
        zetaRaw: 0.97,
        qiGuardrail: {
          marginRatio: 0.94,
          marginRatioRaw: 0.97,
          lhs_Jm3: -47.71,
          bound_Jm3: -18,
          window_ms: 40,
          sampler: "gaussian",
          sumWindowDt: 0.999,
          rhoSource: "pump-tones",
          duty: 2.5e-5,
          patternDuty: 0.5,
          maskSum: 0.5,
          effectiveRho: -23.855,
          rhoOn: -47.71,
        },
      },
      expectedZeta: 0.94,
      expectedZetaRaw: 0.97,
    },
    {
      name: "red path when zetaRaw >= 1",
      payload: {
        zeta: 1.02,
        zetaRaw: 1.25,
        qiGuardrail: {
          marginRatio: 1.02,
          marginRatioRaw: 1.25,
          lhs_Jm3: -52.0,
          bound_Jm3: -18,
          window_ms: 40,
          sampler: "gaussian",
          sumWindowDt: 1.001,
          rhoSource: "gate-pulses",
          duty: 4e-5,
          patternDuty: 0.25,
          maskSum: 0.25,
          effectiveRho: -13,
          rhoOn: -52,
          rhoOnDuty: -13,
          fieldType: "em",
        },
      },
      expectedZeta: 1.02,
      expectedZetaRaw: 1.25,
    },
    {
      name: "falls back to clamped zeta when zetaRaw is absent",
      payload: {
        zeta: 0.88,
        qiGuardrail: {
          marginRatio: 0.88,
          lhs_Jm3: -12.5,
          bound_Jm3: -25,
          window_ms: 40,
          sampler: "gaussian",
          sumWindowDt: 0.985,
          rhoSource: "duty-fallback",
          duty: 2.2e-5,
          patternDuty: 0.4,
          maskSum: 0.4,
          effectiveRho: -5.0,
          rhoOn: -12.5,
        },
      },
      expectedZeta: 0.88,
    },
  ];

  const renderWithPayload = async (payload: PipelineSnapshot) => {
    const apiRequestMock = vi
      .spyOn(queryClientModule, "apiRequest")
      .mockImplementation(async (_method: string, url: string) => {
        if (url === "/api/helix/pipeline") {
          return { ok: true, json: async () => payload } as Response;
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
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(snapshot).toBeDefined());

    return { snapshot: snapshot as PipelineSnapshot, apiRequestMock };
  };

  it.each(guardMatrix)(
    "returns guard payload unchanged for %s",
    async ({ payload, expectedZeta, expectedZetaRaw }) => {
      const { snapshot, apiRequestMock } = await renderWithPayload(payload);

      expect(snapshot.zeta).toBe(expectedZeta);
      if (expectedZetaRaw !== undefined) {
        expect(snapshot.zetaRaw).toBe(expectedZetaRaw);
      } else {
        expect(snapshot.zetaRaw).toBeUndefined();
      }

      expect(snapshot.qiGuardrail).toStrictEqual(payload.qiGuardrail);
      expect(apiRequestMock).toHaveBeenCalledWith("GET", "/api/helix/pipeline");
    },
  );

  it("can observe cached pipeline state without starting a global poll", async () => {
    const apiRequestMock = vi
      .spyOn(queryClientModule, "apiRequest")
      .mockResolvedValue({
        ok: true,
        json: async () => ({ zeta: 0.5 }),
      } as Response);

    function Harness() {
      useEnergyPipeline({ enabled: false });
      return null;
    }

    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(apiRequestMock).not.toHaveBeenCalled();
  });
});
