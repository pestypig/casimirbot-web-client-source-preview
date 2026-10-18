import type { PanelDefinition } from "@/lib/desktop/panelRegistry";
import type { HelixWorkstationAction } from "@/lib/workstation/workstationActionContract";

export const HELIX_ASK_CONSOLE_RECROWN_VERSION = "ask-console-recrown-v1";

export const HELIX_ASK_CONSOLE_RECROWN_PHASES = [
  "stabilize_legacy_bridge",
  "extract_display_owners",
  "quarantine_behavior_sensitive_paths",
  "build_minimal_runtime_shell",
  "replace_legacy_bridge_after_parity",
  "retire_legacy_pill_after_proof",
] as const;

export type HelixAskConsoleRecrownPhase = (typeof HELIX_ASK_CONSOLE_RECROWN_PHASES)[number];

export const HELIX_ASK_CONSOLE_ACTIVE_RECROWN_PHASE =
  "build_minimal_runtime_shell" satisfies HelixAskConsoleRecrownPhase;

export const HELIX_ASK_CONSOLE_LIVE_SURFACE_REQUIREMENTS = [
  "prompt_input",
  "runtime_picker",
  "active_docs_context_handoff",
  "request_envelope",
  "submit_stream_handling",
  "latest_turn_selection",
  "final_answer_rendering",
  "workstation_trace_rows",
  "provider_model_metadata",
  "copy_final",
  "debug_copy_export",
  "read_aloud",
  "chat_session_persistence",
] as const;

export type HelixAskConsoleLiveSurfaceRequirement =
  (typeof HELIX_ASK_CONSOLE_LIVE_SURFACE_REQUIREMENTS)[number];

export const HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_ITEMS = [
  "prompt_composer_surface",
  "runtime_picker",
  "goal_pill",
  "steering_queue",
  "attachment_context_strip",
  "context_source_panels",
  "observer_panels",
  "debug_drawer",
  "copy_debug_read_aloud_controls",
  "voice_read_aloud_affordances",
  "voice_confirmation_qte",
  "workflow_next_prompt_qte",
  "visible_stream_progress_status_rows",
  "final_answer_metadata",
  "workstation_trace_rows",
  "layout_position_sizing_dock_behavior",
  "top_of_console_readable",
  "long_answer_unclipped",
] as const;

export type HelixAskConsoleOperatorSurfaceParityItem =
  (typeof HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_ITEMS)[number];

export const HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_PROVEN_ITEMS = [
  "prompt_composer_surface",
  "runtime_picker",
  "goal_pill",
  "steering_queue",
  "attachment_context_strip",
  "context_source_panels",
  "observer_panels",
  "debug_drawer",
  "copy_debug_read_aloud_controls",
  "final_answer_metadata",
  "workstation_trace_rows",
  "visible_stream_progress_status_rows",
  "voice_read_aloud_affordances",
  "voice_confirmation_qte",
  "workflow_next_prompt_qte",
  "long_answer_unclipped",
] as const satisfies readonly HelixAskConsoleOperatorSurfaceParityItem[];

export const HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_OPEN_ITEMS = [
  "layout_position_sizing_dock_behavior",
  "top_of_console_readable",
] as const satisfies readonly HelixAskConsoleOperatorSurfaceParityItem[];

export const HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_READY = false;

export const HELIX_ASK_CONSOLE_LEGACY_BEHAVIOR_CLASSIFICATIONS = [
  {
    key: "minimum_complete_runtime",
    classification: "used_must_move",
    evidence: "minimal runtime shell tests cover submit, stream callback, docs handoff, final answer, trace rows, latest controls, debug export, and chat hydration",
  },
  {
    key: "operator_surface_chrome",
    classification: "used_must_move",
    evidence: "goal requires familiar visible console surface before bridge replacement",
  },
  {
    key: "legacy_bridge_default",
    classification: "used_temporary_adapter",
    evidence: "legacy bridge remains the default until the recrowned minimal shell reaches live visual parity with the old Ask UI; do not grow HelixAskPill while extracting parity slices",
  },
  {
    key: "development_fallbacks_and_trap_doors",
    classification: "unknown_quarantined",
    evidence: "must be inventoried before deletion; runtime minimalism is not proof of disuse",
  },
  {
    key: "conflicting_legacy_runtime_paths",
    classification: "conflicting_remove_after_golden_path_proof",
    evidence: "remove only after current golden path covers expected behavior and live parity passes",
  },
] as const;

export type HelixAskConsoleLegacyBehaviorClassification =
  (typeof HELIX_ASK_CONSOLE_LEGACY_BEHAVIOR_CLASSIFICATIONS)[number]["classification"];

export const HELIX_ASK_CONSOLE_RECROWNED_DISPLAY_OWNERS = [
  "composer",
  "runtime_picker",
  "mood_avatar",
  "action_toolbar",
  "surface_frame",
  "surface_composer_panel",
  "surface_supplement_stack",
  "busy_reasoning_panel",
  "legacy_console_view",
  "console_stack",
  "runtime_layout",
  "error_boundary",
  "goal_pill",
  "procedural_timeline",
  "reasoning_animation_styles",
  "reasoning_battle_stage",
  "reasoning_mirek_field",
  "reasoning_status_medal_strip",
  "turn_list",
  "reply_card",
  "reply_turn",
  "turn_stream_panel",
  "minimal_runtime_turn_list",
  "final_answer",
  "final_extras",
  "active_turn_stream_panel",
  "turn_controls",
  "debug_drawer",
  "attachment_strip",
  "status_lines",
  "voice_level_monitor",
  "observer_lane",
  "steering_queue_panel",
  "context_capsule_preview",
  "situation_room_source_panel",
  "voice_confirmation_panels",
] as const;

export type HelixAskConsoleRecrownedDisplayOwner =
  (typeof HELIX_ASK_CONSOLE_RECROWNED_DISPLAY_OWNERS)[number];

export const HELIX_ASK_CONSOLE_MINIMAL_RUNTIME_SHELL_OWNS = [
  "prompt_input",
  "runtime_picker",
  "active_docs_context_handoff",
  "request_envelope",
  "submit_stream_handling",
  "latest_turn_selection",
  "final_answer_rendering",
  "workstation_trace_rows",
  "provider_model_metadata",
  "copy_final",
  "debug_copy_export",
  "read_aloud",
  "chat_session_persistence",
] as const satisfies readonly HelixAskConsoleLiveSurfaceRequirement[];

export const HELIX_ASK_CONSOLE_MINIMAL_RUNTIME_SHELL_FORBIDDEN_OWNERSHIP = [
  "backend_terminal_authority",
  "model_or_tool_execution",
  "private_retry_loop",
  "private_agent_runtime",
  "final_prose_tool_observation_scraping",
  "duplicated_backend_route_authority",
] as const;

export type HelixAskConsoleMinimalRuntimeShellForbiddenOwnership =
  (typeof HELIX_ASK_CONSOLE_MINIMAL_RUNTIME_SHELL_FORBIDDEN_OWNERSHIP)[number];

export const HELIX_ASK_CONSOLE_RUNTIME_SHELL_ACTIVE_OWNERSHIP = [
  "layout_variant_default",
  "reply_list_class_default",
] as const;

export type HelixAskConsoleRuntimeShellActiveOwnership =
  (typeof HELIX_ASK_CONSOLE_RUNTIME_SHELL_ACTIVE_OWNERSHIP)[number];

export const HELIX_ASK_CONSOLE_RECROWNED_PURE_HELPER_REQUIREMENTS = [
  "active_docs_context_handoff",
  "request_envelope",
  "latest_turn_selection",
  "final_answer_rendering",
  "workstation_trace_rows",
  "provider_model_metadata",
  "chat_session_persistence",
] as const satisfies readonly HelixAskConsoleLiveSurfaceRequirement[];

export const HELIX_ASK_CONSOLE_BRIDGE_REPLACEMENT_PROVEN_GATES = [
  "desktop_entrypoints_route_to_console_crown",
  "legacy_bridge_is_named_and_quarantined",
  "runtime_shell_owns_safe_layout_defaults",
  "active_docs_context_has_pure_snapshot_helper",
  "request_envelope_has_pure_builder",
  "latest_turn_binding_has_pure_selector",
  "latest_copy_debug_read_aloud_has_pure_control_target",
  "final_answer_projection_has_pure_helper",
  "long_final_answer_has_unclipped_display_contract",
  "workstation_trace_rows_have_structured_projection",
  "workstation_no_observation_keeps_typed_failure",
  "workstation_calculator_gateway_trace_parity",
  "provider_model_metadata_has_pure_projection",
  "chat_projection_has_pure_hydration_helper",
  "chat_persistence_has_pure_payload_helper",
  "minimal_runtime_shell_surface_scaffold_exists",
  "minimal_runtime_shell_builds_submit_plan",
  "minimal_runtime_shell_starts_optimistic_turn",
  "minimal_runtime_shell_has_injected_transport_seam",
  "minimal_runtime_shell_completes_injected_turn",
  "minimal_runtime_shell_has_backend_runner_adapter",
  "minimal_runtime_shell_records_stream_events",
  "minimal_runtime_shell_renders_local_turns",
  "minimal_runtime_shell_renders_workstation_trace_rows",
  "minimal_runtime_shell_binds_latest_controls",
  "minimal_runtime_shell_materializes_backend_debug_export",
  "runtime_shell_can_select_minimal_runtime_without_legacy_pill",
  "minimal_shell_submits_and_streams_without_legacy_pill",
  "minimal_shell_preserves_active_docs_context_handoff_live",
  "minimal_runtime_shell_component_submits_injected_turn",
  "minimal_runtime_shell_persists_and_hydrates_chat_sessions",
] as const;

export type HelixAskConsoleBridgeReplacementProvenGate =
  (typeof HELIX_ASK_CONSOLE_BRIDGE_REPLACEMENT_PROVEN_GATES)[number];

export const HELIX_ASK_CONSOLE_BRIDGE_REPLACEMENT_OPEN_GATES = [
  "operator_surface_live_parity_validation",
] as const;

export type HelixAskConsoleBridgeReplacementOpenGate =
  (typeof HELIX_ASK_CONSOLE_BRIDGE_REPLACEMENT_OPEN_GATES)[number];

export const HELIX_ASK_CONSOLE_BRIDGE_REPLACEMENT_READY = false;

export type HelixAskConsoleProps = {
  contextId: string;
  className?: string;
  maxWidthClassName?: string;
  onOpenPanel?: (panelId: PanelDefinition["id"]) => void;
  onRunWorkstationAction?: (action: HelixWorkstationAction) => void;
  onOpenConversation?: (sessionId: string) => void;
  placeholder?: string;
  layoutVariant?: "hero" | "dock";
  replyListClassName?: string;
};

export type HelixAskConsoleLegacyBridgeStatus = {
  activeImplementation: "legacy_bridge";
  bridge: "helix_ask_pill_legacy_runtime_bridge";
  activePhase: HelixAskConsoleRecrownPhase;
  reason: "operator_surface_parity_not_live_proven";
  runtimeShell: "helix_ask_console_runtime_shell";
  replacementTarget: "legacy_pill_retirement_after_proof";
  recrownedDisplayOwners: readonly HelixAskConsoleRecrownedDisplayOwner[];
  recrownedPureHelperRequirements: readonly HelixAskConsoleLiveSurfaceRequirement[];
  minimalRuntimeShellOwns: readonly HelixAskConsoleLiveSurfaceRequirement[];
  minimalRuntimeShellForbiddenOwnership: readonly HelixAskConsoleMinimalRuntimeShellForbiddenOwnership[];
  runtimeShellActiveOwnership: readonly HelixAskConsoleRuntimeShellActiveOwnership[];
  remainingBehaviorSensitivePaths: readonly HelixAskConsoleLiveSurfaceRequirement[];
  bridgeReplacementReady: typeof HELIX_ASK_CONSOLE_BRIDGE_REPLACEMENT_READY;
  bridgeReplacementProvenGates: readonly HelixAskConsoleBridgeReplacementProvenGate[];
  bridgeReplacementOpenGates: readonly HelixAskConsoleBridgeReplacementOpenGate[];
  operatorSurfaceParityReady: typeof HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_READY;
  operatorSurfaceParityItems: readonly HelixAskConsoleOperatorSurfaceParityItem[];
  operatorSurfaceParityProvenItems: readonly HelixAskConsoleOperatorSurfaceParityItem[];
  operatorSurfaceParityOpenItems: readonly HelixAskConsoleOperatorSurfaceParityItem[];
  legacyBehaviorClassifications: typeof HELIX_ASK_CONSOLE_LEGACY_BEHAVIOR_CLASSIFICATIONS;
};

export const HELIX_ASK_CONSOLE_LEGACY_BRIDGE_STATUS: HelixAskConsoleLegacyBridgeStatus = {
  activeImplementation: "legacy_bridge",
  bridge: "helix_ask_pill_legacy_runtime_bridge",
  activePhase: HELIX_ASK_CONSOLE_ACTIVE_RECROWN_PHASE,
  reason: "operator_surface_parity_not_live_proven",
  runtimeShell: "helix_ask_console_runtime_shell",
  replacementTarget: "legacy_pill_retirement_after_proof",
  recrownedDisplayOwners: HELIX_ASK_CONSOLE_RECROWNED_DISPLAY_OWNERS,
  recrownedPureHelperRequirements: HELIX_ASK_CONSOLE_RECROWNED_PURE_HELPER_REQUIREMENTS,
  minimalRuntimeShellOwns: HELIX_ASK_CONSOLE_MINIMAL_RUNTIME_SHELL_OWNS,
  minimalRuntimeShellForbiddenOwnership: HELIX_ASK_CONSOLE_MINIMAL_RUNTIME_SHELL_FORBIDDEN_OWNERSHIP,
  runtimeShellActiveOwnership: HELIX_ASK_CONSOLE_RUNTIME_SHELL_ACTIVE_OWNERSHIP,
  remainingBehaviorSensitivePaths: HELIX_ASK_CONSOLE_LIVE_SURFACE_REQUIREMENTS,
  bridgeReplacementReady: HELIX_ASK_CONSOLE_BRIDGE_REPLACEMENT_READY,
  bridgeReplacementProvenGates: HELIX_ASK_CONSOLE_BRIDGE_REPLACEMENT_PROVEN_GATES,
  bridgeReplacementOpenGates: HELIX_ASK_CONSOLE_BRIDGE_REPLACEMENT_OPEN_GATES,
  operatorSurfaceParityReady: HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_READY,
  operatorSurfaceParityItems: HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_ITEMS,
  operatorSurfaceParityProvenItems: HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_PROVEN_ITEMS,
  operatorSurfaceParityOpenItems: HELIX_ASK_CONSOLE_OPERATOR_SURFACE_PARITY_OPEN_ITEMS,
  legacyBehaviorClassifications: HELIX_ASK_CONSOLE_LEGACY_BEHAVIOR_CLASSIFICATIONS,
};
