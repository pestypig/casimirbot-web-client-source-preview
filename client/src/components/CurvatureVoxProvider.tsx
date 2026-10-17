import React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { publish } from "@/lib/luma-bus";
import { useCurvatureBrick, type UseCurvatureBrickOptions } from "@/hooks/useCurvatureBrick";
import { useStressEnergyBrick } from "@/hooks/useStressEnergyBrick";
import { useGrBrick } from "@/hooks/useGrBrick";
import type { EnergyPipelineState } from "@/hooks/use-energy-pipeline";
import { useDriveSyncStore } from "@/store/useDriveSyncStore";
import { PROMOTED_WARP_PROFILE } from "@shared/warp-promoted-profile";
import {
  DEFAULT_METRIC_VOLUME_CHANNEL,
  type HullMetricChannelMap,
} from "@/lib/metric-volume-contract";

export interface CurvatureVoxProviderProps extends UseCurvatureBrickOptions {
  channel?: string;
  t00Channel?: string;
  fluxChannel?: string;
  metricChannel?: string;
  children?: React.ReactNode;
}

export const DEFAULT_CURVATURE_CHANNEL = "hull3d:curvature";
export const DEFAULT_T00_CHANNEL = "hull3d:t00-volume";
export const DEFAULT_FLUX_CHANNEL = "hull3d:flux";

const pickPipelineNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export function CurvatureVoxProvider({
  channel = DEFAULT_CURVATURE_CHANNEL,
  t00Channel = DEFAULT_T00_CHANNEL,
  fluxChannel = DEFAULT_FLUX_CHANNEL,
  metricChannel = DEFAULT_METRIC_VOLUME_CHANNEL,
  children,
  ...options
}: CurvatureVoxProviderProps) {
  const { sample, dataUpdatedAt } = useCurvatureBrick(options);
  const stampRef = React.useRef<number>(0);
  const stressStampRef = React.useRef<number>(0);
  const metricStampRef = React.useRef<number>(0);
  const queryClient = useQueryClient();
  const pipeline = queryClient.getQueryData<EnergyPipelineState>(["/api/helix/pipeline"]);
  const phase01 = useDriveSyncStore((s) => s.phase01);
  const qSpoil = useDriveSyncStore((s) => s.q);
  const zetaDrive = useDriveSyncStore((s) => s.zeta);
  const dutyFR = Math.max(
    1e-8,
    sample?.dutyFR ??
      pickPipelineNumber(
        (pipeline as any)?.dutyEffectiveFR ?? pipeline?.dutyCycle,
        PROMOTED_WARP_PROFILE.dutyShip,
      ),
  );
  const gammaGeo = Math.max(
    1e-6,
    pickPipelineNumber((pipeline as any)?.gammaGeo, PROMOTED_WARP_PROFILE.gammaGeo),
  );
  const gammaVdB = Math.max(
    1e-6,
    pickPipelineNumber(
      (pipeline as any)?.gammaVanDenBroeck_mass ??
        (pipeline as any)?.gammaVanDenBroeck ??
        (pipeline as any)?.gammaVdB ??
        (pipeline as any)?.gammaVanDenBroeck_vis,
      PROMOTED_WARP_PROFILE.gammaVanDenBroeck,
    ),
  );
  const scientificRefetchMs = Math.max(500, options.refetchMs ?? 1000);
  const stressQuery = useStressEnergyBrick({
    quality: "low",
    refetchMs: scientificRefetchMs,
  });
  const metricT00Raw = Number(
    (pipeline as any)?.warp?.metricT00 ??
      (pipeline as any)?.metricT00 ??
      (pipeline as any)?.stressEnergy?.T00,
  );
  const metricT00 = Number.isFinite(metricT00Raw) ? metricT00Raw : null;
  const metricT00Source =
    typeof (pipeline as any)?.warp?.metricT00Source === "string"
      ? String((pipeline as any).warp.metricT00Source)
      : typeof (pipeline as any)?.warp?.stressEnergySource === "string"
        ? String((pipeline as any).warp.stressEnergySource)
        : null;
  const metricT00Ref =
    typeof (pipeline as any)?.warp?.metricT00Ref === "string"
      ? String((pipeline as any).warp.metricT00Ref)
      : null;
  const grQuery = useGrBrick({
    quality: "low",
    dims: [24, 24, 24],
    steps: 1,
    includeExtra: true,
    includeKij: true,
    includeMatter: true,
    dutyFR,
    q: Math.max(1e-6, qSpoil),
    gammaGeo,
    gammaVdB,
    zeta: Math.max(0, zetaDrive),
    phase01,
    refetchMs: scientificRefetchMs,
  });

  React.useEffect(() => {
    if (!sample) {
      return;
    }
    stampRef.current += 1;
    const payload = {
      ...sample,
      version: stampRef.current,
      updatedAt: dataUpdatedAt ?? Date.now(),
    };
    publish(channel, payload);
  }, [channel, sample, dataUpdatedAt]);

  React.useEffect(() => {
    const stress = stressQuery.data;
    if (!stress) return;
    stressStampRef.current += 1;
    const updatedAt = stressQuery.dataUpdatedAt ?? Date.now();
    const t00 = stress.t00;
    const packet = {
      dims: stress.dims,
      stats: stress.stats,
      meta: stress.meta,
      version: stressStampRef.current,
      updatedAt,
    };
    publish(t00Channel, {
      ...packet,
      data: t00?.data,
      min: t00?.min,
      max: t00?.max,
      t00,
    });
    publish(fluxChannel, { ...packet, flux: stress.flux });
  }, [stressQuery.data, stressQuery.dataUpdatedAt, t00Channel, fluxChannel]);

  React.useEffect(() => {
    const gr = grQuery.data;
    if (!gr) return;
    metricStampRef.current += 1;
    const updatedAt = grQuery.dataUpdatedAt ?? Date.now();
    const channels: HullMetricChannelMap = {
      alpha: gr.channels.alpha,
      beta_x: gr.channels.beta_x,
      beta_y: gr.channels.beta_y,
      beta_z: gr.channels.beta_z,
      gamma_xx: gr.channels.gamma_xx,
      gamma_yy: gr.channels.gamma_yy,
      gamma_zz: gr.channels.gamma_zz,
      K_trace: gr.channels.K_trace,
      H_constraint: gr.channels.H_constraint,
      M_constraint_x: gr.channels.M_constraint_x,
      M_constraint_y: gr.channels.M_constraint_y,
      M_constraint_z: gr.channels.M_constraint_z,
    };

    const optional = [
      "K_xx",
      "K_yy",
      "K_zz",
      "K_xy",
      "K_xz",
      "K_yz",
      "theta",
      "det_gamma",
      "ricci3",
      "KijKij",
      "kretschmann",
      "ricci4",
      "ricci2",
      "weylI",
      "hull_sdf",
      "tile_support_mask",
      "region_class",
    ] as const;
    for (const key of optional) {
      const channel = gr.extraChannels?.[key];
      if (!channel) continue;
      channels[key] = channel;
    }

    const packet = {
      kind: "hull3d:metric-volume" as const,
      version: metricStampRef.current,
      updatedAt,
      source: "gr-evolve-brick",
      chart: "comoving_cartesian",
      hullSupportRequired: true,
      coordinateMap: "bubble-centered coordinates",
      provenance: {
        endpoint: "/api/helix/gr-evolve-brick",
        module: "server/gr-evolve-brick.ts",
        status: gr.meta?.status ?? null,
        reasons: gr.meta?.reasons ?? [],
        includeExtra: true,
        includeKij: true,
        includeMatter: true,
        sourceParams: {
          dutyFR,
          q: Math.max(1e-6, qSpoil),
          gammaGeo,
          gammaVdB,
          zeta: Math.max(0, zetaDrive),
          phase01,
          metricT00,
          metricT00Source,
          metricT00Ref,
        },
      },
      dims: gr.dims,
      bounds: gr.bounds,
      voxelSize_m: gr.voxelSize_m,
      time_s: gr.time_s,
      dt_s: gr.dt_s,
      channels,
      stats: gr.stats as unknown as Record<string, unknown>,
      meta: (gr.meta ?? null) as unknown as Record<string, unknown> | null,
    };

    publish(metricChannel, packet);
    if (typeof window !== "undefined") {
      (window as any).__hullMetricVolumeLatest = packet;
    }
  }, [grQuery.data, grQuery.dataUpdatedAt, metricChannel]);

  return <>{children}</>;
}

export default CurvatureVoxProvider;
