export const DEFAULT_METRIC_VOLUME_CHANNEL = "hull3d:metric-volume";
export const DEFAULT_GEODESIC_DIAGNOSTICS_CHANNEL = "hull3d:geodesic-diagnostics";

export type HullMetricChannel = {
  data: Float32Array;
  min?: number;
  max?: number;
};

export type HullMetricChannelMap = Record<string, HullMetricChannel>;

export interface HullMetricVolumeContract {
  kind: "hull3d:metric-volume";
  version: number;
  updatedAt: number;
  source: string;
  chart: string;
  hullSupportRequired?: boolean;
  coordinateMap?: string | null;
  provenance?: {
    endpoint?: string;
    module?: string;
    status?: string | null;
    reasons?: string[];
    includeExtra?: boolean;
    includeKij?: boolean;
    includeMatter?: boolean;
  };
  dims: [number, number, number];
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
  voxelSize_m: [number, number, number];
  time_s: number;
  dt_s: number;
  channels: HullMetricChannelMap;
  stats?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export type GeodesicLaneMode =
  | "full-3+1-christoffel"
  | "reduced-1+1-fallback"
  | "flat-background"
  | "disabled";

export interface HullGeodesicDiagnostics {
  mode: GeodesicLaneMode;
  scientificEnabled: boolean;
  metricAvailable: boolean;
  metricSource: string | null;
  chart: string | null;
  dims: [number, number, number] | null;
  maxNullResidual: number | null;
  stepConvergence: number | null;
  bundleSpread: number | null;
  consistency: "ok" | "warn" | "fail" | "unknown";
  consistencyNote: string | null;
  steps: number;
  stepScale_m: number;
  updatedAt: number;
}

export type MetricXdmfArtifact = {
  filename: string;
  blob: Blob;
};

const DEFAULT_EXPORT_CHANNELS = [
  "alpha",
  "beta_x",
  "beta_y",
  "beta_z",
  "gamma_xx",
  "gamma_yy",
  "gamma_zz",
  "K_trace",
  "H_constraint",
  "M_constraint_x",
  "M_constraint_y",
  "M_constraint_z",
] as const;

const sanitizeStem = (value: string) =>
  value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");

const f64 = (value: number, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export function buildMetricXdmfArtifacts(
  volume: HullMetricVolumeContract,
  requestedChannels?: string[],
): MetricXdmfArtifact[] {
  const dims: [number, number, number] = [
    Math.max(1, Math.floor(f64(volume.dims[0], 1))),
    Math.max(1, Math.floor(f64(volume.dims[1], 1))),
    Math.max(1, Math.floor(f64(volume.dims[2], 1))),
  ];
  const total = dims[0] * dims[1] * dims[2];
  const stamp = new Date(volume.updatedAt || Date.now()).toISOString().replace(/[:.]/g, "-");
  const stem = sanitizeStem(`nhm2-metric-volume-${stamp}`);
  const requested = requestedChannels?.length ? requestedChannels : [...DEFAULT_EXPORT_CHANNELS];
  const selected = requested
    .map((name) => {
      const channel = volume.channels[name];
      if (!channel || !(channel.data instanceof Float32Array) || channel.data.length < total) return null;
      return { name, channel };
    })
    .filter((item): item is { name: string; channel: HullMetricChannel } => Boolean(item));

  const rawArtifacts: MetricXdmfArtifact[] = selected.map(({ name, channel }) => {
    const view = channel.data.length === total ? channel.data : channel.data.subarray(0, total);
    const copy = new Float32Array(view.length);
    copy.set(view);
    return {
      filename: `${stem}-${sanitizeStem(name)}.f32`,
      blob: new Blob([copy.buffer], { type: "application/octet-stream" }),
    };
  });

  const attributeXml = selected
    .map(({ name }, index) => {
      const rawName = rawArtifacts[index]?.filename ?? `${stem}-${sanitizeStem(name)}.f32`;
      return [
        `      <Attribute Name="${name}" AttributeType="Scalar" Center="Cell">`,
        `        <DataItem Dimensions="${dims[2]} ${dims[1]} ${dims[0]}" NumberType="Float" Precision="4" Format="Binary">${rawName}</DataItem>`,
        "      </Attribute>",
      ].join("\n");
    })
    .join("\n");

  const origin = volume.bounds?.min ?? [0, 0, 0];
  const spacing = volume.voxelSize_m ?? [1, 1, 1];
  const xdmf = [
    '<?xml version="1.0" ?>',
    '<Xdmf Version="3.0">',
    "  <Domain>",
    '    <Grid Name="nhm2_metric_volume" GridType="Uniform">',
    `      <Time Value="${f64(volume.time_s, 0)}" />`,
    `      <Information Name="chart" Value="${volume.chart ?? "comoving_cartesian"}" />`,
    `      <Information Name="source" Value="${volume.source ?? "gr-evolve-brick"}" />`,
    `      <Topology TopologyType="3DCoRectMesh" Dimensions="${dims[2] + 1} ${dims[1] + 1} ${dims[0] + 1}" />`,
    '      <Geometry GeometryType="ORIGIN_DXDYDZ">',
    `        <DataItem Dimensions="3" NumberType="Float" Precision="8" Format="XML">${f64(origin[0], 0)} ${f64(origin[1], 0)} ${f64(origin[2], 0)}</DataItem>`,
    `        <DataItem Dimensions="3" NumberType="Float" Precision="8" Format="XML">${f64(spacing[0], 1)} ${f64(spacing[1], 1)} ${f64(spacing[2], 1)}</DataItem>`,
    "      </Geometry>",
    attributeXml,
    "    </Grid>",
    "  </Domain>",
    "</Xdmf>",
    "",
  ].join("\n");

  const xdmfArtifact: MetricXdmfArtifact = {
    filename: `${stem}.xdmf`,
    blob: new Blob([xdmf], { type: "application/xml" }),
  };

  return [xdmfArtifact, ...rawArtifacts];
}
