import { describe, expect, it } from "vitest";
import {
  getDefaultReasoningTheaterConfig,
  parseReasoningTheaterConfigPayload,
} from "@/lib/helix/reasoning-theater-config";
import {
  advanceReasoningTheaterFrontierTracker,
  classifyReasoningTheaterFrontierAction,
  clampFrontierMeterPct,
  createReasoningTheaterFrontierTrackerState,
  resolveReasoningTheaterFrontierParticleProfile,
} from "@/lib/helix/reasoning-theater-frontier";

describe("reasoning theater frontier actions", () => {
  it("classifies all six action boundaries deterministically", () => {
    const cfg = getDefaultReasoningTheaterConfig().frontier_actions;
    const classify = (delta: number) =>
      classifyReasoningTheaterFrontierAction({
        windowDeltaPct: delta,
        stance: "contested",
        suppressionReason: null,
        thresholds: cfg.thresholds,
      });

    expect(classify(4)).toBe("large_gain");
    expect(classify(1)).toBe("small_gain");
    expect(classify(0.1)).toBe("steady");
    expect(classify(-1)).toBe("small_loss");
    expect(classify(-4)).toBe("large_loss");
    expect(classify(-9)).toBe("hard_drop");
  });

  it("prioritizes hard_drop over large_loss when suppression/stance requires it", () => {
    const cfg = getDefaultReasoningTheaterConfig().frontier_actions;
    const bySuppression = classifyReasoningTheaterFrontierAction({
      windowDeltaPct: -4,
      stance: "contested",
      suppressionReason: "contract_violation",
      thresholds: cfg.thresholds,
    });
    const byStance = classifyReasoningTheaterFrontierAction({
      windowDeltaPct: -4,
      stance: "fail_closed",
      suppressionReason: null,
      thresholds: cfg.thresholds,
    });
    expect(bySuppression).toBe("hard_drop");
    expect(byStance).toBe("hard_drop");
  });

  it("applies hysteresis so candidate jitter does not flicker committed action", () => {
    const cfg = getDefaultReasoningTheaterConfig().frontier_actions;
    let state = createReasoningTheaterFrontierTrackerState("steady");
    state = { ...state, committedAtMs: -1_000 };
    const series = [
      { nowMs: 0, meterPct: 50 },
      { nowMs: 60, meterPct: 50.6 },
      { nowMs: 120, meterPct: 51.4 },
      { nowMs: 180, meterPct: 50.8 },
      { nowMs: 240, meterPct: 51.6 },
      { nowMs: 300, meterPct: 50.7 },
    ];
    for (const sample of series) {
      state = advanceReasoningTheaterFrontierTracker(state, {
        ...sample,
        stance: "contested",
        suppressionReason: null,
        config: cfg,
      }).state;
    }
    expect(state.committedAction).toBe("steady");
  });

  it("enforces minimum visible hold before non-hard-drop action swap", () => {
    const base = getDefaultReasoningTheaterConfig().frontier_actions;
    const cfg = {
      ...base,
      window_ms: 1,
      switch_hold_frames: 1,
      min_action_ms: 180,
      thresholds: {
        ...base.thresholds,
        hard_drop_delta_pct: -99,
        large_gain_delta_pct: 0.5,
        small_gain_delta_pct: 0.2,
        large_loss_delta_pct: -0.5,
        small_loss_delta_pct: -0.2,
      },
    };
    let state = createReasoningTheaterFrontierTrackerState("steady");
    state = { ...state, committedAtMs: -1_000 };
    state = advanceReasoningTheaterFrontierTracker(state, {
      nowMs: 10,
      meterPct: 50,
      stance: "contested",
      suppressionReason: null,
      config: cfg,
    }).state;
    state = advanceReasoningTheaterFrontierTracker(state, {
      nowMs: 20,
      meterPct: 51.2,
      stance: "contested",
      suppressionReason: null,
      config: cfg,
    }).state;
    expect(state.committedAction).toBe("large_gain");
    state = advanceReasoningTheaterFrontierTracker(state, {
      nowMs: 80,
      meterPct: 50.2,
      stance: "contested",
      suppressionReason: null,
      config: cfg,
    }).state;
    expect(state.committedAction).toBe("large_gain");
  });

  it("clamps cursor position to 0..100", () => {
    expect(clampFrontierMeterPct(-5)).toBe(0);
    expect(clampFrontierMeterPct(42)).toBe(42);
    expect(clampFrontierMeterPct(1000)).toBe(100);
  });

  it("maps each action to a deterministic particle profile", () => {
    const cfg = getDefaultReasoningTheaterConfig().frontier_actions;
    const largeGain = resolveReasoningTheaterFrontierParticleProfile("large_gain", cfg);
    const hardDrop = resolveReasoningTheaterFrontierParticleProfile("hard_drop", cfg);
    expect(largeGain.color).toBe("#34D399");
    expect(largeGain.transition_burst).toBe(true);
    expect(hardDrop.color).toBe("#EF4444");
    expect(hardDrop.shock_ring).toBe(true);
  });

  it("falls back to defaults when frontier config payload is missing or invalid", () => {
    const fallback = parseReasoningTheaterConfigPayload({ version: "x" });
    expect(fallback.frontier_actions.window_ms).toBe(200);
    expect(fallback.retrieval_zone_layer.node_count_dense).toBe(120);
    expect(fallback.retrieval_zone_layer.motion.enabled).toBe(true);
    expect(fallback.retrieval_zone_layer.presentation.mode).toBe("convergence_strip_v1");
    expect(fallback.retrieval_zone_layer.presentation.symbolic_model).toBe("constellation_weave");
    expect(fallback.retrieval_zone_layer.presentation.literality).toBe("exact_plus_aura");
    expect(fallback.retrieval_zone_layer.presentation.zone_presence).toBe("ambient_only");
    expect(fallback.retrieval_zone_layer.presentation.map_text).toBe("none");
    expect(fallback.retrieval_zone_layer.presentation.constellation_node_budget).toBe(96);
    expect(fallback.retrieval_zone_layer.presentation.aura_hop_limit).toBe(1);
    expect(fallback.retrieval_zone_layer.presentation.aura_opacity_max).toBe(0.22);
    expect(fallback.retrieval_zone_layer.presentation.thread_count_per_edge).toBe(2);
    expect(fallback.retrieval_zone_layer.presentation.trace_scope).toBe("primary_only");
    expect(fallback.retrieval_zone_layer.presentation.camera_mode).toBe("fixed");
    expect(fallback.retrieval_zone_layer.presentation.path_mode).toBe("full_path_with_event_flow");
    expect(fallback.retrieval_zone_layer.presentation.progress_encoding).toBe(
      "leaf_beacon_route_flux",
    );
    expect(fallback.retrieval_zone_layer.presentation.no_exact_fallback).toBe("tree_pulse_only");
    expect(fallback.retrieval_zone_layer.presentation.caption_mode).toBe("one_line");
    expect(fallback.retrieval_zone_layer.presentation.show_root_leaf_markers).toBe(true);
    expect(fallback.retrieval_zone_layer.presentation.provenance_mode).toBe("strict_exact_only");
    expect(fallback.retrieval_zone_layer.presentation.show_phase_tick).toBe(true);
    expect(fallback.retrieval_zone_layer.presentation.show_caption).toBe(true);
    expect(fallback.retrieval_zone_layer.presentation.show_reply_snapshot).toBe(true);
    expect(fallback.retrieval_zone_layer.presentation.collapse_pulse_ms).toBe(520);
    expect(fallback.retrieval_zone_layer.presentation.lane_hold_ms).toBe(220);
    expect(fallback.retrieval_zone_layer.presentation.unknown_policy).toBe("explicit");
    const partial = parseReasoningTheaterConfigPayload({
      version: "custom",
      frontier_actions: {
        window_ms: "bad",
        actions: { large_gain: { icon_path: "/x.svg" } },
      },
      retrieval_zone_layer: {
        node_count_dense: 999,
        zones: {
          mapped_connected: {
            edge_opacity: 2,
          },
        },
        motion: {
          enabled: false,
          sweep_band_width_pct: 99,
          sweep_falloff_pct: -5,
          node_frontier_boost: 9,
          node_zone_boost: -2,
          edge_frontier_boost: 8,
          edge_zone_boost: -3,
          breath_hz_base: 90,
          breath_hz_gain: -1,
          dash_px: -2,
          dash_gap_px: 99,
          sweep_opacity_min: 0.9,
          sweep_opacity_max: 0.2,
        },
        presentation: {
          mode: "wrong",
          symbolic_model: "bad",
          literality: "bad",
          zone_presence: "too_much",
          map_text: "words",
          constellation_node_budget: 999,
          aura_hop_limit: -1,
          aura_opacity_max: 2,
          thread_count_per_edge: 0,
          causality_encoding: "bad",
          provenance_mode: "x",
          labels: "too_much",
          show_open_world_text_chip: "0",
          core_reaction_ms: 20,
          event_pulse_ms: 120,
          event_hold_ms: 9999,
          path_fade_ms: 10,
          max_exact_paths_per_event: 99,
          show_phase_tick: "0",
          show_caption: "0",
          show_reply_snapshot: "0",
          collapse_pulse_ms: 20,
          lane_hold_ms: 99999,
          unknown_policy: "bad",
        },
      },
    });
    expect(partial.version).toBe("custom");
    expect(partial.frontier_actions.window_ms).toBe(200);
    expect(partial.frontier_actions.actions.large_gain.icon_path).toBe("/x.svg");
    expect(partial.frontier_actions.actions.hard_drop.icon_path).toBe(
      "/reasoning-theater/frontier-actions/hard_drop.svg",
    );
    expect(partial.retrieval_zone_layer.node_count_dense).toBe(140);
    expect(partial.retrieval_zone_layer.zones.mapped_connected.edge_opacity).toBe(1);
    expect(partial.retrieval_zone_layer.motion.enabled).toBe(false);
    expect(partial.retrieval_zone_layer.motion.sweep_band_width_pct).toBe(30);
    expect(partial.retrieval_zone_layer.motion.sweep_falloff_pct).toBe(4);
    expect(partial.retrieval_zone_layer.motion.node_frontier_boost).toBe(1.2);
    expect(partial.retrieval_zone_layer.motion.node_zone_boost).toBe(0);
    expect(partial.retrieval_zone_layer.motion.edge_frontier_boost).toBe(1);
    expect(partial.retrieval_zone_layer.motion.edge_zone_boost).toBe(0);
    expect(partial.retrieval_zone_layer.motion.breath_hz_base).toBe(3);
    expect(partial.retrieval_zone_layer.motion.breath_hz_gain).toBe(0);
    expect(partial.retrieval_zone_layer.motion.dash_px).toBe(0.5);
    expect(partial.retrieval_zone_layer.motion.dash_gap_px).toBe(10);
    expect(partial.retrieval_zone_layer.motion.sweep_opacity_min).toBe(0.9);
    expect(partial.retrieval_zone_layer.motion.sweep_opacity_max).toBe(0.9);
    expect(partial.retrieval_zone_layer.presentation.mode).toBe("convergence_strip_v1");
    expect(partial.retrieval_zone_layer.presentation.symbolic_model).toBe("constellation_weave");
    expect(partial.retrieval_zone_layer.presentation.literality).toBe("exact_plus_aura");
    expect(partial.retrieval_zone_layer.presentation.zone_presence).toBe("ambient_only");
    expect(partial.retrieval_zone_layer.presentation.map_text).toBe("none");
    expect(partial.retrieval_zone_layer.presentation.constellation_node_budget).toBe(120);
    expect(partial.retrieval_zone_layer.presentation.aura_hop_limit).toBe(1);
    expect(partial.retrieval_zone_layer.presentation.aura_opacity_max).toBe(1);
    expect(partial.retrieval_zone_layer.presentation.thread_count_per_edge).toBe(2);
    expect(partial.retrieval_zone_layer.presentation.trace_scope).toBe("primary_only");
    expect(partial.retrieval_zone_layer.presentation.camera_mode).toBe("fixed");
    expect(partial.retrieval_zone_layer.presentation.path_mode).toBe("full_path_with_event_flow");
    expect(partial.retrieval_zone_layer.presentation.progress_encoding).toBe(
      "leaf_beacon_route_flux",
    );
    expect(partial.retrieval_zone_layer.presentation.no_exact_fallback).toBe("tree_pulse_only");
    expect(partial.retrieval_zone_layer.presentation.caption_mode).toBe("one_line");
    expect(partial.retrieval_zone_layer.presentation.show_root_leaf_markers).toBe(true);
    expect(partial.retrieval_zone_layer.presentation.causality_encoding).toBe("map_only");
    expect(partial.retrieval_zone_layer.presentation.provenance_mode).toBe("strict_exact_only");
    expect(partial.retrieval_zone_layer.presentation.labels).toBe("none");
    expect(partial.retrieval_zone_layer.presentation.show_open_world_text_chip).toBe(false);
    expect(partial.retrieval_zone_layer.presentation.core_reaction_ms).toBe(120);
    expect(partial.retrieval_zone_layer.presentation.event_hold_ms).toBe(1200);
    expect(partial.retrieval_zone_layer.presentation.event_pulse_ms).toBe(1201);
    expect(partial.retrieval_zone_layer.presentation.path_fade_ms).toBe(1201);
    expect(partial.retrieval_zone_layer.presentation.max_exact_paths_per_event).toBe(24);
    expect(partial.retrieval_zone_layer.presentation.show_phase_tick).toBe(false);
    expect(partial.retrieval_zone_layer.presentation.show_caption).toBe(false);
    expect(partial.retrieval_zone_layer.presentation.show_reply_snapshot).toBe(false);
    expect(partial.retrieval_zone_layer.presentation.collapse_pulse_ms).toBe(120);
    expect(partial.retrieval_zone_layer.presentation.lane_hold_ms).toBe(1200);
    expect(partial.retrieval_zone_layer.presentation.unknown_policy).toBe("explicit");
  });
});
