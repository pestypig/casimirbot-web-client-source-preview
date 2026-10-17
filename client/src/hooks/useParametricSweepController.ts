// client/src/hooks/useParametricSweepController.ts
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  enumerateSweepGrid,
  simulatePoint,
  reduceResults,
  depthPctToEpsilon,
  DEFAULT_GEOM_COUPLING,
  DEFAULT_PUMP_EFF,
  DEFAULT_RHO_LADDER,
  DEFAULT_MIN_DEPTH_PCT,
  DEFAULT_MAX_DEPTH_PCT,
  type DepthRung,
  type SweepRanges,
  type SweepResolution,
  type PipelineSnapshot,
  type SimulationParams,
  type SweepAggregate,
  type PointResult,
  type SweepSample,
} from "@/lib/parametric-sweep";

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export type SweepControllerOpts = {
  ranges: SweepRanges;
  resolution: SweepResolution;
  pipeline: PipelineSnapshot;
  params: SimulationParams;
  chunkSize?: number;
  abortOnCollapse?: boolean;
  collapseFloor_MHz?: number;
  collapseConsecutive?: number;
};

export type SweepProgress = {
  runId: string;
  total: number;
  done: number;
  eta?: string;
  current?: SweepSample;
};

export function useParametricSweepController() {
  const qc = useQueryClient();
  const [runId, setRunId] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState<SweepProgress | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const stop = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const start = React.useCallback(
    async (opts: SweepControllerOpts) => {
      stop();

      const id = `sweep:${Date.now()}`;
      setRunId(id);

      const qCavity = Math.max(1, opts.pipeline.qCavity ?? 1e4);
      const geomCoupling =
        typeof opts.params.geomCoupling === "number"
          ? opts.params.geomCoupling
          : opts.pipeline.geomCoupling ?? DEFAULT_GEOM_COUPLING;
      const pumpEff =
        typeof opts.params.pumpEff === "number"
          ? opts.params.pumpEff
          : opts.pipeline.pumpEff ?? DEFAULT_PUMP_EFF;
      const minDepth =
        opts.pipeline.minDepth_pct ?? DEFAULT_MIN_DEPTH_PCT;
      const maxDepth =
        opts.pipeline.maxDepth_pct ?? DEFAULT_MAX_DEPTH_PCT;
      const denom = Math.max(1e-12, geomCoupling * pumpEff * qCavity);
      const rungMap = new Map<string, DepthRung>();
      const addRung = (depth_pct: number, rhoTarget: number) => {
        if (!Number.isFinite(depth_pct) || depth_pct <= 0) {
          return;
        }
        if (
          depth_pct < minDepth * 0.999 ||
          depth_pct > maxDepth * 1.001
        ) {
          return;
        }
        const key = depth_pct.toFixed(8);
        if (rungMap.has(key)) {
          return;
        }
        rungMap.set(key, {
          index: rungMap.size,
          depth_pct,
          rhoTarget,
        });
      };

      const baseDepth = opts.params.depth_pct;
      const baseRho =
        depthPctToEpsilon(baseDepth, geomCoupling, pumpEff) * qCavity;
      addRung(baseDepth, baseRho);
      for (const rho of DEFAULT_RHO_LADDER) {
        const depth_pct = (rho / denom) * 100;
        addRung(depth_pct, rho);
      }

      const depthRungs = Array.from(rungMap.values())
        .sort((a, b) => a.depth_pct - b.depth_pct)
        .map((rung, index) => ({
          index,
          depth_pct: rung.depth_pct,
          rhoTarget: rung.rhoTarget,
        }));

      const gridBundle = enumerateSweepGrid(
        opts.ranges.gap_nm,
        opts.ranges.Omega_GHz,
        opts.ranges.phase_deg,
        opts.resolution,
        {
          pipeline: opts.pipeline,
          alpha_gap_to_f0: opts.params.alpha_gap_to_f0,
          depthRungs,
          defaultDepth_pct: baseDepth,
        }
      );

      const grid = gridBundle.samples;
      const total = grid.length;
      const phaseGrid = gridBundle.phases_deg;
      const effectiveResolution: SweepResolution = {
        gap: opts.resolution.gap,
        Omega: opts.resolution.Omega,
        phase: phaseGrid.length,
      };
      let done = 0;
      let aggregate: SweepAggregate | undefined;

      const key = ["parametric-sweep", id];
      qc.setQueryData(key, {
        runId: id,
        aggregate: {
          omegaSlices: [],
          topRidge: [],
          total,
          done: 0,
          stats: {
            samples: 0,
            stable: 0,
            filtered: 0,
            filteredRho: 0,
            filteredDepth: 0,
            filteredOther: 0,
            threshold: 0,
            linewidthCollapse: 0,
            clipped: 0,
          },
          phiStarIndex: {},
          phaseGrid_deg: phaseGrid,
          depthRungs,
        } as SweepAggregate,
        progress: {
          runId: id,
          total,
          done: 0,
        } as SweepProgress,
      });

      const controller = new AbortController();
      abortRef.current = controller;

      const chunkSize = Math.max(1, opts.chunkSize ?? 64);
      const collapseFloor =
        opts.collapseFloor_MHz ?? opts.pipeline.kappaFloor_MHz ?? 0.01;
      const collapseNeedle = Math.max(2, opts.collapseConsecutive ?? 3);
      let consecutiveCollapses = 0;
      const t0 = performance.now();

      for (let i = 0; i < total; i += chunkSize) {
        if (controller.signal.aborted) {
          break;
        }

        const slice = grid.slice(i, i + chunkSize);
        const results: PointResult[] = [];

        for (const sample of slice) {
          const res = simulatePoint(
            sample,
            opts.pipeline,
            opts.params,
            controller.signal
          );
          results.push(res);

          if (opts.abortOnCollapse) {
            const collapsed =
              !!res.flags?.linewidthCollapse &&
              !res.flags.filtered &&
              res.stable &&
              res.kappa_eff_MHz <= collapseFloor;
            consecutiveCollapses = collapsed
              ? consecutiveCollapses + 1
              : 0;
            if (consecutiveCollapses >= collapseNeedle) {
              aggregate = reduceResults(
                aggregate,
                results,
                effectiveResolution,
                {
                  total,
                  phaseGrid_deg: phaseGrid,
                  depthRungs,
                }
              );
              aggregate.guardExit = {
                reason: `Linewidth collapse (kappa_eff <= ${collapseFloor} MHz)`,
                at: sample,
              };
              qc.setQueryData(key, {
                runId: id,
                aggregate,
                progress: {
                  runId: id,
                  total,
                  done: Math.min(total, i + results.length),
                  current: sample,
                } as SweepProgress,
              });
              controller.abort();
              break;
            }
          }
        }

        if (controller.signal.aborted) {
          break;
        }

        aggregate = reduceResults(
          aggregate,
          results,
          effectiveResolution,
          {
            total,
            phaseGrid_deg: phaseGrid,
            depthRungs,
          }
        );
        done = Math.min(total, i + results.length);

        const dt = performance.now() - t0;
        const etaMs = dt * (total / Math.max(1, done) - 1);
        const eta =
          Number.isFinite(etaMs) && etaMs > 0
            ? `${Math.round(etaMs / 1000)}s`
            : undefined;

        qc.setQueryData(key, {
          runId: id,
          aggregate,
          progress: {
            runId: id,
            total,
            done,
            eta,
            current: slice[slice.length - 1],
          } as SweepProgress,
        });

        await tick();
      }

      qc.setQueryData(key, {
        runId: id,
        aggregate: aggregate ?? {
          omegaSlices: [],
          topRidge: [],
          total,
          done,
          stats: {
            samples: done,
            stable: 0,
            filtered: 0,
            filteredRho: 0,
            filteredDepth: 0,
            filteredOther: 0,
            threshold: 0,
            linewidthCollapse: 0,
            clipped: 0,
          },
          phiStarIndex: {},
          phaseGrid_deg: phaseGrid,
          depthRungs,
        },
        progress: {
          runId: id,
          total,
          done,
        } as SweepProgress,
      });

      abortRef.current = null;
      setProgress({ runId: id, total, done });
    },
    [qc, stop]
  );

  const snapshot = React.useCallback(
    (id?: string) => {
      const key = ["parametric-sweep", id ?? runId ?? ""];
      return qc.getQueryData<{
        runId: string;
        aggregate: SweepAggregate;
        progress: SweepProgress;
      }>(key) ?? null;
    },
    [qc, runId]
  );

  return {
    start,
    stop,
    runId,
    progress,
    snapshot,
  };
}
