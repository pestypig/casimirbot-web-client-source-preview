import {
  HELIX_ASK_BACKEND_ENTRYPOINT_REQUIRED_ERROR_CODE,
  HELIX_ASK_BACKEND_ENTRYPOINT_REQUIRED_TEXT,
  HELIX_ASK_ENTRYPOINT_GUARD_VERSION,
} from "./HelixAskBackendEntrypointPolicy";

export const HELIX_ASK_SINGLE_TERMINAL_PROJECTOR_VERSION = "E80";
export const HELIX_ASK_BACKEND_DEBUG_MATERIALIZATION_ERROR_CODE = "backend_debug_materialization";
export const HELIX_ASK_BACKEND_DEBUG_MATERIALIZATION_TEXT =
  "Backend Ask was reached, but no server terminal artifact or debug artifact was materialized for this turn.";

const readRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const coerceText = (value: unknown): string =>
  typeof value === "string" ? value : value == null ? "" : String(value);

export function buildHelixAskBackendEntrypointRuntimeFingerprint(args: {
  submitHandlerSource: string;
  runAskEntered: boolean;
  hardBackendEntrypointRequired: boolean;
  useBackendAskTurnEntrypoint: boolean;
  backendAskCallAttempted: boolean;
  backendAskCallPath: "runAskTurnStream" | "runAskTurn" | "askLocal" | null;
  backendAskCallError?: string | null;
  routeMetadata?: unknown;
  legacyAskLocalBypassed: boolean;
  askEntrypointObserved?: boolean | null;
}): Record<string, unknown> {
  const routeMetadata = readRecord(args.routeMetadata);
  const mandatoryNextTool = readRecord(routeMetadata?.mandatory_next_tool);
  const firstBrokenRail =
    !args.runAskEntered
      ? "prompt_submit_entrypoint"
      : args.hardBackendEntrypointRequired && !args.useBackendAskTurnEntrypoint
        ? "backend_ask_entrypoint"
        : args.hardBackendEntrypointRequired && !args.backendAskCallAttempted
          ? "backend_ask_entrypoint"
          : args.hardBackendEntrypointRequired &&
              args.backendAskCallAttempted &&
              args.askEntrypointObserved === false
            ? "backend_debug_materialization"
            : null;
  const repairTarget =
    firstBrokenRail === "prompt_submit_entrypoint" || firstBrokenRail === "backend_ask_entrypoint"
      ? "prompt_submit_entrypoint"
      : firstBrokenRail === "backend_debug_materialization"
        ? "debug_export_bridge"
        : null;
  return {
    schema: "helix.backend_ask_entrypoint_runtime_fingerprint.v1",
    client_entrypoint_guard_version: HELIX_ASK_ENTRYPOINT_GUARD_VERSION,
    submit_handler_source: args.submitHandlerSource,
    runAsk_entered: args.runAskEntered,
    hard_backend_entrypoint_required: args.hardBackendEntrypointRequired,
    use_backend_ask_turn_entrypoint: args.useBackendAskTurnEntrypoint,
    backend_ask_call_attempted: args.backendAskCallAttempted,
    backend_ask_call_path: args.backendAskCallPath,
    backend_ask_call_error: args.backendAskCallError ?? null,
    route_metadata_source: coerceText(routeMetadata?.source).trim() || null,
    mandatory_next_tool_name:
      coerceText(mandatoryNextTool?.tool_name).trim() ||
      coerceText(mandatoryNextTool?.selected_capability).trim() ||
      null,
    legacy_ask_local_bypassed: args.legacyAskLocalBypassed,
    first_broken_rail: firstBrokenRail,
    repair_target: repairTarget,
    assistant_answer: false,
    raw_content_included: false,
  };
}

export function resolveHelixAskHardPromptProjectionGuard(args: {
  hardBackendEntrypointRequired: boolean;
  backendAskCallAttempted: boolean | null;
  serverTerminalText?: string | null;
  serverTerminalSource?: string | null;
  currentBrokenRail?: string | null;
  currentRepairTarget?: string | null;
}): Record<string, unknown> | null {
  if (!args.hardBackendEntrypointRequired) return null;
  const serverTerminalText = coerceText(args.serverTerminalText).trim();
  const serverTerminalSource = coerceText(args.serverTerminalSource).trim();
  if (serverTerminalText && serverTerminalSource && serverTerminalSource !== "legacy_shadow" && serverTerminalSource !== "empty") {
    return {
      schema: "helix.hard_prompt_projection_guard.v1",
      client_projection_policy_version: HELIX_ASK_SINGLE_TERMINAL_PROJECTOR_VERSION,
      projection_allowed: true,
      allowed_projection_source: serverTerminalSource,
      selected_failure_code: null,
      selected_failure_text: null,
      demoted_projection_layers: [],
      first_broken_rail: null,
      repair_target: null,
      assistant_answer: false,
      raw_content_included: false,
    };
  }
  const backendAskAttempted = args.backendAskCallAttempted === true;
  const selectedFailureCode = backendAskAttempted
    ? HELIX_ASK_BACKEND_DEBUG_MATERIALIZATION_ERROR_CODE
    : HELIX_ASK_BACKEND_ENTRYPOINT_REQUIRED_ERROR_CODE;
  return {
    schema: "helix.hard_prompt_projection_guard.v1",
    client_projection_policy_version: HELIX_ASK_SINGLE_TERMINAL_PROJECTOR_VERSION,
    projection_allowed: false,
    allowed_projection_source: null,
    selected_failure_code: selectedFailureCode,
    selected_failure_text: backendAskAttempted
      ? HELIX_ASK_BACKEND_DEBUG_MATERIALIZATION_TEXT
      : HELIX_ASK_BACKEND_ENTRYPOINT_REQUIRED_TEXT,
    demoted_projection_layers: [
      "durable_chat_session",
      "client_projection",
      "legacy_shadow",
      "evidence_finalization_fallback",
    ],
    first_broken_rail: args.currentBrokenRail ?? (backendAskAttempted ? "backend_debug_materialization" : "backend_ask_entrypoint"),
    repair_target: args.currentRepairTarget ?? (backendAskAttempted ? "debug_export_bridge" : "prompt_submit_entrypoint"),
    assistant_answer: false,
    raw_content_included: false,
  };
}
