import { useEffect } from "react";
import { useEnergyPipeline } from "@/hooks/use-energy-pipeline";
import { createFixedHzBrainLoop } from "@/lib/nav/brain-tick";
import {
  computeNavDelta,
  createDeterministicNavTraceId,
  resolveNavVector,
  shouldRecordNavPhase,
  type VizIntent,
  type Waypoint,
} from "@/lib/nav/nav-dynamics";
import { useNavPoseStore } from "@/store/useNavPoseStore";

type UseNavPoseDriverParams = {
  vizIntent: VizIntent;
  waypoint?: Waypoint | null;
  enabled?: boolean;
};

export function useNavPoseDriver({
  vizIntent,
  waypoint = null,
  enabled = true,
}: UseNavPoseDriverParams): void {
  const { data: pipeline } = useEnergyPipeline();
  const ingest = useNavPoseStore((state) => state.ingestDriveVector);
  const beginEpisode = useNavPoseStore((state) => state.beginEpisode);
  const recordEpisodePhase = useNavPoseStore((state) => state.recordEpisodePhase);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    const seed = JSON.stringify({
      mode: pipeline?.currentMode ?? "unknown",
      duty: pipeline?.dutyCycle ?? pipeline?.dutyFR ?? null,
      waypoint: waypoint?.position_m ?? null,
    });
    const traceId = createDeterministicNavTraceId({
      seed,
      waypoint,
      viz: vizIntent,
      frame: "heliocentric-ecliptic",
    });
    beginEpisode({ traceId, seed });

    const brainLoop = createFixedHzBrainLoop({
      hz: 12,
      onTick: ({ tick, dt_s, now_ms }) => {
        const { source, navPose } = useNavPoseStore.getState();
        if (source === "server") return;

        if (shouldRecordNavPhase(tick, "sense")) {
          recordEpisodePhase({ phase: "sense", metadata: { source, tick } });
        }

        const resolved = resolveNavVector({
          viz: vizIntent,
          pipeline,
          currentPose: navPose,
          waypoint,
        });

        if (shouldRecordNavPhase(tick, "premeditate")) {
          recordEpisodePhase({
            phase: "premeditate",
            candidateId: `heading:${resolved.heading_deg.toFixed(2)}`,
            predictedDelta: resolved.speed_mps,
          });
        }

        ingest({
          velocity_mps: resolved.velocity_mps,
          heading_deg: resolved.heading_deg,
          frame: "heliocentric-ecliptic",
          now_ms,
          dt_s,
        });

        if (shouldRecordNavPhase(tick, "act")) {
          const actual = useNavPoseStore.getState().navPose.velocity_mps;
          const delta = computeNavDelta({
            predictedVelocity: resolved.velocity_mps,
            actualVelocity: actual,
          });
          recordEpisodePhase({
            phase: "act",
            controllerRef: "nav-pose-driver",
            actualDelta: delta,
          });
          recordEpisodePhase({
            phase: "compare",
            predictedDelta: 0,
            actualDelta: delta,
            metadata: {
              traceId,
            },
          });
        }
      },
    });

    brainLoop.start();
    return () => {
      brainLoop.stop();
      void useNavPoseStore.getState().flushEpisode();
    };
  }, [
    beginEpisode,
    enabled,
    ingest,
    pipeline,
    recordEpisodePhase,
    vizIntent.planar,
    vizIntent.rise,
    vizIntent.yaw,
    waypoint?.position_m?.[0],
    waypoint?.position_m?.[1],
    waypoint?.position_m?.[2],
  ]);
}
