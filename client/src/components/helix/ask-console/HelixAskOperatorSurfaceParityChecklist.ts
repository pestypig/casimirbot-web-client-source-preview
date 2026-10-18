export type HelixAskOperatorSurfaceParityStatus = "proven" | "open";

export type HelixAskOperatorSurfaceParityValidationKind =
  | "unit_and_browser"
  | "browser_visual_parity"
  | "behavior_sensitive_browser";

export type HelixAskOperatorSurfaceParityChecklistItem = {
  key: string;
  label: string;
  status: HelixAskOperatorSurfaceParityStatus;
  bridgeReference: "HelixAskPill.tsx";
  recrownedOwner: string;
  validationKind: HelixAskOperatorSurfaceParityValidationKind;
  evidence: string;
};

export const HELIX_ASK_OPERATOR_SURFACE_PARITY_CHECKLIST = [
  {
    key: "prompt_composer_surface",
    label: "Composer layout and input surface",
    status: "proven",
    bridgeReference: "HelixAskPill.tsx",
    recrownedOwner: "HelixAskLegacyComposerSurface",
    validationKind: "unit_and_browser",
    evidence: "composer surface and prompt placeholder/runtime label are extracted and covered by recrown tests",
  },
  {
    key: "runtime_picker",
    label: "Runtime picker behavior and labels",
    status: "proven",
    bridgeReference: "HelixAskPill.tsx",
    recrownedOwner: "HelixAskRuntimePicker",
    validationKind: "unit_and_browser",
    evidence: "runtime picker model and shell wiring are recrowned",
  },
  {
    key: "goal_pill",
    label: "Goal pill",
    status: "proven",
    bridgeReference: "HelixAskPill.tsx",
    recrownedOwner: "HelixAskGoalPill",
    validationKind: "unit_and_browser",
    evidence: "goal pill state and surface are extracted",
  },
  {
    key: "steering_queue",
    label: "Steering queue",
    status: "proven",
    bridgeReference: "HelixAskPill.tsx",
    recrownedOwner: "HelixAskSteeringQueuePanel",
    validationKind: "behavior_sensitive_browser",
    evidence: "queue surface is extracted; runtime side effects remain bridge-quarantined",
  },
  {
    key: "attachment_context_strip",
    label: "Attachment and context strip",
    status: "proven",
    bridgeReference: "HelixAskPill.tsx",
    recrownedOwner: "HelixAskAttachmentStrip",
    validationKind: "behavior_sensitive_browser",
    evidence: "attachment display/validation helpers are recrowned while admission remains quarantined",
  },
  {
    key: "context_source_panels",
    label: "Context source panels",
    status: "proven",
    bridgeReference: "HelixAskPill.tsx",
    recrownedOwner: "HelixAskContextCapsulePreview",
    validationKind: "behavior_sensitive_browser",
    evidence: "context previews and docs snapshot helpers are extracted",
  },
  {
    key: "observer_panels",
    label: "Observer panels",
    status: "proven",
    bridgeReference: "HelixAskPill.tsx",
    recrownedOwner: "HelixAskObserverLane",
    validationKind: "unit_and_browser",
    evidence: "observer lane display and event projection are recrowned",
  },
  {
    key: "debug_drawer",
    label: "Debug drawer",
    status: "proven",
    bridgeReference: "HelixAskPill.tsx",
    recrownedOwner: "HelixAskDebugDrawer",
    validationKind: "behavior_sensitive_browser",
    evidence: "debug drawer surface and copy projection are extracted; debug binding remains behavior-sensitive",
  },
  {
    key: "copy_debug_read_aloud_controls",
    label: "Copy, debug, and read-aloud controls",
    status: "proven",
    bridgeReference: "HelixAskPill.tsx",
    recrownedOwner: "HelixAskTurnControls",
    validationKind: "behavior_sensitive_browser",
    evidence: "control target projection is recrowned while transport/playback ownership stays tested",
  },
  {
    key: "voice_read_aloud_affordances",
    label: "Voice and read-aloud affordances",
    status: "proven",
    bridgeReference: "HelixAskPill.tsx",
    recrownedOwner: "HelixAskVoicePlaybackRuntime",
    validationKind: "behavior_sensitive_browser",
    evidence: "voice playback controller/runtime modules are recrowned; live playback remains browser-validated",
  },
  {
    key: "voice_confirmation_qte",
    label: "Voice confirmation three-second QTE",
    status: "proven",
    bridgeReference: "HelixAskPill.tsx",
    recrownedOwner: "HelixAskVoiceConfirmationRuntime",
    validationKind: "behavior_sensitive_browser",
    evidence:
      "shared command/transcript timer behavior, cleanup, policy rechecks, and the minimal-shell seam have fake-timer parity coverage; live provider voice interaction remains browser-validated",
  },
  {
    key: "workflow_next_prompt_qte",
    label: "Workflow next-prompt QTE",
    status: "proven",
    bridgeReference: "HelixAskPill.tsx",
    recrownedOwner: "HelixAskWorkflowSuggestionRuntime",
    validationKind: "unit_and_browser",
    evidence:
      "legacy and minimal runtimes share the same layout slot; typed-only deterministic progress and editable autoSubmit-false insertion have focused unit coverage",
  },
  {
    key: "visible_stream_progress_status_rows",
    label: "Visible stream progress/status rows",
    status: "proven",
    bridgeReference: "HelixAskPill.tsx",
    recrownedOwner: "HelixAskActiveTurnStreamPanel",
    validationKind: "behavior_sensitive_browser",
    evidence: "active stream panels and replay/fallback counters are extracted",
  },
  {
    key: "final_answer_metadata",
    label: "Final answer metadata receipt",
    status: "proven",
    bridgeReference: "HelixAskPill.tsx",
    recrownedOwner: "HelixAskFinalAnswer",
    validationKind: "unit_and_browser",
    evidence: "provider/model metadata and final answer rendering are covered by recrown tests",
  },
  {
    key: "workstation_trace_rows",
    label: "Workstation trace rows",
    status: "proven",
    bridgeReference: "HelixAskPill.tsx",
    recrownedOwner: "HelixAskTurnStreamPanel",
    validationKind: "behavior_sensitive_browser",
    evidence: "structured trace rows are rendered through recrowned turn stream panels",
  },
  {
    key: "layout_position_sizing_dock_behavior",
    label: "Layout position, sizing, and dock behavior",
    status: "open",
    bridgeReference: "HelixAskPill.tsx",
    recrownedOwner: "HelixAskConsoleRuntimeLayout",
    validationKind: "browser_visual_parity",
    evidence: "requires the browser evidence named by HelixAskOperatorSurfaceLayoutParity before default flip",
  },
  {
    key: "top_of_console_readable",
    label: "Top of console remains readable",
    status: "open",
    bridgeReference: "HelixAskPill.tsx",
    recrownedOwner: "HelixAskSurfaceFrame",
    validationKind: "browser_visual_parity",
    evidence: "live testing previously found top-screen creep; requires the browser evidence named by HelixAskOperatorSurfaceLayoutParity",
  },
  {
    key: "long_answer_unclipped",
    label: "Long answers remain unclipped",
    status: "proven",
    bridgeReference: "HelixAskPill.tsx",
    recrownedOwner: "HelixAskFinalAnswer",
    validationKind: "unit_and_browser",
    evidence: "final answer renderer forbids clipping/truncation and preserves raw copy/debug text",
  },
] as const satisfies readonly HelixAskOperatorSurfaceParityChecklistItem[];

export function selectHelixAskOperatorSurfaceParityChecklistByStatus(
  status: HelixAskOperatorSurfaceParityStatus,
): readonly HelixAskOperatorSurfaceParityChecklistItem[] {
  return HELIX_ASK_OPERATOR_SURFACE_PARITY_CHECKLIST.filter((item) => item.status === status);
}

export function buildHelixAskOperatorSurfaceParityChecklistSummary() {
  const provenItems = selectHelixAskOperatorSurfaceParityChecklistByStatus("proven");
  const openItems = selectHelixAskOperatorSurfaceParityChecklistByStatus("open");
  return {
    totalCount: HELIX_ASK_OPERATOR_SURFACE_PARITY_CHECKLIST.length,
    provenCount: provenItems.length,
    openCount: openItems.length,
    ready: openItems.length === 0,
    openKeys: openItems.map((item) => item.key),
  };
}

export function selectHelixAskOperatorSurfaceParityLayoutOpenKeys() {
  return HELIX_ASK_OPERATOR_SURFACE_LAYOUT_PARITY_CRITERIA.map((criterion) => criterion.key);
}
import { HELIX_ASK_OPERATOR_SURFACE_LAYOUT_PARITY_CRITERIA } from "./HelixAskOperatorSurfaceLayoutParity";
