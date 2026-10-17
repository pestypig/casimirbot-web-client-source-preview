// @vitest-environment jsdom
import React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSwitchMode } from "../use-energy-pipeline";
import { queryClient } from "@/lib/queryClient";
import * as queryClientModule from "@/lib/queryClient";
import * as lumaBus from "@/lib/luma-bus";

describe("useSwitchMode live sector-control events", () => {
  beforeEach(() => {
    queryClient.getQueryCache().clear();
    queryClient.getMutationCache().clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("publishes sector-control plan and warp reload events with preflight payload", async () => {
    const publishSpy = vi.spyOn(lumaBus, "publish");
    const apiSpy = vi
      .spyOn(queryClientModule, "apiRequest")
      .mockImplementation(async (_method: string, url: string) => {
        if (url === "/api/helix/pipeline/mode") {
          return {
            ok: true,
            json: async () => ({
              mode: "emergency",
              requestedMode: "cruise",
              fallbackApplied: true,
              preflight: {
                plannerMode: "theta_balanced",
                firstFail: "FordRomanQI",
                constraints: {
                  FordRomanQI: "fail",
                  ThetaAudit: "pass",
                  TS_ratio_min: "pass",
                  VdB_band: "unknown",
                  grConstraintGate: "pass",
                },
                observerGrid: {
                  overflowCount: 2,
                  paybackGain: 1.1,
                },
              },
            }),
          } as Response;
        }
        if (url === "/api/helix/pipeline/update") {
          return {
            ok: true,
            json: async () => ({ ok: true }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({}),
        } as Response;
      });

    let mutateAsync: ((mode: "standby" | "hover" | "taxi" | "nearzero" | "cruise" | "emergency") => Promise<unknown>) | null =
      null;

    function Harness() {
      const mutation = useSwitchMode();
      React.useEffect(() => {
        mutateAsync = mutation.mutateAsync;
      }, [mutation.mutateAsync]);
      return null;
    }

    render(
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(mutateAsync).toBeTruthy());
    await mutateAsync!("cruise");

    await waitFor(() =>
      expect(publishSpy).toHaveBeenCalledWith(
        "warp:sector-control:plan",
        expect.objectContaining({
          requestedMode: "cruise",
          appliedMode: "emergency",
          fallbackApplied: true,
          plannerMode: "theta_balanced",
          firstFail: "FordRomanQI",
          constraints: expect.objectContaining({
            FordRomanQI: "fail",
            ThetaAudit: "pass",
          }),
          observerGrid: expect.objectContaining({
            overflowCount: 2,
          }),
        }),
      ),
    );

    const reloadCall = publishSpy.mock.calls.find((call) => call[0] === "warp:reload");
    expect(reloadCall).toBeTruthy();
    expect(reloadCall?.[1]).toMatchObject({
      reason: "mode-switch-local",
      mode: "cruise",
      requestedMode: "cruise",
      appliedMode: "emergency",
      preflight: expect.objectContaining({
        plannerMode: "theta_balanced",
        firstFail: "FordRomanQI",
        fallbackApplied: true,
      }),
    });
    expect(apiSpy).toHaveBeenCalledWith("POST", "/api/helix/pipeline/mode", { mode: "cruise" });
  });
});
