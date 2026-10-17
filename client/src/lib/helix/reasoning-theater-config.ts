export const REASONING_THEATER_FRONTIER_ACTIONS = [
  "large_gain",
  "small_gain",
  "steady",
  "small_loss",
  "large_loss",
  "hard_drop",
] as const;

export type ReasoningTheaterFrontierAction =
  (typeof REASONING_THEATER_FRONTIER_ACTIONS)[number];

export const REASONING_THEATER_RETRIEVAL_ZONES = [
  "mapped_connected",
  "owned_frontier",
  "uncharted",
] as const;

export type ReasoningTheaterRetrievalZone =
  (typeof REASONING_THEATER_RETRIEVAL_ZONES)[number];

export type ReasoningTheaterFrontierThresholds = {
  hard_drop_delta_pct: number;
  large_gain_delta_pct: number;
  small_gain_delta_pct: number;
  large_loss_delta_pct: number;
  small_loss_delta_pct: number;
};

export type ReasoningTheaterFrontierParticleProfile = {
  color: string;
  base_direction_deg: number;
  spread_deg: number;
  speed_min_px_s: number;
  speed_max_px_s: number;
  turbulence: number;
  emit_rate_hz: number;
  transition_burst: boolean;
  shock_ring: boolean;
};

export type ReasoningTheaterFrontierActionConfig = {
  icon_path: string;
  particle_profile: ReasoningTheaterFrontierParticleProfile;
};

export type ReasoningTheaterFrontierActionsConfig = {
  window_ms: number;
  switch_hold_frames: number;
  min_action_ms: number;
  thresholds: ReasoningTheaterFrontierThresholds;
  actions: Record<ReasoningTheaterFrontierAction, ReasoningTheaterFrontierActionConfig>;
};

export type ReasoningTheaterZoneStyle = {
  base_color: string;
  active_color: string;
  edge_opacity: number;
};

export type ReasoningTheaterZoneMotionConfig = {
  enabled: boolean;
  sweep_band_width_pct: number;
  sweep_falloff_pct: number;
  node_frontier_boost: number;
  node_zone_boost: number;
  edge_frontier_boost: number;
  edge_zone_boost: number;
  breath_hz_base: number;
  breath_hz_gain: number;
  dash_px: number;
  dash_gap_px: number;
  sweep_opacity_min: number;
  sweep_opacity_max: number;
};

export type ReasoningTheaterZonePresentationConfig = {
  mode:
    | "convergence_strip_v1"
    | "atlas_dag_focus_v1"
    | "congruence_dag_atlas_v1"
    | "congruence_route_focus_v1"
    | "congruence_constellation_v2";
  symbolic_model: "constellation_weave";
  literality: "exact_plus_aura";
  zone_presence: "ambient_only";
  map_text: "none";
  constellation_node_budget: number;
  aura_hop_limit: number;
  aura_opacity_max: number;
  thread_count_per_edge: number;
  trace_scope: "primary_only";
  camera_mode: "fixed";
  path_mode: "full_path_with_event_flow";
  progress_encoding: "leaf_beacon_route_flux";
  no_exact_fallback: "tree_pulse_only";
  show_root_leaf_markers: boolean;
  caption_mode: "one_line";
  causality_encoding: "map_only";
  provenance_mode: "strict_exact_only";
  labels: "none";
  show_open_world_text_chip: boolean;
  core_reaction_ms: number;
  event_pulse_ms: number;
  event_hold_ms: number;
  path_fade_ms: number;
  max_exact_paths_per_event: number;
  show_phase_tick: boolean;
  show_caption: boolean;
  show_reply_snapshot: boolean;
  collapse_pulse_ms: number;
  lane_hold_ms: number;
  unknown_policy: "explicit";
};

export type ReasoningTheaterZoneGraphFocusConfig = {
  enabled: boolean;
  max_visible_nodes: number;
  max_visible_edges: number;
  hop_limit: number;
  neighbor_cap_per_node: number;
  camera_padding_pct: number;
  camera_lerp: number;
  indicator_ms: number;
  objective_reaction_ms: number;
};

export type ReasoningTheaterZoneConfig = {
  enabled: boolean;
  node_count_dense: number;
  pulse_ms: number;
  hold_ms: number;
  open_world_label: string;
  zones: Record<ReasoningTheaterRetrievalZone, ReasoningTheaterZoneStyle>;
  motion: ReasoningTheaterZoneMotionConfig;
  presentation: ReasoningTheaterZonePresentationConfig;
  graph_focus: ReasoningTheaterZoneGraphFocusConfig;
};

export type ReasoningTheaterConfigResponse = {
  version: string;
  frontier_actions: ReasoningTheaterFrontierActionsConfig;
  retrieval_zone_layer: ReasoningTheaterZoneConfig;
};

const DEFAULT_VERSION = "reasoning_theater.v1";

export const DEFAULT_REASONING_THEATER_FRONTIER_CONFIG: ReasoningTheaterFrontierActionsConfig = {
  window_ms: 200,
  switch_hold_frames: 4,
  min_action_ms: 180,
  thresholds: {
    hard_drop_delta_pct: -8.0,
    large_gain_delta_pct: 3.0,
    small_gain_delta_pct: 0.8,
    large_loss_delta_pct: -3.0,
    small_loss_delta_pct: -0.8,
  },
  actions: {
    large_gain: {
      icon_path: "/reasoning-theater/frontier-actions/large_gain.svg",
      particle_profile: {
        color: "#34D399",
        base_direction_deg: 0,
        spread_deg: 12,
        speed_min_px_s: 84,
        speed_max_px_s: 128,
        turbulence: 0.16,
        emit_rate_hz: 24,
        transition_burst: true,
        shock_ring: false,
      },
    },
    small_gain: {
      icon_path: "/reasoning-theater/frontier-actions/small_gain.svg",
      particle_profile: {
        color: "#22D3EE",
        base_direction_deg: 0,
        spread_deg: 18,
        speed_min_px_s: 36,
        speed_max_px_s: 72,
        turbulence: 0.14,
        emit_rate_hz: 12,
        transition_burst: false,
        shock_ring: false,
      },
    },
    steady: {
      icon_path: "/reasoning-theater/frontier-actions/steady.svg",
      particle_profile: {
        color: "#94A3B8",
        base_direction_deg: 0,
        spread_deg: 30,
        speed_min_px_s: 10,
        speed_max_px_s: 24,
        turbulence: 0.08,
        emit_rate_hz: 4,
        transition_burst: false,
        shock_ring: false,
      },
    },
    small_loss: {
      icon_path: "/reasoning-theater/frontier-actions/small_loss.svg",
      particle_profile: {
        color: "#F59E0B",
        base_direction_deg: 180,
        spread_deg: 20,
        speed_min_px_s: 36,
        speed_max_px_s: 72,
        turbulence: 0.34,
        emit_rate_hz: 12,
        transition_burst: false,
        shock_ring: false,
      },
    },
    large_loss: {
      icon_path: "/reasoning-theater/frontier-actions/large_loss.svg",
      particle_profile: {
        color: "#FB7185",
        base_direction_deg: 180,
        spread_deg: 16,
        speed_min_px_s: 72,
        speed_max_px_s: 118,
        turbulence: 0.55,
        emit_rate_hz: 22,
        transition_burst: true,
        shock_ring: false,
      },
    },
    hard_drop: {
      icon_path: "/reasoning-theater/frontier-actions/hard_drop.svg",
      particle_profile: {
        color: "#EF4444",
        base_direction_deg: 205,
        spread_deg: 38,
        speed_min_px_s: 96,
        speed_max_px_s: 150,
        turbulence: 0.82,
        emit_rate_hz: 30,
        transition_burst: true,
        shock_ring: true,
      },
    },
  },
};

export const DEFAULT_REASONING_THEATER_ZONE_CONFIG: ReasoningTheaterZoneConfig = {
  enabled: true,
  node_count_dense: 120,
  pulse_ms: 1200,
  hold_ms: 260,
  open_world_label: "open-world",
  zones: {
    mapped_connected: {
      base_color: "#0F766E",
      active_color: "#22D3EE",
      edge_opacity: 0.44,
    },
    owned_frontier: {
      base_color: "#475569",
      active_color: "#F59E0B",
      edge_opacity: 0.38,
    },
    uncharted: {
      base_color: "#1F2937",
      active_color: "#FB7185",
      edge_opacity: 0.32,
    },
  },
  motion: {
    enabled: true,
    sweep_band_width_pct: 14,
    sweep_falloff_pct: 10,
    node_frontier_boost: 0.52,
    node_zone_boost: 0.48,
    edge_frontier_boost: 0.34,
    edge_zone_boost: 0.22,
    breath_hz_base: 0.45,
    breath_hz_gain: 1.1,
    dash_px: 1.6,
    dash_gap_px: 2.8,
    sweep_opacity_min: 0.08,
    sweep_opacity_max: 0.42,
  },
  presentation: {
    mode: "convergence_strip_v1",
    symbolic_model: "constellation_weave",
    literality: "exact_plus_aura",
    zone_presence: "ambient_only",
    map_text: "none",
    constellation_node_budget: 96,
    aura_hop_limit: 1,
    aura_opacity_max: 0.22,
    thread_count_per_edge: 2,
    trace_scope: "primary_only",
    camera_mode: "fixed",
    path_mode: "full_path_with_event_flow",
    progress_encoding: "leaf_beacon_route_flux",
    no_exact_fallback: "tree_pulse_only",
    show_root_leaf_markers: true,
    caption_mode: "one_line",
    causality_encoding: "map_only",
    provenance_mode: "strict_exact_only",
    labels: "none",
    show_open_world_text_chip: true,
    core_reaction_ms: 480,
    event_pulse_ms: 720,
    event_hold_ms: 180,
    path_fade_ms: 900,
    max_exact_paths_per_event: 12,
    show_phase_tick: true,
    show_caption: true,
    show_reply_snapshot: true,
    collapse_pulse_ms: 520,
    lane_hold_ms: 220,
    unknown_policy: "explicit",
  },
  graph_focus: {
    enabled: true,
    max_visible_nodes: 120,
    max_visible_edges: 280,
    hop_limit: 3,
    neighbor_cap_per_node: 8,
    camera_padding_pct: 0.12,
    camera_lerp: 0.22,
    indicator_ms: 520,
    objective_reaction_ms: 480,
  },
};

const DEFAULT_REASONING_THEATER_CONFIG_RESPONSE: ReasoningTheaterConfigResponse = {
  version: DEFAULT_VERSION,
  frontier_actions: DEFAULT_REASONING_THEATER_FRONTIER_CONFIG,
  retrieval_zone_layer: DEFAULT_REASONING_THEATER_ZONE_CONFIG,
};

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readPositiveInt(value: unknown, fallback: number): number {
  const parsed = Math.floor(readNumber(value, fallback));
  return parsed > 0 ? parsed : fallback;
}

function readBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "1") return true;
  if (value === "0") return false;
  return fallback;
}

function readColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
}

function readPath(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
}

function readLabel(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
}

function readOneOf<T extends string>(value: unknown, fallback: T, allowed: readonly T[]): T {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim() as T;
  return allowed.includes(trimmed) ? trimmed : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function parseParticleProfile(
  value: unknown,
  fallback: ReasoningTheaterFrontierParticleProfile,
): ReasoningTheaterFrontierParticleProfile {
  const raw = readObject(value);
  if (!raw) return fallback;
  const speedMin = readNumber(raw.speed_min_px_s, fallback.speed_min_px_s);
  const speedMax = readNumber(raw.speed_max_px_s, fallback.speed_max_px_s);
  const clampedSpeedMin = Math.max(0, speedMin);
  return {
    color: readColor(raw.color, fallback.color),
    base_direction_deg: readNumber(raw.base_direction_deg, fallback.base_direction_deg),
    spread_deg: Math.max(0, readNumber(raw.spread_deg, fallback.spread_deg)),
    speed_min_px_s: clampedSpeedMin,
    speed_max_px_s: Math.max(clampedSpeedMin, speedMax),
    turbulence: Math.max(0, readNumber(raw.turbulence, fallback.turbulence)),
    emit_rate_hz: Math.max(0, readNumber(raw.emit_rate_hz, fallback.emit_rate_hz)),
    transition_burst: readBool(raw.transition_burst, fallback.transition_burst),
    shock_ring: readBool(raw.shock_ring, fallback.shock_ring),
  };
}

function parseActionConfig(
  value: unknown,
  fallback: ReasoningTheaterFrontierActionConfig,
): ReasoningTheaterFrontierActionConfig {
  const raw = readObject(value);
  if (!raw) return fallback;
  return {
    icon_path: readPath(raw.icon_path, fallback.icon_path),
    particle_profile: parseParticleProfile(raw.particle_profile, fallback.particle_profile),
  };
}

function parseFrontierConfig(value: unknown): ReasoningTheaterFrontierActionsConfig {
  const frontierRaw = readObject(value);
  const defaults = DEFAULT_REASONING_THEATER_FRONTIER_CONFIG;
  if (!frontierRaw) return defaults;

  const thresholdsRaw = readObject(frontierRaw.thresholds);
  const thresholds: ReasoningTheaterFrontierThresholds = {
    hard_drop_delta_pct: readNumber(
      thresholdsRaw?.hard_drop_delta_pct,
      defaults.thresholds.hard_drop_delta_pct,
    ),
    large_gain_delta_pct: readNumber(
      thresholdsRaw?.large_gain_delta_pct,
      defaults.thresholds.large_gain_delta_pct,
    ),
    small_gain_delta_pct: readNumber(
      thresholdsRaw?.small_gain_delta_pct,
      defaults.thresholds.small_gain_delta_pct,
    ),
    large_loss_delta_pct: readNumber(
      thresholdsRaw?.large_loss_delta_pct,
      defaults.thresholds.large_loss_delta_pct,
    ),
    small_loss_delta_pct: readNumber(
      thresholdsRaw?.small_loss_delta_pct,
      defaults.thresholds.small_loss_delta_pct,
    ),
  };

  const actionsRaw = readObject(frontierRaw.actions);
  const actions: Record<ReasoningTheaterFrontierAction, ReasoningTheaterFrontierActionConfig> = {
    large_gain: parseActionConfig(actionsRaw?.large_gain, defaults.actions.large_gain),
    small_gain: parseActionConfig(actionsRaw?.small_gain, defaults.actions.small_gain),
    steady: parseActionConfig(actionsRaw?.steady, defaults.actions.steady),
    small_loss: parseActionConfig(actionsRaw?.small_loss, defaults.actions.small_loss),
    large_loss: parseActionConfig(actionsRaw?.large_loss, defaults.actions.large_loss),
    hard_drop: parseActionConfig(actionsRaw?.hard_drop, defaults.actions.hard_drop),
  };

  return {
    window_ms: readPositiveInt(frontierRaw.window_ms, defaults.window_ms),
    switch_hold_frames: readPositiveInt(
      frontierRaw.switch_hold_frames,
      defaults.switch_hold_frames,
    ),
    min_action_ms: readPositiveInt(frontierRaw.min_action_ms, defaults.min_action_ms),
    thresholds,
    actions,
  };
}

function parseZoneStyle(
  value: unknown,
  fallback: ReasoningTheaterZoneStyle,
): ReasoningTheaterZoneStyle {
  const raw = readObject(value);
  if (!raw) return fallback;
  return {
    base_color: readColor(raw.base_color, fallback.base_color),
    active_color: readColor(raw.active_color, fallback.active_color),
    edge_opacity: clampNumber(readNumber(raw.edge_opacity, fallback.edge_opacity), 0, 1),
  };
}

function parseRetrievalZoneConfig(value: unknown): ReasoningTheaterZoneConfig {
  const raw = readObject(value);
  const defaults = DEFAULT_REASONING_THEATER_ZONE_CONFIG;
  if (!raw) return defaults;

  const zonesRaw = readObject(raw.zones);
  const motionRaw = readObject(raw.motion);
  const presentationRaw = readObject(raw.presentation);
  const graphFocusRaw = readObject(raw.graph_focus);
  const motionDefaults = defaults.motion;
  const presentationDefaults = defaults.presentation;
  const graphFocusDefaults = defaults.graph_focus;
  const motion: ReasoningTheaterZoneMotionConfig = {
    enabled: readBool(motionRaw?.enabled, motionDefaults.enabled),
    sweep_band_width_pct: clampNumber(
      readNumber(motionRaw?.sweep_band_width_pct, motionDefaults.sweep_band_width_pct),
      6,
      30,
    ),
    sweep_falloff_pct: clampNumber(
      readNumber(motionRaw?.sweep_falloff_pct, motionDefaults.sweep_falloff_pct),
      4,
      24,
    ),
    node_frontier_boost: clampNumber(
      readNumber(motionRaw?.node_frontier_boost, motionDefaults.node_frontier_boost),
      0,
      1.2,
    ),
    node_zone_boost: clampNumber(
      readNumber(motionRaw?.node_zone_boost, motionDefaults.node_zone_boost),
      0,
      1.2,
    ),
    edge_frontier_boost: clampNumber(
      readNumber(motionRaw?.edge_frontier_boost, motionDefaults.edge_frontier_boost),
      0,
      1,
    ),
    edge_zone_boost: clampNumber(
      readNumber(motionRaw?.edge_zone_boost, motionDefaults.edge_zone_boost),
      0,
      1,
    ),
    breath_hz_base: clampNumber(
      readNumber(motionRaw?.breath_hz_base, motionDefaults.breath_hz_base),
      0.1,
      3,
    ),
    breath_hz_gain: clampNumber(
      readNumber(motionRaw?.breath_hz_gain, motionDefaults.breath_hz_gain),
      0,
      4,
    ),
    dash_px: clampNumber(readNumber(motionRaw?.dash_px, motionDefaults.dash_px), 0.5, 6),
    dash_gap_px: clampNumber(
      readNumber(motionRaw?.dash_gap_px, motionDefaults.dash_gap_px),
      1,
      10,
    ),
    sweep_opacity_min: clampNumber(
      readNumber(motionRaw?.sweep_opacity_min, motionDefaults.sweep_opacity_min),
      0,
      1,
    ),
    sweep_opacity_max: clampNumber(
      readNumber(motionRaw?.sweep_opacity_max, motionDefaults.sweep_opacity_max),
      0,
      1,
    ),
  };
  const presentation: ReasoningTheaterZonePresentationConfig = {
    mode: readOneOf(presentationRaw?.mode, presentationDefaults.mode, [
      "convergence_strip_v1",
      "atlas_dag_focus_v1",
      "congruence_dag_atlas_v1",
      "congruence_route_focus_v1",
      "congruence_constellation_v2",
    ]),
    symbolic_model: readOneOf(
      presentationRaw?.symbolic_model,
      presentationDefaults.symbolic_model,
      ["constellation_weave"],
    ),
    literality: readOneOf(
      presentationRaw?.literality,
      presentationDefaults.literality,
      ["exact_plus_aura"],
    ),
    zone_presence: readOneOf(
      presentationRaw?.zone_presence,
      presentationDefaults.zone_presence,
      ["ambient_only"],
    ),
    map_text: readOneOf(presentationRaw?.map_text, presentationDefaults.map_text, ["none"]),
    constellation_node_budget: clampNumber(
      readPositiveInt(
        presentationRaw?.constellation_node_budget,
        presentationDefaults.constellation_node_budget,
      ),
      80,
      120,
    ),
    aura_hop_limit: clampNumber(
      readPositiveInt(presentationRaw?.aura_hop_limit, presentationDefaults.aura_hop_limit),
      0,
      1,
    ),
    aura_opacity_max: clampNumber(
      readNumber(presentationRaw?.aura_opacity_max, presentationDefaults.aura_opacity_max),
      0,
      1,
    ),
    thread_count_per_edge: clampNumber(
      readPositiveInt(
        presentationRaw?.thread_count_per_edge,
        presentationDefaults.thread_count_per_edge,
      ),
      1,
      4,
    ),
    trace_scope: readOneOf(
      presentationRaw?.trace_scope,
      presentationDefaults.trace_scope,
      ["primary_only"],
    ),
    camera_mode: readOneOf(
      presentationRaw?.camera_mode,
      presentationDefaults.camera_mode,
      ["fixed"],
    ),
    path_mode: readOneOf(
      presentationRaw?.path_mode,
      presentationDefaults.path_mode,
      ["full_path_with_event_flow"],
    ),
    progress_encoding: readOneOf(
      presentationRaw?.progress_encoding,
      presentationDefaults.progress_encoding,
      ["leaf_beacon_route_flux"],
    ),
    no_exact_fallback: readOneOf(
      presentationRaw?.no_exact_fallback,
      presentationDefaults.no_exact_fallback,
      ["tree_pulse_only"],
    ),
    show_root_leaf_markers: readBool(
      presentationRaw?.show_root_leaf_markers,
      presentationDefaults.show_root_leaf_markers,
    ),
    caption_mode: readOneOf(
      presentationRaw?.caption_mode,
      presentationDefaults.caption_mode,
      ["one_line"],
    ),
    causality_encoding: readOneOf(
      presentationRaw?.causality_encoding,
      presentationDefaults.causality_encoding,
      ["map_only"],
    ),
    provenance_mode: readOneOf(
      presentationRaw?.provenance_mode,
      presentationDefaults.provenance_mode,
      ["strict_exact_only"],
    ),
    labels: readOneOf(presentationRaw?.labels, presentationDefaults.labels, ["none"]),
    show_open_world_text_chip: readBool(
      presentationRaw?.show_open_world_text_chip,
      presentationDefaults.show_open_world_text_chip,
    ),
    core_reaction_ms: clampNumber(
      readPositiveInt(presentationRaw?.core_reaction_ms, presentationDefaults.core_reaction_ms),
      120,
      2_500,
    ),
    event_pulse_ms: clampNumber(
      readPositiveInt(presentationRaw?.event_pulse_ms, presentationDefaults.event_pulse_ms),
      240,
      4_000,
    ),
    event_hold_ms: clampNumber(
      readPositiveInt(presentationRaw?.event_hold_ms, presentationDefaults.event_hold_ms),
      60,
      1_200,
    ),
    path_fade_ms: clampNumber(
      readPositiveInt(presentationRaw?.path_fade_ms, presentationDefaults.path_fade_ms),
      240,
      4_000,
    ),
    max_exact_paths_per_event: clampNumber(
      readPositiveInt(
        presentationRaw?.max_exact_paths_per_event,
        presentationDefaults.max_exact_paths_per_event,
      ),
      1,
      24,
    ),
    show_phase_tick: readBool(
      presentationRaw?.show_phase_tick,
      presentationDefaults.show_phase_tick,
    ),
    show_caption: readBool(
      presentationRaw?.show_caption,
      presentationDefaults.show_caption,
    ),
    show_reply_snapshot: readBool(
      presentationRaw?.show_reply_snapshot,
      presentationDefaults.show_reply_snapshot,
    ),
    collapse_pulse_ms: clampNumber(
      readPositiveInt(
        presentationRaw?.collapse_pulse_ms,
        presentationDefaults.collapse_pulse_ms,
      ),
      120,
      2_500,
    ),
    lane_hold_ms: clampNumber(
      readPositiveInt(
        presentationRaw?.lane_hold_ms,
        presentationDefaults.lane_hold_ms,
      ),
      60,
      1_200,
    ),
    unknown_policy: readOneOf(
      presentationRaw?.unknown_policy,
      presentationDefaults.unknown_policy,
      ["explicit"],
    ),
  };
  const adjustedEventPulseMs = Math.max(
    presentation.event_pulse_ms,
    presentation.event_hold_ms + 1,
  );
  const adjustedPathFadeMs = Math.max(presentation.path_fade_ms, adjustedEventPulseMs);
  const graph_focus: ReasoningTheaterZoneGraphFocusConfig = {
    enabled: readBool(graphFocusRaw?.enabled, graphFocusDefaults.enabled),
    max_visible_nodes: clampNumber(
      readPositiveInt(graphFocusRaw?.max_visible_nodes, graphFocusDefaults.max_visible_nodes),
      80,
      160,
    ),
    max_visible_edges: clampNumber(
      readPositiveInt(graphFocusRaw?.max_visible_edges, graphFocusDefaults.max_visible_edges),
      120,
      500,
    ),
    hop_limit: clampNumber(
      readPositiveInt(graphFocusRaw?.hop_limit, graphFocusDefaults.hop_limit),
      1,
      5,
    ),
    neighbor_cap_per_node: clampNumber(
      readPositiveInt(
        graphFocusRaw?.neighbor_cap_per_node,
        graphFocusDefaults.neighbor_cap_per_node,
      ),
      2,
      16,
    ),
    camera_padding_pct: clampNumber(
      readNumber(graphFocusRaw?.camera_padding_pct, graphFocusDefaults.camera_padding_pct),
      0.04,
      0.24,
    ),
    camera_lerp: clampNumber(
      readNumber(graphFocusRaw?.camera_lerp, graphFocusDefaults.camera_lerp),
      0.05,
      0.6,
    ),
    indicator_ms: clampNumber(
      readPositiveInt(graphFocusRaw?.indicator_ms, graphFocusDefaults.indicator_ms),
      120,
      2_000,
    ),
    objective_reaction_ms: clampNumber(
      readPositiveInt(
        graphFocusRaw?.objective_reaction_ms,
        graphFocusDefaults.objective_reaction_ms,
      ),
      120,
      2_500,
    ),
  };
  return {
    enabled: readBool(raw.enabled, defaults.enabled),
    node_count_dense: clampNumber(
      readPositiveInt(raw.node_count_dense, defaults.node_count_dense),
      80,
      140,
    ),
    pulse_ms: readPositiveInt(raw.pulse_ms, defaults.pulse_ms),
    hold_ms: readPositiveInt(raw.hold_ms, defaults.hold_ms),
    open_world_label: readLabel(raw.open_world_label, defaults.open_world_label),
    zones: {
      mapped_connected: parseZoneStyle(
        zonesRaw?.mapped_connected,
        defaults.zones.mapped_connected,
      ),
      owned_frontier: parseZoneStyle(
        zonesRaw?.owned_frontier,
        defaults.zones.owned_frontier,
      ),
      uncharted: parseZoneStyle(zonesRaw?.uncharted, defaults.zones.uncharted),
    },
    motion: {
      ...motion,
      sweep_opacity_max: Math.max(motion.sweep_opacity_min, motion.sweep_opacity_max),
    },
    presentation: {
      ...presentation,
      event_pulse_ms: adjustedEventPulseMs,
      path_fade_ms: adjustedPathFadeMs,
    },
    graph_focus,
  };
}

export function parseReasoningTheaterConfigPayload(
  value: unknown,
): ReasoningTheaterConfigResponse {
  const root = readObject(value);
  if (!root) return DEFAULT_REASONING_THEATER_CONFIG_RESPONSE;
  const version =
    typeof root.version === "string" && root.version.trim()
      ? root.version
      : DEFAULT_VERSION;
  const frontier_actions = parseFrontierConfig(root.frontier_actions);
  const retrieval_zone_layer = parseRetrievalZoneConfig(root.retrieval_zone_layer);

  return {
    version,
    frontier_actions,
    retrieval_zone_layer,
  };
}

export function getDefaultReasoningTheaterConfig(): ReasoningTheaterConfigResponse {
  return parseReasoningTheaterConfigPayload(DEFAULT_REASONING_THEATER_CONFIG_RESPONSE);
}
